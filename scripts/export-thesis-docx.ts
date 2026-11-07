/**
 * Export doc/论文初稿.md → doc/论文初稿.docx
 * Usage: npm run export:thesis
 */
import fs from "node:fs";
import path from "node:path";
import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

const INPUT = path.resolve("doc/论文初稿.md");
const OUTPUT = path.resolve("doc/论文初稿.docx");

function parseTableRow(line: string): string[] {
  return line
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());
}

function isTableSeparator(line: string): boolean {
  return /^\|[\s\-:|]+\|$/.test(line.trim());
}

function headingLevel(line: string): (typeof HeadingLevel)[keyof typeof HeadingLevel] | null {
  if (line.startsWith("# ")) return HeadingLevel.TITLE;
  if (line.startsWith("## ")) return HeadingLevel.HEADING_1;
  if (line.startsWith("### ")) return HeadingLevel.HEADING_2;
  if (line.startsWith("#### ")) return HeadingLevel.HEADING_3;
  return null;
}

function stripHeading(line: string): string {
  return line.replace(/^#{1,6}\s*/, "").trim();
}

function paragraph(text: string, opts?: { bold?: boolean; size?: number; font?: string }) {
  return new Paragraph({
    spacing: { after: 120, line: 360 },
    children: [
      new TextRun({
        text,
        bold: opts?.bold,
        size: opts?.size ?? 24,
        font: opts?.font ?? "宋体",
      }),
    ],
  });
}

function codeBlock(lines: string[]): Paragraph[] {
  return lines.map(
    (line) =>
      new Paragraph({
        spacing: { after: 0, line: 276 },
        children: [
          new TextRun({
            text: line || " ",
            font: "Courier New",
            size: 20,
          }),
        ],
      }),
  );
}

async function main() {
  const md = fs.readFileSync(INPUT, "utf8");
  const lines = md.split(/\r?\n/);
  const children: (Paragraph | Table)[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";

    if (line.startsWith("```")) {
      i++;
      const code: string[] = [];
      while (i < lines.length && !lines[i]?.startsWith("```")) {
        code.push(lines[i] ?? "");
        i++;
      }
      children.push(...codeBlock(code));
      i++;
      continue;
    }

    if (line.startsWith("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1] ?? "")) {
      const headers = parseTableRow(line);
      i += 2;
      const rows: string[][] = [headers];
      while (i < lines.length && lines[i]?.startsWith("|")) {
        rows.push(parseTableRow(lines[i] ?? ""));
        i++;
      }
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: rows.map(
            (row, rowIdx) =>
              new TableRow({
                children: row.map(
                  (cell) =>
                    new TableCell({
                      children: [
                        paragraph(cell, { bold: rowIdx === 0, size: 21 }),
                      ],
                    }),
                ),
              }),
          ),
        }),
      );
      children.push(paragraph(""));
      continue;
    }

    const level = headingLevel(line);
    if (level) {
      const text = stripHeading(line);
      if (line.startsWith("# ") && !line.startsWith("## ")) {
        children.push(
          new Paragraph({
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { before: 240, after: 240 },
            children: [new TextRun({ text, bold: true, size: 32, font: "黑体" })],
          }),
        );
      } else {
        const size =
          level === HeadingLevel.HEADING_1 ? 30 :
          level === HeadingLevel.HEADING_2 ? 28 : 26;
        children.push(
          new Paragraph({
            heading: level,
            spacing: { before: 200, after: 120 },
            children: [new TextRun({ text, bold: true, size, font: "黑体" })],
          }),
        );
      }
      i++;
      continue;
    }

    if (line.trim() === "---") {
      i++;
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    if (line.startsWith(">")) {
      children.push(paragraph(line.replace(/^>\s*/, ""), { size: 21 }));
      i++;
      continue;
    }

    if (line.startsWith("**关键词：**") || line.startsWith("**Keywords:**")) {
      children.push(paragraph(line.replace(/\*\*/g, ""), { bold: true }));
      i++;
      continue;
    }

    children.push(paragraph(line.replace(/\*\*/g, "")));
    i++;
  }

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(OUTPUT, buffer);
  console.log(`Exported: ${OUTPUT}`);
  console.log(`Size: ${(buffer.length / 1024).toFixed(1)} KB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
