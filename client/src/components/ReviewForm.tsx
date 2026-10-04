import { Star } from "lucide-react";
import { useState } from "react";

export type ReviewInput = { name: string; rating: number; body: string; website: string };

/** "Leave a review" on a Business or Services card. The review reaches the owner first; it shows once they approve it. */
export function ReviewForm({ onSubmit }: { onSubmit: (review: ReviewInput) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  if (state === "sent") {
    return <p className="lx-review-form-done" role="status">Thank you. Your review will show here once the owner approves it.</p>;
  }
  if (!open) {
    return (
      <button type="button" className="lx-btn lx-btn-ghost lx-review-open" onClick={() => setOpen(true)}>
        <Star size={16} aria-hidden="true" /> Leave a review
      </button>
    );
  }

  const send = async () => {
    if (!rating) return setError("Pick a star rating.");
    if (!name.trim()) return setError("Add your name.");
    if (body.trim().length < 8) return setError("Write a few words about your experience.");
    setError("");
    setState("sending");
    try {
      await onSubmit({ name: name.trim(), rating, body: body.trim(), website });
      setState("sent");
    } catch (failure) {
      setState("idle");
      setError(failure instanceof Error && failure.message ? failure.message : "Could not send your review. Please try again.");
    }
  };

  return (
    <div className="lx-review-form">
      <strong>Leave a review</strong>
      <div className="lx-rate" role="radiogroup" aria-label="Your rating">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={rating === value}
            aria-label={`${value} star${value === 1 ? "" : "s"}`}
            className={value <= rating ? "is-on" : ""}
            onClick={() => { setRating(value); setError(""); }}
          >
            <Star size={26} aria-hidden="true" fill={value <= rating ? "currentColor" : "none"} />
          </button>
        ))}
      </div>
      <label>
        <span>Your name</span>
        <input value={name} maxLength={80} autoComplete="name" onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        <span>Your review</span>
        <textarea value={body} maxLength={1200} rows={4} onChange={(event) => setBody(event.target.value)} />
      </label>
      {/* Honeypot: people never see or fill this; bots do. */}
      <input className="lx-review-trap" tabIndex={-1} autoComplete="off" aria-hidden="true" value={website} onChange={(event) => setWebsite(event.target.value)} />
      {error ? <p className="lx-review-form-error" role="alert">{error}</p> : null}
      <div className="lx-review-form-actions">
        <button type="button" className="lx-btn lx-btn-primary" disabled={state === "sending"} onClick={() => void send()}>
          {state === "sending" ? "Sending…" : "Send review"}
        </button>
        <button type="button" className="lx-btn lx-btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      <small>Shown on this page after the owner approves it.</small>
    </div>
  );
}
