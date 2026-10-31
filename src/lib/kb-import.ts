import { GoogleGenerativeAI } from "@google/generative-ai";
import * as XLSX from "xlsx";
import mammoth from "mammoth";

// Converts an uploaded document into Markdown for the Knowledge Base.
// Used by /api/v2/organizer/knowledge-base/import.

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

const PROMPT = `Convert this document into clean Markdown for a knowledge base that a chatbot
answers from (Malaysia Techlympics: events, competitions, logistics such as accommodation,
transport, venues, schedules, contacts).

Rules:
- Keep EVERY fact: names, dates, times, venues, addresses, prices, phone numbers, emails, URLs.
  Never summarise, shorten, translate or invent anything. Keep the original language.
- Start with one "# " heading that names the document. Use "##"/"###" for its sections.
- Tables become Markdown tables. Lists become bullet lists.
- For images or scanned pages, transcribe all readable text. Describe a map or diagram
  in one line only if it carries information (e.g. "Peta: dewan B di sebelah kiri pintu utama").
- Leave out page numbers, repeated headers/footers and decoration.
- Output only the Markdown, no code fences and no commentary.`;

export type Kind = "pdf" | "image" | "word" | "sheet" | "text";

const IMAGE_TYPES: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  heic: "image/heic", heif: "image/heif",
};

export function kindOf(name: string): { kind: Kind; mime?: string } | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  if (ext === "pdf") return { kind: "pdf", mime: "application/pdf" };
  if (IMAGE_TYPES[ext]) return { kind: "image", mime: IMAGE_TYPES[ext] };
  if (ext === "docx") return { kind: "word" };
  if (["xlsx", "xls", "ods", "csv"].includes(ext)) return { kind: "sheet" };
  if (["md", "markdown", "txt"].includes(ext)) return { kind: "text" };
  return null;
}

export function baseName(name: string) {
  return name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();
}

export function slug(s: string) {
  return s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "dokumen";
}

function stripFences(md: string) {
  return md.trim().replace(/^```(?:markdown|md)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

function cell(v: unknown) {
  return String(v ?? "").replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim();
}

function sheetToMarkdown(buf: Buffer, title: string) {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const parts = [`# ${title}`];
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils
      .sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: false, blankrows: false, defval: "" })
      .filter((r) => r.some((c) => cell(c) !== ""));
    if (rows.length === 0) continue;
    const width = Math.max(...rows.map((r) => r.length));
    const pad = (r: unknown[]) => Array.from({ length: width }, (_, i) => cell(r[i]));
    const [head, ...body] = rows;
    if (wb.SheetNames.length > 1) parts.push(`## ${name}`);
    parts.push(
      [
        `| ${pad(head).join(" | ")} |`,
        `| ${Array(width).fill("---").join(" | ")} |`,
        ...body.map((r) => `| ${pad(r).join(" | ")} |`),
      ].join("\n"),
    );
  }
  return parts.join("\n\n");
}

async function geminiToMarkdown(input: { mime: string; data: Buffer } | { html: string }) {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const content =
    "html" in input
      ? [PROMPT, `The document (converted from Word to HTML):\n\n${input.html}`]
      : [PROMPT, { inlineData: { mimeType: input.mime, data: input.data.toString("base64") } }];
  const res = await model.generateContent(content);
  return stripFences(res.response.text());
}

export async function documentToMarkdown(buf: Buffer, fileName: string): Promise<{ kind: Kind; content: string }> {
  const type = kindOf(fileName);
  if (!type) throw new Error("UNSUPPORTED");
  const fallbackTitle = baseName(fileName);
  switch (type.kind) {
    case "text": {
      const text = buf.toString("utf8");
      return { kind: "text", content: /^#\s/m.test(text) ? text : `# ${fallbackTitle}\n\n${text}` };
    }
    case "sheet":
      return { kind: "sheet", content: sheetToMarkdown(buf, fallbackTitle) };
    case "word": {
      const { value: html } = await mammoth.convertToHtml({ buffer: buf });
      if (!html.trim()) return { kind: "word", content: "" };
      return { kind: "word", content: await geminiToMarkdown({ html }) };
    }
    default:
      return { kind: type.kind, content: await geminiToMarkdown({ mime: type.mime!, data: buf }) };
  }
}
