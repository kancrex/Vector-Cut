/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { SidebarControls } from './components/SidebarControls';
import { CanvasViewport } from './components/CanvasViewport';
import { ExportModal } from './components/ExportModal';
import { ImagePreviewModal } from './components/ImagePreviewModal';
import { RemoveBackgroundModal } from './components/RemoveBackgroundModal';
import { BackgroundReviewModal } from './components/BackgroundReviewModal';
import {
  ImageDimensions,
  OutlineSettings,
  VectorResult,
} from './types';
import {
  calculatePhysicalDimensions,
  detectImageBorderOutline,
  detectOutlineWithAi,
} from './utils/vectorEngine';

// Default initial high-res graphic canvas generator
function createInitialImage(): string {
  const canvas = document.createElement('canvas');
  canvas.width = 1000;
  canvas.height = 1000;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 1000, 1000);

  ctx.save();
  ctx.translate(500, 500);

  // Clean botanical monstera shape
  ctx.fillStyle = '#16a34a';
  ctx.beginPath();
  ctx.moveTo(0, -360);
  ctx.bezierCurveTo(200, -360, 360, -180, 340, 60);
  ctx.bezierCurveTo(320, 200, 240, 320, 50, 390);
  ctx.lineTo(30, 440);
  ctx.lineTo(-30, 440);
  ctx.lineTo(-50, 390);
  ctx.bezierCurveTo(-240, 320, -320, 200, -340, 60);
  ctx.bezierCurveTo(-360, -180, -200, -360, 0, -360);
  ctx.closePath();
  ctx.fill();

  // Stem line
  ctx.strokeStyle = '#86efac';
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 420);
  ctx.quadraticCurveTo(10, 60, 0, -300);
  ctx.stroke();

  // Fenestrations (cutout holes)
  ctx.fillStyle = '#ffffff';
  const holes = [
    { x: 120, y: -150, w: 35, h: 140, rot: 0.5 },
    { x: 180, y: -10, w: 30, h: 120, rot: 0.8 },
    { x: 140, y: 140, w: 28, h: 110, rot: 1.1 },
    { x: -120, y: -150, w: 35, h: 140, rot: -0.5 },
    { x: -180, y: -10, w: 30, h: 120, rot: -0.8 },
    { x: -140, y: 140, w: 28, h: 110, rot: -1.1 },
  ];
  holes.forEach(h => {
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(h.rot);
    ctx.beginPath();
    ctx.ellipse(0, 0, h.w / 2, h.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  ctx.restore();
  return canvas.toDataURL('image/png');
}

export default function App() {
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isAiDetecting, setIsAiDetecting] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [detectionMode, setDetectionMode] = useState<'cv' | 'ai'>('cv');

  // Active Image & Detected Dimensions
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);
  const [dimensions, setDimensions] = useState<ImageDimensions>({
    pixelWidth: 1000,
    pixelHeight: 1000,
    aspectRatio: 1,
    detectedDpi: 300,
    physicalWidthMm: 84.7,
    physicalHeightMm: 84.7,
    physicalWidthIn: 3.33,
    physicalHeightIn: 3.33,
  });

  // Background Isolation & Step-by-Step Review States
  const [rawOriginalImage, setRawOriginalImage] = useState<HTMLImageElement | null>(null);
  const [cleanedImage, setCleanedImage] = useState<HTMLImageElement | null>(null);
  const [isBackgroundRemoved, setIsBackgroundRemoved] = useState<boolean>(false);
  const [isRemovingBackground, setIsRemovingBackground] = useState<boolean>(false);
  const [isAskingRemoveBgOpen, setIsAskingRemoveBgOpen] = useState<boolean>(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState<boolean>(false);

  const [pendingUpload, setPendingUpload] = useState<{
    img: HTMLImageElement;
    file: File;
    dataUrl: string;
    dims: ImageDimensions;
  } | null>(null);

  const [autoRemoveBg, setAutoRemoveBg] = useState<boolean>(() => {
    return localStorage.getItem('vectorcut_auto_remove_bg') === 'true';
  });

  // Border outline, geometric shape & line thickness settings
  const [settings, setSettings] = useState<OutlineSettings>({
    threshold: 235,
    invertThreshold: false,
    bgMode: 'auto',
    lineThickness: 1.5, // 1.5 pt
    lineColor: '#000000',
    dieCutOffsetMm: 2.0, // +2 mm cardstock margin
    smoothing: 5,
    shapeType: 'auto', // Auto detects Square vs Rectangle vs Circle vs Oval vs Die-Cut
    cornerRadiusMm: 0, // Sharp 90° corners for rectangle/square
    symmetryLock: false, // Default false to faithfully preserve all natural curves of die-cut images
  });

  // Computed vector outline result
  const [vectorResult, setVectorResult] = useState<VectorResult | null>(null);

  // Initialize initial image on mount
  useEffect(() => {
    const dataUrl = createInitialImage();
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setImageElement(img);
      setRawOriginalImage(img);
      const dims = calculatePhysicalDimensions(img.width, img.height, 300);
      setDimensions(dims);
    };
    img.src = dataUrl;
  }, []);

  /**
   * Executes vector outline generation on an approved image.
   * Performs automatic shape classification (Square, Rectangle, Die-Cut, Circle)
   * and creates razor-sharp geometric cuts or smooth die-cut curves.
   */
  const executeOutlineOnImage = async (img: HTMLImageElement, dims: ImageDimensions) => {
    setIsLoading(true);
    setAiError(null);
    setImageElement(img);

    try {
      if (detectionMode === 'ai') {
        setIsAiDetecting(true);
        const aiRes = await detectOutlineWithAi(img, settings, dims);
        setVectorResult(aiRes);
      } else {
        const res = await detectImageBorderOutline(img, settings, dims);
        if (!res.outerContours || res.outerContours.length === 0) {
          console.log('CV found no clean outline; activating Gemini AI auto-detection...');
          setIsAiDetecting(true);
          const aiRes = await detectOutlineWithAi(img, settings, dims);
          setVectorResult(aiRes);
          setDetectionMode('ai');
        } else {
          setVectorResult(res);
        }
      }
    } catch (err: any) {
      console.warn('Initial outline attempt failed, trying Gemini AI fallback:', err);
      try {
        setIsAiDetecting(true);
        const aiRes = await detectOutlineWithAi(img, settings, dims);
        setVectorResult(aiRes);
        setDetectionMode('ai');
      } catch (aiErr: any) {
        console.error('Gemini fallback error:', aiErr);
        setAiError(aiErr.message || 'Detection failed. Please check image contrast.');
      }
    } finally {
      setIsLoading(false);
      setIsAiDetecting(false);
    }
  };

  /**
   * Upload handler with initial asking option to remove the background
   */
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAiError(null);
    const reader = new FileReader();
    reader.onload = event => {
      const dataUrl = event.target?.result as string;
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const naturalW = img.naturalWidth || img.width || 1000;
        const naturalH = img.naturalHeight || img.height || 1000;
        const dims = calculatePhysicalDimensions(naturalW, naturalH, 300);
        setDimensions(dims);
        setRawOriginalImage(img);
        setCleanedImage(null);

        const uploadData = {
          img,
          file,
          dataUrl,
          dims,
        };
        setPendingUpload(uploadData);

        if (autoRemoveBg) {
          // Open Step 1 Review Modal immediately so user inspects preview before outline
          setIsReviewModalOpen(true);
        } else {
          // First ask user: Remove Background & Inspect Cutout vs Keep Original
          setIsAskingRemoveBgOpen(true);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  /**
   * User chose "Remove Background & Preview" in upload dialog:
   * Opens Step 1: BackgroundReviewModal where user sees the cutout preview first!
   */
  const handleConfirmRemoveBg = (rememberChoice: boolean) => {
    if (rememberChoice) {
      setAutoRemoveBg(true);
      localStorage.setItem('vectorcut_auto_remove_bg', 'true');
    }
    setIsAskingRemoveBgOpen(false);
    setIsReviewModalOpen(true);
  };

  /**
   * User chose "Keep Original Background" in upload dialog
   */
  const handleConfirmKeepOriginal = (rememberChoice: boolean) => {
    if (rememberChoice) {
      setAutoRemoveBg(false);
      localStorage.setItem('vectorcut_auto_remove_bg', 'false');
    }
    setIsAskingRemoveBgOpen(false);
    if (pendingUpload) {
      setIsBackgroundRemoved(false);
      executeOutlineOnImage(pendingUpload.img, pendingUpload.dims);
    }
  };

  /**
   * STEP 1 APPROVAL: User inspected the cutout, is happy with the result,
   * and clicked "OK, Looks Good! Proceed to Vector Outline".
   */
  const handleApproveCleanedImage = (cleanedImg: HTMLImageElement, _dataUrl: string) => {
    setCleanedImage(cleanedImg);
    setImageElement(cleanedImg);
    setIsBackgroundRemoved(true);
    setIsReviewModalOpen(false);

    // Now execute outline generation on the approved transparent image!
    executeOutlineOnImage(cleanedImg, dimensions);
  };

  /**
   * User chose to keep original image inside review modal
   */
  const handleReviewModalKeepOriginal = () => {
    setIsReviewModalOpen(false);
    if (rawOriginalImage) {
      setImageElement(rawOriginalImage);
      setIsBackgroundRemoved(false);
      executeOutlineOnImage(rawOriginalImage, dimensions);
    }
  };

  // Run AI Precision Outline
  const handleRunAiOutline = async () => {
    if (!imageElement) return;
    setIsAiDetecting(true);
    setAiError(null);
    try {
      const result = await detectOutlineWithAi(imageElement, settings, dimensions);
      setVectorResult(result);
      setDetectionMode('ai');
    } catch (err: any) {
      console.error('AI outline failed:', err);
      setAiError(err.message || 'AI detection failed. Falling back to Computer Vision.');
    } finally {
      setIsAiDetecting(false);
    }
  };

  const handleResetToCv = useCallback(async () => {
    if (!imageElement) return;
    setDetectionMode('cv');
    setAiError(null);
    try {
      const res = await detectImageBorderOutline(imageElement, settings, dimensions);
      setVectorResult(res);
    } catch (err) {
      console.error('CV Outline error:', err);
    }
  }, [imageElement, settings, dimensions]);

  // Open Step 1 Review Modal anytime from Sidebar or Canvas
  const handleOpenReviewModal = () => {
    setIsReviewModalOpen(true);
  };

  const handleToggleOriginalBackground = () => {
    if (isBackgroundRemoved) {
      if (rawOriginalImage) {
        setImageElement(rawOriginalImage);
        setIsBackgroundRemoved(false);
      }
    } else {
      if (cleanedImage) {
        setImageElement(cleanedImage);
        setIsBackgroundRemoved(true);
      }
    }
  };

  const handleToggleAutoRemoveBg = (val: boolean) => {
    setAutoRemoveBg(val);
    localStorage.setItem('vectorcut_auto_remove_bg', val ? 'true' : 'false');
  };

  const handleOpenRemoveBgDialog = () => {
    if (rawOriginalImage || imageElement) {
      const currentImg = rawOriginalImage || imageElement!;
      setPendingUpload({
        img: currentImg,
        file: new File([], 'current-image.png'),
        dataUrl: currentImg.src,
        dims: dimensions,
      });
      setIsAskingRemoveBgOpen(true);
    }
  };

  // Re-run border outline detection when settings or dimensions change
  useEffect(() => {
    if (!imageElement) return;
    if (detectionMode === 'ai') return;

    const timer = setTimeout(async () => {
      try {
        const res = await detectImageBorderOutline(imageElement, settings, dimensions);
        setVectorResult(res);
      } catch (err) {
        console.error('Outline detection error:', err);
      }
    }, 80);

    return () => clearTimeout(timer);
  }, [
    imageElement,
    detectionMode,
    settings.bgMode,
    settings.threshold,
    settings.invertThreshold,
    settings.dieCutOffsetMm,
    settings.smoothing,
    settings.shapeType,
    settings.cornerRadiusMm,
    dimensions.physicalWidthMm,
    dimensions.pixelWidth,
    dimensions.pixelHeight,
  ]);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-white text-slate-900 font-sans antialiased">
      {/* Crisp White Top Bar */}
      <Header
        onOpenPreview={() => setIsPreviewOpen(true)}
        onOpenExport={() => setIsExportOpen(true)}
        detectedDpi={dimensions.detectedDpi}
        physicalSize={`${dimensions.physicalWidthMm} × ${dimensions.physicalHeightMm} mm`}
      />

      {/* Main Studio Viewport */}
      <div className="flex-1 flex overflow-hidden relative">
        <SidebarControls
          dimensions={dimensions}
          setDimensions={setDimensions}
          settings={settings}
          setSettings={setSettings}
          onFileUpload={handleFileUpload}
          onRunAiOutline={handleRunAiOutline}
          isAiDetecting={isAiDetecting}
          aiError={aiError}
          detectionMode={detectionMode}
          onResetToCv={handleResetToCv}
          onRemoveBackground={handleOpenReviewModal}
          isRemovingBackground={isRemovingBackground}
          isBackgroundRemoved={isBackgroundRemoved}
          onToggleOriginalBackground={handleToggleOriginalBackground}
          autoRemoveBg={autoRemoveBg}
          onToggleAutoRemoveBg={handleToggleAutoRemoveBg}
          onOpenRemoveBgDialog={handleOpenRemoveBgDialog}
          detectedShape={vectorResult?.detectedShape}
        />

        <CanvasViewport
          imageElement={imageElement}
          dimensions={dimensions}
          settings={settings}
          vectorResult={vectorResult}
          isLoading={isLoading || isAiDetecting || isRemovingBackground}
          onOpenPreview={() => setIsPreviewOpen(true)}
          onRunAiOutline={handleRunAiOutline}
          isAiDetecting={isAiDetecting}
          isBackgroundRemoved={isBackgroundRemoved}
          onRemoveBackground={handleOpenReviewModal}
          isRemovingBackground={isRemovingBackground}
        />
      </div>

      {/* Asking Option Modal: Remove Background vs Keep Original on Upload */}
      <RemoveBackgroundModal
        isOpen={isAskingRemoveBgOpen}
        onClose={() => setIsAskingRemoveBgOpen(false)}
        imagePreviewUrl={pendingUpload?.dataUrl || ''}
        imageDimensions={{
          width: pendingUpload?.dims.pixelWidth || dimensions.pixelWidth,
          height: pendingUpload?.dims.pixelHeight || dimensions.pixelHeight,
        }}
        fileName={pendingUpload?.file.name}
        onConfirmRemoveBg={handleConfirmRemoveBg}
        onConfirmKeepOriginal={handleConfirmKeepOriginal}
        isProcessing={isRemovingBackground || isLoading}
      />

      {/* STEP 1: Dedicated Background Removal & Inspection Screen (covers ~80% of screen) */}
      <BackgroundReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        rawImage={rawOriginalImage || imageElement}
        activeCleanedImage={cleanedImage}
        fileName={pendingUpload?.file.name}
        onApproveCleanedImage={handleApproveCleanedImage}
        onKeepOriginalImage={handleReviewModalKeepOriginal}
      />

      {/* Image & Outline Preview Pop-Up Screen (covers 80%+ with X button) */}
      <ImagePreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        imageElement={imageElement}
        dimensions={dimensions}
        settings={settings}
        vectorResult={vectorResult}
        isBackgroundRemoved={isBackgroundRemoved}
      />

      {/* Export Print PDF Modal */}
      <ExportModal
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        dimensions={dimensions}
        settings={settings}
        vectorResult={vectorResult}
      />
    </div>
  );
}
