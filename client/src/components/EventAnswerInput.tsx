import { LONG_ANSWER_MAX, MAX_RSVP_GUESTS, SHORT_ANSWER_MAX, type EventFieldType } from "@shared/events";

export type EventAnswer = string | boolean | string[];
export type EventQuestion = { id: number; label: string; fieldType: EventFieldType | string; required: boolean; options: string[] | null; standardKey: string | null };

const AUTOCOMPLETE: Record<string, string> = { fullName: "name", email: "email", mobile: "tel", company: "organization", organization: "organization", jobTitle: "organization-title", address: "street-address" };

/** One question of an RSVP form. Used on the public event page and when a team admin edits a response. */
export function EventAnswerInput({ field, value, onChange, required = field.required }: { field: EventQuestion; value: EventAnswer | undefined; onChange: (value: EventAnswer) => void; required?: boolean }) {
  const name = `question-${field.id}`;
  const text = typeof value === "string" ? value : "";
  const list = Array.isArray(value) ? value : [];
  const options = field.options ?? [];
  const autoComplete = AUTOCOMPLETE[field.standardKey ?? ""] ?? "off";
  const label = <>{field.label}{required ? <span className="event-required" aria-hidden="true"> *</span> : null}</>;
  const group = (children: React.ReactNode) => <fieldset className="event-choice"><legend>{label}</legend>{children}</fieldset>;
  const radios = (choices: [string, string][]) =>
    group(choices.map(([choice, shown]) => <label key={choice}><input type="radio" name={name} value={choice} checked={text === choice} required={required} onChange={() => onChange(choice)} /> {shown}</label>));

  switch (field.fieldType as EventFieldType) {
    case "long_text":
      return <label className="gr-field">{label}<textarea name={name} rows={3} maxLength={LONG_ANSWER_MAX} required={required} autoComplete={autoComplete} value={text} onChange={event => onChange(event.target.value)} /></label>;
    case "email":
      return <label className="gr-field">{label}<input type="email" name={name} maxLength={320} required={required} autoComplete={autoComplete} inputMode="email" value={text} onChange={event => onChange(event.target.value)} /></label>;
    case "phone":
      return <label className="gr-field">{label}<input type="tel" name={name} maxLength={40} required={required} autoComplete={autoComplete} inputMode="tel" value={text} onChange={event => onChange(event.target.value)} /></label>;
    case "number":
      return <label className="gr-field">{label}<input type="number" name={name} required={required} inputMode="numeric" min={field.standardKey === "guests" ? 0 : undefined} max={field.standardKey === "guests" ? MAX_RSVP_GUESTS : undefined} value={text} onChange={event => onChange(event.target.value)} /></label>;
    case "date":
      return <label className="gr-field">{label}<input type="date" name={name} required={required} value={text} onChange={event => onChange(event.target.value)} /></label>;
    case "single_select":
      return <label className="gr-field">{label}<select name={name} required={required} value={text} onChange={event => onChange(event.target.value)}>
        <option value="">Choose...</option>
        {options.map(option => <option key={option} value={option}>{option}</option>)}
      </select></label>;
    case "radio":
      return radios(options.map(option => [option, option]));
    case "yes_no":
      return radios([["yes", "Yes"], ["no", "No"]]);
    case "multi_select":
      return group(options.map(option => <label key={option}><input type="checkbox" checked={list.includes(option)} onChange={event => onChange(event.target.checked ? [...list, option] : list.filter(item => item !== option))} /> {option}</label>));
    case "checkbox":
      return <label className="event-tick"><input type="checkbox" name={name} required={required} checked={value === true} onChange={event => onChange(event.target.checked)} /> <span>{label}</span></label>;
    default:
      return <label className="gr-field">{label}<input type="text" name={name} maxLength={SHORT_ANSWER_MAX} required={required} autoComplete={autoComplete} value={text} onChange={event => onChange(event.target.value)} /></label>;
  }
}
