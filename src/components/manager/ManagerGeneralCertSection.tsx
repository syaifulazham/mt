"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, BookOpen, School } from "lucide-react";
import { GENERAL_API, type GeneralData } from "@/components/manager/ManagerSchoolLevelCertClient";

// Manager portal → Sijil: the School / Contingent Level Cert card. Generating
// happens on its own page (certificates/school-level); this card only shows
// the template and counts, and opens that page. Hidden until the organizer has
// set a General template and the manager portal is distributed.

export function ManagerGeneralCertSection() {
  const t = useTranslations("managerCertificates");
  const [data, setData] = useState<GeneralData | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(GENERAL_API, { cache: "no-store" })
      .then(r => r.json())
      .then(j => { if (alive) setData(j.available ? j : { available: false }); })
      .catch(() => { if (alive) setData({ available: false }); });
    return () => { alive = false; };
  }, []);

  if (!data?.available) return null;
  const issued = data.competitions.reduce((s, c) => s + c.participants.filter(p => p.certificateId).length, 0);

  return (
    <section className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-white p-4 dark:border-emerald-900 dark:bg-zinc-900">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40"><School className="h-5 w-5" /></span>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-bold tracking-wide text-zinc-900 dark:text-zinc-100">{data.school ? t("generalTitleSchool") : t("generalTitleContingent")}</h2>
        <p className="max-w-3xl text-xs text-zinc-500">{t("generalIntro")}</p>
        <p className="mt-0.5 text-[11px] text-zinc-400">
          {t("generalTemplate", { name: data.templateName })} · {t("generalCardSummary", { issued, competitions: data.competitions.length })}
        </p>
      </div>
      <Link href="/manager/certificates/school-level/manual"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800">
        <BookOpen className="h-4 w-4" /> {t("manual")}
      </Link>
      <Link href="/manager/certificates/school-level"
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-emerald-700">
        {t("openGeneral")} <ArrowRight className="h-4 w-4" />
      </Link>
    </section>
  );
}
