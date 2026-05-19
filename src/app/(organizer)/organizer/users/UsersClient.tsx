"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Check, X, KeyRound, Copy, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { OrganizerRole } from "@/types";

type User = {
  id: string;
  email: string;
  name: string;
  role: OrganizerRole;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  forcePasswordChange: boolean;
};

const ROLE_COLORS: Record<OrganizerRole, "default" | "secondary" | "outline" | "destructive"> = {
  SUPER_ADMIN: "default",
  ADMIN: "secondary",
  OPERATOR: "outline",
  PARTICIPANTS_MANAGER: "outline",
  JUDGE_COORDINATOR: "outline",
  VIEWER: "outline",
};

export function UsersClient({
  users: initialUsers,
  currentUserId,
  currentRole,
}: {
  users: User[];
  currentUserId: string;
  currentRole: OrganizerRole;
}) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "OPERATOR" as OrganizerRole });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  // Shown once after creation
  const [createdUser, setCreatedUser] = useState<{ name: string; email: string; temporaryPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const availableRoles: OrganizerRole[] = currentRole === "SUPER_ADMIN"
    ? ["SUPER_ADMIN", "ADMIN", "OPERATOR", "PARTICIPANTS_MANAGER", "JUDGE_COORDINATOR", "VIEWER"]
    : ["OPERATOR", "PARTICIPANTS_MANAGER", "JUDGE_COORDINATOR", "VIEWER"];

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    setSaving(true);

    const res = await fetch("/api/v2/auth/organizer/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const json = await res.json();
    setSaving(false);

    if (!res.ok) {
      setFormError(json.error?.message ?? "Failed to create user.");
      return;
    }

    setShowForm(false);
    setForm({ name: "", email: "", role: "OPERATOR" });
    setCreatedUser({
      name: json.data.name,
      email: json.data.email,
      temporaryPassword: json.data.temporaryPassword,
    });
    setCopied(false);
    router.refresh();
  }

  async function toggleActive(userId: string, current: boolean) {
    await fetch(`/api/v2/auth/organizer/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !current }),
    });
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, isActive: !current } : u))
    );
  }

  function copyPassword() {
    if (!createdUser) return;
    navigator.clipboard.writeText(createdUser.temporaryPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Staff Accounts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organizer staff only — teachers and managers register themselves via the public portal
          </p>
        </div>
        {!showForm && (
          <Button onClick={() => { setShowForm(true); setCreatedUser(null); }}>
            <UserPlus className="h-4 w-4" />
            Add User
          </Button>
        )}
      </div>

      {/* Generated password banner — shown once after creation */}
      {createdUser && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-5 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-green-800">
                User created — share this password with {createdUser.name}
              </p>
              <p className="text-xs text-green-700 mt-0.5">
                {createdUser.email} · This password will not be shown again.
              </p>
            </div>
            <button
              onClick={() => setCreatedUser(null)}
              className="text-green-600 hover:text-green-900 text-xs"
            >
              Dismiss
            </button>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md bg-white border border-green-200 px-4 py-2.5 text-base font-mono tracking-widest text-green-900 select-all">
              {createdUser.temporaryPassword}
            </code>
            <Button variant="outline" size="sm" onClick={copyPassword} className="shrink-0 border-green-300">
              {copied ? <CheckCheck className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="text-xs text-green-700">
            The user will be forced to change this password on first login.
          </p>
        </div>
      )}

      {/* Create user form */}
      {showForm && (
        <div className="rounded-xl border bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-base font-semibold">New User</h2>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label>Full name</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((d) => ({ ...d, name: e.target.value }))}
                  placeholder="Ahmad bin Ali"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((d) => ({ ...d, email: e.target.value }))}
                  placeholder="ahmad@techlympics.my"
                  required
                />
              </div>
              <div className="space-y-1">
                <Label>Role</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.role}
                  onChange={(e) => setForm((d) => ({ ...d, role: e.target.value as OrganizerRole }))}
                >
                  {availableRoles.map((r) => (
                    <option key={r} value={r}>{r.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              A random temporary password will be generated. You copy and share it manually.
            </p>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Creating…" : "Create user"}
              </Button>
              <Button type="button" variant="outline" onClick={() => { setShowForm(false); setFormError(""); }}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* Users table */}
      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-zinc-50">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-zinc-600">Name</th>
              <th className="px-4 py-3 text-left font-medium text-zinc-600">Email</th>
              <th className="px-4 py-3 text-left font-medium text-zinc-600">Role</th>
              <th className="px-4 py-3 text-left font-medium text-zinc-600">Status</th>
              <th className="px-4 py-3 text-left font-medium text-zinc-600">Last login</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-zinc-50/50">
                <td className="px-4 py-3 font-medium">{user.name}</td>
                <td className="px-4 py-3 text-zinc-600">{user.email}</td>
                <td className="px-4 py-3">
                  <Badge variant={ROLE_COLORS[user.role]}>{user.role.replace(/_/g, " ")}</Badge>
                </td>
                <td className="px-4 py-3">
                  {user.forcePasswordChange ? (
                    <span className="flex items-center gap-1 text-yellow-600 text-xs">
                      <KeyRound className="h-3 w-3" /> Must change password
                    </span>
                  ) : user.isActive ? (
                    <span className="flex items-center gap-1 text-green-600 text-xs">
                      <Check className="h-3 w-3" /> Active
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-zinc-400 text-xs">
                      <X className="h-3 w-3" /> Inactive
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-zinc-500 text-xs">
                  {user.lastLoginAt
                    ? new Date(user.lastLoginAt).toLocaleDateString("en-MY")
                    : "Never"}
                </td>
                <td className="px-4 py-3">
                  {user.id !== currentUserId && (
                    <button
                      onClick={() => toggleActive(user.id, user.isActive)}
                      className="text-xs text-zinc-500 hover:text-zinc-900 underline"
                    >
                      {user.isActive ? "Deactivate" : "Activate"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
