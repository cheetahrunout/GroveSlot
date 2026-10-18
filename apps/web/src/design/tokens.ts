/**
 * Grove design tokens: the one source for colours, type, spacing and radii.
 * Vue components read them as CSS variables (--grove-*), PixiJS reads them
 * from here. Replace the values with the official Grove token set when it is
 * available; names map one to one.
 */
export const TOKENS = {
  color: {
    background: '#0d1a0d',
    night: '#0b1426',
    panel: '#132613',
    panelEdge: '#3f8f3f',
    grove: '#2f7d2f',
    groveLight: '#5fb85f',
    text: '#e8f5e0',
    muted: '#8fb88f',
    gold: '#f2d36b',
    purple: '#7b3fa0',
    danger: '#c0392b',
    tile: '#e9ece6',
    tileText: '#1d4d1d',
  },
  font: {
    ui: 'Anton, Impact, "Arial Narrow", sans-serif',
    tag: '"Permanent Marker", "Comic Sans MS", cursive',
    body: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  },
  space: { xs: '4px', sm: '8px', md: '12px', lg: '20px', xl: '32px' },
  radius: { sm: '10px', md: '16px', lg: '24px', pill: '999px' },
} as const;

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Writes the tokens as CSS variables on :root. */
export function applyTokens(root: HTMLElement = document.documentElement): void {
  for (const [group, values] of Object.entries(TOKENS)) {
    for (const [name, value] of Object.entries(values)) {
      root.style.setProperty(`--grove-${group}-${kebab(name)}`, value);
    }
  }
}
