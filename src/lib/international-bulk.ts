import { GoogleGenerativeAI } from "@google/generative-ai";
import { ageFromBirthDate, eduLevelForAge, gradeForAge } from "@/lib/participantAge";

// Bulk registration of foreign participants (Penyertaan Antarabangsa): rows
// read from CSV / TSV / XLSX / pasted text are mapped to the participant form
// by their headers (English or Malay). When the headers can't be matched — or
// the organizer asks — Gemini reads the raw text instead. Either way the
// values are normalised here (dates, gender, level, grade) and then validated
// by parseForeignParticipant, exactly as the single-participant form is.

export const BULK_MAX_ROWS = 500;

/** The participant form, as plain values (before validation). */
export type BulkCandidate = {
  name: string; passport: string; birthDate: string; gender: string; eduLevel: string;
  classGrade: string; email: string; phoneNumber: string; ppki: boolean;
};
type Field = keyof BulkCandidate;

const HEADERS: Record<Field, string[]> = {
  name:        ["name", "full name", "fullname", "nama", "nama penuh", "participant", "peserta", "student", "student name", "nama peserta", "pelajar"],
  passport:    ["passport", "passport no", "passport number", "no passport", "no pasport", "pasport", "nombor pasport", "id", "id no", "document", "document no"],
  birthDate:   ["birth date", "birthdate", "date of birth", "dob", "tarikh lahir", "tarikh lahir (dd/mm/yyyy)", "born", "birthday"],
  gender:      ["gender", "sex", "jantina"],
  eduLevel:    ["level", "education level", "edu level", "tahap", "tahap pendidikan", "school level", "peringkat"],
  classGrade:  ["grade", "class", "year", "kelas", "darjah", "tingkatan", "darjah / tingkatan", "grade / class", "standard", "form"],
  email:       ["email", "e-mail", "emel", "e-mel", "email address"],
  phoneNumber: ["phone", "phone number", "telephone", "tel", "mobile", "telefon", "no telefon", "no. telefon", "contact"],
  ppki:        ["ppki", "special needs", "sen", "oku", "keperluan khas", "pendidikan khas"],
};

const norm = (h: string) => h.toLowerCase().replace(/[._:*()#]/g, " ").replace(/\s+/g, " ").trim();

/** Header → field, for the headers that match a known alias. */
export function mapHeaders(headers: string[]): Partial<Record<Field, string>> {
  const out: Partial<Record<Field, string>> = {};
  for (const h of headers) {
    const n = norm(h);
    for (const [field, aliases] of Object.entries(HEADERS) as [Field, string[]][]) {
      if (out[field]) continue;
      if (aliases.some(a => n === a || n.replace(/\s/g, "") === a.replace(/\s/g, ""))) { out[field] = h; break; }
    }
  }
  // A lone "date" column is the birth date.
  if (!out.birthDate) { const d = headers.find(h => /date|tarikh/.test(norm(h))); if (d) out.birthDate = d; }
  return out;
}

/** The headers carry enough to map without AI: a name and a passport or birth date. */
export const mappingUsable = (m: Partial<Record<Field, string>>) => !!m.name && (!!m.passport || !!m.birthDate);

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7, aug: 8, ogo: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, dis: 12,
};
const iso = (y: number, m: number, d: number) => {
  if (y < 100) y += y > 30 ? 1900 : 2000;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d ? dt.toISOString().slice(0, 10) : "";
};

/**
 * A birth date as YYYY-MM-DD: ISO, d/m/y (day first unless the first part
 * can't be a day), "12 Mar 2014", an Excel serial number, or "" when unreadable.
 */
export function normaliseDate(v: unknown): string {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (/^\d{5}(\.\d+)?$/.test(s)) { // Excel serial (days since 1899-12-30)
    const dt = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400000);
    return dt.toISOString().slice(0, 10);
  }
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (m) return +m[1] > 12 || +m[2] <= 12 ? iso(+m[3], +m[2], +m[1]) : iso(+m[3], +m[1], +m[2]);
  m = s.match(/^(\d{1,2})[\s-]+([a-z]{3})[a-z]*[\s-,]+(\d{2,4})$/i);
  if (m && MONTHS[m[2].toLowerCase()]) return iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
  m = s.match(/^([a-z]{3})[a-z]*\s+(\d{1,2}),?\s+(\d{4})$/i);
  if (m && MONTHS[m[1].toLowerCase()]) return iso(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
  return "";
}

export function normaliseGender(v: unknown): string {
  const s = String(v ?? "").trim().toLowerCase();
  if (/^(m|male|l|lelaki|boy|man|laki|laki-laki|nam)$/.test(s)) return "MALE";
  if (/^(f|female|p|perempuan|girl|woman|wanita|nu|nữ)$/.test(s)) return "FEMALE";
  return s.toUpperCase() === "MALE" || s.toUpperCase() === "FEMALE" ? s.toUpperCase() : "";
}

function normaliseLevel(v: unknown): string {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return "";
  if (/kinder|tadika|pre-?school|prasekolah|kg/.test(s)) return "KINDERGARTEN";
  if (/primary|rendah|elementary|^sr|grade school/.test(s)) return "PRIMARY";
  if (/secondary|menengah|high|middle|^sm/.test(s)) return "SECONDARY";
  if (/youth|belia|university|college|universiti|kolej/.test(s)) return "YOUTH";
  return ["KINDERGARTEN", "PRIMARY", "SECONDARY", "YOUTH"].includes(s.toUpperCase()) ? s.toUpperCase() : "";
}

const truthy = (v: unknown) => /^(y|yes|ya|1|true|benar|✓|x)$/i.test(String(v ?? "").trim());

/**
 * One candidate from loose values. Level and grade left blank are filled from
 * the birth date, as the form does.
 */
export function candidateFrom(v: Partial<Record<Field, unknown>>): BulkCandidate {
  const birthDate = normaliseDate(v.birthDate);
  const age = birthDate ? ageFromBirthDate(new Date(`${birthDate}T00:00:00Z`)) : null;
  const ageLevel = age != null ? eduLevelForAge(age) : "";
  const eduLevel = normaliseLevel(v.eduLevel) || ageLevel;
  // A blank grade is filled from the age only when it agrees with the level (a "Primary" 13-year-old gets none, not "Tingkatan 1").
  const classGrade = String(v.classGrade ?? "").trim() || (age != null && eduLevel === ageLevel ? gradeForAge(age) ?? "" : "");
  return {
    name: String(v.name ?? "").replace(/\s+/g, " ").trim(),
    passport: String(v.passport ?? "").trim(),
    birthDate, gender: normaliseGender(v.gender), eduLevel, classGrade,
    email: String(v.email ?? "").trim(), phoneNumber: String(v.phoneNumber ?? "").trim(),
    ppki: typeof v.ppki === "boolean" ? v.ppki : truthy(v.ppki),
  };
}

/** Candidates from header-keyed rows via the header mapping; blank rows dropped. */
export function candidatesFromRows(rows: Record<string, unknown>[], mapping: Partial<Record<Field, string>>): BulkCandidate[] {
  return rows
    .map(r => candidateFrom(Object.fromEntries(Object.entries(mapping).map(([f, h]) => [f, r[h!]])) as Partial<Record<Field, unknown>>))
    .filter(c => c.name || c.passport);
}

const AI_PROMPT = `You extract school competition participants from text the user pasted or uploaded (a spreadsheet export, a list, or an email). The participants are students from a foreign school.

Return ONLY a JSON array, one object per participant, with these keys:
- "name": full name as written
- "passport": passport / ID number, or "" if absent
- "birthDate": date of birth as YYYY-MM-DD, or "" if absent or unclear (dates are usually day-first: 03/04/2012 = 3 April 2012)
- "gender": "MALE", "FEMALE", or "" if unknown (do not guess from the name)
- "eduLevel": "KINDERGARTEN", "PRIMARY", "SECONDARY", "YOUTH", or "" if not stated
- "classGrade": the class / grade / year as written (e.g. "Grade 5", "Form 2"), or ""
- "email": "" if absent
- "phoneNumber": "" if absent
- "ppki": true only if special educational needs are stated, else false

Skip header rows, totals, teachers / coaches / managers, and anything that is not a participant. Never invent values.`;

/** Gemini reads free-form text into participant values; null when unavailable or unreadable. */
export async function aiCandidates(text: string): Promise<BulkCandidate[] | null> {
  if (!process.env.GEMINI_API_KEY) return null;
  const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY).getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json", temperature: 0 },
    systemInstruction: AI_PROMPT,
  });
  try {
    const res = await model.generateContent(text.slice(0, 60_000));
    const raw = res.response.text().trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return null;
    return arr.slice(0, BULK_MAX_ROWS).map(o => candidateFrom((o ?? {}) as Partial<Record<Field, unknown>>)).filter(c => c.name);
  } catch {
    return null;
  }
}

export const BULK_ERROR_LABEL: Record<string, string> = {
  MISSING_NAME: "Nama tiada",
  MISSING_PASSPORT: "No. pasport tiada",
  INVALID_BIRTH_DATE: "Tarikh lahir tiada / tidak sah",
  INVALID_GENDER: "Jantina tiada / tidak dikenali",
  INVALID_EDU_LEVEL: "Tahap pendidikan tiada",
  INVALID_EMAIL: "E-mel tidak sah",
  DUPLICATE_PASSPORT: "Pasport sudah didaftarkan di sekolah ini",
  DUPLICATE_IN_FILE: "Pasport berulang dalam fail",
};
