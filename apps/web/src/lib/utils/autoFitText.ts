/**
 * Auto-fit text: compute font size so text fills the available space.
 * - Small text → scale up to fill
 * - Large text → scale down to fit
 * Uses canvas measureText for accurate wrapping simulation.
 */

const LINE_HEIGHT = 1.28;
const MIN_FONT_SIZE = 10;
const MAX_FONT_SIZE = 72;

function getCanvasContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  return canvas.getContext('2d');
}

let ctxCache: CanvasRenderingContext2D | null = null;

function getCtx(): CanvasRenderingContext2D | null {
  if (!ctxCache) ctxCache = getCanvasContext();
  return ctxCache;
}

/**
 * Measure text dimensions at a given font size with word wrapping.
 */
function measureWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  width: number,
  fontSize: number,
  fontFamily: string,
  lineHeight: number
): { width: number; height: number } {
  if (!text.trim()) return { width: 0, height: 0 };

  ctx.font = `${fontSize}px ${fontFamily}`;
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > width && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);

  const maxLineWidth = lines.length > 0
    ? Math.max(...lines.map((l) => ctx.measureText(l).width))
    : 0;
  const totalHeight = lines.length * fontSize * lineHeight;

  return { width: maxLineWidth, height: totalHeight };
}

/**
 * Get font size that makes text fit the given box, scaling up or down as needed.
 */
export function getAutoFitFontSize(
  text: string,
  width: number,
  height: number,
  fontFamily: string,
  options?: { minSize?: number; maxSize?: number; lineHeight?: number }
): number {
  const minSize = options?.minSize ?? MIN_FONT_SIZE;
  const maxSize = options?.maxSize ?? MAX_FONT_SIZE;
  const lineHeight = options?.lineHeight ?? LINE_HEIGHT;

  if (width <= 0 || height <= 0) return Math.min(16, maxSize);
  if (!text.trim()) return Math.min(maxSize, Math.floor(height * 0.4));

  const ctx = getCtx();
  if (!ctx) return 16;

  let fontSize = Math.min(maxSize, Math.floor(height * 0.5));
  let measured = measureWrappedText(ctx, text, width, fontSize, fontFamily, lineHeight);

  // Scale down if overflow
  while (fontSize > minSize && (measured.width > width || measured.height > height)) {
    fontSize -= 2;
    measured = measureWrappedText(ctx, text, width, fontSize, fontFamily, lineHeight);
  }

  // Scale up if text is small (fill the space)
  while (fontSize < maxSize && measured.width < width * 0.9 && measured.height < height * 0.9) {
    const nextSize = fontSize + 2;
    const nextMeasured = measureWrappedText(ctx, text, width, nextSize, fontFamily, lineHeight);
    if (nextMeasured.width > width || nextMeasured.height > height) break;
    fontSize = nextSize;
    measured = nextMeasured;
  }

  return Math.max(minSize, Math.min(maxSize, fontSize));
}
