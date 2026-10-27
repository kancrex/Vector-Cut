import React, { useState, useEffect } from 'react';
import { X, Eye, EyeOff, ZoomIn, ZoomOut, Maximize2, Minimize2, RotateCcw } from 'lucide-react';
import { ImageDimensions, OutlineSettings, VectorResult } from '../types';

interface ImagePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageElement: HTMLImageElement | HTMLCanvasElement | null;
  dimensions: ImageDimensions;
  settings: OutlineSettings;
  vectorResult: VectorResult | null;
  isBackgroundRemoved?: boolean;
}

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  isOpen,
  onClose,
  imageElement,
  dimensions,
  settings,
  vectorResult,
  isBackgroundRemoved,
}) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const [showImage, setShowImage] = useState(true);
  const [showOverlayOutline, setShowOverlayOutline] = useState(true);
  const [outlineOpacity, setOutlineOpacity] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(1); // 1 = 100% Fit
  const [canvasTheme, setCanvasTheme] = useState<'white' | 'checker' | 'dark'>('white');

  // Reset zoom on open
  useEffect(() => {
    if (isOpen) {
      setZoomLevel(1);
    }
  }, [isOpen]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (isMaximized) {
          setIsMaximized(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isMaximized, onClose]);

  if (!isOpen || !imageElement) return null;

  const imgSrc =
    imageElement instanceof HTMLCanvasElement
      ? imageElement.toDataURL()
      : imageElement.src;

  const activeContours =
    vectorResult?.offsetContour && vectorResult.offsetContour.length > 0
      ? vectorResult.offsetContour
      : vectorResult?.outerContours || [];

  const imgW = dimensions.pixelWidth || 1000;
  const imgH = dimensions.pixelHeight || 1000;

  // DYNAMIC CANVAS BOUNDS:
  // Calculates the combined bounding box of BOTH the artwork [0, 0, imgW, imgH]
  // AND the vector outline contours (which may expand outward by dieCutOffsetMm).
  let minX = 0;
  let minY = 0;
  let maxX = imgW;
  let maxY = imgH;

  if (activeContours && activeContours.length > 0) {
    for (const contour of activeContours) {
      for (const pt of contour.points) {
        if (pt.x < minX) minX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y > maxY) maxY = pt.y;
      }
    }
  }

  // Add a 5% breathing margin so the vector outline is NEVER cut off upside, downside, or sides!
  const margin = Math.max(24, Math.round(Math.max(imgW, imgH) * 0.05));
  const vbMinX = Math.floor(minX - margin);
  const vbMinY = Math.floor(minY - margin);
  const vbWidth = Math.ceil((maxX + margin) - vbMinX);
  const vbHeight = Math.ceil((maxY + margin) - vbMinY);
  const viewAspectRatio = vbWidth / (vbHeight || 1);

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150 ${
        isMaximized ? 'p-0' : 'p-2 sm:p-4'
      }`}
      onClick={() => {
        if (!isMaximized) onClose();
      }}
    >
      {/* POP-UP COVERING SCREEN WITH MAXIMIZE FULLSCREEN OPTION */}
      <div
        className={`relative bg-white shadow-2xl border border-slate-300 overflow-hidden flex flex-col transition-all duration-150 ${
          isMaximized
            ? 'w-screen h-screen max-w-none rounded-none border-none'
            : 'w-[95vw] h-[94vh] max-w-[1700px] max-h-[1050px] rounded-2xl'
        }`}
        onClick={e => e.stopPropagation()}
      >
        {/* Header with Title, Maximize Button & Close Button */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50/95 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
              <Eye className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">
                  Full Display Preview
                </h2>
                <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded text-[10px] font-mono font-semibold">
                  FIT SCREEN PREVIEW
                </span>
                {isBackgroundRemoved && (
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-mono font-semibold border border-emerald-300">
                    BACKGROUND ISOLATED ✨
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                <span>{dimensions.pixelWidth} × {dimensions.pixelHeight} px</span>
                <span aria-hidden="true">·</span>
                <span>{dimensions.physicalWidthMm} × {dimensions.physicalHeightMm} mm ({dimensions.physicalWidthIn}&quot; × {dimensions.physicalHeightIn}&quot;)</span>
                <span aria-hidden="true">·</span>
                <span>{dimensions.detectedDpi} DPI</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Maximize Fullscreen Toggle */}
            <button
              onClick={() => setIsMaximized(!isMaximized)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer shadow-2xs ${
                isMaximized
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              }`}
              title={isMaximized ? 'Restore window size (Esc)' : 'Maximize to full page for large view'}
            >
              {isMaximized ? (
                <>
                  <Minimize2 className="w-4 h-4 text-indigo-600" />
                  <span>Minimize</span>
                </>
              ) : (
                <>
                  <Maximize2 className="w-4 h-4 text-slate-600" />
                  <span>Maximize Page</span>
                </>
              )}
            </button>

            {/* Red-Accent Close Button */}
            <button
              onClick={onClose}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 hover:text-rose-600 text-slate-600 border border-slate-200 hover:border-rose-200 transition-all cursor-pointer font-medium text-xs shadow-xs"
              title="Close Preview (Esc)"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
              <span className="hidden sm:inline">Close</span>
            </button>
          </div>
        </div>

        {/* Toolbar: Image ON/OFF, Vector Outline ON/OFF, Opacity & Zoom Controls */}
        <div className="px-5 py-2.5 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-2.5">
            {/* Image ON / OFF toggle */}
            <button
              onClick={() => setShowImage(!showImage)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-semibold transition-colors cursor-pointer ${
                showImage
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-700 shadow-xs'
                  : 'bg-slate-100 border-slate-200 text-slate-500 hover:text-slate-800'
              }`}
            >
              {showImage ? <Eye className="w-4 h-4 text-emerald-600" /> : <EyeOff className="w-4 h-4" />}
              <span>{showImage ? 'Image: ON' : 'Image: OFF'}</span>
            </button>

            {/* Vector Outline ON / OFF toggle */}
            <button
              onClick={() => setShowOverlayOutline(!showOverlayOutline)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border font-semibold transition-colors cursor-pointer ${
                showOverlayOutline
                  ? 'bg-rose-50 border-rose-300 text-rose-700 shadow-xs'
                  : 'bg-slate-100 border-slate-200 text-slate-500 hover:text-slate-800'
              }`}
            >
              {showOverlayOutline ? <Eye className="w-4 h-4 text-rose-600" /> : <EyeOff className="w-4 h-4" />}
              <span>{showOverlayOutline ? 'Vector Outline: ON' : 'Vector Outline: OFF'}</span>
            </button>

            {showOverlayOutline && (
              <div className="flex items-center gap-2 text-slate-600 pl-2.5 border-l border-slate-200">
                <span className="font-medium text-[11px]">Opacity:</span>
                <input
                  type="range"
                  min="0.2"
                  max="1"
                  step="0.05"
                  value={outlineOpacity}
                  onChange={e => setOutlineOpacity(parseFloat(e.target.value))}
                  className="w-20 sm:w-24 accent-rose-600 cursor-pointer"
                />
                <span className="font-mono text-slate-600 font-semibold text-[11px] w-8">{Math.round(outlineOpacity * 100)}%</span>
              </div>
            )}
          </div>

          {/* Canvas Background Theme (White by default for high contrast with black outlines) */}
          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg p-1 text-xs">
            <span className="text-[10px] font-bold text-slate-500 pl-1">Canvas:</span>
            <button
              onClick={() => setCanvasTheme('white')}
              className={`px-2 py-0.5 rounded font-mono text-xs font-semibold cursor-pointer transition-colors ${
                canvasTheme === 'white'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Pure white artboard (maximum contrast for black outline)"
            >
              ⚪ White
            </button>
            <button
              onClick={() => setCanvasTheme('checker')}
              className={`px-2 py-0.5 rounded font-mono text-xs font-semibold cursor-pointer transition-colors ${
                canvasTheme === 'checker'
                  ? 'bg-white text-slate-900 shadow-2xs font-bold border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Checkerboard canvas background"
            >
              🏁 Checker
            </button>
            <button
              onClick={() => setCanvasTheme('dark')}
              className={`px-2 py-0.5 rounded font-mono text-xs font-semibold cursor-pointer transition-colors ${
                canvasTheme === 'dark'
                  ? 'bg-slate-900 text-white shadow-2xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Dark canvas background"
            >
              ⚫ Dark
            </button>
          </div>

          {/* Quick Zoom Preset Buttons */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg p-1 text-xs">
            <button
              onClick={() => setZoomLevel(1)}
              className={`px-2 py-1 rounded font-mono cursor-pointer transition-colors ${
                zoomLevel === 1 ? 'bg-white text-rose-600 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
              title="Fit entire artwork and outline into viewport without clipping"
            >
              <Maximize2 className="w-3 h-3 inline mr-1" />
              Fit Full Artwork
            </button>
            <button
              onClick={() => setZoomLevel(1.5)}
              className={`px-2 py-1 rounded font-mono cursor-pointer transition-colors ${
                zoomLevel === 1.5 ? 'bg-white text-rose-600 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              150%
            </button>
            <button
              onClick={() => setZoomLevel(2)}
              className={`px-2 py-1 rounded font-mono cursor-pointer transition-colors ${
                zoomLevel === 2 ? 'bg-white text-rose-600 font-bold shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              200%
            </button>
            <div className="h-3 w-px bg-slate-300 mx-0.5" />
            <button
              onClick={() => setZoomLevel(prev => Math.max(0.4, Number((prev - 0.2).toFixed(2))))}
              className="p-1 hover:bg-slate-200 rounded text-slate-600 cursor-pointer"
              title="Zoom Out"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoomLevel(prev => Math.min(4, Number((prev + 0.2).toFixed(2))))}
              className="p-1 hover:bg-slate-200 rounded text-slate-600 cursor-pointer"
              title="Zoom In"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setZoomLevel(1)}
              className="p-1 hover:bg-slate-200 rounded text-slate-600 cursor-pointer"
              title="Reset Zoom"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* FULLY RESPONSIVE CANVAS VIEWPORT:
            White canvas artboard by default so black outline is razor sharp and unmistakable!
        */}
        <div className="flex-1 min-h-0 overflow-auto p-4 sm:p-6 bg-slate-100 flex items-center justify-center select-none">
          <div
            className={`relative rounded-2xl shadow-2xl overflow-hidden flex items-center justify-center transition-all duration-100 origin-center ${
              canvasTheme === 'white'
                ? 'bg-white border-2 border-slate-300 shadow-slate-300/70'
                : canvasTheme === 'dark'
                ? 'bg-slate-900 border-2 border-slate-700 shadow-slate-900/60'
                : 'bg-slate-50 border-2 border-slate-300'
            }`}
            style={{
              width: '100%',
              height: '100%',
              maxWidth: isMaximized
                ? `min(96vw, calc(86vh * ${viewAspectRatio}))`
                : `min(90vw, calc(74vh * ${viewAspectRatio}))`,
              maxHeight: isMaximized
                ? `min(86vh, calc(96vw / ${viewAspectRatio}))`
                : `min(74vh, calc(90vw / ${viewAspectRatio}))`,
              aspectRatio: `${viewAspectRatio}`,
              transform: `scale(${zoomLevel})`,
            }}
          >
            {/* Unified SVG containing both the original image and the vector outline */}
            <svg
              viewBox={`${vbMinX} ${vbMinY} ${vbWidth} ${vbHeight}`}
              className="w-full h-full block pointer-events-none select-none"
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                {/* Light checkerboard pattern */}
                <pattern id="preview-checker-light" width="24" height="24" patternUnits="userSpaceOnUse">
                  <rect width="12" height="12" fill="#f1f5f9" />
                  <rect x="12" width="12" height="12" fill="#ffffff" />
                  <rect y="12" width="12" height="12" fill="#ffffff" />
                  <rect x="12" y="12" width="12" height="12" fill="#f1f5f9" />
                </pattern>
                {/* Dark checkerboard pattern */}
                <pattern id="preview-checker-dark" width="24" height="24" patternUnits="userSpaceOnUse">
                  <rect width="12" height="12" fill="#1e293b" />
                  <rect x="12" width="12" height="12" fill="#0f172a" />
                  <rect y="12" width="12" height="12" fill="#0f172a" />
                  <rect x="12" y="12" width="12" height="12" fill="#1e293b" />
                </pattern>
              </defs>

              {/* Background Artboard Area (White by default) */}
              <rect
                x={vbMinX}
                y={vbMinY}
                width={vbWidth}
                height={vbHeight}
                fill={
                  canvasTheme === 'white'
                    ? '#ffffff'
                    : canvasTheme === 'dark'
                    ? '#090d16'
                    : 'url(#preview-checker-light)'
                }
              />

              {/* Checkerboard Backdrop under the image area (if background removed) */}
              {isBackgroundRemoved && showImage && canvasTheme === 'white' && (
                <rect
                  x={0}
                  y={0}
                  width={imgW}
                  height={imgH}
                  fill="url(#preview-checker-light)"
                  rx="6"
                />
              )}

              {/* The Original Image (x=0, y=0, width=imgW, height=imgH) */}
              {showImage && (
                <image
                  href={imgSrc}
                  x={0}
                  y={0}
                  width={imgW}
                  height={imgH}
                  preserveAspectRatio="none"
                />
              )}

              {/* Outlined Vector Die-Cut Lines (Crisp black on white canvas!) */}
              {showOverlayOutline && activeContours.map((contour, idx) => (
                <path
                  key={`preview-c-${idx}`}
                  d={contour.svgPath}
                  fill="none"
                  stroke={settings.lineColor}
                  strokeWidth={Math.max(2, settings.lineThickness * 1.6)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    filter: canvasTheme === 'dark' ? 'drop-shadow(0 0 2px rgba(255,255,255,0.95))' : undefined,
                  }}
                  opacity={outlineOpacity}
                />
              ))}
            </svg>

            {!showImage && !showOverlayOutline && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 text-xs gap-1.5 p-6 pointer-events-none">
                <span className="font-medium text-slate-300">Both Image and Outline are turned OFF.</span>
                <span className="text-[11px] text-slate-500">Click &quot;Image: ON&quot; or &quot;Vector Outline: ON&quot; above to view.</span>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer with Stats & Close */}
        <div className="px-5 py-2.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-600 font-mono shrink-0">
          <div className="flex items-center gap-3">
            <span>Stroke: <strong className="text-rose-600">{settings.lineThickness} pt</strong></span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span>Offset: <strong className="text-slate-900">+{settings.dieCutOffsetMm} mm</strong></span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span>Perimeter: <strong className="text-emerald-600">{vectorResult?.totalCutLengthMm || 0} mm</strong></span>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span>Canvas View: <strong className="text-indigo-600">{vbWidth} × {vbHeight} px</strong></span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg transition-colors cursor-pointer text-xs"
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
};
