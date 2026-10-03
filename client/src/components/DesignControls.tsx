import {
  ANIMATIONS,
  BACKGROUNDS,
  COLORS,
  FONTS,
  GRADIENTS,
  THEMES,
  designSchema,
  designReadable,
  gradientCss,
  qrSchema,
  type CardDesign,
} from "@shared/design";
import type { PageConfig } from "@shared/pageConfig";
import { useBilling, useUpgrade } from "@/lib/billing";
import { useEffect, useState } from "react";
import { QrPreview } from "./QrPreview";
import "./proDesign.css";
import { useAuth } from "@/_core/hooks/useAuth";

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

export function DesignControls({
  config,
  onChange,
}: {
  config: PageConfig;
  onChange: (config: PageConfig) => void;
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
  const options = (
    label: string,
    items: readonly string[],
    current: string,
    select: (v: any, i: number) => void,
    freeCount = 0
  ) => (
    <details className="design-section">
      <summary>{label}</summary>
      <div className="design-grid">
        {items.map((item, i) => (
          <button
            type="button"
            key={item}
            aria-pressed={current === item}
            onClick={() => select(item, i)}
          >
            {item.replaceAll("-", " ")}
            {i >= freeCount ? (
              <small className="plan-chip plan-chip-pro">PRO</small>
            ) : null}
          </button>
        ))}
      </div>
    </details>
  );
  return (
    <div className="pro-design">
      <h2>Design</h2>
      <p>Preview changes instantly. Premium choices stay visible.</p>
      <details className="design-section" open>
        <summary>Theme</summary>
        <div className="design-grid">
          {THEMES.map(t => (
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
              {t.pro ? (
                <small className="plan-chip plan-chip-pro">PRO</small>
              ) : null}
            </button>
          ))}
        </div>
      </details>
      <details className="design-section">
        <summary>Color</summary>
        <div className="design-grid">
          {COLORS.map(([name, color, text], i) => (
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
              {i > 5 ? (
                <small className="plan-chip plan-chip-pro">PRO</small>
              ) : null}
            </button>
          ))}
        </div>
      </details>
      <details className="design-section">
        <summary>
          Gradients <small className="plan-chip plan-chip-pro">PRO</small>
        </summary>
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
      </details>
      {options(
        "Typography",
        FONTS,
        d.font,
        (font, i) => choose({ font }, i > 2),
        3
      )}
      <div className="design-grid">
        {[
          "Modern",
          "Professional",
          "Editorial",
          "Minimal",
          "Bold",
          "Elegant",
        ].map((name, i) => (
          <button
            type="button"
            key={name}
            onClick={() =>
              choose(
                {
                  font: (
                    [
                      "DM Sans",
                      "Arial",
                      "Instrument Serif",
                      "DM Sans",
                      "Space Grotesk",
                      "Playfair Display",
                    ] as const
                  )[i],
                },
                i === 2 || i > 3
              )
            }
          >
            {name}
            {i === 2 || i > 3 ? <small>PRO</small> : null}
          </button>
        ))}
      </div>
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
        2
      )}
      <label>
        Intensity
        <select
          value={d.animation.intensity}
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
      <button
        type="button"
        className="outline-button"
        onClick={() => window.dispatchEvent(new Event("replay-card-animation"))}
      >
        Replay animation
      </button>
      <details className="design-section">
        <summary>
          Custom colors <small className="plan-chip plan-chip-pro">PRO</small>
        </summary>
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
      </details>
      {options(
        "Layout corners",
        ["small", "medium", "large"],
        d.radius,
        radius => choose({ radius }),
        3
      )}
      <details className="design-section">
        <summary>
          Advanced QR <small className="plan-chip plan-chip-pro">PRO</small>
        </summary>
        <QrPreview value="https://heyitsme.fyi/c/demo" design={qr} />
        {(["foreground", "background"] as const).map(key => (
          <label key={key}>
            {key}
            <input
              aria-label={`QR ${key}`}
              type="color"
              value={qr[key]}
              onChange={e => qrChange({ [key]: e.target.value })}
            />
          </label>
        ))}
        <label>
          Rounded modules
          <input
            type="checkbox"
            checked={qr.rounded}
            onChange={e => qrChange({ rounded: e.target.checked })}
          />
        </label>
        <button
          type="button"
          className="outline-button"
          onClick={() => qrChange({ logo: "/favicon.svg" })}
        >
          Use heyitsme brand icon ? PRO
        </button>
        <label>
          Logo URL
          <input
            value={qr.logo}
            onChange={e => qrChange({ logo: e.target.value })}
          />
        </label>
        <label>
          Frame
          <select
            value={qr.frame}
            onChange={e => qrChange({ frame: e.target.value as any })}
          >
            {["none", "simple", "rounded"].map(v => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          CTA text
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
      </details>
      {warning ? <p role="alert">{warning}</p> : null}
    </div>
  );
}
