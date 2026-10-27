import React, { useState, useEffect } from 'react';
import { X, Wand2, Image as ImageIcon, Sparkles, Check, AlertCircle } from 'lucide-react';

interface RemoveBackgroundModalProps {
  isOpen: boolean;
  onClose: () => void;
  imagePreviewUrl: string;
  imageDimensions: { width: number; height: number };
  fileName?: string;
  onConfirmRemoveBg: (rememberChoice: boolean) => void;
  onConfirmKeepOriginal: (rememberChoice: boolean) => void;
  isProcessing?: boolean;
}

export const RemoveBackgroundModal: React.FC<RemoveBackgroundModalProps> = ({
  isOpen,
  onClose,
  imagePreviewUrl,
  imageDimensions,
  fileName,
  onConfirmRemoveBg,
  onConfirmKeepOriginal,
  isProcessing = false,
}) => {
  const [rememberChoice, setRememberChoice] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isProcessing) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isProcessing, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={() => {
        if (!isProcessing) onClose();
      }}
    >
      <div
        className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-500 to-amber-500 text-white flex items-center justify-center shadow-xs">
              <Wand2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 leading-tight">
                Remove Image Background?
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Optimize image for millimeter-accurate border outline detection
              </p>
            </div>
          </div>

          {!isProcessing && (
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
              title="Close (Esc)"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          {/* Uploaded File Preview Pill */}
          <div className="flex items-center gap-3.5 p-3 bg-slate-50 border border-slate-200 rounded-xl">
            {imagePreviewUrl ? (
              <img
                src={imagePreviewUrl}
                alt="Upload preview"
                className="w-14 h-14 object-contain rounded-lg bg-white border border-slate-200 shadow-2xs shrink-0"
              />
            ) : (
              <div className="w-14 h-14 bg-slate-200 rounded-lg flex items-center justify-center text-slate-400 shrink-0">
                <ImageIcon className="w-6 h-6" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-slate-800 truncate">
                {fileName || 'Uploaded Image'}
              </div>
              <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                {imageDimensions.width} × {imageDimensions.height} px
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md mt-1 border border-amber-200/70 inline-flex">
                <AlertCircle className="w-3 h-3 text-amber-600 shrink-0" />
                <span>Colorful backgrounds interfere with outline accuracy</span>
              </div>
            </div>
          </div>

          {/* Two Strategy Options */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {/* OPTION 1: REMOVE BACKGROUND (RECOMMENDED) */}
            <div
              onClick={() => !isProcessing && onConfirmRemoveBg(rememberChoice)}
              className="relative p-4 rounded-xl border-2 border-emerald-500 bg-emerald-50/40 hover:bg-emerald-50/70 transition-all cursor-pointer flex flex-col justify-between group shadow-xs active:scale-[0.99]"
            >
              <div className="absolute -top-2.5 right-3 bg-emerald-600 text-white font-mono text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-2xs flex items-center gap-1">
                <Sparkles className="w-2.5 h-2.5 text-amber-300" />
                Recommended Step 1
              </div>

              <div>
                <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center mb-2.5">
                  <Wand2 className="w-4 h-4" />
                </div>
                <h4 className="text-sm font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
                  Remove Background &amp; Preview
                </h4>
                <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
                  Fast background removal. You inspect the transparent cutout first, make sure it is perfect, and click OK before making the vector outline.
                </p>
              </div>

              <button
                disabled={isProcessing}
                onClick={e => {
                  e.stopPropagation();
                  onConfirmRemoveBg(rememberChoice);
                }}
                className="mt-4 w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors shadow-xs flex items-center justify-center gap-1.5"
              >
                {isProcessing ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                    <span>Preview Background Removal</span>
                  </>
                )}
              </button>
            </div>

            {/* OPTION 2: KEEP ORIGINAL BACKGROUND */}
            <div
              onClick={() => !isProcessing && onConfirmKeepOriginal(rememberChoice)}
              className="p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-all cursor-pointer flex flex-col justify-between group shadow-2xs active:scale-[0.99]"
            >
              <div>
                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center mb-2.5">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <h4 className="text-sm font-bold text-slate-900 group-hover:text-slate-800 transition-colors">
                  Keep Original Background
                </h4>
                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                  Leaves original background intact. Best if the file is already a transparent PNG or simple graphic on solid white.
                </p>
              </div>

              <button
                disabled={isProcessing}
                onClick={e => {
                  e.stopPropagation();
                  onConfirmKeepOriginal(rememberChoice);
                }}
                className="mt-4 w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
              >
                <span>Keep Original &amp; Trace</span>
              </button>
            </div>
          </div>

          {/* Remember Choice Checkbox */}
          <label className="flex items-center gap-2 pt-2 text-xs text-slate-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rememberChoice}
              onChange={e => setRememberChoice(e.target.checked)}
              className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500 accent-rose-600"
            />
            <span>Remember this choice for future image uploads</span>
          </label>
        </div>
      </div>
    </div>
  );
};
