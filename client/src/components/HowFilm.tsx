import { Player, type PlayerRef } from "@remotion/player";
import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AbsoluteFill, Easing, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";

// The how-it-works film. Every value comes from the frame number, so it plays the same on every run.
export const FILM_FPS = 30;
export const FILM_SCENE = 100;
export const FILM_FRAMES = FILM_SCENE * 3;

const INK = "#0a0908";
const COAL = "#17140f";
const GOLD = "#d8b26a";
const IVORY = "#f3ecdd";
const INDIGO = "#5b4bff";
const SERIF = '"Instrument Serif", Georgia, serif';
const SANS = '"DM Sans Variable", "DM Sans", system-ui, sans-serif';

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const slam = { stiffness: 420, damping: 26, mass: 0.9 };

function useSlam(delay: number) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: slam });
}

/** A gold bar rips across the frame and the scene is cut in behind it. */
function Scene({ children, tone = INK }: { children: React.ReactNode; tone?: string }) {
  const frame = useCurrentFrame();
  const cut = interpolate(frame, [0, 12], [0, 100], { ...clamp, easing: Easing.bezier(0.77, 0, 0.175, 1) });
  const push = interpolate(frame, [0, 16], [1.12, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill style={{ background: tone, clipPath: `polygon(0 0, ${cut * 1.3}% 0, ${cut * 1.3 - 30}% 100%, 0 100%)` }}>
      <AbsoluteFill style={{ transform: `scale(${push})`, fontFamily: SANS, color: IVORY }}>{children}</AbsoluteFill>
      <div style={{ position: "absolute", top: 0, bottom: 0, left: `${cut * 1.3 - 16}%`, width: 14, background: GOLD, transform: "skewX(-12deg)", opacity: cut >= 100 ? 0 : 1 }} />
    </AbsoluteFill>
  );
}

function Caption({ index, title, line }: { index: string; title: string; line: string }) {
  const frame = useCurrentFrame();
  const a = useSlam(6);
  const b = useSlam(12);
  const lineIn = interpolate(frame, [18, 30], [0, 1], clamp);
  return (
    <div style={{ position: "absolute", left: 84, top: 150, width: 560 }}>
      <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "0.18em", color: GOLD, transform: `translateX(${(1 - a) * -80}px)`, opacity: a }}>{index}</div>
      <div style={{ overflow: "hidden", marginTop: 10 }}>
        <div style={{ fontFamily: SERIF, fontSize: 132, lineHeight: 0.95, letterSpacing: "-0.02em", transform: `translateY(${(1 - b) * 140}px)` }}>{title}</div>
      </div>
      <div style={{ marginTop: 26, fontSize: 30, lineHeight: 1.35, color: "rgba(243,236,221,0.72)", opacity: lineIn, transform: `translateY(${(1 - lineIn) * 18}px)` }}>{line}</div>
    </div>
  );
}

const phone: CSSProperties = {
  position: "absolute",
  right: 150,
  top: 60,
  width: 330,
  height: 600,
  borderRadius: 44,
  background: COAL,
  border: `3px solid ${GOLD}`,
  overflow: "hidden",
};

function Phone({ children, delay = 4, from = 1 }: { children: React.ReactNode; delay?: number; from?: 1 | -1 }) {
  const s = useSlam(delay);
  return (
    <div style={{ position: "absolute", inset: 0, perspective: 1400 }}>
      <div style={{ ...phone, transform: `translateY(${(1 - s) * 520}px) rotateY(${-18 + (1 - s) * 40 * from}deg) rotateX(${6 + (1 - s) * 20}deg)`, boxShadow: "0 40px 80px rgba(0,0,0,0.55)" }}>
        {children}
      </div>
    </div>
  );
}

function Build() {
  const frame = useCurrentFrame();
  const name = "Alex Morgan";
  const typed = name.slice(0, Math.floor(interpolate(frame, [22, 46], [0, name.length], clamp)));
  const avatar = useSlam(16);
  const role = useSlam(50);
  const chips = [useSlam(60), useSlam(65), useSlam(70)];
  const publish = useSlam(78);
  return (
    <Scene>
      <Caption index="01" title="Build" line="Name, role, photo, links. A few minutes, start to finish." />
      <Phone>
        <div style={{ height: 150, background: `linear-gradient(140deg, ${GOLD}, #7a5a22)` }} />
        <div style={{ position: "absolute", left: 28, top: 96, width: 104, height: 104, borderRadius: 52, background: IVORY, border: `5px solid ${COAL}`, transform: `scale(${avatar})`, display: "grid", placeItems: "center", color: INK, fontFamily: SERIF, fontSize: 54 }}>A</div>
        <div style={{ padding: "70px 28px 0" }}>
          <div style={{ fontFamily: SERIF, fontSize: 46, minHeight: 56 }}>
            {typed}
            <span style={{ display: "inline-block", width: 3, height: 38, marginLeft: 4, background: GOLD, opacity: frame < 50 && frame % 12 < 6 ? 1 : 0 }} />
          </div>
          <div style={{ marginTop: 6, fontSize: 21, color: "rgba(243,236,221,0.7)", opacity: role, transform: `translateX(${(1 - role) * -30}px)` }}>Creative director</div>
          <div style={{ display: "flex", gap: 10, marginTop: 26 }}>
            {["LinkedIn", "WhatsApp", "Work"].map((label, i) => (
              <div key={label} style={{ padding: "10px 14px", borderRadius: 999, border: `2px solid rgba(216,178,106,0.6)`, fontSize: 16, fontWeight: 700, transform: `scale(${chips[i]})` }}>{label}</div>
            ))}
          </div>
          <div style={{ marginTop: 38, padding: "18px 0", borderRadius: 18, background: GOLD, color: INK, textAlign: "center", fontSize: 22, fontWeight: 800, transform: `translateY(${(1 - publish) * 120}px) scale(${0.9 + publish * 0.1})` }}>Publish, free</div>
        </div>
      </Phone>
    </Scene>
  );
}

// A fixed pattern that reads as a QR code. Drawn, not scannable.
const QR_SIZE = 21;
function finder(row: number, col: number) {
  const inBox = (r: number, c: number) => r >= 0 && r < 7 && c >= 0 && c < 7;
  for (const [r0, c0] of [[0, 0], [0, QR_SIZE - 7], [QR_SIZE - 7, 0]]) {
    const r = row - r0;
    const c = col - c0;
    if (inBox(r, c)) return r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4) ? 1 : 0;
    if (inBox(r + 1, c + 1) || inBox(r - 1, c - 1) || inBox(r + 1, c - 1) || inBox(r - 1, c + 1)) return 0;
  }
  return -1;
}
const QR = Array.from({ length: QR_SIZE * QR_SIZE }, (_, i) => {
  const row = Math.floor(i / QR_SIZE);
  const col = i % QR_SIZE;
  const fixed = finder(row, col);
  return fixed >= 0 ? fixed === 1 : (row * 7 + col * 13 + ((row * col) % 5)) % 3 !== 0;
});

function Share() {
  const frame = useCurrentFrame();
  const qr = useSlam(14);
  const scan = interpolate(frame, [34, 62], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
  const ping = useSlam(64);
  const link = useSlam(72);
  return (
    <Scene tone="#100e0a">
      <Caption index="02" title="Share" line="A QR code for the room. A link for the chat. An NFC tap for the handshake." />
      <Phone from={-1}>
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
          <div style={{ width: 250, height: 250, padding: 18, borderRadius: 26, background: IVORY, transform: `scale(${qr}) rotate(${(1 - qr) * -24}deg)`, display: "grid", gridTemplateColumns: "repeat(21, 1fr)", gap: 0, position: "relative", overflow: "hidden" }}>
            {QR.map((on, i) => <i key={i} style={{ background: on ? INK : "transparent" }} />)}
            <div style={{ position: "absolute", left: 0, right: 0, top: `${scan * 100}%`, height: 8, background: INDIGO, boxShadow: `0 0 26px 8px ${INDIGO}`, opacity: scan > 0 && scan < 1 ? 1 : 0 }} />
          </div>
        </div>
        <div style={{ position: "absolute", left: 24, right: 24, bottom: 30, padding: "16px 18px", borderRadius: 18, background: INK, border: `2px solid ${GOLD}`, fontSize: 19, fontWeight: 700, transform: `translateY(${(1 - link) * 140}px)` }}>heyitsme.fyi/c/alex</div>
      </Phone>
      <div style={{ position: "absolute", right: 60, top: 96, padding: "16px 22px", borderRadius: 999, background: INDIGO, color: "#fff", fontSize: 24, fontWeight: 800, transform: `scale(${ping}) rotate(${6 - ping * 6}deg)` }}>Scanned</div>
    </Scene>
  );
}

function Keep() {
  const frame = useCurrentFrame();
  const rows = [
    { name: "Jordan Lee", note: "Saved your contact", at: 12 },
    { name: "Mina Park", note: "Sent their details", at: 24 },
    { name: "Sam Rivera", note: "Opened from QR", at: 36 },
  ];
  const count = Math.round(interpolate(frame, [12, 56], [0, 3], clamp));
  const stamp = useSlam(62);
  return (
    <Scene>
      <Caption index="03" title="Keep" line="They save you in one tap, or send their details back to your list." />
      <Phone>
        <div style={{ padding: "34px 24px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ fontFamily: SERIF, fontSize: 40 }}>Contacts</div>
            <div style={{ fontSize: 34, fontWeight: 800, color: GOLD }}>{count}</div>
          </div>
          {rows.map((row) => (
            <KeepRow key={row.name} {...row} />
          ))}
        </div>
      </Phone>
      <div style={{ position: "absolute", left: 84, bottom: 70, padding: "14px 26px", border: `4px solid ${GOLD}`, color: GOLD, fontFamily: SERIF, fontSize: 58, transform: `scale(${3 - stamp * 2}) rotate(-5deg)`, opacity: Math.min(1, stamp * 2) }}>Start free</div>
    </Scene>
  );
}

function KeepRow({ name, note, at }: { name: string; note: string; at: number }) {
  const s = useSlam(at);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 18, padding: 16, borderRadius: 20, background: INK, border: "2px solid rgba(216,178,106,0.35)", transform: `translateX(${(1 - s) * 360}px)` }}>
      <div style={{ width: 50, height: 50, borderRadius: 25, background: GOLD, color: INK, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 22 }}>{name[0]}</div>
      <div>
        <div style={{ fontSize: 21, fontWeight: 700 }}>{name}</div>
        <div style={{ fontSize: 16, color: "rgba(243,236,221,0.62)" }}>{note}</div>
      </div>
    </div>
  );
}

function Film() {
  return (
    <AbsoluteFill style={{ background: INK }}>
      <Sequence durationInFrames={FILM_SCENE}><Build /></Sequence>
      <Sequence from={FILM_SCENE} durationInFrames={FILM_SCENE}><Share /></Sequence>
      <Sequence from={FILM_SCENE * 2} durationInFrames={FILM_SCENE}><Keep /></Sequence>
    </AbsoluteFill>
  );
}

type HowFilmProps = {
  /** Step the film is on, 0 to 2. */
  onStep: (step: number) => void;
  /** Set by the step buttons beside the film. */
  seekTo: { step: number; nonce: number } | null;
  autoPlay: boolean;
};

export default function HowFilm({ onStep, seekTo, autoPlay }: HowFilmProps) {
  const ref = useRef<PlayerRef>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(autoPlay);

  useEffect(() => {
    const player = ref.current;
    if (!player) return;
    const onFrame = (event: { detail: { frame: number } }) => onStep(Math.min(2, Math.floor(event.detail.frame / FILM_SCENE)));
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    player.addEventListener("frameupdate", onFrame);
    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    return () => {
      player.removeEventListener("frameupdate", onFrame);
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
    };
  }, [onStep]);

  // The film starts by itself when it scrolls into view and rests when it leaves. The button still pauses it.
  useEffect(() => {
    const frame = frameRef.current;
    if (!autoPlay || !frame) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) ref.current?.play();
        else ref.current?.pause();
      },
      { threshold: 0.35 },
    );
    observer.observe(frame);
    return () => observer.disconnect();
  }, [autoPlay]);

  useEffect(() => {
    if (!seekTo) return;
    ref.current?.seekTo(seekTo.step * FILM_SCENE);
    ref.current?.play();
  }, [seekTo]);

  return (
    <div className="nx-film-frame" ref={frameRef}>
      <Player
        ref={ref}
        component={Film}
        durationInFrames={FILM_FRAMES}
        fps={FILM_FPS}
        compositionWidth={1280}
        compositionHeight={720}
        autoPlay={autoPlay}
        loop
        initiallyMuted
        acknowledgeRemotionLicense
        style={{ width: "100%", aspectRatio: "16 / 9" }}
      />
      <button type="button" className="nx-film-toggle" onClick={() => ref.current?.toggle()} aria-label={playing ? "Pause the walkthrough" : "Play the walkthrough"}>
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
    </div>
  );
}
