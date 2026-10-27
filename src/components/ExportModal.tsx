import React, { useState } from 'react';
import {
  X,
  FileText,
  Download,
  Printer,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  ImageDimensions,
  OutlineSettings,
  VectorResult,
} from '../types';
import {
  exportOutlineDxf,
  exportOutlinePdf,
  exportOutlineSvg,
} from '../utils/exportService';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  dimensions: ImageDimensions;
  settings: OutlineSettings;
  vectorResult: VectorResult | null;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  onClose,
  dimensions,
  settings,
  vectorResult,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [jobName, setJobName] = useState('Vector_Border_Outline');

  if (!isOpen || !vectorResult) return null;

  const handlePdfExport = async () => {
    setIsExporting(true);
    try {
      await exportOutlinePdf(
        vectorResult,
        dimensions,
        settings,
        jobName
      );
      confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  const handleSvgExport = () => {
    exportOutlineSvg(vectorResult, dimensions, settings, jobName);
    confetti({ particleCount: 40, spread: 50, origin: { y: 0.7 } });
  };

  const handleDxfExport = () => {
    exportOutlineDxf(vectorResult, dimensions, jobName);
    confetti({ particleCount: 40, spread: 50, origin: { y: 0.7 } });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden text-slate-800 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
              <Printer className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Export Vector Border Outline
              </h2>
              <div className="text-xs text-slate-500 font-mono">
                {dimensions.physicalWidthMm} × {dimensions.physicalHeightMm} mm @ {dimensions.detectedDpi} DPI
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* File Name */}
          <div>
            <label className="text-xs font-medium text-slate-700 block mb-1">
              File Name:
            </label>
            <input
              type="text"
              value={jobName}
              onChange={e => setJobName(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:border-rose-500 font-mono"
            />
          </div>

          {/* Quick Specs Checklist */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2 text-xs font-mono text-slate-600">
            <div className="flex items-center justify-between">
              <span>Resolution:</span>
              <span className="font-semibold text-emerald-600">High-Res 300 DPI</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Stroke Thickness:</span>
              <span className="font-semibold text-slate-900">{settings.lineThickness} pt</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Physical Size:</span>
              <span className="font-semibold text-slate-900">
                {dimensions.physicalWidthMm} × {dimensions.physicalHeightMm} mm
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Total Cut Perimeter:</span>
              <span className="font-semibold text-slate-900">{vectorResult.totalCutLengthMm} mm</span>
            </div>
          </div>

          {/* Download PDF Button */}
          <button
            onClick={handlePdfExport}
            disabled={isExporting}
            className="w-full py-3 px-4 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-98"
          >
            {isExporting ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>Download Vector Outline PDF</span>
          </button>

          {/* Other Formats */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs text-slate-500">Other Vector Formats:</span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSvgExport}
                className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 cursor-pointer transition-colors"
              >
                SVG
              </button>
              <button
                onClick={handleDxfExport}
                className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 cursor-pointer transition-colors"
              >
                DXF (Plotter)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
