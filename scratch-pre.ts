import { db } from "./src/lib/db";
import { resolveRecipients, issueBatch, type GeneratorConfig } from "./src/lib/certificates/generator";
import { linkPlan, saveLinks } from "./src/lib/certificates/pregen";
async function main() {
  const ev = await db.event.findUniqueOrThrow({ where: { slug: "saringan-zon-selatan" }, select: { id: true } });
  const tpl = await db.certTemplate.findFirstOrThrow({ where: { status: "ACTIVE", currentVersionId: { not: null }, season: { archivedAt: null } }, select: { id: true, name: true } });
  const cfg: GeneratorConfig = { eventId: ev.id, competitionCodes: ["4.1K"], rankFrom: 1, rankTo: 3, resultsBy: "CONFIG", verifiedOnly: false, distributionLevel: "STATE" };
  const job = await db.certGeneratorJob.create({ data: { templateId: tpl.id, source: "EVENT_WINNERS_PREGEN", config: cfg as object, status: "PENDING" } as never });
  try {
    const { rows, total } = await resolveRecipients("EVENT_WINNERS_PREGEN", cfg, 0, 1000);
    console.log("slots", total, rows.slice(0, 3).map(r => `${r.competitionCode}/${r.stateName}/${r.rank}/${(r.extraMeta as any).pregen.member}`).join(" "));
    console.log("issue", await issueBatch({ jobId: job.id, templateId: tpl.id, rows, createdBy: "test" }));
    console.log("re-run", await issueBatch({ jobId: job.id, templateId: tpl.id, rows, createdBy: "test", refresh: true }));
    const plan = await linkPlan(job);
    console.log("plan", plan.totals, plan.groups.slice(0, 3).map(g => `${g.compCode} ${g.stateName} ${g.awardTitle}: ${g.slots.length} blanks, ${g.winners.length} winners, proposed ${g.winners.filter(w => w.certId).length}`));
    const s1 = await saveLinks(job, {}, { id: "test", name: "Tester" });
    console.log("save1", s1);
    const after = await linkPlan(job);
    console.log("after", after.totals);
    // swap first two winners of the first group with 2+ winners
    const g = after.groups.find(x => x.winners.filter(w => w.certId).length >= 2)!;
    const [a, b] = g.winners;
    const s2 = await saveLinks(job, { [a.key]: b.certId, [b.key]: a.certId }, { id: "test", name: "Tester" });
    const sw = await db.certificate.findMany({ where: { id: { in: [a.certId!, b.certId!] } }, select: { id: true, recipientName: true, status: true } });
    console.log("swap", s2, sw.map(c => `${c.id === a.certId ? "slotA" : "slotB"}=${c.recipientName}`).join(", "), "expect slotA=", b.name);
    // unlink one winner -> new certificate
    const s3 = await saveLinks(job, { [a.key]: null }, { id: "test", name: "Tester" });
    console.log("to-new", s3);
    // relink again -> extra revoked
    const s4 = await saveLinks(job, { [a.key]: b.certId }, { id: "test", name: "Tester" });
    console.log("back-to-blank", s4);
    // winners job refresh on same template must not duplicate
    const win = await resolveRecipients("EVENT_WINNERS", cfg, 0, 1000);
    console.log("winners job", await issueBatch({ jobId: job.id, templateId: tpl.id, rows: win.rows, createdBy: "test", refresh: true }));
    const statuses = await db.certificate.groupBy({ by: ["status"], where: { meta: { path: ["jobId"], equals: job.id } }, _count: { _all: true } });
    console.log("statuses", statuses.map(s => `${s.status}:${s._count._all}`).join(" "));
  } finally {
    const del = await db.certificate.deleteMany({ where: { meta: { path: ["jobId"], equals: job.id } } });
    await db.certGeneratorJob.delete({ where: { id: job.id } });
    console.log("cleanup deleted", del.count);
  }
}
main().catch(e => console.error("ERR", e.message)).finally(() => db.$disconnect());
