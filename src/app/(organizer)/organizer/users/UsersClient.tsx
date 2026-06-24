"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Check, X, KeyRound, Copy, CheckCheck, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
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

// ── Renew Password Dialog ─────────────────────────────────────────────────────

function genConfirmCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function RenewPasswordDialog({
  user,
  confirmCode,
  onClose,
  onRenewed,
}: {
  user: User | null;
  confirmCode: string;
  onClose: () => void;
  onRenewed: (name: string, email: string, password: string) => void;
}) {
  const [codeInput, setCodeInput] = useState("");
  const [renewing,  setRenewing]  = useState(false);
  const [error,     setError]     = useState("");

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setCodeInput(""); setError(""); }, [user]);

  async function handleRenew() {
    if (!user || codeInput !== confirmCode) return;
    setRenewing(true); setError("");
    try {
      const res = await fetch(`/api/v2/auth/organizer/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ renewPassword: true }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error?.message ?? "Failed to renew password");
      onRenewed(user.name, user.email, j.data.newPassword);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setRenewing(false);
    }
  }

  return (
    <Dialog open={!!user} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-orange-500" />
            Renew Password
          </DialogTitle>
          <DialogDescription>
            A new 8-character password will be generated for{" "}
            <strong>{user?.name}</strong>. They will be required to change it
            on next login.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-center space-y-1">
            <p className="text-xs text-zinc-500">Type this code to confirm</p>
            <p className="text-2xl font-mono font-bold tracking-[0.3em] text-orange-600">
              {confirmCode}
            </p>
          </div>
          <Input
            type="text"
            className="text-center font-mono tracking-[0.3em] uppercase text-lg h-11"
            placeholder="_ _ _ _ _"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase().slice(0, 5))}
            maxLength={5}
            autoFocus
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={renewing}>Cancel</Button>
          <Button
            onClick={handleRenew}
            disabled={codeInput !== confirmCode || renewing}
            className="bg-orange-600 hover:bg-orange-700 text-white"
          >
            {renewing
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Renewing…</>
              : "Renew Password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main UsersClient ──────────────────────────────────────────────────────────

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

  // Password renewal
  const [renewTarget,  setRenewTarget]  = useState<User | null>(null);
  const [renewCode,    setRenewCode]    = useState("");
  const [renewedUser,  setRenewedUser]  = useState<{ name: string; email: string; newPassword: string } | null>(null);
  const [renewCopied,  setRenewCopied]  = useState(false);

  function openRenewDialog(user: User) {
    setRenewTarget(user);
    setRenewCode(genConfirmCode());
    setRenewedUser(null);
  }

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

      {/* Renewed password banner */}
      {renewedUser && (
        <div className="rounded-xl border border-orange-200 bg-orange-50 p-5 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-semibold text-orange-800">
                Password renewed — share this with {renewedUser.name}
              </p>
              <p className="text-xs text-orange-700 mt-0.5">
                {renewedUser.email} · This password will not be shown again.
              </p>
            </div>
            <button onClick={() => setRenewedUser(null)} className="text-orange-600 hover:text-orange-900 text-xs">
              Dismiss
            </button>
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-md bg-white border border-orange-200 px-4 py-2.5 text-base font-mono tracking-widest text-orange-900 select-all">
              {renewedUser.newPassword}
            </code>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 border-orange-300"
              onClick={() => {
                navigator.clipboard.writeText(renewedUser.newPassword);
                setRenewCopied(true);
                setTimeout(() => setRenewCopied(false), 2000);
              }}
            >
              {renewCopied ? <CheckCheck className="h-4 w-4 text-orange-600" /> : <Copy className="h-4 w-4" />}
              {renewCopied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="text-xs text-orange-700">
            The user will be forced to change this password on next login.
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
                  <div className="flex items-center gap-3">
                    {user.id !== currentUserId && (
                      <button
                        onClick={() => toggleActive(user.id, user.isActive)}
                        className="text-xs text-zinc-500 hover:text-zinc-900 underline"
                      >
                        {user.isActive ? "Deactivate" : "Activate"}
                      </button>
                    )}
                    {currentRole === "SUPER_ADMIN" && user.id !== currentUserId && (
                      <button
                        onClick={() => openRenewDialog(user)}
                        className="text-xs text-orange-500 hover:text-orange-800 underline"
                      >
                        Renew Pwd
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <RenewPasswordDialog
        user={renewTarget}
        confirmCode={renewCode}
        onClose={() => setRenewTarget(null)}
        onRenewed={(name, email, password) => {
          setRenewedUser({ name, email, newPassword: password });
          setUsers((prev) => prev.map((u) => u.id === renewTarget?.id ? { ...u, forcePasswordChange: true } : u));
          router.refresh();
        }}
      />
    </div>
  );
}
