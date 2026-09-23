# heyitsme design direction

The interface uses a professional Apple-inspired glass language rather than a generic SaaS dashboard. The product canvas is a pale lilac paper field with navy ink, translucent white panels, soft blur, restrained borders, and three luminous accents: electric violet, tide aqua, and sunset coral.

Typography pairs the functional clarity of DM Sans with italic editorial serif emphasis for the emotional phrase in each page heading. Composition favors asymmetric grids, breathing room, floating card materials, and small microcopy that makes the product feel human. The card itself is a deep ink object with a halo, soft specular lines, and a deliberately tactile hover lift.

Motion is high-energy but controlled. Entrances use staggered opacity and short vertical translation, cards lift rather than scale from zero, buttons compress on press, and sheets use a spring. The reduced-motion media query collapses non-essential animation to near-zero duration.

Key tokens live in `client/src/index.css`: `--ink`, `--paper`, `--purple`, `--aqua`, `--coral`, `--glass`, and the custom easing variables. Route surfaces are composed from shared patterns: `glass-panel`, `card-visual`, `section-kicker`, and the sheet primitives.
