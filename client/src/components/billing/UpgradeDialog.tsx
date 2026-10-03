import { useAuth } from "@/_core/hooks/useAuth";
import { startGoogleLogin } from "@/const";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useBilling, type UpgradeReason } from "@/lib/billing";
import { trpc } from "@/lib/trpc";
import type { PaymentChannel } from "@shared/plans";
import { useState } from "react";
import "./billing.css";
const reasons: Record<UpgradeReason, string> = {
  general: "Unlock Pro customization",
  branding: "Make your card your own",
  card_limit: "Create more cards with Pro",
  analytics: "Unlock long-term analytics with Pro",
  lead_warning: "Keep every contact exchange",
  lead_limit: "You've received 10 contact exchanges this month",
};
export default function UpgradeDialog({
  reason,
  open,
  onOpenChange,
}: {
  reason: UpgradeReason;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { isAuthenticated } = useAuth();
  const billing = useBilling(open && isAuthenticated);
  const checkout = trpc.billing.createCheckout.useMutation();
  const [channel, setChannel] = useState<PaymentChannel | null>(null);
  const selected = channel ?? billing.data?.channels[0];
  const start = async () => {
    if (!isAuthenticated) {
      startGoogleLogin("/app/billing?upgrade=1");
      return;
    }
    if (!selected) return;
    try {
      const result = await checkout.mutateAsync({
        planCode: "pro",
        billingCycle: "monthly",
        channel: selected,
      });
      window.location.assign(result.redirectUrl);
    } catch {}
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="upgrade-dialog">
        <span className="plan-chip plan-chip-pro">PRO</span>
        <DialogTitle>{reasons[reason]}</DialogTitle>
        <DialogDescription>
          Create a more distinctive card with premium colors, gradients,
          animations, advanced analytics and unlimited contact exchanges.
        </DialogDescription>
        <p className="upgrade-price">
          <strong>₱299</strong>
          <span>/month</span>
        </p>
        <p>5 cards · 365-day analytics · Advanced QR · Contact management</p>
        {billing.data?.channels.map(c => (
          <label key={c}>
            <input
              type="radio"
              name="payment-channel"
              checked={selected === c}
              onChange={() => setChannel(c)}
            />
            {c === "gcash" ? "GCash" : "Google Pay"}
          </label>
        ))}
        <button
          className="glass-button glass-button-primary upgrade-cta"
          disabled={
            isAuthenticated &&
            (!billing.data?.checkoutOpen || checkout.isPending)
          }
          onClick={() => void start()}
        >
          {checkout.isPending
            ? "Opening checkout…"
            : "Upgrade to Pro — ₱299/month"}
        </button>
        {isAuthenticated && !billing.data?.checkoutOpen ? (
          <p role="status">Checkout is not open yet.</p>
        ) : (
          <p>
            Your monthly access starts after payment verification. Renew from
            Billing before it ends.
          </p>
        )}
        {checkout.error ? <p role="alert">{checkout.error.message}</p> : null}
        {billing.isError ? (
          <p role="alert">Could not load billing. Try again.</p>
        ) : null}
        <button className="outline-button" onClick={() => onOpenChange(false)}>
          Maybe later
        </button>
      </DialogContent>
    </Dialog>
  );
}
