import { z } from "zod";

export const COLORS = [
  ["White", "#FFFFFF", "#111111"],
  ["Black", "#111111", "#FFFFFF"],
  ["Slate", "#1E293B", "#FFFFFF"],
  ["Navy", "#0F172A", "#FFFFFF"],
  ["Forest", "#163A2B", "#FFFFFF"],
  ["Warm Beige", "#F5F0E8", "#171717"],
  ["Electric Blue", "#1D4ED8", "#FFFFFF"],
  ["Royal Blue", "#1E40AF", "#FFFFFF"],
  ["Deep Navy", "#172554", "#FFFFFF"],
  ["Emerald", "#065F46", "#FFFFFF"],
  ["Forest Green", "#14532D", "#FFFFFF"],
  ["Mint", "#D1FAE5", "#111111"],
  ["Teal", "#115E59", "#FFFFFF"],
  ["Purple", "#581C87", "#FFFFFF"],
  ["Violet", "#5B21B6", "#FFFFFF"],
  ["Lavender", "#EDE9FE", "#111111"],
  ["Rose", "#9F1239", "#FFFFFF"],
  ["Ruby", "#881337", "#FFFFFF"],
  ["Coral", "#FDA4AF", "#111111"],
  ["Orange", "#FDBA74", "#111111"],
  ["Amber", "#FCD34D", "#111111"],
  ["Gold", "#D4AF37", "#111111"],
  ["Champagne", "#F7E7CE", "#111111"],
  ["Graphite", "#27272A", "#FFFFFF"],
  ["Charcoal", "#18181B", "#FFFFFF"],
  ["Midnight", "#020617", "#FFFFFF"],
  ["Ivory", "#FFFBEB", "#111111"],
  ["Sand", "#E7D5B7", "#111111"],
] as const;
export const GRADIENTS = [
  ["Midnight Blue", ["#020617", "#172554"]],
  ["Ocean", ["#0F172A", "#0369A1"]],
  ["Aurora", ["#312E81", "#7C3AED", "#DB2777"]],
  ["Sunset", ["#F97316", "#DB2777"]],
  ["Emerald Night", ["#052E16", "#059669"]],
  ["Purple Dream", ["#4C1D95", "#7C3AED", "#EC4899"]],
  ["Gold Black", ["#09090B", "#78350F", "#D97706"]],
  ["Cyber Blue", ["#020617", "#0284C7", "#22D3EE"]],
  ["Rose Gold", ["#4C0519", "#BE123C", "#FDA4AF"]],
  ["Arctic", ["#E0F2FE", "#F8FAFC"]],
] as const;
export const FONTS = [
  "DM Sans",
  "Arial",
  "Georgia",
  "Inter",
  "Manrope",
  "Space Grotesk",
  "Playfair Display",
  "Instrument Serif",
  "Montserrat",
  "Poppins",
  "System Sans",
] as const;
export const ANIMATIONS = [
  "none",
  "fade-in",
  "fade-up",
  "soft-scale",
  "slide-up",
  "staggered-content",
  "floating-profile",
  "glow-pulse",
  "gradient-flow",
  "aurora",
  "spotlight",
  "shimmer",
  "floating-shapes",
  "parallax",
] as const;
export const BACKGROUNDS = [
  "solid",
  "gradient",
  "mesh",
  "aurora",
  "glass",
  "soft-glow",
  "dark-glow",
  "paper",
  "noise",
] as const;
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export const designSchema = z.object({
  theme: z.string().max(40).default("classic"),
  colors: z.array(hex).min(1).max(3).default(["#FFFFFF"]),
  text: hex.default("#111111"),
  accent: hex.default("#1D4ED8"),
  button: hex.default("#1D4ED8"),
  buttonText: hex.default("#FFFFFF"),
  backgroundType: z.enum(BACKGROUNDS).default("solid"),
  direction: z
    .enum(["bottom", "right", "diagonal", "radial"])
    .default("diagonal"),
  font: z.enum(FONTS).default("DM Sans"),
  headingFont: z.enum(FONTS).optional(),
  buttonStyle: z.enum(["solid", "outline", "glass"]).default("solid"),
  shadow: z.enum(["none", "soft", "elevated"]).default("soft"),
  animation: z
    .object({
      preset: z.enum(ANIMATIONS).default("none"),
      intensity: z.enum(["off", "subtle", "normal"]).default("subtle"),
    })
    .default({ preset: "none", intensity: "subtle" }),
  radius: z.enum(["small", "medium", "large"]).default("large"),
});
export type CardDesign = z.infer<typeof designSchema>;
export function gradientCss(d: Pick<CardDesign, "colors" | "direction">) {
  if (d.colors.length === 1) return d.colors[0];
  return d.direction === "radial"
    ? `radial-gradient(circle, ${d.colors.join(",")})`
    : `linear-gradient(${d.direction === "bottom" ? "180deg" : d.direction === "right" ? "90deg" : "135deg"}, ${d.colors.join(",")})`;
}
export function contrast(a: string, b: string) {
  const lum = (s: string) =>
    [1, 3, 5]
      .map(i => parseInt(s.slice(i, i + 2), 16) / 255)
      .map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
  const x = lum(a),
    y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function gradientTextSurface(d: CardDesign, color: string) {
  const mask =
    contrast(d.text, "#FFFFFF") < contrast(d.text, "#000000") ? 0 : 255;
  return (
    "#" +
    [1, 3, 5]
      .map(i =>
        Math.round(parseInt(color.slice(i, i + 2), 16) * 0.4 + mask * 0.6)
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  );
}
export function renderedBackground(d: CardDesign) {
  return gradientCss({
    ...d,
    colors:
      d.colors.length > 1
        ? d.colors.map(color => gradientTextSurface(d, color))
        : d.colors,
  });
}
export function designReadable(d: CardDesign) {
  return (
    contrast(d.button, d.buttonText) >= 4.5 &&
    d.colors.every(
      color =>
        contrast(
          d.text,
          d.colors.length > 1 ? gradientTextSurface(d, color) : color
        ) >= 4.5
    )
  );
}
export function premiumDesign(d: CardDesign) {
  return (
    !["classic", "minimal", "professional"].includes(d.theme) ||
    d.colors.length !== 1 ||
    !COLORS.slice(0, 6).some(
      c =>
        c[1].toLowerCase() === d.colors[0].toLowerCase() &&
        c[2].toLowerCase() === d.text.toLowerCase()
    ) ||
    !FONTS.slice(0, 3).includes(d.font as any) ||
    (d.headingFont && !FONTS.slice(0, 3).includes(d.headingFont as any)) ||
    d.backgroundType !== "solid" ||
    !["none", "fade-in"].includes(d.animation.preset) ||
    d.accent !== "#1D4ED8" ||
    d.button !== "#1D4ED8" ||
    d.buttonText !== "#FFFFFF" ||
    d.buttonStyle !== "solid"
  );
}
export const THEMES = [
  "Classic",
  "Minimal",
  "Professional",
  "Midnight",
  "Aurora",
  "Glass",
  "Executive",
  "Editorial",
  "Creator",
  "Portfolio",
  "Neon Minimal",
  "Luxury",
  "Gradient",
  "Dark Professional",
  "Modern Corporate",
].map((name, i) => {
  const dark = [3, 4, 5, 6, 10, 11, 12, 13].includes(i);
  const backgrounds = [
    "#FFFFFF",
    "#FFFFFF",
    "#1E293B",
    "#020617",
    "#312E81",
    "#0F172A",
    "#18181B",
    "#F5F0E8",
    "#EDE9FE",
    "#FFFFFF",
    "#09090B",
    "#171717",
    "#0F172A",
    "#1E293B",
    "#F8FAFC",
  ];
  const colors =
    i === 4
      ? [...GRADIENTS[2][1]]
      : i === 12
        ? [...GRADIENTS[1][1]]
        : [backgrounds[i]];
  return {
    name,
    pro: i > 2,
    design: designSchema.parse({
      theme: name.toLowerCase().replaceAll(" ", "-"),
      colors,
      text: dark || i === 2 ? "#FFFFFF" : "#111111",
      backgroundType:
        i === 5 ? "glass" : colors.length > 1 ? "gradient" : "solid",
      font: i === 6 || i === 14 ? "Inter" : i === 8 ? "Poppins" : "DM Sans",
      headingFont:
        i === 7 || i === 11
          ? "Instrument Serif"
          : i === 10
            ? "Space Grotesk"
            : undefined,
      buttonStyle: i === 5 ? "glass" : i === 11 ? "outline" : "solid",
      shadow: i === 1 ? "none" : i === 5 || i === 11 ? "elevated" : "soft",
      animation: {
        preset:
          i === 4
            ? "aurora"
            : i === 8
              ? "staggered-content"
              : i === 12
                ? "gradient-flow"
                : i > 2
                  ? "fade-up"
                  : "none",
        intensity: "subtle",
      },
      radius: i === 6 || i === 7 ? "small" : "large",
    }),
  };
});
export const qrSchema = z
  .object({
    foreground: hex.default("#000000"),
    background: hex.default("#FFFFFF"),
    rounded: z.boolean().default(false),
    logo: z
      .string()
      .max(600)
      .refine(v => !v || /^(https?:\/\/|\/(?!\/))/.test(v))
      .default(""),
    frame: z.enum(["none", "simple", "rounded"]).default("none"),
    cta: z
      .enum([
        "Scan my card",
        "Connect with me",
        "Save my contact",
        "Visit my profile",
      ])
      .default("Scan my card"),
  })
  .refine(
    q =>
      contrast(q.foreground, q.background) >= 7 &&
      contrast(q.background, "#000000") > contrast(q.foreground, "#000000"),
    "QR needs a dark foreground and light background with at least 7:1 contrast"
  );
export type QrDesign = z.infer<typeof qrSchema>;
export function premiumQr(q: QrDesign) {
  return (
    q.foreground !== "#000000" ||
    q.background !== "#FFFFFF" ||
    q.rounded ||
    !!q.logo ||
    q.frame !== "none" ||
    q.cta !== "Scan my card"
  );
}
