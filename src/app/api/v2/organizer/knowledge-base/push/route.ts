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

## Statistik

- Pasukan berdaftar: ${comp._count.teams}

_Dikemaskini: ${new Date().toLocaleDateString("ms-MY", { day: "numeric", month: "long", year: "numeric" })}_
`.trim();

  return { path, title: comp.name, content };
}

// ── POST handler ───────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getOrganizerSession();
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { entityType, entityId } = await req.json();
  if (!entityType || !entityId)
    return NextResponse.json({ error: "MISSING_PARAMS" }, { status: 400 });

  try {
    let built: { path: string; title: string; content: string } | null = null;

    if (entityType === "event")       built = await buildEventMd(entityId);
    else if (entityType === "competition") built = await buildCompetitionMd(entityId);
    else return NextResponse.json({ error: "UNSUPPORTED_TYPE" }, { status: 400 });

    if (!built) return NextResponse.json({ error: "ENTITY_NOT_FOUND" }, { status: 404 });

    const item = await db.knowledgeBase.upsert({
      where:  { path: built.path },
      create: { ...built, entityType, entityId },
      update: { title: built.title, content: built.content, entityType, entityId },
    });

    return NextResponse.json({ item });
  } catch (e) {
    return NextResponse.json({ error: "PUSH_FAILED", detail: String(e) }, { status: 500 });
  }
}
