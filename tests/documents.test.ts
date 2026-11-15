import { describe, it, expect } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { readDocument } from "../src/lib/server/documents";
const make = (entries: Record<string, Uint8Array>) =>
  new File([zipSync(entries)], "CV.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
const doc =
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Alex Candidate &amp; team</w:t></w:r></w:p><w:p><w:r><w:t>Project coordination, customer service and administration experience in Australia.</w:t></w:r></w:p></w:body></w:document>';
describe("private document extraction", () => {
  it("extracts Word paragraphs and entities as plain text", async () => {
    const r = await readDocument(
      make({
        "word/document.xml": strToU8(doc),
        "[Content_Types].xml": strToU8("<Types/>"),
      }),
    );
    expect(r.text).toContain("Alex Candidate & team\n");
    expect(r.text).toContain("Project coordination");
  });
  it("rejects macro payloads and embedded documents", async () => {
    await expect(
      readDocument(
        make({
          "word/document.xml": strToU8(doc),
          "[Content_Types].xml": strToU8("<Types/>"),
          "word/vbaProject.bin": new Uint8Array([1]),
        }),
      ),
    ).rejects.toThrow(/macros/);
  });
  it("rejects mismatched formats and unsafe XML entities", async () => {
    await expect(
      readDocument(new File(["<script>private</script>"], "CV.pdf")),
    ).rejects.toThrow(/PDF or Word/);
    await expect(
      readDocument(
        make({
          "word/document.xml": strToU8(
            '<!DOCTYPE test [<!ENTITY leak SYSTEM "file:///etc/passwd">]>' +
              doc,
          ),
          "[Content_Types].xml": strToU8("<Types/>"),
        }),
      ),
    ).rejects.toThrow(/XML/);
  });
  it("rejects archive expansion bombs before decompression", async () => {
    await expect(
      readDocument(
        make({
          "word/document.xml": new Uint8Array(5 * 1024 * 1024),
          "[Content_Types].xml": strToU8("<Types/>"),
        }),
      ),
    ).rejects.toThrow(/expands/);
  });
});

it("reads a real text PDF with the isolated data parser", async () => {
  const content =
    "BT /F1 12 Tf 72 720 Td (Alex Candidate has customer support and project administration experience.) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.7\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const start = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((x) => String(x).padStart(10, "0") + " 00000 n ")
    .join(
      "\n",
    )}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  const r = await readDocument(
    new File([pdf], "CV.pdf", { type: "application/pdf" }),
  );
  expect(r.text).toContain("Alex Candidate");
  expect(r.mediaType).toBe("application/pdf");
});
