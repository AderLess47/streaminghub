/** Farben und Abstände der Website, damit App und Web zusammenpassen. */

export const colors = {
  background: "#060a16",
  surface: "#0d1425",
  surfaceRaised: "#131c30",
  border: "#25304a",
  text: "#f4f7ff",
  muted: "#a8b6cf",
  accent: "#2563eb",
  accentText: "#ffffff",
  success: "#6ee7b7",
  warning: "#fcd34d",
  danger: "#fda4af",
  focus: "#7dd3fc",
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 20,
  xl: 32,
} as const;

export const text = {
  hero: 44,
  title: 30,
  heading: 20,
  body: 16,
  small: 14,
  tiny: 12,
} as const;

/** Fokusrahmen: auf dem Sofa muss erkennbar sein, wo man steht. */
export const focusRing = {
  borderWidth: 3,
  borderColor: colors.focus,
} as const;

export const radius = { card: 18, pill: 999, control: 12 } as const;
