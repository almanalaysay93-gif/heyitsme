/** What a visitor sees in place of a card, event page or review page that is on hold. Nothing of the page is shown. */
export function PausedPage({ what }: { what: "card" | "event page" | "review page" }) {
  return (
    <main className="public-loading" id="main" tabIndex={-1}>
      <div className="not-found-mark" aria-hidden="true">Ⅱ</div>
      <h1>This {what} is paused.</h1>
      <p>Its owner can bring it back. Please check with them, or try again later.</p>
      <a href="/app">I own this {what}</a>
      <a href="/">Visit heyitsme</a>
    </main>
  );
}
