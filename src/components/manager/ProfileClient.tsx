"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, User, CreditCard, Phone, MapPin } from "lucide-react";

type Profile = {
  id: string;
  name: string;
  email: string;
  idType: "IC" | "PASSPORT" | null;
  idNumber: string | null;
  phone: string | null;
  address: string | null;
  nationality: string | null;
};

type Props = { profile: Profile };

export function ProfileClient({ profile }: Props) {
  const [name,     setName]     = useState(profile.name ?? "");
  const [idType,   setIdType]   = useState<"IC" | "PASSPORT">(profile.idType ?? "IC");
  const [idNumber, setIdNumber] = useState(profile.idNumber ?? "");
  const [phone,    setPhone]    = useState(profile.phone ?? "");
  const [address,  setAddress]  = useState(profile.address ?? "");

  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);
  const [error,   setError]   = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError("");

    try {
      const res = await fetch("/api/v2/manager/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, idType, idNumber, phone, address }),
      });
      if (!res.ok) throw new Error("Gagal menyimpan profil");
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Ralat semasa menyimpan. Sila cuba lagi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl mx-auto py-8 px-4">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#085782]">Profil Saya</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Maklumat ini digunakan untuk sijil penyertaan. Pastikan nama dan nombor ID adalah tepat.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Email (read-only) */}
        <div className="rounded-lg border bg-muted/40 px-4 py-3">
          <p className="text-xs text-muted-foreground mb-0.5">Emel</p>
          <p className="text-sm font-medium">{profile.email}</p>
        </div>

        {/* Name */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-sm font-medium" htmlFor="name">
            <User className="h-4 w-4 text-[#085782]" />
            Nama Penuh <span className="text-rose-500">*</span>
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            placeholder="Seperti dalam kad pengenalan"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[#085782]/40"
          />
          <p className="text-xs text-muted-foreground">Nama yang akan tercetak pada sijil</p>
        </div>

        {/* ID Type + Number */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-sm font-medium">
            <CreditCard className="h-4 w-4 text-[#085782]" />
            Jenis & Nombor Pengenalan <span className="text-rose-500">*</span>
          </label>
          <div className="flex gap-2">
            <select
              value={idType}
              onChange={e => setIdType(e.target.value as "IC" | "PASSPORT")}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[#085782]/40 w-36 shrink-0"
            >
              <option value="IC">Kad Pengenalan</option>
              <option value="PASSPORT">Pasport</option>
            </select>
            <input
              type="text"
              value={idNumber}
              onChange={e => setIdNumber(e.target.value)}
              required
              placeholder={idType === "IC" ? "e.g. 900101-14-1234" : "e.g. A12345678"}
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[#085782]/40"
            />
          </div>
        </div>

        {/* Phone */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-sm font-medium" htmlFor="phone">
            <Phone className="h-4 w-4 text-[#085782]" />
            Nombor Telefon
          </label>
          <input
            id="phone"
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="e.g. 0123456789"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[#085782]/40"
          />
        </div>

        {/* Address */}
        <div className="space-y-1.5">
          <label className="flex items-center gap-1.5 text-sm font-medium" htmlFor="address">
            <MapPin className="h-4 w-4 text-[#085782]" />
            Alamat
          </label>
          <textarea
            id="address"
            value={address}
            onChange={e => setAddress(e.target.value)}
            rows={3}
            placeholder="Alamat penuh"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[#085782]/40 resize-none"
          />
        </div>

        {error && (
          <p className="text-sm text-rose-600 bg-rose-50 rounded-md px-3 py-2">{error}</p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 rounded-md bg-[#085782] text-white text-sm font-medium px-4 py-2.5 hover:bg-[#085782]/90 disabled:opacity-60 transition-colors"
        >
          {saving ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Menyimpan…</>
          ) : saved ? (
            <><CheckCircle2 className="h-4 w-4" /> Disimpan!</>
          ) : (
            "Simpan Profil"
          )}
        </button>
      </form>
    </div>
  );
}
