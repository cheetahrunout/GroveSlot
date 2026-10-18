/**
 * Grove design tokens: the one source for colours, type, spacing and radii.
 * Vue components read them as CSS variables (--grove-*), PixiJS reads them
 * from here. The HUD chrome follows the casino's theme tokens where it has
 * them (the player's own pick, from CASINO_PUBLIC_URL/theme.css); these
 * values are the fallback for when the casino is unreachable or in local play.
 * The reels, the bonus art and the graffiti fonts stay Lowrider's own.
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

/** Grove token -> the casino theme token it follows (site/themes/README.md in the casino repository). */
const CASINO_TOKENS: Record<string, string> = {
  'color-background': '--bg',
  'color-panel': '--surface',
  'color-panel-edge': '--rule-2',
  'color-text': '--ink',
  'color-muted': '--ink-3',
  'color-gold': '--gold',
  'color-danger': '--crit',
  'radius-sm': '--radius-sm',
  'radius-md': '--radius',
  'radius-pill': '--radius-pill',
};

const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Writes the tokens as CSS variables on :root, following the casino theme where it has the token. */
export function applyTokens(root: HTMLElement = document.documentElement): void {
  for (const [group, values] of Object.entries(TOKENS)) {
    for (const [name, value] of Object.entries(values)) {
      const key = `${group}-${kebab(name)}`;
      const casino = CASINO_TOKENS[key];
      root.style.setProperty(`--grove-${key}`, casino ? `var(${casino}, ${value})` : value);
    }
  }
}

/** Links the player's casino theme (the gc_theme cookie travels same-site to the casino). */
export function linkCasinoTheme(casinoUrl: string): void {
  if (!casinoUrl || document.getElementById('casino-theme')) return;
  const link = document.createElement('link');
  link.id = 'casino-theme';
  link.rel = 'stylesheet';
  link.href = `${casinoUrl}/theme.css`;
  document.head.append(link);
}
