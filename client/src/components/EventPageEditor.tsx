import { Fold } from "@/components/Fold";
import { failed, readBase64 } from "@/lib/teamFiles";
import { trpc } from "@/lib/trpc";
import {
  EVENT_PAGE_LIMITS,
  EVENT_PALETTES,
  EVENT_SECTION_LABELS,
  EVENT_THEMES,
  EVENT_THEME_LABELS,
  newSpeakerId,
  resolveEventSections,
  type EventPage,
  type EventSectionId,
} from "@shared/eventPage";
import { EVENT_FONTS, EVENT_FONT_LABELS, type EventFont } from "@shared/events";
import { Check } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

type Target = { workspaceId: number; eventId: number };
export type EventPageChange = (change: (current: EventPage) => EventPage) => void;
type ListKey = "agenda" | "speakers" | "gallery" | "sponsors" | "faq" | "links";
/** Schedule days and sponsor tiers work the same way: a list of names, and each row holds the position of its name. */
const GROUPS = {
  agendaDays: { rows: "agenda", at: "day", section: "schedule", one: "day", title: "Days", add: "Add a day", name: (n: number) => `Day ${n}`, help: "For an event that runs longer than one day. Leave this empty and the schedule is one list." },
  sponsorTiers: { rows: "sponsors", at: "tier", section: "sponsors", one: "tier", title: "Tiers", add: "Add a tier", name: (n: number) => `Tier ${n}`, help: "For example Gold, Silver, Partner. The first tier is shown largest. Leave this empty for one list." },
} as const;
type GroupKey = keyof typeof GROUPS;

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
const FEATURED_FULL = `Up to ${EVENT_PAGE_LIMITS.featured} featured speakers. Unfeature one first.`;
const NEEDS_EVENT = "Pictures can be added once the event is created. Create the event, then come back here.";
const SECTION_HELP: Record<EventSectionId, string> = {
  details: "Shows the description, date, place and organizer from the Details tab.",
  schedule: "What happens and when. Type the time the way you want it shown, for example 9:00 AM.",
  speakers: "Featured speakers get a large block with their bio. The others sit in a grid below.",
  gallery: `Up to ${EVENT_PAGE_LIMITS.gallery} photos. Visitors can open each one full size.`,
  sponsors: "A name, and a logo if you have one. Add a link to make the logo open the sponsor's site.",
  faq: "Short answers to what guests ask most: parking, dress code, what to bring.",
  links: "Tickets, a map, a livestream, a brochure. Each link needs a title.",
};

function moved<T>(list: T[], index: number, by: number): T[] {
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(index + by, 0, item);
  return next;
}

/** The first thing that would stop a save, in words the admin can act on, and the section it is in. */
export function eventPageProblem(page: EventPage): { section: EventSectionId; text: string } | null {
  const row = (section: EventSectionId, index: number, what: string) => ({ section, text: `${EVENT_SECTION_LABELS[section]}, row ${index + 1}: ${what}` });
  const first = <T,>(list: T[], bad: (item: T) => boolean) => list.findIndex(bad);
  let at = first(page.agendaDays, name => !name.trim());
  if (at >= 0) return { section: "schedule", text: `${EVENT_SECTION_LABELS.schedule}: give day ${at + 1} a name, or remove it.` };
  at = first(page.sponsorTiers, name => !name.trim());
  if (at >= 0) return { section: "sponsors", text: `${EVENT_SECTION_LABELS.sponsors}: give tier ${at + 1} a name, or remove it.` };
  at = first(page.agenda, item => !item.title.trim());
  if (at >= 0) return row("schedule", at, "add a title.");
  at = first(page.speakers, item => !item.name.trim());
  if (at >= 0) return row("speakers", at, "add a name.");
  at = first(page.sponsors, item => !item.name.trim());
  if (at >= 0) return row("sponsors", at, "add a name.");
  at = first(page.faq, item => !item.question.trim() || !item.answer.trim());
  if (at >= 0) return row("faq", at, "add a question and an answer.");
  at = first(page.links, item => !item.title.trim() || !item.url.trim());
  if (at >= 0) return row("links", at, "add a title and a link.");
  if (page.speakers.filter(speaker => speaker.featured).length > EVENT_PAGE_LIMITS.featured) return { section: "speakers", text: FEATURED_FULL };
  return null;
}

function RowTools({ name, index, count, onMove, onRemove }: { name: string; index: number; count: number; onMove: (by: number) => void; onRemove: () => void }) {
  return <div className="event-row-tools">
    <button type="button" className="outline-button" disabled={index === 0} aria-label={`Move ${name} up`} onClick={() => onMove(-1)}>↑</button>
    <button type="button" className="outline-button" disabled={index === count - 1} aria-label={`Move ${name} down`} onClick={() => onMove(1)}>↓</button>
    <button type="button" className="outline-button event-danger" aria-label={`Remove ${name}`} onClick={onRemove}>Remove</button>
  </div>;
}

function ImagePick({ url, what, round, busy, onPick, onClear }: { url: string; what: string; round?: boolean; busy: boolean; onPick: (file: File | undefined) => void; onClear: () => void }) {
  return <div className="event-image-pick">
    {url ? <img className={round ? "event-thumb event-thumb-round" : "event-thumb"} src={url} alt="" /> : null}
    <div className="event-row-tools">
      <label className="outline-button team-file">{busy ? "Uploading..." : url ? `Replace ${what}` : `Upload ${what}`}<input type="file" accept={IMAGE_ACCEPT} disabled={busy} onChange={change => { onPick(change.target.files?.[0]); change.target.value = ""; }} /></label>
      {url ? <button type="button" className="outline-button event-danger" onClick={onClear}>Remove {what}</button> : null}
    </div>
  </div>;
}

/**
 * The Page tab of the event builder: section order, and each section's content in a fold.
 * The builder owns the page and saves it; `target` is null until the event exists, and pictures need it.
 */
export function EventPageSections({ page, onChange, target, issue, onBusy }: { page: EventPage; onChange: EventPageChange; target: Target | null; issue: EventSectionId | null; onBusy: (busy: boolean) => void }) {
  const uploadImage = trpc.teamEvents.uploadImage.useMutation();
  const copyCardPhoto = trpc.teamEvents.copyCardPhoto.useMutation();
  const cards = trpc.teamEvents.speakerCards.useQuery(target ?? { workspaceId: 0, eventId: 0 }, { enabled: target !== null });
  const [uploading, setUploading] = useState("");
  useEffect(() => { onBusy(uploading !== ""); }, [uploading]); // eslint-disable-line react-hooks/exhaustive-deps

  const edit = onChange;
  const setList = <K extends ListKey>(key: K, change: (list: EventPage[K]) => EventPage[K]) => edit(current => ({ ...current, [key]: change(current[key]) }));
  const setRow = <K extends ListKey>(key: K, index: number, patch: Partial<EventPage[K][number]>) =>
    setList(key, list => list.map((item, at) => (at === index ? { ...item, ...patch } : item)) as EventPage[K]);
  const tools = (key: ListKey, index: number, name: string) =>
    <RowTools name={name} index={index} count={page[key].length} onMove={by => setList(key, list => moved(list as unknown[], index, by) as never)} onRemove={() => setList(key, list => (list as unknown[]).filter((_, at) => at !== index) as never)} />;

  const field = (label: string, value: string, max: number, onInput: (value: string) => void, extra: { type?: string; placeholder?: string } = {}) =>
    <label className="field-label"><span>{label}</span><input type={extra.type ?? "text"} maxLength={max} placeholder={extra.placeholder} value={value} onChange={event => onInput(event.target.value)} /></label>;
  const area = (label: string, value: string, max: number, rows: number, onInput: (value: string) => void) =>
    <label className="field-label"><span>{label}</span><textarea rows={rows} maxLength={max} value={value} onChange={event => onInput(event.target.value)} /></label>;

  // Rows follow their day or tier when it moves. Rows of a removed one go to the first that is left; nothing is deleted.
  const remap = (key: GroupKey, change: (names: string[]) => string[], to: (at: number) => number) => edit(current => {
    const { rows, at } = GROUPS[key];
    return { ...current, [key]: change(current[key]), [rows]: (current[rows] as Record<string, unknown>[]).map(row => ({ ...row, [at]: to(row[at] as number) })) };
  });
  const groupEditor = (key: GroupKey) => {
    const names = page[key];
    const { one, title, add, name, help } = GROUPS[key];
    return <div className="event-groups">
      <h3>{title}</h3>
      <p className="field-hint">{help}</p>
      {names.map((value, index) => <div className="event-group-row" key={index}>
        {field(`Name of ${one} ${index + 1}`, value, 40, next => edit(current => ({ ...current, [key]: current[key].map((item, at) => (at === index ? next : item)) })))}
        <RowTools name={value || `${one} ${index + 1}`} index={index} count={names.length}
          onMove={by => remap(key, list => moved(list, index, by), at => (at === index ? index + by : at === index + by ? index : at))}
          onRemove={() => remap(key, list => list.filter((_, at) => at !== index), at => (at > index ? at - 1 : at === index ? 0 : at))} />
      </div>)}
      {names.length < EVENT_PAGE_LIMITS[key]
        ? <div className="event-row-tools"><button type="button" className="outline-button" onClick={() => edit(current => ({ ...current, [key]: [...current[key], name(current[key].length + 1)] }))}>{add}</button></div>
        : <p className="field-hint">Up to {EVENT_PAGE_LIMITS[key]} {one}s.</p>}
    </div>;
  };
  /** Which day or tier a row belongs to. Hidden until there are two to choose from. */
  const groupPick = (key: GroupKey, label: string, value: number, onPick: (at: number) => void) =>
    page[key].length > 1 ? <label className="field-label"><span>{label}</span><select value={Math.min(value, page[key].length - 1)} onChange={event => onPick(Number(event.target.value))}>
      {page[key].map((name, at) => <option key={at} value={at}>{name || GROUPS[key].name(at + 1)}</option>)}
    </select></label> : null;

  const speakerName = (id: string) => {
    const at = page.speakers.findIndex(speaker => speaker.id === id);
    return at < 0 ? null : page.speakers[at].name || `Speaker ${at + 1}`;
  };
  const rowSpeakerPick = (index: number, ids: string[]) => {
    if (page.speakers.length === 0) return null;
    const on = ids.filter(id => speakerName(id) !== null);
    const free = page.speakers.filter(speaker => !on.includes(speaker.id));
    return <fieldset className="event-row-speakers">
      <legend>Speakers on this row (optional)</legend>
      {on.length > 0 ? <div className="event-chips">
        {on.map(id => <button type="button" key={id} className="outline-button" aria-label={`Take ${speakerName(id)} off this row`} onClick={() => setRow("agenda", index, { speakerIds: on.filter(item => item !== id) })}>{speakerName(id)} <span aria-hidden="true">×</span></button>)}
      </div> : null}
      {on.length >= EVENT_PAGE_LIMITS.rowSpeakers ? <p className="field-hint">Up to {EVENT_PAGE_LIMITS.rowSpeakers} speakers on one row.</p>
        : free.length > 0 ? <label className="field-label"><span>Add a speaker to this row</span><select value="" onChange={event => { if (event.target.value) setRow("agenda", index, { speakerIds: [...on, event.target.value] }); }}>
          <option value="">Choose a speaker...</option>
          {free.map(speaker => <option key={speaker.id} value={speaker.id}>{speakerName(speaker.id)}</option>)}
        </select></label> : null}
    </fieldset>;
  };

  const sections = resolveEventSections(page);
  const setSections = (change: (list: typeof sections) => typeof sections) => edit(current => ({ ...current, sections: change(resolveEventSections(current)) }));

  const upload = async (file: File | undefined, slot: string): Promise<string | null> => {
    if (!file || !target) return null;
    if (file.size > MAX_IMAGE_BYTES) { toast.error("Image is larger than 3MB. Upload a smaller one."); return null; }
    setUploading(slot);
    try {
      return (await uploadImage.mutateAsync({ ...target, fileName: file.name, contentType: file.type || "image/png", dataBase64: await readBase64(file) })).url;
    } catch (error) {
      failed(error);
      return null;
    } finally {
      setUploading("");
    }
  };

  const addFromCard = async (cardSlug: string) => {
    const card = cards.data?.find(item => item.slug === cardSlug);
    if (!card || !target) return;
    if (page.speakers.length >= EVENT_PAGE_LIMITS.speakers) { toast.error(`Up to ${EVENT_PAGE_LIMITS.speakers} speakers.`); return; }
    setList("speakers", list => [...list, { id: newSpeakerId(), name: (card.name ?? "").slice(0, 80), role: (card.role ?? "").slice(0, 80), bio: (card.bio ?? "").slice(0, 400), photoUrl: "", cardSlug: card.slug, featured: false }]);
    if (!card.hasPhoto) return;
    setUploading(`card-${card.slug}`);
    try {
      const { url } = await copyCardPhoto.mutateAsync({ ...target, cardSlug: card.slug });
      if (url) setList("speakers", list => list.map(speaker => (speaker.cardSlug === card.slug && !speaker.photoUrl ? { ...speaker, photoUrl: url } : speaker)));
      else toast.message("The card's photo could not be copied. You can upload one.");
    } catch (error) {
      failed(error);
    } finally {
      setUploading("");
    }
  };
  const toggleFeatured = (index: number, featured: boolean) => {
    if (featured && page.speakers.filter(speaker => speaker.featured).length >= EVENT_PAGE_LIMITS.featured) { toast.error(FEATURED_FULL); return; }
    setRow("speakers", index, { featured });
  };
  const addPhotos = async (files: FileList | null) => {
    let room = EVENT_PAGE_LIMITS.gallery - page.gallery.length;
    for (const file of Array.from(files ?? [])) {
      if (room <= 0) { toast.error(`Up to ${EVENT_PAGE_LIMITS.gallery} photos.`); break; }
      const url = await upload(file, "gallery");
      if (!url) continue;
      room -= 1;
      setList("gallery", list => [...list, { url, alt: "" }]);
    }
  };

  const addRow = (key: ListKey, label: string, blank: () => void) =>
    page[key].length < EVENT_PAGE_LIMITS[key] ? <div className="event-row-tools"><button type="button" className="outline-button" onClick={blank}>{label}</button></div> : <p className="field-hint">This section is full ({EVENT_PAGE_LIMITS[key]}).</p>;
  const needsEvent = <p className="field-hint">{NEEDS_EVENT}</p>;

  const body: Record<EventSectionId, () => ReactNode> = {
    details: () => null,
    schedule: () => <>
      {groupEditor("agendaDays")}
      <ol className="event-questions">
        {page.agenda.map((item, index) => <li key={index}>
          <div className="event-question-main">
            {field("Time", item.time, 40, time => setRow("agenda", index, { time }), { placeholder: "9:00 AM" })}
            {field("Title", item.title, 120, title => setRow("agenda", index, { title }))}
            {area("Note (optional)", item.note, 300, 2, note => setRow("agenda", index, { note }))}
            {groupPick("agendaDays", "Day", item.day, day => setRow("agenda", index, { day }))}
            {rowSpeakerPick(index, item.speakerIds)}
          </div>
          {tools("agenda", index, item.title || `row ${index + 1}`)}
        </li>)}
      </ol>
      {addRow("agenda", "Add schedule row", () => setList("agenda", list => [...list, { time: "", title: "", note: "", day: list.at(-1)?.day ?? 0, speakerIds: [] }]))}
      {page.speakers.length === 0 ? <p className="field-hint">Add people in the Speakers section to show who is on each row.</p> : null}
    </>,
    speakers: () => <>
      <ol className="event-questions">
        {page.speakers.map((speaker, index) => <li key={index}>
          <div className="event-question-main">
            {field("Name", speaker.name, 80, name => setRow("speakers", index, { name }))}
            {field("Role or title", speaker.role, 80, role => setRow("speakers", index, { role }))}
            {area("Bio (shown for featured speakers)", speaker.bio, 400, 3, bio => setRow("speakers", index, { bio }))}
            {target ? <ImagePick url={speaker.photoUrl} what="photo" round busy={uploading === `speaker-${index}` || uploading === `card-${speaker.cardSlug}`} onPick={file => void upload(file, `speaker-${index}`).then(url => { if (url) setRow("speakers", index, { photoUrl: url }); })} onClear={() => setRow("speakers", index, { photoUrl: "" })} /> : null}
            <label className="team-toggle"><input type="checkbox" checked={speaker.featured} onChange={event => toggleFeatured(index, event.target.checked)} /> Featured speaker</label>
            {speaker.cardSlug ? <label className="team-toggle"><input type="checkbox" checked onChange={() => setRow("speakers", index, { cardSlug: "" })} /> Link to their heyitsme card</label> : null}
          </div>
          {tools("speakers", index, speaker.name || `speaker ${index + 1}`)}
        </li>)}
      </ol>
      {page.speakers.length < EVENT_PAGE_LIMITS.speakers ? <div className="event-add">
        {cards.data?.length ? <label className="field-label"><span>Add from a team card</span><select value="" disabled={uploading !== ""} onChange={event => void addFromCard(event.target.value)}>
          <option value="">Choose a card...</option>
          {cards.data.map(card => <option key={card.slug} value={card.slug}>{card.name}{card.role ? ` · ${card.role}` : ""}</option>)}
        </select></label> : null}
        <button type="button" className="outline-button" onClick={() => setList("speakers", list => [...list, { id: newSpeakerId(), name: "", role: "", bio: "", photoUrl: "", cardSlug: "", featured: false }])}>Add speaker</button>
      </div> : <p className="field-hint">This section is full ({EVENT_PAGE_LIMITS.speakers}).</p>}
      {target
        ? <p className="field-hint">A team card fills in the name, role, bio and photo once. Later changes to the card do not change this page.</p>
        : <p className="field-hint">Speaker photos, and adding a speaker from a team card, come once the event is created.</p>}
    </>,
    gallery: () => <>
      <ol className="event-questions">
        {page.gallery.map((photo, index) => <li key={photo.url}>
          <div className="event-question-main">
            <img className="event-thumb" src={photo.url} alt="" />
            {field("What the photo shows (for screen readers)", photo.alt, 120, alt => setRow("gallery", index, { alt }))}
          </div>
          {tools("gallery", index, `photo ${index + 1}`)}
        </li>)}
      </ol>
      {!target ? needsEvent : page.gallery.length < EVENT_PAGE_LIMITS.gallery
        ? <div className="event-row-tools"><label className="outline-button team-file">{uploading === "gallery" ? "Uploading..." : "Upload photos"}<input type="file" accept={IMAGE_ACCEPT} multiple disabled={uploading !== ""} onChange={change => { void addPhotos(change.target.files); change.target.value = ""; }} /></label></div>
        : <p className="field-hint">This section is full ({EVENT_PAGE_LIMITS.gallery}).</p>}
    </>,
    sponsors: () => <>
      {groupEditor("sponsorTiers")}
      <ol className="event-questions">
        {page.sponsors.map((sponsor, index) => <li key={index}>
          <div className="event-question-main">
            {field("Name", sponsor.name, 80, name => setRow("sponsors", index, { name }))}
            {field("Website (optional)", sponsor.url, 600, url => setRow("sponsors", index, { url }), { type: "url", placeholder: "https://" })}
            {groupPick("sponsorTiers", "Tier", sponsor.tier, tier => setRow("sponsors", index, { tier }))}
            {target ? <ImagePick url={sponsor.logoUrl} what="logo" busy={uploading === `sponsor-${index}`} onPick={file => void upload(file, `sponsor-${index}`).then(url => { if (url) setRow("sponsors", index, { logoUrl: url }); })} onClear={() => setRow("sponsors", index, { logoUrl: "" })} /> : null}
          </div>
          {tools("sponsors", index, sponsor.name || `sponsor ${index + 1}`)}
        </li>)}
      </ol>
      {addRow("sponsors", "Add sponsor", () => setList("sponsors", list => [...list, { name: "", logoUrl: "", url: "", tier: list.at(-1)?.tier ?? 0 }]))}
      {target ? null : <p className="field-hint">Sponsor logos come once the event is created.</p>}
    </>,
    faq: () => <>
      <ol className="event-questions">
        {page.faq.map((item, index) => <li key={index}>
          <div className="event-question-main">
            {field("Question", item.question, 160, question => setRow("faq", index, { question }))}
            {area("Answer", item.answer, 800, 3, answer => setRow("faq", index, { answer }))}
          </div>
          {tools("faq", index, item.question || `question ${index + 1}`)}
        </li>)}
      </ol>
      {addRow("faq", "Add question", () => setList("faq", list => [...list, { question: "", answer: "" }]))}
    </>,
    links: () => <>
      <ol className="event-questions">
        {page.links.map((link, index) => <li key={index}>
          <div className="event-question-main">
            {field("Title", link.title, 80, title => setRow("links", index, { title }))}
            {field("Link", link.url, 600, url => setRow("links", index, { url }), { type: "url", placeholder: "https://" })}
            {field("Short description (optional)", link.description, 160, description => setRow("links", index, { description }))}
          </div>
          {tools("links", index, link.title || `link ${index + 1}`)}
        </li>)}
      </ol>
      {addRow("links", "Add link", () => setList("links", list => [...list, { title: "", url: "", description: "" }]))}
    </>,
  };
  const count = (id: EventSectionId) => (id === "details" ? 0 : id === "schedule" ? page.agenda.length : page[id].length);
  const unfinished = eventPageProblem(page)?.section ?? null;

  return <div className="fold-list">
    {sections.map((section, index) => {
      const label = EVENT_SECTION_LABELS[section.id];
      const items = count(section.id);
      return <Fold key={section.id} title={label} hint={SECTION_HELP[section.id]} attention={unfinished === section.id} forceOpen={issue === section.id}
        meta={section.hidden ? "Hidden" : items ? `${items} added` : section.id === "details" ? "On the page" : "Empty"}>
        <div className="event-row-tools">
          <button type="button" className="outline-button" aria-pressed={!section.hidden} onClick={() => setSections(list => list.map(item => (item.id === section.id ? { ...item, hidden: !item.hidden } : item)))}>{section.hidden ? "Show on page" : "Hide from page"}</button>
          <button type="button" className="outline-button" disabled={index === 0} aria-label={`Move ${label} up`} onClick={() => setSections(list => moved(list, index, -1))}>↑</button>
          <button type="button" className="outline-button" disabled={index === sections.length - 1} aria-label={`Move ${label} down`} onClick={() => setSections(list => moved(list, index, 1))}>↓</button>
        </div>
        {body[section.id]()}
      </Fold>;
    })}
  </div>;
}

/** The Design tab of the event builder: theme, font and accent color. */
export function EventPageLook({ page, onChange }: { page: EventPage; onChange: EventPageChange }) {
  return <>
    <div className="form-section">
      <div className="field-label" role="group" aria-label="Theme">
        <span>Theme</span>
        <div className="theme-picker">
          {EVENT_THEMES.map(theme => <button type="button" key={theme} aria-pressed={page.theme === theme} className={`theme-swatch ${page.theme === theme ? "is-selected" : ""}`} onClick={() => onChange(current => ({ ...current, theme }))}>
            <span className="swatch-colors">
              <i style={{ background: EVENT_PALETTES[theme].paper }} />
              <i style={{ background: EVENT_PALETTES[theme].accent }} />
              <i style={{ background: EVENT_PALETTES[theme].ink }} />
            </span>
            <span>{EVENT_THEME_LABELS[theme]}</span>
            {page.theme === theme ? <Check size={14} aria-hidden="true" /> : null}
          </button>)}
        </div>
      </div>
    </div>
    <div className="form-section">
      <label className="field-label"><span>Font</span><select value={page.font} onChange={event => onChange(current => ({ ...current, font: event.target.value as EventFont }))}>{EVENT_FONTS.map(font => <option key={font} value={font}>{EVENT_FONT_LABELS[font]}</option>)}</select></label>
    </div>
    <div className="form-section">
      <label className="team-toggle"><input type="checkbox" checked={page.accent !== ""} onChange={event => onChange(current => ({ ...current, accent: event.target.checked ? EVENT_PALETTES[current.theme].accent : "" }))} /> Use a different accent from the company color</label>
      {page.accent ? <label className="field-label"><span>Accent color</span><input type="color" value={page.accent} onChange={event => onChange(current => ({ ...current, accent: event.target.value }))} /></label> : null}
      <p className="field-hint">The accent colors the buttons and highlights. When it is off, the page uses your company color from Brand.</p>
    </div>
  </>;
}
