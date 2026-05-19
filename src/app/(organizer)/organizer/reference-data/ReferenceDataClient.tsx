"use client";

import { useState } from "react";
import { Map, School, Building2, Users, Palette } from "lucide-react";
import { GeographyTab }     from "@/components/organizer/reference-data/GeographyTab";
import { SchoolsTab }       from "@/components/organizer/reference-data/SchoolsTab";
import { HEITab }           from "@/components/organizer/reference-data/HEITab";
import { TargetGroupsTab }  from "@/components/organizer/reference-data/TargetGroupsTab";
import { ThemesTab }        from "@/components/organizer/reference-data/ThemesTab";

const TABS = [
  { key: "geography",      label: "Geography",            Icon: Map       },
  { key: "schools",        label: "Schools",              Icon: School    },
  { key: "hei",            label: "Higher Institutions",  Icon: Building2 },
  { key: "target-groups",  label: "Target Groups",        Icon: Users     },
  { key: "themes",         label: "Themes",               Icon: Palette   },
] as const;

type Tab = (typeof TABS)[number]["key"];

export function ReferenceDataClient() {
  const [tab, setTab] = useState<Tab>("geography");

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">Reference Data</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Manage geography, schools, institutions, target groups, and competition themes.</p>
      </div>

      <div className="flex flex-wrap gap-1 border-b mb-6">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? "border-[#085782] text-[#085782]"
                : "border-transparent text-zinc-500 hover:text-zinc-800"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "geography"     && <GeographyTab />}
      {tab === "schools"       && <SchoolsTab />}
      {tab === "hei"           && <HEITab />}
      {tab === "target-groups" && <TargetGroupsTab />}
      {tab === "themes"        && <ThemesTab />}
    </div>
  );
}
