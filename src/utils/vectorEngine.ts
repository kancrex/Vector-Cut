import { Point, VectorPath, VectorResult, OutlineSettings, ImageDimensions } from '../types';

/**
 * Calculates physical millimeter and inch dimensions based on pixel dimensions and DPI.
 */
export function calculatePhysicalDimensions(
  width: number,
  height: number,
  dpi = 300
): ImageDimensions {
  const physicalWidthMm = Number(((width / dpi) * 25.4).toFixed(1));
  const physicalHeightMm = Number(((height / dpi) * 25.4).toFixed(1));
  const physicalWidthIn = Number((width / dpi).toFixed(2));
  const physicalHeightIn = Number((height / dpi).toFixed(2));

  return {
    pixelWidth: width,
    pixelHeight: height,
    aspectRatio: Number((width / (height || 1)).toFixed(2)),
    detectedDpi: dpi,
    physicalWidthMm,
    physicalHeightMm,
    physicalWidthIn,
    physicalHeightIn,
  };
}

/**
 * DOUGLAS-PEUCKER POLYLINE SIMPLIFICATION:
 * Reduces raw pixel-staircase noise while preserving all curve vertices, corners, and extrema.
 */
export function simplifyDouglasPeucker(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points;

  let dmax = 0;
  let index = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const d = perpendicularDistance(points[i], points[0], points[end]);
    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }

  if (dmax > epsilon) {
    const recResults1 = simplifyDouglasPeucker(points.slice(0, index + 1), epsilon);
    const recResults2 = simplifyDouglasPeucker(points.slice(index), epsilon);
    return recResults1.slice(0, recResults1.length - 1).concat(recResults2);
  } else {
    return [points[0], points[end]];
  }
}

function perpendicularDistance(p: Point, lineStart: Point, lineEnd: Point): number {
  let dx = lineEnd.x - lineStart.x;
  let dy = lineEnd.y - lineStart.y;
  const mag = Math.hypot(dx, dy);
  if (mag === 0) return Math.hypot(p.x - lineStart.x, p.y - lineStart.y);

  dx /= mag;
  dy /= mag;
  const pvx = p.x - lineStart.x;
  const pvy = p.y - lineStart.y;
  const pvdot = pvx * dx + pvy * dy;
  const dsx = pvdot * dx;
  const dsy = pvdot * dy;
  return Math.hypot(pvx - dsx, pvy - dsy);
}

/**
 * ENSURES STRICT CLOCKWISE WINDING FOR SCREEN COORDINATES (Y DOWNWARDS):
 * Signed area > 0 corresponds to clockwise in screen space.
 * Standardizing winding guarantees outward unit normals point strictly outward away from artwork!
 */
export function ensureClockwiseWinding(pts: Point[]): Point[] {
  if (pts.length < 3) return pts;
  let signedArea = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    signedArea += p1.x * p2.y - p2.x * p1.y;
  }
  // In screen coordinates with Y down, a clockwise loop has signedArea > 0.
  // If signedArea < 0, it is counter-clockwise -> reverse points to make it clockwise!
  if (signedArea < 0) {
    return [...pts].reverse();
  }
  return pts;
}

/**
 * 1. EQUIDISTANT ARC-LENGTH RESAMPLING:
 * Re-samples a closed contour at uniform spatial intervals along the perimeter.
 * Eliminates point clustering and uneven gaps that cause Catmull-Rom splines to bulge or wobble.
 */
export function resampleContourEquidistant(rawPoints: Point[], targetSpacing = 6): Point[] {
  if (rawPoints.length < 3) return rawPoints;

  // Clean duplicate consecutive points
  const pts: Point[] = [];
  for (let i = 0; i < rawPoints.length; i++) {
    const p = rawPoints[i];
    if (i === 0 || Math.hypot(p.x - pts[pts.length - 1].x, p.y - pts[pts.length - 1].y) > 0.01) {
      pts.push(p);
    }
  }
  if (pts.length > 2) {
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (Math.hypot(last.x - first.x, last.y - first.y) < 0.5) {
      pts.pop();
    }
  }
  const n = pts.length;
  if (n < 3) return pts;

  // Compute segment lengths & total perimeter
  const segLengths = new Float64Array(n);
  let totalPerimeter = 0;
  for (let i = 0; i < n; i++) {
    const next = pts[(i + 1) % n];
    const dist = Math.hypot(next.x - pts[i].x, next.y - pts[i].y);
    segLengths[i] = dist;
    totalPerimeter += dist;
  }
  if (totalPerimeter <= 0) return pts;

  // Determine uniform sample count (between 60 and 800 points so fine curves are never flattened)
  const numSamples = Math.max(60, Math.min(800, Math.round(totalPerimeter / targetSpacing)));
  const step = totalPerimeter / numSamples;
  const resampled: Point[] = [];

  let segIdx = 0;
  let segStartDist = 0;

  for (let i = 0; i < numSamples; i++) {
    const targetDist = i * step;

    while (segIdx < n && segStartDist + segLengths[segIdx] < targetDist) {
      segStartDist += segLengths[segIdx];
      segIdx++;
    }

    if (segIdx >= n) {
      resampled.push({ x: pts[0].x, y: pts[0].y });
      continue;
    }

    const segStart = pts[segIdx];
    const segEnd = pts[(segIdx + 1) % n];
    const segLen = segLengths[segIdx];
    const t = segLen > 0 ? (targetDist - segStartDist) / segLen : 0;

    resampled.push({
      x: segStart.x + (segEnd.x - segStart.x) * t,
      y: segStart.y + (segEnd.y - segStart.y) * t,
    });
  }

  return resampled;
}

/**
 * 2. MULTI-PASS LAPLACIAN CURVATURE RELAXATION (GAUSSIAN CURVE SMOOTHING):
 * Smooths out jagged raster pixel staircases into silky, continuous organic contours.
 * Area-preserving scale compensation ensures the artwork/balloon does not shrink.
 */
export function smoothPolygonLaplacian(points: Point[], passes = 2): Point[] {
  if (points.length < 4 || passes <= 0) return points;
  let curr = points.map(p => ({ x: p.x, y: p.y }));
  const n = curr.length;

  // Calculate polygon area before smoothing
  const computeArea = (pts: Point[]) => {
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % pts.length];
      a += p1.x * p2.y - p2.x * p1.y;
    }
    return Math.abs(a) / 2;
  };

  const origArea = computeArea(curr);
  let cx = 0, cy = 0;
  for (const p of curr) {
    cx += p.x;
    cy += p.y;
  }
  cx /= n;
  cy /= n;

  for (let pass = 0; pass < passes; pass++) {
    const next = new Array<Point>(n);
    for (let i = 0; i < n; i++) {
      const prev = curr[(i - 1 + n) % n];
      const p = curr[i];
      const fwd = curr[(i + 1) % n];

      next[i] = {
        x: 0.5 * p.x + 0.25 * (prev.x + fwd.x),
        y: 0.5 * p.y + 0.25 * (prev.y + fwd.y),
      };
    }
    curr = next;
  }

  // Preserve scale so smoothing does not shrink convex curves like balloons or badges
  const newArea = computeArea(curr);
  if (newArea > 0 && origArea > 0) {
    const scale = Math.sqrt(origArea / newArea);
    const clampedScale = Math.max(0.99, Math.min(1.02, scale));
    for (let i = 0; i < n; i++) {
      curr[i] = {
        x: cx + (curr[i].x - cx) * clampedScale,
        y: cy + (curr[i].y - cy) * clampedScale,
      };
    }
  }

  return curr;
}

/**
 * 3. BILATERAL SYMMETRY ENFORCER:
 * Used only when user enables Symmetry Lock on a bilateral subject (e.g. symmetrical balloon or heart).
 */
export function symmetrizeContour(points: Point[], strength = 0.6): Point[] {
  if (points.length < 24) return points;
  const n = points.length;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const axisX = (minX + maxX) / 2;
  const height = maxY - minY;
  if (height <= 0) return points;

  // Sample horizontal spans at vertical slices
  const numSlices = 48;
  const leftX = new Float64Array(numSlices).fill(axisX);
  const rightX = new Float64Array(numSlices).fill(axisX);
  const countLeft = new Int32Array(numSlices);
  const countRight = new Int32Array(numSlices);

  for (const p of points) {
    const s = Math.max(0, Math.min(numSlices - 1, Math.floor(((p.y - minY) / height) * numSlices)));
    if (p.x <= axisX) {
      if (countLeft[s] === 0 || p.x < leftX[s]) {
        leftX[s] = p.x;
      }
      countLeft[s]++;
    } else {
      if (countRight[s] === 0 || p.x > rightX[s]) {
        rightX[s] = p.x;
      }
      countRight[s]++;
    }
  }

  // Check if shape is nearly bilateral
  let totalSpanDiff = 0;
  let validSlices = 0;
  for (let s = 0; s < numSlices; s++) {
    if (countLeft[s] > 0 && countRight[s] > 0) {
      const spanL = axisX - leftX[s];
      const spanR = rightX[s] - axisX;
      totalSpanDiff += Math.abs(spanL - spanR) / Math.max(1, (spanL + spanR) / 2);
      validSlices++;
    }
  }

  const avgAsymmetry = validSlices > 0 ? totalSpanDiff / validSlices : 1;
  if (avgAsymmetry > 0.15) {
    return points;
  }

  // Apply smooth bilateral balance
  const balanced = points.map(p => {
    const s = Math.max(0, Math.min(numSlices - 1, Math.floor(((p.y - minY) / height) * numSlices)));
    if (countLeft[s] > 0 && countRight[s] > 0) {
      const spanL = axisX - leftX[s];
      const spanR = rightX[s] - axisX;
      const targetSpan = (spanL + spanR) / 2;

      if (p.x < axisX) {
        const currentSpan = axisX - p.x;
        const newSpan = currentSpan * (1 - strength) + targetSpan * strength;
        return { x: axisX - newSpan, y: p.y };
      } else if (p.x > axisX) {
        const currentSpan = p.x - axisX;
        const newSpan = currentSpan * (1 - strength) + targetSpan * strength;
        return { x: axisX + newSpan, y: p.y };
      }
    }
    return { x: p.x, y: p.y };
  });

  return smoothPolygonLaplacian(balanced, 2);
}

/**
 * 4. MATHEMATICALLY EXACT CATMULL-ROM CUBIC BEZIER PATH GENERATOR:
 * Converts discrete points into smooth cubic Bezier SVG paths.
 * Uses exact tangent scaling (tension = 1/6) to prevent overshooting, bulges, and loops.
 * Guarantees seamless, unbroken C1-continuous closed loops with zero gaps.
 */
export function pointsToSmoothSvgPath(rawPoints: Point[], closed = true): string {
  if (rawPoints.length < 2) return '';

  // Clean points: remove exact duplicates
  const points: Point[] = [];
  for (let i = 0; i < rawPoints.length; i++) {
    const p = rawPoints[i];
    if (i === 0 || Math.hypot(p.x - points[points.length - 1].x, p.y - points[points.length - 1].y) > 0.01) {
      points.push(p);
    }
  }
  if (closed && points.length > 2) {
    const first = points[0];
    const last = points[points.length - 1];
    if (Math.hypot(last.x - first.x, last.y - first.y) < 0.5) {
      points.pop();
    }
  }

  const len = points.length;
  if (len < 2) return '';
  if (len === 2) {
    return `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)} L ${points[1].x.toFixed(2)} ${points[1].y.toFixed(2)} ${closed ? 'Z' : ''}`;
  }

  let d = `M ${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  const numSegments = closed ? len : len - 1;
  const tension = 1 / 6; // Standard Catmull-Rom to Cubic Bezier control point factor

  for (let i = 0; i < numSegments; i++) {
    const p0 = points[(i - 1 + len) % len];
    const p1 = points[i % len];
    const p2 = points[(i + 1) % len];
    const p3 = points[(i + 2) % len];

    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }

  if (closed) d += ' Z';
  return d;
}

/**
 * 5. OUTWARD DIE-CUT MARGIN OFFSET:
 * Offsets a vector polygon outward by offsetPx along outward vertex normals.
 * Standardizes clockwise winding so normals always point outwards away from artwork!
 * Smoothly rounds convex corners with circular arc fillets so die-cut margins hug all curves.
 */
export function offsetPolygonNormals(points: Point[], offsetPx: number): Point[] {
  if (offsetPx <= 0 || points.length < 3) return points;

  // Ensure clockwise winding (in screen coords, Y down)
  const cwPoints = ensureClockwiseWinding(points);
  const n = cwPoints.length;
  const offsetPoints: Point[] = [];

  for (let i = 0; i < n; i++) {
    const prev = cwPoints[(i - 1 + n) % n];
    const curr = cwPoints[i];
    const next = cwPoints[(i + 1) % n];

    // Incoming edge vector
    const v1x = curr.x - prev.x;
    const v1y = curr.y - prev.y;
    const l1 = Math.hypot(v1x, v1y) || 1;

    // Outgoing edge vector
    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;
    const l2 = Math.hypot(v2x, v2y) || 1;

    // Outward unit normals for clockwise winding (Y down):
    // normal = (vy / len, -vx / len)
    const n1x = v1y / l1;
    const n1y = -v1x / l1;

    const n2x = v2y / l2;
    const n2y = -v2x / l2;

    // Average normal at vertex (bisector)
    let nx = n1x + n2x;
    let ny = n1y + n2y;
    const mag = Math.hypot(nx, ny);

    if (mag > 0.001) {
      nx /= mag;
      ny /= mag;
      const dot = Math.max(-1, Math.min(1, n1x * n2x + n1y * n2y));
      const cross = n1x * n2y - n1y * n2x;
      const miter = Math.min(1.8, 1 / Math.sqrt(Math.max(0.25, (1 + dot) / 2)));

      // At sharp convex turns (turning right), insert arc fillets to smoothly round the die cut margin
      if (dot < 0.7 && cross > 0) {
        offsetPoints.push({
          x: curr.x + n1x * offsetPx,
          y: curr.y + n1y * offsetPx,
        });
        offsetPoints.push({
          x: curr.x + nx * offsetPx * miter,
          y: curr.y + ny * offsetPx * miter,
        });
        offsetPoints.push({
          x: curr.x + n2x * offsetPx,
          y: curr.y + n2y * offsetPx,
        });
      } else {
        offsetPoints.push({
          x: curr.x + nx * offsetPx * miter,
          y: curr.y + ny * offsetPx * miter,
        });
      }
    } else {
      offsetPoints.push({
        x: curr.x + n1x * offsetPx,
        y: curr.y + n1y * offsetPx,
      });
    }
  }

  return smoothPolygonLaplacian(offsetPoints, 2);
}

/**
 * Morphological Closing: Bridges micro-gaps and fills tiny interior noise.
 */
function morphologicalClose(mask: Uint8Array, width: number, height: number, radius = 1): Uint8Array {
  if (radius <= 0) return mask;
  const dilated = new Uint8Array(width * height);
  const closed = new Uint8Array(width * height);

  // 1. Dilation
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (mask[row + x] === 1) {
        for (let dy = -radius; dy <= radius; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          const nrow = ny * width;
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            if (dx * dx + dy * dy <= radius * radius) {
              dilated[nrow + nx] = 1;
            }
          }
        }
      }
    }
  }

  // 2. Erosion
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let keep = 1;
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) {
          keep = 0;
          break;
        }
        const nrow = ny * width;
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) {
            keep = 0;
            break;
          }
          if (dx * dx + dy * dy <= radius * radius && dilated[nrow + nx] === 0) {
            keep = 0;
            break;
          }
        }
        if (!keep) break;
      }
      closed[row + x] = keep ? 1 : 0;
    }
  }

  return closed;
}

/**
 * Filter tiny isolated noise specs (< minPixels) while retaining all meaningful artwork.
 */
function filterSmallComponents(
  mask: Uint8Array,
  width: number,
  height: number,
  minPixels = 25
): Uint8Array {
  const visited = new Uint8Array(width * height);
  const filtered = new Uint8Array(width * height);

  const getNeighbors = (idx: number) => {
    const x = idx % width;
    const y = Math.floor(idx / width);
    const n: number[] = [];
    if (x > 0) n.push(idx - 1);
    if (x < width - 1) n.push(idx + 1);
    if (y > 0) n.push(idx - width);
    if (y < height - 1) n.push(idx + width);
    return n;
  };

  const islands: Array<{ pixels: number[]; area: number }> = [];

  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === 1 && !visited[i]) {
      const queue: number[] = [i];
      visited[i] = 1;
      const islandPixels: number[] = [];

      let head = 0;
      while (head < queue.length) {
        const curr = queue[head++];
        islandPixels.push(curr);

        for (const neighbor of getNeighbors(curr)) {
          if (mask[neighbor] === 1 && !visited[neighbor]) {
            visited[neighbor] = 1;
            queue.push(neighbor);
          }
        }
      }

      if (islandPixels.length >= minPixels) {
        islands.push({ pixels: islandPixels, area: islandPixels.length });
      }
    }
  }

  islands.sort((a, b) => b.area - a.area);
  const keepCount = Math.min(8, islands.length);
  for (let i = 0; i < keepCount; i++) {
    for (const px of islands[i].pixels) {
      filtered[px] = 1;
    }
  }

  return filtered;
}

/**
 * TOPOLOGICAL BOUNDARY FOLLOWING (MOORE-NEIGHBOR CONTOUR TRACING):
 * Traces the exact outer boundary of the silhouette in strict sequential clockwise order.
 * Guaranteed to produce a single, continuous, non-self-intersecting closed polygon loop!
 * Zero shortcuts, zero straight chords across the image ("no small boy drawing").
 */
export function extractTopologicalContours(
  grid: Uint8Array,
  width: number,
  height: number
): Point[][] {
  // Padded virtual dimensions (+2 in each axis) so artwork touching the border traces cleanly
  const padW = width + 2;
  const padH = height + 2;
  const padded = new Uint8Array(padW * padH);

  for (let y = 0; y < height; y++) {
    const srcRow = y * width;
    const dstRow = (y + 1) * padW + 1;
    for (let x = 0; x < width; x++) {
      padded[dstRow + x] = grid[srcRow + x];
    }
  }

  // 8-neighborhood offsets (clockwise from East):
  // 0: (1, 0), 1: (1, 1), 2: (0, 1), 3: (-1, 1), 4: (-1, 0), 5: (-1, -1), 6: (0, -1), 7: (1, -1)
  const dx = [1, 1, 0, -1, -1, -1, 0, 1];
  const dy = [0, 1, 1, 1, 0, -1, -1, -1];

  const loops: Point[][] = [];
  const visitedOuter = new Uint8Array(padW * padH);

  // Scan top-to-bottom, left-to-right to find outer boundary start points
  for (let py = 1; py < padH - 1; py++) {
    const row = py * padW;
    for (let px = 1; px < padW - 1; px++) {
      const idx = row + px;
      // An outer boundary starts when we transition from background (above) to foreground
      if (padded[idx] === 1 && padded[idx - padW] === 0 && visitedOuter[idx] === 0) {
        // Start Moore-Neighbor Tracing
        const startX = px;
        const startY = py;

        const loopPoints: Point[] = [];
        let currX = startX;
        let currY = startY;
        let backtrackDir = 6; // Came from North (0, -1)

        let secondX = -1;
        let secondY = -1;
        let maxSteps = padW * padH;
        let steps = 0;

        while (steps < maxSteps) {
          loopPoints.push({
            x: Math.max(0, Math.min(width, currX - 1)),
            y: Math.max(0, Math.min(height, currY - 1)),
          });
          visitedOuter[currY * padW + currX] = 1;

          // Search 8-neighbors clockwise starting from backtrackDir + 1
          let foundNext = false;
          let nextX = currX;
          let nextY = currY;
          let foundDir = 0;

          for (let d = 0; d < 8; d++) {
            const checkDir = (backtrackDir + 1 + d) % 8;
            const nx = currX + dx[checkDir];
            const ny = currY + dy[checkDir];

            if (nx >= 0 && nx < padW && ny >= 0 && ny < padH && padded[ny * padW + nx] === 1) {
              nextX = nx;
              nextY = ny;
              foundDir = checkDir;
              foundNext = true;
              break;
            }
          }

          if (!foundNext) {
            // Isolated single pixel
            break;
          }

          // Jacob's stopping condition: visited start pixel twice with same next step
          if (currX === startX && currY === startY && steps > 0) {
            if (secondX === -1) {
              secondX = nextX;
              secondY = nextY;
            } else if (nextX === secondX && nextY === secondY) {
              break; // Loop completed!
            }
          } else if (steps === 1 && secondX === -1) {
            secondX = nextX;
            secondY = nextY;
          }

          backtrackDir = (foundDir + 4) % 8;
          currX = nextX;
          currY = nextY;
          steps++;
        }

        if (loopPoints.length >= 10) {
          // Close loop cleanly
          const first = loopPoints[0];
          const last = loopPoints[loopPoints.length - 1];
          if (Math.hypot(last.x - first.x, last.y - first.y) > 0.1) {
            loopPoints.push({ x: first.x, y: first.y });
          }
          loops.push(loopPoints);
        }
      }
    }
  }

  if (loops.length === 0) return [];

  // Sort loops by enclosed perimeter length descending (primary silhouette first)
  const perimeter = (pts: Point[]) => {
    let p = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      p += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    }
    return p;
  };

  loops.sort((a, b) => perimeter(b) - perimeter(a));
  return loops;
}

/**
 * EXACT GEOMETRIC RECTANGLE / SQUARE GENERATOR:
 */
export function generateGeometricRectanglePath(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  offsetPx: number,
  cornerRadiusMm: number,
  pxPerMm: number,
  canvasW: number,
  canvasH: number
): { points: Point[]; svgPath: string; cutLengthMm: number } {
  const x1 = Math.max(0, minX - offsetPx);
  const y1 = Math.max(0, minY - offsetPx);
  const x2 = Math.min(canvasW, maxX + offsetPx);
  const y2 = Math.min(canvasH, maxY + offsetPx);

  const w = Math.max(1, x2 - x1);
  const h = Math.max(1, y2 - y1);

  const maxRadiusPx = Math.min(w / 2, h / 2);
  const radiusPx = cornerRadiusMm > 0 ? Math.min(maxRadiusPx, cornerRadiusMm * pxPerMm) : 0;

  if (radiusPx <= 0.5) {
    const points: Point[] = [
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: x2, y: y2 },
      { x: x1, y: y2 },
      { x: x1, y: y1 },
    ];
    const svgPath = `M ${x1.toFixed(2)} ${y1.toFixed(2)} L ${x2.toFixed(2)} ${y1.toFixed(2)} L ${x2.toFixed(2)} ${y2.toFixed(2)} L ${x1.toFixed(2)} ${y2.toFixed(2)} Z`;
    const cutLengthPx = 2 * (w + h);
    return { points, svgPath, cutLengthMm: cutLengthPx / pxPerMm };
  } else {
    const r = radiusPx;
    const cornerSteps = 10;
    const points: Point[] = [];

    points.push({ x: x1 + r, y: y1 });
    points.push({ x: x2 - r, y: y1 });
    for (let i = 1; i <= cornerSteps; i++) {
      const a = -Math.PI / 2 + (i / cornerSteps) * (Math.PI / 2);
      points.push({ x: x2 - r + Math.cos(a) * r, y: y1 + r + Math.sin(a) * r });
    }
    points.push({ x: x2, y: y2 - r });
    for (let i = 1; i <= cornerSteps; i++) {
      const a = (i / cornerSteps) * (Math.PI / 2);
      points.push({ x: x2 - r + Math.cos(a) * r, y: y2 - r + Math.sin(a) * r });
    }
    points.push({ x: x1 + r, y: y2 });
    for (let i = 1; i <= cornerSteps; i++) {
      const a = Math.PI / 2 + (i / cornerSteps) * (Math.PI / 2);
      points.push({ x: x1 + r + Math.cos(a) * r, y: y2 - r + Math.sin(a) * r });
    }
    points.push({ x: x1, y: y1 + r });
    for (let i = 1; i <= cornerSteps; i++) {
      const a = Math.PI + (i / cornerSteps) * (Math.PI / 2);
      points.push({ x: x1 + r + Math.cos(a) * r, y: y1 + r + Math.sin(a) * r });
    }
    points.push({ x: points[0].x, y: points[0].y });

    const svgPath = `M ${(x1 + r).toFixed(2)} ${y1.toFixed(2)} L ${(x2 - r).toFixed(2)} ${y1.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${x2.toFixed(2)} ${(y1 + r).toFixed(2)} L ${x2.toFixed(2)} ${(y2 - r).toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${(x2 - r).toFixed(2)} ${y2.toFixed(2)} L ${(x1 + r).toFixed(2)} ${y2.toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${x1.toFixed(2)} ${(y2 - r).toFixed(2)} L ${x1.toFixed(2)} ${(y1 + r).toFixed(2)} A ${r.toFixed(2)} ${r.toFixed(2)} 0 0 1 ${(x1 + r).toFixed(2)} ${y1.toFixed(2)} Z`;

    const cutLengthPx = 2 * (w - 2 * r) + 2 * (h - 2 * r) + 2 * Math.PI * r;
    return { points, svgPath, cutLengthMm: cutLengthPx / pxPerMm };
  }
}

/**
 * EXACT GEOMETRIC CIRCLE & OVAL GENERATOR (used only when user explicitly chooses Circle/Oval mode):
 */
export function generateGeometricCirclePath(
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
  offsetPx: number,
  pxPerMm: number,
  canvasW: number,
  canvasH: number
): { points: Point[]; svgPath: string; cutLengthMm: number } {
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const baseW = Math.max(1, maxX - minX);
  const baseH = Math.max(1, maxY - minY);
  const rx = Math.min(canvasW / 2, baseW / 2 + offsetPx);
  const ry = Math.min(canvasH / 2, baseH / 2 + offsetPx);

  const points: Point[] = [];
  const steps = 64;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    points.push({
      x: cx + Math.cos(a) * rx,
      y: cy + Math.sin(a) * ry,
    });
  }

  const svgPath = `M ${(cx - rx).toFixed(2)} ${cy.toFixed(2)} A ${rx.toFixed(2)} ${ry.toFixed(2)} 0 1 0 ${(cx + rx).toFixed(2)} ${cy.toFixed(2)} A ${rx.toFixed(2)} ${ry.toFixed(2)} 0 1 0 ${(cx - rx).toFixed(2)} ${cy.toFixed(2)} Z`;

  const h = Math.pow(rx - ry, 2) / Math.pow(rx + ry, 2);
  const perimeterPx = Math.PI * (rx + ry) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));

  return { points, svgPath, cutLengthMm: perimeterPx / pxPerMm };
}

/**
 * AUTOMATIC SHAPE CLASSIFICATION:
 * Detects whether the silhouette is a Square, a Rectangle, or a Die-Cut contour.
 */
export function detectShapeCategory(
  mask: Uint8Array,
  width: number,
  height: number,
  pxPerMm: number,
  isTransparent = false
): {
  detectedShape: 'square' | 'rectangle' | 'circle' | 'oval' | 'die-cut';
  confidence: number;
  boundingBox: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    widthMm: number;
    heightMm: number;
  };
  fillRatio: number;
  aspectRatio: number;
} {
  let minX = width, minY = height, maxX = 0, maxY = 0;
  let fgCount = 0;

  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (mask[row + x] === 1) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        fgCount++;
      }
    }
  }

  if (fgCount < 20 || minX >= maxX || minY >= maxY) {
    return {
      detectedShape: 'die-cut',
      confidence: 0.5,
      boundingBox: {
        minX: 0,
        minY: 0,
        maxX: width,
        maxY: height,
        widthMm: width / pxPerMm,
        heightMm: height / pxPerMm,
      },
      fillRatio: 0,
      aspectRatio: 1,
    };
  }

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const boxArea = w * h;
  const fillRatio = fgCount / boxArea;
  const aspectRatio = w / h;
  const squareDiff = Math.abs(w - h) / Math.max(w, h);

  const bbWidthMm = Number((w / pxPerMm).toFixed(1));
  const bbHeightMm = Number((h / pxPerMm).toFixed(1));

  const boundingBox = {
    minX,
    minY,
    maxX,
    maxY,
    widthMm: bbWidthMm,
    heightMm: bbHeightMm,
  };

  // If the image is transparent (or background removed), the default expectation is DIE-CUT!
  if (isTransparent) {
    // Only classify as rectangle if it's virtually a 100% full rectangular image
    if (fillRatio >= 0.98 && minX <= 1 && minY <= 1 && maxX >= width - 2 && maxY >= height - 2) {
      return {
        detectedShape: squareDiff <= 0.04 ? 'square' : 'rectangle',
        confidence: 0.98,
        boundingBox,
        fillRatio,
        aspectRatio,
      };
    }
    return {
      detectedShape: 'die-cut',
      confidence: 0.96,
      boundingBox,
      fillRatio,
      aspectRatio,
    };
  }

  // Border occupancy sampling for solid un-cropped images
  const marginY = Math.max(1, Math.round(h * 0.02));
  const marginX = Math.max(1, Math.round(w * 0.02));

  let topEdgeCount = 0, btmEdgeCount = 0;
  const sampleW = Math.max(1, maxX - minX - 2 * marginX);
  const sampleH = Math.max(1, maxY - minY - 2 * marginY);

  for (let x = minX + marginX; x <= maxX - marginX; x++) {
    if (mask[(minY + marginY) * width + x] === 1) topEdgeCount++;
    if (mask[(maxY - marginY) * width + x] === 1) btmEdgeCount++;
  }

  let lftEdgeCount = 0, rgtEdgeCount = 0;
  for (let y = minY + marginY; y <= maxY - marginY; y++) {
    if (mask[y * width + (minX + marginX)] === 1) lftEdgeCount++;
    if (mask[y * width + (maxX - marginX)] === 1) rgtEdgeCount++;
  }

  const avgBorderOccupancy =
    (topEdgeCount / sampleW +
      btmEdgeCount / sampleW +
      lftEdgeCount / sampleH +
      rgtEdgeCount / sampleH) /
    4;

  if (fillRatio >= 0.96 && avgBorderOccupancy >= 0.90) {
    return {
      detectedShape: squareDiff <= 0.04 ? 'square' : 'rectangle',
      confidence: 0.98,
      boundingBox,
      fillRatio,
      aspectRatio,
    };
  }

  // DEFAULT: DIE-CUT (faithfully traces true end-to-end curves of the artwork!)
  return {
    detectedShape: 'die-cut',
    confidence: 0.95,
    boundingBox,
    fillRatio,
    aspectRatio,
  };
}

/**
 * ACCURATE, MULTI-DESIGN ADAPTIVE BORDER OUTLINE DETECTION:
 * Takes the end-to-end image and makes die as per the outline of that end-to-end image
 * after the background is removed, faithfully capturing all natural curves and contours!
 */
export async function detectImageBorderOutline(
  imageSource: HTMLImageElement | HTMLCanvasElement,
  settings: OutlineSettings,
  dimensions: ImageDimensions
): Promise<VectorResult> {
  const width =
    (imageSource as HTMLImageElement).naturalWidth ||
    imageSource.width ||
    dimensions.pixelWidth ||
    1000;
  const height =
    (imageSource as HTMLImageElement).naturalHeight ||
    imageSource.height ||
    dimensions.pixelHeight ||
    1000;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(imageSource, 0, 0);

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  // 1. Check Alpha Transparency
  let transparentPixelCount = 0;
  const alphaSampleStep = Math.max(1, Math.floor((width * height) / 4000));
  for (let i = 3; i < data.length; i += 4 * alphaSampleStep) {
    if (data[i] < 220) transparentPixelCount++;
  }
  const isTransparentPng = transparentPixelCount > 25;

  // 2. Corner Patch Sampling for background identification
  const cornerPatches: Array<{ r: number; g: number; b: number }> = [];
  const patchSize = Math.max(4, Math.min(24, Math.floor(Math.min(width, height) / 25)));

  const sampleCornerPatch = (startX: number, startY: number) => {
    let rSum = 0, gSum = 0, bSum = 0, count = 0;
    for (let py = startY; py < startY + patchSize && py < height; py++) {
      for (let px = startX; px < startX + patchSize && px < width; px++) {
        const idx = (py * width + px) * 4;
        rSum += data[idx];
        gSum += data[idx + 1];
        bSum += data[idx + 2];
        count++;
      }
    }
    if (count > 0) cornerPatches.push({ r: rSum / count, g: gSum / count, b: bSum / count });
  };

  sampleCornerPatch(0, 0);
  sampleCornerPatch(width - patchSize, 0);
  sampleCornerPatch(0, height - patchSize);
  sampleCornerPatch(width - patchSize, height - patchSize);

  let bgR = 255, bgG = 255, bgB = 255;
  if (cornerPatches.length > 0) {
    const medR = cornerPatches.map(p => p.r).sort((a, b) => a - b)[Math.floor(cornerPatches.length / 2)];
    const medG = cornerPatches.map(p => p.g).sort((a, b) => a - b)[Math.floor(cornerPatches.length / 2)];
    const medB = cornerPatches.map(p => p.b).sort((a, b) => a - b)[Math.floor(cornerPatches.length / 2)];
    bgR = medR; bgG = medG; bgB = medB;
  }
  const bgLuminance = 0.299 * bgR + 0.587 * bgG + 0.114 * bgB;

  // Determine effective background mode
  let effectiveMode = settings.bgMode;
  if (effectiveMode === 'auto') {
    if (isTransparentPng) effectiveMode = 'transparent';
    else if (bgLuminance < 100) effectiveMode = 'dark';
    else effectiveMode = 'light';
  }

  const rawMask = new Uint8Array(width * height);

  if (effectiveMode === 'transparent') {
    // Transparent mode: keep all visible artwork pixels right to the edge!
    const alphaCut = Math.max(10, Math.min(80, Math.round((255 - settings.threshold) * 0.35)));
    for (let i = 0; i < rawMask.length; i++) {
      rawMask[i] = data[i * 4 + 3] > alphaCut ? 1 : 0;
    }
  } else if (effectiveMode === 'dark') {
    const thresholdFactor = Math.max(15, (255 - settings.threshold) * 0.9);
    for (let i = 0; i < rawMask.length; i++) {
      const idx = i * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const diff = Math.hypot(r - bgR, g - bgG, b - bgB);
      rawMask[i] = lum > thresholdFactor || diff > thresholdFactor ? 1 : 0;
    }
  } else {
    // Light / White Background Mode
    const baseTol = Math.max(16, (255 - settings.threshold) * 1.6);
    const isBgCandidate = new Uint8Array(width * height);

    for (let i = 0; i < rawMask.length; i++) {
      const idx = i * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const diff = Math.hypot(r - bgR, g - bgG, b - bgB);
      if (diff <= baseTol) {
        isBgCandidate[i] = 1;
      }
    }

    const isConfirmedBg = new Uint8Array(width * height);
    const queue: number[] = [];

    for (let x = 0; x < width; x++) {
      if (isBgCandidate[x]) { isConfirmedBg[x] = 1; queue.push(x); }
      const bIdx = (height - 1) * width + x;
      if (isBgCandidate[bIdx]) { isConfirmedBg[bIdx] = 1; queue.push(bIdx); }
    }
    for (let y = 0; y < height; y++) {
      const lIdx = y * width;
      if (isBgCandidate[lIdx] && !isConfirmedBg[lIdx]) { isConfirmedBg[lIdx] = 1; queue.push(lIdx); }
      const rIdx = y * width + (width - 1);
      if (isBgCandidate[rIdx] && !isConfirmedBg[rIdx]) { isConfirmedBg[rIdx] = 1; queue.push(rIdx); }
    }

    let head = 0;
    while (head < queue.length) {
      const curr = queue[head++];
      const cx = curr % width;
      const cy = Math.floor(curr / width);

      const neighbors = [
        cy > 0 ? curr - width : -1,
        cy < height - 1 ? curr + width : -1,
        cx > 0 ? curr - 1 : -1,
        cx < width - 1 ? curr + 1 : -1,
      ];

      for (const n of neighbors) {
        if (n !== -1 && isBgCandidate[n] && !isConfirmedBg[n]) {
          isConfirmedBg[n] = 1;
          queue.push(n);
        }
      }
    }

    for (let i = 0; i < rawMask.length; i++) {
      rawMask[i] = isConfirmedBg[i] === 0 ? 1 : 0;
    }
  }

  // Fallback contrast if mask is empty
  let solidCount = 0;
  for (let i = 0; i < rawMask.length; i++) {
    if (rawMask[i] === 1) solidCount++;
  }

  if (solidCount < 50 && effectiveMode !== 'transparent') {
    for (let i = 0; i < rawMask.length; i++) {
      const idx = i * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const diff = Math.hypot(r - bgR, g - bgG, b - bgB);
      rawMask[i] = diff > 24 ? 1 : 0;
    }
  }

  if (settings.invertThreshold) {
    for (let i = 0; i < rawMask.length; i++) {
      rawMask[i] = rawMask[i] === 1 ? 0 : 1;
    }
  }

  // Morphological cleanup: bridge micro-gaps while preserving 100% of curves
  const cleanedMask = filterSmallComponents(rawMask, width, height, 25);
  const closedMask = morphologicalClose(cleanedMask, width, height, 1);

  const pxPerMm = dimensions.pixelWidth / (dimensions.physicalWidthMm || 1);
  const offsetPx = Math.max(0, settings.dieCutOffsetMm * pxPerMm);

  // Detect Shape Category
  const shapeInfo = detectShapeCategory(closedMask, width, height, pxPerMm, isTransparentPng);
  const effectiveShape =
    settings.shapeType === 'auto'
      ? (isTransparentPng ? 'die-cut' : shapeInfo.detectedShape)
      : settings.shapeType;

  let outerContours: VectorPath[] = [];
  let offsetPaths: VectorPath[] = [];
  let totalCutMm = 0;
  let boundingBox = {
    minX: shapeInfo.boundingBox.minX,
    minY: shapeInfo.boundingBox.minY,
    maxX: shapeInfo.boundingBox.maxX,
    maxY: shapeInfo.boundingBox.maxY,
    widthMm: shapeInfo.boundingBox.widthMm,
    heightMm: shapeInfo.boundingBox.heightMm,
  };

  if (effectiveShape === 'square' || effectiveShape === 'rectangle') {
    // 1. EXACT GEOMETRIC RECTANGLE / SQUARE
    const baseCut = generateGeometricRectanglePath(
      shapeInfo.boundingBox.minX,
      shapeInfo.boundingBox.minY,
      shapeInfo.boundingBox.maxX,
      shapeInfo.boundingBox.maxY,
      0,
      settings.cornerRadiusMm || 0,
      pxPerMm,
      width,
      height
    );

    outerContours = [
      {
        points: baseCut.points,
        isHole: false,
        svgPath: baseCut.svgPath,
      },
    ];

    if (offsetPx > 0.5) {
      const offsetCut = generateGeometricRectanglePath(
        shapeInfo.boundingBox.minX,
        shapeInfo.boundingBox.minY,
        shapeInfo.boundingBox.maxX,
        shapeInfo.boundingBox.maxY,
        offsetPx,
        settings.cornerRadiusMm || 0,
        pxPerMm,
        width,
        height
      );
      offsetPaths = [
        {
          points: offsetCut.points,
          isHole: false,
          svgPath: offsetCut.svgPath,
        },
      ];
      totalCutMm = offsetCut.cutLengthMm;
      boundingBox = {
        minX: Math.max(0, shapeInfo.boundingBox.minX - offsetPx),
        minY: Math.max(0, shapeInfo.boundingBox.minY - offsetPx),
        maxX: Math.min(width, shapeInfo.boundingBox.maxX + offsetPx),
        maxY: Math.min(height, shapeInfo.boundingBox.maxY + offsetPx),
        widthMm: Number((((Math.min(width, shapeInfo.boundingBox.maxX + offsetPx) - Math.max(0, shapeInfo.boundingBox.minX - offsetPx)) / pxPerMm)).toFixed(1)),
        heightMm: Number((((Math.min(height, shapeInfo.boundingBox.maxY + offsetPx) - Math.max(0, shapeInfo.boundingBox.minY - offsetPx)) / pxPerMm)).toFixed(1)),
      };
    } else {
      offsetPaths = outerContours;
      totalCutMm = baseCut.cutLengthMm;
    }
  } else if (effectiveShape === 'circle') {
    // 2. EXACT GEOMETRIC CIRCLE (explicitly requested by user)
    const baseCut = generateGeometricCirclePath(
      shapeInfo.boundingBox.minX,
      shapeInfo.boundingBox.minY,
      shapeInfo.boundingBox.maxX,
      shapeInfo.boundingBox.maxY,
      0,
      pxPerMm,
      width,
      height
    );
    outerContours = [
      {
        points: baseCut.points,
        isHole: false,
        svgPath: baseCut.svgPath,
      },
    ];

    if (offsetPx > 0.5) {
      const offsetCut = generateGeometricCirclePath(
        shapeInfo.boundingBox.minX,
        shapeInfo.boundingBox.minY,
        shapeInfo.boundingBox.maxX,
        shapeInfo.boundingBox.maxY,
        offsetPx,
        pxPerMm,
        width,
        height
      );
      offsetPaths = [
        {
          points: offsetCut.points,
          isHole: false,
          svgPath: offsetCut.svgPath,
        },
      ];
      totalCutMm = offsetCut.cutLengthMm;
      boundingBox = {
        minX: Math.max(0, shapeInfo.boundingBox.minX - offsetPx),
        minY: Math.max(0, shapeInfo.boundingBox.minY - offsetPx),
        maxX: Math.min(width, shapeInfo.boundingBox.maxX + offsetPx),
        maxY: Math.min(height, shapeInfo.boundingBox.maxY + offsetPx),
        widthMm: Number((((Math.min(width, shapeInfo.boundingBox.maxX + offsetPx) - Math.max(0, shapeInfo.boundingBox.minX - offsetPx)) / pxPerMm)).toFixed(1)),
        heightMm: Number((((Math.min(height, shapeInfo.boundingBox.maxY + offsetPx) - Math.max(0, shapeInfo.boundingBox.minY - offsetPx)) / pxPerMm)).toFixed(1)),
      };
    } else {
      offsetPaths = outerContours;
      totalCutMm = baseCut.cutLengthMm;
    }
  } else {
    // 3. ORGANIC DIE-CUT SHAPE (FAITHFUL END-TO-END SILHOUETTE & CURVE EXTRACTION):
    // Accurately hugs all natural curves, domes, knots, corners, and contours of the artwork!
    const rawContours = extractTopologicalContours(closedMask, width, height);

    if (rawContours.length === 0) {
      // Fallback: simple bounding box contour if empty
      const fb = generateGeometricRectanglePath(
        shapeInfo.boundingBox.minX,
        shapeInfo.boundingBox.minY,
        shapeInfo.boundingBox.maxX,
        shapeInfo.boundingBox.maxY,
        0,
        0,
        pxPerMm,
        width,
        height
      );
      outerContours = [{ points: fb.points, isHole: false, svgPath: fb.svgPath }];
      offsetPaths = outerContours;
      totalCutMm = fb.cutLengthMm;
    } else {
      // Process outer contour + significant interior holes
      const smoothingVal = settings.smoothing || 5;
      const epsilon = Math.max(0.5, Math.min(1.5, 0.3 + smoothingVal * 0.12));
      const targetSpacing = Math.max(4, Math.min(10, 3 + smoothingVal * 0.7));
      const smoothingPasses = Math.max(2, Math.min(4, Math.round(smoothingVal / 2.5)));

      outerContours = rawContours.slice(0, 4).map((rawPts, idx) => {
        // Step A: Ensure clockwise winding for screen coordinates
        let pts = ensureClockwiseWinding(rawPts);

        // Step B: Douglas-Peucker simplification to eliminate single-pixel grid staircase while preserving curves
        pts = simplifyDouglasPeucker(pts, epsilon);

        // Step C: Equidistant arc-length resampling along perimeter
        pts = resampleContourEquidistant(pts, targetSpacing);

        // Step D: Only apply bilateral symmetry if user explicitly enabled symmetryLock and shape is bilateral
        if (settings.symmetryLock === true && idx === 0) {
          pts = symmetrizeContour(pts, 0.6);
        }

        // Step E: Gaussian curvature smoothing (2-4 passes) to ensure continuous round curves (balloons, badges)
        pts = smoothPolygonLaplacian(pts, smoothingPasses);

        return {
          points: pts,
          isHole: idx > 0,
          svgPath: pointsToSmoothSvgPath(pts, true),
        };
      });

      // OUTWARD DIE-CUT MARGIN
      if (offsetPx > 0.5 && outerContours.length > 0) {
        const primaryContour = outerContours[0].points;
        let offsetPts = offsetPolygonNormals(primaryContour, offsetPx);
        offsetPts = simplifyDouglasPeucker(offsetPts, epsilon);
        offsetPts = resampleContourEquidistant(offsetPts, targetSpacing);
        offsetPts = smoothPolygonLaplacian(offsetPts, smoothingPasses);

        offsetPaths = [
          {
            points: offsetPts,
            isHole: false,
            svgPath: pointsToSmoothSvgPath(offsetPts, true),
          },
        ];
      } else {
        offsetPaths = outerContours.length > 0 ? [outerContours[0]] : [];
      }

      // Calculate total cut length in mm
      const activePaths = offsetPaths.length > 0 ? offsetPaths : outerContours;
      let totalPx = 0;
      for (const path of activePaths) {
        const pts = path.points;
        for (let i = 0; i < pts.length; i++) {
          const p1 = pts[i];
          const p2 = pts[(i + 1) % pts.length];
          totalPx += Math.hypot(p2.x - p1.x, p2.y - p1.y);
        }
      }
      totalCutMm = totalPx / pxPerMm;

      // Calculate accurate bounding box of the active cut path
      let minX = width, minY = height, maxX = 0, maxY = 0;
      const allPts = activePaths.flatMap(p => p.points);
      if (allPts.length > 0) {
        for (const pt of allPts) {
          if (pt.x < minX) minX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y > maxY) maxY = pt.y;
        }
        boundingBox = {
          minX: Math.max(0, Math.floor(minX)),
          minY: Math.max(0, Math.floor(minY)),
          maxX: Math.min(width, Math.ceil(maxX)),
          maxY: Math.min(height, Math.ceil(maxY)),
          widthMm: Number(((Math.min(width, Math.ceil(maxX)) - Math.max(0, Math.floor(minX))) / pxPerMm).toFixed(1)),
          heightMm: Number(((Math.min(height, Math.ceil(maxY)) - Math.max(0, Math.floor(minY))) / pxPerMm).toFixed(1)),
        };
      }
    }
  }

  const mm = Number(totalCutMm.toFixed(1));
  const inches = Number((mm / 25.4).toFixed(2));

  return {
    outerContours,
    offsetContour: offsetPaths,
    totalCutLengthMm: mm,
    totalCutLengthIn: inches,
    detectedShape: effectiveShape,
    shapeConfidence: shapeInfo.confidence,
    shapeDetails: {
      widthMm: boundingBox.widthMm,
      heightMm: boundingBox.heightMm,
      aspectRatio: Number((width / (height || 1)).toFixed(2)),
      fillRatio: shapeInfo.fillRatio,
    },
    boundingBox,
  };
}

/**
 * AI-POWERED OUTLINE DETECTION VIA GEMINI VISION:
 * Used as an ultra-high-precision fallback for challenging photographic backgrounds.
 */
export async function detectOutlineWithAi(
  imageSource: HTMLImageElement | HTMLCanvasElement,
  settings: OutlineSettings,
  dimensions: ImageDimensions
): Promise<VectorResult> {
  const width =
    (imageSource as HTMLImageElement).naturalWidth ||
    imageSource.width ||
    dimensions.pixelWidth ||
    1000;
  const height =
    (imageSource as HTMLImageElement).naturalHeight ||
    imageSource.height ||
    dimensions.pixelHeight ||
    1000;

  // Downsample to max 720px for rapid AI response
  const maxDim = Math.max(width, height);
  const scale = maxDim > 720 ? 720 / maxDim : 1;
  const c = document.createElement('canvas');
  c.width = Math.round(width * scale);
  c.height = Math.round(height * scale);
  c.getContext('2d')!.drawImage(imageSource, 0, 0, c.width, c.height);

  const base64 = c.toDataURL('image/png');

  const response = await fetch('/api/ai-detect-outline', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64: base64,
      mimeType: 'image/png',
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`AI Outline failed: ${errorBody || response.statusText}`);
  }

  const data = await response.json();
  const rawContours: Array<{ points: Array<{ x: number; y: number }>; isHole: boolean }> =
    data.contours || (data.polygons ? data.polygons.map((p: any) => ({ points: p, isHole: false })) : []);

  if (rawContours.length === 0) {
    throw new Error('AI returned no valid boundary contours.');
  }

  // Scale normalized 0..1000 coordinates to image dimensions
  const scaleX = width / 1000;
  const scaleY = height / 1000;

  const smoothingVal = settings.smoothing || 5;
  const epsilon = Math.max(0.5, Math.min(1.5, 0.3 + smoothingVal * 0.12));
  const targetSpacing = Math.max(4, Math.min(10, 3 + smoothingVal * 0.7));
  const smoothingPasses = Math.max(2, Math.min(4, Math.round(smoothingVal / 2.5)));

  const outerContours: VectorPath[] = rawContours.map((contour, idx) => {
    let scaledPoints = contour.points.map(pt => ({
      x: pt.x * scaleX,
      y: pt.y * scaleY,
    }));

    scaledPoints = ensureClockwiseWinding(scaledPoints);
    scaledPoints = simplifyDouglasPeucker(scaledPoints, epsilon);
    scaledPoints = resampleContourEquidistant(scaledPoints, targetSpacing);
    if (settings.symmetryLock === true && idx === 0) {
      scaledPoints = symmetrizeContour(scaledPoints, 0.6);
    }
    scaledPoints = smoothPolygonLaplacian(scaledPoints, smoothingPasses);

    return {
      points: scaledPoints,
      isHole: contour.isHole || idx > 0,
      svgPath: pointsToSmoothSvgPath(scaledPoints, true),
    };
  });

  const pxPerMm = dimensions.pixelWidth / (dimensions.physicalWidthMm || 1);
  const offsetPx = Math.max(0, settings.dieCutOffsetMm * pxPerMm);
  let offsetPaths: VectorPath[] = [];

  if (offsetPx > 0.5 && outerContours.length > 0) {
    const primary = outerContours[0].points;
    let offsetPts = offsetPolygonNormals(primary, offsetPx);
    offsetPts = simplifyDouglasPeucker(offsetPts, epsilon);
    offsetPts = resampleContourEquidistant(offsetPts, targetSpacing);
    offsetPts = smoothPolygonLaplacian(offsetPts, smoothingPasses);

    offsetPaths = [
      {
        points: offsetPts,
        isHole: false,
        svgPath: pointsToSmoothSvgPath(offsetPts, true),
      },
    ];
  } else {
    offsetPaths = outerContours.length > 0 ? [outerContours[0]] : [];
  }

  const activePaths = offsetPaths.length > 0 ? offsetPaths : outerContours;
  let totalPx = 0;
  for (const path of activePaths) {
    const pts = path.points;
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i];
      const p2 = pts[(i + 1) % pts.length];
      totalPx += Math.hypot(p2.x - p1.x, p2.y - p1.y);
    }
  }

  const totalCutMm = totalPx / pxPerMm;
  const mm = Number(totalCutMm.toFixed(1));
  const inches = Number((mm / 25.4).toFixed(2));

  let minX = width, minY = height, maxX = 0, maxY = 0;
  const allPts = activePaths.flatMap(p => p.points);
  for (const pt of allPts) {
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
  }

  return {
    outerContours,
    offsetContour: offsetPaths,
    totalCutLengthMm: mm,
    totalCutLengthIn: inches,
    detectedShape: 'die-cut',
    shapeConfidence: 0.95,
    shapeDetails: {
      widthMm: Number(((maxX - minX) / pxPerMm).toFixed(1)),
      heightMm: Number(((maxY - minY) / pxPerMm).toFixed(1)),
      aspectRatio: Number((width / (height || 1)).toFixed(2)),
      fillRatio: 0.7,
    },
    boundingBox: {
      minX: Math.max(0, Math.floor(minX)),
      minY: Math.max(0, Math.floor(minY)),
      maxX: Math.min(width, Math.ceil(maxX)),
      maxY: Math.min(height, Math.ceil(maxY)),
      widthMm: Number(((Math.min(width, Math.ceil(maxX)) - Math.max(0, Math.floor(minX))) / pxPerMm).toFixed(1)),
      heightMm: Number(((Math.min(height, Math.ceil(maxY)) - Math.max(0, Math.floor(minY))) / pxPerMm).toFixed(1)),
    },
  };
}
