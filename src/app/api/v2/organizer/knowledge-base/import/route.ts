import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { baseName, documentToMarkdown, kindOf, slug } from "@/lib/kb-import";

// Converts an uploaded document into a Markdown draft for the Knowledge Base.
// Nothing is saved here: the organiser reviews the draft and saves it as a page.

export const runtime = "nodejs";
export const maxDuration = 120;

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  if (!WRITE_ROLES.includes(session.role))
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "MISSING_FILE" }, { status: 400 });
  if (file.size > MAX_BYTES)
    return NextResponse.json({ error: "TOO_LARGE", message: "Fail melebihi 10 MB." }, { status: 413 });
  if (!kindOf(file.name))
    return NextResponse.json(
      { error: "UNSUPPORTED", message: "Jenis fail tidak disokong. Guna PDF, Word (.docx), Excel/CSV, imej atau .md/.txt." },
      { status: 415 },
    );

  try {
    const { kind, content } = await documentToMarkdown(Buffer.from(await file.arrayBuffer()), file.name);
    if (!content.replace(/^#.*$/m, "").trim())
      return NextResponse.json({ error: "EMPTY", message: "Tiada teks dapat dibaca daripada fail ini." }, { status: 422 });

    const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim() || baseName(file.name);
    return NextResponse.json({
      draft: { title, path: `dokumen/${slug(title)}`, content, kind, fileName: file.name },
    });
  } catch (e) {
    console.error("[kb-import]", file.name, e);
    return NextResponse.json(
      { error: "CONVERT_FAILED", message: "Gagal menukar fail. Cuba lagi atau salin teksnya secara manual." },
      { status: 500 },
    );
  }
}
