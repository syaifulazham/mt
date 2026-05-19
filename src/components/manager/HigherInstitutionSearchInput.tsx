"use client";

import { useState } from "react";
import { Search, X, Check, Loader2, Building2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type HiResult = {
  id: string;
  name: string;
  code: string | null;
  state: { name: string } | null;
};

export type SelectedHI = { id: string; name: string; code: string | null };

export function HigherInstitutionSearchInput({
  selected,
  onSelect,
}: {
  selected: SelectedHI | null;
  onSelect: (hi: SelectedHI | null) => void;
}) {
  const [query,    setQuery]    = useState("");
  const [results,  setResults]  = useState<HiResult[]>([]);
  const [isLoading, setLoading] = useState(false);
  const [isOpen,   setIsOpen]   = useState(false);

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res  = await fetch(`/api/v2/reference/higher-institutions?q=${encodeURIComponent(query)}&limit=50`);
      const json = await res.json();
      setResults(json.data ?? []);
      setIsOpen(true);
    } finally {
      setLoading(false);
    }
  }

  function handleSelect(hi: HiResult) {
    onSelect({ id: hi.id, name: hi.name, code: hi.code });
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
            {selected.code && (
              <span className="shrink-0 text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{selected.code}</span>
            )}
          </div>
          <button
            type="button"
            onClick={handleClear}
            title="Clear selection"
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
            placeholder="Type institution name or code…"
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
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Search
          </button>
        </div>
      )}

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Search Results</DialogTitle>
            <DialogDescription>
              {results.length > 0 ? "Select your institution" : "No institutions found. Try a different keyword."}
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 my-4 space-y-1 px-6">
            {results.map((hi) => (
              <button
                key={hi.id}
                type="button"
                onClick={() => handleSelect(hi)}
                className="w-full text-left p-3 rounded-lg border hover:bg-zinc-50 transition-colors flex items-start gap-3"
              >
                <div className="h-8 w-8 flex items-center justify-center rounded-full bg-violet-50 text-violet-600 shrink-0 mt-0.5">
                  <Building2 className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium leading-tight">{hi.name}</p>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {[hi.code, hi.state?.name].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </button>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
