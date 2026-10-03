import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import "./google-reviews.css";

type Settings = { monthlyFreeLimit: number; warnPercent: number; nearLimitPercent: number; capEnabled: boolean; capLimit: number };

const warnings = {
  ok: null,
  warning: "Usage warning: this month's requests have passed the warning threshold.",
  near_limit: "Near limit: this month's requests are close to the free allowance.",
  over_limit: "Possible billable usage: this month's requests have passed the free allowance.",
} as const;

const number = (value: number) => value.toLocaleString();

// Everything here is read from our own request log. This page never calls Google.
export default function AdminGoogleApi() {
  const { user, loading } = useAuth();
  const isAdmin = user?.role === "admin";
  const usage = trpc.admin.placesUsage.useQuery(undefined, { enabled: isAdmin, retry: false });
  const save = trpc.admin.placesSettings.useMutation();
  const [form, setForm] = useState<Settings | null>(null);
  useEffect(() => { if (usage.data && !form) setForm(usage.data.settings); }, [usage.data, form]);

  if (loading || (isAdmin && usage.isLoading)) return <main className="gr-shell">Loading...</main>;
  if (!isAdmin) return <main className="gr-shell"><h1>Not available</h1><p>This page is for heyitsme admins.</p><Link href="/app" className="gr-back">← Back to workspace</Link></main>;
  if (!usage.data || !form) return <main className="gr-shell"><h1>Google API Usage</h1><p role="alert" className="gr-error">{usage.error?.message ?? "Usage could not be loaded."}</p></main>;

  const data = usage.data;
  const field = (key: Exclude<keyof Settings, "capEnabled">, label: string) => <label className="gr-field">{label}<input type="number" min={1} value={form[key]} onChange={e => setForm({ ...form, [key]: Number(e.target.value) })} /></label>;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try { await save.mutateAsync(form); await usage.refetch(); } catch { /* Mutation error appears below the button. */ }
  };
  const history = [["This month", 1], ["Previous month", 2], ["Last 3 months", 3], ["Last 12 months", 12]] as const;
  const months = data.months;
  const sum = (count: number, skip = 0) => months.slice(months.length - count, months.length - skip).reduce((total, month) => total + month.total, 0);

  return <main className="gr-shell" id="main">
    <Link href="/app" className="gr-back">← Back to workspace</Link>
    <header className="gr-heading"><div><span className="section-kicker">Admin</span><h1>Google API Usage</h1><p>Google Places requests made by heyitsme during business setup and reconnect. Counted in UTC.</p></div></header>
    {warnings[data.level] && <section className="gr-panel" role="alert"><strong>{warnings[data.level]}</strong></section>}
    {data.capReached && <section className="gr-panel" role="alert"><strong>Monthly cap reached. New Google business setup is paused.</strong><p>Existing review pages, QR codes, NFC links, and review redirects keep working.</p></section>}
    <section className="gr-panel">
      <h2>Google Places API Usage</h2>
      <p><strong>{number(data.month.total)} / {number(data.settings.monthlyFreeLimit)} requests</strong> · {data.percentUsed}% used</p>
      <div className="gr-meter" role="progressbar" aria-label="Monthly Google Places usage" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, data.percentUsed)}><i data-level={data.level} style={{ width: `${Math.min(100, data.percentUsed)}%` }} /></div>
      <div className="gr-metrics">{[["Requests today", data.today], ["Requests this month", data.month.total], ["Autocomplete", data.month.autocomplete], ["Place Details", data.month.placeDetails], ["Estimated free requests left", data.remainingFree], ["Businesses connected this month", data.businessesConnected], ["Estimated API usage this month", `~${number(data.projected)}`]].map(([label, value]) => <div key={label}><strong>{typeof value === "number" ? number(value) : value}</strong><span>{label}</span></div>)}</div>
      <p className="gr-attribution">Estimated API usage projects this month's pace to month end. It is not a Google bill.</p>
    </section>
    <section className="gr-panel">
      <h2>History</h2>
      <div className="gr-metrics">{history.map(([label, count]) => <div key={label}><strong>{number(count === 2 ? sum(2, 1) : sum(count))}</strong><span>{label}</span></div>)}</div>
      <table className="gr-table"><thead><tr><th>Month</th><th>Autocomplete</th><th>Place Details</th><th>Total</th></tr></thead><tbody>{[...months].reverse().map(month => <tr key={month.month}><td>{month.month}</td><td>{number(month.autocomplete)}</td><td>{number(month.placeDetails)}</td><td>{number(month.total)}</td></tr>)}</tbody></table>
    </section>
    <section className="gr-panel">
      <h2>Usage by business this month</h2>
      {data.businesses.length ? <table className="gr-table"><thead><tr><th>Business</th><th>Autocomplete</th><th>Place Details</th><th>Total</th></tr></thead><tbody>{data.businesses.map(row => <tr key={row.cardId ?? "none"}><td>{row.business ?? (row.cardId ? `Card ${row.cardId} (removed)` : "Unknown")}</td><td>{number(row.autocomplete)}</td><td>{number(row.placeDetails)}</td><td>{number(row.total)}</td></tr>)}</tbody></table> : <p>No Google Places requests this month.</p>}
    </section>
    <form className="gr-panel" onSubmit={submit}>
      <h2>Settings</h2>
      {field("monthlyFreeLimit", "Monthly free request allowance")}
      {field("warnPercent", "Usage warning at (%)")}
      {field("nearLimitPercent", "Near limit warning at (%)")}
      <label><input type="checkbox" checked={form.capEnabled} onChange={e => setForm({ ...form, capEnabled: e.target.checked })} /> Enforce Google API monthly cap</label>
      {form.capEnabled && field("capLimit", "Maximum Google Places requests per month")}
      <p className="gr-attribution">When the cap is reached, only new business setup stops. Review pages, QR, NFC, and review redirects are never blocked.</p>
      <div className="gr-actions"><button className="gr-primary" disabled={save.isPending}>{save.isPending ? "Saving..." : "Save settings"}</button></div>
      {save.error && <p role="alert" className="gr-error">{save.error.message}</p>}
      {save.isSuccess && <p role="status">Settings saved.</p>}
    </form>
  </main>;
}
