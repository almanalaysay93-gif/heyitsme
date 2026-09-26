import { hasPendingEdits, isUnusableLink, moveSection, toEmittable, toggleSection } from "@/lib/pageDesigner";
import {
  PAGE_LIMITS,
  SECTION_LABELS,
  TEMPLATE_IDS,
  TEMPLATES,
  parsePageConfig,
  resolveSections,
  switchTemplate,
  type PageConfig,
  type TemplateId,
} from "@shared/pageConfig";
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import "./pageDesigner.css";

type Props = {
  value: string | undefined;
  onChange: (json: string) => void;
  /** The palette's own accent, shown when the owner has not picked one. */
  themeAccent: string;
  /** True while typed rows or links can't be saved yet, so the builder keeps its unsaved-changes guard on. */
  onPendingChange?: (pending: boolean) => void;
};

export function PageDesigner({ value, onChange, themeAccent, onPendingChange }: Props) {
  // Working copy keeps half-typed rows (a service with no name yet); only the valid subset is emitted.
  const [config, setConfig] = useState<PageConfig>(() => parsePageConfig(value));
  const lastEmitted = useRef<string | undefined>(value);

  useEffect(() => {
    // A different card or a discard replaced the value from outside; start over from it.
    if (value !== lastEmitted.current) {
      lastEmitted.current = value;
      setConfig(parsePageConfig(value));
    }
  }, [value]);

  const commit = (next: PageConfig) => {
    setConfig(next);
    const emittable = toEmittable(next);
    if (!emittable) return;
    const json = JSON.stringify(emittable);
    if (json === lastEmitted.current) return;
    lastEmitted.current = json;
    onChange(json);
  };

  const tooLarge = toEmittable(config) === null;
  const sections = resolveSections(config);
  const pending = hasPendingEdits(config);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);
  useEffect(() => () => onPendingChange?.(false), [onPendingChange]);

  const move = (index: number, direction: -1 | 1) => {
    const next = moveSection(sections, index, direction);
    if (next === sections) return;
    commit({ ...config, sections: next });
    setAnnouncement(`${SECTION_LABELS[sections[index].id]} moved to position ${index + direction + 1} of ${sections.length}.`);
  };

  const setRow = <K extends "stats" | "services" | "hours">(key: K, index: number, patch: Partial<PageConfig[K][number]>) =>
    commit({ ...config, [key]: config[key].map((row, i) => (i === index ? { ...row, ...patch } : row)) });
  const removeRow = (key: "stats" | "services" | "hours", index: number) =>
    commit({ ...config, [key]: config[key].filter((_, i) => i !== index) });

  return (
    <div className="pd">
      <TemplatePicker value={config.template} onSelect={(id) => { if (id !== config.template) commit(switchTemplate(config, id)); }} />

      {config.template === "services" ? (
        <div className="pd-block">
          <div className="pd-block-head">
            <h3>Headline</h3>
            <p>Your offer in a few words. It becomes the title of your page.</p>
          </div>
          <TextField label="Headline" value={config.headline} maxLength={80} placeholder="Color, cuts and care in Makati" onChange={(headline) => commit({ ...config, headline })} />
        </div>
      ) : null}

      <div className="pd-block">
        <div className="pd-block-head">
          <h3>Accent color</h3>
          <p>Used for buttons and highlights on your page.</p>
        </div>
        <div className="pd-accent">
          <label className="pd-swatch">
            <input
              type="color"
              value={config.accent || themeAccent}
              onChange={(event) => commit({ ...config, accent: event.target.value })}
              aria-label="Accent color"
            />
            <span>{config.accent ? config.accent.toUpperCase() : "Palette color"}</span>
          </label>
          {config.accent ? (
            <button type="button" className="outline-button pd-small-button" onClick={() => commit({ ...config, accent: "" })}>
              <RotateCcw size={13} /> Reset
            </button>
          ) : null}
        </div>
      </div>

      <div className="pd-block">
        <div className="pd-block-head">
          <h3>Sections</h3>
          <p>Hidden sections keep their place for when you turn them back on.</p>
        </div>
        <ol className="pd-sections">
          {sections.map((section, index) => {
            const label = SECTION_LABELS[section.id];
            const setSections = (next: typeof sections) => commit({ ...config, sections: next });
            return (
              <li key={section.id} className={`pd-section-row${section.hidden ? " is-hidden" : ""}`}>
                <span className="pd-section-index" aria-hidden="true">{index + 1}</span>
                <span className="pd-section-name">{label}</span>
                <span className="pd-section-state">{section.hidden ? "Hidden" : ""}</span>
                <button
                  type="button"
                  className="icon-button"
                  aria-pressed={!section.hidden}
                  aria-label={`Show ${label} on page`}
                  onClick={() => setSections(toggleSection(sections, index))}
                >
                  {section.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Move ${label} up`}
                  aria-disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Move ${label} down`}
                  aria-disabled={index === sections.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown size={14} />
                </button>
              </li>
            );
          })}
        </ol>
        <p className="pd-sr-only" role="status" aria-live="polite">{announcement}</p>
      </div>

      <div className="pd-block">
        <div className="pd-block-head">
          <h3>Primary button</h3>
          <p>One clear next step, shown near the top. Leave it empty to skip.</p>
        </div>
        <div className="field-grid">
          <TextField label="Button label" value={config.cta?.label ?? ""} maxLength={40} placeholder="Book a call" onChange={(label) => commit({ ...config, cta: { label, url: config.cta?.url ?? "" } })} />
          <TextField
            label="Button link"
            value={config.cta?.url ?? ""}
            maxLength={590}
            placeholder="https://cal.com/you"
            warn={isUnusableLink(config.cta?.url ?? "") ? "Use a web address, email or phone number." : undefined}
            onChange={(url) => commit({ ...config, cta: { label: config.cta?.label ?? "", url } })}
          />
        </div>
      </div>

      <div className="pd-block">
        <RowsHead title="Highlights" hint="Short numbers people remember, like 12 years or 300 clients." count={config.stats.length} limit={PAGE_LIMITS.stats} />
        {config.stats.map((row, index) => (
          <div className="pd-row pd-row-stat" key={index}>
            <input className="pd-input" value={row.value} maxLength={16} placeholder="12" aria-label={`Highlight ${index + 1} value`} onChange={(e) => setRow("stats", index, { value: e.target.value })} />
            <input className="pd-input" value={row.label} maxLength={48} placeholder="years in practice" aria-label={`Highlight ${index + 1} label`} onChange={(e) => setRow("stats", index, { label: e.target.value })} />
            <RemoveButton label={`Remove highlight ${index + 1}`} onClick={() => removeRow("stats", index)} />
            {Boolean(row.value.trim()) !== Boolean(row.label.trim()) ? <span className="pd-warn pd-row-warn">Add both a number and a label to show this.</span> : null}
          </div>
        ))}
        <AddButton label="Add highlight" disabled={config.stats.length >= PAGE_LIMITS.stats} onClick={() => commit({ ...config, stats: [...config.stats, { value: "", label: "" }] })} />
      </div>

      <div className="pd-block">
        <RowsHead title="Services & prices" hint="Rows without a name stay here until you fill them in." count={config.services.length} limit={PAGE_LIMITS.services} />
        {config.services.map((row, index) => (
          <div className="pd-service" key={index}>
            <div className="pd-row pd-row-service">
              <input className="pd-input" value={row.name} maxLength={80} placeholder="Service name" aria-label={`Service ${index + 1} name`} onChange={(e) => setRow("services", index, { name: e.target.value })} />
              <input className="pd-input" value={row.price} maxLength={32} placeholder="From $80" aria-label={`Service ${index + 1} price`} onChange={(e) => setRow("services", index, { price: e.target.value })} />
              <RemoveButton label={`Remove service ${index + 1}`} onClick={() => removeRow("services", index)} />
            </div>
            <input className="pd-input" value={row.description} maxLength={240} placeholder="A short line on what's included" aria-label={`Service ${index + 1} description`} onChange={(e) => setRow("services", index, { description: e.target.value })} />
            <input className="pd-input" value={row.url} maxLength={590} placeholder="Booking link (optional)" aria-label={`Service ${index + 1} booking link`} onChange={(e) => setRow("services", index, { url: e.target.value })} />
            {isUnusableLink(row.url) ? <span className="pd-warn">This link won't be saved. Use a web address, email or phone number.</span> : null}
          </div>
        ))}
        <AddButton label="Add service" disabled={config.services.length >= PAGE_LIMITS.services} onClick={() => commit({ ...config, services: [...config.services, { name: "", description: "", price: "", url: "" }] })} />
      </div>

      <div className="pd-block">
        <RowsHead title="Hours & address" hint="Add a row for each set of days." count={config.hours.length} limit={PAGE_LIMITS.hours} />
        {config.hours.map((row, index) => (
          <div className="pd-row pd-row-hours" key={index}>
            <input className="pd-input" value={row.days} maxLength={32} placeholder="Mon – Fri" aria-label={`Hours row ${index + 1} days`} onChange={(e) => setRow("hours", index, { days: e.target.value })} />
            <input className="pd-input" value={row.time} maxLength={40} placeholder="9:00 – 18:00" aria-label={`Hours row ${index + 1} time`} onChange={(e) => setRow("hours", index, { time: e.target.value })} />
            <RemoveButton label={`Remove hours row ${index + 1}`} onClick={() => removeRow("hours", index)} />
            {Boolean(row.days.trim()) !== Boolean(row.time.trim()) ? <span className="pd-warn pd-row-warn">Add both days and times to show this.</span> : null}
          </div>
        ))}
        <AddButton label="Add hours" disabled={config.hours.length >= PAGE_LIMITS.hours} onClick={() => commit({ ...config, hours: [...config.hours, { days: "", time: "" }] })} />
        <TextField label="Address" value={config.address} maxLength={240} placeholder="12 Market Street, Springfield" onChange={(address) => commit({ ...config, address })} />
      </div>

      {tooLarge ? <p className="pd-warn" role="status">This page has more text than we can save. Shorten a few descriptions or links.</p> : null}
    </div>
  );
}

function TemplatePicker({ value, onSelect }: { value: TemplateId; onSelect: (id: TemplateId) => void }) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + TEMPLATE_IDS.length) % TEMPLATE_IDS.length;
    onSelect(TEMPLATE_IDS[next]);
    refs.current[next]?.focus();
  };
  return (
    <div className="pd-templates" role="radiogroup" aria-label="Page template">
      {TEMPLATE_IDS.map((id, index) => {
        const selected = id === value;
        return (
          <button
            key={id}
            ref={(node) => { refs.current[index] = node; }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            className={`pd-template${selected ? " is-selected" : ""}`}
            onClick={() => onSelect(id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            <span className={`pd-sketch pd-sketch-${id}`} aria-hidden="true">
              <i /><i /><i /><i /><i />
            </span>
            <strong>{TEMPLATES[id].label}</strong>
            <span className="pd-template-blurb">{TEMPLATES[id].blurb}</span>
          </button>
        );
      })}
    </div>
  );
}

function TextField({ label, value, onChange, placeholder, maxLength, warn }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; maxLength: number; warn?: string }) {
  return (
    <label className="field-label">
      <span>{label}</span>
      <input value={value} maxLength={maxLength} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      {warn ? <span className="pd-warn">{warn}</span> : null}
    </label>
  );
}

function RowsHead({ title, hint, count, limit }: { title: string; hint: string; count: number; limit: number }) {
  return (
    <div className="pd-block-head">
      <h3>
        {title} <span className="pd-count">{count} of {limit}</span>
      </h3>
      <p>{hint}</p>
    </div>
  );
}

function AddButton({ label, disabled, onClick }: { label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" className="outline-button pd-small-button pd-add" disabled={disabled} onClick={onClick}>
      <Plus size={13} /> {disabled ? "Limit reached" : label}
    </button>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="icon-button" aria-label={label} title="Remove" onClick={onClick}>
      <Trash2 size={14} />
    </button>
  );
}
