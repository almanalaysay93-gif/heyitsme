# heyitsme design direction

The interface uses a professional Apple-inspired glass language rather than a generic SaaS dashboard. The product canvas is a pale lilac paper field with navy ink, translucent white panels, soft blur, restrained borders, and three luminous accents: electric violet, tide aqua, and sunset coral.

Typography pairs the functional clarity of DM Sans with italic editorial serif emphasis (Instrument Serif) for the emotional phrase in each page heading. Both fonts are self-hosted through `@fontsource` packages imported in `client/src/main.tsx`, so the CSP can stay `font-src 'self'` and no request goes to Google Fonts. Composition favors asymmetric grids, breathing room, floating card materials, and small microcopy that makes the product feel human. The card itself is a deep ink object with a halo, soft specular lines, and a deliberately tactile hover lift.

Motion is high-energy but controlled. Entrances use staggered opacity and short vertical translation, cards lift rather than scale from zero, buttons compress on press, and sheets use a spring. The reduced-motion media query collapses non-essential animation to near-zero duration.

Key tokens live in `client/src/index.css`: `--ink`, `--paper`, `--purple`, `--aqua`, `--coral`, `--glass`, and the custom easing variables. Route surfaces are composed from shared patterns: `glass-panel`, `card-visual`, `section-kicker`, and the sheet primitives.

## Landing page and personal pages

`/` is the marketing landing page (`client/src/pages/Landing.tsx`, `lp-*` classes): a sticky glass pill nav, an editorial hero with a live tilting demo card and theme swatches, a channel marquee, three steps, a bento feature grid, an ink pricing panel ("Start free. Upgrade when it pays."), and a closing call to action. A scroll progress bar and scroll-linked parallax carry the motion.

`/c/:slug` renders each card as a personal landing page (`pl-*` classes): a parallax cover (uploaded image or an animated mesh in the card theme), a glass hero with a ringed avatar, "Hey, it's" greeting, role, location, and bio, then contact rows, portfolio, and references. On desktop a sticky aside holds the tilting card and QR; on mobile a floating dock keeps Save contact in reach. Theme colors flow in as `--pl-a/--pl-b/--pl-c`. Instrument Serif italic carries the emphasis phrases.

## Video and motion graphics

Motion is code-first. Every video slot on the landing page renders code-made motion graphics, and a Google Flow clip cross-fades in over them only when its file exists (`LoopVideo`, `client/src/lib/media.ts`, shot list in `docs/flow-shots.md`). Code draws the product UI itself, the QR code, phones and toasts, so it stays sharp and truthful. Video carries atmosphere only.

- Hero: kinetic word-by-word headline (masked spring rise) and signal rings pulsing behind the demo card.
- "In motion" film: a scroll-linked 3D tilt-in panel on an aurora backdrop, playing `ShareDemo`. That is a four-beat loop: show code, scan, page opens, saved both ways. It has clickable step progress bars and pauses off-screen or on hover.
- Steps: each card has a small looping illustration (build bars, QR ripple, contact rows with checks).
- Final CTA: a full-bleed ambient clip under a paper veil.
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
