// Marketing clips made in Google Flow live in client/public/media (shot list: docs/flow-shots.md).
// Each slot falls back to code-made motion when its file is missing, so set a slot to null to skip the request.
export const landingMedia = {
  filmBackdrop: "/media/film-backdrop.mp4",
  stepBuild: "/media/step-build.mp4",
  stepShare: "/media/step-share.mp4",
  stepKeep: "/media/step-keep.mp4",
  finalLoop: "/media/final-loop.mp4",
} as const satisfies Record<string, string | null>;
