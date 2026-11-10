export interface ThemeInfo {
  id: string;
  name: string;
  subtitle: string;
  badge: string;
  accent: string;
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  800: string;
  900: string;
  950: string;
}

export const THEMES: Record<string, ThemeInfo> = {
  blue: {
    id: 'blue',
    name: 'Bleu Clinique',
    subtitle: 'Standard de santé rassurant et apaisant',
    badge: 'Recommandé SIH',
    accent: '#2563eb',
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#1e40af',
    900: '#1e3a8a',
    950: '#172554',
  },
  teal: {
    id: 'teal',
    name: 'Teal Chirurgical',
    subtitle: 'Vert d\'eau stérile et moderne pour blocs',
    badge: 'Chirurgie & Bloc',
    accent: '#0d9488',
    50: '#f0fdfa',
    100: '#ccfbf1',
    200: '#99f6e4',
    300: '#5eead4',
    400: '#2dd4bf',
    500: '#14b8a6',
    600: '#0d9488',
    700: '#0f766e',
    800: '#115e59',
    900: '#134e4a',
    950: '#042f2e',
  },
  emerald: {
    id: 'emerald',
    name: 'Émeraude Santé',
    subtitle: 'Vitalité, guérison et écoute patient',
    badge: 'Pharmacie & Soins',
    accent: '#059669',
    50: '#ecfdf5',
    100: '#d1fae5',
    200: '#a7f3d0',
    300: '#6ee7b7',
    400: '#34d399',
    500: '#10b981',
    600: '#059669',
    700: '#047857',
    800: '#065f46',
    900: '#064e3b',
    950: '#022c22',
  },
  indigo: {
    id: 'indigo',
    name: 'Indigo Impérial',
    subtitle: 'Prestige exécutif et rigueur clinique',
    badge: 'Direction & Audit',
    accent: '#4f46e5',
    50: '#eef2ff',
    100: '#e0e7ff',
    200: '#c7d2fe',
    300: '#a5b4fc',
    400: '#818cf8',
    500: '#6366f1',
    600: '#4f46e5',
    700: '#4338ca',
    800: '#3730a3',
    900: '#312e81',
    950: '#1e1b4b',
  },
  violet: {
    id: 'violet',
    name: 'Améthyste Soin',
    subtitle: 'Douceur et bienveillance pédiatrique',
    badge: 'Maternité & Enfance',
    accent: '#7c3aed',
    50: '#f5f3ff',
    100: '#ede9fe',
    200: '#ddd6fe',
    300: '#c4b5fd',
    400: '#a78bfa',
    500: '#8b5cf6',
    600: '#7c3aed',
    700: '#6d28d9',
    800: '#5b21b6',
    900: '#4c1d95',
    950: '#2e1065',
  },
  rose: {
    id: 'rose',
    name: 'Rubis Cardiologique',
    subtitle: 'Énergie vitale et haute réactivité',
    badge: 'Urgences & Cardio',
    accent: '#e11d48',
    50: '#fff1f2',
    100: '#ffe4e6',
    200: '#fecdd3',
    300: '#fda4af',
    400: '#fb7185',
    500: '#f43f5e',
    600: '#e11d48',
    700: '#be123c',
    800: '#9f1239',
    900: '#881337',
    950: '#4c0519',
  },
  orange: {
    id: 'orange',
    name: 'Ambre Solaire',
    subtitle: 'Chaleur humaine et contraste ergonomique',
    badge: 'Confort Visuel',
    accent: '#ea580c',
    50: '#fff7ed',
    100: '#ffedd5',
    200: '#fed7aa',
    300: '#fdba74',
    400: '#fb923c',
    500: '#f97316',
    600: '#ea580c',
    700: '#c2410c',
    800: '#9a3412',
    900: '#7c2d12',
    950: '#431407',
  },
  cyan: {
    id: 'cyan',
    name: 'Cyan Céleste',
    subtitle: 'Pureté, clarté et légèreté visuelle',
    badge: 'Laboratoire & Imagerie',
    accent: '#0891b2',
    50: '#ecfeff',
    100: '#cffafe',
    200: '#a5f3fc',
    300: '#67e8f9',
    400: '#22d3ee',
    500: '#06b6d4',
    600: '#0891b2',
    700: '#0e7490',
    800: '#155e75',
    900: '#164e63',
    950: '#083344',
  },
  slate: {
    id: 'slate',
    name: 'Graphite Minimaliste',
    subtitle: 'Monochrome pur et contraste moderne',
    badge: 'Sobre & Neutre',
    accent: '#475569',
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
    950: '#020617',
  }
};

export type ThemeColor = keyof typeof THEMES;

export const THEME_LIST = Object.values(THEMES);

// Helpers for Custom Brand Hex Color Shade Generation
function clamp(val: number, min = 0, max = 255): number {
  return Math.min(Math.max(val, min), max);
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return { r, g, b };
  }
  if (clean.length === 6) {
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return { r, g, b };
  }
  return null;
}

export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => clamp(Math.round(n)).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function interpolate(c1: { r: number; g: number; b: number }, c2: { r: number; g: number; b: number }, factor: number): string {
  return rgbToHex(
    c1.r + (c2.r - c1.r) * factor,
    c1.g + (c2.g - c1.g) * factor,
    c1.b + (c2.b - c1.b) * factor
  );
}

export function generateThemeShades(baseHex: string): Record<number | string, string> {
  const rgb = hexToRgb(baseHex) || { r: 37, g: 99, b: 235 };
  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 10, g: 15, b: 30 };

  return {
    50: interpolate(rgb, white, 0.92),
    100: interpolate(rgb, white, 0.82),
    200: interpolate(rgb, white, 0.64),
    300: interpolate(rgb, white, 0.44),
    400: interpolate(rgb, white, 0.22),
    500: baseHex,
    600: interpolate(rgb, black, 0.12),
    700: interpolate(rgb, black, 0.28),
    800: interpolate(rgb, black, 0.44),
    900: interpolate(rgb, black, 0.62),
    950: interpolate(rgb, black, 0.78),
  };
}

export const applyTheme = (themeName: string, customHex?: string) => {
  const root = document.documentElement;
  let shades: Record<string | number, string>;

  if (themeName === 'custom' && customHex) {
    shades = generateThemeShades(customHex);
  } else if (THEMES[themeName as ThemeColor]) {
    const t = THEMES[themeName as ThemeColor];
    shades = {
      50: t[50],
      100: t[100],
      200: t[200],
      300: t[300],
      400: t[400],
      500: t[500],
      600: t[600],
      700: t[700],
      800: t[800],
      900: t[900],
      950: t[950],
    };
  } else {
    const t = THEMES.blue;
    shades = {
      50: t[50],
      100: t[100],
      200: t[200],
      300: t[300],
      400: t[400],
      500: t[500],
      600: t[600],
      700: t[700],
      800: t[800],
      900: t[900],
      950: t[950],
    };
  }

  const numericShades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
  numericShades.forEach((shade) => {
    if (shades[shade]) {
      root.style.setProperty(`--theme-${shade}`, shades[shade]);
    }
  });

  try {
    localStorage.setItem('smarthosto_theme_color', themeName);
    if (customHex) {
      localStorage.setItem('smarthosto_custom_theme_hex', customHex);
    }
  } catch (e) {
    // Ignore localStorage storage exceptions if any
  }

  window.dispatchEvent(new CustomEvent('theme-color-updated', {
    detail: { theme: themeName, customHex }
  }));
};
