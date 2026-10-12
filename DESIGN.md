# heyitsme design direction

The interface uses a professional Apple-inspired glass language rather than a generic SaaS dashboard. The product canvas is a pale lilac paper field with navy ink, translucent white panels, soft blur, restrained borders, and three luminous accents: electric violet, tide aqua, and sunset coral.

Typography pairs the functional clarity of DM Sans with italic editorial serif emphasis (Instrument Serif) for the emotional phrase in each page heading. Both fonts are self-hosted through `@fontsource` packages imported in `client/src/main.tsx`, so the CSP can stay `font-src 'self'` and no request goes to Google Fonts. Composition favors asymmetric grids, breathing room, floating card materials, and small microcopy that makes the product feel human. The card itself is a deep ink object with a halo, soft specular lines, and a deliberately tactile hover lift.

Motion is high-energy but controlled. Entrances use staggered opacity and short vertical translation, cards lift rather than scale from zero, buttons compress on press, and sheets use a spring. The reduced-motion media query collapses non-essential animation to near-zero duration.

Key tokens live in `client/src/index.css`: `--ink`, `--paper`, `--purple`, `--aqua`, `--coral`, `--glass`, and the custom easing variables. Route surfaces are composed from shared patterns: `glass-panel`, `card-visual`, `section-kicker`, and the sheet primitives.

## Landing page and personal pages

`/` is the marketing landing page (`client/src/pages/Landing.tsx`, styles in `client/src/pages/landing.css`, every class prefixed `nx-`). It has its own dark language, separate from the app's lilac glass: obsidian `#0a0908`, coal `#17140f`, gold `#d8b26a`, ivory `#f3ecdd`, and indigo `#6b5cff` used only for the NFC and scan accents. Display type is Instrument Serif at very large sizes; body is DM Sans. The serif has no peso glyph, so the `Peso` component sets the sign in DM Sans.

Order: pill nav, hero ("Your card. Free." with the 3D card clip and pointer parallax), a double skewed marquee, a pinned scroll-driven 3D card deck (`#card`, three beats), the how-it-works film (`#how`), eight feature tiles (`#inside`), pricing (`#pricing`, Free at ₱0 leads, three plan cards for Free, Pro and Teams with prices read from `shared/plans.ts`, then the plan comparison), a closing call to action, footer. The free card is the main message: it is in the headline, the nav button, the hero chips, the pricing panel and the close.

`/c/:slug` renders each card as a personal landing page (`pl-*` classes): a parallax cover (uploaded image or an animated mesh in the card theme), a glass hero with a ringed avatar, "Hey, it's" greeting, role, location, and bio, then contact rows, portfolio, and references. On desktop a sticky aside holds the tilting card and QR; on mobile a floating dock keeps Save contact in reach. Theme colors flow in as `--pl-a/--pl-b/--pl-c`. Instrument Serif italic carries the emphasis phrases.

## Video and motion graphics

Motion is code-first. Every video slot on the landing page renders code-made motion graphics, and a Google Flow clip cross-fades in over them only when its file exists (`LoopVideo`, `client/src/lib/media.ts`, shot list in `docs/flow-shots.md`). Code draws the product UI itself, the QR code, phones and toasts, so it stays sharp and truthful. Video carries atmosphere only.

- Hero and final call to action: `client/public/media/cards-orbit.mp4`, an 8 second seamless loop of the dark and light NFC cards circling each other inside rings and orbs. Both cards are turned back toward the camera the whole way round, so only their fronts show. Source is the HyperFrames project in `motion/cards/` (one seekable GSAP timeline, no random values or timers). Re-render with `npx hyperframes render` there, then re-encode to about 900px.
- Page background: `client/public/media/clouds-drift.mp4`, a 16 second seamless loop (960x540) after the dark NFC card art: two long banks of steel-blue cloud drift on the diagonal over a near-black ground, each bank rimmed and threaded by glowing gold veins, with a gold haze behind. Source is the HyperFrames project in `motion/clouds/`: fixed-seed SVG noise made once at 1280px and tiled, so each layer slides exactly one tile. A banded gradient is added to the noise to gather the clouds into banks, and the veins are contour lines of the same noise, so they follow the cloud edges. It sits in a fixed layer behind the whole page (`nx-clouds`, 40% opacity, `z-index: -1` inside the isolated `.nx` root) and plays under reduced motion. Without the clip the ground is plain ink.
- Word tapes under the hero: `client/public/media/band-run.mp4`, a 12 second seamless loop (1920x340) of the gold and ivory tapes running in opposite directions with two surges per loop, spinning stars and a sheen. Source is the HyperFrames project in `motion/band/`. The clip sits in `LoopVideo` with `mix-blend-mode: lighten`, so its dark ground drops out; the CSS tapes are the fallback until it plays. It also plays under reduced motion.
- How-it-works film: `client/src/components/HowFilm.tsx`, a Remotion composition (1280x720, 30fps, 300 frames; Build, Share, Keep at 100 frames each) played in the browser by `@remotion/player`. It is lazy-loaded when the section is near and is not part of the prerendered HTML. It starts playing by itself when 35% of the frame is on screen and pauses when it leaves, also under reduced motion; the button in its corner pauses it. The steps beside it follow the frame and seek on click. Remotion is free for individuals and companies of up to three people; a larger company needs a paid licence.
- Plan comparison: `client/src/components/PlansFilm.tsx`, a Remotion composition (1280x720, 30fps, 390 frames) under the plan cards. Headers drop in and prices count up, six rows slam in, then a gold frame rests on Free, Pro and Teams in turn while the other columns step back. `Landing.tsx` passes in the plans and rows it builds from `shared/plans.ts`, so the film holds no price. It loads and plays like the how-it-works film. The same data is a real `<table>` beside it: kept for screen readers and the prerendered HTML on wide screens, and shown in place of the film at 560px and below.
- Card deck: real `<img>` faces of the four NFC card images (`client/public/media/cards/`) rotated in 3D by scroll position with Framer Motion. The QR tile in the deck is a real, scannable code (`qrcode.react`) for `https://heyitsme.fyi/c/demo`.
- Headings are cut in with a wipe, tiles flip up, the film tilts in. Springs are stiff and short; nothing floats on an endless loop except the two video clips.
- Personal pages: the cover can be a muted looping video, and the avatar ring slowly rotates.

Clips are always muted, looped, inline, lazy-loaded, and paused off-screen. They are skipped under reduced motion or Save-Data, and those visitors keep the code-made fallback.

## Brand assets

`client/public/favicon.svg` is the brand mark (the rotated gradient tile from `.brand-mark`). `favicon.ico`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, and the 1200×630 `og.png` are rendered from it with headless Chrome. Regenerate them together if the mark changes.

## Public card pages (/c/:slug) — glass system (2026-09-26)
- Supersedes the editorial serif direction for card pages. Source of truth: `client/src/components/cardLanding.css` (tokens at top) and `cardMotion.tsx`.
- Adaptive aurora backdrop (3–4 palette blobs, transform-only drift, cover photo blurred in as album-art light). Midnight = dark glass; Tide/Sunset = light glass.
- Glass = things you act on (hero panel, services, visit, contact, take-my-card, nav, dock). Stats and quotes float on the aurora. No glass inside glass, no gradient text.
- Display: DM Sans 800, ≤104px, tracking ≥ -0.04em. Instrument Serif italic only in quotes.
- Photo frames (owner choice): circle, rounded square (superellipse), portrait 4:5 glass card, organic blob (morph stops after 3 cycles). Default per template: portrait / squircle / circle.
- Motion: spring presets in `cardMotion.tsx`; name + lead never start invisible (LCP); everything off for reduced motion; solid panels for reduced transparency / no backdrop-filter.

## Plans and billing surfaces (2026-09-28)
- Plan chips: Free = neutral white chip, Pro = violet (`--purple-deep`), Teams = ink with an aqua underline, Founding Member = warm coral. Every chip carries its plan name in text, so color is never the only signal.
- Locked features show a small Pro chip or lock icon. Existing user content is never blurred or hidden.
- The upgrade dialog is one solid white surface over the workspace (no glass inside glass). Primary action is violet-ink, minimum 48 px tall.
- `/pricing` uses solid white plan cards on the paper field; the Pro card has a 2 px violet border and a "Recommended" label. Cards stack at 900 px and below.
- Styles live in `client/src/components/billing/billing.css` and `client/src/pages/pricing.css`.
- There is no custom Google Pay button. The 2C2P hosted page renders the official wallet buttons; our button reads "Continue to secure checkout".
