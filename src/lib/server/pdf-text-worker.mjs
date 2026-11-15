// Fixed application code. Uploaded bytes are data; no scripts, links or document actions are executed.
import { parentPort, workerData } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
const standardFontDataUrl = fileURLToPath(
  new URL("./standard_fonts/", import.meta.resolve("pdfjs-dist/package.json")),
);
const task = getDocument({
  standardFontDataUrl,
  data: new Uint8Array(workerData),
  useWasm: false,
  useSystemFonts: false,
  disableFontFace: true,
  stopAtErrors: true,
  maxImageSize: 1,
});
try {
  const pdf = await task.promise;
  if (pdf.numPages > 40) throw new Error("TOO_MANY_PAGES");
  if (
    (await pdf.hasJSActions()) ||
    Object.keys((await pdf.getAttachments()) || {}).length
  )
    throw new Error("ACTIVE_DOCUMENT");
  let text = "";
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    text +=
      content.items
        .map((x) => ("str" in x ? x.str + (x.hasEOL ? "\n" : " ") : ""))
        .join("") + "\n";
    page.cleanup();
    if (text.length > 40000) throw new Error("TOO_LONG");
  }
  parentPort.postMessage({ text });
} catch (e) {
  parentPort.postMessage({
    error: ["TOO_MANY_PAGES", "ACTIVE_DOCUMENT", "TOO_LONG"].includes(e.message)
      ? e.message
      : "UNREADABLE",
  });
} finally {
  await task.destroy();
  parentPort.close();
}
