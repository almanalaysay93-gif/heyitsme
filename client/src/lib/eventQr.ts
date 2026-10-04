import QRCode from "qrcode";

export type EventQrLook = { dots: string; background: string; frame: string; rounded: boolean };

const escapeXml = (value: string) => value.replace(/[<>&"']/g, character => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character]!);
const isDark = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 < 150;
};

/**
 * The QR code in a frame: frame color, optional logo in the middle, and a line that says what to do.
 * Rounded dots leave the three corner squares as they are, since scanners find the code by them.
 */
export function eventQrSvg(url: string, look: EventQrLook, cta: string, logo: string | null) {
  const modules = QRCode.create(url, { errorCorrectionLevel: "H" }).modules;
  const count = modules.size;
  const cell = 10;
  const half = cell / 2;
  const quiet = 4 * cell;
  const pad = 28;
  const white = count * cell + quiet * 2;
  const width = white + pad * 2;
  const bar = cta ? 92 : 0;
  const height = width + bar;
  const origin = pad + quiet;
  const logoCells = logo ? Math.floor(count * 0.22) : 0;
  const logoStart = Math.floor((count - logoCells) / 2);
  const corner = (row: number, col: number) => (row < 7 && (col < 7 || col >= count - 7)) || (row >= count - 7 && col < 7);
  let path = "";
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (!modules.get(row, col)) continue;
      if (logoCells && row >= logoStart && row < logoStart + logoCells && col >= logoStart && col < logoStart + logoCells) continue;
      const x = origin + col * cell;
      const y = origin + row * cell;
      path += look.rounded && !corner(row, col)
        ? `M${x} ${y + half}a${half} ${half} 0 1 0 ${cell} 0a${half} ${half} 0 1 0 -${cell} 0z`
        : `M${x} ${y}h${cell}v${cell}h-${cell}z`;
    }
  }
  const logoAt = origin + logoStart * cell;
  const logoSize = logoCells * cell;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="QR code for the event page">`,
    `<rect width="${width}" height="${height}" rx="36" fill="${escapeXml(look.frame)}"/>`,
    `<rect x="${pad}" y="${pad}" width="${white}" height="${white}" rx="20" fill="${escapeXml(look.background)}"/>`,
    `<path d="${path}" fill="${escapeXml(look.dots)}"/>`,
    logo ? `<image href="${escapeXml(logo)}" x="${logoAt + cell / 2}" y="${logoAt + cell / 2}" width="${logoSize - cell}" height="${logoSize - cell}" preserveAspectRatio="xMidYMid meet"/>` : "",
    cta ? `<text x="${width / 2}" y="${width + bar / 2 - 4}" text-anchor="middle" dominant-baseline="middle" font-family="Arial,Helvetica,sans-serif" font-size="40" font-weight="700" fill="${isDark(look.frame) ? "#ffffff" : "#111827"}">${escapeXml(cta)}</text>` : "",
    "</svg>",
  ].join("");
}
