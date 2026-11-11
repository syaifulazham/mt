/**
 * Pre-event "Pencapaian Acara" (EVENT_WINNERS_PREGEN) — tying the blank
 * certificates printed before the event to the actual winners.
 *
 * Each blank is a slot: competition × state ("-" = national) × rank × team
 * member (meta.pregen). After the event the winners of the same competition,
 * state and rank fill those slots — member 1 → slot 1 … by default, or as the
 * organizer swaps them. A linked blank gets the winner's snapshot, turns READY
 * and keeps its serial number and verification code. Winners beyond the slots
 * (ties, bigger teams) get new certificates; blanks nobody takes stay DRAFT
 * ("tidak digunakan") and never reach the portals.
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  awardTitleForRank, issueBatch, resolveRecipients, snapshotOf,
  type DistributionLevel, type GeneratorConfig, type PregenSlot, type Recipient,
} from "./generator";

type Job = { id: string; templateId: string; source: string; config: unknown };

type SlotMeta = PregenSlot & { assignedKey?: string; assignedAt?: string; assignedBy?: string };
type CertRow = { id: string; serialNumber: string; status: string; recipientName: string; stateName: string | null; meta: unknown };

export type LinkSlot = { certId: string; serial: string; member: number; assignedKey: string | null; assignedName: string | null };
export type LinkWinner = {
  key: string; name: string; teamName: string | null; contingentName: string | null;
  /** Proposed blank (kept from an earlier link, else the next free one); null = a new certificate. */
  certId: string | null;
  /** A new certificate this winner already has (issued because no blank was free). */
  extraSerial: string | null;
};
export type LinkGroup = {
  key: string; compCode: string | null; compName: string | null;
  stateName: string | null; rank: number; awardTitle: string;
  slots: LinkSlot[]; winners: LinkWinner[];
};

const groupKey = (compId: string | null, state: string | null | undefined, rank: number | null) =>
  `${compId ?? "-"}|${state || "-"}|${rank ?? 0}`;

/** Loads blanks and winners and proposes who gets which blank. */
async function build(job: Job) {
  const cfg = job.config as GeneratorConfig;
  if (job.source !== "EVENT_WINNERS_PREGEN" || !cfg.eventId) throw new Error("Bukan penjana sijil pra-acara.");

  const certs = await db.certificate.findMany({
    where: {
      templateVersion: { templateId: job.templateId },
      status: { not: "REVOKED" },
      meta: { path: ["genKey"], string_starts_with: `${job.templateId}:pre:${cfg.eventId}:` },
    },
    select: { id: true, serialNumber: true, status: true, recipientName: true, stateName: true, meta: true,
              competitionId: true, competitionCode: true, competitionName: true },
  });

  const { rows: winners } = await resolveRecipients("EVENT_WINNERS",
    { ...cfg, resultsBy: cfg.resultsBy ?? "CONFIG" }, 0, 1_000_000);

  // New certificates already issued to winners no blank was free for.
  const extraKeys = winners.map(w => `${job.templateId}:${w.key}`);
  const extras = extraKeys.length ? await db.$queryRaw<{ k: string; id: string; serialNumber: string }[]>`
    SELECT meta->>'genKey' AS k, id, "serialNumber" FROM certificates
    WHERE meta->>'genKey' = ANY(${extraKeys}) AND status <> 'REVOKED'` : [];
  const extraBy = new Map(extras.map(e => [e.k.slice(job.templateId.length + 1), e]));

  const groups = new Map<string, LinkGroup & { certRows: Map<string, CertRow & { slot: SlotMeta }>; recipients: Map<string, Recipient> }>();
  const ensure = (key: string, init: () => Omit<LinkGroup, "key" | "slots" | "winners">) => {
    let g = groups.get(key);
    if (!g) groups.set(key, g = { key, ...init(), slots: [], winners: [], certRows: new Map(), recipients: new Map() });
    return g;
  };

  for (const c of certs) {
    const slot = (c.meta as { pregen?: SlotMeta } | null)?.pregen;
    if (!slot) continue;
    const g = ensure(groupKey(slot.compId, slot.stateId, slot.rank), () => ({
      compCode: c.competitionCode, compName: c.competitionName,
      stateName: slot.stateId ? c.stateName : null, rank: slot.rank, awardTitle: awardTitleForRank(slot.rank),
    }));
    g.slots.push({ certId: c.id, serial: c.serialNumber, member: slot.member, assignedKey: slot.assignedKey ?? null,
                   assignedName: slot.assignedKey ? c.recipientName : null });
    g.certRows.set(c.id, { ...c, slot });
  }

  for (const w of winners) {
    const g = ensure(groupKey(w.competitionId, w.slotState, w.rank), () => ({
      compCode: w.competitionCode, compName: w.competitionName,
      stateName: w.slotState && w.slotState !== "-" ? w.stateName : null, rank: w.rank ?? 0, awardTitle: w.awardTitle ?? "",
    }));
    g.recipients.set(w.key, w);
    g.winners.push({ key: w.key, name: w.name, teamName: w.teamName, contingentName: w.contingentName,
                     certId: null, extraSerial: extraBy.get(w.key)?.serialNumber ?? null });
  }

  // Proposal: keep earlier links, then member order into the free blanks.
  for (const g of groups.values()) {
    g.slots.sort((a, b) => a.member - b.member);
    const taken = new Set<string>();
    for (const w of g.winners) {
      const s = g.slots.find(x => x.assignedKey === w.key);
      if (s) { w.certId = s.certId; taken.add(s.certId); }
    }
    for (const w of g.winners) {
      if (w.certId || w.extraSerial) continue;   // already has a new certificate: leave it unless swapped in
      const s = g.slots.find(x => !taken.has(x.certId));
      if (s) { w.certId = s.certId; taken.add(s.certId); }
    }
  }

  const sorted = [...groups.values()].sort((a, b) =>
    (a.compCode ?? "").localeCompare(b.compCode ?? "", undefined, { numeric: true })
    || (a.stateName ?? "").localeCompare(b.stateName ?? "") || a.rank - b.rank);
  return { cfg, groups: sorted, extraBy };
}

/** The linking screen: every slot group with its blanks, winners and the proposed mapping. */
export async function linkPlan(job: Job) {
  const { groups } = await build(job);
  const slots = groups.flatMap(g => g.slots);
  return {
    groups: groups.map(({ certRows: _c, recipients: _r, ...g }) => { void _c; void _r; return g; }),
    totals: {
      blanks: slots.length,
      linked: slots.filter(s => s.assignedKey).length,
      winners: groups.reduce((n, g) => n + g.winners.length, 0),
    },
  };
}

/**
 * Saves a mapping { winnerKey: certId | null }. Winners left out keep the
 * proposal. Blanks no longer mapped go back to blank; winners without a blank
 * get a new certificate (unless they already have one); a winner moved onto a
 * blank has the new certificate issued earlier revoked, so nobody holds two.
 */
export async function saveLinks(job: Job, mapping: Record<string, string | null>, user: { id: string; name: string }) {
  const by = user.name;
  const { cfg, groups, extraBy } = await build(job);
  const distLevel: DistributionLevel = cfg.distributionLevel ?? "NONE";
  const now = new Date().toISOString();

  const want = new Map<string, { w: Recipient; g: (typeof groups)[number] }>();   // certId → winner
  const noBlank: Recipient[] = [];
  const revoke: string[] = [];
  for (const g of groups) {
    for (const lw of g.winners) {
      const certId = lw.key in mapping ? mapping[lw.key] : lw.certId;
      const w = g.recipients.get(lw.key)!;
      if (certId) {
        if (!g.certRows.has(certId)) throw new Error(`Sijil yang dipilih untuk ${lw.name} bukan bagi ${g.compCode} ${g.awardTitle}${g.stateName ? ` (${g.stateName})` : ""}.`);
        if (want.has(certId)) throw new Error(`Satu sijil dipilih untuk dua pemenang (${want.get(certId)!.w.name} dan ${lw.name}).`);
        want.set(certId, { w, g });
        const extra = extraBy.get(lw.key);
        if (extra) revoke.push(extra.id);
      } else if (!extraBy.has(lw.key)) {
        noBlank.push(w);
      }
    }
  }

  let linked = 0, cleared = 0;
  await db.$transaction(async (tx) => {
    for (const g of groups) {
      for (const c of g.certRows.values()) {
        const meta = (c.meta ?? {}) as Record<string, unknown>;
        const target = want.get(c.id);
        if (target) {
          if (c.slot.assignedKey === target.w.key && c.status === "READY") continue;
          await tx.certificate.update({
            where: { id: c.id },
            data: {
              ...snapshotOf(target.w), status: "READY",
              meta: { ...meta, distLevel, winKey: `${job.templateId}:${target.w.key}`,
                      pregen: { ...c.slot, assignedKey: target.w.key, assignedAt: now, assignedBy: by } } as Prisma.InputJsonValue,
            },
          });
          linked++;
        } else if (c.slot.assignedKey) {
          const { winKey: _w, ...rest } = meta; void _w;
          const { assignedKey: _k, assignedAt: _a, assignedBy: _b, ...slot } = c.slot; void _k; void _a; void _b;
          await tx.certificate.update({
            where: { id: c.id },
            data: {
              recipientName: "", recipientIc: null, contingentName: null, schoolName: null, countryName: null,
              teamName: null, participantId: null, contingentId: null, teamId: null,
              stateName: c.slot.stateId ? g.stateName : null, status: "DRAFT",
              meta: { ...rest, pregen: slot } as Prisma.InputJsonValue,
            },
          });
          cleared++;
        }
      }
    }
    if (revoke.length)
      await tx.certificate.updateMany({
        where: { id: { in: revoke }, status: { not: "REVOKED" } },
        data: { status: "REVOKED", revokedAt: new Date(), revokedReason: "Diganti sijil pra-cetak" },
      });
  }, { timeout: 120_000 });

  let created = 0;
  for (let i = 0; i < noBlank.length; i += 250) {
    const r = await issueBatch({ jobId: job.id, templateId: job.templateId, rows: noBlank.slice(i, i + 250), createdBy: user.id, distributionLevel: distLevel });
    created += r.created;
  }
  return { linked, cleared, created, revoked: revoke.length };
}
