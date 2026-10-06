import TeamPay from "@/components/billing/TeamPay";
import { formatPeso } from "@shared/plans";
import { useAuth } from "@/_core/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { startGoogleLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { BarChart3, Building2, CalendarDays, Contact, CreditCard, History, IdCard, Images, LayoutGrid, LayoutTemplate, Palette, Settings as SettingsIcon, UsersRound, type LucideIcon } from "lucide-react";
import { ROLE_LABELS, STATUS_LABELS, isAdminRole, type RemovalCardChoice, type RemovalContactChoice, type WorkspaceRole } from "@shared/teams";
import { lazy, Suspense, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Link, useLocation, useParams } from "wouter";
import { TeamBrand, TeamTemplates } from "./TeamBrand";
import { TeamCards, TeamDepartments } from "./TeamCards";
import { TeamContacts } from "./TeamContacts";
import "./google-reviews.css";
import "./team.css";

// The chart code is only fetched when someone opens the Analytics tab.
const TeamAssets = lazy(() => import("./TeamAssets").then(module => ({ default: module.TeamAssets })));
const TeamEvents = lazy(() => import("./TeamEvents").then(module => ({ default: module.TeamEvents })));
const TeamAnalytics = lazy(() => import("./TeamAnalytics").then(module => ({ default: module.TeamAnalytics })));

const day = (value: Date | string | null) => (value ? new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—");

async function copy(text: string, done = "Link copied.") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.message(text);
  }
}

/** Sign-in and the Teams switch, shared by every Team screen. Returns a screen to show instead, or null to go on. */
function useTeamGate(title: string): { blocked: ReactNode | null; signedIn: boolean } {
  const { loading, isAuthenticated } = useAuth();
  const status = trpc.teams.status.useQuery(undefined, { staleTime: 5 * 60_000, retry: false });
  if (loading || status.isLoading) return { blocked: <AppShell area="Teams" crumb="Team"><p role="status">Loading...</p></AppShell>, signedIn: false };
  if (!status.data?.enabled) {
    return { signedIn: isAuthenticated, blocked: <AppShell area="Teams" crumb={title}><h1>{title}</h1><p>Teams is not available yet.</p><Link href="/app" className="gr-back">← Back to your cards</Link></AppShell> };
  }
  if (!isAuthenticated) {
    return { signedIn: false, blocked: <AppShell area="Teams" crumb={title}><h1>{title}</h1><p>Sign in to continue.</p><div className="gr-actions"><button className="gr-primary" onClick={() => startGoogleLogin(window.location.pathname)}>Sign in</button></div></AppShell> };
  }
  return { blocked: null, signedIn: true };
}

type WorkspaceForm = { name: string; description: string; website: string; email: string; phone: string; address: string; industry: string };
const EMPTY_FORM: WorkspaceForm = { name: "", description: "", website: "", email: "", phone: "", address: "", industry: "" };

function WorkspaceFields({ form, onChange, full }: { form: WorkspaceForm; onChange: (form: WorkspaceForm) => void; full: boolean }) {
  const field = (key: keyof WorkspaceForm, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="gr-field">{label}<input value={form[key]} onChange={event => onChange({ ...form, [key]: event.target.value })} {...props} /></label>
  );
  return <>
    {field("name", "Company or team name", { required: true, minLength: 2, maxLength: 120, autoComplete: "organization" })}
    {full ? <div className="team-form-grid">
      {field("website", "Website", { type: "url", maxLength: 300, placeholder: "https://" })}
      {field("email", "Company email", { type: "email", maxLength: 320 })}
      {field("phone", "Phone", { maxLength: 64 })}
      {field("industry", "Industry", { maxLength: 80 })}
      {field("address", "Address", { maxLength: 300 })}
      {field("description", "Short description", { maxLength: 600 })}
    </div> : null}
  </>;
}

/** /app/team: the user's teams, and the form to start one. */
export function TeamHome() {
  const { blocked, signedIn } = useTeamGate("Teams");
  const [, navigate] = useLocation();
  const teams = trpc.teams.list.useQuery(undefined, { enabled: signedIn && !blocked, retry: false });
  const utils = trpc.useUtils();
  const create = trpc.teams.create.useMutation();
  const offer = trpc.billing.offer.useQuery(undefined, { enabled: signedIn && !blocked, staleTime: 5 * 60_000, retry: false });
  const paid = offer.data?.teams.checkoutOpen ? offer.data.teams : null;
  const [form, setForm] = useState(EMPTY_FORM);
  if (blocked) return blocked;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const workspace = await create.mutateAsync({ name: form.name });
      await utils.teams.list.invalidate();
      navigate(`/app/team/${workspace.id}`);
    } catch { /* The error shows under the button. */ }
  };

  return <AppShell area="Teams" crumb="Your teams">
    <header className="gr-heading"><div><span className="section-kicker">Teams</span><h1>Your teams</h1><p>One place for your company's cards and people. Your personal cards stay yours.</p></div></header>
    {teams.data?.length ? <section className="gr-panel">
      <h2>Open a team</h2>
      <div className="gr-results">{teams.data.map(team => <button key={team.id} type="button" onClick={() => navigate(`/app/team/${team.id}`)}><strong>{team.name}</strong><span>{ROLE_LABELS[team.role]}</span></button>)}</div>
    </section> : null}
    <section className="gr-panel">
      <h2>Start a new team</h2>
      <form onSubmit={submit}>
        <WorkspaceFields form={form} onChange={setForm} full={false} />
        {paid ? <p>Teams is {formatPeso(paid.priceMinor)} a month for each team, with {paid.seats} seats. Creating the team charges nothing. You pay on its Billing tab, and the team opens for changes once it is paid.</p> : null}
        <div className="gr-actions"><button className="gr-primary" disabled={create.isPending}>{create.isPending ? "Creating..." : "Create team"}</button></div>
        {create.error ? <p role="alert" className="gr-error">{create.error.message}</p> : null}
      </form>
    </section>
  </AppShell>;
}

const ACTIVITY: Record<string, string> = {
  "workspace.created": "created the team",
  "workspace.updated": "updated the team details",
  "workspace.closed": "closed the team",
  "workspace.ownership_transferred": "made someone else the owner",
  "plan.updated": "changed the team's seats or plan date",
  "plan.paid": "paid for the team's plan",
  "member.invited": "invited",
  "member.invite_resent": "sent an invitation again",
  "member.invite_cancelled": "cancelled the invitation for",
  "member.joined": "joined the team",
  "member.role_changed": "changed a role",
  "member.suspended": "suspended a person",
  "member.reactivated": "reactivated a person",
  "member.removed": "removed",
  "member.left": "left the team",
  "member.department_changed": "moved a person to another department",
  "card.created": "created the card of",
  "card.updated": "edited the card of",
  "card.published": "published the card of",
  "card.unpublished": "unpublished the card of",
  "card.assigned": "assigned the card of",
  "card.unassigned": "unassigned the card of",
  "card.suspended": "paused the card of",
  "card.archived": "archived the card of",
  "card.restored": "restored the card of",
  "department.created": "created the department",
  "department.renamed": "renamed a department to",
  "department.archived": "archived the department",
  "department.restored": "restored the department",
  "department.lead_changed": "changed who leads",
  "brand.updated": "updated the brand",
  "brand.logo_changed": "changed the company logo",
  "brand.logo_removed": "removed the company logo",
  "template.created": "created the template",
  "template.updated": "edited the template",
  "template.archived": "archived the template",
  "template.restored": "restored the template",
  "template.default_changed": "changed the template for new cards",
  "template.applied": "put on cards the template",
  "request.created": "asked for a change to the card of",
  "request.approved": "approved a change to the card of",
  "request.rejected": "declined a change to the card of",
  "request.cancelled": "cancelled a change request",
  "contact.reassigned": "handed contacts to another person",
  "contact.archived": "archived a contact",
  "contact.restored": "restored a contact",
  "contact.merged": "combined two contacts",
  "contact.deleted": "deleted a contact",
  "contact.exported": "downloaded the contacts",
  "analytics.leaderboard_on": "turned the leaderboard on",
  "analytics.leaderboard_off": "turned the leaderboard off",
  "event.created": "created an event",
  "event.updated": "changed an event",
  "event.draft": "moved an event back to drafts",
  "event.published": "published an event",
  "event.closed": "closed RSVPs for an event",
  "event.ended": "marked an event as ended",
  "event.archived": "archived an event",
  "event.form_changed": "changed an event's RSVP form",
  "event.page_changed": "changed an event's page",
  "event.rsvp_edited": "edited an event response",
  "event.rsvp_deleted": "deleted an event response",
  "event.exported": "downloaded an event's responses",
  "asset.added": "added a company file",
  "asset.updated": "changed a company file",
  "asset.replaced": "uploaded a new version of a company file",
  "asset.archived": "archived a company file",
  "asset.restored": "restored a company file",
  "asset.card_added": "added a company file to a card",
  "asset.card_removed": "took a company file off a card",
  "banner.created": "created a banner",
  "banner.updated": "changed a banner",
  "banner.removed": "removed a banner",
  "signature.updated": "changed the email signature design",
  "background.updated": "changed the meeting background design",
};

const TABS = ["Overview", "Members", "Cards", "Contacts", "Analytics", "Events", "Assets", "Departments", "Templates", "Brand", "Activity", "Billing", "Settings"] as const;
const ADMIN_TABS: readonly string[] = ["Templates", "Brand", "Activity"];
type Tab = (typeof TABS)[number];
const TAB_ICONS: Record<Tab, LucideIcon> = {
  Overview: LayoutGrid, Members: UsersRound, Cards: IdCard, Contacts: Contact, Analytics: BarChart3, Events: CalendarDays, Assets: Images,
  Departments: Building2, Templates: LayoutTemplate, Brand: Palette, Activity: History, Billing: CreditCard, Settings: SettingsIcon,
};

/** /app/team/:id: one team. Buttons here follow the role, and the server checks every action again. */
export function TeamWorkspace() {
  const workspaceId = Number(useParams<{ id: string }>().id);
  const valid = Number.isInteger(workspaceId) && workspaceId > 0;
  const { blocked, signedIn } = useTeamGate("Team");
  const [, navigate] = useLocation();
  const ready = signedIn && !blocked && valid;
  const team = trpc.teams.get.useQuery({ workspaceId }, { enabled: ready, retry: false });
  const [tab, setTab] = useState<Tab>("Overview");
  if (blocked) return blocked;
  if (team.isLoading) return <AppShell area="Teams" crumb="Team"><p role="status">Loading...</p></AppShell>;
  if (!valid || !team.data) {
    return <AppShell area="Teams" crumb="Team"><h1>Team not found</h1><p>This team does not exist, or you are not part of it.</p><Link href="/app/team" className="gr-back">← Your teams</Link></AppShell>;
  }

  const { workspace, me } = team.data;
  const admin = isAdminRole(me.role);
  const tabs = TABS.filter(name => (admin || !ADMIN_TABS.includes(name)) && (me.role === "owner" || name !== "Billing"));

  const nav = tabs.map(name => ({ label: name, icon: TAB_ICONS[name], active: tab === name, onClick: () => setTab(name) }));

  return <AppShell area={workspace.name} crumb={tab} current={workspace.id} navLabel="Team" nav={nav} profileNote={ROLE_LABELS[me.role]}>
    <header className="gr-heading"><div><span className="section-kicker">Team · {ROLE_LABELS[me.role]}</span><h1>{workspace.name}</h1>{workspace.description ? <p>{workspace.description}</p> : null}</div></header>
    {team.data.planState === "unpaid" ? <section className="team-notice" role="status"><p><strong>This team is not paid for yet.</strong> It is here to look at. It opens for changes as soon as its plan is paid.</p>{me.role === "owner" && tab !== "Billing" ? <div className="gr-actions"><button type="button" className="gr-primary" onClick={() => setTab("Billing")}>Go to Billing</button></div> : null}</section>
      : team.data.planEnded ? <section className="team-notice" role="status"><p><strong>This team's plan has ended.</strong> Everything is still here to view and download, and company cards stay online. Changes are paused until the plan is renewed.</p>{me.role === "owner" && tab !== "Billing" ? <div className="gr-actions"><button type="button" className="gr-primary" onClick={() => setTab("Billing")}>Go to Billing</button></div> : null}</section> : null}
    {tab === "Overview" ? <Overview workspaceId={workspace.id} admin={admin} onOpen={setTab} /> : null}
    {tab === "Members" ? <Members workspaceId={workspace.id} /> : null}
    {tab === "Cards" ? <TeamCards workspaceId={workspace.id} companyName={workspace.name} /> : null}
    {tab === "Contacts" ? <TeamContacts workspaceId={workspace.id} /> : null}
    {tab === "Analytics" ? <Suspense fallback={<section className="gr-panel" role="status">Loading...</section>}><TeamAnalytics workspaceId={workspace.id} admin={admin} /></Suspense> : null}
    {tab === "Events" ? <Suspense fallback={<section className="gr-panel" role="status">Loading...</section>}><TeamEvents workspaceId={workspace.id} admin={admin} /></Suspense> : null}
    {tab === "Assets" ? <Suspense fallback={<section className="gr-panel" role="status">Loading...</section>}><TeamAssets workspaceId={workspace.id} admin={admin} /></Suspense> : null}
    {tab === "Departments" ? <TeamDepartments workspaceId={workspace.id} admin={admin} /> : null}
    {tab === "Templates" && admin ? <TeamTemplates workspaceId={workspace.id} /> : null}
    {tab === "Brand" && admin ? <TeamBrand workspaceId={workspace.id} /> : null}
    {tab === "Activity" && admin ? <Activity workspaceId={workspace.id} /> : null}
    {tab === "Billing" && me.role === "owner" ? <Billing workspaceId={workspace.id} /> : null}
    {tab === "Settings" ? <Settings workspace={workspace} role={me.role} onGone={() => navigate("/app/team")} /> : null}
  </AppShell>;
}

function Overview({ workspaceId, admin, onOpen }: { workspaceId: number; admin: boolean; onOpen: (tab: Tab) => void }) {
  const members = trpc.teams.members.useQuery({ workspaceId });
  const cards = trpc.teamCards.list.useQuery({ workspaceId });
  const people = members.data?.members ?? [];
  const count = (status: string) => people.filter(person => person.status === status).length;
  const cardCount = cards.data?.cards.length ?? 0;
  const metrics: [string, number][] = admin
    ? [["Active people", count("active")], ["Invitations waiting", count("invited")], ["Company cards", cardCount]]
    : [["People on the team", count("active")], ["Your company cards", cardCount]];
  return <section className="gr-panel">
    <h2>Overview</h2>
    <div className="gr-metrics team-metrics">{metrics.map(([label, value]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
    {admin ? <div className="gr-actions"><button type="button" className="gr-primary" onClick={() => onOpen("Members")}>Invite people</button><button type="button" className="gr-secondary" onClick={() => onOpen("Cards")}>Company cards</button><button type="button" className="gr-secondary" onClick={() => onOpen("Analytics")}>Analytics</button><button type="button" className="gr-secondary" onClick={() => onOpen("Settings")}>Team details</button></div> : <div className="gr-actions"><button type="button" className="gr-primary" onClick={() => onOpen("Cards")}>Your company card</button><button type="button" className="gr-secondary" onClick={() => onOpen("Analytics")}>Your numbers</button></div>}
    <p className="gr-attribution">Company files, the email signature, the meeting background and banners are under Assets.</p>
  </section>;
}

function Members({ workspaceId }: { workspaceId: number }) {
  const utils = trpc.useUtils();
  const members = trpc.teams.members.useQuery({ workspaceId });
  const refresh = () => utils.teams.members.invalidate({ workspaceId });
  const invite = trpc.teams.invite.useMutation();
  const resend = trpc.teams.resendInvite.useMutation();
  const changeRole = trpc.teams.changeRole.useMutation();
  const suspend = trpc.teams.setSuspended.useMutation();
  const remove = trpc.teams.removeMember.useMutation();
  const transfer = trpc.teams.transferOwnership.useMutation();
  const departments = trpc.teamDepartments.list.useQuery({ workspaceId });
  const moveDepartment = trpc.teamDepartments.assignMember.useMutation();
  // Removing a person who holds company cards or team contacts first asks what should happen to those.
  const [leaving, setLeaving] = useState<{ memberId: number; choice: RemovalCardChoice; to: string; contacts: RemovalContactChoice; contactsTo: string } | null>(null);
  const [form, setForm] = useState({ email: "", role: "member" as "admin" | "member", jobTitle: "" });
  const [lastInvite, setLastInvite] = useState<{ email: string; inviteUrl: string; emailed: boolean } | null>(null);

  if (members.isLoading) return <section className="gr-panel" role="status">Loading...</section>;
  if (!members.data) return <section className="gr-panel"><p role="alert" className="gr-error">{members.error?.message ?? "People could not be loaded."}</p></section>;
  const { myRole, myMemberId, peopleLimit } = members.data;
  const admin = isAdminRole(myRole);
  const owner = myRole === "owner";
  // Mirrors the server rule so we only show buttons that will work. The server decides.
  const canManage = (person: { id: number; role: WorkspaceRole }) => person.id !== myMemberId && person.role !== "owner" && (owner || (admin && person.role === "member"));

  const run = async (action: () => Promise<unknown>, done: string) => {
    try {
      await action();
      toast.success(done);
      await Promise.all([refresh(), utils.teams.activity.invalidate({ workspaceId }), utils.teams.get.invalidate({ workspaceId }), utils.teamCards.list.invalidate({ workspaceId }), utils.teamDepartments.list.invalidate({ workspaceId })]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That did not work. Please try again.");
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const sent = await invite.mutateAsync({ workspaceId, email: form.email, role: form.role, jobTitle: form.jobTitle || undefined });
      setLastInvite({ email: form.email.trim(), inviteUrl: sent.inviteUrl, emailed: sent.emailed });
      setForm({ email: "", role: "member", jobTitle: "" });
      await refresh();
    } catch { /* The error shows under the button. */ }
  };

  return <>
    {admin ? <section className="gr-panel">
      <h2>Invite a person</h2>
      <form onSubmit={submit}>
        <div className="team-form-grid">
          <label className="gr-field">Work email<input type="email" required maxLength={320} autoComplete="off" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label>
          <label className="gr-field">Job title (optional)<input maxLength={160} value={form.jobTitle} onChange={event => setForm({ ...form, jobTitle: event.target.value })} /></label>
          <label className="gr-field">Role<select value={form.role} onChange={event => setForm({ ...form, role: event.target.value as "admin" | "member" })}><option value="member">Member</option>{owner ? <option value="admin">Admin</option> : null}</select></label>
        </div>
        <div className="gr-actions"><button className="gr-primary" disabled={invite.isPending}>{invite.isPending ? "Sending..." : "Send invitation"}</button></div>
        {invite.error ? <p role="alert" className="gr-error">{invite.error.message}</p> : null}
      </form>
      {lastInvite ? <div className="team-notice" role="status">
        <p>{lastInvite.emailed ? `Invitation sent to ${lastInvite.email}.` : `We could not email ${lastInvite.email}. Copy the link and send it to them yourself.`} The link works for 7 days and only for that email address.</p>
        <button type="button" className="gr-secondary" onClick={() => copy(lastInvite.inviteUrl)}>Copy invitation link</button>
      </div> : null}
    </section> : null}
    <section className="gr-panel">
      <h2>People</h2>
      {admin ? <p className="gr-attribution">{members.data.members.length} of {peopleLimit} places used. Invitations and suspended people count.</p> : null}
      <ul className="team-people">
        {members.data.members.map(person => {
          const manage = canManage(person);
          const name = person.name || person.email || "Team member";
          const department = departments.data?.find(candidate => candidate.id === person.departmentId);
          const openDepartments = (departments.data ?? []).filter(candidate => !candidate.archived || candidate.id === person.departmentId);
          const heirs = members.data.members.filter(candidate => candidate.status === "active" && candidate.id !== person.id);
          return <li key={person.id}>
            <div className="team-person">
              <strong>{name}{person.id === myMemberId ? " (you)" : ""}</strong>
              <span>{[person.jobTitle, department?.name, person.name ? person.email : null].filter(Boolean).join(" · ") || " "}</span>
              <span className="team-badges">
                <span className="team-chip">{ROLE_LABELS[person.role]}</span>
                <span className={`team-status team-status-${person.status}`}>{STATUS_LABELS[person.status]}</span>
                {admin && person.status === "invited" ? <small>{person.invitationExpiresAt && new Date(person.invitationExpiresAt) > new Date() ? `Link works until ${day(person.invitationExpiresAt)}` : "Link expired"}</small> : null}
                {admin && person.status !== "invited" ? <small>Last active {day(person.lastActiveAt)}</small> : null}
                {person.cardCount ? <small>{person.cardCount === 1 ? "1 company card" : `${person.cardCount} company cards`}</small> : null}
                {person.contactCount ? <small>{person.contactCount === 1 ? "1 team contact" : `${person.contactCount} team contacts`}</small> : null}
              </span>
            </div>
            {admin && openDepartments.length && (manage || person.id === myMemberId || owner) ? <div className="team-person-actions">
              <select aria-label={`Department for ${name}`} value={person.departmentId ?? ""} onChange={event => run(() => moveDepartment.mutateAsync({ workspaceId, memberId: person.id, departmentId: event.target.value ? Number(event.target.value) : null }), "Department changed.")}>
                <option value="">No department</option>
                {openDepartments.map(candidate => <option key={candidate.id} value={candidate.id} disabled={candidate.archived}>{candidate.name}</option>)}
              </select>
            </div> : null}
            {manage ? <div className="team-person-actions">
              {owner && person.status !== "invited" ? <select aria-label={`Role for ${name}`} value={person.role} onChange={event => run(() => changeRole.mutateAsync({ workspaceId, memberId: person.id, role: event.target.value as "admin" | "member" }), "Role changed.")}><option value="member">Member</option><option value="admin">Admin</option></select> : null}
              {person.status === "invited" ? <button type="button" className="gr-secondary" onClick={() => run(async () => { const sent = await resend.mutateAsync({ workspaceId, memberId: person.id }); setLastInvite({ email: person.email ?? "", ...sent }); }, "Invitation sent again.")}>Send again</button> : null}
              {person.status === "active" ? <button type="button" className="gr-secondary" onClick={() => run(() => suspend.mutateAsync({ workspaceId, memberId: person.id, suspended: true }), "Person suspended.")}>Suspend</button> : null}
              {person.status === "suspended" ? <button type="button" className="gr-secondary" onClick={() => run(() => suspend.mutateAsync({ workspaceId, memberId: person.id, suspended: false }), "Person reactivated.")}>Reactivate</button> : null}
              {owner && person.status === "active" ? <button type="button" className="gr-secondary" onClick={() => { if (window.confirm(`Make ${name} the owner? You will become an admin.`)) void run(() => transfer.mutateAsync({ workspaceId, memberId: person.id }), "Ownership handed over."); }}>Make owner</button> : null}
              <button type="button" className="gr-secondary team-danger" onClick={() => {
                if (person.cardCount || person.contactCount) { setLeaving(leaving?.memberId === person.id ? null : { memberId: person.id, choice: "unassign", to: "", contacts: "keep", contactsTo: "" }); return; }
                if (window.confirm(person.status === "invited" ? `Cancel the invitation for ${name}?` : `Remove ${name} from the team? Their own heyitsme account stays.`)) void run(() => remove.mutateAsync({ workspaceId, memberId: person.id }), person.status === "invited" ? "Invitation cancelled." : "Person removed.");
              }}>{person.status === "invited" ? "Cancel invitation" : "Remove"}</button>
            </div> : null}
            {manage && leaving?.memberId === person.id ? <form className="team-inline-form" onSubmit={event => { event.preventDefault(); void run(async () => { await remove.mutateAsync({ workspaceId, memberId: person.id, cards: leaving.choice, transferToMemberId: leaving.choice === "transfer" ? Number(leaving.to) : undefined, contacts: leaving.contacts, contactsToMemberId: leaving.contacts === "transfer" ? Number(leaving.contactsTo) : undefined }); setLeaving(null); }, "Person removed."); }}>
              {person.cardCount ? <fieldset className="team-choice">
                <legend>{name} uses {person.cardCount === 1 ? "1 company card" : `${person.cardCount} company cards`}. What should happen to {person.cardCount === 1 ? "it" : "them"}?</legend>
                <label><input type="radio" name={`cards-${person.id}`} checked={leaving.choice === "unassign"} onChange={() => setLeaving({ ...leaving, choice: "unassign" })} /> Keep the cards working, with nobody assigned</label>
                <label><input type="radio" name={`cards-${person.id}`} checked={leaving.choice === "archive"} onChange={() => setLeaving({ ...leaving, choice: "archive" })} /> Archive the cards. Their links stop working until you restore them</label>
                <label><input type="radio" name={`cards-${person.id}`} checked={leaving.choice === "transfer"} disabled={heirs.length === 0} onChange={() => setLeaving({ ...leaving, choice: "transfer" })} /> Give the cards to someone else</label>
                {leaving.choice === "transfer" ? <label className="gr-field">New holder<select required value={leaving.to} onChange={event => setLeaving({ ...leaving, to: event.target.value })}><option value="">Choose a person</option>{heirs.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name || candidate.email || "Team member"}</option>)}</select></label> : null}
              </fieldset> : null}
              {person.contactCount ? <fieldset className="team-choice">
                <legend>{name} looks after {person.contactCount === 1 ? "1 team contact" : `${person.contactCount} team contacts`}. What should happen to {person.contactCount === 1 ? "it" : "them"}?</legend>
                <label><input type="radio" name={`contacts-${person.id}`} checked={leaving.contacts === "keep"} onChange={() => setLeaving({ ...leaving, contacts: "keep" })} /> Keep the contacts with the team, with nobody assigned</label>
                <label><input type="radio" name={`contacts-${person.id}`} checked={leaving.contacts === "transfer"} disabled={heirs.length === 0} onChange={() => setLeaving({ ...leaving, contacts: "transfer" })} /> Give the contacts to someone else</label>
                <label><input type="radio" name={`contacts-${person.id}`} checked={leaving.contacts === "archive"} onChange={() => setLeaving({ ...leaving, contacts: "archive" })} /> Archive the contacts. You can restore them later</label>
                {leaving.contacts === "transfer" ? <label className="gr-field">Who takes the contacts<select required value={leaving.contactsTo} onChange={event => setLeaving({ ...leaving, contactsTo: event.target.value })}><option value="">Choose a person</option>{heirs.map(candidate => <option key={candidate.id} value={candidate.id}>{candidate.name || candidate.email || "Team member"}</option>)}</select></label> : null}
              </fieldset> : null}
              <p className="gr-attribution">Nothing is deleted. {name} keeps their own heyitsme account, personal cards and personal contacts. Company cards and team contacts stay with the team.</p>
              <div className="gr-actions"><button className="gr-secondary team-danger" disabled={remove.isPending}>{remove.isPending ? "Removing..." : `Remove ${name}`}</button><button type="button" className="gr-secondary" onClick={() => setLeaving(null)}>Cancel</button></div>
            </form> : null}
          </li>;
        })}
      </ul>
    </section>
  </>;
}

function Activity({ workspaceId }: { workspaceId: number }) {
  const activity = trpc.teams.activity.useQuery({ workspaceId, limit: 50 });
  return <section className="gr-panel">
    <h2>Activity</h2>
    {activity.isLoading ? <p role="status">Loading...</p> : null}
    {activity.error ? <p role="alert" className="gr-error">{activity.error.message}</p> : null}
    <ul className="team-activity">
      {activity.data?.map(entry => {
        const subject = entry.metadata?.email ?? entry.metadata?.name;
        const email = typeof subject === "string" ? ` ${subject}` : "";
        return <li key={entry.id}><span><strong>{entry.actorName || "Someone"}</strong> {ACTIVITY[entry.action] ?? "made a change"}{email}</span><time dateTime={new Date(entry.createdAt).toISOString()}>{day(entry.createdAt)}</time></li>;
      })}
    </ul>
  </section>;
}

type Workspace = { id: number; name: string; description: string | null; website: string | null; email: string | null; phone: string | null; address: string | null; industry: string | null };

function Billing({ workspaceId }: { workspaceId: number }) {
  const billing = trpc.teams.billing.useQuery({ workspaceId });
  if (billing.isLoading) return <section className="gr-panel" role="status">Loading...</section>;
  if (!billing.data) return <section className="gr-panel"><p role="alert" className="gr-error">{billing.error?.message ?? "Billing could not be loaded."}</p></section>;
  const { seats, accessUntil, ended, state, plan } = billing.data;
  const price = `${formatPeso(plan.priceMinor)} a month`;
  const metrics: [string, number][] = [["Seats in use", seats.used], ["Seats on this team", seats.allowed], ["Free seats", seats.free]];
  return <section className="gr-panel">
    <h2>Billing</h2>
    <div className="gr-metrics team-metrics">{metrics.map(([label, value]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
    <p>{seats.active} active, {seats.invited} invited, {seats.suspended} suspended. Each of them holds a seat. Removing a person or cancelling an invitation frees it.</p>
    {seats.used > seats.allowed ? <p role="status"><strong>This team has more people than seats.</strong> Nobody is removed, but new invitations wait until there is a free seat.</p> : null}
    <p>{state === "unpaid" ? "This team is not paid for yet." : ended ? `The plan ended on ${day(accessUntil)}.` : accessUntil ? `The plan runs until ${day(accessUntil)}.` : "This team has no end date."}</p>
    {state === "free" ? <p className="gr-attribution">This team has no end date, so there is nothing to pay here. To change the number of seats, contact heyitsme.</p>
      : plan.checkoutOpen ? <>
        <p>Teams is {price} for each team, with {plan.seats} seats. {state === "active" ? "Paying now adds one month after the date above." : "Paying opens the team for one month from today."} If the plan runs out, nothing is deleted.</p>
        <div className="gr-actions"><TeamPay workspaceId={workspaceId} channels={plan.channels} priceMinor={plan.priceMinor} verb={state === "active" ? "Renew early:" : "Pay"} buttonClass={state === "active" ? "gr-secondary" : "gr-primary"} /></div>
        <p className="gr-attribution">You pay on the payment provider's page and come back to your Billing page. For more than {plan.seats} seats, contact heyitsme.</p>
      </> : <p className="gr-attribution">Checkout for Teams is not open right now. To renew or change seats, contact heyitsme.</p>}
  </section>;
}

function Settings({ workspace, role, onGone }: { workspace: Workspace; role: WorkspaceRole; onGone: () => void }) {
  const utils = trpc.useUtils();
  const update = trpc.teams.update.useMutation();
  const close = trpc.teams.close.useMutation();
  const leave = trpc.teams.leave.useMutation();
  const toForm = (): WorkspaceForm => ({ name: workspace.name, description: workspace.description ?? "", website: workspace.website ?? "", email: workspace.email ?? "", phone: workspace.phone ?? "", address: workspace.address ?? "", industry: workspace.industry ?? "" });
  const [form, setForm] = useState(toForm);
  useEffect(() => setForm(toForm()), [workspace.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const admin = isAdminRole(role);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await update.mutateAsync({ workspaceId: workspace.id, ...form });
      await Promise.all([utils.teams.get.invalidate({ workspaceId: workspace.id }), utils.teams.list.invalidate()]);
      toast.success("Team details saved.");
    } catch { /* The error shows under the button. */ }
  };
  const end = async (action: () => Promise<unknown>, done: string) => {
    try {
      await action();
      await utils.teams.list.invalidate();
      toast.success(done);
      onGone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That did not work. Please try again.");
    }
  };

  return <>
    {admin ? <section className="gr-panel">
      <h2>Team details</h2>
      <form onSubmit={save}>
        <WorkspaceFields form={form} onChange={setForm} full />
        <div className="gr-actions"><button className="gr-primary" disabled={update.isPending}>{update.isPending ? "Saving..." : "Save details"}</button></div>
        {update.error ? <p role="alert" className="gr-error">{update.error.message}</p> : null}
      </form>
    </section> : null}
    <section className="gr-panel">
      {role === "owner" ? <>
        <h2>Close this team</h2>
        <p>The team disappears for everyone in it and its company cards go offline. Nothing is deleted, and nobody's personal account or personal cards are affected.</p>
        <div className="gr-actions"><button type="button" className="gr-secondary team-danger" disabled={close.isPending} onClick={() => { if (window.confirm(`Close ${workspace.name} for everyone?`)) void end(() => close.mutateAsync({ workspaceId: workspace.id }), "Team closed."); }}>Close team</button></div>
      </> : <>
        <h2>Leave this team</h2>
        <p>You lose access to this team, and your company card stays with the company. Your personal account and personal cards stay yours.</p>
        <div className="gr-actions"><button type="button" className="gr-secondary team-danger" disabled={leave.isPending} onClick={() => { if (window.confirm(`Leave ${workspace.name}?`)) void end(() => leave.mutateAsync({ workspaceId: workspace.id }), "You left the team."); }}>Leave team</button></div>
      </>}
    </section>
  </>;
}

/** /app/team/join/:token: where an invitation link lands. */
export function TeamJoin() {
  const token = useParams<{ token: string }>().token ?? "";
  const wellFormed = /^[A-Za-z0-9_-]{20,128}$/.test(token);
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const invitation = trpc.teams.invitation.useQuery({ token }, { enabled: wellFormed && !loading, retry: false });
  const accept = trpc.teams.acceptInvite.useMutation();

  const shell = (title: string, body: ReactNode) => <AppShell area="Teams" crumb="Invitation"><div className="team-join"><span className="section-kicker">Team invitation</span><h1>{title}</h1>{body}</div></AppShell>;
  const home = <Link href="/app" className="gr-back">Go to your cards</Link>;
  if (loading || invitation.isLoading) return <AppShell area="Teams" crumb="Team"><p role="status">Loading...</p></AppShell>;
  const data = invitation.data;
  if (!wellFormed || !data || data.state === "invalid") {
    return shell("This link does not work", <><p>{invitation.error?.message ?? "The invitation may have been cancelled or replaced. Ask your team admin to send a new one."}</p>{home}</>);
  }
  if (data.state === "used") return shell("Already accepted", <><p>This invitation was already used.</p><Link href="/app/team" className="gr-back">Go to your teams</Link></>);
  if (data.state === "expired") return shell("This invitation has expired", <><p>Ask your team admin at {data.workspaceName} to send a new one.</p>{home}</>);

  const join = async () => {
    try {
      const joined = await accept.mutateAsync({ token });
      await utils.teams.list.invalidate();
      navigate(`/app/team/${joined.workspaceId}`);
    } catch { /* The error shows under the button. */ }
  };

  return shell(`Join ${data.workspaceName}`, <>
    <p>You are invited to join <strong>{data.workspaceName}</strong> on heyitsme as {data.role === "admin" ? "an admin" : "a member"}. Your personal cards stay yours.</p>
    {!isAuthenticated ? <>
      <p>Sign in with <strong>{data.email}</strong> to accept.</p>
      <div className="gr-actions"><button className="gr-primary" onClick={() => startGoogleLogin(window.location.pathname)}>Sign in to accept</button></div>
    </> : data.forMe ? <>
      <div className="gr-actions"><button className="gr-primary" disabled={accept.isPending} onClick={join}>{accept.isPending ? "Joining..." : "Accept invitation"}</button></div>
      {accept.error ? <p role="alert" className="gr-error">{accept.error.message}</p> : null}
    </> : <>
      <p role="alert" className="gr-error">This invitation was sent to {data.email}. You are signed in as {user?.email ?? "another account"}.</p>
      <div className="gr-actions"><button className="gr-secondary" onClick={async () => { await logout(); await utils.invalidate(); }}>Sign out to switch account</button></div>
    </>}
  </>);
}
