import { Player, type PlayerRef } from "@remotion/player";
import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

// The plan comparison as a film. The landing page passes in the plans and rows it read from shared/plans.ts,
// so no price or limit is written here. Every value comes from the frame number.
export type PlanColumn = { name: string; priceMinor: number; per: string };
export type PlanCell = string | boolean;
export type PlanRow = { label: string; cells: [PlanCell, PlanCell, PlanCell] };
type PlansFilmProps = { plans: [PlanColumn, PlanColumn, PlanColumn]; rows: PlanRow[] };

const FPS = 30;
const FRAMES = 390;
const WIDTH = 1280;
const HEIGHT = 720;

const INK = "#0a0908";
const COAL = "#17140f";
const GOLD = "#d8b26a";
const IVORY = "#f3ecdd";
const DIM = "rgba(243,236,221,0.62)";
const LINE = "rgba(216,178,106,0.28)";
const SERIF = '"Instrument Serif", Georgia, serif';
const SANS = '"DM Sans Variable", "DM Sans", system-ui, sans-serif';

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const slam = { stiffness: 420, damping: 26, mass: 0.9 };

const PAD = 44;
const LABEL = 268;
const COL = (WIDTH - PAD * 2 - LABEL) / 3;
const HEAD = 196;
const ROWS_AT = 34;
const ROW_GAP = 11;
// The spotlight rests on Free, Pro, then Teams, and lets go for the last beat.
const SPOT_AT = [150, 215, 280];
const SPOT_END = 345;

function useSlam(delay: number) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: slam });
}

function Head({ plan, index }: { plan: PlanColumn; index: number }) {
  const frame = useCurrentFrame();
  const drop = useSlam(8 + index * 6);
  const counted = interpolate(frame, [14 + index * 6, 44 + index * 6], [0, plan.priceMinor / 100], { ...clamp, easing: Easing.out(Easing.cubic) });
  const free = index === 0;
  return (
    <div
      style={{
        position: "absolute",
        left: PAD + LABEL + COL * index + 8,
        top: 26,
        width: COL - 16,
        height: HEAD - 42,
        padding: "20px 24px",
        boxSizing: "border-box",
        borderRadius: 24,
        background: free ? GOLD : COAL,
        border: `2px solid ${free ? GOLD : LINE}`,
        color: free ? INK : IVORY,
        transform: `translateY(${(1 - drop) * -260}px) rotate(${(1 - drop) * (index - 1) * 9}deg)`,
      }}
    >
      <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase" }}>{plan.name}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
        <div style={{ fontFamily: SERIF, fontSize: 76, lineHeight: 1, letterSpacing: "-0.02em" }}>
          <span style={{ fontFamily: SANS, fontWeight: 300, fontSize: 46, marginRight: 2 }}>₱</span>
          {Math.round(counted).toLocaleString("en-US")}
        </div>
        <div style={{ fontSize: 17, lineHeight: 1.15, opacity: 0.74 }}>{plan.per}</div>
      </div>
    </div>
  );
}

function Tick({ on, at }: { on: boolean; at: number }) {
  const s = useSlam(at);
  if (!on) return <div style={{ width: 22, height: 3, borderRadius: 2, background: "rgba(243,236,221,0.3)", transform: `scaleX(${s})` }} />;
  return (
    <div style={{ width: 34, height: 34, borderRadius: 17, background: GOLD, display: "grid", placeItems: "center", transform: `scale(${s}) rotate(${(1 - s) * -90}deg)` }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={INK} strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
    </div>
  );
}

function Row({ row, index, height, spot }: { row: PlanRow; index: number; height: number; spot: number[] }) {
  const at = ROWS_AT + index * 13;
  const frame = useCurrentFrame();
  const bar = useSlam(at);
  const label = useSlam(at + 3);
  const rule = interpolate(frame, [at, at + 16], [0, 1], { ...clamp, easing: Easing.bezier(0.77, 0, 0.175, 1) });
  return (
    <div style={{ position: "absolute", left: PAD, right: PAD, top: HEAD + index * (height + ROW_GAP), height }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: 16, background: COAL, transformOrigin: "0 50%", transform: `scaleX(${bar})` }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: -6, height: 1, background: LINE, transformOrigin: "0 50%", transform: `scaleX(${rule})` }} />
      <div style={{ position: "absolute", left: 22, top: 0, height, width: LABEL - 30, display: "flex", alignItems: "center", fontSize: 22, fontWeight: 700, color: GOLD, opacity: label, transform: `translateX(${(1 - label) * -60}px)` }}>{row.label}</div>
      {row.cells.map((cell, column) => (
        <Cell key={column} cell={cell} at={at + 7 + column * 4} left={LABEL + COL * column} height={height} dim={spot[column]} />
      ))}
    </div>
  );
}

function Cell({ cell, at, left, height, dim }: { cell: PlanCell; at: number; left: number; height: number; dim: number }) {
  const s = useSlam(at);
  return (
    <div style={{ position: "absolute", left, top: 0, width: COL, height, display: "grid", placeItems: "center", opacity: dim }}>
      {typeof cell === "boolean" ? (
        <Tick on={cell} at={at} />
      ) : (
        <div style={{ padding: "0 14px", textAlign: "center", fontSize: 23, lineHeight: 1.15, fontWeight: 600, color: IVORY, opacity: Math.min(1, s * 1.4), transform: `translateY(${(1 - s) * 34}px) scale(${0.8 + s * 0.2})` }}>{cell}</div>
      )}
    </div>
  );
}

function Film({ plans, rows }: PlansFilmProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rowHeight = (HEIGHT - HEAD - 30 - ROW_GAP * (rows.length - 1)) / rows.length;

  // One gold frame slides from column to column; the other two columns step back while it is on.
  const step = (at: number) => spring({ frame: frame - at, fps, config: { stiffness: 190, damping: 22 } });
  const position = step(SPOT_AT[1]) + step(SPOT_AT[2]);
  const on = interpolate(frame, [SPOT_AT[0], SPOT_AT[0] + 10, SPOT_END, SPOT_END + 12], [0, 1, 1, 0], clamp);
  const spot = [0, 1, 2].map((column) => 1 - on * 0.62 * Math.min(1, Math.abs(position - column)));
  const cut = interpolate(frame, [0, 14], [0, 100], { ...clamp, easing: Easing.bezier(0.77, 0, 0.175, 1) });

  return (
    <AbsoluteFill style={{ background: INK, fontFamily: SANS, color: IVORY, clipPath: `polygon(0 0, ${cut * 1.3}% 0, ${cut * 1.3 - 30}% 100%, 0 100%)` }}>
      <div style={{ position: "absolute", left: PAD, top: 26, width: LABEL - 20, height: HEAD - 42, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
        <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: DIM }}>Compare</div>
        <div style={{ fontFamily: SERIF, fontSize: 54, lineHeight: 0.98, letterSpacing: "-0.02em", marginTop: 8 }}>Free to <span style={{ fontStyle: "italic", color: GOLD }}>Teams</span></div>
      </div>
      {plans.map((plan, index) => (
        <div key={plan.name} style={{ opacity: spot[index] }}><Head plan={plan} index={index} /></div>
      ))}
      {rows.map((row, index) => (
        <Row key={row.label} row={row} index={index} height={rowHeight} spot={spot} />
      ))}
      <div
        style={{
          position: "absolute",
          left: PAD + LABEL + COL * position,
          top: 14,
          width: COL,
          height: HEIGHT - 28,
          boxSizing: "border-box",
          borderRadius: 30,
          border: `3px solid ${GOLD}`,
          boxShadow: "0 0 60px rgba(216,178,106,0.35), inset 0 0 50px rgba(216,178,106,0.1)",
          opacity: on,
          transform: `scale(${1.06 - on * 0.06})`,
        }}
      />
      <div style={{ position: "absolute", top: 0, bottom: 0, left: `${cut * 1.3 - 16}%`, width: 14, background: GOLD, transform: "skewX(-12deg)", opacity: cut >= 100 ? 0 : 1 }} />
    </AbsoluteFill>
  );
}

export default function PlansFilm({ plans, rows }: PlansFilmProps) {
  const ref = useRef<PlayerRef>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    const player = ref.current;
    if (!player) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    player.addEventListener("play", onPlay);
    player.addEventListener("pause", onPause);
    return () => {
      player.removeEventListener("play", onPlay);
      player.removeEventListener("pause", onPause);
    };
  }, []);

  // Plays while it is on screen and rests when it leaves. The button still pauses it.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) ref.current?.play();
        else ref.current?.pause();
      },
      { threshold: 0.35 },
    );
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="nx-film-frame" ref={frameRef}>
      {/* The same facts are in the table beside this film, so the film is hidden from screen readers. */}
      <div aria-hidden="true">
        <Player
          ref={ref}
          component={Film}
          inputProps={{ plans, rows }}
          durationInFrames={FRAMES}
          fps={FPS}
          compositionWidth={WIDTH}
          compositionHeight={HEIGHT}
          autoPlay
          loop
          initiallyMuted
          acknowledgeRemotionLicense
          style={{ width: "100%", aspectRatio: "16 / 9" }}
        />
      </div>
      <button type="button" className="nx-film-toggle" onClick={() => ref.current?.toggle()} aria-label={playing ? "Pause the plan comparison" : "Play the plan comparison"}>
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
    </div>
  );
}
