"use client";

import { useState, useEffect } from "react";
import { Images, X, ChevronLeft, ChevronRight } from "lucide-react";

type Photo = { id: string; thumbUrl: string; fullUrl: string; description: string | null };

export function GalleryPhotoGrid({ photos, galleryTitle }: { photos: Photo[]; galleryTitle: string }) {
  const [idx, setIdx] = useState<number | null>(null);

  const open  = (i: number) => setIdx(i);
  const close = () => setIdx(null);
  const prev  = () => setIdx((i) => (i === null ? null : (i - 1 + photos.length) % photos.length));
  const next  = () => setIdx((i) => (i === null ? null : (i + 1) % photos.length));

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (idx === null) return;
      if (e.key === "Escape")     { setIdx(null); return; }
      if (e.key === "ArrowLeft")  { setIdx((i) => i === null ? null : (i - 1 + photos.length) % photos.length); return; }
      if (e.key === "ArrowRight") { setIdx((i) => i === null ? null : (i + 1) % photos.length); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, photos.length]);

  useEffect(() => {
    document.body.style.overflow = idx !== null ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [idx]);

  if (photos.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "80px 0", color: "#9ca3af" }}>
        <Images size={48} style={{ margin: "0 auto 16px", display: "block" }} />
        <p style={{ fontSize: "1rem" }}>Tiada foto dalam galeri ini.</p>
      </div>
    );
  }

  const current = idx !== null ? photos[idx] : null;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
        {photos.map((photo, i) => (
          <div
            key={photo.id}
            onClick={() => open(i)}
            style={{
              cursor: "pointer", overflow: "hidden", borderRadius: 8,
              background: "#e5e7eb", aspectRatio: "4/3",
              transition: "transform 0.25s, box-shadow 0.25s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.transform = "scale(1.02)"; (e.currentTarget as HTMLDivElement).style.boxShadow = "0 6px 20px rgba(0,0,0,0.15)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.transform = ""; (e.currentTarget as HTMLDivElement).style.boxShadow = ""; }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.thumbUrl}
              alt={photo.description ?? galleryTitle}
              loading="lazy"
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {idx !== null && current && (
        <div
          onClick={close}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)",
            zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {/* Close */}
          <button
            onClick={close}
            style={{ position: "absolute", top: 20, right: 24, background: "none", border: "none", color: "#fff", cursor: "pointer", padding: 4 }}
            aria-label="Close"
          >
            <X size={28} />
          </button>

          {/* Prev */}
          {photos.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); prev(); }}
              style={{ position: "absolute", left: 16, background: "rgba(255,255,255,0.12)", border: "none", color: "#fff", cursor: "pointer", borderRadius: "50%", width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center" }}
              aria-label="Previous"
            >
              <ChevronLeft size={22} />
            </button>
          )}

          {/* Image */}
          <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, maxWidth: "92vw" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={current.fullUrl}
              alt={current.description ?? galleryTitle}
              style={{ maxWidth: "92vw", maxHeight: "82vh", objectFit: "contain", borderRadius: 4 }}
            />
            {current.description && (
              <p style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.85rem", textAlign: "center", maxWidth: 600 }}>
                {current.description}
              </p>
            )}
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: "0.75rem" }}>
              {idx + 1} / {photos.length}
            </p>
          </div>

          {/* Next */}
          {photos.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); next(); }}
              style={{ position: "absolute", right: 16, background: "rgba(255,255,255,0.12)", border: "none", color: "#fff", cursor: "pointer", borderRadius: "50%", width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center" }}
              aria-label="Next"
            >
              <ChevronRight size={22} />
            </button>
          )}
        </div>
      )}
    </>
  );
}
