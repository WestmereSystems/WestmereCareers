import "server-only";
import { Worker } from "node:worker_threads";
import path from "node:path";
import { unzipSync, strFromU8 } from "fflate";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { ApiError } from "./http";

export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
const fail = (message: string): never => {
  throw new ApiError(400, message, "INVALID_DOCUMENT");
};
export async function uploadForm(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data;"))
    throw new ApiError(415, "Choose a file to upload.");
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (!reader) return fail("Choose a file to upload.");
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    size += part.value.byteLength;
    if (size > MAX_DOCUMENT_BYTES + 64 * 1024) {
      await reader.cancel();
      throw new ApiError(413, "Choose a file smaller than 4 MB.");
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of chunks) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  try {
    return await new Response(bytes, {
      headers: { "content-type": request.headers.get("content-type")! },
    }).formData();
  } catch {
    throw new ApiError(
      400,
      "This upload could not be read. Choose the file again.",
    );
  }
}
export function safeFilename(name: string) {
  return (
    name.replace(/[\u0000-\u001f\u007f/\\]/g, "_").slice(0, 180) || "document"
  );
}
export async function readDocument(file: File, requireText = true) {
  if (!file.size || file.size > MAX_DOCUMENT_BYTES)
    throw new ApiError(
      413,
      "Choose a PDF or Word (.docx) document smaller than 4 MB.",
    );
  const data = new Uint8Array(await file.arrayBuffer());
  let text = "",
    mediaType = "";
  if (
    /\.pdf$/i.test(file.name) &&
    new TextDecoder().decode(data.subarray(0, 5)) === "%PDF-"
  ) {
    mediaType = "application/pdf";
    // Isolate PDF decompression and text parsing from the request event loop.
    // Terminate expensive documents; never evaluate document actions or render their contents.
    text = await new Promise<string>((resolve, reject) => {
      const worker = new Worker(
        path.join(process.cwd(), "src/lib/server/pdf-text-worker.mjs"),
        {
          workerData: data,
          resourceLimits: { maxOldGenerationSizeMb: 128, stackSizeMb: 4 },
        },
      );
      let finished = false;
      const finish = (error?: string, result?: string) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        void worker.terminate();
        if (error) {
          const messages: Record<string, string> = {
            TOO_MANY_PAGES: "Please use a document with no more than 40 pages.",
            ACTIVE_DOCUMENT:
              "Remove scripts or embedded attachments before uploading this PDF.",
            TOO_LONG: "Please use no more than 40,000 characters.",
            TIMEOUT:
              "This PDF took too long to read. Save a simpler text-based PDF or use Word (.docx).",
          };
          reject(
            new ApiError(
              400,
              messages[error] ||
                "We couldn’t read this PDF. Use an unlocked, text-based PDF or Word (.docx).",
              "INVALID_DOCUMENT",
            ),
          );
        } else resolve(result || "");
      };
      const timer = setTimeout(() => finish("TIMEOUT"), 15000);
      worker.once("message", (message) => finish(message.error, message.text));
      worker.once("error", () => finish("UNREADABLE"));
      worker.once("exit", () => {
        if (!finished) finish("UNREADABLE");
      });
    });
  } else if (
    /\.docx$/i.test(file.name) &&
    data[0] === 0x50 &&
    data[1] === 0x4b
  ) {
    mediaType =
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    try {
      let total = 0,
        count = 0;
      const entries = unzipSync(data, {
        filter: (e) => {
          count++;
          total += e.originalSize;
          if (
            count > 1000 ||
            total > 12 * 1024 * 1024 ||
            e.originalSize > 4 * 1024 * 1024
          )
            return fail(
              "This Word document expands beyond the supported size.",
            );
          if (/vbaproject|embeddings\//i.test(e.name))
            return fail("Remove macros and embedded files before uploading.");
          return (
            e.name === "word/document.xml" ||
            e.name.endsWith(".rels") ||
            e.name === "[Content_Types].xml"
          );
        },
      });
      if (!entries["word/document.xml"] || !entries["[Content_Types].xml"])
        return fail("Choose a valid Word (.docx) document.");
      for (const [path, bytes] of Object.entries(entries)) {
        const xml = strFromU8(bytes);
        if (/<!DOCTYPE|<!ENTITY/i.test(xml))
          return fail("This document contains unsupported XML.");
        if (
          path.endsWith(".rels") &&
          /TargetMode\s*=\s*["']External["']/i.test(xml)
        ) {
          /* External relationships are never resolved; plain text is extracted only. */
        }
      }
      const xml = strFromU8(entries["word/document.xml"]);
      if (XMLValidator.validate(xml) !== true)
        return fail("This Word document is damaged.");
      const parsed = new XMLParser({
        preserveOrder: true,
        ignoreAttributes: false,
        processEntities: true,
        htmlEntities: false,
        parseTagValue: false,
      }).parse(xml);
      function collect(nodes: unknown): string {
        if (!Array.isArray(nodes)) return "";
        let out = "";
        for (const node of nodes) {
          if (!node || typeof node !== "object") continue;
          for (const [key, value] of Object.entries(node)) {
            if (key === "#text") out += String(value);
            else if (key !== ":@") {
              out += collect(value);
              if (key === "w:p" || key === "w:br") out += "\n";
              if (key === "w:tab") out += " ";
            }
          }
        }
        return out;
      }
      text = collect(parsed);
    } catch (e) {
      if (e instanceof ApiError) throw e;
      return fail(
        "We couldn’t read this Word document. Save it as .docx and try again.",
      );
    }
  } else
    return fail(
      "Use a PDF or Word (.docx) file. Older .doc files must first be saved as .docx.",
    );
  text = text.replace(/\u0000/g, "").trim();
  if (text.length > 40000)
    return fail("Please use no more than 40,000 characters.");
  if (requireText && text.length < 50)
    return fail(
      "We couldn’t find enough CV text. Scanned PDFs need text recognition before upload.",
    );
  return {
    text,
    mediaType,
    filename: safeFilename(file.name),
    bytes: file.size,
  };
}
