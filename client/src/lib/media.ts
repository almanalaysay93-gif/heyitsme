// The hero clip is rendered from motion/hero with HyperFrames.
// The remaining slots use code-made art until their clips exist.
export const landingMedia = {
  heroLoop: "/media/hero-orbit.mp4",
  filmBackdrop: "/media/hero-orbit.mp4",
  stepBuild: null,
  stepShare: null,
  stepKeep: null,
  finalLoop: null,
} as const satisfies Record<string, string | null>;
