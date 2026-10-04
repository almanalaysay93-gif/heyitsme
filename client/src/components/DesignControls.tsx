import {
  ANIMATIONS,
  BACKGROUNDS,
  COLORS,
  FONTS,
  GRADIENTS,
  THEMES,
  designSchema,
  designReadable,
  fontStack,
  gradientCss,
  qrSchema,
  type CardDesign,
} from "@shared/design";
import type { PageConfig } from "@shared/pageConfig";
import { useBilling, useUpgrade } from "@/lib/billing";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Fold } from "./Fold";
import { QrPreview } from "./QrPreview";
import "./proDesign.css";
import { useAuth } from "@/_core/hooks/useAuth";
import "./proFonts.css";

function HexField({
  value,
  label,
  onChange,
}: {
  value: string;
  label: string;
  onChange: (value: string) => void;
}) {
  const [hex, setHex] = useState(value);
  useEffect(() => setHex(value), [value]);
  return (
    <input
      aria-label={`${label} hex`}
      maxLength={7}
      value={hex}
      aria-invalid={!/^#[0-9a-f]{6}$/i.test(hex)}
      onChange={e => {
        setHex(e.target.value);
        if (/^#[0-9a-f]{6}$/i.test(e.target.value)) onChange(e.target.value);
      }}
      onBlur={() => {
        if (!/^#[0-9a-f]{6}$/i.test(hex)) setHex(value);
      }}
    />
  );
}

const FONT_PRESETS = [
  ["Modern", "DM Sans"],
  ["Professional", "Arial"],
  ["Editorial", "Instrument Serif"],
  ["Minimal", "DM Sans"],
  ["Bold", "Space Grotesk"],
  ["Elegant", "Playfair Display"],
] as const;

/** Play once when the card opens. The rest loop or follow the mouse. */
const ENTRANCES = ["fade-in", "fade-up", "soft-scale", "slide-up", "staggered-content"];
const POINTER_DRIVEN = ["spotlight", "parallax"];

export function DesignControls({
  config,
  onChange,
  onUpload,
  children,
  proExtras,
}: {
  config: PageConfig;
  onChange: (config: PageConfig) => void;
  /** Stores an image and returns its link. Without it, the QR logo upload is not offered. */
  onUpload?: (file: File) => Promise<string>;
  /** More look controls from the builder, listed after the groups anyone can use. */
  children?: ReactNode;
  /** More Pro-only controls, listed with the Pro groups. */
  proExtras?: ReactNode;
}) {
  const { isAuthenticated } = useAuth();
  const billing = useBilling(isAuthenticated);
  const { openUpgrade } = useUpgrade();
  const pro = Boolean(
    billing.data?.entitlements.canRemoveBranding &&
      billing.data.proDesignEnabled
  );
  const d = config.design ?? designSchema.parse({});
  const [warning, setWarning] = useState("");
  const choose = (patch: Partial<CardDesign>, paid = false) => {
    if (paid && !pro) {
      openUpgrade("general");
      return;
    }
    const next = { ...d, ...patch };
    setWarning(
      designReadable(next)
        ? ""
        : "Low contrast. Choose readable text and button colors before saving."
    );
    onChange({ ...config, design: next });
  };
  const qr = config.qr ?? qrSchema.parse({});
  const qrChange = (patch: Partial<typeof qr>) => {
    if (!pro) {
      openUpgrade("general");
      return;
    }
    const next = qrSchema.safeParse({ ...qr, ...patch });
    if (!next.success) {
      setWarning(
        "QR requires dark modules on a light background with 7:1 contrast."
      );
      return;
    }
    setWarning("");
    onChange({ ...config, qr: next.data });
  };
  // The upload finishes later, so it must apply to the settings as they are then, not as they were when it began.
  const latestQrChange = useRef(qrChange);
  latestQrChange.current = qrChange;
  const logoInput = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const pickLogo = () => {
    if (!pro) {
      openUpgrade("general");
      return;
    }
    logoInput.current?.click();
  };
  const uploadLogo = async (file: File | undefined) => {
    if (!file || !onUpload) return;
    setUploadingLogo(true);
    try {
      const logo = await onUpload(file);
      latestQrChange.current({ logo });
    } catch (error) {
      setWarning(
        error instanceof Error ? error.message : "Logo upload failed. Try again."
      );
    } finally {
      setUploadingLogo(false);
    }
  };
  /**
   * Free choices first. Without Pro, the paid ones follow under a "More with Pro" label,
   * each with its PRO badge. With Pro, it is one plain grid.
   */
  const tiers = <T,>(
    items: readonly T[],
    isPaid: (item: T, index: number) => boolean,
    tile: (item: T, index: number, badge: ReactNode) => ReactNode
  ) => {
    const all = items.map((item, index) => ({ item, index }));
    const paid = pro ? [] : all.filter(({ item, index }) => isPaid(item, index));
    const free = pro ? all : all.filter(({ item, index }) => !isPaid(item, index));
    return (
      <>
        {free.length ? (
          <div className="design-grid">
            {free.map(({ item, index }) => tile(item, index, null))}
          </div>
        ) : null}
        {paid.length ? (
          <>
            <p className="design-more">More with Pro</p>
            <div className="design-grid">
              {paid.map(({ item, index }) => tile(item, index, <small className="plan-chip plan-chip-pro">PRO</small>))}
            </div>
          </>
        ) : null}
      </>
    );
  };
  const proBadge = pro ? null : <small className="plan-chip plan-chip-pro">PRO</small>;
  const options = (
    label: string,
    items: readonly string[],
    current: string,
    select: (v: any, i: number) => void,
    freeCount = 0,
    inOwnFont = false,
    extra?: ReactNode
  ) => (
    <Fold title={label}>
      {tiers(
        items,
        (_, i) => i >= freeCount,
        (item, i, badge) => (
          <button
            type="button"
            key={item}
            aria-pressed={current === item}
            onClick={() => select(item, i)}
          >
            {/* Font names are drawn in their own typeface, so the list doubles as a sample. */}
            {inOwnFont ? (
              <span style={{ fontFamily: fontStack(item) }}>{item}</span>
            ) : (
              item.replaceAll("-", " ")
            )}
            {badge}
          </button>
        )
      )}
      {extra}
    </Fold>
  );
  return (
    <div className="fold-list">
      <div className="pro-design">
        <Fold title="Theme" defaultOpen>
          {tiers(
            THEMES,
            t => t.pro,
            (t, _, badge) => (
              <button
                type="button"
                key={t.name}
                aria-pressed={d.theme === t.design.theme}
                onClick={() => choose(t.design, t.pro)}
              >
                <span
                  className="design-swatch"
                  style={{
                    background: gradientCss(t.design),
                    color: t.design.text,
                  }}
                >
                  Aa
                </span>
                {t.name}
                {badge}
              </button>
            )
          )}
        </Fold>
        <Fold title="Color">
          {tiers(
            COLORS,
            (_, i) => i > 5,
            ([name, color, text], i, badge) => (
              <button
                type="button"
                key={name}
                aria-pressed={d.colors[0] === color}
                onClick={() =>
                  choose(
                    { colors: [color], text, backgroundType: "solid" },
                    i > 5
                  )
                }
              >
                <span
                  className="design-swatch"
                  style={{ background: color, color: text }}
                >
                  Aa
                </span>
                {name}
                {badge}
              </button>
            )
          )}
        </Fold>
        {options(
          "Typography",
          FONTS,
          d.font,
          (font, i) => choose({ font }, i > 2),
          3,
          true,
          <>
            <p className="design-more">Quick picks by style</p>
            <div className="design-grid">
              {FONT_PRESETS.map(([name, font], i) => (
                <button
                  type="button"
                  key={name}
                  onClick={() => choose({ font }, i === 2 || i > 3)}
                >
                  <span style={{ fontFamily: fontStack(font) }}>{name}</span>
                  {!pro && (i === 2 || i > 3) ? (
                    <small className="plan-chip plan-chip-pro">PRO</small>
                  ) : null}
                </button>
              ))}
            </div>
          </>
        )}
        {options(
          "Button style",
          ["solid", "outline", "glass"],
          d.buttonStyle,
          (buttonStyle, i) => choose({ buttonStyle }, i > 0),
          1
        )}
        {options(
          "Background",
          BACKGROUNDS,
          d.backgroundType,
          (backgroundType, i) => choose({ backgroundType }, i > 0),
          1
        )}
        {options(
          "Animation",
          ANIMATIONS,
          d.animation.preset,
          (preset, i) => choose({ animation: { ...d.animation, preset } }, i > 1),
          2,
          false,
          <div className="animation-extras">
            <label>
              Intensity
              <select
                value={d.animation.intensity}
                disabled={d.animation.preset === "none"}
                title={d.animation.preset === "none" ? "Pick an animation first" : undefined}
                onChange={e =>
                  choose(
                    {
                      animation: { ...d.animation, intensity: e.target.value as any },
                    },
                    true
                  )
                }
              >
                {["off", "subtle", "normal"].map(v => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            {/* Only an entrance plays once, so only an entrance has something to replay. */}
            {ENTRANCES.includes(d.animation.preset) ? (
              <button
                type="button"
                className="outline-button"
                disabled={d.animation.intensity === "off"}
                onClick={() => window.dispatchEvent(new Event("replay-card-animation"))}
              >
                Replay animation
              </button>
            ) : d.animation.preset !== "none" ? (
              <small>
                {POINTER_DRIVEN.includes(d.animation.preset)
                  ? "Move the mouse over the preview to see this one."
                  : "This one keeps moving by itself. Look at the preview."}
              </small>
            ) : null}
          </div>
        )}
        {options(
          "Layout corners",
          ["small", "medium", "large"],
          d.radius,
          radius => choose({ radius }),
          3
        )}
      </div>
      {children}
      {pro ? null : <p className="design-more design-more-groups">More with Pro</p>}
      <div className="pro-design">
        <Fold title="Gradients" meta={proBadge}>
          <div className="design-grid">
            {GRADIENTS.map(([name, colors]) => (
              <button
                type="button"
                key={name}
                onClick={() =>
                  choose(
                    {
                      colors: [...colors],
                      text: name === "Arctic" ? "#111111" : "#FFFFFF",
                      backgroundType: "gradient",
                    },
                    true
                  )
                }
              >
                <span
                  className="design-swatch"
                  style={{
                    background: gradientCss({
                      colors: [...colors],
                      direction: d.direction,
                    }),
                  }}
                />
                {name}
              </button>
            ))}
          </div>
          <label>
            Direction
            <select
              value={d.direction}
              disabled={d.colors.length < 2}
              title={d.colors.length < 2 ? "Pick a gradient first" : undefined}
              onChange={e =>
                choose(
                  { direction: e.target.value as CardDesign["direction"] },
                  true
                )
              }
            >
              {["bottom", "right", "diagonal", "radial"].map(v => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        </Fold>
        <Fold title="Custom colors" meta={proBadge}>
          {(
            ["background", "accent", "text", "button", "buttonText"] as const
          ).map(key => (
            <label key={key}>
              {key.replace("buttonText", "Button text")}
              <input
                aria-label={`${key} picker`}
                type="color"
                value={key === "background" ? d.colors[0] : d[key]}
                onChange={e =>
                  choose(
                    key === "background"
                      ? { colors: [e.target.value] }
                      : { [key]: e.target.value },
                    true
                  )
                }
              />
              <HexField
                label={key}
                value={key === "background" ? d.colors[0] : d[key]}
                onChange={color =>
                  choose(
                    key === "background" ? { colors: [color] } : { [key]: color },
                    true
                  )
                }
              />
            </label>
          ))}
          <button type="button" onClick={() => choose(designSchema.parse({}))}>
            Reset colors
          </button>
        </Fold>
        <Fold title="Advanced QR" meta={proBadge}>
          <div className="qr-editor">
          <div className="qr-editor-preview">
            <QrPreview value="https://heyitsme.fyi/c/demo" design={qr} />
          </div>
          <div className="qr-editor-fields">
            <div className="qr-field">
              <span className="qr-field-title">Colors</span>
              <div className="qr-field-row">
                {(
                  [
                    ["foreground", "Dots"],
                    ["background", "Background"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key}>
                    <input
                      aria-label={`QR ${key}`}
                      type="color"
                      value={qr[key]}
                      onChange={e => qrChange({ [key]: e.target.value })}
                    />
                    {label}
                  </label>
                ))}
                <label>
                  <input
                    type="checkbox"
                    checked={qr.rounded}
                    onChange={e => qrChange({ rounded: e.target.checked })}
                  />
                  Rounded dots
                </label>
              </div>
            </div>
            <div className="qr-field">
              <span className="qr-field-title">Center logo</span>
              <div className="qr-field-row">
                {qr.logo ? (
                  <img className="qr-logo-thumb" src={qr.logo} alt="" />
                ) : null}
                {onUpload ? (
                  <button
                    type="button"
                    className="outline-button"
                    disabled={uploadingLogo}
                    onClick={pickLogo}
                  >
                    {uploadingLogo
                      ? "Uploading…"
                      : qr.logo
                        ? "Replace logo"
                        : "Upload your logo"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="outline-button"
                  onClick={() => qrChange({ logo: "/favicon.svg" })}
                >
                  Use heyitsme icon
                </button>
                {qr.logo ? (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => qrChange({ logo: "" })}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <small>
                A square PNG, JPG or WebP works best. Test the code with your
                phone after you add a logo.
              </small>
              <input
                ref={logoInput}
                type="file"
                hidden
                accept="image/png,image/jpeg,image/webp"
                aria-label="QR logo file"
                onChange={e => {
                  void uploadLogo(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </div>
            <div className="qr-field-row">
              <label className="qr-select">
                <span className="qr-field-title">Frame</span>
                <select
                  value={qr.frame}
                  onChange={e => qrChange({ frame: e.target.value as any })}
                >
                  {["none", "simple", "rounded"].map(v => (
                    <option key={v} value={v}>
                      {v[0].toUpperCase() + v.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="qr-select">
                <span className="qr-field-title">Caption</span>
                <select
                  value={qr.cta}
                  onChange={e => qrChange({ cta: e.target.value as any })}
                >
                  {[
                    "Scan my card",
                    "Connect with me",
                    "Save my contact",
                    "Visit my profile",
                  ].map(v => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          </div>
        </Fold>
      </div>
      {proExtras}
      {warning ? <p className="pd-warn" role="alert">{warning}</p> : null}
    </div>
  );
}
