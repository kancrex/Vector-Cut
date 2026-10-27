import { jsPDF } from 'jspdf';
import { ImageDimensions, OutlineSettings, VectorResult } from '../types';

export function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exports clean vector border outline to high-resolution print PDF.
 */
export async function exportOutlinePdf(
  vectorResult: VectorResult,
  dimensions: ImageDimensions,
  settings: OutlineSettings,
  jobName = 'Vector_Outline'
) {
  // Line thickness in points converted to millimeters
  const strokeMm = (settings.lineThickness / 72) * 25.4;

  // Convert hex color to RGB
  const hex = settings.lineColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16) || 0;
  const g = parseInt(hex.substring(2, 4), 16) || 0;
  const b = parseInt(hex.substring(4, 6), 16) || 0;

  const activeContours =
    vectorResult.offsetContour.length > 0
      ? vectorResult.offsetContour
      : vectorResult.outerContours;

  const widthMm = dimensions.physicalWidthMm;
  const heightMm = dimensions.physicalHeightMm;
  const orientation = widthMm > heightMm ? 'l' : 'p';

  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format: [widthMm + 20, heightMm + 20], // 10mm padding around outline
    compress: true,
  });

  const offX = 10;
  const offY = 10;
  const pxToMm = widthMm / (dimensions.pixelWidth || 1);

  doc.setLineWidth(strokeMm);
  doc.setDrawColor(r, g, b);

  // Draw vector border outline paths
  for (const contour of activeContours) {
    const pts = contour.points;
    if (pts.length < 2) continue;
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % pts.length];
      doc.line(
        offX + p1.x * pxToMm,
        offY + p1.y * pxToMm,
        offX + p2.x * pxToMm,
        offY + p2.y * pxToMm
      );
    }
  }

  // Margin info slug
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(
    `${jobName} — Border Outline (${widthMm}x${heightMm}mm @ ${dimensions.detectedDpi} DPI) — Stroke: ${settings.lineThickness}pt`,
    10,
    heightMm + 16
  );

  doc.save(`${jobName}_Outline_${widthMm}x${heightMm}mm.pdf`);
}

/**
 * Exports clean vector SVG containing only the border outline.
 */
export function exportOutlineSvg(
  vectorResult: VectorResult,
  dimensions: ImageDimensions,
  settings: OutlineSettings,
  jobName = 'Vector_Outline'
) {
  const wMm = dimensions.physicalWidthMm;
  const hMm = dimensions.physicalHeightMm;
  const pxW = dimensions.pixelWidth;
  const pxH = dimensions.pixelHeight;

  const activeContours =
    vectorResult.offsetContour.length > 0
      ? vectorResult.offsetContour
      : vectorResult.outerContours;

  let svg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg 
  xmlns="http://www.w3.org/2000/svg" 
  width="${wMm}mm" 
  height="${hMm}mm" 
  viewBox="0 0 ${pxW} ${pxH}"
  version="1.1">
  <defs>
    <style>
      .outline-path {
        fill: none;
        stroke: ${settings.lineColor};
        stroke-width: ${settings.lineThickness * 1.33}px;
        stroke-linecap: round;
        stroke-linejoin: round;
      }
    </style>
  </defs>
  <g id="BorderOutline">
`;

  for (const contour of activeContours) {
    svg += `    <path d="${contour.svgPath}" class="outline-path" />\n`;
  }

  svg += `  </g>\n</svg>`;

  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  triggerDownload(blob, `${jobName}_BorderOutline.svg`);
}

/**
 * Exports clean CAD DXF outline for CNC & cutting plotters.
 */
export function exportOutlineDxf(
  vectorResult: VectorResult,
  dimensions: ImageDimensions,
  jobName = 'Vector_Outline'
) {
  const pxToMm = dimensions.physicalWidthMm / (dimensions.pixelWidth || 1);
  const activeContours =
    vectorResult.offsetContour.length > 0
      ? vectorResult.offsetContour
      : vectorResult.outerContours;

  let dxf = `0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n`;

  for (const contour of activeContours) {
    const pts = contour.points;
    if (pts.length < 2) continue;

    dxf += `0\nPOLYLINE\n8\nBORDER_OUTLINE\n66\n1\n70\n1\n`;
    for (const pt of pts) {
      const xMm = (pt.x * pxToMm).toFixed(3);
      const yMm = ((dimensions.pixelHeight - pt.y) * pxToMm).toFixed(3);
      dxf += `0\nVERTEX\n8\nBORDER_OUTLINE\n10\n${xMm}\n20\n${yMm}\n30\n0.0\n`;
    }
    dxf += `0\nSEQEND\n`;
  }

  dxf += `0\nENDSEC\n0\nEOF\n`;
  const blob = new Blob([dxf], { type: 'application/dxf' });
  triggerDownload(blob, `${jobName}_Outline.dxf`);
}
