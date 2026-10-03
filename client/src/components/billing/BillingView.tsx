import { PLAN_LABELS, useBilling, useUpgrade } from "@/lib/billing";
import { trpc } from "@/lib/trpc";
import { formatPeso } from "@shared/plans";
import { motion } from "framer-motion";
import { CreditCard, Receipt, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import "./billing.css";

const dateText = (value: Date | string) => new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric",
  });

const STATUS_TEXT: Record<string, string> = {
  created: "Not started",
  pending: "Waiting for confirmation",
  succeeded: "Paid",
  failed: "Not completed",
  refunded: "Refunded",
  partially_refunded: "Partly refunded",
};

/** Reads ?payment=… after the hosted checkout and follows it until the server has a verified result. */
function usePaymentReturn() {
  const [invoiceNo] = useState(() => new URLSearchParams(window.location.search).get("payment"));
  const [attempts, setAttempts] = useState(0);
  const utils = trpc.useUtils();
  const valid = Boolean(invoiceNo && /^[A-Za-z0-9]{1,50}$/.test(invoiceNo));
  const status = trpc.billing.paymentStatus.useQuery(
    { invoiceNo: invoiceNo ?? "" },
    {
      enabled: valid,
      retry: false,
      // Poll while the gateway result is on its way; give up after about two minutes.
      refetchInterval: query => {
        const s = query.state.data?.status;
        return s && s !== "pending" && s !== "created" ? false : attempts < 40 ? 3000 : false;
      },
    }
  );
  useEffect(() => {
    if (status.dataUpdatedAt) setAttempts(n => n + 1);
  }, [status.dataUpdatedAt]);
  useEffect(() => {
    if (status.data?.status === "succeeded") {
      void utils.billing.me.invalidate();
      void utils.billing.paymentHistory.invalidate();
    }
  }, [status.data?.status, utils]);
  const dismiss = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("payment");
    window.history.replaceState(null, "", url.pathname + url.search);
  };
  return { valid, status: status.data?.status, gaveUp: attempts >= 40, dismiss, isError: status.isError,
  };
}

export default function BillingView() {
  const billing = useBilling(true);
  const history = trpc.billing.paymentHistory.useQuery(undefined, { retry: false,
  });
  const cancel = trpc.billing.cancelSubscription.useMutation();
  const resume = trpc.billing.resumeSubscription.useMutation();
  const utils = trpc.useUtils();
  const { openUpgrade } = useUpgrade();
  const returned = usePaymentReturn();

  if (billing.isLoading) return (
      <div className="page-stack"><div className="glass-panel billing-panel" aria-busy="true">Loading your plan…</div></div>
    );
  if (billing.isError || !billing.data) {
    return (
      <div className="page-stack">
        <div className="empty-state glass-panel">
          <CreditCard size={24} aria-hidden="true" />
          <strong>Could not load your plan.</strong>
          <button type="button" className="outline-button" onClick={() => void billing.refetch()}>Try again</button>
        </div>
      </div>
    );
  }

  const { entitlements: ent, usage, subscription } = billing.data;
  const refresh = () => Promise.all([utils.billing.me.invalidate(), utils.billing.paymentHistory.invalidate(),
    ]);
  const onCancel = async () => {
    try {
      const result = await cancel.mutateAsync();
      toast.success(`Pro stays on until ${dateText(result.currentPeriodEnd)}. Nothing is deleted after that.`
      );
      await refresh();
    } catch (error: any) {
      toast.error(error?.message ?? "Could not cancel. Try again.");
    }
  };
  const onResume = async () => {
    try {
      await resume.mutateAsync();
      toast.success("Your plan will keep going.");
      await refresh();
    } catch (error: any) {
      toast.error(error?.message ?? "Could not resume. Try again.");
    }
  };

  const leadText =
    usage.leads.limit === null
      ? `${usage.leads.used} this month · unlimited`
      : `${usage.leads.used} / ${usage.leads.limit} this month`;
  const returnMessage = !returned.valid
    ? ""
    : returned.status === "succeeded"
      ? "Payment confirmed. Pro is on."
      : returned.status === "failed"
        ? "The payment did not go through, so Pro is not on. You can try again."
        : returned.gaveUp || returned.isError
          ? "We're still waiting for the payment result. If you paid, Pro turns on as soon as it arrives. Refresh this page in a few minutes."
          : "Confirming your payment…";

  return (
    <motion.div
      className="page-stack"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="page-heading-row">
        <div>
          <span className="section-kicker">
            <CreditCard size={14} aria-hidden="true" /> Billing
          </span>
          <h1>
            Your plan,
            <br />
            <em>plainly.</em>
          </h1>
          <p>What you have, what you've used this month, and every payment.</p>
        </div>
      </div>

      {returned.valid ? (
        <div
          className={`billing-return ${returned.status === "failed" ? "is-failed" : ""}`}
          role="status"
          aria-live="polite"
        >
          <span>{returnMessage}</span>
          {returned.status &&
          returned.status !== "pending" &&
          returned.status !== "created" ? (
            <button
              type="button"
              className="text-button"
              onClick={returned.dismiss}
            >
              Dismiss
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="billing-grid">
        <section
          className="glass-panel billing-panel"
          aria-labelledby="billing-plan-heading"
        >
          <h2 id="billing-plan-heading" className="billing-panel-title">
            Current plan
          </h2>
          <div className="billing-plan-line">
            <span className={`plan-chip plan-chip-${ent.plan}`}>
              {PLAN_LABELS[ent.plan]}
            </span>
          </div>
          {ent.source === "complimentary" ? (
            <p className="billing-meta">
              Every feature is included on this account. No payment needed.
            </p>
          ) : subscription ? (
            <>
              <p className="billing-meta">
                Paid amount {formatPeso(subscription.priceMinor)}
              </p>
              <p className="billing-meta">
                {subscription.cancelAtPeriodEnd
                  ? `Canceled. Pro stays on until ${dateText(subscription.currentPeriodEnd)}, then your account moves to Free. Nothing is deleted.`
                  : `Paid through ${dateText(subscription.currentPeriodEnd)}. We'll remind you before it ends.`}
              </p>
              <div className="billing-actions">
                {subscription.cancelAtPeriodEnd ? (
                  <button type="button" className="outline-button" onClick={() => void onResume()} disabled={resume.isPending}>Keep my plan</button>
                ) : (
                  <button type="button" className="outline-button" onClick={() => void onCancel()} disabled={cancel.isPending}>Cancel at period end</button>
                )}
                {billing.data.checkoutOpen ? (
                  <button type="button" className="glass-button glass-button-primary" onClick={() => openUpgrade("general")}>Renew early</button>
                ) : null}
              </div>
            </>
          ) : (
            <>
              <p className="billing-meta">Your profile, QR code and card link stay free and never expire.
                Pro includes 5 cards, unlimited contact exchanges, 365-day
                analytics, premium colors, gradients, animations, advanced QR,
                QR campaigns and branding removal.
              </p>
              <div className="billing-actions">
                <button type="button" className="glass-button glass-button-primary" onClick={() => openUpgrade("general")}>
                  <Sparkles size={15} aria-hidden="true" /> Upgrade to Pro ?
                  ?299/month
                </button>
              </div>
            </>
          )}
        </section>

        <section className="glass-panel billing-panel" aria-labelledby="billing-usage-heading">
          <h2 id="billing-usage-heading" className="billing-panel-title">This month</h2>
          <dl className="billing-usage">
            <div><dt>Cards</dt><dd>{usage.cards.limit >= 500 ? `${usage.cards.used} · no plan limit`
                  : `${usage.cards.used} / ${usage.cards.limit}`}
              </dd>
            </div>
            <div>
              <dt>Contact Exchanges</dt>
              <dd>{leadText}</dd>
            </div>
            <div>
              <dt>Insights history</dt>
              <dd>{ent.limits.analyticsDays} days</dd>
            </div>
          </dl>
          {!ent.limitsEnforced && ent.plan === "free" ? (
            <p className="billing-fine">
              Free-plan limits are not switched on yet, so nothing is limited
              today.
            </p>
          ) : null}
        </section>
      </div>

      <section
        className="glass-panel billing-panel"
        aria-labelledby="billing-history-heading"
      >
        <h2 id="billing-history-heading" className="billing-panel-title">
          <Receipt size={15} aria-hidden="true" /> Payments
        </h2>
        {history.isError ? (
          <p className="billing-meta">
            Could not load payments.{" "}
            <button
              type="button"
              className="text-button"
              onClick={() => void history.refetch()}
            >
              Try again
            </button>
          </p>
        ) : !history.data?.length ? (
          <p className="billing-meta">No payments yet.</p>
        ) : (
          <ul className="billing-history">
            {history.data.map(payment => (
              <li key={payment.invoiceNo}>
                <span>
                  <strong>Pro</strong>
                  <small>
                    {dateText(payment.createdAt)} ·{" "}
                    {payment.channel === "gcash" ? "GCash" : "Google Pay"} · #
                    {payment.invoiceNo}
                  </small>
                </span>
                <span className="billing-history-amount">
                  {formatPeso(payment.amountMinor)}
                  <small className={`pay-status pay-status-${payment.status}`}>
                    {STATUS_TEXT[payment.status] ?? payment.status}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </motion.div>
  );
}
