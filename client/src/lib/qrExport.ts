import { downloadBlob } from "./cardKit";

const LOGO_ERROR = "Logo could not be exported. Upload it to heyitsme or use a URL that allows downloads.";

/** The logo as a data link, so the exported file carries it. */
async function inlineImage(href: string): Promise<string> {
  try {
    const response = await fetch(href);
    if (response.ok) {
      const blob = await response.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
  } catch {
    // An uploaded logo redirects to a signed storage link the page may not fetch. Loading it as an image can still work.
  }
  const image = new Image();
  image.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(LOGO_ERROR));
    image.src = href;
  });
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth || 256;
  canvas.height = image.naturalHeight || 256;
  const context = canvas.getContext("2d");
  if (!context) throw new Error(LOGO_ERROR);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  try {
    return canvas.toDataURL("image/png");
  } catch {
    throw new Error(LOGO_ERROR);
  }
}
export async function downloadQr(
  element: HTMLElement | null,
  name: string,
  format: "svg" | "png"
) {
  const source = element?.querySelector("svg");
  if (!source) throw new Error("QR preview is still loading. Try again.");
  const svg = source.cloneNode(true) as SVGSVGElement;
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("width", "1024");
  svg.setAttribute("height", "1024");
  for (const image of Array.from(svg.querySelectorAll("image"))) {
    const href = image.getAttribute("href") ?? image.getAttribute("xlink:href");
    if (!href) continue;
    image.setAttribute("href", await inlineImage(href));
    image.removeAttribute("xlink:href");
  }
  const figure = source.closest("figure");
  let output = svg;
  if (figure) {
    const ns = "http://www.w3.org/2000/svg";
    const wrapper = document.createElementNS(ns, "svg");
    wrapper.setAttribute("xmlns", ns);
    wrapper.setAttribute("viewBox", "0 0 600 680");
    wrapper.setAttribute("width", "1024");
    wrapper.setAttribute("height", "1160");
    const style = getComputedStyle(figure);
    const background = document.createElementNS(ns, "rect");
    background.setAttribute("width", "600");
    background.setAttribute("height", "680");
    background.setAttribute("fill", style.backgroundColor);
    wrapper.appendChild(background);
    if (figure.classList.contains("qr-frame-simple") || figure.classList.contains("qr-frame-rounded")) {
      const frame = document.createElementNS(ns, "rect");
      for (const [key,value] of Object.entries({x:"8",y:"8",width:"584",height:"664",rx:figure.classList.contains("qr-frame-rounded")?"24":"0",fill:"none",stroke:style.color,"stroke-width":"3"})) frame.setAttribute(key,value);
      wrapper.appendChild(frame);
    }
    svg.setAttribute("x", "32");
    svg.setAttribute("y", "32");
    svg.setAttribute("width", "536");
    svg.setAttribute("height", "536");
    wrapper.appendChild(svg);
    const caption = document.createElementNS(ns, "text");
    caption.setAttribute("x", "300");
    caption.setAttribute("y", "618");
    caption.setAttribute("text-anchor", "middle");
    caption.setAttribute("font-size", "22");
    caption.setAttribute("font-family", "Arial, sans-serif");
    caption.setAttribute("fill", style.color);
    caption.textContent = figure.querySelector("figcaption")?.textContent ?? "Scan my card";
    wrapper.appendChild(caption);
    output = wrapper;
  }
  const blob = new Blob([new XMLSerializer().serializeToString(output)], {
    type: "image/svg+xml;charset=utf-8",
  });
  if (format === "svg") {
    downloadBlob(blob, `${name}-qr.svg`);
    return;
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error("QR image could not be exported."));
      image.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = figure ? 1160 : 1024;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image export is unavailable.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        blob =>
          blob ? resolve(blob) : reject(new Error("Image export failed.")),
        "image/png"
      )
    );
    downloadBlob(png, `${name}-qr.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}
