import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { copyToClipboard } from "@/lib/cardKit";
import { Check, Copy } from "lucide-react";
import { useState, type ReactNode } from "react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  /** Shown as selectable text with a copy button, e.g. an email address or a page link. */
  value?: string;
  copyLabel?: string;
  /** Confirmation shown only after the clipboard write succeeds. */
  copiedLabel?: string;
  /** Optional extra action, e.g. "Open email app" (a mailto link, same tab). */
  action?: { label: string; href: string };
};

/**
 * Small accessible dialog (focus trap, Escape, focus return via Radix) that works without any mail app or
 * clipboard permission: the value is always visible and selectable, and "Copied" appears only after a real copy.
 */
export function InfoDialog({ open, onOpenChange, title, description, value, copyLabel = "Copy", copiedLabel = "Copied.", action }: Props) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => setStatus((await copyToClipboard(value ?? "")) ? "copied" : "failed");
  return (
    <Dialog open={open} onOpenChange={(next) => { onOpenChange(next); if (!next) setStatus("idle"); }}>
      <DialogContent className="info-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {value ? (
          <input
            className="info-dialog-value"
            readOnly
            value={value}
            aria-label={title}
            onFocus={(event) => event.currentTarget.select()}
          />
        ) : null}
        <p className="info-dialog-status" role="status" aria-live="polite">
          {status === "copied" ? copiedLabel : status === "failed" ? "Couldn't copy automatically. Select the text above and copy it." : ""}
        </p>
        <DialogFooter className="info-dialog-actions">
          {action ? <a className="outline-button" href={action.href}>{action.label}</a> : null}
          {value ? (
            <button type="button" className="glass-button glass-button-primary" onClick={() => void copy()}>
              {status === "copied" ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />} {copyLabel}
            </button>
          ) : (
            <button type="button" className="glass-button glass-button-primary" onClick={() => onOpenChange(false)}>Got it</button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
