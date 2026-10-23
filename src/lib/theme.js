// Per-project themes. Colours come from the project row (editable by admin) and default to the
// "site office" palette: steel blue, safety amber, graphite. `theme` picks the website layout.
export const THEME_PRESETS = {
  residence: { label: 'Residence', primary: '#2f5d7c', accent: '#f0a331', dark: '#17191c' },
  forest:    { label: 'Forest',    primary: '#2f5d7c', accent: '#f0a331', dark: '#17191c' },
  stone:     { label: 'Stone',     primary: '#2f5d7c', accent: '#f0a331', dark: '#17191c' },
  charcoal:  { label: 'Charcoal',  primary: '#2f5d7c', accent: '#f0a331', dark: '#17191c' },
};

function hexToRgb(hex) {
  const h = (hex || '#000000').replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mix(hex, withHex, amount) {
  const a = hexToRgb(hex); const b = hexToRgb(withHex);
  const c = a.map((x, i) => Math.round(x + (b[i] - x) * amount));
  return '#' + c.map((x) => x.toString(16).padStart(2, '0')).join('');
}
export function rgba(hex, alpha) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
// readable text colour on top of a background
export function onColor(hex) {
  const [r, g, b] = hexToRgb(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#0f172a' : '#ffffff';
}

// Colours from the previous charcoal / forest / gold theme. A project still carrying one of these
// (i.e. never customised by the admin) automatically picks up the new blue & yellow palette.
const LEGACY_COLOURS = new Set(['#2f5d46', '#263b32', '#4a5a5e', '#2a2c28', '#c5a46d', '#171916', '#121c17', '#1c2224', '#174a91', '#f5c542', '#2563eb', '#0f172a']);
const pick = (value, fallback) => (value && !LEGACY_COLOURS.has(String(value).toLowerCase()) ? value : fallback);

export function projectColors(p) {
  const preset = THEME_PRESETS[p?.theme] || THEME_PRESETS.residence;
  return {
    primary: pick(p?.color_primary, preset.primary),
    accent: pick(p?.color_accent, preset.accent),
    dark: pick(p?.color_dark, preset.dark),
  };
}

// CSS variables for a themed area (used by style={...})
export function themeVars(p) {
  const { primary, accent, dark } = projectColors(p);
  return {
    '--accent': primary,
    '--accent-hover': mix(primary, '#000000', 0.2),
    '--accent-soft': mix(primary, '#ffffff', 0.9),
    '--ink': dark,
    '--ink-2': mix(dark, '#ffffff', 0.12),
    '--ink-3': mix(dark, '#ffffff', 0.24),
    '--brand': primary,
    '--brand-2': accent,
    '--brand-dark': dark,
    '--on-brand': onColor(primary),
    '--on-brand-2': onColor(accent),
    '--focus': `0 0 0 3px ${rgba(primary, 0.35)}`,
  };
}

// Apply to the whole document (customer portal)
export function applyTheme(p) {
  const root = document.documentElement;
  const vars = themeVars(p);
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', vars['--ink']);
}
export function clearTheme() {
  const root = document.documentElement;
  Object.keys(themeVars({})).forEach((k) => root.style.removeProperty(k));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', '#17191c');
}

export function youtubeId(url) {
  const m = (url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  return m ? m[1] : null;
}
