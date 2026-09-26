import { trpc } from "@/lib/trpc";
import { motion } from "framer-motion";
import { BarChart3, Download, Eye, Link2, Moon, Share2, Sparkles, Sun, UserRoundPlus } from "lucide-react";
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

type Range = 7 | 30 | 90;
const ranges: Range[] = [7, 30, 90];

const dayLabel = (day: string, options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { ...options, timeZone: "UTC" });

const plural = (count: number, word: string) => `${count.toLocaleString()} ${word}${count === 1 ? "" : "s"}`;

/** Round the axis top up to a friendly number so the one gridline label reads cleanly. */
function niceMax(value: number) {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const steps = [1, 2, 2.5, 5, 10];
  const step = steps.find((candidate) => candidate * magnitude >= value) ?? 10;
  return step * magnitude;
}

export function DailyViewsChart({ daily }: { daily: { day: string; views: number }[] }) {
  const [active, setActive] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState(daily.length - 1);
  const barRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const titleId = useId();
  const max = niceMax(Math.max(0, ...daily.map((d) => d.views)));
  const current = active !== null ? daily[active] : null;
  const tickIndexes = daily.length <= 7 ? daily.map((_, index) => index) : [0, Math.floor((daily.length - 1) / 2), daily.length - 1];

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const moves: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: daily.length - 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = Math.min(daily.length - 1, Math.max(0, moves[event.key]));
    setFocusIndex(next);
    setActive(next);
    barRefs.current[next]?.focus();
  };

  return (
    <div className="views-chart">
      <span id={titleId} className="sr-only">Card views per day. Use the arrow keys to move between days.</span>
      <div className="views-chart-plot" role="group" aria-labelledby={titleId} onMouseLeave={() => setActive(null)}>
        <div className="views-chart-axis" aria-hidden="true">
          <span>{max.toLocaleString()}</span>
          <span>0</span>
        </div>
        <div className="views-chart-bars" style={{ ["--bar-count" as string]: daily.length }}>
          <span className="views-chart-gridline" aria-hidden="true" />
          {daily.map((point, index) => (
            <button
              key={point.day}
              ref={(node) => { barRefs.current[index] = node; }}
              type="button"
              className={`views-chart-bar ${active === index ? "is-active" : ""}`}
              tabIndex={index === focusIndex ? 0 : -1}
              aria-label={`${dayLabel(point.day, { weekday: "short", month: "short", day: "numeric" })}: ${plural(point.views, "view")}`}
              onMouseEnter={() => setActive(index)}
              onFocus={() => { setActive(index); setFocusIndex(index); }}
              onBlur={() => setActive(null)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              <span className="views-chart-fill" style={{ height: point.views > 0 ? `max(3px, ${(point.views / max) * 100}%)` : 0 }} />
            </button>
          ))}
          {current && active !== null ? (
            <div
              className="views-chart-tooltip"
              aria-hidden="true"
              style={{ left: `${((active + 0.5) / daily.length) * 100}%` }}
            >
              <strong>{plural(current.views, "view")}</strong>
              <span>{dayLabel(current.day, { weekday: "short", month: "short", day: "numeric" })}</span>
            </div>
          ) : null}
        </div>
      </div>
      <div className="views-chart-ticks" aria-hidden="true">
        {tickIndexes.map((index) => (
          <span key={daily[index].day} style={{ left: `${((index + 0.5) / daily.length) * 100}%` }}>
            {dayLabel(daily[index].day)}
          </span>
        ))}
      </div>
    </div>
  );
}

type TableTheme = "light" | "dark";
const TABLE_THEME_KEY = "heyitsme.insights.tableTheme";

function readTableTheme(): TableTheme {
  try {
    return window.localStorage.getItem(TABLE_THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function TableThemeToggle({ value, onChange }: { value: TableTheme; onChange: (value: TableTheme) => void }) {
  return (
    <div className="table-theme-toggle" role="group" aria-label="Table theme">
      <button type="button" aria-label="Light table" aria-pressed={value === "light"} className={value === "light" ? "is-active" : ""} onClick={() => onChange("light")}>
        <Sun size={13} aria-hidden="true" />
      </button>
      <button type="button" aria-label="Dark table" aria-pressed={value === "dark"} className={value === "dark" ? "is-active" : ""} onClick={() => onChange("dark")}>
        <Moon size={13} aria-hidden="true" />
      </button>
    </div>
  );
}

export const SAMPLE_GUEST_INSIGHTS = {
  days: 30,
  from: "2026-08-28",
  to: "2026-09-26",
  totals: { views: 142, vcard: 38, exchanges: 12, links: 45, shares: 9 },
  exchangeRate: 12 / 142,
  daily: [
    { day: "2026-09-20", views: 12 },
    { day: "2026-09-21", views: 18 },
    { day: "2026-09-22", views: 24 },
    { day: "2026-09-23", views: 15 },
    { day: "2026-09-24", views: 32 },
    { day: "2026-09-25", views: 21 },
    { day: "2026-09-26", views: 20 },
  ],
  cards: [
    {
      id: -1,
      displayName: "Alex Morgan",
      slug: "alex-morgan",
      published: true,
      views: 142,
      vcard: 38,
      exchanges: 12,
      links: 45,
      shares: 9,
    },
  ],
  topLinks: [
    { label: "Portfolio website", count: 24 },
    { label: "LinkedIn profile", count: 16 },
    { label: "Book a time", count: 5 },
  ],
};

export function InsightsView({ isAuthenticated, onSignIn }: { isAuthenticated: boolean; onSignIn: () => void }) {
  const [days, setDays] = useState<Range>(30);
  const [tableTheme, setTableThemeState] = useState<TableTheme>(readTableTheme);
  const setTableTheme = (value: TableTheme) => {
    setTableThemeState(value);
    try {
      window.localStorage.setItem(TABLE_THEME_KEY, value);
    } catch {}
  };
  const tableScrollClass = `insight-table-scroll${tableTheme === "dark" ? " is-dark" : ""}`;
  const summaryQuery = trpc.insights.summary.useQuery({ days }, { enabled: isAuthenticated, retry: false, placeholderData: (previous) => previous });
  const summary = isAuthenticated ? summaryQuery.data : SAMPLE_GUEST_INSIGHTS;
  const topLinkMax = useMemo(() => Math.max(1, ...(summary?.topLinks ?? []).map((link) => link.count)), [summary?.topLinks]);

  const heading = (
    <div className="page-heading-row">
      <div>
        <span className="section-kicker"><BarChart3 size={14} /> Insights</span>
        <h1>See what<br /><em>lands.</em></h1>
        <p>Views, contact-save actions, and link taps from people who open your cards.</p>
      </div>
      {isAuthenticated ? (
        <div className="range-toggle" role="group" aria-label="Date range">
          {ranges.map((range) => (
            <button key={range} type="button" aria-pressed={days === range} className={days === range ? "is-active" : ""} onClick={() => setDays(range)}>
              {range} days
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );

  if (isAuthenticated && summaryQuery.isError) {
    return (
      <motion.div className="page-stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        {heading}
        <div className="empty-state glass-panel">
          <BarChart3 size={24} />
          <strong>Could not load your insights.</strong>
          <button type="button" className="outline-button" onClick={() => void summaryQuery.refetch()}>Try again</button>
        </div>
      </motion.div>
    );
  }

  const totals = summary?.totals;
  const tiles = [
    { key: "views", label: "Views", icon: Eye, value: totals?.views, caption: "Times your pages were opened." },
    { key: "vcard", label: "Contact saves", icon: Download, value: totals?.vcard, caption: "Contact file (.vcf) downloads." },
    {
      key: "exchanges",
      label: "Exchanged details",
      icon: UserRoundPlus,
      value: totals?.exchanges,
      caption: summary?.exchangeRate != null ? `${(summary.exchangeRate * 100).toFixed(summary.exchangeRate < 0.1 ? 1 : 0)}% of views` : "Sent their details back.",
    },
    { key: "links", label: "Link taps", icon: Link2, value: totals?.links, caption: `${plural(totals?.shares ?? 0, "share")} of your page.` },
  ];
  const noActivity = summary && Object.values(summary.totals).every((value) => value === 0);

  return (
    <motion.div className="page-stack" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} aria-busy={summaryQuery.isFetching}>
      {heading}

      {!isAuthenticated ? (
        <div className="guest-sample-banner">
          <Sparkles size={18} />
          <div className="guest-sample-copy">
            <strong>Sample insights preview</strong>
            <span>See what gets tapped and track views, contact saves, and link taps once your card is published.</span>
          </div>
          {onSignIn ? (
            <button type="button" className="glass-button glass-button-primary" onClick={onSignIn}>
              Continue with Google
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="insight-tiles">
        {tiles.map((tile) => (
          <div key={tile.key} className="insight-tile glass-panel">
            <span className="mini-label"><tile.icon size={13} /> {tile.label}</span>
            <strong>{tile.value === undefined ? "–" : tile.value.toLocaleString()}</strong>
            <span className="stat-caption">{tile.caption}</span>
          </div>
        ))}
      </div>

      <section className="glass-panel insight-panel" aria-labelledby="daily-views-title">
        <div className="panel-header">
          <div>
            <span className="mini-label">Last {days} days</span>
            <h2 id="daily-views-title">Daily views</h2>
          </div>
        </div>
        {summary ? (
          <>
            <DailyViewsChart daily={summary.daily} />
            {noActivity ? <p className="insight-empty-note">No visits yet in this range. Share your link or QR code to get the first ones.</p> : null}
            <details className="insight-table-toggle">
              <summary>Show daily numbers</summary>
              <div className="insight-table-tools"><TableThemeToggle value={tableTheme} onChange={setTableTheme} /></div>
              <div className={tableScrollClass}>
                <table className="insight-table">
                  <caption className="sr-only">Views per day, last {days} days</caption>
                  <thead><tr><th scope="col">Day</th><th scope="col">Views</th></tr></thead>
                  <tbody>
                    {[...summary.daily].reverse().map((point) => (
                      <tr key={point.day}><th scope="row">{dayLabel(point.day, { weekday: "short", month: "short", day: "numeric" })}</th><td>{point.views.toLocaleString()}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        ) : (
          <div className="views-chart-skeleton" aria-label="Loading daily views" />
        )}
      </section>

      <div className="insight-grid">
        <section className="glass-panel insight-panel" aria-labelledby="per-card-title">
          <div className="panel-header"><div><span className="mini-label">By card</span><h2 id="per-card-title">Which version works</h2></div>{summary && summary.cards.length ? <TableThemeToggle value={tableTheme} onChange={setTableTheme} /> : null}</div>
          {summary && summary.cards.length ? (
            <div className={tableScrollClass}>
              <table className="insight-table">
                <thead>
                  <tr><th scope="col">Card</th><th scope="col">Views</th><th scope="col">Saved</th><th scope="col">Exchanged</th><th scope="col">Taps</th></tr>
                </thead>
                <tbody>
                  {summary.cards.map((card) => (
                    <tr key={card.id}>
                      <th scope="row"><span className="insight-card-name">{card.displayName}</span>{card.published ? null : <small> · private</small>}</th>
                      <td>{card.views.toLocaleString()}</td>
                      <td>{card.vcard.toLocaleString()}</td>
                      <td>{card.exchanges.toLocaleString()}</td>
                      <td>{card.links.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="insight-empty-note">{summary ? "Create a card to see it here." : "Loading…"}</p>
          )}
        </section>

        <section className="glass-panel insight-panel" aria-labelledby="top-links-title">
          <div className="panel-header"><div><span className="mini-label">Most tapped</span><h2 id="top-links-title">Where people go next</h2></div><Share2 size={16} className="insight-panel-icon" aria-hidden="true" /></div>
          {summary && summary.topLinks.length ? (
            <ol className="top-links">
              {summary.topLinks.map((link) => (
                <li key={link.label}>
                  <span className="top-links-label">{link.label}</span>
                  <span className="top-links-count">{plural(link.count, "tap")}</span>
                  <span className="top-links-bar" aria-hidden="true"><i style={{ width: `${(link.count / topLinkMax) * 100}%` }} /></span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="insight-empty-note">{summary ? "Taps on your email, phone, links, and channels will show here." : "Loading…"}</p>
          )}
        </section>
      </div>
    </motion.div>
  );
}
