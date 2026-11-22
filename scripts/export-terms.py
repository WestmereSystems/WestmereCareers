"""Export the canonical website Terms as an editable, numbered legal document."""

import json
import re
from pathlib import Path

from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor
from docx.opc.constants import RELATIONSHIP_TYPE as RT

ROOT = Path(__file__).resolve().parents[1]
TERMS = json.loads((ROOT / "src/content/terms-and-conditions.json").read_text())
OUTPUT = ROOT / "deliverables/Westmere-Careers-Terms-and-Conditions.docx"
TEXT_OUTPUT = OUTPUT.with_suffix(".txt")
ORIGIN = "https://westmere.com.au"


def bookmark(paragraph, name, number):
    start = OxmlElement("w:bookmarkStart")
    start.set(qn("w:id"), str(number))
    start.set(qn("w:name"), name)
    end = OxmlElement("w:bookmarkEnd")
    end.set(qn("w:id"), str(number))
    paragraph._p.insert(0, start)
    paragraph._p.append(end)


def hyperlink(paragraph, label, target=None, anchor=None):
    link = OxmlElement("w:hyperlink")
    if anchor:
        link.set(qn("w:anchor"), anchor)
    else:
        rel = paragraph.part.relate_to(target, RT.HYPERLINK, is_external=True)
        link.set(qn("r:id"), rel)
    run = OxmlElement("w:r")
    props = OxmlElement("w:rPr")
    color = OxmlElement("w:color")
    color.set(qn("w:val"), "000000")
    props.append(color)
    underline = OxmlElement("w:u")
    underline.set(qn("w:val"), "single")
    props.append(underline)
    run.append(props)
    text = OxmlElement("w:t")
    text.text = label
    run.append(text)
    link.append(run)
    paragraph._p.append(link)


def linked_text(paragraph, text):
    for part in re.split(r"(\[[^\]]+\]\([^)]+\))", text):
        match = re.fullmatch(r"\[([^\]]+)\]\(([^)]+)\)", part)
        if match:
            url = match[2]
            hyperlink(paragraph, match[1], ORIGIN + url if url.startswith("/") else url)
        else:
            paragraph.add_run(part)


def plain(text):
    return re.sub(
        r"\[([^\]]+)\]\(([^)]+)\)",
        lambda match: f"{match[1]} ({ORIGIN + match[2] if match[2].startswith('/') else match[2]})",
        text,
    )


doc = Document()
section = doc.sections[0]
section.page_width, section.page_height = Cm(21), Cm(29.7)
section.top_margin, section.bottom_margin = Cm(2.1), Cm(2.0)
section.left_margin, section.right_margin = Cm(2.2), Cm(2.2)
section.header_distance, section.footer_distance = Cm(0.9), Cm(0.9)
normal = doc.styles["Normal"]
normal.font.name = "Arial"
normal.font.size = Pt(10.5)
normal.font.color.rgb = RGBColor(0, 0, 0)
normal.paragraph_format.line_spacing = 1.14
normal.paragraph_format.space_after = Pt(7)
normal.paragraph_format.widow_control = True
for style_name, size in (("Title", 23), ("Subtitle", 11), ("Heading 1", 14), ("Heading 2", 12)):
    style = doc.styles[style_name]
    style.font.name = "Arial"
    style.font.size = Pt(size)
    style.font.color.rgb = RGBColor(0, 0, 0)
    for border in list(style.element.iter(qn("w:pBdr"))):
        border.getparent().remove(border)
    style.paragraph_format.space_before = Pt(14 if style_name != "Title" else 0)
    style.paragraph_format.space_after = Pt(8)
    style.paragraph_format.keep_with_next = True
doc.styles["Subtitle"].font.italic = False

header = section.header.paragraphs[0]
header.add_run("Westmere Careers Terms and Conditions").font.size = Pt(8)
footer = section.footer.paragraphs[0]
footer.add_run(f"Version {TERMS['version']}  |  ").font.size = Pt(8)
field = OxmlElement("w:fldSimple")
field.set(qn("w:instr"), "PAGE")
footer._p.append(field)
footer.add_run(" of ").font.size = Pt(8)
pages = OxmlElement("w:fldSimple")
pages.set(qn("w:instr"), "NUMPAGES")
footer._p.append(pages)

doc.add_paragraph(TERMS["title"], "Title")
doc.add_paragraph(f"Last updated {TERMS['updated']}   |   Version {TERMS['version']}", "Subtitle")
doc.add_paragraph(TERMS["introduction"])
doc.add_paragraph("Key points", "Heading 1")
for point in TERMS["highlights"]:
    p = doc.add_paragraph(style="List Bullet")
    p.paragraph_format.space_after = Pt(7)
    p.add_run(point)
doc.add_paragraph("These points help you find the main provisions. Read the relevant numbered sections for the full agreement.")
doc.add_page_break()
doc.add_paragraph("Contents", "Heading 1")
for i, item in enumerate(TERMS["sections"], 1):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(3)
    p.paragraph_format.line_spacing = 1.05
    hyperlink(p, f"{i} {item['title']}", anchor=f"terms_{i}")
doc.add_page_break()

lines = [TERMS["title"], f"Last updated {TERMS['updated']} | Version {TERMS['version']}", "", TERMS["introduction"], "", "Key points"]
lines.extend(f"- {point}" for point in TERMS["highlights"])
for i, item in enumerate(TERMS["sections"], 1):
    heading = doc.add_paragraph(f"{i} {item['title']}", "Heading 1")
    bookmark(heading, f"terms_{i}", i)
    lines.extend(["", f"{i} {item['title']}", ""])
    for j, clause in enumerate(item["clauses"], 1):
        p = doc.add_paragraph()
        p.add_run(f"{i}.{j} ").bold = True
        linked_text(p, clause)
        lines.extend([f"{i}.{j} {plain(clause)}", ""])

doc.core_properties.title = TERMS["title"]
doc.core_properties.subject = "Website candidate employer agency and Careers plus service terms"
doc.core_properties.author = "Westmere Systems"
doc.core_properties.keywords = f"Westmere Careers terms version {TERMS['version']}"
doc.core_properties.comments = ""
doc.core_properties.language = "en-AU"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
doc.save(OUTPUT)
TEXT_OUTPUT.write_text("\n".join(lines), encoding="utf-8")
print(json.dumps({"document": str(OUTPUT), "text": str(TEXT_OUTPUT), "sections": len(TERMS["sections"]), "clauses": sum(len(x["clauses"]) for x in TERMS["sections"])}))
