import { h } from '../dom';
import { ACCENTS, FONTS, LIMITS, THEMES, getSettings, onSettings, resetSettings, updateSettings, type FontKey, type Settings, type Theme } from '../store/settings';

const THEME_LABEL: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark', sepia: 'Sepia', contrast: 'Contrast' };
const THEME_SWATCH: Record<Theme, string> = { system: 'linear-gradient(90deg,#faf8f4 50%,#14161a 50%)', light: '#faf8f4', dark: '#14161a', sepia: '#f3ead7', contrast: '#000' };

let open: HTMLElement | undefined;
let outside: ((e: MouseEvent) => void) | undefined;
let trigger: HTMLElement | undefined;
let redraw: (() => void) | undefined;

export function closeSettings(): void {
  open?.remove();
  open = undefined;
  redraw = undefined;
  if (outside) document.removeEventListener('mousedown', outside);
  trigger?.setAttribute('aria-expanded', 'false');
}

export function toggleSettings(button: HTMLElement): void {
  if (open) return closeSettings();
  trigger = button;
  button.setAttribute('aria-expanded', 'true');
  open = build();
  document.body.append(open);
  outside = (e) => {
    if (open && !open.contains(e.target as Node) && !button.contains(e.target as Node)) closeSettings();
  };
  document.addEventListener('mousedown', outside);
}

// Controls that were not touched by the user (for example the keyboard shortcuts) still update the panel.
onSettings(() => {
  if (!dragging) redraw?.();
});
let dragging = false;

function range(label: string, value: number, [min, max]: readonly [number, number], step: number, fmt: (v: number) => string, apply: (v: number) => void): HTMLElement {
  const out = h('output', null, fmt(value));
  const input = h('input', { type: 'range', min, max, step, value, 'aria-label': label });
  input.addEventListener('input', () => {
    dragging = true;
    out.textContent = fmt(Number(input.value));
    apply(Number(input.value));
    dragging = false;
  });
  return h('div', { class: 'row' }, h('label', null, h('span', null, label), out), input);
}

function fontSelect(label: string, value: FontKey, apply: (k: FontKey) => void): HTMLElement {
  const select = h('select', { 'aria-label': label }, ...(Object.keys(FONTS) as FontKey[]).map((k) => h('option', { value: k, selected: k === value }, FONTS[k].label)));
  select.addEventListener('change', () => apply(select.value as FontKey));
  return h('div', { class: 'row' }, h('label', null, h('span', null, label)), select);
}

const pressed = (on: boolean): string => String(on);

function build(): HTMLElement {
  const pop = h('div', { class: 'popover', role: 'dialog', 'aria-label': 'Reading settings' });
  const draw = (): void => {
    const s: Settings = getSettings();
    pop.replaceChildren(
      h('h2', null, 'Reading settings', h('button', { class: 'btn ghost', type: 'button', onclick: closeSettings }, 'Close')),
      h('div', { class: 'row' }, h('div', { class: 'label' }, 'Theme'),
        h('div', { class: 'seg', style: 'grid-template-columns:repeat(5,1fr)' }, ...THEMES.map((t) => h('button', { type: 'button', class: 'btn theme-chip', 'aria-pressed': pressed(s.theme === t), onclick: () => updateSettings({ theme: t }) }, h('span', { class: 'swatch', style: `background:${THEME_SWATCH[t]}` }), THEME_LABEL[t])))),
      h('div', { class: 'row' }, h('div', { class: 'label' }, h('span', null, 'Text size'), h('output', null, `${s.fontSize}px`)),
        h('div', { class: 'seg', style: 'grid-template-columns:auto 1fr auto;align-items:center' },
          h('button', { type: 'button', class: 'btn', 'aria-label': 'Smaller text', onclick: () => updateSettings({ fontSize: getSettings().fontSize - 1 }) }, 'A-'),
          (() => {
            const input = h('input', { type: 'range', min: LIMITS.fontSize[0], max: LIMITS.fontSize[1], step: 1, value: s.fontSize, 'aria-label': 'Text size' });
            input.addEventListener('input', () => {
              dragging = true;
              updateSettings({ fontSize: Number(input.value) });
              const out = input.closest('.row')?.querySelector('output');
              if (out) out.textContent = `${input.value}px`;
              dragging = false;
            });
            return input;
          })(),
          h('button', { type: 'button', class: 'btn', 'aria-label': 'Larger text', onclick: () => updateSettings({ fontSize: getSettings().fontSize + 1 }) }, 'A+'))),
      fontSelect('Body font', s.bodyFont, (k) => { dragging = true; updateSettings({ bodyFont: k }); dragging = false; }),
      fontSelect('Heading font', s.headingFont, (k) => { dragging = true; updateSettings({ headingFont: k }); dragging = false; }),
      range('Line height', s.lineHeight, LIMITS.lineHeight, 0.05, (v) => v.toFixed(2), (v) => updateSettings({ lineHeight: v })),
      range('Column width', s.measure, LIMITS.measure, 2, (v) => `${v} characters`, (v) => updateSettings({ measure: v })),
      h('div', { class: 'row' }, h('div', { class: 'label' }, 'Alignment'),
        h('div', { class: 'seg' }, ...(['left', 'justify'] as const).map((a) => h('button', { type: 'button', class: 'btn', 'aria-pressed': pressed(s.align === a), onclick: () => updateSettings({ align: a }) }, a === 'left' ? 'Left' : 'Justified')))),
      h('div', { class: 'row' }, h('div', { class: 'label' }, 'Accent'),
        h('div', { class: 'swatches' }, ...ACCENTS.map((a) => h('button', { type: 'button', class: 'swatch-btn', title: a.name, 'aria-label': a.name, 'aria-pressed': pressed(s.accent === a.hue), style: `background:hsl(${a.hue} 52% 38%)`, onclick: () => updateSettings({ accent: a.hue }) })))),
      h('div', { class: 'sample' }, h('h3', null, 'Sample'), h('p', null, 'A note is easier to learn from when the type fits your eyes and the room you read in.')),
      h('div', { class: 'row', style: 'display:flex;justify-content:space-between;align-items:center;gap:.5rem' }, h('span', { class: 'chip' }, 'Alt+= / Alt+- size, Alt+T theme'), h('button', { class: 'btn', type: 'button', onclick: resetSettings }, 'Reset')),
    );
  };
  redraw = draw;
  draw();
  return pop;
}
