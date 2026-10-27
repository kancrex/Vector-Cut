import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Wand2,
  Check,
  RotateCcw,
  Sliders,
  Sparkles,
  Eye,
  EyeOff,
  SplitSquareVertical,
  ArrowRight,
  ShieldAlert,
  Eraser,
  Circle,
  Square,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Hand,
  MousePointer,
  HelpCircle,
  Layers,
  Palette,
} from 'lucide-react';
import { fastRemoveBackgroundLocal, removeBackgroundWithAi } from '../utils/backgroundRemoval';

export type EraserShape = 'circle' | 'square';
export type ActiveTool = 'view' | 'circle-eraser' | 'square-eraser';
export type BackdropPattern = 'checker-dark' | 'checker-light' | 'neon' | 'pure-white';

interface BackgroundReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  rawImage: HTMLImageElement | null;
  activeCleanedImage?: HTMLImageElement | null;
  fileName?: string;
  onApproveCleanedImage: (cleanedImg: HTMLImageElement, dataUrl: string) => void;
  onKeepOriginalImage: () => void;
}

export const BackgroundReviewModal: React.FC<BackgroundReviewModalProps> = ({
  isOpen,
  onClose,
  rawImage,
  activeCleanedImage,
  fileName,
  onApproveCleanedImage,
  onKeepOriginalImage,
}) => {
  // Full-page Maximize state
  const [isMaximized, setIsMaximized] = useState<boolean>(false);

  // Removal algorithm settings
  const [tolerance, setTolerance] = useState<number>(36);
  const [mode, setMode] = useState<'smart-border' | 'solid-color' | 'ai'>('smart-border');
  const [viewMode, setViewMode] = useState<'interactive' | 'original' | 'split'>('interactive');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Cleaned result state
  const [cleanedImage, setCleanedImage] = useState<HTMLImageElement | null>(null);
  const [cleanedDataUrl, setCleanedDataUrl] = useState<string>('');
  const [transparencyPercent, setTransparencyPercent] = useState<number>(0);
  const [processingTimeMs, setProcessingTimeMs] = useState<number>(0);

  // Interactive Tools state - DEFAULT TO 'view' (inspect/pan mode) so clicking doesn't accidentally erase!
  const [activeTool, setActiveTool] = useState<ActiveTool>('view');
  const [eraserSize, setEraserSize] = useState<number>(40);
  const [eraserEditsCount, setEraserEditsCount] = useState<number>(0);
  const [backdropPattern, setBackdropPattern] = useState<BackdropPattern>('checker-dark');

  // Undo / Redo history stacks (ImageData snapshots)
  const undoStackRef = useRef<ImageData[]>([]);
  const redoStackRef = useRef<ImageData[]>([]);
  const [canUndo, setCanUndo] = useState<boolean>(false);
  const [canRedo, setCanRedo] = useState<boolean>(false);
  const [undoCount, setUndoCount] = useState<number>(0);

  // Zoom & Pan state
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0,
  });

  // Cursor overlay state for brush outline indicator (fixed client coordinates)
  const [cursorPos, setCursorPos] = useState<{
    clientX: number;
    clientY: number;
    visible: boolean;
  }>({
    clientX: 0,
    clientY: 0,
    visible: false,
  });
  const [currentScreenScale, setCurrentScreenScale] = useState<number>(1);

  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDrawingRef = useRef<boolean>(false);
  const lastDrawPosRef = useRef<{ x: number; y: number } | null>(null);
  const initialImageDataRef = useRef<ImageData | null>(null);

  // Debounced live update for tolerance slider
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Initializes the interactive drawing canvas with the cleaned image
   */
  const initCanvasWithImage = useCallback((img: HTMLImageElement) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const width = img.naturalWidth || img.width || 1000;
    const height = img.naturalHeight || img.height || 1000;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0, width, height);

    // Save initial state for "Reset"
    try {
      initialImageDataRef.current = ctx.getImageData(0, 0, width, height);
    } catch {
      // ignore security restrictions if any
    }

    // Measure initial screen scale
    requestAnimationFrame(() => {
      if (canvasRef.current && canvasRef.current.width > 0) {
        const rect = canvasRef.current.getBoundingClientRect();
        if (rect.width > 0) {
          setCurrentScreenScale(rect.width / canvasRef.current.width);
        }
      }
    });
  }, []);

  /**
   * Run background removal algorithm
   */
  const runBackgroundRemoval = async (
    currentTolerance = tolerance,
    currentMode = mode
  ) => {
    if (!rawImage) return;
    setIsProcessing(true);
    setErrorMsg(null);
    const start = performance.now();

    try {
      let res;
      if (currentMode === 'ai') {
        res = await removeBackgroundWithAi(rawImage);
      } else {
        res = await fastRemoveBackgroundLocal(
          rawImage,
          currentTolerance,
          currentMode
        );
      }
      setCleanedImage(res.cleanedImage);
      setCleanedDataUrl(res.cleanedDataUrl);
      setTransparencyPercent(Math.round(res.transparencyRatio * 100));
      setProcessingTimeMs(Math.round(performance.now() - start));

      // Reset eraser stacks when re-running background removal
      undoStackRef.current = [];
      redoStackRef.current = [];
      setCanUndo(false);
      setCanRedo(false);
      setUndoCount(0);
      setEraserEditsCount(0);

      // Render to drawing canvas
      initCanvasWithImage(res.cleanedImage);
    } catch (err: any) {
      console.error('Removal error:', err);
      setErrorMsg(err.message || 'Background removal encountered an error.');
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Initial effect when modal opens
   */
  useEffect(() => {
    if (isOpen && rawImage) {
      // DEFAULT: Reset to 'view' (inspect/pan) mode on opening modal
      setActiveTool('view');
      setZoom(1);
      setPan({ x: 0, y: 0 });

      // If user already has an activeCleanedImage, use it directly so past edits aren't lost!
      if (activeCleanedImage && activeCleanedImage !== rawImage) {
        setCleanedImage(activeCleanedImage);
        setCleanedDataUrl(activeCleanedImage.src);
        initCanvasWithImage(activeCleanedImage);
        setTransparencyPercent(50);
      } else {
        runBackgroundRemoval(tolerance, mode);
      }
    }
  }, [isOpen, rawImage, activeCleanedImage]);

  /**
   * When cleanedImage updates, sync to canvas
   */
  useEffect(() => {
    if (cleanedImage && canvasRef.current) {
      initCanvasWithImage(cleanedImage);
    }
  }, [cleanedImage, initCanvasWithImage]);

  // Handle tolerance change with quick 60ms debounce
  const handleToleranceChange = (newVal: number) => {
    setTolerance(newVal);
    if (mode === 'ai') return;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      runBackgroundRemoval(newVal, mode);
    }, 60);
  };

  // Handle mode switch
  const handleModeChange = (newMode: 'smart-border' | 'solid-color' | 'ai') => {
    setMode(newMode);
    runBackgroundRemoval(tolerance, newMode);
  };

  /**
   * Save canvas snapshot for Undo
   */
  const pushUndoSnapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    try {
      const snap = ctx.getImageData(0, 0, canvas.width, canvas.height);
      undoStackRef.current.push(snap);
      if (undoStackRef.current.length > 30) {
        undoStackRef.current.shift();
      }
      redoStackRef.current = [];
      setCanUndo(true);
      setCanRedo(false);
      setUndoCount(undoStackRef.current.length);
    } catch (err) {
      console.warn('Could not record undo state:', err);
    }
  };

  /**
   * Undo last eraser stroke (Ctrl+Z)
   */
  const handleUndo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || undoStackRef.current.length === 0) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    try {
      // Save current state to redo stack
      const currentSnap = ctx.getImageData(0, 0, canvas.width, canvas.height);
      redoStackRef.current.push(currentSnap);

      // Restore previous state
      const prevSnap = undoStackRef.current.pop()!;
      ctx.putImageData(prevSnap, 0, 0);

      const remainingUndo = undoStackRef.current.length;
      setCanUndo(remainingUndo > 0);
      setUndoCount(remainingUndo);
      setCanRedo(true);
      setEraserEditsCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.warn('Undo failed:', err);
    }
  }, []);

  /**
   * Redo undone eraser stroke (Ctrl+Y or Ctrl+Shift+Z)
   */
  const handleRedo = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || redoStackRef.current.length === 0) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    try {
      const currentSnap = ctx.getImageData(0, 0, canvas.width, canvas.height);
      undoStackRef.current.push(currentSnap);

      const nextSnap = redoStackRef.current.pop()!;
      ctx.putImageData(nextSnap, 0, 0);

      setCanUndo(true);
      setUndoCount(undoStackRef.current.length);
      setCanRedo(redoStackRef.current.length > 0);
      setEraserEditsCount(prev => prev + 1);
    } catch (err) {
      console.warn('Redo failed:', err);
    }
  }, []);

  /**
   * Reset eraser back to initial background-removed cutout
   */
  const handleResetEraser = () => {
    const canvas = canvasRef.current;
    if (!canvas || !initialImageDataRef.current) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    pushUndoSnapshot();
    ctx.putImageData(initialImageDataRef.current, 0, 0);
    setCleanedDataUrl(canvas.toDataURL('image/png'));
    setEraserEditsCount(0);
  };

  /**
   * Global Keyboard Shortcuts: Ctrl+Z (Undo), Ctrl+Y / Ctrl+Shift+Z (Redo), Escape
   */
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing inside text input
      const targetTag = (e.target as HTMLElement)?.tagName;
      if (targetTag === 'INPUT' || targetTag === 'TEXTAREA') return;

      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (isCmdOrCtrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if (isCmdOrCtrl && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      } else if (e.key === 'Escape') {
        if (isMaximized) {
          setIsMaximized(false);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isMaximized, handleUndo, handleRedo]);

  /**
   * Convert Pointer/Touch event coordinates to Canvas internal pixel coordinates
   */
  const getCanvasCoords = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    // Check if within bounds
    if (x < 0 || x > canvas.width || y < 0 || y > canvas.height) {
      return { x, y };
    }

    return { x, y };
  };

  /**
   * Perform erasing at given coordinates
   */
  const eraseAt = (
    currentX: number,
    currentY: number,
    lastX: number | null,
    lastY: number | null,
    shape: 'circle' | 'square'
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';

    if (shape === 'circle') {
      const radius = eraserSize / 2;
      // Stamp current circle
      ctx.beginPath();
      ctx.arc(currentX, currentY, radius, 0, Math.PI * 2);
      ctx.fillStyle = '#000000';
      ctx.fill();

      // If dragging, draw thick line between last point and current point
      if (lastX !== null && lastY !== null) {
        ctx.lineWidth = eraserSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(currentX, currentY);
        ctx.stroke();
      }
    } else {
      // SQUARE ERASER
      const halfSize = eraserSize / 2;
      // Stamp square
      ctx.fillRect(currentX - halfSize, currentY - halfSize, eraserSize, eraserSize);

      // If dragging, interpolate squares along path to prevent missed spots
      if (lastX !== null && lastY !== null) {
        const dx = currentX - lastX;
        const dy = currentY - lastY;
        const dist = Math.hypot(dx, dy);
        const step = Math.max(1, eraserSize / 4);
        const steps = Math.ceil(dist / step);

        for (let s = 1; s <= steps; s++) {
          const interpX = lastX + (dx * s) / steps;
          const interpY = lastY + (dy * s) / steps;
          ctx.fillRect(interpX - halfSize, interpY - halfSize, eraserSize, eraserSize);
        }
      }
    }

    ctx.restore();
  };

  /**
   * Pointer Down handler for drawing / panning
   */
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Left click or touch only
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    // In 'view' mode or when holding Alt / middle-click: PAN ONLY (Safe inspection mode!)
    if (activeTool === 'view' || e.altKey || e.buttons === 4) {
      setIsPanning(true);
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        panX: pan.x,
        panY: pan.y,
      };
      return;
    }

    // Eraser active (circle or square)
    const coords = getCanvasCoords(e.clientX, e.clientY);
    if (!coords) return;

    pushUndoSnapshot();
    isDrawingRef.current = true;
    lastDrawPosRef.current = coords;

    const shape = activeTool === 'square-eraser' ? 'square' : 'circle';
    eraseAt(coords.x, coords.y, null, null, shape);
  };

  /**
   * Pointer Move handler
   */
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    // Update live cursor position (exact clientX / clientY)
    setCursorPos({
      clientX: e.clientX,
      clientY: e.clientY,
      visible: true,
    });

    // Update screen scale for precise brush ring size when zooming
    const canvas = canvasRef.current;
    if (canvas && canvas.width > 0) {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0) {
        setCurrentScreenScale(rect.width / canvas.width);
      }
    }

    // Handle Panning
    if (isPanning) {
      const dx = e.clientX - panStartRef.current.x;
      const dy = e.clientY - panStartRef.current.y;
      setPan({
        x: panStartRef.current.panX + dx,
        y: panStartRef.current.panY + dy,
      });
      return;
    }

    // Handle Eraser Drawing
    if (!isDrawingRef.current) return;
    const coords = getCanvasCoords(e.clientX, e.clientY);
    if (!coords) return;

    const shape = activeTool === 'square-eraser' ? 'square' : 'circle';
    eraseAt(
      coords.x,
      coords.y,
      lastDrawPosRef.current ? lastDrawPosRef.current.x : null,
      lastDrawPosRef.current ? lastDrawPosRef.current.y : null,
      shape
    );

    lastDrawPosRef.current = coords;
  };

  /**
   * Pointer Up handler
   */
  const handlePointerUp = () => {
    if (isPanning) {
      setIsPanning(false);
    }
    if (isDrawingRef.current) {
      isDrawingRef.current = false;
      lastDrawPosRef.current = null;
      setEraserEditsCount(prev => prev + 1);
    }
  };

  /**
   * Zoom controls
   */
  const handleZoomIn = () => setZoom(prev => Math.min(5, Number((prev + 0.25).toFixed(2))));
  const handleZoomOut = () => setZoom(prev => Math.max(0.4, Number((prev - 0.25).toFixed(2))));
  const handleResetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  /**
   * Mouse Wheel for Zoom / Pan
   */
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.2 : -0.2;
      setZoom(prev => Math.max(0.4, Math.min(5, Number((prev + delta).toFixed(2)))));
    }
  };

  /**
   * Approve & finish
   */
  const handleApprove = () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      if (cleanedImage && cleanedDataUrl) {
        onApproveCleanedImage(cleanedImage, cleanedDataUrl);
      }
      return;
    }

    canvas.toBlob(blob => {
      if (!blob) {
        const fallbackUrl = canvas.toDataURL('image/png');
        const finalImg = new Image();
        finalImg.crossOrigin = 'anonymous';
        finalImg.onload = () => onApproveCleanedImage(finalImg, fallbackUrl);
        finalImg.src = fallbackUrl;
        return;
      }
      const objectUrl = URL.createObjectURL(blob);
      const finalImg = new Image();
      finalImg.crossOrigin = 'anonymous';
      finalImg.onload = () => {
        onApproveCleanedImage(finalImg, objectUrl);
      };
      finalImg.src = objectUrl;
    }, 'image/png');
  };

  if (!isOpen || !rawImage) return null;

  // Calculate visual cursor size in screen pixels (physically exact to cut area)
  const cursorScreenSize = Math.max(8, Math.round(eraserSize * currentScreenScale));

  // Determine backdrop styling for maximum contrast against cut marks
  const getBackdropStyle = () => {
    switch (backdropPattern) {
      case 'checker-dark':
        return {
          backgroundImage: 'repeating-conic-gradient(#1e293b 0% 25%, #0f172a 0% 50%)',
          backgroundSize: '24px 24px',
        };
      case 'checker-light':
        return {
          backgroundImage: 'repeating-conic-gradient(#cbd5e1 0% 25%, #ffffff 0% 50%)',
          backgroundSize: '24px 24px',
        };
      case 'neon':
        return {
          backgroundColor: '#090d16',
          backgroundImage: 'radial-gradient(#ec4899 1px, transparent 1px), radial-gradient(#06b6d4 1px, #090d16 1px)',
          backgroundSize: '20px 20px',
          backgroundPosition: '0 0, 10px 10px',
        };
      case 'pure-white':
        return { backgroundColor: '#ffffff' };
      default:
        return {
          backgroundImage: 'repeating-conic-gradient(#1e293b 0% 25%, #0f172a 0% 50%)',
          backgroundSize: '24px 24px',
        };
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-150 select-none ${
        isMaximized ? 'p-0' : 'p-2 sm:p-4'
      }`}
      onClick={() => {
        if (!isProcessing && !isMaximized) onClose();
      }}
    >
      <div
        className={`relative bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col transition-all duration-150 ${
          isMaximized
            ? 'w-screen h-screen max-w-none rounded-none border-none'
            : 'w-full max-w-7xl h-[94vh] rounded-2xl'
        }`}
        onClick={e => e.stopPropagation()}
      >
        {/* STEP HEADER WITH MAXIMIZE FULLSCREEN BUTTON */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50/95 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-600 text-white flex items-center justify-center shadow-xs">
              <Wand2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 uppercase tracking-wider">
                  Step 1: Background & Custom Cutout
                </span>
                <h3 className="text-base font-bold text-slate-900 leading-tight">
                  Background Removal & Precision Eraser
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Inspect your background cutout. When desired, activate the <strong className="text-slate-700">Circle</strong> or{' '}
                <strong className="text-slate-700">Square Eraser</strong> to touch up parts before vector outline creation.
              </p>
            </div>
          </div>

          {/* Right Header Controls: Maximize/Restore & Close */}
          <div className="flex items-center gap-2">
            {/* Maximize Fullscreen Toggle */}
            <button
              onClick={() => setIsMaximized(!isMaximized)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer shadow-2xs ${
                isMaximized
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              }`}
              title={isMaximized ? 'Restore to Standard Window (Esc)' : 'Maximize to Full Page for large drawing area'}
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

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
              title="Close (Keep Current)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* TOOLBAR CONTROLS: REMOVAL & ERASER */}
        <div className="px-5 py-2.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* LEFT: Removal Method Selector */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => handleModeChange('smart-border')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  mode === 'smart-border'
                    ? 'bg-white text-emerald-700 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Ultra-fast edge detection background removal (<50ms)"
              >
                <Wand2 className="w-3.5 h-3.5" />
                <span>⚡ Smart Border</span>
              </button>
              <button
                onClick={() => handleModeChange('solid-color')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  mode === 'solid-color'
                    ? 'bg-white text-emerald-700 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Chroma-key solid color background isolation"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>🎨 Solid Color</span>
              </button>
              <button
                onClick={() => handleModeChange('ai')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  mode === 'ai'
                    ? 'bg-white text-rose-700 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Gemini AI deep silhouette segmentation"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>✨ Gemini AI</span>
              </button>
            </div>

            {/* Tolerance Slider */}
            {mode !== 'ai' && (
              <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs">
                <span className="font-semibold text-slate-700 flex items-center gap-1">
                  <Sliders className="w-3 h-3 text-slate-500" />
                  Tol:
                </span>
                <input
                  type="range"
                  min="10"
                  max="90"
                  value={tolerance}
                  onChange={e => handleToleranceChange(Number(e.target.value))}
                  className="w-20 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
                />
                <span className="font-mono text-xs font-bold text-slate-800 w-6 text-right">
                  {tolerance}
                </span>
              </div>
            )}
          </div>

          {/* MIDDLE: ERASER TOOLS & VIEW/PAN TOGGLE (DEFAULT: VIEW & PAN) */}
          <div className="flex items-center gap-2 bg-emerald-50/70 p-1 rounded-xl border border-emerald-200/70 shadow-2xs">
            {/* Tool Selection: Safe View & Pan vs Erasers */}
            <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-emerald-100">
              {/* DEFAULT: View & Pan */}
              <button
                onClick={() => setActiveTool('view')}
                className={`px-2.5 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeTool === 'view'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
                title="Safe View & Pan Mode (Default): Navigate without erasing"
              >
                <Hand className="w-3.5 h-3.5" />
                <span>View & Pan</span>
              </button>

              {/* Circle Eraser */}
              <button
                onClick={() => {
                  setActiveTool('circle-eraser');
                  setViewMode('interactive');
                }}
                className={`px-2.5 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeTool === 'circle-eraser'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-emerald-800 hover:text-emerald-950 hover:bg-emerald-100/50'
                }`}
                title="Circle Eraser: Round tip for organic curves & smooth trimming"
              >
                <Circle className="w-3.5 h-3.5" />
                <span>Circle Eraser</span>
              </button>

              {/* Square Eraser */}
              <button
                onClick={() => {
                  setActiveTool('square-eraser');
                  setViewMode('interactive');
                }}
                className={`px-2.5 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeTool === 'square-eraser'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-emerald-800 hover:text-emerald-950 hover:bg-emerald-100/50'
                }`}
                title="Square Eraser: Crisp block tip for straight cuts & sharp corners"
              >
                <Square className="w-3.5 h-3.5" />
                <span>Square Eraser</span>
              </button>
            </div>

            {/* Eraser Size Controls (shown when eraser is active or hovered) */}
            <div className="flex items-center gap-1.5 pl-2 pr-1 border-l border-emerald-200">
              <span className="text-[10px] font-bold text-emerald-900 uppercase">Size:</span>
              <input
                type="range"
                min="6"
                max="220"
                value={eraserSize}
                onChange={e => setEraserSize(Number(e.target.value))}
                className="w-20 h-1.5 bg-emerald-200 rounded-lg appearance-none cursor-pointer accent-emerald-700"
              />
              <span className="font-mono text-xs font-bold text-emerald-900 w-10 text-right">
                {eraserSize}px
              </span>

              {/* Quick Size Presets */}
              <div className="hidden xl:flex items-center gap-1 ml-1">
                {[15, 35, 75, 140].map(sz => (
                  <button
                    key={sz}
                    onClick={() => setEraserSize(sz)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer transition-colors ${
                      eraserSize === sz
                        ? 'bg-emerald-700 text-white font-bold'
                        : 'bg-white/80 text-emerald-800 hover:bg-white'
                    }`}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </div>

            {/* UNDO / REDO WITH SHORTCUT (Ctrl+Z) AND STEP BADGE */}
            <div className="flex items-center gap-1 border-l border-emerald-200 pl-2">
              <button
                onClick={handleUndo}
                disabled={!canUndo}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-slate-700 hover:bg-white hover:text-emerald-700 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-all border border-transparent hover:border-slate-200"
                title="Undo Eraser Stroke (Ctrl+Z)"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>Undo</span>
                {undoCount > 0 && (
                  <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded-full text-[9px] font-mono font-bold">
                    {undoCount}
                  </span>
                )}
              </button>

              <button
                onClick={handleRedo}
                disabled={!canRedo}
                className="p-1.5 rounded-lg text-slate-700 hover:bg-white hover:text-emerald-700 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-all"
                title="Redo Eraser Stroke (Ctrl+Y or Ctrl+Shift+Z)"
              >
                <Redo2 className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={handleResetEraser}
                disabled={eraserEditsCount === 0 && !canUndo}
                className="p-1.5 rounded-lg text-slate-700 hover:bg-white hover:text-rose-600 disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-all"
                title="Reset all eraser strokes back to initial cutout"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* RIGHT: View Modes & Contrast Backdrop */}
          <div className="flex items-center gap-2">
            {/* Backdrop Contrast Selector */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
              <span className="text-[10px] font-bold text-slate-500 pl-1">Backdrop:</span>
              <button
                onClick={() => setBackdropPattern('checker-dark')}
                className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                  backdropPattern === 'checker-dark'
                    ? 'bg-slate-800 text-white shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Dark checkerboard backdrop"
              >
                ⬛ Dark
              </button>
              <button
                onClick={() => setBackdropPattern('checker-light')}
                className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                  backdropPattern === 'checker-light'
                    ? 'bg-white text-slate-900 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Light checkerboard backdrop"
              >
                🏁 Light
              </button>
              <button
                onClick={() => setBackdropPattern('neon')}
                className={`px-2 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                  backdropPattern === 'neon'
                    ? 'bg-purple-900 text-purple-100 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="High contrast neon dots"
              >
                ✨ Neon
              </button>
            </div>

            {/* View Modes (Interactive Cutout / Original / Split) */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
              <button
                onClick={() => setViewMode('interactive')}
                className={`px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1 transition-all cursor-pointer ${
                  viewMode === 'interactive'
                    ? 'bg-white text-slate-900 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Show editable transparent cutout"
              >
                <Eye className="w-3.5 h-3.5 text-emerald-600" />
                <span>Cutout</span>
              </button>
              <button
                onClick={() => setViewMode('original')}
                className={`px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1 transition-all cursor-pointer ${
                  viewMode === 'original'
                    ? 'bg-white text-slate-900 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Show original image"
              >
                <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                <span>Original</span>
              </button>
              <button
                onClick={() => setViewMode('split')}
                className={`px-2.5 py-1.5 rounded-lg font-medium flex items-center gap-1 transition-all cursor-pointer ${
                  viewMode === 'split'
                    ? 'bg-white text-slate-900 shadow-xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Side by side comparison"
              >
                <SplitSquareVertical className="w-3.5 h-3.5 text-indigo-600" />
                <span>Split</span>
              </button>
            </div>
          </div>
        </div>

        {/* MAIN PREVIEW & ERASER CANVAS AREA */}
        <div
          ref={containerRef}
          onWheel={handleWheel}
          className="flex-1 min-h-0 relative bg-slate-950 overflow-hidden flex items-center justify-center p-2 sm:p-3 select-none"
        >
          {/* Main Backdrop Container */}
          <div
            className={`relative w-full h-full rounded-xl border border-slate-700/60 overflow-hidden flex items-center justify-center shadow-inner ${
              activeTool === 'view'
                ? isPanning
                  ? 'cursor-grabbing'
                  : 'cursor-grab'
                : 'cursor-none'
            }`}
            style={getBackdropStyle()}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={() => {
              handlePointerUp();
              setCursorPos(prev => ({ ...prev, visible: false }));
            }}
          >
            {/* Loading Indicator */}
            {isProcessing && (
              <div className="absolute inset-0 z-30 bg-slate-950/75 backdrop-blur-xs flex flex-col items-center justify-center text-white gap-3">
                <div className="w-9 h-9 border-3 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-xs font-medium tracking-wide">
                  {mode === 'ai'
                    ? 'Gemini AI is analyzing contours (~2 sec)...'
                    : 'Applying high-speed local background isolation...'}
                </span>
              </div>
            )}

            {/* Error Message */}
            {errorMsg && (
              <div className="absolute top-4 left-4 z-40 bg-rose-900/90 text-rose-100 border border-rose-700 px-3 py-2 rounded-lg text-xs flex items-center gap-2 shadow-lg">
                <ShieldAlert className="w-4 h-4 text-rose-300 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* STATUS & INSTRUCTION PILL (CLEARLY INFORMS OF CURRENT TOOL) */}
            {viewMode === 'interactive' && (
              <div className="absolute top-3 left-3 z-20 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 px-3.5 py-2 rounded-xl text-slate-200 text-xs flex items-center gap-2.5 shadow-lg pointer-events-none">
                {activeTool === 'view' && (
                  <>
                    <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-pulse" />
                    <span className="font-semibold text-indigo-300">View & Pan Mode:</span>
                    <span className="text-slate-300">Image is safe. Click and drag to pan. Click Circle or Square Eraser above to start editing.</span>
                  </>
                )}
                {activeTool === 'circle-eraser' && (
                  <>
                    <Circle className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="font-semibold text-emerald-300">Circle Eraser Active:</span>
                    <span className="text-slate-300">Click & drag to erase. Vector outline will route around your cuts! (Ctrl+Z to Undo)</span>
                  </>
                )}
                {activeTool === 'square-eraser' && (
                  <>
                    <Square className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="font-semibold text-emerald-300">Square Eraser Active:</span>
                    <span className="text-slate-300">Click & drag for rectangular cuts and straight edges. (Ctrl+Z to Undo)</span>
                  </>
                )}
                {eraserEditsCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/30 text-emerald-300 font-mono text-[10px] font-bold border border-emerald-500/40">
                    {eraserEditsCount} {eraserEditsCount === 1 ? 'cut' : 'cuts'}
                  </span>
                )}
              </div>
            )}

            {/* ZOOM & VIEW FLOATING BAR */}
            <div className="absolute bottom-3 right-3 z-20 bg-slate-900/90 backdrop-blur-md border border-slate-700 px-2 py-1 rounded-xl text-slate-200 text-xs flex items-center gap-1.5 shadow-md">
              <button
                onClick={handleZoomOut}
                className="p-1 hover:bg-slate-800 rounded text-slate-300 hover:text-white cursor-pointer"
                title="Zoom Out"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleResetZoom}
                className="px-2 py-0.5 hover:bg-slate-800 rounded font-mono text-xs text-slate-300 hover:text-white cursor-pointer"
                title="Reset Zoom to 100%"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                onClick={handleZoomIn}
                className="p-1 hover:bg-slate-800 rounded text-slate-300 hover:text-white cursor-pointer"
                title="Zoom In"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleResetZoom}
                className="p-1 hover:bg-slate-800 rounded text-slate-300 hover:text-white cursor-pointer ml-1"
                title="Reset View"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* VIEW MODE 1: INTERACTIVE CANVAS WITH LIVE ERASER */}
            <div
              className={`relative flex items-center justify-center transition-transform duration-75 origin-center ${
                viewMode !== 'interactive' ? 'hidden' : ''
              }`}
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              }}
            >
              {/* Checkerboard Backdrop specifically under the image */}
              <div
                className="relative rounded-lg shadow-2xl overflow-hidden border border-slate-700/80"
                style={getBackdropStyle()}
              >
                <canvas
                  ref={canvasRef}
                  className="block max-w-[85vw] max-h-[76vh] object-contain drop-shadow-md select-none touch-none"
                />
              </div>
            </div>

            {/* VIEW MODE 2: SPLIT SIDE-BY-SIDE */}
            {viewMode === 'split' && (
              <div className="w-full h-full grid grid-cols-2 gap-3 p-3">
                {/* Left: Original */}
                <div className="relative rounded-lg bg-slate-800/80 border border-slate-700 flex flex-col items-center justify-center overflow-hidden p-2">
                  <div className="absolute top-2 left-2 z-10 bg-slate-900/90 text-slate-300 font-mono text-[10px] px-2 py-0.5 rounded border border-slate-700">
                    Original Image
                  </div>
                  <img
                    src={rawImage.src}
                    alt="Original"
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
                {/* Right: Cleaned Cutout */}
                <div
                  className="relative rounded-lg border border-emerald-500/40 flex flex-col items-center justify-center overflow-hidden p-2"
                  style={getBackdropStyle()}
                >
                  <div className="absolute top-2 left-2 z-10 bg-emerald-900/90 text-emerald-200 font-mono text-[10px] px-2 py-0.5 rounded border border-emerald-700">
                    Cutout (With Eraser Edits)
                  </div>
                  {cleanedDataUrl ? (
                    <img
                      src={cleanedDataUrl}
                      alt="Cutout"
                      className="max-w-full max-h-full object-contain drop-shadow-md"
                    />
                  ) : null}
                </div>
              </div>
            )}

            {/* VIEW MODE 3: ORIGINAL ONLY */}
            {viewMode === 'original' && (
              <div className="relative max-w-full max-h-full flex items-center justify-center p-2">
                <img
                  src={rawImage.src}
                  alt="Original"
                  className="max-w-full max-h-[78vh] object-contain rounded-lg shadow-xl"
                />
              </div>
            )}
          </div>
        </div>

        {/* ULTRA-VISIBLE, DUAL-RING ERASER BRUSH CURSOR OVERLAY */}
        {viewMode === 'interactive' &&
          cursorPos.visible &&
          (activeTool === 'circle-eraser' || activeTool === 'square-eraser') && (
            <div
              className="pointer-events-none fixed z-[9999] transition-none -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
              style={{
                left: `${cursorPos.clientX}px`,
                top: `${cursorPos.clientY}px`,
                width: `${cursorScreenSize}px`,
                height: `${cursorScreenSize}px`,
                borderRadius: activeTool === 'circle-eraser' ? '50%' : '3px',
                border: '2px solid #ffffff',
                boxShadow:
                  '0 0 0 1.5px rgba(0, 0, 0, 0.95), 0 0 10px rgba(16, 185, 129, 0.8), inset 0 0 0 1px rgba(0, 0, 0, 0.6)',
                backgroundColor:
                  activeTool === 'square-eraser'
                    ? 'rgba(239, 68, 68, 0.22)'
                    : 'rgba(16, 185, 129, 0.22)',
              }}
            >
              {/* Center Crosshair Dot for pixel-exact aim */}
              <div className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_2px_black]" />

              {/* Floating Size Label Badge */}
              <div className="absolute -top-5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-black/90 text-white font-mono text-[9px] font-bold border border-white/40 shadow-xs pointer-events-none whitespace-nowrap">
                {eraserSize}px
              </div>
            </div>
          )}

        {/* BOTTOM STEP APPROVAL FOOTER */}
        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* Metadata info */}
          <div className="flex items-center gap-3 text-xs text-slate-600 font-mono">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              <span>{transparencyPercent}% Background Removed</span>
            </span>
            <span className="text-slate-300">|</span>
            <span>Speed: {processingTimeMs} ms</span>
            <span className="text-slate-300">|</span>
            <span>
              {rawImage.naturalWidth || rawImage.width} × {rawImage.naturalHeight || rawImage.height} px
            </span>
            {eraserEditsCount > 0 && (
              <>
                <span className="text-slate-300">|</span>
                <span className="text-emerald-700 font-semibold flex items-center gap-1">
                  <Eraser className="w-3.5 h-3.5" />
                  <span>{eraserEditsCount} Eraser {eraserEditsCount === 1 ? 'Cut' : 'Cuts'} Applied</span>
                </span>
              </>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onKeepOriginalImage}
              className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-all cursor-pointer shadow-2xs"
            >
              Keep Original Background
            </button>

            <button
              type="button"
              disabled={isProcessing}
              onClick={handleApprove}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-xs font-bold shadow-md hover:shadow-lg transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>OK, Looks Good! Proceed to Vector Outline</span>
              <ArrowRight className="w-3.5 h-3.5 opacity-80" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
