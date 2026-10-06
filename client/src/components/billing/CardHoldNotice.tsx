import "./billing.css";

type CardHolds = {
  holdFrom: Date | string;
  held: boolean;
  cards: { id: number; displayName: string; uses: string[] }[];
};

const dateText = (value: Date | string) => new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

/** For an owner whose Pro has ended: which cards are paused, or will be, why, and the two ways to bring them back. */
export default function CardHoldNotice({ holds, onRenew, onEdit }: { holds: CardHolds; onRenew: () => void; onEdit: (cardId: number) => void }) {
  const count = holds.cards.length;
  const cards = count === 1 ? "1 card" : `${count} cards`;
  return (
    <section className="hold-notice" role="status">
      <p>
        <strong>{holds.held ? `Pro has ended, so ${cards} ${count === 1 ? "is" : "are"} paused.` : `Pro has ended. ${cards} will be paused on ${dateText(holds.holdFrom)}.`}</strong>{" "}
        {holds.held ? "People who open the link, QR code or NFC tag see a paused page." : "After that, people who open the link, QR code or NFC tag see a paused page."} Renew Pro, or take the Pro features off a card, to keep it online. Nothing is deleted.
      </p>
      <ul>
        {holds.cards.map(card => (
          <li key={card.id}>
            <span><strong>{card.displayName}</strong>: {card.uses.join(", ")}</span>
            <button type="button" className="text-button" onClick={() => onEdit(card.id)}>Edit card</button>
          </li>
        ))}
      </ul>
      <button type="button" className="outline-button" onClick={onRenew}>Renew Pro</button>
    </section>
  );
}
