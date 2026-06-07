import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { Link } from "@/i18n/navigation";
import { ChevronLeft, Download } from "lucide-react";

export default async function DocViewerPage({
  params,
}: {
  params: Promise<{ locale: string; id: string; docId: string }>;
}) {
  const { id, docId } = await params;

  const doc = await db.competitionDoc.findFirst({
    where: { id: docId, competitionId: id },
    include: { competition: { select: { id: true, name: true, code: true, theme: { select: { color: true } } } } },
  });

  if (!doc) notFound();

  const accent = doc.competition.theme?.color ?? "#003893";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#1e1e2e", fontFamily: "'Inter', sans-serif" }}>
      {/* Toolbar */}
      <div style={{ height: 52, background: "#111827", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 12, padding: "0 16px", flexShrink: 0 }}>
        <Link
          href={`/competition/${id}`}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.65)", textDecoration: "none", fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", padding: "6px 10px", borderRadius: 6, background: "rgba(255,255,255,0.06)", transition: "background 0.15s" }}
        >
          <ChevronLeft size={14} /> Kembali
        </Link>

        <div style={{ flex: 1, overflow: "hidden" }}>
          <p style={{ margin: 0, fontSize: "0.82rem", fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {doc.name}
          </p>
          <p style={{ margin: 0, fontSize: "0.68rem", color: "rgba(255,255,255,0.45)" }}>
            {doc.competition.code} · {doc.competition.name}
          </p>
        </div>

        <a
          href={doc.url}
          download={doc.name}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#fff", textDecoration: "none", fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", padding: "6px 14px", borderRadius: 6, background: accent, flexShrink: 0 }}
        >
          <Download size={13} /> Muat Turun
        </a>
      </div>

      {/* PDF viewer */}
      <iframe
        src={`${doc.url}#toolbar=1&navpanes=0`}
        style={{ flex: 1, border: "none", width: "100%", background: "#525659" }}
        title={doc.name}
      />
    </div>
  );
}
