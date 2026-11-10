"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Award, Download, User } from "lucide-react";
import { cn } from "@/lib/utils";

export type PreviewCert = {
  id: string; serialNumber: string; awardTitle: string | null; status: string; templateName: string;
};
export type PreviewMember = { key: string; name: string; certificates: PreviewCert[] };

/** One team's certificates: members on the left, the selected member's certificate previewed on the right. */
export function TeamCertPreviewClient({ back, eventName, competition, teamName, contingentName, members }: {
  back: string; eventName: string; competition: { name: string; code: string };
  teamName: string; contingentName: string | null; members: PreviewMember[];
}) {
  const first = members.find(m => m.certificates.length) ?? members[0];
  const [memberKey, setMemberKey] = useState(first?.key ?? "");
  const member = members.find(m => m.key === memberKey) ?? first;
  const [certId, setCertId] = useState(first?.certificates[0]?.id ?? "");
  const cert = member?.certificates.find(c => c.id === certId) ?? member?.certificates[0];

  const pick = (m: PreviewMember) => { setMemberKey(m.key); setCertId(m.certificates[0]?.id ?? ""); };

  return (
    <div className="flex min-h-screen flex-col gap-4 p-4 sm:p-6">
      <div className="flex items-start gap-4">
        <Link href={back} className="mt-1 flex shrink-0 items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700">
          <ArrowLeft className="h-3.5 w-3.5" /> Scoreboard
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">{eventName}</p>
          <h1 className="text-xl font-bold text-zinc-900">
            <span className="mr-2 font-mono text-zinc-400">{competition.code}</span>{competition.name}
          </h1>
          <p className="text-sm text-zinc-600">
            <span className="font-semibold text-zinc-800">{teamName}</span>
            {contingentName && <span className="text-zinc-500"> · {contingentName}</span>}
          </p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        {/* Members */}
        <aside className="max-h-64 shrink-0 overflow-y-auto rounded-xl border bg-white shadow-sm lg:max-h-none lg:w-72">
          <p className="border-b px-4 py-2.5 text-xs font-semibold text-zinc-500">Ahli ({members.length})</p>
          <ul className="divide-y">
            {members.map(m => {
              const active = m.key === member?.key;
              return (
                <li key={m.key}>
                  <button type="button" onClick={() => pick(m)}
                    className={cn("flex w-full items-start gap-2.5 px-4 py-3 text-left transition-colors",
                      active ? "bg-sky-50" : "hover:bg-zinc-50")}>
                    <User className={cn("mt-0.5 h-4 w-4 shrink-0", active ? "text-sky-600" : "text-zinc-300")} />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-sm font-medium leading-snug", active ? "text-sky-900" : "text-zinc-800")}>{m.name}</span>
                      {m.certificates.length ? (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {m.certificates.map(c => (
                            <span key={c.id} className="inline-flex items-center gap-1 rounded border border-sky-200 bg-white px-1.5 py-0.5 text-[10px] text-sky-700">
                              <Award className="h-3 w-3" />{c.awardTitle ?? c.templateName}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="text-[11px] text-zinc-400">Tiada sijil</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Preview */}
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-white shadow-sm">
          {member && cert ? (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-900">{member.name}</p>
                  <p className="font-mono text-[11px] text-zinc-400">{cert.serialNumber}{cert.status !== "READY" && ` · ${cert.status}`}</p>
                </div>
                {member.certificates.length > 1 && (
                  <div className="flex gap-1">
                    {member.certificates.map(c => (
                      <button key={c.id} type="button" onClick={() => setCertId(c.id)} title={c.templateName}
                        className={cn("rounded-md border px-2.5 py-1 text-xs font-medium",
                          c.id === cert.id ? "border-[#085782] bg-[#085782] text-white" : "bg-white text-zinc-600 hover:bg-zinc-50")}>
                        {c.awardTitle ?? c.templateName}
                      </button>
                    ))}
                  </div>
                )}
                <a href={`/api/v2/certificates/${cert.id}/download`}
                  className="inline-flex items-center gap-1 rounded-md bg-[#085782] px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90">
                  <Download className="h-3.5 w-3.5" /> Muat turun
                </a>
              </div>
              <iframe key={cert.id} src={`/api/v2/certificates/${cert.id}/download?inline=1#toolbar=0&view=FitH`}
                title="Pratonton sijil" className="min-h-[60vh] flex-1" />
            </>
          ) : (
            <p className="m-auto text-sm text-zinc-400">{member ? "Ahli ini belum mempunyai sijil." : "Tiada ahli."}</p>
          )}
        </section>
      </div>
    </div>
  );
}
