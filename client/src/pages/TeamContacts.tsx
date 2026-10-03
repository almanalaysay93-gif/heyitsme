import { trpc } from "@/lib/trpc";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

const failed = (error: unknown) => toast.error(error instanceof Error ? error.message : "That did not work. Please try again.");
const day = (value: Date | string) => new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

const STATUS_LABELS = { new: "New", contacted: "Contacted", "follow-up": "Follow up", converted: "Converted", archived: "Archived" } as const;
type Status = keyof typeof STATUS_LABELS;
const STATUSES = Object.keys(STATUS_LABELS) as Status[];

type Editing = { id: number; notes: string; followUpOn: string; tags: string };

/** Contacts collected through company cards. A member sees their own; admins see and manage every one. */
export function TeamContacts({ workspaceId }: { workspaceId: number }) {
  const utils = trpc.useUtils();
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [view, setView] = useState<"open" | "archived">("open");
  const [holder, setHolder] = useState("");
  const [department, setDepartment] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);

  const list = trpc.teamContacts.list.useInfiniteQuery(
    {
      workspaceId,
      limit: 50,
      view,
      search: term || undefined,
      holder: holder === "unassigned" ? "unassigned" : holder ? Number(holder) : undefined,
      departmentId: department ? Number(department) : undefined,
    },
    { getNextPageParam: last => last.nextCursor ?? undefined }
  );
  const admin = list.data?.pages[0]?.canManageAll === true;
  // People, departments and duplicate groups are admin tools, so they are only asked for once the server says so.
  const members = trpc.teams.members.useQuery({ workspaceId }, { enabled: admin });
  const departments = trpc.teamDepartments.list.useQuery({ workspaceId }, { enabled: admin });
  const duplicates = trpc.teamContacts.duplicates.useQuery({ workspaceId }, { enabled: admin });
  const update = trpc.teamContacts.update.useMutation();
  const reassign = trpc.teamContacts.reassign.useMutation();
  const remove = trpc.teamContacts.remove.useMutation();
  const merge = trpc.teamContacts.merge.useMutation();
  const exportCsv = trpc.teamContacts.exportCsv.useMutation();

  const refresh = () => Promise.all([utils.teamContacts.invalidate(), utils.teams.members.invalidate({ workspaceId }), utils.teams.activity.invalidate({ workspaceId })]);
  const run = async (action: () => Promise<unknown>, done: string) => {
    try {
      await action();
      toast.success(done);
      await refresh();
    } catch (error) {
      failed(error);
    }
  };

  const download = async () => {
    try {
      const file = await exportCsv.mutateAsync({ workspaceId });
      if (file.count === 0) { toast.message("There are no contacts to download yet."); return; }
      // The first character tells spreadsheet apps the file is UTF-8, so names with accents open correctly.
      const url = URL.createObjectURL(new Blob(["﻿", file.csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "team-contacts.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      failed(error);
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    const tags = Array.from(new Set(editing.tags.split(",").map(tag => tag.trim()).filter(Boolean)));
    await run(async () => {
      await update.mutateAsync({ workspaceId, contactId: editing.id, notes: editing.notes.trim() || null, followUpOn: editing.followUpOn || null, tags });
      setEditing(null);
    }, "Contact saved.");
  };

  if (list.isLoading) return <section className="gr-panel" role="status">Loading...</section>;
  if (!list.data) return <section className="gr-panel"><p role="alert" className="gr-error">{list.error?.message ?? "Contacts could not be loaded."}</p></section>;

  const items = list.data.pages.flatMap(page => page.items);
  const people = (members.data?.members ?? []).filter(person => person.status === "active" && person.userId !== null);
  const openDepartments = (departments.data ?? []).filter(candidate => !candidate.archived);
  const groups = duplicates.data?.groups ?? [];
  const filtered = Boolean(term || holder || department);

  return <>
    <section className="gr-panel">
      <h2>Team contacts</h2>
      <p>{admin ? "Everyone who left their details on a company card. They belong to the team, and stay when a person leaves." : "People who left their details on your company card. They belong to the team."}</p>
      <form className="team-contact-filters" onSubmit={event => { event.preventDefault(); setTerm(search.trim()); }}>
        <label className="gr-field">Search<input type="search" maxLength={80} placeholder="Name, email, company or phone" value={search} onChange={event => { setSearch(event.target.value); if (!event.target.value) setTerm(""); }} /></label>
        {admin ? <label className="gr-field">Assigned to<select value={holder} onChange={event => setHolder(event.target.value)}>
          <option value="">Anyone</option>
          <option value="unassigned">Nobody yet</option>
          {people.map(person => <option key={person.id} value={person.id}>{person.name || person.email || "Team member"}</option>)}
        </select></label> : null}
        {admin && openDepartments.length ? <label className="gr-field">Department<select value={department} onChange={event => setDepartment(event.target.value)}>
          <option value="">All departments</option>
          {openDepartments.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
        </select></label> : null}
        <div className="gr-actions">
          <button className="gr-primary">Search</button>
          <button type="button" className="gr-secondary" aria-pressed={view === "archived"} onClick={() => setView(view === "open" ? "archived" : "open")}>{view === "open" ? "Show archived" : "Show current"}</button>
          <button type="button" className="gr-secondary" disabled={exportCsv.isPending} onClick={download}>{exportCsv.isPending ? "Preparing..." : "Download spreadsheet"}</button>
        </div>
      </form>
    </section>

    {admin && groups.length > 0 && view === "open" ? <section className="gr-panel">
      <h2>Possible duplicates</h2>
      <p>These contacts share an email or phone number. Nothing is combined unless you choose to. The contact you keep gains the missing details and notes of the others, which are archived, not deleted.</p>
      <ul className="team-people">
        {groups.map(group => <li key={`${group.reason}:${group.value}`}>
          <div className="team-person">
            <strong>Same {group.reason === "email" ? "email" : "phone number"}: {group.value}</strong>
          </div>
          <ul className="team-duplicates">
            {group.contacts.map(contact => <li key={contact.id}>
              <span><strong>{contact.name}</strong>{contact.company ? ` · ${contact.company}` : ""} · {contact.assignedName ?? "Nobody assigned"} · {day(contact.createdAt)}</span>
              <button type="button" className="gr-secondary" disabled={merge.isPending} onClick={() => {
                const others = group.contacts.filter(other => other.id !== contact.id);
                if (!window.confirm(`Keep ${contact.name} and combine ${others.length === 1 ? "the other contact" : `the ${others.length} others`} into it?`)) return;
                void run(async () => { for (const other of others) await merge.mutateAsync({ workspaceId, keepId: contact.id, mergeId: other.id }); }, "Contacts combined.");
              }}>Keep this one</button>
            </li>)}
          </ul>
        </li>)}
      </ul>
    </section> : null}

    <section className="gr-panel">
      <h2>{view === "archived" ? "Archived contacts" : "Contacts"}</h2>
      {items.length === 0 ? <p>{filtered ? "No contacts match." : view === "archived" ? "Nothing is archived." : "No contacts yet. They appear here when someone leaves their details on a company card."}</p> : null}
      <ul className="team-people">
        {items.map(contact => {
          const role = [contact.title, contact.company].filter(Boolean).join(" · ");
          const source = [contact.cardName ? `From the card of ${contact.cardName}` : null, admin ? (contact.assignedName ? `Assigned to ${contact.assignedName}` : "Nobody assigned") : null, admin && contact.capturedByName && contact.capturedByName !== contact.assignedName ? `Collected by ${contact.capturedByName}` : null, contact.departmentName, day(contact.createdAt)].filter(Boolean).join(" · ");
          return <li key={contact.id}>
            <div className="team-person">
              <strong>{contact.name}</strong>
              {role ? <span>{role}</span> : null}
              <span className="team-contact-links">
                {contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : null}
                {contact.phone ? <a href={`tel:${contact.phone}`}>{contact.phone}</a> : null}
              </span>
              <span>{source}</span>
              {contact.notes ? <span className="team-contact-notes">{contact.notes}</span> : null}
              <span className="team-badges">
                {contact.possibleDuplicate ? <span className="team-status team-request-pending">Possible duplicate</span> : null}
                {contact.followUpOn ? <small>Follow up on {day(contact.followUpOn)}</small> : null}
                {contact.tags.map(tag => <span key={tag} className="team-chip">{tag}</span>)}
              </span>
            </div>
            <div className="team-person-actions">
              <select aria-label={`Status of ${contact.name}`} value={contact.status} onChange={event => run(() => update.mutateAsync({ workspaceId, contactId: contact.id, status: event.target.value as Status }), "Status saved.")}>
                {STATUSES.map(status => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
              </select>
              {admin ? <select aria-label={`Who looks after ${contact.name}`} value={people.find(person => person.userId === contact.assignedUserId)?.id ?? ""} onChange={event => run(() => reassign.mutateAsync({ workspaceId, contactIds: [contact.id], memberId: event.target.value ? Number(event.target.value) : null }), "Contact reassigned.")}>
                <option value="">Nobody assigned</option>
                {people.map(person => <option key={person.id} value={person.id}>{person.name || person.email || "Team member"}</option>)}
              </select> : null}
              <button type="button" className="gr-secondary" onClick={() => setEditing(editing?.id === contact.id ? null : { id: contact.id, notes: contact.notes ?? "", followUpOn: contact.followUpOn ? new Date(contact.followUpOn).toISOString().slice(0, 10) : "", tags: contact.tags.join(", ") })}>Notes</button>
              {admin ? <button type="button" className="gr-secondary team-danger" onClick={() => { if (window.confirm(`Delete ${contact.name} for good? This cannot be undone. To keep the record, set the status to Archived instead.`)) void run(() => remove.mutateAsync({ workspaceId, contactId: contact.id }), "Contact deleted."); }}>Delete</button> : null}
            </div>
            {editing?.id === contact.id ? <form className="team-inline-form" onSubmit={save}>
              <label className="gr-field">Notes<textarea rows={3} maxLength={1000} value={editing.notes} onChange={event => setEditing({ ...editing, notes: event.target.value })} /></label>
              <div className="team-form-grid">
                <label className="gr-field">Follow up on<input type="date" value={editing.followUpOn} onChange={event => setEditing({ ...editing, followUpOn: event.target.value })} /></label>
                <label className="gr-field">Tags, separated by commas<input maxLength={200} value={editing.tags} onChange={event => setEditing({ ...editing, tags: event.target.value })} /></label>
              </div>
              <div className="gr-actions"><button className="gr-primary" disabled={update.isPending}>{update.isPending ? "Saving..." : "Save"}</button><button type="button" className="gr-secondary" onClick={() => setEditing(null)}>Cancel</button></div>
            </form> : null}
          </li>;
        })}
      </ul>
      {list.hasNextPage ? <div className="gr-actions"><button type="button" className="gr-secondary" disabled={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>{list.isFetchingNextPage ? "Loading..." : "Show more"}</button></div> : null}
    </section>
  </>;
}
