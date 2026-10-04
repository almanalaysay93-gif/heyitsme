import { failed, readBase64 } from "@/lib/teamFiles";
import { trpc } from "@/lib/trpc";
import {
  EVENT_PAGE_LIMITS,
  EVENT_PALETTES,
  EVENT_SECTION_LABELS,
  EVENT_THEMES,
  EVENT_THEME_LABELS,
  resolveEventSections,
  type EventPage,
  type EventSectionId,
  type EventTheme,
} from "@shared/eventPage";
import { EVENT_FONTS, EVENT_FONT_LABELS, type EventFont } from "@shared/events";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

type Target = { workspaceId: number; eventId: number };
type ListKey = "agenda" | "speakers" | "gallery" | "sponsors" | "faq" | "links";

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp";
const FEATURED_FULL = `Up to ${EVENT_PAGE_LIMITS.featured} featured speakers. Unfeature one first.`;
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

/** The first thing that would stop a save, in words the admin can act on. */
function problem(page: EventPage): string | null {
  const row = (section: EventSectionId, index: number, what: string) => `${EVENT_SECTION_LABELS[section]}, row ${index + 1}: ${what}`;
  const first = <T,>(list: T[], bad: (item: T) => boolean) => list.findIndex(bad);
  let at = first(page.agenda, item => !item.title.trim());
  if (at >= 0) return row("schedule", at, "add a title.");
  at = first(page.speakers, item => !item.name.trim());
  if (at >= 0) return row("speakers", at, "add a name.");
  at = first(page.sponsors, item => !item.name.trim());
  if (at >= 0) return row("sponsors", at, "add a name.");
  at = first(page.faq, item => !item.question.trim() || !item.answer.trim());
  if (at >= 0) return row("faq", at, "add a question and an answer.");
  at = first(page.links, item => !item.title.trim() || !item.url.trim());
  if (at >= 0) return row("links", at, "add a title and a link.");
  if (page.speakers.filter(speaker => speaker.featured).length > EVENT_PAGE_LIMITS.featured) return FEATURED_FULL;
  return null;
}

function RowTools({ name, index, count, onMove, onRemove }: { name: string; index: number; count: number; onMove: (by: number) => void; onRemove: () => void }) {
  return <div className="team-person-actions">
    <button type="button" className="gr-secondary" disabled={index === 0} aria-label={`Move ${name} up`} onClick={() => onMove(-1)}>↑</button>
    <button type="button" className="gr-secondary" disabled={index === count - 1} aria-label={`Move ${name} down`} onClick={() => onMove(1)}>↓</button>
    <button type="button" className="gr-secondary team-danger" aria-label={`Remove ${name}`} onClick={onRemove}>Remove</button>
  </div>;
}

function ImagePick({ url, what, round, busy, onPick, onClear }: { url: string; what: string; round?: boolean; busy: boolean; onPick: (file: File | undefined) => void; onClear: () => void }) {
  return <div className="event-image-pick">
    {url ? <img className={round ? "event-thumb event-thumb-round" : "event-thumb"} src={url} alt="" /> : null}
    <div className="team-person-actions">
      <label className="gr-secondary team-file">{busy ? "Uploading..." : url ? `Replace ${what}` : `Upload ${what}`}<input type="file" accept={IMAGE_ACCEPT} disabled={busy} onChange={change => { onPick(change.target.files?.[0]); change.target.value = ""; }} /></label>
      {url ? <button type="button" className="gr-secondary team-danger" onClick={onClear}>Remove {what}</button> : null}
    </div>
  </div>;
}

/** Team admin editor for an event's public page: the look, the section order, and each section's content. */
export function EventPageEditor({ target, slug, initial, onSaved }: { target: Target; slug: string; initial: EventPage; onSaved: () => Promise<unknown> }) {
  const savePage = trpc.teamEvents.savePage.useMutation();
  const uploadImage = trpc.teamEvents.uploadImage.useMutation();
  const copyCardPhoto = trpc.teamEvents.copyCardPhoto.useMutation();
  const cards = trpc.teamEvents.speakerCards.useQuery(target);
  const [page, setPage] = useState<EventPage>(initial);
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState<EventSectionId | null>(null);
  const [uploading, setUploading] = useState("");

  const edit = (change: (current: EventPage) => EventPage) => { setPage(change); setDirty(true); };
  const setList = <K extends ListKey>(key: K, change: (list: EventPage[K]) => EventPage[K]) => edit(current => ({ ...current, [key]: change(current[key]) }));
  const setRow = <K extends ListKey>(key: K, index: number, patch: Partial<EventPage[K][number]>) =>
    setList(key, list => list.map((item, at) => (at === index ? { ...item, ...patch } : item)) as EventPage[K]);
  const tools = (key: ListKey, index: number, name: string) =>
    <RowTools name={name} index={index} count={page[key].length} onMove={by => setList(key, list => moved(list as unknown[], index, by) as never)} onRemove={() => setList(key, list => (list as unknown[]).filter((_, at) => at !== index) as never)} />;

  const sections = resolveEventSections(page);
  const setSections = (next: typeof sections) => edit(current => ({ ...current, sections: next }));

  const upload = async (file: File | undefined, slot: string): Promise<string | null> => {
    if (!file) return null;
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

  const save = async () => {
    const issue = problem(page);
    if (issue) { toast.error(issue); return; }
    try {
      const saved = await savePage.mutateAsync({ ...target, page: { ...page, sections } });
      setPage(saved.page);
      setDirty(false);
      toast.success("Page saved.");
      await onSaved();
    } catch (error) {
      failed(error);
    }
  };
  const saveButton = <div className="gr-actions">
    <button type="button" className="gr-primary" disabled={savePage.isPending || uploading !== ""} onClick={() => void save()}>{savePage.isPending ? "Saving..." : "Save page"}</button>
    {dirty ? <span className="gr-attribution" role="status">You have changes that are not saved.</span> : null}
  </div>;

  const addFromCard = async (cardSlug: string) => {
    const card = cards.data?.find(item => item.slug === cardSlug);
    if (!card) return;
    if (page.speakers.length >= EVENT_PAGE_LIMITS.speakers) { toast.error(`Up to ${EVENT_PAGE_LIMITS.speakers} speakers.`); return; }
    setList("speakers", list => [...list, { name: (card.name ?? "").slice(0, 80), role: (card.role ?? "").slice(0, 80), bio: (card.bio ?? "").slice(0, 400), photoUrl: "", cardSlug: card.slug, featured: false }]);
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

  const field = (label: string, value: string, max: number, onChange: (value: string) => void, extra: { type?: string; placeholder?: string } = {}) =>
    <label className="gr-field">{label}<input type={extra.type ?? "text"} maxLength={max} placeholder={extra.placeholder} value={value} onChange={event => onChange(event.target.value)} /></label>;
  const area = (label: string, value: string, max: number, rows: number, onChange: (value: string) => void) =>
    <label className="gr-field">{label}<textarea rows={rows} maxLength={max} value={value} onChange={event => onChange(event.target.value)} /></label>;
  const addRow = (key: ListKey, label: string, blank: () => void) =>
    page[key].length < EVENT_PAGE_LIMITS[key] ? <div className="gr-actions"><button type="button" className="gr-secondary" onClick={blank}>{label}</button></div> : <p className="gr-attribution">This section is full ({EVENT_PAGE_LIMITS[key]}).</p>;

  const body: Record<EventSectionId, () => ReactNode> = {
    details: () => null,
    schedule: () => <>
      <ol className="event-questions">
        {page.agenda.map((item, index) => <li key={index}>
          <div className="event-question-main">
            {field("Time", item.time, 40, time => setRow("agenda", index, { time }), { placeholder: "9:00 AM" })}
            {field("Title", item.title, 120, title => setRow("agenda", index, { title }))}
            {area("Note (optional)", item.note, 300, 2, note => setRow("agenda", index, { note }))}
          </div>
          {tools("agenda", index, item.title || `row ${index + 1}`)}
        </li>)}
      </ol>
      {addRow("agenda", "Add schedule row", () => setList("agenda", list => [...list, { time: "", title: "", note: "" }]))}
    </>,
    speakers: () => <>
      <ol className="event-questions">
        {page.speakers.map((speaker, index) => <li key={index}>
          <div className="event-question-main">
            {field("Name", speaker.name, 80, name => setRow("speakers", index, { name }))}
            {field("Role or title", speaker.role, 80, role => setRow("speakers", index, { role }))}
            {area("Bio (shown for featured speakers)", speaker.bio, 400, 3, bio => setRow("speakers", index, { bio }))}
            <ImagePick url={speaker.photoUrl} what="photo" round busy={uploading === `speaker-${index}` || uploading === `card-${speaker.cardSlug}`} onPick={file => void upload(file, `speaker-${index}`).then(url => { if (url) setRow("speakers", index, { photoUrl: url }); })} onClear={() => setRow("speakers", index, { photoUrl: "" })} />
            <label className="team-toggle"><input type="checkbox" checked={speaker.featured} onChange={event => toggleFeatured(index, event.target.checked)} /> Featured speaker</label>
            {speaker.cardSlug ? <label className="team-toggle"><input type="checkbox" checked onChange={() => setRow("speakers", index, { cardSlug: "" })} /> Link to their heyitsme card</label> : null}
          </div>
          {tools("speakers", index, speaker.name || `speaker ${index + 1}`)}
        </li>)}
      </ol>
      {page.speakers.length < EVENT_PAGE_LIMITS.speakers ? <div className="event-add">
        {cards.data?.length ? <label className="gr-field">Add from a team card<select value="" disabled={uploading !== ""} onChange={event => void addFromCard(event.target.value)}>
          <option value="">Choose a card...</option>
          {cards.data.map(card => <option key={card.slug} value={card.slug}>{card.name}{card.role ? ` · ${card.role}` : ""}</option>)}
        </select></label> : null}
        <button type="button" className="gr-secondary" onClick={() => setList("speakers", list => [...list, { name: "", role: "", bio: "", photoUrl: "", cardSlug: "", featured: false }])}>Add speaker</button>
      </div> : <p className="gr-attribution">This section is full ({EVENT_PAGE_LIMITS.speakers}).</p>}
      <p className="gr-attribution">A team card fills in the name, role, bio and photo once. Later changes to the card do not change this page.</p>
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
      {page.gallery.length < EVENT_PAGE_LIMITS.gallery
        ? <div className="gr-actions"><label className="gr-secondary team-file">{uploading === "gallery" ? "Uploading..." : "Upload photos"}<input type="file" accept={IMAGE_ACCEPT} multiple disabled={uploading !== ""} onChange={change => { void addPhotos(change.target.files); change.target.value = ""; }} /></label></div>
        : <p className="gr-attribution">This section is full ({EVENT_PAGE_LIMITS.gallery}).</p>}
    </>,
    sponsors: () => <>
      <ol className="event-questions">
        {page.sponsors.map((sponsor, index) => <li key={index}>
          <div className="event-question-main">
            {field("Name", sponsor.name, 80, name => setRow("sponsors", index, { name }))}
            {field("Website (optional)", sponsor.url, 600, url => setRow("sponsors", index, { url }), { type: "url", placeholder: "https://" })}
            <ImagePick url={sponsor.logoUrl} what="logo" busy={uploading === `sponsor-${index}`} onPick={file => void upload(file, `sponsor-${index}`).then(url => { if (url) setRow("sponsors", index, { logoUrl: url }); })} onClear={() => setRow("sponsors", index, { logoUrl: "" })} />
          </div>
          {tools("sponsors", index, sponsor.name || `sponsor ${index + 1}`)}
        </li>)}
      </ol>
      {addRow("sponsors", "Add sponsor", () => setList("sponsors", list => [...list, { name: "", logoUrl: "", url: "" }]))}
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
  const count = (id: EventSectionId) => (id === "details" ? null : id === "schedule" ? page.agenda.length : page[id].length);

  return <>
    <section className="gr-panel event-edit">
      <h2>Look</h2>
      <p>The page uses the same layout as a Business card page. Pick a theme, then an accent color for buttons and highlights.</p>
      <div className="team-form-grid">
        <label className="gr-field">Theme<select value={page.theme} onChange={event => edit(current => ({ ...current, theme: event.target.value as EventTheme }))}>{EVENT_THEMES.map(theme => <option key={theme} value={theme}>{EVENT_THEME_LABELS[theme]}</option>)}</select></label>
        <label className="gr-field">Font<select value={page.font} onChange={event => edit(current => ({ ...current, font: event.target.value as EventFont }))}>{EVENT_FONTS.map(font => <option key={font} value={font}>{EVENT_FONT_LABELS[font]}</option>)}</select></label>
      </div>
      <label className="team-toggle"><input type="checkbox" checked={page.accent !== ""} onChange={event => edit(current => ({ ...current, accent: event.target.checked ? EVENT_PALETTES[current.theme].accent : "" }))} /> Use a different accent from the company color</label>
      {page.accent ? <label className="gr-field">Accent color<input type="color" value={page.accent} onChange={event => edit(current => ({ ...current, accent: event.target.value }))} /></label> : null}
      {saveButton}
      <div className="gr-actions"><a className="gr-secondary" href={`/event/${slug}?preview=${target.workspaceId}-${target.eventId}`} target="_blank" rel="noopener noreferrer">Preview page</a></div>
      <p className="gr-attribution">The preview shows the last saved version, even before the event is published. Only team admins can open it.</p>
    </section>

    {sections.map((section, index) => {
      const label = EVENT_SECTION_LABELS[section.id];
      const items = count(section.id);
      const expanded = open === section.id;
      return <section key={section.id} className="gr-panel event-edit event-page-section">
        <div className="event-section-bar">
          <h2>{label}{items ? ` (${items})` : ""}{section.hidden ? " · hidden" : ""}</h2>
          <div className="team-person-actions">
            <button type="button" className="gr-secondary" aria-expanded={expanded} aria-controls={`event-section-${section.id}`} onClick={() => setOpen(expanded ? null : section.id)}>{expanded ? "Close" : "Edit"}</button>
            <button type="button" className="gr-secondary" aria-pressed={!section.hidden} onClick={() => setSections(sections.map(item => (item.id === section.id ? { ...item, hidden: !item.hidden } : item)))}>{section.hidden ? "Show on page" : "Hide"}</button>
            <button type="button" className="gr-secondary" disabled={index === 0} aria-label={`Move ${label} up`} onClick={() => setSections(moved(sections, index, -1))}>↑</button>
            <button type="button" className="gr-secondary" disabled={index === sections.length - 1} aria-label={`Move ${label} down`} onClick={() => setSections(moved(sections, index, 1))}>↓</button>
          </div>
        </div>
        {expanded ? <div id={`event-section-${section.id}`}>
          <p>{SECTION_HELP[section.id]}</p>
          {body[section.id]()}
          {saveButton}
        </div> : null}
      </section>;
    })}

    <section className="gr-panel">
      <h2>RSVP</h2>
      <p>The RSVP form is always the last section and cannot be hidden. Set its questions in the RSVP form tab.</p>
      {dirty ? saveButton : null}
    </section>
  </>;
}
