import { NextRequest, NextResponse } from "next/server";
import { getOrganizerSession } from "@/lib/auth/session";
import { db } from "@/lib/db";

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function fmt(d: Date | string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("ms-MY", { day: "numeric", month: "long", year: "numeric" });
}

// ── Event formatter ────────────────────────────────────────────────────────────

async function buildEventMd(entityId: string) {
  const event = await db.event.findUnique({
    where: { id: entityId },
    include: {
      state: { select: { name: true } },
      zone:  { select: { name: true } },
      eventCompetitions: {
        include: {
          competition: { select: { name: true, code: true, participationType: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!event) return null;

  const teamCount = await db.team.count({
    where: { competition: { eventCompetitions: { some: { eventId: entityId } } } },
  });

  const location = [event.state?.name, event.zone?.name].filter(Boolean).join(" / ");
  const compTable = event.eventCompetitions.length
    ? `| Nama | Kod | Jenis |\n|------|-----|-------|\n` +
      event.eventCompetitions.map(ec =>
        `| ${ec.competition.name} | \`${ec.competition.code}\` | ${ec.competition.participationType} |`
      ).join("\n")
    : "_Tiada pertandingan didaftarkan._";

  const path = `events/${slugify(event.name)}`;
  const content = `---
entity_type: event
entity_id: ${event.id}
last_synced: ${new Date().toISOString().slice(0, 10)}
---

# ${event.name}

**Skop**: ${event.scope} | **Status**: ${event.status}${location ? ` | **Lokasi**: ${location}` : ""}

**Tarikh**: ${fmt(event.startDate)} – ${fmt(event.endDate)}
**Pendaftaran**: ${fmt(event.registrationStart)} – ${fmt(event.registrationEnd)}

${event.venue ? `**Tempat**: ${event.venue}` : ""}
${event.address ? `**Alamat**: ${event.address}` : ""}
${event.city ? `**Bandar**: ${event.city}` : ""}

## Pertandingan (${event.eventCompetitions.length})

${compTable}

## Statistik

- Pasukan berdaftar: ${teamCount}

_Dikemaskini: ${new Date().toLocaleDateString("ms-MY", { day: "numeric", month: "long", year: "numeric" })}_
`.trim();

  return { path, title: event.name, content };
}

// ── Competition formatter ──────────────────────────────────────────────────────

async function buildCompetitionMd(entityId: string) {
  const comp = await db.competition.findUnique({
    where: { id: entityId },
    include: {
      eventCompetitions: {
        include: {
          event: { select: { name: true, slug: true, startDate: true, status: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      targetGroups: { include: { targetGroup: { select: { name: true, minAge: true, maxAge: true } } } },
      docs: { orderBy: { uploadedAt: "asc" } },
      _count: { select: { teams: true } },
    },
  });
  if (!comp) return null;

  const eventTable = comp.eventCompetitions.length
    ? `| Acara | Tarikh | Status |\n|-------|--------|--------|\n` +
      comp.eventCompetitions.map(ec =>
        `| ${ec.event.name} | ${fmt(ec.event.startDate)} | ${ec.event.status} |`
      ).join("\n")
    : "_Belum dilampirkan kepada mana-mana acara._";

  const targetRows = comp.targetGroups
    .map(tg => `- ${tg.targetGroup.name}${tg.targetGroup.minAge ? ` (umur ${tg.targetGroup.minAge}–${tg.targetGroup.maxAge})` : ""}`)
    .join("\n");

  const bengkelSection = comp.eptimEduCourseId
    ? `## Bengkel MT / Kursus Pembelajaran

**Kursus**: ${comp.eptimEduCourseTitle ?? comp.eptimEduCourseId}
**ID Kursus**: \`${comp.eptimEduCourseId}\`

Peserta dan pengurus pasukan boleh mengakses kursus ini melalui bahagian **Bengkel MT** dalam portal mereka. Sistem akan mendaftar masuk secara automatik.`
    : "";

  const docsSection = comp.docs.length
    ? `## Kertas Kerja Konsep / Dokumen (${comp.docs.length})

${comp.docs.map(d => `- [${d.name}](${d.url}) _(${d.size ? `${Math.round(d.size / 1024)} KB · ` : ""}dimuat naik ${fmt(d.uploadedAt)})_`).join("\n")}`
    : "";

  const path = `competitions/${slugify(comp.name)}`;
  const content = `---
entity_type: competition
entity_id: ${comp.id}
last_synced: ${new Date().toISOString().slice(0, 10)}
---

# ${comp.name}

**Kod**: \`${comp.code}\` | **Jenis**: ${comp.participationType}

**Saiz Pasukan**: ${comp.minTeamSize}–${comp.maxTeamSize} ahli
${comp.description ? `\n${comp.description}\n` : ""}
## Kumpulan Sasaran

${targetRows || "_Tiada kumpulan sasaran ditetapkan._"}

## Acara (${comp.eventCompetitions.length})

${eventTable}
${bengkelSection ? `\n${bengkelSection}\n` : ""}
${docsSection ? `\n${docsSection}\n` : ""}
## Statistik

- Pasukan berdaftar: ${comp._count.teams}

_Dikemaskini: ${new Date().toLocaleDateString("ms-MY", { day: "numeric", month: "long", year: "numeric" })}_
`.trim();

  return { path, title: comp.name, content };
}

// ── Reference data formatters (aggregate — one KB article per type) ───────────

async function buildTargetGroupsMd() {
  const groups = await db.targetGroup.findMany({ orderBy: [{ schoolLevel: "asc" }, { minAge: "asc" }] });
  if (!groups.length) return null;

  const rows = groups.map(g =>
    `| ${g.code} | ${g.name} | ${g.schoolLevel} | ${g.minAge ?? "—"}–${g.maxAge ?? "—"} | ${g.ageGroup ?? "—"} |`
  ).join("\n");

  const content = `---
entity_type: reference/target-groups
last_synced: ${new Date().toISOString().slice(0, 10)}
---

# Kumpulan Sasaran (Target Groups)

Senarai semua kumpulan sasaran yang digunakan dalam pertandingan Malaysia Techlympics.

| Kod | Nama | Peringkat | Julat Umur | Kumpulan Umur |
|-----|------|-----------|-----------|---------------|
${rows}

_Dikemaskini: ${new Date().toLocaleDateString("ms-MY", { day: "numeric", month: "long", year: "numeric" })}_`.trim();

  return { path: "reference/target-groups", title: "Kumpulan Sasaran (Target Groups)", content };
}

async function buildThemesMd() {
  const themes = await db.theme.findMany({ orderBy: { name: "asc" } });
  if (!themes.length) return null;

  const rows = themes.map(t =>
    `| ${t.name} | ${t.description ?? "—"} |`
  ).join("\n");

  const content = `---
entity_type: reference/themes
last_synced: ${new Date().toISOString().slice(0, 10)}
---

# Tema Pertandingan (Competition Themes)

Senarai tema yang digunakan dalam Malaysia Techlympics.

| Nama Tema | Keterangan |
|-----------|-----------|
${rows}

_Dikemaskini: ${new Date().toLocaleDateString("ms-MY", { day: "numeric", month: "long", year: "numeric" })}_`.trim();

  return { path: "reference/themes", title: "Tema Pertandingan (Competition Themes)", content };
}

async function buildZonesMd() {
  const zones = await db.zone.findMany({
    include: { states: { include: { state: { select: { name: true, code: true } } }, orderBy: { state: { name: "asc" } } } },
    orderBy: { name: "asc" },
  });
  if (!zones.length) return null;

  const rows = zones.map(z => {
    const stateList = z.states.map(s => s.state.name).join(", ") || "—";
    return `| ${z.name} | ${stateList} |`;
  }).join("\n");

  const content = `---
entity_type: reference/zones
last_synced: ${new Date().toISOString().slice(0, 10)}
---

# Zon & Negeri (Zones & States)

Pembahagian zon untuk Malaysia Techlympics beserta negeri di bawah setiap zon.

| Zon | Negeri |
|-----|--------|
${rows}

_Dikemaskini: ${new Date().toLocaleDateString("ms-MY", { day: "numeric", month: "long", year: "numeric" })}_`.trim();

  return { path: "reference/zones", title: "Zon & Negeri (Zones & States)", content };
}

async function buildHeiMd() {
  const heis = await db.higherInstitution.findMany({
    where: { heiType: "HQ", isActive: true },
    include: { state: { select: { name: true } } },
    orderBy: [{ sector: "asc" }, { name: "asc" }],
    take: 300,
  });
  if (!heis.length) return null;

  const rows = heis.map(h =>
    `| ${h.name} | ${h.code ?? "—"} | ${h.sector ?? "—"} | ${h.state?.name ?? "—"} |`
  ).join("\n");

  const content = `---
entity_type: reference/higher-institutions
last_synced: ${new Date().toISOString().slice(0, 10)}
---

# Institusi Pengajian Tinggi (Higher Institutions)

Senarai institusi pengajian tinggi (IPT) yang berdaftar dalam sistem Malaysia Techlympics.

| Nama | Kod | Sektor | Negeri |
|------|-----|--------|--------|
${rows}

_Dikemaskini: ${new Date().toLocaleDateString("ms-MY", { day: "numeric", month: "long", year: "numeric" })}_`.trim();

  return { path: "reference/higher-institutions", title: "Institusi Pengajian Tinggi (Higher Institutions)", content };
}

// ── POST handler ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { entityType, entityId } = await req.json();
  if (!entityType)
    return NextResponse.json({ error: "MISSING_PARAMS" }, { status: 400 });

  // Per-entity types require entityId; aggregate reference types do not
  const perEntityTypes = ["event", "competition"];
  if (perEntityTypes.includes(entityType) && !entityId)
    return NextResponse.json({ error: "MISSING_PARAMS" }, { status: 400 });

  try {
    let built: { path: string; title: string; content: string } | null = null;

    if      (entityType === "event")                      built = await buildEventMd(entityId);
    else if (entityType === "competition")                built = await buildCompetitionMd(entityId);
    else if (entityType === "reference/target-groups")    built = await buildTargetGroupsMd();
    else if (entityType === "reference/themes")           built = await buildThemesMd();
    else if (entityType === "reference/zones")            built = await buildZonesMd();
    else if (entityType === "reference/higher-institutions") built = await buildHeiMd();
    else return NextResponse.json({ error: "UNSUPPORTED_TYPE" }, { status: 400 });

    if (!built) return NextResponse.json({ error: "ENTITY_NOT_FOUND" }, { status: 404 });

    const item = await db.knowledgeBase.upsert({
      where:  { path: built.path },
      create: { ...built, entityType, entityId: entityId ?? null },
      update: { title: built.title, content: built.content, entityType, entityId: entityId ?? null },
    });

    return NextResponse.json({ item });
  } catch (e) {
    return NextResponse.json({ error: "PUSH_FAILED", detail: String(e) }, { status: 500 });
  }
}
