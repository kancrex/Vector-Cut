import React from 'react';
import {
  Upload,
  Sliders,
  Crop,
  Sparkles,
  RefreshCw,
  Wand2,
  Eye,
  EyeOff,
  Check,
  Square,
  RectangleHorizontal,
  Scissors,
  Circle,
  Eraser,
} from 'lucide-react';
import {
  ImageDimensions,
  OutlineSettings,
} from '../types';

interface SidebarControlsProps {
  dimensions: ImageDimensions;
  setDimensions: React.Dispatch<React.SetStateAction<ImageDimensions>>;
  settings: OutlineSettings;
  setSettings: React.Dispatch<React.SetStateAction<OutlineSettings>>;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRunAiOutline: () => void;
  isAiDetecting: boolean;
  aiError: string | null;
  detectionMode: 'cv' | 'ai';
  onResetToCv: () => void;
  onRemoveBackground: (method: 'ai' | 'color') => void;
  isRemovingBackground: boolean;
  isBackgroundRemoved: boolean;
  onToggleOriginalBackground: () => void;
  autoRemoveBg: boolean;
  onToggleAutoRemoveBg: (val: boolean) => void;
  onOpenRemoveBgDialog: () => void;
  detectedShape?: 'square' | 'rectangle' | 'circle' | 'oval' | 'die-cut';
}

export const SidebarControls: React.FC<SidebarControlsProps> = ({
  dimensions,
  setDimensions,
  settings,
  setSettings,
  onFileUpload,
  onRunAiOutline,
  isAiDetecting,
  aiError,
  detectionMode,
  onResetToCv,
  onRemoveBackground,
  isRemovingBackground,
  isBackgroundRemoved,
  onToggleOriginalBackground,
  autoRemoveBg,
  onToggleAutoRemoveBg,
  onOpenRemoveBgDialog,
  detectedShape = 'die-cut',
}) => {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleWidthMmChange = (newWidthMm: number) => {
    const val = Math.max(10, Math.min(1000, newWidthMm));
    const newHeightMm = Number((val / dimensions.aspectRatio).toFixed(1));
    setDimensions({
      ...dimensions,
      physicalWidthMm: val,
      physicalHeightMm: newHeightMm,
      physicalWidthIn: Number((val / 25.4).toFixed(2)),
      physicalHeightIn: Number((newHeightMm / 25.4).toFixed(2)),
    });
  };

  return (
    <aside className="w-80 md:w-88 shrink-0 bg-white border-r border-slate-200 flex flex-col h-full text-slate-800 select-none overflow-y-auto">
      {/* 1. Upload & AI Outline Detection */}
      <div className="p-4 border-b border-slate-100 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Image &amp; Outline Detection
          </span>
          <span className="text-[11px] font-mono text-slate-400">
            {dimensions.pixelWidth} × {dimensions.pixelHeight} px
          </span>
        </div>

        {/* Upload Button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-medium cursor-pointer transition-colors shadow-xs active:scale-98"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Upload Image to Detect Outline</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={onFileUpload}
          className="hidden"
        />

        {/* IMAGE BACKGROUND REMOVAL & ISOLATION (Solves colorful background issues) */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Wand2 className="w-3.5 h-3.5 text-rose-600" />
              <span className="text-xs font-semibold text-slate-800">
                Background Isolation
              </span>
            </div>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-semibold ${
                isBackgroundRemoved
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-slate-200 text-slate-600'
              }`}
            >
              {isBackgroundRemoved ? 'Removed (Transparent) ✨' : 'Original Background'}
            </span>
          </div>

          <p className="text-[11px] text-slate-500 leading-tight">
            Removes colorful photo backgrounds, wood tables, and patterns so the vector outline traces only your foreground design.
          </p>

          <div className="flex flex-col gap-2">
            <button
              onClick={() => onRemoveBackground('ai')}
              disabled={isRemovingBackground || isAiDetecting}
              className="w-full py-2 px-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-lg text-xs font-semibold cursor-pointer transition-all shadow-xs disabled:opacity-60 flex items-center justify-center gap-1.5 active:scale-98"
            >
              <Eraser className="w-3.5 h-3.5 text-white" />
              <span>{isBackgroundRemoved ? '🧽 Touch-up Eraser (Circle & Square)' : '⚡ Remove BG & Eraser Tool'}</span>
            </button>

            {isBackgroundRemoved && (
              <button
                onClick={onToggleOriginalBackground}
                className="w-full py-1.5 px-2.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-medium cursor-pointer transition-colors"
                title="Toggle between isolated subject and original background"
              >
                Toggle View (Cutout / Original)
              </button>
            )}
          </div>

          <div className="pt-1 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-slate-600">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoRemoveBg}
                onChange={e => onToggleAutoRemoveBg(e.target.checked)}
                className="w-3.5 h-3.5 text-rose-600 rounded border-slate-300 accent-rose-600"
              />
              <span>Auto-remove on upload</span>
            </label>

            <button
              onClick={onOpenRemoveBgDialog}
              className="text-rose-600 hover:text-rose-700 font-medium underline text-[10px] cursor-pointer"
            >
              Upload Strategy
            </button>
          </div>
        </div>

        {/* AI ACCURACY DETECTION BUTTON (GEMINI FLASH LITE) */}
        <div className="pt-1 space-y-2">
          {/* Engine Selector */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs">
            <button
              onClick={onResetToCv}
              className={`flex-1 py-1.5 px-2 rounded-md font-medium text-[11px] transition-all cursor-pointer flex items-center justify-center gap-1 ${
                detectionMode === 'cv'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>⚡ Fast CV</span>
            </button>
            <button
              onClick={onRunAiOutline}
              disabled={isAiDetecting}
              className={`flex-1 py-1.5 px-2 rounded-md font-medium text-[11px] transition-all cursor-pointer flex items-center justify-center gap-1 ${
                detectionMode === 'ai'
                  ? 'bg-rose-600 text-white shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Sparkles className="w-3 h-3 text-amber-300" />
              <span>✨ Gemini Flash Lite</span>
            </button>
          </div>

          <button
            onClick={onRunAiOutline}
            disabled={isAiDetecting}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-gradient-to-r from-rose-600 to-amber-600 hover:from-rose-500 hover:to-amber-500 text-white rounded-lg text-xs font-semibold cursor-pointer transition-all shadow-xs disabled:opacity-60 active:scale-98"
          >
            {isAiDetecting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Gemini Flash Lite Detecting...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-amber-200" />
                <span>Run Gemini AI (Flash Lite)</span>
              </>
            )}
          </button>
          
          <div className="text-[10px] text-slate-400 leading-tight px-0.5">
            Free-tier friendly Gemini Flash Lite AI detects clean outer borders on difficult photos, complex shadows, and low-contrast images.
          </div>

          {aiError && (
            <div className="text-[11px] text-rose-600 bg-rose-50 p-2 rounded border border-rose-200 mt-1.5 leading-tight">
              {aiError}
            </div>
          )}
        </div>

        {/* Detected Physical Print Dimensions */}
        <div className="pt-2">
          <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
            <span>Detected Print Size (300 DPI):</span>
            <span className="font-mono text-slate-900 font-semibold">
              {dimensions.physicalWidthMm} × {dimensions.physicalHeightMm} mm
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-1.5">
            <div>
              <label className="text-[10px] text-slate-400 block mb-0.5">Width (mm):</label>
              <input
                type="number"
                value={dimensions.physicalWidthMm}
                onChange={e => handleWidthMmChange(parseFloat(e.target.value) || 10)}
                className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-mono text-slate-900 focus:outline-none focus:border-rose-500"
                step="1"
                min="10"
                max="1000"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block mb-0.5">Height (mm):</label>
              <input
                type="number"
                value={dimensions.physicalHeightMm}
                readOnly
                className="w-full bg-slate-100 border border-slate-200 rounded px-2 py-1 text-xs font-mono text-slate-500 cursor-not-allowed"
              />
            </div>
          </div>
          <div className="text-[10px] font-mono text-slate-400 text-right mt-1">
            ({dimensions.physicalWidthIn}&quot; × {dimensions.physicalHeightIn}&quot;)
          </div>
        </div>
      </div>

      {/* 2. SHAPE TYPE & GEOMETRIC CUT (Solves Rectangle, Square, and Die-Cut outlines) */}
      <div className="p-4 border-b border-slate-100 space-y-3 bg-slate-50/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Crop className="w-3.5 h-3.5 text-rose-600" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">
              Cut Shape Type
            </span>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full font-bold bg-indigo-100 text-indigo-700 border border-indigo-200 uppercase">
            {detectedShape === 'square'
              ? '⬛ Square'
              : detectedShape === 'rectangle'
              ? '▭ Rectangle'
              : detectedShape === 'circle'
              ? '⭕ Circle'
              : detectedShape === 'oval'
              ? '🎈 Oval / Balloon'
              : '✂️ Die-Cut'}
          </span>
        </div>

        {/* Shape selector buttons */}
        <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs">
          {[
            { id: 'auto', label: '⚡ Auto' },
            { id: 'rectangle', label: '▭ Rect' },
            { id: 'square', label: '⬛ Square' },
            { id: 'circle', label: '⭕ Circle' },
            { id: 'oval', label: '🎈 Balloon' },
            { id: 'die-cut', label: '✂️ Die-Cut' },
          ].map(s => (
            <button
              key={s.id}
              onClick={() => setSettings({ ...settings, shapeType: s.id as any })}
              className={`py-1.5 px-2 rounded-lg text-[11px] font-medium transition-all cursor-pointer flex items-center justify-center gap-1 ${
                settings.shapeType === s.id
                  ? 'bg-white text-rose-700 shadow-xs border border-slate-200 font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>{s.label}</span>
            </button>
          ))}
        </div>

        {/* Bilateral Symmetry Lock Toggle */}
        <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-200">
          <div className="pr-2">
            <div className="text-xs font-semibold text-slate-800">
              Symmetry Lock (Bilateral Balance)
            </div>
            <div className="text-[10px] text-slate-500 leading-tight mt-0.5">
              Ensures balloons, round shapes, and stickers are smooth and mirrored.
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.symmetryLock !== false}
            onClick={() =>
              setSettings({
                ...settings,
                symmetryLock: settings.symmetryLock === false ? true : false,
              })
            }
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
              settings.symmetryLock !== false ? 'bg-emerald-600' : 'bg-slate-300'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                settings.symmetryLock !== false ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Corner Radius (for Rectangle & Square) */}
        {(settings.shapeType === 'rectangle' ||
          settings.shapeType === 'square' ||
          (settings.shapeType === 'auto' &&
            (detectedShape === 'rectangle' || detectedShape === 'square'))) && (
          <div className="p-2.5 bg-white rounded-xl border border-slate-200 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700">Corner Radius:</span>
              <span className="text-rose-600 font-mono font-bold">
                {settings.cornerRadiusMm === 0
                  ? '0 mm (Sharp 90°)'
                  : `${settings.cornerRadiusMm} mm`}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="12"
              step="0.5"
              value={settings.cornerRadiusMm || 0}
              onChange={e =>
                setSettings({ ...settings, cornerRadiusMm: parseFloat(e.target.value) || 0 })
              }
              className="w-full accent-rose-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] font-mono text-slate-400">
              <span>0mm (Sharp 90°)</span>
              <span>3mm</span>
              <span>6mm</span>
              <span>12mm (Pill)</span>
            </div>
          </div>
        )}
      </div>

      {/* 3. Border Outline & Line Thickness */}
      <div className="p-4 border-b border-slate-100 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Sliders className="w-3.5 h-3.5 text-rose-600" />
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Border Outline Controls
            </span>
          </div>
          <span className="text-xs font-mono font-bold text-rose-600">
            {settings.lineThickness} pt
          </span>
        </div>

        {/* ADJUSTABLE LINE THICKNESS (User requested) */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <label className="text-slate-700 font-medium">Line Thickness (Stroke):</label>
            <span className="text-rose-600 font-mono font-semibold">
              {settings.lineThickness} pt ({((settings.lineThickness / 72) * 25.4).toFixed(2)} mm)
            </span>
          </div>
          <input
            type="range"
            min="0.25"
            max="12"
            step="0.25"
            value={settings.lineThickness}
            onChange={e => setSettings({ ...settings, lineThickness: parseFloat(e.target.value) })}
            className="w-full accent-rose-600 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] font-mono text-slate-400 mt-1">
            <span>0.25pt (Hairline)</span>
            <span>1pt</span>
            <span>4pt</span>
            <span>12pt (Thick)</span>
          </div>
        </div>

        {/* Design Background Type Selector for Multi-Design Adaptability */}
        <div>
          <label className="text-xs text-slate-700 font-medium block mb-1">Design Background Mode:</label>
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200 text-xs">
            {[
              { id: 'auto', label: '⚡ Auto Detect' },
              { id: 'light', label: 'White / Light' },
              { id: 'dark', label: 'Dark / Black' },
              { id: 'transparent', label: 'Transparent PNG' },
            ].map(m => (
              <button
                key={m.id}
                onClick={() => setSettings({ ...settings, bgMode: m.id as any })}
                className={`py-1 px-2 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                  settings.bgMode === m.id
                    ? 'bg-white text-rose-700 shadow-xs border border-slate-200 font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Border Detection Sensitivity Threshold (in CV mode) */}
        {detectionMode === 'cv' && (
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-slate-700">Border Sensitivity:</span>
              <span className="text-slate-500 font-mono">{settings.threshold}</span>
            </div>
            <input
              type="range"
              min="10"
              max="250"
              value={settings.threshold}
              onChange={e => setSettings({ ...settings, threshold: parseInt(e.target.value) })}
              className="w-full accent-rose-600 cursor-pointer"
            />
            <div className="text-[10px] text-slate-400 mt-0.5">
              Fine-tunes outline edge tightness for complex contrast boundaries.
            </div>
          </div>
        )}

        {/* Die Cut Offset (Card Stock Border / Margin) */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-700">Die-Cut Offset (Margin):</span>
            <span className="text-rose-600 font-mono font-medium">
              {settings.dieCutOffsetMm === 0 ? 'Exact Edge (0mm)' : `+${settings.dieCutOffsetMm} mm`}
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="8"
            step="0.5"
            value={settings.dieCutOffsetMm}
            onChange={e => setSettings({ ...settings, dieCutOffsetMm: parseFloat(e.target.value) })}
            className="w-full accent-rose-600 cursor-pointer"
          />
          <div className="flex justify-between text-[10px] font-mono text-slate-400 mt-1">
            <span>0mm (Exact)</span>
            <span>+2mm (Cardstock)</span>
            <span>+5mm</span>
            <span>+8mm</span>
          </div>
        </div>

        {/* Outline Color */}
        <div>
          <label className="text-xs text-slate-700 block mb-1.5">Outline Color:</label>
          <div className="flex items-center gap-2">
            {[
              { label: 'Black', hex: '#000000' },
              { label: 'Roland CutContour (Magenta)', hex: '#FF00FF' },
              { label: 'Navy', hex: '#1E293B' },
              { label: 'Red', hex: '#DC2626' },
              { label: 'Cyan', hex: '#00FFFF' },
            ].map(c => (
              <button
                key={c.hex}
                onClick={() => setSettings({ ...settings, lineColor: c.hex })}
                title={c.label}
                className={`w-6 h-6 rounded-full border cursor-pointer transition-transform ${
                  settings.lineColor.toUpperCase() === c.hex.toUpperCase()
                    ? 'scale-115 border-slate-900 ring-2 ring-rose-500/40'
                    : 'border-slate-300'
                }`}
                style={{ backgroundColor: c.hex }}
              />
            ))}
          </div>
        </div>

        {/* Plotter Blade Curve Smoothing */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-slate-700">Blade Curve Smoothing:</span>
            <span className="text-slate-500 font-mono">{settings.smoothing}</span>
          </div>
          <input
            type="range"
            min="1"
            max="10"
            value={settings.smoothing}
            onChange={e => setSettings({ ...settings, smoothing: parseInt(e.target.value) })}
            className="w-full accent-rose-600 cursor-pointer"
          />
          <div className="text-[10px] text-slate-400 mt-0.5">
            Produces smooth Bezier cutting curves for card stock without jagged steps.
          </div>
        </div>
      </div>
    </aside>
  );
};
