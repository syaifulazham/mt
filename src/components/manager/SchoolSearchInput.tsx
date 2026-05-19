"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Search, X, Check, Loader2, School } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type SchoolResult = {
  id: string;
  name: string;
  code: string;
  level: string;
  state: { name: string };
};

export type SelectedSchool = { id: string; name: string; code: string };

export function SchoolSearchInput({
  stateId = "",
  selected,
  onSelect,
}: {
  stateId?: string;
  selected: SelectedSchool | null;
  onSelect: (school: SelectedSchool | null) => void;
}) {
  const t = useTranslations("onboarding");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SchoolResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  async function handleSearch() {
    if (!query.trim()) return;
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ q: query, limit: "50" });
      if (stateId) params.set("stateId", stateId);
      const res = await fetch(`/api/v2/reference/schools?${params}`);
      const json = await res.json();
      setResults(json.data ?? []);
      setIsOpen(true);
    } finally {
      setIsLoading(false);
    }
  }

  function handleSelect(school: SchoolResult) {
    onSelect({ id: school.id, name: school.name, code: school.code });
    setIsOpen(false);
    setQuery("");
    setResults([]);
  }

  function handleClear() {
    onSelect(null);
    setQuery("");
    setResults([]);
  }

  return (
    <div className="space-y-2">
      {selected ? (
        <div
          className="flex h-10 w-full items-center justify-between rounded-md px-3 py-2 text-sm"
          style={{ border: "1px solid rgba(0,245,255,0.3)", background: "rgba(0,245,255,0.06)", color: "#fff" }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Check className="h-4 w-4 shrink-0" style={{ color: "#00F5FF" }} />
            <span className="truncate font-medium">{selected.name}</span>
            <span className="shrink-0 text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{selected.code}</span>
          </div>
          <button
            type="button"
            onClick={handleClear}
            title={t("schoolClearSelection")}
            className="ml-2 shrink-0 transition-colors"
            style={{ color: "rgba(255,255,255,0.4)" }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleSearch(); } }}
            placeholder={t("schoolSearchPlaceholder")}
            autoComplete="off"
            className="flex h-10 w-full rounded-md px-3 py-2 text-sm focus:outline-none"
            style={{
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.1)",
              color: "#fff",
              backdropFilter: "blur(4px)",
            }}
          />
          <button
            type="button"
            onClick={handleSearch}
            disabled={isLoading || !query.trim()}
            className="shrink-0 flex items-center gap-1.5 rounded-md px-4 text-sm font-semibold uppercase tracking-wider transition-all disabled:opacity-40"
            style={{
              background: "transparent",
              border: "1px solid rgba(0,245,255,0.5)",
              color: "#00F5FF",
              letterSpacing: "0.1em",
              clipPath: "polygon(6px 0%, 100% 0%, calc(100% - 6px) 100%, 0% 100%)",
              whiteSpace: "nowrap",
            }}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4" />
            )}
            {t("schoolSearchButton")}
          </button>
        </div>
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t("schoolSearchResultsTitle")}</DialogTitle>
            <DialogDescription>
              {results.length > 0 ? t("schoolSelectPrompt") : t("schoolNoResults")}
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 my-4 space-y-1 px-6">
            {results.map((school) => (
              <button
                key={school.id}
                type="button"
                onClick={() => handleSelect(school)}
                className="w-full text-left p-3 rounded-lg border hover:bg-zinc-50 transition-colors flex items-start gap-3"
              >
                <div className="h-8 w-8 flex items-center justify-center rounded-full bg-blue-50 text-blue-600 shrink-0 mt-0.5">
                  <School className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium leading-tight">{school.name}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {school.code} · {school.state.name} · <span className="capitalize">{school.level.toLowerCase()}</span>
                  </p>
                </div>
              </button>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              {t("schoolCloseButton")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
