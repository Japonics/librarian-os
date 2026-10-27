import { readJson, writeJson } from './storage';

export const THEMES = ['system', 'light', 'dark', 'sepia', 'contrast'] as const;
export type Theme = (typeof THEMES)[number];
export type ResolvedTheme = Exclude<Theme, 'system'>;

export const FONTS = {
  'source-serif': { label: 'Source Serif 4', stack: "'Source Serif 4', Georgia, serif" },
  lora: { label: 'Lora', stack: "'Lora', Georgia, serif" },
  merriweather: { label: 'Merriweather', stack: "'Merriweather', Georgia, serif" },
  inter: { label: 'Inter', stack: "'Inter', system-ui, sans-serif" },
  atkinson: { label: 'Atkinson Hyperlegible', stack: "'Atkinson Hyperlegible', 'Inter', system-ui, sans-serif" },
  system: { label: 'System sans', stack: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
  mono: { label: 'JetBrains Mono', stack: "'JetBrains Mono', ui-monospace, Menlo, monospace" },
} as const;
export type FontKey = keyof typeof FONTS;

export const ACCENTS = [
  { name: 'Green', hue: 160 },
  { name: 'Blue', hue: 215 },
  { name: 'Violet', hue: 265 },
  { name: 'Rose', hue: 345 },
  { name: 'Amber', hue: 35 },
] as const;

export interface Settings {
  theme: Theme;
  fontSize: number;
  bodyFont: FontKey;
  headingFont: FontKey;
  lineHeight: number;
  measure: number;
  align: 'left' | 'justify';
  accent: number;
}

export const LIMITS = { fontSize: [13, 30], lineHeight: [1.3, 2.1], measure: [48, 110] } as const;
export const DEFAULTS: Settings = { theme: 'system', fontSize: 18, bodyFont: 'source-serif', headingFont: 'source-serif', lineHeight: 1.65, measure: 72, align: 'left', accent: 160 };

const KEY = 'librarian.settings.v1';
const clamp = (v: unknown, [lo, hi]: readonly [number, number], fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);

/** Read saved settings and repair anything that is missing or out of range. */
export function sanitize(raw: Partial<Settings> | null | undefined): Settings {
  const r = raw ?? {};
  return {
    theme: THEMES.includes(r.theme as Theme) ? (r.theme as Theme) : DEFAULTS.theme,
    fontSize: clamp(r.fontSize, LIMITS.fontSize, DEFAULTS.fontSize),
    bodyFont: r.bodyFont && r.bodyFont in FONTS ? r.bodyFont : DEFAULTS.bodyFont,
    headingFont: r.headingFont && r.headingFont in FONTS ? r.headingFont : DEFAULTS.headingFont,
    lineHeight: clamp(r.lineHeight, LIMITS.lineHeight, DEFAULTS.lineHeight),
    measure: clamp(r.measure, LIMITS.measure, DEFAULTS.measure),
    align: r.align === 'justify' ? 'justify' : 'left',
    accent: ACCENTS.some((a) => a.hue === r.accent) ? (r.accent as number) : DEFAULTS.accent,
  };
}

let current: Settings = sanitize(readJson<Partial<Settings>>(KEY, {}));
const listeners = new Set<(s: Settings) => void>();
const dark = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : undefined;

export const getSettings = (): Settings => current;

export function resolveTheme(s: Settings = current): ResolvedTheme {
  if (s.theme !== 'system') return s.theme;
  return dark?.matches ? 'dark' : 'light';
}

export function applySettings(s: Settings = current): void {
  const root = document.documentElement;
  root.dataset.theme = resolveTheme(s);
  root.style.setProperty('--fs', `${s.fontSize}px`);
  root.style.setProperty('--lh', String(s.lineHeight));
  root.style.setProperty('--measure', `${s.measure}ch`);
  root.style.setProperty('--font-body', FONTS[s.bodyFont].stack);
  root.style.setProperty('--font-heading', FONTS[s.headingFont].stack);
  root.style.setProperty('--align', s.align);
  root.style.setProperty('--accent-h', String(s.accent));
}

export function updateSettings(patch: Partial<Settings>): void {
  const previous = current.theme;
  current = sanitize({ ...current, ...patch });
  writeJson(KEY, current);
  applySettings();
  if (previous !== current.theme || 'theme' in patch) document.dispatchEvent(new CustomEvent('themechange'));
  listeners.forEach((fn) => fn(current));
}

export function resetSettings(): void {
  updateSettings({ ...DEFAULTS });
  document.dispatchEvent(new CustomEvent('themechange'));
}

export function onSettings(fn: (s: Settings) => void): void {
  listeners.add(fn);
}

dark?.addEventListener('change', () => {
  if (current.theme === 'system') {
    applySettings();
    document.dispatchEvent(new CustomEvent('themechange'));
  }
});
