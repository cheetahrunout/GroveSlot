/**
 * Desktop-first layout with a portrait layout ready for mobile. The scene is
 * built at a fixed design resolution and scaled to fit (letterboxed).
 */
export type LayoutMode = 'landscape' | 'portrait';

export const DESIGN_SIZE: Record<LayoutMode, { width: number; height: number }> = {
  landscape: { width: 1920, height: 1080 },
  portrait: { width: 1080, height: 1920 },
};

export interface Layout {
  mode: LayoutMode;
  width: number;
  height: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function computeLayout(viewWidth: number, viewHeight: number): Layout {
  const mode: LayoutMode = viewWidth >= viewHeight ? 'landscape' : 'portrait';
  const { width, height } = DESIGN_SIZE[mode];
  const scale = Math.min(viewWidth / width, viewHeight / height);
  return {
    mode,
    width,
    height,
    scale,
    offsetX: (viewWidth - width * scale) / 2,
    offsetY: (viewHeight - height * scale) / 2,
  };
}
