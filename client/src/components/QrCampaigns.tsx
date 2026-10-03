import { trpc } from "@/lib/trpc";
import { useBilling, useUpgrade } from "@/lib/billing";
import { useEffect, useState } from "react";
import { QrPreview } from "./QrPreview";
import { parsePageConfig } from "@shared/pageConfig";
import { useAuth } from "@/_core/hooks/useAuth";
export function QrCampaigns({
  cards,
}: {
  cards: {
    id: number;
    displayName: string;
    slug: string;
    page?: string | null;
  }[];
}) {
  const { isAuthenticated } = useAuth();
  const billing = useBilling(isAuthenticated);
  const { openUpgrade } = useUpgrade();
  const pro = Boolean(billing.data?.entitlements.canRemoveBranding);
  const campaigns = trpc.qrCampaigns.list.useQuery(undefined, {
    enabled: pro,
    retry: false,
  });
  const create = trpc.qrCampaigns.create.useMutation();
  const [name, setName] = useState("");
  const [cardId, setCardId] = useState(cards[0]?.id ?? 0);
  useEffect(() => {
    if (!cards.some(c => c.id === cardId)) setCardId(cards[0]?.id ?? 0);
  }, [cards, cardId]);
  const save = async () => {
    if (!pro) {
      openUpgrade("general");
      return;
    }
    try {
      await create.mutateAsync({ cardId, name });
      setName("");
      await campaigns.refetch();
    } catch {}
  };
  return (
    <section className="glass-panel billing-panel">
      <h2>
        QR campaigns <small className="plan-chip plan-chip-pro">PRO</small>
      </h2>
      <p>Track networking events, printed cards, social links and NFC cards.</p>
      <label>
        Card
        <select
          value={cardId}
          onChange={e => setCardId(Number(e.target.value))}
        >
          {cards.map(c => (
            <option key={c.id} value={c.id}>
              {c.displayName}
            </option>
          ))}
        </select>
      </label>
      <label>
        Campaign name
        <input
          maxLength={80}
          value={name}
          placeholder="Networking Event"
          onChange={e => setName(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="outline-button"
        disabled={create.isPending || (pro && (!name.trim() || !cardId))}
        onClick={() => void save()}
      >
        {pro ? "Create QR campaign" : "Unlock QR campaigns — PRO"}
      </button>
      {create.error ? <p role="alert">{create.error.message}</p> : null}
      {campaigns.error ? <p role="alert">{campaigns.error.message}</p> : null}
      <div className="design-grid">
        {campaigns.data?.map(c => {
          const card = cards.find(card => card.id === c.cardId);
          if (!card) return null;
          const url = `${window.location.origin}/c/${encodeURIComponent(card.slug)}?campaign=${encodeURIComponent(c.id)}`;
          return (
            <div key={c.id}>
              <h3>{c.name}</h3>
              <QrPreview
                downloadable
                value={url}
                design={parsePageConfig(card.page).qr}
              />
              <a href={url} target="_blank" rel="noreferrer">
                Open campaign link
              </a>
            </div>
          );
        })}
      </div>
    </section>
  );
}
