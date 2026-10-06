import { trpc } from "@/lib/trpc";
import { formatPeso, type PaymentChannel } from "@shared/plans";

export const CHANNEL_LABELS: Record<PaymentChannel, string> = { gcash: "GCash", googlepay: "Google Pay" };

/**
 * One button per open payment method, for one team's monthly plan. The price shown comes from the server,
 * and the server charges its own figure whatever the browser holds.
 */
export default function TeamPay({ workspaceId, channels, priceMinor, verb = "Pay", buttonClass }: {
  workspaceId: number;
  channels: readonly PaymentChannel[];
  priceMinor: number;
  verb?: string;
  buttonClass: string;
}) {
  const checkout = trpc.billing.createTeamCheckout.useMutation();
  const pay = async (channel: PaymentChannel) => {
    try {
      const result = await checkout.mutateAsync({ workspaceId, channel });
      window.location.assign(result.redirectUrl);
    } catch { /* The error shows under the buttons. */ }
  };
  return <>
    {channels.map(channel => (
      <button key={channel} type="button" className={buttonClass} disabled={checkout.isPending} onClick={() => void pay(channel)}>
        {checkout.isPending ? "Opening checkout…" : `${verb} ${formatPeso(priceMinor)} with ${CHANNEL_LABELS[channel]}`}
      </button>
    ))}
    {checkout.error ? <p role="alert" className="plan-error">{checkout.error.message}</p> : null}
  </>;
}
