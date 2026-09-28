import type { UpgradeReason } from "@/lib/billing";
import { leadUsageState, type LeadUsage as Usage } from "@shared/plans";
import { PauseCircle, Sparkles } from "lucide-react";
import "./billing.css";

/** "8 / 10 leads this month". A notice from lead 8, "paused" at the limit. Past contacts are never hidden. */
export function LeadUsage({ usage, onUpgrade }: { usage: Usage; onUpgrade: (reason: UpgradeReason) => void }) {
  const state = leadUsageState(usage);
  if (state === "unlimited" || usage.limit === null) return <div className="lead-usage"><Sparkles size={15} aria-hidden="true" /> <strong>Unlimited lead capture</strong></div>;
  const percent = Math.min(100, Math.round((usage.used / usage.limit) * 100));
  return (
    <div className={`lead-usage is-${state}`} role="status">
      {state === "paused" ? <PauseCircle size={16} aria-hidden="true" /> : null}
      <strong>{state === "paused" ? "Lead capture paused" : `${usage.used} / ${usage.limit} leads this month`}</strong>
      <span className="lead-usage-bar" role="progressbar" aria-label="Free leads used this month" aria-valuemin={0} aria-valuemax={usage.limit} aria-valuenow={usage.used}>
        <i style={{ width: `${percent}%` }} />
      </span>
      <span>
        {state === "paused"
          ? "Your page shows direct contact options until next month. Everyone you already met is still here."
          : state === "warning"
            ? `${usage.limit - usage.used} left this month.`
            : "Free includes 10 new leads a month."}
      </span>
      {state !== "ok" ? (
        <button type="button" className="glass-button glass-button-primary" onClick={() => onUpgrade(state === "paused" ? "lead_limit" : "lead_warning")}>
          Upgrade
        </button>
      ) : null}
    </div>
  );
}
