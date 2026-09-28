import { ContactLine, LegalShell } from "@/pages/Legal";
import { usePageMeta } from "@/hooks/usePageMeta";
import { Link } from "wouter";

export function AboutPage() {
  usePageMeta({
    title: "About — heyitsme",
    description: "Learn about heyitsme: a fast, privacy-first digital business card that makes introductions simple. Start free, no app needed.",
    canonicalPath: "/about",
  });

  return (
    <LegalShell
      title="About heyitsme"
      intro="heyitsme is a digital business card for introductions that feel human, fast, and memorable. You can start free."
      updated={null}
    >
      <h2>The idea</h2>
      <p>
        Paper business cards get lost, bent, or left behind. Most digital card apps force recipients to install an app
        or register for an account just to view a phone number. Standard link-in-bio tools look like cluttered billboards
        rather than thoughtful introductions.
      </p>
      <p>
        heyitsme gives you a single, elegant introduction page with your essential contact details, key links, visual portfolio,
        and client quotes. Anyone with a smartphone can open it in their browser, save your contact details in one tap,
        or send their own details back to you.
      </p>

      <h2>Our principles</h2>
      <h3>Zero friction for recipients</h3>
      <p>
        The person viewing your card never needs to download an app, create an account, or log in. It works instantly on any
        modern browser across iOS, Android, macOS, Windows, and Linux.
      </p>

      <h3>Start free, pay when it pays</h3>
      <p>
        Your profile, QR code, and card link are free and never expire. Pro adds more cards, unlimited lead capture, and a
        year of insights for people whose networking brings in work. See <Link href="/pricing">pricing</Link> for details.
      </p>

      <h3>Privacy by default</h3>
      <p>
        We do not use advertising cookies, third-party analytics pixels, or fingerprinting scripts. Your visitor analytics
        track aggregate actions (page views, contact-save taps, and link taps), never visitor identities.
      </p>

      <h2>Contact and support</h2>
      <p>
        heyitsme is maintained as an open, accessible digital card service. For technical assistance, bug reports, or general inquiries,
        reach out to <ContactLine />.
      </p>
    </LegalShell>
  );
}

export function FaqPage() {
  usePageMeta({
    title: "Frequently Asked Questions — heyitsme",
    description: "Answers about heyitsme: compatibility, contact exchange, privacy, plans, billing, lead limits and cancellation.",
    canonicalPath: "/faq",
  });

  return (
    <LegalShell
      title="Frequently Asked Questions"
      intro="Everything you need to know about using heyitsme, sharing your card, and managing your contacts."
      updated={null}
    >
      <h2>Sharing and compatibility</h2>
      <h3>Does the recipient need to download an app or create an account?</h3>
      <p>
        No. When someone taps your link or scans your QR code, your card opens directly in their browser. They do not need to install
        an app, create an account, or sign in to view your details or save your contact.
      </p>

      <h3>How does saving a contact work on iPhone and Android?</h3>
      <p>
        When a visitor taps <em>Save contact</em>, the server serves a standard vCard (.vcf) file. On iPhones running Safari, iOS automatically
        opens the native &ldquo;Add to Contacts&rdquo; sheet. On Android devices running Chrome or other browsers, the contact file downloads
        and can be added to Google Contacts or the device address book in one tap.
      </p>

      <h3>How do I share my card in person or online?</h3>
      <p>
        You can present your QR code for immediate in-person scanning, copy your card&rsquo;s public link, or use the built-in SMS and email
        helpers to send a pre-formatted message. You can also generate an email signature that links to your card.
      </p>

      <h2>Card builder &amp; limits</h2>
      <h3>What is the difference between preview mode and publishing?</h3>
      <p>
        You can build and preview a card immediately without signing in; guest drafts remain stored only in your local browser storage.
        Signing in with Google allows you to publish your card to a public URL (<code>/c/your-name</code>), upload persistent media files,
        collect exchanged contacts, and access Insights.
      </p>

      <h3>What are the technical limits?</h3>
      <ul>
        <li><strong>File uploads:</strong> Up to 3 MB per file for authenticated accounts (1 MB in local guest preview mode). Supports JPG, PNG, WebP, GIF, MP4, WebM, MOV, PDF, Word, and ZIP files.</li>
        <li><strong>Portfolio items:</strong> Up to 20 items per card, with a total serialized portfolio payload limit of 12,000 characters.</li>
        <li><strong>Contact tags:</strong> Up to 12 custom tags per exchanged contact.</li>
        <li><strong>Cards per account:</strong> 1 on Free, 3 on Pro. Cards you made before a plan limit applied stay live.</li>
      </ul>

      <h2>Contact exchange &amp; privacy</h2>
      <h3>How does contact exchange work?</h3>
      <p>
        Visitors can tap <em>Exchange details</em> on your public card to fill out a concise form with their name, email, phone number,
        title, company, and an optional note. Their submission lands directly in your private Contacts tab in the workspace, and you receive
        an email notification.
      </p>

      <h3>What does Insights show, and does it identify visitors?</h3>
      <p>
        Insights reports aggregate counts: total page views, contact-save (.vcf) actions, detail exchanges, and link taps.
        Free shows the last 7 days. Pro shows 7, 30, 90, or 365 days. We do not track individual visitor identities or use advertising trackers. The only personal information
        collected from visitors is what they voluntarily submit through the contact exchange form.
      </p>

      <h3>Can I unpublish or delete my card?</h3>
      <p>
        Yes. You can unpublish a card at any time from your cards overview, making it immediately inaccessible to the public. If you delete
        a card, its public link, references, and visit stats are permanently removed. Contacts you collected through the card remain saved
        in your Contacts tab.
      </p>

      <h3>Can I export my contacts?</h3>
      <p>
        Yes. In your Contacts tab, tap <em>Export CSV</em> to download a complete, standard spreadsheet containing all names, emails, phone numbers,
        companies, titles, tags, and notes you have received.
      </p>

      <h3>Can I back up my cards?</h3>
      <p>
        Yes. Open the account menu and choose <em>Download my card data</em>. You get a JSON file with every card&rsquo;s text,
        links, portfolio entries, and references. Photos and uploaded files are listed as links, not copied into the file, so
        save any originals you want to keep.
      </p>

      <h2>Plans and billing</h2>
      <h3>What is free, and what is Pro?</h3>
      <p>
        Free gives you one card with your own link, QR code, save-to-contacts, and up to 10 new leads a month, with 7 days of insights.
        Pro is &#8369;149 a month or &#8369;1,290 a year and adds up to 3 cards, unlimited lead capture, 365 days of insights, and the option
        to hide heyitsme branding on your page. See <Link href="/pricing">pricing</Link>.
      </p>

      <h3>What happens when I reach 10 leads on Free?</h3>
      <p>
        Lead capture pauses until the next month starts (midnight, Philippine time, on the 1st). Your page stops showing the
        <em> Exchange details</em> form, so visitors are never asked for details you can&rsquo;t receive. They can still save your contact
        and reach you through your links. Everyone you already met stays in your Contacts.
      </p>

      <h3>How do I pay?</h3>
      <p>
        Checkout runs on the secure 2C2P payment page, where you pay with Google Pay (and GCash where available). heyitsme never sees or
        stores your card details. Pro starts only after the payment is confirmed to us by 2C2P, usually within a minute.
      </p>

      <h3>Can I cancel?</h3>
      <p>
        Yes, from <em>Billing</em> in your workspace. Pro stays on until the end of the period you paid for, then your account moves to Free.
        Nothing is deleted: cards, contacts, and insights data stay. Cards above the Free limit stay live and editable; you just can&rsquo;t
        create new ones until you&rsquo;re under the limit or back on Pro.
      </p>

      <h3>What is the Founding Member price?</h3>
      <p>
        The first 500 Pro members pay &#8369;99 a month or &#8369;999 a year. The price holds while the plan stays active. If a founding
        plan ends and you start again later, the standard price applies.
      </p>

      <h3>Can I get a refund?</h3>
      <p>
        The refund policy is being finalized and will be published here before paid plans open. <strong>[Owner: set the refund policy
        before enabling production checkout.]</strong>
      </p>

      <h3>Does my card work with NFC?</h3>
      <p>
        Yes. Your card link works on any NFC tag or card that can hold a web address, and it keeps working on every plan.
        heyitsme does not sell NFC cards yet.
      </p>

      <h2>Support</h2>
      <p>
        Have questions that aren&rsquo;t covered here? Send an email to <ContactLine /> and we&rsquo;ll be glad to help.
      </p>
    </LegalShell>
  );
}
