import { QRCodeSVG } from "qrcode.react";
import { qrSchema, type QrDesign } from "@shared/design";
import { lazy, Suspense, useRef, useState } from "react";
const RoundedQr = lazy(() => import("./RoundedQr"));
export function QrPreview({
  value,
  design,
  downloadable = false,
}: {
  value: string;
  design?: QrDesign;
  downloadable?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const [error, setError] = useState("");
  const download = async (format: "svg" | "png") => {
    try {
      const { downloadQr } = await import("@/lib/qrExport");
      await downloadQr(ref.current, "heyitsme", format);
      setError("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "QR export failed.");
    }
  };
  const q = design ?? qrSchema.parse({});
  return (
    <figure
      ref={ref}
      className={`branded-qr qr-frame-${q.frame}`}
      style={{
        background: q.background,
        color: q.foreground,
        padding: 16,
        border: q.frame === "none" ? undefined : `2px solid ${q.foreground}`,
        borderRadius: q.frame === "rounded" ? 20 : 0,
        display: "inline-block",
        maxWidth: "100%",
      }}
    >
      {q.rounded ? (
        <Suspense
          fallback={
            <QRCodeSVG
              value={value}
              size={180}
              level="H"
              marginSize={4}
              fgColor={q.foreground}
              bgColor={q.background}
            />
          }
        >
          <RoundedQr value={value} q={q} />
        </Suspense>
      ) : (
        <QRCodeSVG
          value={value}
          size={180}
          level="H"
          marginSize={4}
          fgColor={q.foreground}
          bgColor={q.background}
          imageSettings={
            q.logo
              ? {
                  src: q.logo,
                  width: 28,
                  height: 28,
                  excavate: true,
                  crossOrigin: "anonymous",
                }
              : undefined
          }
          role="img"
          aria-label={q.cta}
        />
      )}
      <figcaption style={{ textAlign: "center", fontSize: 14, paddingTop: 8 }}>
        {q.cta}
      </figcaption>
      {downloadable ? (
        <div>
          <button
            type="button"
            className="outline-button"
            onClick={() => void download("png")}
          >
            Download PNG
          </button>
          <button
            type="button"
            className="outline-button"
            onClick={() => void download("svg")}
          >
            Download SVG
          </button>
          {error ? <p role="alert">{error}</p> : null}
        </div>
      ) : null}
    </figure>
  );
}
