export type ResolutionDpi = 150 | 300 | 600;

export type ShapeCategory = 'auto' | 'square' | 'rectangle' | 'circle' | 'oval' | 'die-cut';

export interface ImageDimensions {
  pixelWidth: number;
  pixelHeight: number;
  aspectRatio: number;
  detectedDpi: number;
  physicalWidthMm: number;
  physicalHeightMm: number;
  physicalWidthIn: number;
  physicalHeightIn: number;
}

export interface OutlineSettings {
  threshold: number; // 0 - 255 for border detection
  invertThreshold: boolean;
  bgMode: 'auto' | 'light' | 'dark' | 'transparent';
  lineThickness: number; // in points (pt), e.g. 0.25 to 12 pt
  lineColor: string; // hex
  dieCutOffsetMm: number; // 0 mm (tight) to 10 mm (card stock offset)
  smoothing: number; // 1 to 10 (curve smoothing factor)
  shapeType: ShapeCategory; // 'auto' | 'square' | 'rectangle' | 'circle' | 'oval' | 'die-cut'
  cornerRadiusMm: number; // For rectangle/square (0 = sharp 90 deg, >0 = rounded corners)
  symmetryLock: boolean; // Enforce bilateral symmetry on round/balloon/die-cut shapes
}

export interface Point {
  x: number;
  y: number;
}

export interface VectorPath {
  points: Point[];
  isHole: boolean;
  svgPath: string;
}

export interface VectorResult {
  outerContours: VectorPath[];
  offsetContour: VectorPath[];
  totalCutLengthMm: number;
  totalCutLengthIn: number;
  detectedShape: 'square' | 'rectangle' | 'circle' | 'oval' | 'die-cut';
  shapeConfidence?: number;
  shapeDetails?: {
    widthMm: number;
    heightMm: number;
    aspectRatio: number;
    fillRatio: number;
  };
  boundingBox: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    widthMm: number;
    heightMm: number;
  };
}
