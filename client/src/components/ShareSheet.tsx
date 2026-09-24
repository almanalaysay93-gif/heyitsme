import { startGoogleLogin } from "@/const";
import { copyRichText, copyToClipboard, downloadBlob, safeFileName } from "@/lib/cardKit";
import { buildSignatureHtml, buildSignatureText } from "@/lib/emailSignature";
import type { CardDraft } from "@/lib/card";
import { motion } from "framer-motion";
import { Code2, Copy, Download, ExternalLink, Link2, Mail, MessageCircle, PenLine, QrCode, X } from "lucide-react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { toast } from "sonner";

type ShareTab = "qr" | "signature";

const tabs: { id: ShareTab; label: string; icon: typeof QrCode }[] = [
  { id: "qr", label: "QR & link", icon: QrCode },
  { id: "signature", label: "Email signature", icon: PenLine },
];

function absoluteImageUrl(value: string | null | undefined) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/") && !value.startsWith("//")) return `${window.location.origin}${value}`;
  return "";
}

export function ShareSheet({
  card,
  accent,
  onClose,
  onCopy,
  isAuthenticated,
  onPublish,
}: {
  card: CardDraft;
  /** Card theme color used for the signature accent. */
  accent: string;
  onClose: () => void;
  onCopy: () => void;
  isAuthenticated?: boolean;
  onPublish?: () => void;
}) {
  const url = `${window.location.origin}/c/${card.slug}`;
  const isReady = Boolean(isAuthenticated && card.id > 0 && card.published);
  const [tab, setTab] = useState<ShareTab>("qr");
  const tabRefs = useRef<Record<ShareTab, HTMLButtonElement | null>>({ qr: null, signature: null });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const fileBase = safeFileName(card.displayName, "heyitsme-card");

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const signatureInput = useMemo(() => ({
    displayName: card.displayName,
    title: card.title,
    company: card.company,
    email: card.email,
    phone: card.phone,
    avatarUrl: absoluteImageUrl(card.avatarUrl),
    cardUrl: url,
    accent,
  }), [accent, card.avatarUrl, card.company, card.displayName, card.email, card.phone, card.title, url]);
  const signatureHtml = useMemo(() => buildSignatureHtml(signatureInput), [signatureInput]);

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const index = tabs.findIndex((item) => item.id === tab);
    const nextIndex = event.key === "Home" ? 0
      : event.key === "End" ? tabs.length - 1
      : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    const next = tabs[nextIndex].id;
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  const downloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) {
        toast.error("Could not create the QR image.");
        return;
      }
      downloadBlob(blob, `${fileBase}-qr.png`);
      toast.success("QR code saved as PNG.");
    }, "image/png");
  };

  const downloadSvg = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const markup = new XMLSerializer().serializeToString(svg);
    downloadBlob(new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${markup}`], { type: "image/svg+xml" }), `${fileBase}-qr.svg`);
    toast.success("QR code saved as SVG.");
  };

  const copySignature = async () => {
    if (await copyRichText(signatureHtml, buildSignatureText(signatureInput))) toast.success("Signature copied. Paste it into your email signature settings.");
    else toast.error("Could not copy. Try Copy HTML instead.");
  };

  const copySignatureHtml = async () => {
    if (await copyToClipboard(signatureHtml)) toast.success("Signature HTML copied.");
    else toast.error("Could not copy the HTML.");
  };

  return (
    <motion.div className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-sheet-title"
        className="share-sheet glass-panel"
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 360, damping: 30 }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-header">
          <div>
            <span className="mini-label">Share your card</span>
            <h2 id="share-sheet-title">Make the handoff easy.</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close share options" autoFocus><X size={17} /></button>
        </div>
        {isReady ? (
          <>
            <div className="share-tabs" role="tablist" aria-label="Share options">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  ref={(node) => { tabRefs.current[item.id] = node; }}
                  type="button"
                  role="tab"
                  id={`share-tab-${item.id}`}
                  aria-selected={tab === item.id}
                  aria-controls={`share-panel-${item.id}`}
                  tabIndex={tab === item.id ? 0 : -1}
                  className={tab === item.id ? "is-active" : ""}
                  onClick={() => setTab(item.id)}
                  onKeyDown={onTabKey}
                >
                  <item.icon size={14} /> {item.label}
                </button>
              ))}
            </div>

            {tab === "qr" ? (
              <div role="tabpanel" id="share-panel-qr" aria-labelledby="share-tab-qr">
                <div className="qr-frame"><QRCodeSVG value={url} size={176} bgColor="transparent" fgColor="#10152a" includeMargin title={`QR code for ${url}`} /></div>
                <div className="qr-downloads">
                  <button type="button" className="outline-button" onClick={downloadPng}><Download size={14} /> PNG</button>
                  <button type="button" className="outline-button" onClick={downloadSvg}><Download size={14} /> SVG</button>
                </div>
                <div className="share-link"><Link2 size={15} /><span>{url.replace(window.location.origin, "")}</span><button type="button" onClick={onCopy} aria-label="Copy public link"><Copy size={15} /></button></div>
                <div className="share-actions">
                  <a href={`sms:?body=${encodeURIComponent(`Here’s my heyitsme card: ${url}`)}`}><MessageCircle size={16} /> Text it</a>
                  <a href={`mailto:?subject=${encodeURIComponent(`${card.displayName} shared a card`)}&body=${encodeURIComponent(url)}`}><Mail size={16} /> Email it</a>
                  <a href={url} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Open page</a>
                </div>
                <p className="sheet-footnote"><span className="status-dot is-live" /> Print the PNG on a badge, slide, or table tent. No app needed.</p>
                {/* Download sources: high-resolution, dark on white so prints and slides scan reliably. */}
                <div className="qr-export-source" aria-hidden="true">
                  <QRCodeCanvas ref={canvasRef} value={url} size={1024} marginSize={4} bgColor="#ffffff" fgColor="#10152a" level="M" />
                  <QRCodeSVG ref={svgRef} value={url} size={512} marginSize={4} bgColor="#ffffff" fgColor="#10152a" level="M" />
                </div>
              </div>
            ) : (
              <div role="tabpanel" id="share-panel-signature" aria-labelledby="share-tab-signature" className="signature-panel">
                <p className="signature-hint">Add your card to every email you send. Copy it, then paste into Gmail, Outlook, or Apple Mail signature settings.</p>
                <figure className="signature-preview">
                  <figcaption className="sr-only">Signature preview</figcaption>
                  {/* Built by buildSignatureHtml, which escapes every card value. */}
                  <div dangerouslySetInnerHTML={{ __html: signatureHtml }} />
                </figure>
                {!signatureInput.avatarUrl ? <p className="signature-note">Upload a profile photo to show it in your signature.</p> : null}
                <div className="signature-actions">
                  <button type="button" className="glass-button glass-button-primary" onClick={() => void copySignature()}><Copy size={15} /> Copy signature</button>
                  <button type="button" className="outline-button" onClick={() => void copySignatureHtml()}><Code2 size={15} /> Copy HTML</button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="share-sheet-unpublished">
            <p>
              {!isAuthenticated
                ? "Sign in to publish this card and create a shareable link."
                : card.id <= 0
                ? "Save this card first to generate a shareable link."
                : "This card is private. Publish it to get a link, QR code, and email signature."}
            </p>
            {!isAuthenticated ? (
              <button className="glass-button glass-button-primary" type="button" onClick={startGoogleLogin}>
                Sign in with Google
              </button>
            ) : null}
            {onPublish && isAuthenticated && card.id > 0 && !card.published ? (
              <button
                className="glass-button glass-button-primary"
                type="button"
                onClick={() => {
                  onPublish();
                  onClose();
                }}
              >
                Publish card
              </button>
            ) : null}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
