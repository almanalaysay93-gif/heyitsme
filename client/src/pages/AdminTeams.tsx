import { useAuth } from "@/_core/hooks/useAuth";
import { AppShell } from "@/components/AppShell";
import { trpc } from "@/lib/trpc";
import { MAX_SEAT_ALLOWANCE } from "@shared/teams";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Link } from "wouter";
import "./google-reviews.css";
import "./team.css";

type Row = { id: number; name: string; seatLimit: number | null; accessUntil: Date | null; closedAt: Date | null; seatsUsed: number; seatsAllowed: number; ended: boolean; ownerEmail: string | null };

const pad = (value: number) => String(value).padStart(2, "0");
const dateValue = (date: Date | null) => (date ? `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` : "");

function TeamRow({ team, onSaved }: { team: Row; onSaved: () => Promise<unknown> }) {
  const save = trpc.teams.adminSetPlan.useMutation();
  const [seats, setSeats] = useState(team.seatLimit === null ? "" : String(team.seatLimit));
  const [until, setUntil] = useState(dateValue(team.accessUntil));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      // The plan runs to the end of the chosen day.
      await save.mutateAsync({ workspaceId: team.id, seatLimit: seats ? Number(seats) : null, accessUntil: until ? new Date(`${until}T23:59:59`) : null });
      await onSaved();
      toast.success("Saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That did not work. Please try again.");
    }
  };
  return <li>
    <div className="team-person">
      <strong>{team.name}</strong>
      <span>{team.ownerEmail ?? "No owner"} · {team.seatsUsed} of {team.seatsAllowed} seats used</span>
      <div className="team-badges">
        {team.closedAt ? <span className="team-status team-status-suspended">Closed</span> : null}
        {team.ended ? <span className="team-status team-status-suspended">Plan ended</span> : null}
        {team.seatsUsed > team.seatsAllowed ? <span className="team-status team-status-invited">Over seats</span> : null}
      </div>
    </div>
    <form className="team-inline-form" onSubmit={submit}>
      <label className="gr-field">Seats<input type="number" min={1} max={MAX_SEAT_ALLOWANCE} value={seats} placeholder="Standard" onChange={event => setSeats(event.target.value)} /></label>
      <label className="gr-field">Plan runs until<input type="date" value={until} onChange={event => setUntil(event.target.value)} /></label>
      <button className="gr-secondary" disabled={save.isPending}>{save.isPending ? "Saving..." : "Save"}</button>
    </form>
  </li>;
}

// heyitsme staff only. The server checks the role again on every call.
export default function AdminTeams() {
  const { user, loading } = useAuth();
  const isAdmin = user?.role === "admin";
  const teams = trpc.teams.adminList.useQuery(undefined, { enabled: isAdmin, retry: false });

  if (loading || (isAdmin && teams.isLoading)) return <AppShell area="Admin" crumb="Teams" active="admin-teams"><p role="status">Loading...</p></AppShell>;
  if (!isAdmin) return <AppShell area="Admin" crumb="Teams" active="admin-teams"><h1>Not available</h1><p>This page is for heyitsme admins.</p><Link href="/app" className="gr-back">← Back to workspace</Link></AppShell>;
  if (!teams.data) return <AppShell area="Admin" crumb="Teams" active="admin-teams"><h1>Teams</h1><p role="alert" className="gr-error">{teams.error?.message ?? "Teams could not be loaded."}</p></AppShell>;

  return <AppShell area="Admin" crumb="Teams" active="admin-teams">
    <header className="gr-heading"><div><span className="section-kicker">Admin</span><h1>Teams</h1><p>Seats and plan dates for every team. Leave seats empty for the standard allowance, and the date empty for no end.</p></div></header>
    <section className="gr-panel">
      <h2>All teams</h2>
      {teams.data.length ? <ul className="team-people">{teams.data.map(team => <TeamRow key={team.id} team={team} onSaved={() => teams.refetch()} />)}</ul> : <p>No teams yet.</p>}
      <p className="gr-attribution">Lowering seats below the people already on a team removes nobody. It only stops new invitations. A date in the past pauses changes for that team, and 3 days after it the team is put on hold: its public pages are paused and it cannot be opened until it is paid. Nothing is deleted. While Teams checkout is open, a team left with no date is given one 14 days away by the daily run, so grant free time with a far date instead.</p>
    </section>
  </AppShell>;
}
