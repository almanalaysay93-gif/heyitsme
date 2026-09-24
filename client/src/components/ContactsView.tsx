import { buildContactVCard, copyToClipboard, csvCell, downloadBlob, formatDate, getInitials, parseTags, safeFileName } from "@/lib/cardKit";
import { AnimatePresence, motion } from "framer-motion";
import { AtSign, Check, Copy, Download, Mail, Phone, Tag, Trash2, UserRoundPlus, UsersRound, X } from "lucide-react";
import { useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";

export type ContactRow = {
  id: number;
  cardId?: number | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  title?: string | null;
  tags?: string | null;
  notes?: string | null;
  source: string;
  followedUp?: boolean;
  seenAt?: string | Date | null;
  createdAt?: string | Date;
};

export type ContactPatch = { tags?: string[]; notes?: string | null; followedUp?: boolean };

type StatusFilter = "all" | "new" | "todo" | "done";

const MAX_TAGS = 12;

function TagEditor({ tags, onChange, suggestions }: { tags: string[]; onChange: (tags: string[]) => void; suggestions: string[] }) {
  const [value, setValue] = useState("");
  const listId = useId();
  const inputId = useId();
  const add = (raw: string) => {
    const tag = raw.trim().replace(/,+$/, "").slice(0, 40);
    setValue("");
    if (!tag) return;
    if (tags.some((existing) => existing.toLowerCase() === tag.toLowerCase())) return;
    if (tags.length >= MAX_TAGS) {
      toast.error(`Up to ${MAX_TAGS} tags per contact.`);
      return;
    }
    onChange([...tags, tag]);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      add(value);
    } else if (event.key === "Backspace" && !value && tags.length) {
      onChange(tags.slice(0, -1));
    }
  };
  return (
    <div className="field-label">
      <label htmlFor={inputId}>Tags</label>
      <div className="tag-editor">
        {tags.map((tag) => (
          <span className="tag-chip" key={tag}>
            {tag}
            <button type="button" onClick={() => onChange(tags.filter((item) => item !== tag))} aria-label={`Remove tag ${tag}`}><X size={12} /></button>
          </span>
        ))}
        <input
          id={inputId}
          value={value}
          list={listId}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => add(value)}
          placeholder={tags.length ? "Add another" : "e.g. investor, conference"}
          maxLength={40}
        />
        <datalist id={listId}>
          {suggestions.filter((tag) => !tags.includes(tag)).map((tag) => <option key={tag} value={tag} />)}
        </datalist>
      </div>
    </div>
  );
}

function ContactSheet({
  contact,
  cardName,
  isNew,
  suggestions,
  onClose,
  onSave,
  onDelete,
}: {
  contact: ContactRow;
  cardName?: string;
  isNew: boolean;
  suggestions: string[];
  onClose: () => void;
  onSave: (patch: ContactPatch) => Promise<boolean>;
  onDelete: () => void;
}) {
  const [tags, setTags] = useState(() => parseTags(contact.tags));
  const [notes, setNotes] = useState(contact.notes ?? "");
  const [followedUp, setFollowedUp] = useState(Boolean(contact.followedUp));
  const [saving, setSaving] = useState(false);
  const titleId = useId();
  const notesId = useId();
  const dirty =
    JSON.stringify(tags) !== JSON.stringify(parseTags(contact.tags)) ||
    notes !== (contact.notes ?? "") ||
    followedUp !== Boolean(contact.followedUp);

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async () => {
    setSaving(true);
    const ok = await onSave({ tags, notes: notes.trim() || null, followedUp });
    setSaving(false);
    if (ok) onClose();
  };

  const downloadContact = () => {
    downloadBlob(new Blob([buildContactVCard(contact)], { type: "text/vcard;charset=utf-8" }), `${safeFileName(contact.name, "contact")}.vcf`);
    toast.success("Contact file (.vcf) downloaded.");
  };

  const copyEmail = async () => {
    if (!contact.email) return;
    if (await copyToClipboard(contact.email)) toast.success("Email copied.");
    else toast.info(contact.email);
  };

  return (
    <motion.div className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="exchange-sheet contact-sheet glass-panel"
        initial={{ opacity: 0, y: 30, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-header">
          <div className="contact-sheet-identity">
            <div className="contact-avatar">{getInitials(contact.name)}</div>
            <div>
              <span className="mini-label">{isNew ? "New contact" : contact.source === "exchange_form" ? "Exchanged details" : "Contact"}</span>
              <h2 id={titleId}>{contact.name}</h2>
              <p>{contact.title || "Contact"}{contact.company ? ` · ${contact.company}` : ""}</p>
            </div>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close contact details" autoFocus><X size={17} /></button>
        </div>

        <p className="contact-sheet-meta">
          Met {formatDate(contact.createdAt)}{cardName ? <> through <strong>{cardName}</strong></> : null}
        </p>

        <div className="contact-sheet-actions">
          {contact.email ? <a className="outline-button" href={`mailto:${contact.email}`}><Mail size={15} /> Email</a> : null}
          {contact.phone ? <a className="outline-button" href={`tel:${contact.phone.replace(/\s+/g, "")}`}><Phone size={15} /> Call</a> : null}
          {contact.email ? <button type="button" className="outline-button" onClick={() => void copyEmail()}><Copy size={15} /> Copy email</button> : null}
          <button type="button" className="outline-button" onClick={downloadContact}><Download size={15} /> Save .vcf</button>
        </div>

        <label className="follow-switch">
          <input type="checkbox" checked={followedUp} onChange={(event) => setFollowedUp(event.target.checked)} />
          <span className="follow-switch-track" aria-hidden="true"><span /></span>
          <span className="follow-switch-copy">
            <strong>Followed up</strong>
            <small>{followedUp ? "Done. Nice work." : "Mark this once you’ve reached out."}</small>
          </span>
        </label>

        <TagEditor tags={tags} onChange={setTags} suggestions={suggestions} />

        <div className="field-label contact-notes">
          <label htmlFor={notesId}>Notes</label>
          <textarea id={notesId} value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} placeholder="Where you met, what you talked about, what to send next." />
        </div>

        <div className="contact-sheet-footer">
          <button type="button" className="text-button danger-text" onClick={onDelete}><Trash2 size={14} /> Delete contact</button>
          <button type="button" className="glass-button glass-button-primary" onClick={() => void save()} disabled={!dirty || saving}>
            {saving ? "Saving…" : <><Check size={15} /> Save changes</>}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function ContactsView({
  contacts,
  cards,
  newIds,
  onUpdate,
  onDelete,
}: {
  contacts: ContactRow[];
  cards: { id: number; displayName: string }[];
  /** Contacts that were unseen when this visit started. */
  newIds: Set<number>;
  onUpdate: (id: number, patch: ContactPatch) => Promise<boolean>;
  onDelete: (id: number) => Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [cardFilter, setCardFilter] = useState("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [openId, setOpenId] = useState<number | null>(null);

  const cardNames = useMemo(() => new Map(cards.map((card) => [card.id, card.displayName || "Untitled card"])), [cards]);
  const allTags = useMemo(() => {
    const seen = new Map<string, string>();
    for (const contact of contacts) for (const tag of parseTags(contact.tags)) if (!seen.has(tag.toLowerCase())) seen.set(tag.toLowerCase(), tag);
    return Array.from(seen.values()).sort((a, b) => a.localeCompare(b));
  }, [contacts]);
  const cardOptions = useMemo(() => {
    const ids = new Set(contacts.map((contact) => contact.cardId).filter((id): id is number => typeof id === "number"));
    return Array.from(ids).map((id) => ({ id, name: cardNames.get(id) ?? "Deleted card" }));
  }, [cardNames, contacts]);

  const counts = useMemo(() => ({
    all: contacts.length,
    new: contacts.filter((contact) => newIds.has(contact.id)).length,
    todo: contacts.filter((contact) => !contact.followedUp).length,
    done: contacts.filter((contact) => contact.followedUp).length,
  }), [contacts, newIds]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return contacts.filter((contact) => {
      if (status === "new" && !newIds.has(contact.id)) return false;
      if (status === "todo" && contact.followedUp) return false;
      if (status === "done" && !contact.followedUp) return false;
      if (cardFilter !== "all" && String(contact.cardId ?? "") !== cardFilter) return false;
      const tags = parseTags(contact.tags);
      if (tagFilter !== "all" && !tags.some((tag) => tag.toLowerCase() === tagFilter.toLowerCase())) return false;
      if (!query) return true;
      return [contact.name, contact.company, contact.email, contact.phone, contact.title, contact.notes, ...tags]
        .some((field) => field?.toLowerCase().includes(query));
    });
  }, [cardFilter, contacts, newIds, search, status, tagFilter]);

  const filtersActive = Boolean(search.trim()) || cardFilter !== "all" || tagFilter !== "all" || status !== "all";
  const openContact = contacts.find((contact) => contact.id === openId) ?? null;

  const exportContacts = () => {
    const header = ["name", "email", "phone", "company", "title", "tags", "notes", "followed_up", "card", "source", "met_on"].join(",");
    const rows = visible.map((contact) => [
      contact.name,
      contact.email,
      contact.phone,
      contact.company,
      contact.title,
      parseTags(contact.tags).join("; "),
      contact.notes,
      contact.followedUp ? "yes" : "no",
      contact.cardId ? cardNames.get(contact.cardId) ?? "" : "",
      contact.source,
      contact.createdAt ? new Date(contact.createdAt).toISOString().slice(0, 10) : "",
    ].map(csvCell).join(","));
    // BOM so Excel opens names with accents correctly.
    downloadBlob(new Blob([`﻿${header}\n${rows.join("\n")}`], { type: "text/csv;charset=utf-8" }), "heyitsme-contacts.csv");
    toast.success(`Exported ${visible.length} contact${visible.length === 1 ? "" : "s"}.`);
  };

  const clearFilters = () => {
    setSearch("");
    setCardFilter("all");
    setTagFilter("all");
    setStatus("all");
  };

  const statusTabs: { id: StatusFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "new", label: "New" },
    { id: "todo", label: "Needs follow-up" },
    { id: "done", label: "Followed up" },
  ];

  return (
    <motion.div className="page-stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
      <div className="page-heading-row">
        <div>
          <span className="section-kicker"><UsersRound size={14} /> Your people</span>
          <h1>Keep the<br /><em>good ones close.</em></h1>
          <p>Tag who you met, jot what matters, and check them off once you follow up.</p>
        </div>
        <button type="button" className="outline-button" onClick={exportContacts} disabled={visible.length === 0}><Download size={15} /> Export CSV</button>
      </div>

      <div className="contact-status-tabs" role="group" aria-label="Filter by follow-up status">
        {statusTabs.map((tab) => (
          <button key={tab.id} type="button" aria-pressed={status === tab.id} className={status === tab.id ? "is-active" : ""} onClick={() => setStatus(tab.id)}>
            {tab.label}<span>{counts[tab.id]}</span>
          </button>
        ))}
      </div>

      <div className="contacts-toolbar glass-panel">
        <div className="search-field">
          <AtSign size={16} aria-hidden="true" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search people, companies, notes, tags…" aria-label="Search contacts" />
          {search ? <button type="button" onClick={() => setSearch("")} aria-label="Clear search"><X size={15} /></button> : null}
        </div>
        {cardOptions.length > 1 ? (
          <select className="contacts-filter" value={cardFilter} onChange={(event) => setCardFilter(event.target.value)} aria-label="Filter by card">
            <option value="all">All cards</option>
            {cardOptions.map((card) => <option key={card.id} value={String(card.id)}>{card.name}</option>)}
          </select>
        ) : null}
        {allTags.length ? (
          <select className="contacts-filter" value={tagFilter} onChange={(event) => setTagFilter(event.target.value)} aria-label="Filter by tag">
            <option value="all">All tags</option>
            {allTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
          </select>
        ) : null}
        <span aria-live="polite">{visible.length} of {contacts.length}</span>
      </div>

      <div className="contacts-list glass-panel">
        {visible.map((contact, index) => {
          const tags = parseTags(contact.tags);
          const isNew = newIds.has(contact.id);
          return (
            <motion.div className={`contact-row ${contact.followedUp ? "is-done" : ""}`} key={contact.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(index, 10) * 0.04 }}>
              <button type="button" className="contact-open" onClick={() => setOpenId(contact.id)} aria-label={`Open ${contact.name}${isNew ? ", new" : ""}`}>
                <div className="contact-avatar">{getInitials(contact.name)}</div>
                <div className="contact-main">
                  <strong>{contact.name}{isNew ? <span className="new-pill">New</span> : null}</strong>
                  <span>{contact.title || "Contact"}{contact.company ? ` · ${contact.company}` : ""}</span>
                </div>
                <div className="contact-detail">
                  <span>{contact.email || contact.phone || "No email added"}</span>
                  {tags.length ? (
                    <span className="contact-tags">{tags.slice(0, 3).map((tag) => <small key={tag}><Tag size={10} /> {tag}</small>)}{tags.length > 3 ? <small>+{tags.length - 3}</small> : null}</span>
                  ) : (
                    <small>{contact.notes ? contact.notes.slice(0, 60) : contact.source === "exchange_form" ? "Exchanged details" : "Saved from your card"}</small>
                  )}
                </div>
                <div className="contact-date">{formatDate(contact.createdAt)}</div>
              </button>
              <button
                type="button"
                className={`follow-toggle ${contact.followedUp ? "is-done" : ""}`}
                aria-pressed={Boolean(contact.followedUp)}
                aria-label={contact.followedUp ? `${contact.name}: followed up. Mark as needs follow-up` : `Mark ${contact.name} as followed up`}
                title={contact.followedUp ? "Followed up" : "Mark as followed up"}
                onClick={() => void onUpdate(contact.id, { followedUp: !contact.followedUp })}
              >
                <Check size={16} />
              </button>
            </motion.div>
          );
        })}
        {visible.length === 0 ? (
          <div className="empty-state">
            <UserRoundPlus size={24} />
            {contacts.length === 0 ? (
              <>
                <strong>No contacts yet.</strong>
                <span>When someone exchanges details on your card, they land here.</span>
              </>
            ) : (
              <>
                <strong>No matches.</strong>
                {filtersActive ? <button type="button" className="outline-button" onClick={clearFilters}>Clear filters</button> : null}
              </>
            )}
          </div>
        ) : null}
      </div>

      <AnimatePresence>
        {openContact ? (
          <ContactSheet
            key={openContact.id}
            contact={openContact}
            cardName={openContact.cardId ? cardNames.get(openContact.cardId) : undefined}
            isNew={newIds.has(openContact.id)}
            suggestions={allTags}
            onClose={() => setOpenId(null)}
            onSave={(patch) => onUpdate(openContact.id, patch)}
            onDelete={() => {
              if (!window.confirm(`Delete ${openContact.name}? This cannot be undone.`)) return;
              setOpenId(null);
              void onDelete(openContact.id);
            }}
          />
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}
