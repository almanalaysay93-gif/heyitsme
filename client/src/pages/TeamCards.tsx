import { trpc } from "@/lib/trpc";
import { CARD_STATUS_LABELS, FIELD_LABELS, REQUEST_STATUS_LABELS } from "@shared/teams";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

const failed = (error: unknown) => toast.error(error instanceof Error ? error.message : "That did not work. Please try again.");

type CardForm = { displayName: string; title: string; company: string; email: string; phone: string; location: string; bio: string };
const EMPTY_CARD: CardForm = { displayName: "", title: "", company: "", email: "", phone: "", location: "", bio: "" };

// Empty boxes are sent as "not set", so the server's own checks decide what a card needs.
const toInput = (form: CardForm) => ({
  displayName: form.displayName,
  title: form.title,
  company: form.company.trim() || null,
  email: form.email.trim() || null,
  phone: form.phone.trim() || null,
  location: form.location.trim() || null,
  bio: form.bio.trim() || null,
});

function CardFields({ form, onChange }: { form: CardForm; onChange: (form: CardForm) => void }) {
  const field = (key: keyof CardForm, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="gr-field">{label}<input value={form[key]} onChange={event => onChange({ ...form, [key]: event.target.value })} {...props} /></label>
  );
  return <>
    <div className="team-form-grid">
      {field("displayName", "Name on the card", { required: true, maxLength: 160, autoComplete: "off" })}
      {field("title", "Job title", { required: true, maxLength: 160 })}
      {field("company", "Company", { maxLength: 160 })}
      {field("email", "Work email", { type: "email", maxLength: 320, autoComplete: "off" })}
      {field("phone", "Phone", { maxLength: 64 })}
      {field("location", "Location", { maxLength: 160 })}
    </div>
    <label className="gr-field">Short introduction (optional)<textarea rows={3} maxLength={600} value={form.bio} onChange={event => onChange({ ...form, bio: event.target.value })} /></label>
  </>;
}

/** Company cards. Admins see and manage every card; a member sees the card assigned to them. The server checks each action. */
export function TeamCards({ workspaceId, companyName }: { workspaceId: number; companyName: string }) {
  const utils = trpc.useUtils();
  const list = trpc.teamCards.list.useQuery({ workspaceId });
  const members = trpc.teams.members.useQuery({ workspaceId });
  const create = trpc.teamCards.create.useMutation();
  const update = trpc.teamCards.update.useMutation();
  const publish = trpc.teamCards.publish.useMutation();
  const assign = trpc.teamCards.assign.useMutation();
  const setStatus = trpc.teamCards.setStatus.useMutation();
  const [draft, setDraft] = useState<CardForm>({ ...EMPTY_CARD, company: companyName });
  const [holder, setHolder] = useState("");
  const requestChange = trpc.teamRequests.create.useMutation();
  const applyTemplate = trpc.teamTemplates.applyTo.useMutation();
  // Templates are an admin list, so it is only asked for once the server has said this person manages every card.
  const templates = trpc.teamTemplates.list.useQuery({ workspaceId }, { enabled: list.data?.canManageAll === true });
  const [editing, setEditing] = useState<{ id: number; form: CardForm; note: string } | null>(null);

  const refresh = () => Promise.all([utils.teamCards.list.invalidate({ workspaceId }), utils.teams.members.invalidate({ workspaceId }), utils.teams.activity.invalidate({ workspaceId }), utils.teamRequests.list.invalidate({ workspaceId }), utils.teamTemplates.list.invalidate({ workspaceId })]);
  const run = async (action: () => Promise<unknown>, done: string) => {
    try {
      await action();
      toast.success(done);
      await refresh();
    } catch (error) {
      failed(error);
    }
  };

  if (list.isLoading) return <section className="gr-panel" role="status">Loading...</section>;
  if (!list.data) return <section className="gr-panel"><p role="alert" className="gr-error">{list.error?.message ?? "Cards could not be loaded."}</p></section>;
  const { canManageAll, cards, cardLimit } = list.data;
  // Only people who have joined can hold a card.
  const people = (members.data?.members ?? []).filter(person => person.status === "active");
  const personName = (person: { name: string | null; email: string | null }) => person.name || person.email || "Team member";

  const add = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await create.mutateAsync({ workspaceId, ...toInput(draft), assignMemberId: holder ? Number(holder) : undefined });
      setDraft({ ...EMPTY_CARD, company: companyName });
      setHolder("");
      toast.success("Card created. Publish it when it is ready.");
      await refresh();
    } catch { /* The error shows under the button. */ }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    const card = cards.find(candidate => candidate.id === editing.id);
    if (!card) return;
    const proposed = toInput(editing.form);
    // A member cannot change locked details directly: those go to an admin as a request, the rest is saved now.
    const asked = canManageAll ? [] : card.lockedFields.filter(field => (proposed[field] ?? "") !== (card[field] ?? ""));
    const direct = { ...proposed, ...Object.fromEntries(asked.map(field => [field, card[field]])) } as typeof proposed;
    try {
      await update.mutateAsync({ workspaceId, cardId: card.id, ...direct });
      if (asked.length > 0) await requestChange.mutateAsync({ workspaceId, cardId: card.id, ...proposed, note: editing.note.trim() || null });
      setEditing(null);
      toast.success(asked.length > 0 ? `Card saved. Your change to ${asked.map(field => FIELD_LABELS[field]).join(", ")} was sent to your admin.` : "Card saved.");
      await refresh();
    } catch { /* The error shows under the button. */ }
  };
  const activeTemplates = (templates.data?.templates ?? []).filter(template => !template.archived);

  return <>
    <TeamRequests workspaceId={workspaceId} onChanged={refresh} />
    {canManageAll ? <section className="gr-panel">
      <h2>Create a company card</h2>
      <p>The card belongs to the company. If the person leaves, the card and its link stay with you.</p>
      <form onSubmit={add}>
        <CardFields form={draft} onChange={setDraft} />
        <label className="gr-field">Who uses this card? (optional)
          <select value={holder} onChange={event => setHolder(event.target.value)}>
            <option value="">Nobody yet</option>
            {people.map(person => <option key={person.id} value={person.id}>{personName(person)}</option>)}
          </select>
        </label>
        <div className="gr-actions"><button className="gr-primary" disabled={create.isPending}>{create.isPending ? "Creating..." : "Create card"}</button></div>
        {create.error ? <p role="alert" className="gr-error">{create.error.message}</p> : null}
      </form>
    </section> : null}
    <section className="gr-panel">
      <h2>{canManageAll ? "Company cards" : "Your company card"}</h2>
      {canManageAll ? <p className="gr-attribution">{cards.length} of {cardLimit} cards.</p> : null}
      {cards.length === 0 ? <p>{canManageAll ? "No company cards yet. Create the first one above." : "No company card has been assigned to you yet. Ask your team admin."}</p> : null}
      <ul className="team-people">
        {cards.map(card => {
          const live = card.status === "published";
          const offline = card.status === "suspended" || card.status === "archived";
          const link = `${window.location.origin}/c/${encodeURIComponent(card.slug)}`;
          return <li key={card.id}>
            <div className="team-person">
              <strong>{card.displayName}</strong>
              <span>{[card.title, card.company].filter(Boolean).join(" · ") || " "}</span>
              <span className="team-badges">
                <span className={`team-status team-card-${card.status}`}>{CARD_STATUS_LABELS[card.status]}</span>
                <small>{card.mine ? "Assigned to you" : card.assigneeName ? `Used by ${card.assigneeName}` : card.assignedMemberId ? "Assigned" : "Not assigned"}</small>
                {canManageAll && card.templateName ? <small>Template: {card.templateName}</small> : null}
              </span>
            </div>
            <div className="team-person-actions">
              {live ? <><a className="gr-secondary" href={link} target="_blank" rel="noreferrer">View</a><button type="button" className="gr-secondary" onClick={() => navigator.clipboard.writeText(link).then(() => toast.success("Link copied."), () => toast.message(link))}>Copy link</button></> : null}
              {card.canEdit ? <button type="button" className="gr-secondary" onClick={() => setEditing(editing?.id === card.id ? null : { id: card.id, note: "", form: { displayName: card.displayName, title: card.title, company: card.company ?? "", email: card.email ?? "", phone: card.phone ?? "", location: card.location ?? "", bio: card.bio ?? "" } })}>{editing?.id === card.id ? "Close" : "Edit"}</button> : null}
              {card.canEdit && !offline ? <button type="button" className="gr-secondary" onClick={() => run(() => publish.mutateAsync({ workspaceId, cardId: card.id, published: !live }), live ? "Card unpublished." : "Card published.")}>{live ? "Unpublish" : "Publish"}</button> : null}
              {canManageAll && activeTemplates.length > 0 ? <select aria-label={`Template for the card of ${card.displayName}`} value={activeTemplates.some(template => template.id === card.templateId) ? card.templateId ?? "" : ""} onChange={event => { if (event.target.value) void run(() => applyTemplate.mutateAsync({ workspaceId, templateId: Number(event.target.value), cardId: card.id }), "Template put on the card."); }}>
                <option value="" disabled>Choose a template</option>
                {activeTemplates.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}
              </select> : null}
              {canManageAll ? <>
                <select aria-label={`Who uses the card of ${card.displayName}`} value={card.assignedMemberId ?? ""} onChange={event => run(() => assign.mutateAsync({ workspaceId, cardId: card.id, memberId: event.target.value ? Number(event.target.value) : null }), event.target.value ? "Card assigned." : "Card unassigned.")}>
                  <option value="">Not assigned</option>
                  {people.map(person => <option key={person.id} value={person.id}>{personName(person)}</option>)}
                </select>
                {offline
                  ? <button type="button" className="gr-secondary" onClick={() => run(() => setStatus.mutateAsync({ workspaceId, cardId: card.id, status: "active" }), "Card restored.")}>Restore</button>
                  : <>
                    <button type="button" className="gr-secondary" onClick={() => run(() => setStatus.mutateAsync({ workspaceId, cardId: card.id, status: "suspended" }), "Card paused.")}>Pause</button>
                    <button type="button" className="gr-secondary team-danger" onClick={() => { if (window.confirm(`Archive the card of ${card.displayName}? Its link stops working until you restore it. Nothing is deleted.`)) void run(() => setStatus.mutateAsync({ workspaceId, cardId: card.id, status: "archived" }), "Card archived."); }}>Archive</button>
                  </>}
              </> : null}
            </div>
            {!card.canEdit && card.mine ? <p className="gr-attribution team-row-note">Your team admin has paused this card. Ask them to restore it.</p> : null}
            {editing?.id === card.id ? <form className="team-inline-form" onSubmit={save}>
              <CardFields form={editing.form} onChange={form => setEditing({ ...editing, form })} />
              {card.lockedFields.length > 0 ? canManageAll
                ? <p className="gr-attribution">Members cannot change: {card.lockedFields.map(field => FIELD_LABELS[field]).join(", ")}.</p>
                : <>
                  <p className="gr-attribution">Set by your team: {card.lockedFields.map(field => FIELD_LABELS[field]).join(", ")}. If you change one of these, it is sent to your admin and shows on your card once approved.</p>
                  <label className="gr-field">Note for your admin (optional)<input maxLength={500} value={editing.note} onChange={event => setEditing({ ...editing, note: event.target.value })} /></label>
                </> : null}
              <div className="gr-actions"><button className="gr-primary" disabled={update.isPending || requestChange.isPending}>{update.isPending || requestChange.isPending ? "Saving..." : "Save card"}</button><button type="button" className="gr-secondary" onClick={() => setEditing(null)}>Cancel</button></div>
              {update.error || requestChange.error ? <p role="alert" className="gr-error">{(update.error ?? requestChange.error)?.message}</p> : null}
            </form> : null}
          </li>;
        })}
      </ul>
      {canManageAll ? <p className="gr-attribution">Set the logo on the Brand tab and the look of cards on the Templates tab.</p> : null}
    </section>
  </>;
}

/** Requests to change locked details. Admins see all and decide; a member sees and can cancel their own. */
function TeamRequests({ workspaceId, onChanged }: { workspaceId: number; onChanged: () => Promise<unknown> }) {
  const list = trpc.teamRequests.list.useQuery({ workspaceId });
  const decide = trpc.teamRequests.decide.useMutation();
  const cancel = trpc.teamRequests.cancel.useMutation();
  const [showAll, setShowAll] = useState(false);
  if (!list.data || list.data.requests.length === 0) return null;
  const { canDecide, requests } = list.data;
  const waiting = requests.filter(request => request.status === "pending");
  const shown = showAll ? requests : waiting;
  const run = async (action: () => Promise<unknown>, done: string) => {
    try {
      await action();
      toast.success(done);
      await onChanged();
    } catch (error) {
      failed(error);
    }
  };
  return <section className="gr-panel">
    <h2>{canDecide ? "Change requests" : "Your change requests"}</h2>
    <p>{waiting.length === 0 ? "No requests are waiting." : waiting.length === 1 ? "1 request is waiting." : `${waiting.length} requests are waiting.`}</p>
    <ul className="team-people">
      {shown.map(request => <li key={request.id}>
        <div className="team-person">
          <strong>{request.cardName}</strong>
          {request.changes.map(change => <span key={change.field}>{change.label}: {request.status === "approved" ? change.to || "(empty)" : `${change.from || "(empty)"} → ${change.to || "(empty)"}`}</span>)}
          {request.note ? <span>Note: {request.note}</span> : null}
          {request.decisionNote ? <span>Reply: {request.decisionNote}</span> : null}
          <span className="team-badges">
            <span className={`team-status team-request-${request.status}`}>{REQUEST_STATUS_LABELS[request.status]}</span>
            <small>{request.mine ? "Sent by you" : `Sent by ${request.requester}`}</small>
          </span>
        </div>
        {request.status === "pending" ? <div className="team-person-actions">
          {canDecide ? <>
            <button type="button" className="gr-primary" onClick={() => run(() => decide.mutateAsync({ workspaceId, requestId: request.id, approve: true }), "Change approved. The card is updated.")}>Approve</button>
            <button type="button" className="gr-secondary" onClick={() => { const note = window.prompt("Reason for declining (optional)"); if (note !== null) void run(() => decide.mutateAsync({ workspaceId, requestId: request.id, approve: false, note: note.trim() || null }), "Request declined."); }}>Decline</button>
          </> : null}
          {request.mine ? <button type="button" className="gr-secondary" onClick={() => run(() => cancel.mutateAsync({ workspaceId, requestId: request.id }), "Request cancelled.")}>Cancel request</button> : null}
        </div> : null}
      </li>)}
    </ul>
    {requests.length > waiting.length ? <div className="gr-actions"><button type="button" className="gr-secondary" onClick={() => setShowAll(!showAll)}>{showAll ? "Show waiting only" : "Show earlier requests"}</button></div> : null}
  </section>;
}

/** Departments are optional groups of people. Only admins change them. */
export function TeamDepartments({ workspaceId, admin }: { workspaceId: number; admin: boolean }) {
  const utils = trpc.useUtils();
  const list = trpc.teamDepartments.list.useQuery({ workspaceId });
  const members = trpc.teams.members.useQuery({ workspaceId });
  const create = trpc.teamDepartments.create.useMutation();
  const rename = trpc.teamDepartments.rename.useMutation();
  const setArchived = trpc.teamDepartments.setArchived.useMutation();
  const setLead = trpc.teamDepartments.setLead.useMutation();
  const [name, setName] = useState("");

  const refresh = () => Promise.all([utils.teamDepartments.list.invalidate({ workspaceId }), utils.teams.activity.invalidate({ workspaceId })]);
  const run = async (action: () => Promise<unknown>, done: string) => {
    try {
      await action();
      toast.success(done);
      await refresh();
    } catch (error) {
      failed(error);
    }
  };

  if (list.isLoading) return <section className="gr-panel" role="status">Loading...</section>;
  if (!list.data) return <section className="gr-panel"><p role="alert" className="gr-error">{list.error?.message ?? "Departments could not be loaded."}</p></section>;
  const people = (members.data?.members ?? []).filter(person => person.status !== "invited");
  const personName = (memberId: number | null) => {
    const person = people.find(candidate => candidate.id === memberId);
    return person ? person.name || person.email || "Team member" : null;
  };

  const add = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await create.mutateAsync({ workspaceId, name });
      setName("");
      toast.success("Department created.");
      await refresh();
    } catch { /* The error shows under the button. */ }
  };

  return <>
    {admin ? <section className="gr-panel">
      <h2>Add a department</h2>
      <p>Departments are optional. Use them to group people, such as Sales or Support.</p>
      <form onSubmit={add}>
        <label className="gr-field">Department name<input required maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label>
        <div className="gr-actions"><button className="gr-primary" disabled={create.isPending}>{create.isPending ? "Adding..." : "Add department"}</button></div>
        {create.error ? <p role="alert" className="gr-error">{create.error.message}</p> : null}
      </form>
    </section> : null}
    <section className="gr-panel">
      <h2>Departments</h2>
      {list.data.length === 0 ? <p>No departments yet.</p> : null}
      <ul className="team-people">
        {list.data.map(department => <li key={department.id}>
          <div className="team-person">
            <strong>{department.name}</strong>
            <span>{department.people === 1 ? "1 person" : `${department.people} people`}{personName(department.leadMemberId) ? ` · Led by ${personName(department.leadMemberId)}` : ""}</span>
            {department.archived ? <span className="team-badges"><span className="team-status team-card-archived">Archived</span></span> : null}
          </div>
          {admin ? <div className="team-person-actions">
            {!department.archived ? <select aria-label={`Who leads ${department.name}`} value={department.leadMemberId ?? ""} onChange={event => run(() => setLead.mutateAsync({ workspaceId, departmentId: department.id, memberId: event.target.value ? Number(event.target.value) : null }), "Department lead saved.")}>
              <option value="">No lead</option>
              {people.map(person => <option key={person.id} value={person.id}>{person.name || person.email || "Team member"}</option>)}
            </select> : null}
            <button type="button" className="gr-secondary" onClick={() => { const next = window.prompt("New name for this department", department.name)?.trim(); if (next && next !== department.name) void run(() => rename.mutateAsync({ workspaceId, departmentId: department.id, name: next }), "Department renamed."); }}>Rename</button>
            <button type="button" className="gr-secondary" onClick={() => run(() => setArchived.mutateAsync({ workspaceId, departmentId: department.id, archived: !department.archived }), department.archived ? "Department restored." : "Department archived.")}>{department.archived ? "Restore" : "Archive"}</button>
          </div> : null}
        </li>)}
      </ul>
      {admin ? <p className="gr-attribution">Leading a department is a label. It does not give that person extra access. Move people between departments on the Members tab.</p> : null}
    </section>
  </>;
}
