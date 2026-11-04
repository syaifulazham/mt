// Age, education level and grade for participants who have no Malaysian IC
// (foreign participants registered with a passport and a birth date).
// The rules match parseIcData in the manager / organizer clients: age by
// calendar year, and the same "Darjah n" / "Tingkatan n" grade strings that
// target groups (target_groups.classGrades) match on.

export type EduLevelValue = "KINDERGARTEN" | "PRIMARY" | "SECONDARY" | "YOUTH";

/** Age by calendar year (current year − birth year), as the IC rule does. */
export function ageFromBirthDate(birthDate: Date, now: Date = new Date()): number {
  return now.getFullYear() - birthDate.getFullYear();
}

export function eduLevelForAge(age: number): EduLevelValue {
  if (age >= 5 && age <= 6)   return "KINDERGARTEN";
  if (age >= 7 && age <= 12)  return "PRIMARY";
  if (age >= 13 && age <= 17) return "SECONDARY";
  return "YOUTH";
}

export function gradeForAge(age: number): string | null {
  if (age >= 5 && age <= 6)   return age <= 5 ? "Prasekolah 5thn" : "Prasekolah 6thn";
  if (age >= 7 && age <= 12)  return `Darjah ${age - 6}`;
  if (age >= 13 && age <= 17) return `Tingkatan ${age - 12}`;
  return null;
}

/** Parses "YYYY-MM-DD" into a UTC date; null when it isn't a real date. */
export function parseBirthDate(raw: unknown): Date | null {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) return null;
  return d;
}
