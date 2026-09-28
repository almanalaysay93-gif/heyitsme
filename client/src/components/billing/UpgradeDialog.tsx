import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useBilling, type UpgradeReason } from "@/lib/billing";
import { trpc } from "@/lib/trpc";
import { annualSavingsMinor, formatPeso, FOUNDING_MEMBER_LIMIT, planPriceMinor, type BillingCycle, type PaymentChannel } from "@shared/plans";
import { Check, LockKeyhole, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import "./billing.css";

const COPY: Record<UpgradeReason, { title: string; body: string }> = {
  lead_warning: {
    title: "Your free leads are almost used up.",
    body: "Free takes 10 new leads a month. Pro keeps lead capture on all month, however many people you meet.",
  },
  lead_limit: {
    title: "Keep the conversations going.",
    body: "You've used your free lead allowance this month. Pro keeps lead capture active and unlocks your full networking history.",
  },
  analytics: {
    title: "See the whole year, not just the week.",
    body: "Free shows the last 7 days. Pro keeps 30, 90 and 365-day insights, so you can see which events and links bring people back.",
  },
  card_limit: {
    title: "Room for more than one you.",
    body: "Free includes 1 card. Pro gives you up to 3, for a second role, a side business, or an event. Your existing cards stay as they are.",
  },
  branding: {
    title: "Make the page all yours.",
    body: "Pro removes the heyitsme name from your page header and footer.",
  },
  general: {
    title: "Turn introductions into opportunities.",
    body: "Pro is for people whose networking is starting to bring in work.",
  },
};

const ROWS: [string, string, string][] = [
  ["Cards", "1", "Up to 3"],
  ["New leads", "10 a month", "Unlimited"],
  ["Insights", "Last 7 days", "Up to 365 days"],
  ["heyitsme branding", "Shown", "Removable"],
];

const CHANNEL_LABELS: Record<PaymentChannel, string> = { googlepay: "Google Pay", gcash: "GCash" };

export default function UpgradeDialog({ reason, open, onOpenChange }: { reason: UpgradeReason; open: boolean; onOpenChange: (open: boolean) => void }) {
  const billing = useBilling(open);
  const data = billing.data;
  const [cycle, setCycle] = useState<BillingCycle>("annual");
  const [channel, setChannel] = useState<PaymentChannel | null>(null);
  const checkout = trpc.billing.createCheckout.useMutation();

  useEffect(() => {
    if (data?.channels.length && (!channel || !data.channels.includes(channel))) setChannel(data.channels[0]);
    if (data && !data.cycles.includes(cycle)) setCycle(data.cycles[0]);
  }, [data, channel, cycle]);

  const founding = Boolean(data?.foundingEligible && data.foundingOfferEnabled);
  const price = planPriceMinor("pro", cycle, founding);
  const standard = planPriceMinor("pro", cycle, false);
  const copy = COPY[reason];
  const isPro = data && data.entitlements.plan !== "free";

  const start = async () => {
    if (!channel) return;
    try {
      const session = await checkout.mutateAsync({ planCode: "pro", billingCycle: cycle, channel });
      window.location.assign(session.redirectUrl);
    } catch {
      // The message renders below from checkout.error.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="upgrade-dialog">
        <span className="plan-chip plan-chip-pro"><Sparkles size={13} aria-hidden="true" /> Pro</span>
        <DialogTitle className="upgrade-title">{copy.title}</DialogTitle>
        <DialogDescription className="upgrade-body">{copy.body}</DialogDescription>

        {isPro ? (
          <p className="upgrade-note">You're already on {data.entitlements.plan === "teams" ? "Teams" : "Pro"}. Everything below is included.</p>
        ) : null}

        <table className="upgrade-compare">
          <caption className="sr-only">Free compared with Pro</caption>
          <thead>
            <tr><th scope="col"><span className="sr-only">Feature</span></th><th scope="col">Free</th><th scope="col">Pro</th></tr>
          </thead>
          <tbody>
            {ROWS.map(([label, free, pro]) => (
              <tr key={label}><th scope="row">{label}</th><td>{free}</td><td><Check size={13} aria-hidden="true" /> {pro}</td></tr>
            ))}
          </tbody>
        </table>

        {!isPro ? (
          <>
            <div className="cycle-toggle" role="radiogroup" aria-label="Billing period">
              {(["monthly", "annual"] as const).map((option) => {
                const available = !data || data.cycles.includes(option);
                return (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={cycle === option}
                    disabled={!available}
                    className={cycle === option ? "is-active" : ""}
                    onClick={() => setCycle(option)}
                  >
                    {option === "monthly" ? "Monthly" : "Yearly"}
                    {!available ? <small>Soon</small> : option === "annual" ? <small>Save {formatPeso(annualSavingsMinor("pro", founding))}</small> : null}
                  </button>
                );
              })}
            </div>

            <p className="upgrade-price">
              <strong>{formatPeso(price)}</strong>
              <span>/{cycle === "annual" ? "year" : "month"}</span>
              {founding ? <s aria-label={`Standard price ${formatPeso(standard)}`}>{formatPeso(standard)}</s> : null}
            </p>
            {founding ? (
              <p className="founding-line"><span className="plan-chip plan-chip-founding">Founding Member</span> Founding price for the first {FOUNDING_MEMBER_LIMIT} members. It stays while your plan stays active.</p>
            ) : null}

            {data?.checkoutOpen ? (
              <>
                <fieldset className="channel-picker">
                  <legend>Pay with</legend>
                  {data.channels.map((option) => (
                    <label key={option} className={channel === option ? "is-active" : ""}>
                      <input type="radio" name="channel" value={option} checked={channel === option} onChange={() => setChannel(option)} />
                      {CHANNEL_LABELS[option]}
                    </label>
                  ))}
                </fieldset>
                <button type="button" className="glass-button glass-button-primary upgrade-cta" onClick={() => void start()} disabled={!channel || checkout.isPending}>
                  {checkout.isPending ? "Opening checkout…" : "Continue to secure checkout"}
                </button>
                <p className="upgrade-fine">You pay on the 2C2P payment page. heyitsme never sees or stores your card details. Pro starts once the payment is confirmed.</p>
              </>
            ) : (
              <p className="upgrade-closed" role="note">
                <LockKeyhole size={14} aria-hidden="true" /> Checkout opens soon. Nothing changes for you until then.
              </p>
            )}
            <p className="sr-only" aria-live="polite">{checkout.isPending ? "Opening checkout" : ""}</p>
            {checkout.error ? <p className="upgrade-error" role="alert">{checkout.error.message}</p> : null}
          </>
        ) : null}
        {billing.isError ? <p className="upgrade-error" role="alert">Could not load your plan. Close this and try again.</p> : null}
      </DialogContent>
    </Dialog>
  );
}
