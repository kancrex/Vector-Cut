import React, { useRef, useState, useEffect } from 'react';
import { ZoomIn, ZoomOut, Eye, EyeOff, RotateCcw, Sparkles, Wand2, Eraser } from 'lucide-react';
import {
  ImageDimensions,
  OutlineSettings,
  VectorResult,
} from '../types';

interface CanvasViewportProps {
  imageElement: HTMLImageElement | HTMLCanvasElement | null;
  dimensions: ImageDimensions;
  settings: OutlineSettings;
  vectorResult: VectorResult | null;
  isLoading: boolean;
  onOpenPreview: () => void;
  onRunAiOutline?: () => void;
  isAiDetecting?: boolean;
  isBackgroundRemoved?: boolean;
  onRemoveBackground?: () => void;
  isRemovingBackground?: boolean;
}

export const CanvasViewport: React.FC<CanvasViewportProps> = ({
  imageElement,
  dimensions,
  settings,
  vectorResult,
  isLoading,
  onOpenPreview,
  onRunAiOutline,
  isAiDetecting,
  isBackgroundRemoved,
  onRemoveBackground,
  isRemovingBackground,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  const [showUnderlay, setShowUnderlay] = useState(true); // Default true: artwork image visible with vector outline overlaid
  const [canvasTheme, setCanvasTheme] = useState<'white' | 'checker' | 'dark'>('white');

  // Reset to visual center whenever a new image is loaded or dimensions change
  useEffect(() => {
    handleResetToCenter();
  }, [dimensions.pixelWidth, dimensions.pixelHeight]);

  const handleResetToCenter = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsPanning(true);
      setStartPan({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({ x: e.clientX - startPan.x, y: e.clientY - startPan.y });
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomDelta = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom(prev => Math.min(3, Math.max(0.3, Number((prev * zoomDelta).toFixed(3)))));
  };

  const activeContours =
    vectorResult?.offsetContour && vectorResult.offsetContour.length > 0
      ? vectorResult.offsetContour
      : vectorResult?.outerContours || [];

  const imgW = dimensions.pixelWidth || 1000;
  const imgH = dimensions.pixelHeight || 1000;

  // DYNAMIC BOUNDS:
  // Combines the artwork rect [0, 0, imgW, imgH] and all vector outline coordinates
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

  const margin = Math.max(20, Math.round(Math.max(imgW, imgH) * 0.05));
  const vbMinX = Math.floor(minX - margin);
  const vbMinY = Math.floor(minY - margin);
  const vbWidth = Math.ceil((maxX + margin) - vbMinX);
  const vbHeight = Math.ceil((maxY + margin) - vbMinY);
  const viewAspectRatio = vbWidth / (vbHeight || 1);

  const imgSrc = imageElement
    ? imageElement instanceof HTMLCanvasElement
      ? imageElement.toDataURL()
      : imageElement.src
    : '';

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      className="relative flex-1 h-full w-full bg-slate-100/70 overflow-hidden select-none cursor-grab active:cursor-grabbing flex items-center justify-center p-6"
      style={{
        backgroundImage: `radial-gradient(circle, rgba(148, 163, 184, 0.28) 1.5px, transparent 1.5px)`,
        backgroundSize: '24px 24px',
      }}
    >
      {/* Loading Overlay */}
      {(isLoading || isAiDetecting) && (
        <div className="absolute inset-0 bg-white/75 backdrop-blur-xs flex items-center justify-center z-40">
          <div className="flex flex-col items-center gap-2.5 px-6 py-4 bg-white border border-slate-200 rounded-xl shadow-xl text-slate-800">
            <div className="w-6 h-6 border-2 border-rose-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-mono font-medium">
              {isAiDetecting ? 'AI Analyzing Precision Silhouette...' : 'Detecting Seamless Border Outline...'}
            </span>
          </div>
        </div>
      )}

      {/* Top Left Banner: Detected Dimensions & Background Status */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2 text-xs font-mono bg-white/95 backdrop-blur-md px-3.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 shadow-sm">
        <span className="font-semibold text-rose-600">BORDER OUTLINE</span>
        <span aria-hidden="true" className="text-slate-300">·</span>
        <span>
          {dimensions.physicalWidthMm} × {dimensions.physicalHeightMm} mm ({dimensions.physicalWidthIn}&quot; × {dimensions.physicalHeightIn}&quot;)
        </span>
        <span aria-hidden="true" className="text-slate-300">·</span>
        <span className="text-slate-500 font-medium">{Math.round(zoom * 100)}%</span>
        {vectorResult?.detectedShape && (
          <>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="text-[10px] bg-indigo-100 text-indigo-800 font-semibold px-2 py-0.5 rounded-md border border-indigo-200 flex items-center gap-1 font-sans">
              <span>
                {vectorResult.detectedShape === 'square'
                  ? '⬛ Square'
                  : vectorResult.detectedShape === 'rectangle'
                  ? '▭ Rectangle'
                  : vectorResult.detectedShape === 'circle'
                  ? '⭕ Circle'
                  : vectorResult.detectedShape === 'oval'
                  ? '🎈 Oval / Balloon'
                  : '✂️ Die-Cut'}
              </span>
            </span>
          </>
        )}
        {isBackgroundRemoved && (
          <>
            <span aria-hidden="true" className="text-slate-300">·</span>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-md border border-emerald-300 flex items-center gap-1">
              <span>BG Removed ✨</span>
            </span>
          </>
        )}
      </div>

      {/* Top Right Controls */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        {/* Quick Remove Background & Eraser Button */}
        {onRemoveBackground && (
          <button
            onClick={onRemoveBackground}
            disabled={isRemovingBackground || isAiDetecting}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs border transition-colors cursor-pointer disabled:opacity-60 ${
              isBackgroundRemoved
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                : 'bg-white border-slate-200 hover:border-emerald-300 text-slate-700 hover:text-emerald-700'
            }`}
            title="Clean background and use circle/square eraser tool to carve custom cutouts"
          >
            {isRemovingBackground ? (
              <div className="w-3.5 h-3.5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
            ) : isBackgroundRemoved ? (
              <Eraser className="w-3.5 h-3.5 text-emerald-700" />
            ) : (
              <Wand2 className="w-3.5 h-3.5 text-emerald-600" />
            )}
            <span>{isBackgroundRemoved ? '🧽 Clean / Eraser Tool' : 'Remove BG & Eraser'}</span>
          </button>
        )}

        {/* Toggle Artwork Underlay on Canvas */}
        <button
          onClick={() => setShowUnderlay(!showUnderlay)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-xs border transition-colors cursor-pointer ${
            showUnderlay
              ? 'bg-amber-50 border-amber-300 text-amber-800'
              : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'
          }`}
          title="Toggle source photo underlay behind vector outline"
        >
          {showUnderlay ? <Eye className="w-3.5 h-3.5 text-amber-600" /> : <EyeOff className="w-3.5 h-3.5" />}
          <span>{showUnderlay ? 'Artwork: ON' : 'Artwork: OFF'}</span>
        </button>

        {/* Big Preview Pop-Up Screen */}
        <button
          onClick={onOpenPreview}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer active:scale-95"
          title="Open large preview screen with original photo & outline overlay"
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Preview (80%+ Display)</span>
        </button>

        {/* Canvas Background Theme (White by default for clear black outline recognition) */}
        <div className="flex items-center bg-white rounded-lg border border-slate-200 p-0.5 text-xs shadow-xs">
          <button
            onClick={() => setCanvasTheme('white')}
            className={`px-2 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1 ${
              canvasTheme === 'white'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Pure white canvas artboard (maximum contrast for black outlines)"
          >
            <span>⚪ White</span>
          </button>
          <button
            onClick={() => setCanvasTheme('checker')}
            className={`px-2 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1 ${
              canvasTheme === 'checker'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Checkerboard canvas background"
          >
            <span>🏁 Checker</span>
          </button>
          <button
            onClick={() => setCanvasTheme('dark')}
            className={`px-2 py-1 rounded text-[11px] font-semibold transition-all cursor-pointer flex items-center gap-1 ${
              canvasTheme === 'dark'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
            title="Dark canvas background"
          >
            <span>⚫ Dark</span>
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center bg-white rounded-lg border border-slate-200 text-slate-600 p-0.5 shadow-sm">
          <button
            onClick={() => setZoom(prev => Math.max(0.3, Number((prev - 0.15).toFixed(3))))}
            className="p-1.5 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleResetToCenter}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-mono hover:text-slate-900 hover:bg-slate-100 rounded transition-colors cursor-pointer"
            title="Center and Reset Canvas View"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Center</span>
          </button>
          <button
            onClick={() => setZoom(prev => Math.min(3, Number((prev + 0.15).toFixed(3))))}
            className="p-1.5 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* FIXED-CENTER CANVAS CONTAINER:
          Pure white artboard by default so black vector outline stands out razor-sharp!
      */}
      <div
        className="relative transition-transform duration-75 origin-center will-change-transform flex items-center justify-center pointer-events-auto"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          width: '100%',
          height: '100%',
          maxWidth: `min(76vw, calc(68vh * ${viewAspectRatio}))`,
          maxHeight: `min(68vh, calc(76vw / ${viewAspectRatio}))`,
          aspectRatio: `${viewAspectRatio}`,
        }}
      >
        <div
          className={`relative w-full h-full rounded-2xl shadow-xl overflow-hidden flex items-center justify-center transition-colors duration-150 ${
            canvasTheme === 'white'
              ? 'bg-white border-2 border-slate-300 shadow-slate-200/80'
              : canvasTheme === 'dark'
              ? 'bg-slate-900 border-2 border-slate-700'
              : 'bg-slate-100 border-2 border-slate-300'
          }`}
        >
          {activeContours.length > 0 ? (
            <svg
              className="relative w-full h-full block pointer-events-none z-10 select-none"
              viewBox={`${vbMinX} ${vbMinY} ${vbWidth} ${vbHeight}`}
              preserveAspectRatio="xMidYMid meet"
            >
              <defs>
                {/* Light checkerboard pattern */}
                <pattern id="canvas-checker-light" width="20" height="20" patternUnits="userSpaceOnUse">
                  <rect width="10" height="10" fill="#f1f5f9" />
                  <rect x="10" width="10" height="10" fill="#ffffff" />
                  <rect y="10" width="10" height="10" fill="#ffffff" />
                  <rect x="10" y="10" width="10" height="10" fill="#f1f5f9" />
                </pattern>
                {/* Dark checkerboard pattern */}
                <pattern id="canvas-checker-dark" width="20" height="20" patternUnits="userSpaceOnUse">
                  <rect width="10" height="10" fill="#1e293b" />
                  <rect x="10" width="10" height="10" fill="#0f172a" />
                  <rect y="10" width="10" height="10" fill="#0f172a" />
                  <rect x="10" y="10" width="10" height="10" fill="#1e293b" />
                </pattern>
              </defs>

              {/* Background Artboard (Pure White by default) */}
              <rect
                x={vbMinX}
                y={vbMinY}
                width={vbWidth}
                height={vbHeight}
                fill={
                  canvasTheme === 'white'
                    ? '#ffffff'
                    : canvasTheme === 'dark'
                    ? '#0f172a'
                    : 'url(#canvas-checker-light)'
                }
              />

              {/* Subtle Checkerboard under transparent artwork if enabled */}
              {isBackgroundRemoved && showUnderlay && canvasTheme === 'white' && (
                <rect
                  x={0}
                  y={0}
                  width={imgW}
                  height={imgH}
                  fill="url(#canvas-checker-light)"
                  rx="6"
                />
              )}

              {/* Artwork Underlay Photo with Vector Outline Superimposed */}
              {showUnderlay && imgSrc && (
                <image
                  href={imgSrc}
                  x={0}
                  y={0}
                  width={imgW}
                  height={imgH}
                  opacity="1"
                  preserveAspectRatio="none"
                />
              )}

              {/* Outlined Vector Contours - 100% within canvas, razor sharp & high contrast! */}
              {activeContours.map((contour, idx) => (
                <path
                  key={`outline-${idx}`}
                  d={contour.svgPath}
                  fill="none"
                  stroke={settings.lineColor}
                  strokeWidth={Math.max(1.5, settings.lineThickness * 1.5)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    filter: canvasTheme === 'dark' ? 'drop-shadow(0 0 1.5px rgba(255,255,255,0.9))' : undefined,
                  }}
                />
              ))}
            </svg>
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-6 text-slate-500 font-mono text-xs gap-3 z-10 max-w-sm">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                <RotateCcw className="w-5 h-5 animate-spin" />
              </div>
              <div>
                <p className="font-semibold text-slate-800 text-sm">Analyzing Border Outline...</p>
                <p className="text-slate-500 text-xs mt-1">
                  Adjust the sensitivity slider on the left or click AI Precision Outline below.
                </p>
              </div>
              {onRunAiOutline && (
                <button
                  onClick={onRunAiOutline}
                  disabled={isAiDetecting}
                  className="mt-1 flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-xs disabled:opacity-50"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                  <span>Run AI Precision Outline</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Floating Bottom Quick Bar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-white/95 backdrop-blur-md px-4 py-2 rounded-xl border border-slate-200 text-xs shadow-md font-mono text-slate-700">
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400">Stroke Thickness:</span>
          <span className="font-semibold text-rose-600">{settings.lineThickness} pt</span>
        </div>
        <span aria-hidden="true" className="text-slate-300">·</span>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400">Offset:</span>
          <span className="font-semibold text-slate-900">+{settings.dieCutOffsetMm} mm</span>
        </div>
        <span aria-hidden="true" className="text-slate-300">·</span>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400">Cut Perimeter:</span>
          <span className="font-semibold text-emerald-600">{vectorResult?.totalCutLengthMm || 0} mm</span>
        </div>
      </div>
    </div>
  );
};
