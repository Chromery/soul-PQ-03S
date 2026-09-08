import { PDFArray, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import type { Browser } from "playwright-core";
import { readFile } from "node:fs/promises";

export const V3_COVER_LAYOUT = { left: 48.189, baseline: 367.2545, fontSize: 19 } as const;
const FONT_URL = new URL("../../../../node_modules/@fontsource-variable/raleway/files/raleway-latin-wght-normal.woff2", import.meta.url);
// This is the editable company-name text object in the supplied InDesign PDF.
// Match its position AND original glyph sequence. Fail closed if the template changes.
const COMPANY_TEXT_OBJECT = /BT\s+0 0 0 0 k\s+19 0 0 19 48\.189 367\.2545 Tm\s+\[\(R\)7 \(ivier\)8 \(a Re\)5 \(tail\)24\.1 \( P\)10 \(ark Srl\)\]TJ\s+ET/g;

export async function personalizeV3Cover(template: PDFDocument, browser: Browser, company: string) {
  const text = company.replace(/\s+/gu, " ").trim();
  if (!text) throw new Error("Nome cliente mancante nella copertina PDF v3");
  const cover = template.getPage(0);
  const { width, height } = cover.getSize();
  const contents = cover.node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray() : [contents];
  let replacements = 0;
  const cleaned = streams.map(ref => {
    const stream = template.context.lookup(ref);
    if (!(stream instanceof PDFRawStream)) throw new Error("Stream della copertina v3 non supportato");
    const source = Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1");
    return source.replace(COMPANY_TEXT_OBJECT, () => { replacements++; return ""; });
  });
  if (replacements !== 1) throw new Error("Il campo azienda del template PDF v3 non corrisponde al layout previsto");

  const font = (await readFile(FONT_URL)).toString("base64");
  const page = await browser.newPage();
  try {
    await page.setContent(`<!doctype html><html><head><style>
      @font-face { font-family: CoverRaleway; src: url(data:font/woff2;base64,${font}) format('woff2'); font-weight: 100 900; }
      @page { size: ${width}pt ${height}pt; margin: 0; }
      html, body { margin: 0; padding: 0; background: transparent; }
      svg { display: block; width: ${width}pt; height: ${height}pt; }
      text { font-family: CoverRaleway; font-weight: 700; fill: white; white-space: pre; }
    </style></head><body><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
      <text id="company" x="${V3_COVER_LAYOUT.left}" y="${height - V3_COVER_LAYOUT.baseline}" font-size="${V3_COVER_LAYOUT.fontSize}"></text>
    </svg></body></html>`);
    const layout = await page.evaluate(async ({ text, maxWidth, baseSize }) => {
      // Minimal browser-only types; the backend intentionally does not include lib.dom.
      const doc = (globalThis as unknown as { document: {
        fonts: { load(font: string): Promise<unknown>; ready: Promise<unknown> };
        getElementById(id: string): {
          textContent: string;
          getComputedTextLength(): number;
          setAttribute(name: string, value: string): void;
        };
      } }).document;
      await doc.fonts.load(`700 ${baseSize}px CoverRaleway`);
      await doc.fonts.ready;
      const label = doc.getElementById("company");
      label.textContent = text; // Never interpret company names as HTML/SVG.
      const naturalWidth = label.getComputedTextLength();
      if (!(naturalWidth > 0)) throw new Error("Impossibile misurare il nome cliente in copertina");
      let fontSize = Math.min(baseSize, baseSize * maxWidth / naturalWidth);
      label.setAttribute("font-size", String(fontSize));
      // Leave a small tolerance for PDF font metric rounding at the right margin.
      if (label.getComputedTextLength() > maxWidth) {
        fontSize *= (maxWidth - 0.5) / label.getComputedTextLength();
        label.setAttribute("font-size", String(fontSize));
      }
      return { text, fontSize, width: label.getComputedTextLength(), maxWidth };
    }, { text, maxWidth: width - 2 * V3_COVER_LAYOUT.left, baseSize: V3_COVER_LAYOUT.fontSize });
    const overlayBytes = await page.pdf({ printBackground: true, preferCSSPageSize: true });
    const overlay = await PDFDocument.load(overlayBytes);
    if (overlay.getPageCount() !== 1) throw new Error("La copertina dinamica deve occupare una sola pagina");
    const [embedded] = await template.embedPdf(overlayBytes, [0]);
    cover.node.set(PDFName.of("Contents"), template.context.obj(cleaned.map(source => (
      template.context.register(template.context.flateStream(Buffer.from(source, "latin1")))
    ))));
    // Chromium rounds paper dimensions: align the overlay at the top-left without scaling.
    cover.drawPage(embedded, { x: 0, y: height - embedded.height });
    return layout;
  } finally {
    await page.close();
  }
}
