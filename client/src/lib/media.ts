// The landing clip is an 8s seamless loop of the NFC cards in orbit, rendered from motion/cards with
// HyperFrames 0.8.127 and compressed to 900px for the web.
export const landingMedia = {
  cardsLoop: "/media/cards-orbit.mp4",
  // First frame of the clip, shown until the clip itself is ready.
  cardsPoster: "/media/cards-orbit-poster.webp",
  // 12s seamless loop of the two crossing word tapes, rendered from motion/band (1920x340).
  bandLoop: "/media/band-run.mp4",
  cloudsLoop: "/media/clouds-drift.mp4",
} as const satisfies Record<string, string | null>;
