"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  FolderOpen, FileText, Plus, Upload, Trash2, Save,
  RefreshCw, ChevronRight, ChevronDown, Eye, Edit3, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { OrganizerRole } from "@/types";

// ── Types ──────────────────────────────────────────────────────────────────────

type KbItem = {
  id: string;
  path: string;
  title: string;
  entityType: string | null;
  entityId: string | null;
  updatedAt: string;
};

type KbDetail = KbItem & { content: string };

type FolderNode = { name: string; path: string; files: KbItem[]; open: boolean };

const WRITE_ROLES = ["SUPER_ADMIN", "ADMIN"];

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildTree(items: KbItem[]): FolderNode[] {
  const map = new Map<string, FolderNode>();
  for (const item of items) {
    const parts = item.path.split("/");
    const folder = parts.length > 1 ? parts[0] : "general";
    if (!map.has(folder)) map.set(folder, { name: folder, path: folder, files: [], open: true });
    map.get(folder)!.files.push(item);
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1)  return "baru sahaja";
  if (min < 60) return `${min} min lalu`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

// ── Markdown preview ───────────────────────────────────────────────────────────

function stripFrontmatter(md: string) {
  return md.replace(/^---[\s\S]*?---\n?/, "").trimStart();
}

function MdPreview({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1 className="text-2xl font-bold text-zinc-900 mt-6 mb-3 pb-2 border-b border-zinc-200">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-lg font-semibold text-zinc-800 mt-5 mb-2">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-base font-semibold text-zinc-700 mt-4 mb-1">{children}</h3>
        ),
        p: ({ children }) => (
          <p className="text-sm text-zinc-700 leading-relaxed mb-3">{children}</p>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-zinc-900">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="italic text-zinc-500">{children}</em>
        ),
        code: ({ children, className }) => {
          const isBlock = className?.startsWith("language-");
          return isBlock
            ? <code className="block bg-zinc-100 rounded-md px-4 py-3 text-xs font-mono text-zinc-700 overflow-x-auto mb-3">{children}</code>
            : <code className="bg-zinc-100 text-zinc-700 px-1 py-0.5 rounded text-xs font-mono">{children}</code>;
        },
        table: ({ children }) => (
          <div className="overflow-x-auto mb-4">
            <table className="w-full text-sm border-collapse border border-zinc-200 rounded-lg overflow-hidden">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-zinc-50">{children}</thead>
        ),
        th: ({ children }) => (
          <th className="px-4 py-2.5 text-left text-xs font-semibold text-zinc-600 border border-zinc-200 bg-zinc-50">{children}</th>
        ),
        td: ({ children }) => (
          <td className="px-4 py-2 text-sm text-zinc-700 border border-zinc-200">{children}</td>
        ),
        tr: ({ children }) => (
          <tr className="even:bg-zinc-50/50 hover:bg-blue-50/30 transition-colors">{children}</tr>
        ),
        ul: ({ children }) => (
          <ul className="list-disc pl-5 mb-3 space-y-1">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal pl-5 mb-3 space-y-1">{children}</ol>
        ),
        li: ({ children }) => (
          <li className="text-sm text-zinc-700">{children}</li>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-violet-200 pl-4 my-3 text-zinc-500 italic">{children}</blockquote>
        ),
        hr: () => <hr className="border-zinc-200 my-5" />,
        a: ({ href, children }) => (
          <a href={href} className="text-blue-600 underline hover:text-blue-800" target="_blank" rel="noreferrer">{children}</a>
        ),
      }}
    >
      {stripFrontmatter(content)}
    </ReactMarkdown>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function KnowledgeBaseClient({ role }: { role: OrganizerRole }) {
  const canWrite = WRITE_ROLES.includes(role);

  const [items,    setItems]    = useState<KbItem[]>([]);
  const [folders,  setFolders]  = useState<FolderNode[]>([]);
  const [selected, setSelected] = useState<KbDetail | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [mode,     setMode]     = useState<"view" | "edit">("view");
  const [editTitle, setEditTitle] = useState("");
  const [editPath,  setEditPath]  = useState("");
  const [editContent, setEditContent] = useState("");
  const [newOpen,  setNewOpen]  = useState(false);
  const [newPath,  setNewPath]  = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [err,      setErr]      = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/v2/organizer/knowledge-base");
    const j   = await res.json();
    const list: KbItem[] = j.items ?? [];
    setItems(list);
    setFolders(buildTree(list));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function select(item: KbItem) {
    const res = await fetch(`/api/v2/organizer/knowledge-base/${item.id}`);
    const j   = await res.json();
    const detail: KbDetail = j.item;
    setSelected(detail);
    setEditTitle(detail.title);
    setEditPath(detail.path);
    setEditContent(detail.content);
    setMode("view");
    setErr("");
  }

  async function save() {
    if (!selected) return;
    setSaving(true); setErr("");
    try {
      const res = await fetch(`/api/v2/organizer/knowledge-base/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle, path: editPath, content: editContent }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const j = await res.json();
      setSelected(j.item);
      setMode("view");
      await load();
    } catch { setErr("Gagal menyimpan."); }
    finally { setSaving(false); }
  }

  async function del() {
    if (!selected || !confirm(`Padam "${selected.title}"?`)) return;
    await fetch(`/api/v2/organizer/knowledge-base/${selected.id}`, { method: "DELETE" });
    setSelected(null);
    await load();
  }

  async function create() {
    if (!newPath.trim() || !newTitle.trim()) return;
    setSaving(true); setErr("");
    try {
      const res = await fetch("/api/v2/organizer/knowledge-base", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: newPath.trim(), title: newTitle.trim(), content: `# ${newTitle.trim()}\n\n` }),
      });
      if (!res.ok) throw new Error(await res.text());
      const j = await res.json();
      setNewOpen(false); setNewPath(""); setNewTitle("");
      await load();
      await select(j.item);
      setMode("edit");
    } catch (e) { setErr(String(e)); }
    finally { setSaving(false); }
  }

  function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const text = reader.result as string;
      const titleMatch = text.match(/^# (.+)$/m);
      const title = titleMatch?.[1] ?? file.name.replace(/\.md$/, "");
      const path  = file.name.replace(/\.md$/, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
      setSaving(true);
      try {
        const res = await fetch("/api/v2/organizer/knowledge-base", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path, title, content: text }),
        });
        if (!res.ok) {
          // try update if path exists — fetch list to find by path
          const list = await (await fetch("/api/v2/organizer/knowledge-base")).json();
          const existing = (list.items as KbItem[]).find(i => i.path === path);
          if (existing) {
            await fetch(`/api/v2/organizer/knowledge-base/${existing.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title, content: text }),
            });
          }
        }
        await load();
      } finally { setSaving(false); e.target.value = ""; }
    };
    reader.readAsText(file);
  }

  function toggleFolder(name: string) {
    setFolders(prev => prev.map(f => f.name === name ? { ...f, open: !f.open } : f));
  }

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left: File Tree ─────────────────────────────────── */}
      <aside className="w-64 shrink-0 flex flex-col border-r bg-white">
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <span className="text-sm font-semibold flex-1">Knowledge Base</span>
          {canWrite && (
            <div className="flex gap-1">
              <button
                onClick={() => setNewOpen(v => !v)}
                title="Fail baharu"
                className="h-6 w-6 flex items-center justify-center rounded hover:bg-zinc-100 text-zinc-500"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                title="Muat naik .md"
                className="h-6 w-6 flex items-center justify-center rounded hover:bg-zinc-100 text-zinc-500"
              >
                <Upload className="h-3.5 w-3.5" />
              </button>
              <input ref={fileRef} type="file" accept=".md" className="hidden" onChange={handleUpload} />
            </div>
          )}
        </div>

        {/* New file form */}
        {newOpen && (
          <div className="px-4 py-3 border-b space-y-2 bg-zinc-50">
            <div>
              <Label className="text-[10px]">Laluan (cth: events/nama-acara)</Label>
              <Input
                value={newPath} onChange={e => setNewPath(e.target.value)}
                placeholder="folder/nama-fail" className="mt-1 h-7 text-xs"
              />
            </div>
            <div>
              <Label className="text-[10px]">Tajuk</Label>
              <Input
                value={newTitle} onChange={e => setNewTitle(e.target.value)}
                placeholder="Tajuk fail" className="mt-1 h-7 text-xs"
              />
            </div>
            {err && <p className="text-[10px] text-red-500">{err}</p>}
            <div className="flex gap-1.5">
              <Button size="sm" onClick={create} disabled={saving} className="h-7 text-xs px-3">Cipta</Button>
              <Button size="sm" variant="outline" onClick={() => { setNewOpen(false); setErr(""); }} className="h-7 text-xs px-3">Batal</Button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto py-1">
          {loading ? (
            <p className="text-xs text-zinc-400 px-4 py-3">Memuatkan...</p>
          ) : items.length === 0 ? (
            <p className="text-xs text-zinc-400 px-4 py-3">Tiada fail. Mula dengan + atau muat naik.</p>
          ) : (
            folders.map(folder => (
              <div key={folder.name}>
                <button
                  onClick={() => toggleFolder(folder.name)}
                  className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-50"
                >
                  {folder.open
                    ? <ChevronDown className="h-3 w-3 shrink-0" />
                    : <ChevronRight className="h-3 w-3 shrink-0" />}
                  <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                  <span className="uppercase tracking-wide">{folder.name}</span>
                  <span className="ml-auto text-zinc-300">{folder.files.length}</span>
                </button>
                {folder.open && folder.files.map(file => (
                  <button
                    key={file.id}
                    onClick={() => select(file)}
                    className={cn(
                      "w-full flex items-center gap-2 pl-7 pr-3 py-1.5 text-xs transition-colors",
                      selected?.id === file.id
                        ? "bg-violet-50 text-violet-700 font-medium"
                        : "text-zinc-600 hover:bg-zinc-50"
                    )}
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                    <span className="flex-1 truncate text-left">{file.title}</span>
                    {file.entityType && (
                      <span className="text-[9px] text-zinc-300 uppercase shrink-0">{file.entityType}</span>
                    )}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>

        <div className="border-t px-4 py-2">
          <button onClick={load} className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-600">
            <RefreshCw className="h-3 w-3" /> Muat semula
          </button>
        </div>
      </aside>

      {/* ── Right: Editor / Preview ──────────────────────────── */}
      <main className="flex-1 flex flex-col overflow-hidden bg-zinc-50">
        {!selected ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-400">
            <FileText className="h-12 w-12 text-zinc-200" />
            <p className="text-sm">Pilih fail di sebelah kiri atau cipta yang baharu.</p>
          </div>
        ) : (
          <>
            {/* Toolbar */}
            <div className="shrink-0 bg-white border-b px-5 py-2.5 flex items-center gap-2">
              <div className="flex-1 min-w-0">
                {mode === "edit" ? (
                  <Input
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    className="h-8 font-semibold"
                  />
                ) : (
                  <h2 className="font-semibold text-sm truncate">{selected.title}</h2>
                )}
                <p className="text-[10px] text-zinc-400 mt-0.5">
                  {mode === "edit" ? (
                    <Input
                      value={editPath}
                      onChange={e => setEditPath(e.target.value)}
                      className="h-6 text-[10px] font-mono mt-1"
                    />
                  ) : (
                    <>
                      <span className="font-mono">{selected.path}</span>
                      {selected.entityType && (
                        <span className="ml-2 px-1.5 py-0.5 rounded bg-violet-50 text-violet-500 text-[9px] uppercase">
                          {selected.entityType}
                        </span>
                      )}
                      <span className="ml-2 text-zinc-300">{relTime(selected.updatedAt)}</span>
                    </>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {mode === "view" ? (
                  <>
                    {canWrite && (
                      <Button size="sm" variant="outline" onClick={() => setMode("edit")} className="h-7 text-xs gap-1.5">
                        <Edit3 className="h-3 w-3" /> Edit
                      </Button>
                    )}
                    {canWrite && (
                      <Button size="sm" variant="outline" onClick={del}
                        className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50 gap-1.5">
                        <Trash2 className="h-3 w-3" /> Padam
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <Button size="sm" onClick={save} disabled={saving} className="h-7 text-xs gap-1.5">
                      <Save className="h-3 w-3" /> {saving ? "Menyimpan..." : "Simpan"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setMode("view"); setErr(""); }} className="h-7 text-xs gap-1.5">
                      <X className="h-3 w-3" /> Batal
                    </Button>
                  </>
                )}
              </div>
            </div>

            {err && <p className="text-xs text-red-500 px-5 py-1 bg-red-50 border-b">{err}</p>}

            {/* Content */}
            {mode === "edit" ? (
              <textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                className="flex-1 resize-none bg-white border-none outline-none font-mono text-xs p-5 leading-relaxed"
                placeholder="Tulis kandungan Markdown di sini..."
              />
            ) : (
              <div className="flex-1 overflow-y-auto px-8 py-6">
                <div className="max-w-3xl mx-auto">
                  {/* Frontmatter strip */}
                  {selected.entityType && (
                    <div className="flex items-center gap-2 mb-4 text-xs text-zinc-400 bg-zinc-100 rounded-lg px-3 py-2">
                      <Eye className="h-3.5 w-3.5" />
                      <span>Sumber: <strong>{selected.entityType}</strong></span>
                      <span className="font-mono text-zinc-300">{selected.entityId}</span>
                    </div>
                  )}
                  <MdPreview content={selected.content} />
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
