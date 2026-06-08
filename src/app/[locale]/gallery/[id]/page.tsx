import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { PublicNav } from "@/components/landing/PublicNav";
import { GalleryPhotoGrid } from "@/components/landing/GalleryPhotoGrid";
import { Images, ArrowLeft, CalendarDays } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";

type Props = { params: Promise<{ locale: string; id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const g = await db.gallery.findUnique({ where: { id }, select: { title: true, description: true } });
  if (!g) return { title: "Galeri — Techlympics" };
  return { title: `${g.title} — Techlympics`, description: g.description ?? undefined };
}

export default async function GalleryDetailPage({ params }: Props) {
  const { locale, id } = await params;

  const [gallery, t] = await Promise.all([
    db.gallery.findUnique({
      where: { id },
      include: { photos: { orderBy: { order: "asc" } } },
    }),
    getTranslations({ locale, namespace: "gallery" }),
  ]);

  if (!gallery) notFound();

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Exo+2:wght@700;800;900&family=Rajdhani:wght@400;600;700&display=swap');
      `}</style>

      <PublicNav locale={locale} />

      <main style={{ paddingTop: 64, minHeight: "100vh", background: "#f8fafc", fontFamily: "'Rajdhani', sans-serif" }}>

        {/* Hero bar */}
        <div style={{ background: "linear-gradient(135deg, #003893 0%, #001f5c 100%)", color: "#fff", padding: "48px 0 40px" }}>
          <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 clamp(16px,5vw,40px)" }}>
            <Link
              href="/#gallery"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.8rem", color: "rgba(255,255,255,0.6)", textDecoration: "none", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 20 }}
            >
              <ArrowLeft size={14} /> {t("back")}
            </Link>
            <h1 style={{ fontFamily: "'Exo 2', sans-serif", fontWeight: 900, fontSize: "clamp(1.6rem, 4vw, 2.8rem)", textTransform: "uppercase", letterSpacing: "0.03em", margin: "0 0 10px" }}>
              {gallery.title}
            </h1>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center", color: "rgba(255,255,255,0.65)", fontSize: "0.85rem" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <CalendarDays size={14} /> {gallery.year}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Images size={14} /> {t("photoCount", { count: gallery.photos.length })}
              </span>
            </div>
            {gallery.description && (
              <p style={{ marginTop: 14, fontSize: "0.95rem", color: "rgba(255,255,255,0.75)", maxWidth: 680, lineHeight: 1.65 }}>
                {gallery.description}
              </p>
            )}
          </div>
        </div>

        {/* Photo grid with lightbox (client component) */}
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "clamp(24px,4vw,48px) clamp(16px,5vw,40px) clamp(40px,6vw,80px)" }}>
          <GalleryPhotoGrid
            photos={gallery.photos.map((p) => ({ id: p.id, thumbUrl: p.thumbUrl, fullUrl: p.fullUrl, description: p.description ?? null }))}
            galleryTitle={gallery.title}
          />
        </div>
      </main>
    </>
  );
}
