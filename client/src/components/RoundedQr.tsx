import QRCode from "qrcode";
import { useMemo } from "react";
import type { QrDesign } from "@shared/design";
export default function RoundedQr({
  value,
  q,
}: {
  value: string;
  q: QrDesign;
}) {
  const modules = useMemo(
    () => QRCode.create(value, { errorCorrectionLevel: "H" }).modules,
    [value]
  );
  const n = modules.size;
  const logoSize = q.logo ? Math.floor(n * 0.16) : 0;
  const logoStart = Math.floor((n - logoSize) / 2);
  const cells = [];
  for (let row = 0; row < n; row++)
    for (let col = 0; col < n; col++) {
      if (!modules.get(row, col)) continue;
      if (
        logoSize &&
        row >= logoStart &&
        row < logoStart + logoSize &&
        col >= logoStart &&
        col < logoStart + logoSize
      )
        continue;
      const finder =
        (row < 8 && col < 8) ||
        (row < 8 && col >= n - 8) ||
        (row >= n - 8 && col < 8);
      cells.push(
        <rect
          key={`${row}-${col}`}
          x={col + 4}
          y={row + 4}
          width={1}
          height={1}
          rx={finder ? 0 : 0.16}
        />
      );
    }
  return (
    <svg
      width={180}
      height={180}
      viewBox={`0 0 ${n + 8} ${n + 8}`}
      role="img"
      aria-label={q.cta}
    >
      <rect width={n + 8} height={n + 8} fill={q.background} />
      <g fill={q.foreground}>{cells}</g>
      {q.logo ? (
        <image
          href={q.logo}
          x={logoStart + 4}
          y={logoStart + 4}
          width={logoSize}
          height={logoSize}
        />
      ) : null}
    </svg>
  );
}
