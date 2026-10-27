import React from 'react';
import { Download, Scissors, Eye } from 'lucide-react';

interface HeaderProps {
  onOpenPreview: () => void;
  onOpenExport: () => void;
  detectedDpi: number;
  physicalSize: string;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenPreview,
  onOpenExport,
  detectedDpi,
  physicalSize,
}) => {
  return (
    <header className="flex items-center justify-between gap-6 px-6 py-3 bg-white border-b border-slate-200 text-slate-900 z-30 select-none shadow-xs">
      {/* Zone 1: Single text element wordmark */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-lg bg-rose-600 flex items-center justify-center shadow-xs">
          <Scissors className="w-4 h-4 text-white -rotate-45" />
        </div>
        <a href="/" className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap hover:text-rose-600 transition-colors">
          VectorCut
        </a>
      </div>

      {/* Zone 2: Detected Image Metadata & Resolution */}
      <div className="flex items-center gap-2.5 text-xs text-slate-500 font-mono">
        <span className="text-slate-800 font-semibold">{physicalSize}</span>
        <span aria-hidden="true" className="text-slate-300">·</span>
        <span>{detectedDpi} DPI Print Standard</span>
        <span aria-hidden="true" className="text-slate-300">·</span>
        <span className="text-emerald-600 font-medium">Vector Border Outline</span>
      </div>

      {/* Zone 3: Actions - Preview Button & Export PDF */}
      <div className="flex items-center gap-2.5 shrink-0">
        <button
          onClick={onOpenPreview}
          className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg shadow-xs transition-all whitespace-nowrap shrink-0 cursor-pointer active:scale-95"
          title="Preview original uploaded photo and outline overlay"
        >
          <Eye className="w-3.5 h-3.5 text-slate-600" />
          <span>Preview Image</span>
        </button>

        <button
          onClick={onOpenExport}
          className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs transition-all whitespace-nowrap shrink-0 cursor-pointer active:scale-95"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export PDF</span>
        </button>
      </div>
    </header>
  );
};
