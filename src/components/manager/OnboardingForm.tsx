"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Label } from "@/components/ui/label";
import { SchoolSearchInput, type SelectedSchool } from "./SchoolSearchInput";
import { HigherInstitutionSearchInput, type SelectedHI } from "./HigherInstitutionSearchInput";
import { CheckCircle, Clock } from "lucide-react";

type CountryOption = { id: string; name: string; codeIso2: string };

type SubmitResult =
  | { type: "joined" }
  | { type: "pending"; contingentName: string }
  | { type: "alreadyMember"; status: string };

export function OnboardingForm() {
  const t = useTranslations("onboarding");
  const router = useRouter();

  const [institutionType, setInstitutionType] = useState<
    "SCHOOL" | "HIGHER" | "INDEPENDENT" | "INTERNATIONAL"
  >("SCHOOL");

  const [selectedSchool, setSelectedSchool] = useState<SelectedSchool | null>(null);
  const [selectedHI,     setSelectedHI]     = useState<SelectedHI | null>(null);
  const [groupName,      setGroupName]       = useState("");
  const [countryId,      setCountryId]       = useState("");
  const [countries,      setCountries]       = useState<CountryOption[]>([]);

  const [phone,   setPhone]   = useState("");
  const [idType,  setIdType]  = useState<"IC" | "PASSPORT">("IC");
  const [idNumber, setIdNumber] = useState("");
  const [error,   setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState<SubmitResult | null>(null);

  // Reset institution-specific fields when type changes
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setSelectedSchool(null);
    setSelectedHI(null);
    setGroupName("");
    setCountryId("");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [institutionType]);

  // Load countries list once when INTERNATIONAL is selected
  useEffect(() => {
    if (institutionType !== "INTERNATIONAL" || countries.length > 0) return;
    fetch("/api/v2/reference/countries")
      .then(r => r.json())
      .then(j => setCountries(j.data ?? []));
  }, [institutionType, countries.length]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (institutionType === "SCHOOL" && !selectedSchool) {
      setError(t("errorSelectSchool")); return;
    }
    if (institutionType === "HIGHER" && !selectedHI) {
      setError(t("errorSelectInstitution")); return;
    }
    if (institutionType === "INDEPENDENT" && !groupName.trim()) {
      setError("Please enter your group name."); return;
    }
    if (institutionType === "INTERNATIONAL" && !countryId) {
      setError("Please select a country."); return;
    }

    setError("");
    setLoading(true);

    const res = await fetch("/api/v2/manager/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        institutionType,
        schoolId:            institutionType === "SCHOOL"        ? selectedSchool?.id : undefined,
        higherInstitutionId: institutionType === "HIGHER"        ? selectedHI?.id     : undefined,
        groupName:           institutionType === "INDEPENDENT"   ? groupName          : undefined,
        countryId:           institutionType === "INTERNATIONAL" ? countryId          : undefined,
        phone,
        idType,
        idNumber,
        nationality: "MY",
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const j = await res.json();
      setError(j.error?.message ?? t("error"));
      return;
    }

    const j = await res.json();
    const data = j.data;

    if (data.requiresJoinRequest) {
      setResult({ type: "pending", contingentName: data.existingContingentName });
      return;
    }
    if (data.alreadyMember) {
      if (data.status === "PENDING") {
        setResult({ type: "pending", contingentName: "" });
      } else {
        setResult({ type: "alreadyMember", status: data.status });
      }
      return;
    }

    router.push("/manager/dashboard");
    router.refresh();
  }

  const inputCls =
    "flex h-10 w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-[#00F5FF]/60 backdrop-blur-sm";

  const selectCls =
    "flex h-10 w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#00F5FF]/60 backdrop-blur-sm [&>option]:bg-[#0a1628] [&>option]:text-white";

  // ── Post-submit states ────────────────────────────────────────────────────
  if (result?.type === "pending") {
    return (
      <div className="flex flex-col items-center gap-5 py-4 text-center">
        <Clock className="h-12 w-12" style={{ color: "#00F5FF" }} />
        <h2 style={{ fontFamily: "'Exo 2', sans-serif", fontWeight: 700, fontSize: "1.1rem", letterSpacing: "0.04em", color: "#fff" }}>
          {t("joinRequestSentTitle")}
        </h2>
        {result.contingentName && (
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "0.9rem" }}>
            {t("joinRequestSentFor", { name: result.contingentName })}
          </p>
        )}
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.82rem", lineHeight: 1.6 }}>
          {t("joinRequestSentDesc")}
        </p>
      </div>
    );
  }

  if (result?.type === "alreadyMember") {
    return (
      <div className="flex flex-col items-center gap-5 py-4 text-center">
        <CheckCircle className="h-12 w-12" style={{ color: "#00F5FF" }} />
        <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.9rem" }}>{t("alreadyMember")}</p>
        <button
          onClick={() => router.push("/manager/dashboard")}
          style={{
            background: "linear-gradient(135deg, #CC0001, #ff2244)",
            border: "none", color: "#fff",
            fontFamily: "inherit", fontWeight: 700,
            fontSize: "0.8rem", letterSpacing: "0.15em", textTransform: "uppercase",
            padding: "12px 32px", cursor: "pointer",
            clipPath: "polygon(8px 0%, 100% 0%, calc(100% - 8px) 100%, 0% 100%)",
          }}
        >
          {t("goToDashboard")}
        </button>
      </div>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* Institution type */}
      <div className="space-y-2">
        <Label className="text-white/70 text-xs uppercase tracking-widest">{t("iRepresent")}</Label>
        <div className="grid grid-cols-2 gap-2">
          {(["SCHOOL", "HIGHER", "INDEPENDENT", "INTERNATIONAL"] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setInstitutionType(type)}
              className={`rounded-md border px-3 py-2.5 text-sm text-left transition-all ${
                institutionType === type
                  ? "border-[#00F5FF] bg-[#00F5FF]/10 text-[#00F5FF] font-medium"
                  : "border-white/15 text-white/60 hover:border-white/30 hover:text-white/80"
              }`}
            >
              {t(`types.${type}`)}
            </button>
          ))}
        </div>
      </div>

      {/* School search */}
      {institutionType === "SCHOOL" && (
        <div className="space-y-1.5">
          <Label className="text-white/70 text-xs uppercase tracking-widest">
            {t("schoolLabel")} <span className="text-[#00F5FF]">{t("required")}</span>
          </Label>
          <SchoolSearchInput selected={selectedSchool} onSelect={setSelectedSchool} />
        </div>
      )}

      {/* Higher institution search */}
      {institutionType === "HIGHER" && (
        <div className="space-y-1.5">
          <Label className="text-white/70 text-xs uppercase tracking-widest">
            {t("institutionLabel")} <span className="text-[#00F5FF]">{t("required")}</span>
          </Label>
          <HigherInstitutionSearchInput selected={selectedHI} onSelect={setSelectedHI} />
        </div>
      )}

      {/* Independent group name */}
      {institutionType === "INDEPENDENT" && (
        <div className="space-y-1.5">
          <Label className="text-white/70 text-xs uppercase tracking-widest">
            Group Name <span className="text-[#00F5FF]">{t("required")}</span>
          </Label>
          <input
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Enter your group or team name"
            required
            className={inputCls}
          />
        </div>
      )}

      {/* International — country selector */}
      {institutionType === "INTERNATIONAL" && (
        <div className="space-y-1.5">
          <Label className="text-white/70 text-xs uppercase tracking-widest">
            Country <span className="text-[#00F5FF]">{t("required")}</span>
          </Label>
          <select
            className={selectCls}
            value={countryId}
            onChange={(e) => setCountryId(e.target.value)}
            required
          >
            <option value="">Select country…</option>
            {countries.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Phone */}
      <div className="space-y-1.5">
        <Label className="text-white/70 text-xs uppercase tracking-widest">
          {t("phoneLabel")} <span className="text-[#00F5FF]">{t("required")}</span>
        </Label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="0123456789"
          required
          className={inputCls}
        />
      </div>

      {/* ID */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-white/70 text-xs uppercase tracking-widest">{t("idTypeLabel")}</Label>
          <select
            className={selectCls}
            value={idType}
            onChange={(e) => setIdType(e.target.value as "IC" | "PASSPORT")}
          >
            <option value="IC">{t("idTypes.IC")}</option>
            <option value="PASSPORT">{t("idTypes.PASSPORT")}</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-white/70 text-xs uppercase tracking-widest">
            {t("idNumberLabel")} <span className="text-[#00F5FF]">{t("required")}</span>
          </Label>
          <input
            value={idNumber}
            onChange={(e) => setIdNumber(e.target.value)}
            placeholder={idType === "IC" ? "000000-00-0000" : "A12345678"}
            required
            className={inputCls}
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-400 bg-red-900/20 border border-red-500/30 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        style={{
          width: "100%",
          background: loading ? "rgba(0,245,255,0.1)" : "linear-gradient(135deg, #CC0001, #ff2244)",
          border: "none", color: "#fff",
          fontFamily: "inherit", fontWeight: 700,
          fontSize: "0.85rem", letterSpacing: "0.15em", textTransform: "uppercase",
          padding: "14px 0",
          cursor: loading ? "not-allowed" : "pointer",
          clipPath: "polygon(10px 0%, 100% 0%, calc(100% - 10px) 100%, 0% 100%)",
          boxShadow: loading ? "none" : "0 0 24px rgba(204,0,1,0.35)",
          transition: "all 0.2s",
          marginTop: 4,
        }}
      >
        {loading ? t("saving") : t("saveButton")}
      </button>
    </form>
  );
}
