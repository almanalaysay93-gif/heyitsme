import { DailyViewsChart } from "@/components/InsightsView";
import { trpc } from "@/lib/trpc";
import { TEAM_ANALYTICS_RANGES, type TeamAnalyticsRange } from "@shared/teams";
import { useState } from "react";
import { toast } from "sonner";

const failed = (error: unknown) => toast.error(error instanceof Error ? error.message : "That did not work. Please try again.");
const RANGE_LABELS: Record<TeamAnalyticsRange, string> = { 7: "7 days", 30: "30 days", 90: "90 days", 365: "365 days" };
const number = (value: number) => value.toLocaleString();
const percent = (rate: number | null) => (rate === null ? "–" : `${(rate * 100).toFixed(rate < 0.1 ? 1 : 0)}%`);

type Totals = { views: number; saves: number; exchanges: number; qrScans: number; linkClicks: number };
const COLUMNS: [keyof Totals, string][] = [["views", "Views"], ["saves", "Saves"], ["exchanges", "Exchanges"], ["qrScans", "QR scans"], ["linkClicks", "Link clicks"]];

function Table({ caption, first, rows }: { caption: string; first: string; rows: ({ key: string | number; name: string; note?: string | null } & Totals)[] }) {
  return <div className="team-table-wrap">
    <table className="team-table">
      <caption className="sr-only">{caption}</caption>
      <thead><tr><th scope="col">{first}</th>{COLUMNS.map(([key, label]) => <th key={key} scope="col">{label}</th>)}</tr></thead>
      <tbody>
        {rows.map(row => <tr key={row.key}>
          <th scope="row">{row.name}{row.note ? <small>{row.note}</small> : null}</th>
          {COLUMNS.map(([key]) => <td key={key}>{number(row[key])}</td>)}
        </tr>)}
      </tbody>
    </table>
  </div>;
}

/** Numbers for company cards. A member sees their own card; admins see the team and can narrow it down. */
export function TeamAnalytics({ workspaceId, admin }: { workspaceId: number; admin: boolean }) {
  const utils = trpc.useUtils();
  const [days, setDays] = useState<TeamAnalyticsRange>(30);
  const [person, setPerson] = useState("");
  const [department, setDepartment] = useState("");
  const [card, setCard] = useState("");
  const [template, setTemplate] = useState("");

  const summary = trpc.teamAnalytics.summary.useQuery(
    {
      workspaceId,
      days,
      memberId: person === "unassigned" ? "unassigned" : person ? Number(person) : undefined,
      departmentId: department ? Number(department) : undefined,
      cardId: card ? Number(card) : undefined,
      templateId: template ? Number(template) : undefined,
    },
    { placeholderData: previous => previous }
  );
  const filters = trpc.teamAnalytics.filters.useQuery({ workspaceId }, { enabled: admin });
  const adoption = trpc.teamAnalytics.adoption.useQuery({ workspaceId }, { enabled: admin });
  const setLeaderboard = trpc.teamAnalytics.setLeaderboard.useMutation();

  if (summary.isLoading) return <section className="gr-panel" role="status">Loading...</section>;
  if (!summary.data) return <section className="gr-panel"><p role="alert" className="gr-error">{summary.error?.message ?? "The numbers could not be loaded."}</p></section>;

  const data = summary.data;
  const filtered = Boolean(person || department || card || template);
  const metrics: [string, string][] = [
    ["Profile views", number(data.totals.views)],
    ["Contact saves", number(data.totals.saves)],
    ["Contact exchanges", number(data.totals.exchanges)],
    ["QR scans", number(data.totals.qrScans)],
    ["Link clicks", number(data.totals.linkClicks)],
    ["Views that became an exchange", percent(data.conversionRate)],
    ["Published cards", number(data.cardCounts.published)],
    ["Cards with activity", number(data.cardCounts.active)],
    ...(data.activePeople === null ? [] : [["People with activity", number(data.activePeople)] as [string, string]]),
  ];

  const toggleLeaderboard = async (enabled: boolean) => {
    try {
      await setLeaderboard.mutateAsync({ workspaceId, enabled });
      toast.success(enabled ? "The leaderboard is on. Everyone on the team can see it." : "The leaderboard is off.");
      await Promise.all([utils.teamAnalytics.summary.invalidate({ workspaceId }), utils.teams.activity.invalidate({ workspaceId })]);
    } catch (error) {
      failed(error);
    }
  };

  return <>
    <section className="gr-panel">
      <h2>Analytics</h2>
      <p>{admin ? "How the team's company cards are doing. Days are counted in UTC." : "How your company card is doing. Days are counted in UTC."}</p>
      <div className="team-ranges" role="group" aria-label="Time range">
        {TEAM_ANALYTICS_RANGES.map(range => <button key={range} type="button" aria-pressed={days === range} onClick={() => setDays(range)}>{RANGE_LABELS[range]}</button>)}
      </div>
      {admin && filters.data ? <div className="team-contact-filters">
        <label className="gr-field">Person<select value={person} onChange={event => setPerson(event.target.value)}>
          <option value="">Everyone</option>
          <option value="unassigned">Cards with nobody assigned</option>
          {filters.data.people.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
        </select></label>
        {filters.data.departments.length ? <label className="gr-field">Department<select value={department} onChange={event => setDepartment(event.target.value)}>
          <option value="">All departments</option>
          {filters.data.departments.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
        </select></label> : null}
        <label className="gr-field">Card<select value={card} onChange={event => setCard(event.target.value)}>
          <option value="">All cards</option>
          {filters.data.cards.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
        </select></label>
        {filters.data.templates.length ? <label className="gr-field">Template<select value={template} onChange={event => setTemplate(event.target.value)}>
          <option value="">All templates</option>
          {filters.data.templates.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
        </select></label> : null}
        {filtered ? <div className="gr-actions"><button type="button" className="gr-secondary" onClick={() => { setPerson(""); setDepartment(""); setCard(""); setTemplate(""); }}>Clear filters</button></div> : null}
      </div> : null}
      <div className="gr-metrics team-metrics" aria-busy={summary.isFetching}>{metrics.map(([label, value]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
      {data.cardCounts.total === 0 ? <p>{filtered ? "No cards match these filters." : admin ? "There are no company cards yet." : "You do not have a company card yet. Your numbers appear here once a team admin gives you one."}</p> : null}
    </section>

    {data.cardCounts.total > 0 ? <section className="gr-panel">
      <h2>Views per day</h2>
      <DailyViewsChart daily={data.daily} />
    </section> : null}

    {admin && adoption.data ? <section className="gr-panel">
      <h2>Team adoption</h2>
      <p>How far the team has taken up its cards. Sharing counts for the person who holds the card today.</p>
      <div className="gr-metrics team-metrics">
        {([
          ["People on the team", adoption.data.totalMembers],
          ["Active people", adoption.data.activeMembers],
          ["Cards published", adoption.data.cardsPublished],
          ["Cards not published", adoption.data.cardsNotPublished],
          ["Shared their card this month", adoption.data.sharedThisMonth],
          ["Never shared their card", adoption.data.neverShared],
        ] as [string, number][]).map(([label, value]) => <div key={label}><strong>{number(value)}</strong><span>{label}</span></div>)}
      </div>
    </section> : null}

    {data.cards.length > 0 ? <section className="gr-panel">
      <h2>{admin ? "By card" : "Your cards"}</h2>
      <Table caption="Numbers for each card" first="Card" rows={data.cards.map(row => ({ ...row, key: row.id, name: row.displayName, note: [row.holderName, row.published ? null : "Not published"].filter(Boolean).join(" · ") || null }))} />
    </section> : null}

    {admin && data.people.length > 0 ? <section className="gr-panel">
      <h2>By person</h2>
      <p>In name order. People are not ranked here.</p>
      <Table caption="Numbers for each person" first="Person" rows={data.people.map(row => ({ ...row, key: row.memberId, note: row.cards === 1 ? "1 card" : `${row.cards} cards` }))} />
    </section> : null}

    {admin && data.departments.length > 1 ? <section className="gr-panel">
      <h2>By department</h2>
      <Table caption="Numbers for each department" first="Department" rows={data.departments.map(row => ({ ...row, key: row.departmentId ?? "none", note: row.cards === 1 ? "1 card" : `${row.cards} cards` }))} />
    </section> : null}

    {admin || data.leaderboard ? <section className="gr-panel">
      <h2>Leaderboard</h2>
      {admin ? <>
        <p>Optional. When it is on, everyone on the team sees the top ten people for the chosen time range. It is off unless you turn it on.</p>
        <label className="team-toggle"><input type="checkbox" checked={data.leaderboardEnabled} disabled={setLeaderboard.isPending} onChange={event => void toggleLeaderboard(event.target.checked)} /> Show the leaderboard to the team</label>
      </> : null}
      {data.leaderboard ? data.leaderboard.length === 0 ? <p>Nobody has activity in this time range yet.</p> : <div className="team-table-wrap">
        <table className="team-table">
          <caption className="sr-only">Leaderboard</caption>
          <thead><tr><th scope="col">Person</th><th scope="col">Views</th><th scope="col">Exchanges</th><th scope="col">QR scans</th></tr></thead>
          <tbody>{data.leaderboard.map((row, index) => <tr key={row.memberId} className={row.you ? "team-table-you" : undefined}>
            <th scope="row">{index + 1}. {row.name}{row.you ? <small>You</small> : null}</th>
            <td>{number(row.views)}</td><td>{number(row.exchanges)}</td><td>{number(row.qrScans)}</td>
          </tr>)}</tbody>
        </table>
      </div> : null}
    </section> : null}
  </>;
}
