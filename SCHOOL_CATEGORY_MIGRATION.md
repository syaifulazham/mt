# School Category Migration — Full Malay Names

## Background

The original `SchoolCategory` enum used generic groupings (`KEBANGSAAN`, `AGAMA`,
`TEKNIK`, `PRIVATE`, `LAIN_LAIN`). These lose the rich classification information
held in the source MySQL database.

This migration replaces the enum with **26 full official Malay school type names**
sourced from KPM (Kementerian Pendidikan Malaysia), covering both public and private
schools. A `categoryShort` column is also added to preserve the original short code
(SK, SMK, SJKC, etc.) for display and filtering.

Schools with category `AK` (Akademik) — 1 record — are excluded as unclassified.

---

## New `SchoolCategory` Enum

| Enum identifier | Stored value (DB) | Short code |
|---|---|---|
| `SEKOLAH_KEBANGSAAN` | Sekolah Kebangsaan | SK |
| `SEKOLAH_MENENGAH_KEBANGSAAN` | Sekolah Menengah Kebangsaan | SMK |
| `SEKOLAH_JENIS_KEBANGSAAN_CINA` | Sekolah Jenis Kebangsaan Cina | SJKC |
| `SEKOLAH_JENIS_KEBANGSAAN_TAMIL` | Sekolah Jenis Kebangsaan Tamil | SJKT |
| `SEKOLAH_MENENGAH_KEBANGSAAN_AGAMA` | Sekolah Menengah Kebangsaan Agama | SMKA |
| `SEKOLAH_MENENGAH_AGAMA_BANTUAN_KERAJAAN` | Sekolah Menengah Agama Bantuan Kerajaan | SM SABK |
| `SEKOLAH_RENDAH_AGAMA_BANTUAN_KERAJAAN` | Sekolah Rendah Agama Bantuan Kerajaan | SR SABK |
| `SEKOLAH_MENENGAH_AGAMA` | Sekolah Menengah Agama | SEK. MENENGAH AGAMA |
| `SEKOLAH_RENDAH_AGAMA` | Sekolah Rendah Agama | SEK. RENDAH AGAMA |
| `SEKOLAH_KEBANGSAAN_TAHFIZ` | Sekolah Kebangsaan Tahfiz | SK TAHFIZ |
| `SEKOLAH_BERASRAMA_PENUH` | Sekolah Berasrama Penuh | SBP |
| `MAKTAB_RENDAH_SAINS_MARA` | Maktab Rendah Sains MARA | MRSM |
| `KOLEJ_VOKASIONAL` | Kolej Vokasional | KV |
| `SEKOLAH_MENENGAH_TEKNIK` | Sekolah Menengah Teknik | SMT |
| `SEKOLAH_KEBANGSAAN_PENDIDIKAN_KHAS` | Sekolah Kebangsaan Pendidikan Khas | SK KHAS |
| `SEKOLAH_MENENGAH_PENDIDIKAN_KHAS` | Sekolah Menengah Pendidikan Khas | SM KHAS |
| `SEKOLAH_BIMBINGAN_JALINAN_KASIH` | Sekolah Bimbingan Jalinan Kasih | SBJK |
| `SEKOLAH_MODEL_KHAS` | Sekolah Model Khas | MODEL KHAS |
| `SEKOLAH_SENI_MALAYSIA` | Sekolah Seni Malaysia | SENI |
| `SEKOLAH_SUKAN_MALAYSIA` | Sekolah Sukan Malaysia | SUKAN |
| `PUSAT_TINGKATAN_ENAM` | Pusat Tingkatan Enam | KT6 |
| `KOLEJ_TINGKATAN_ENAM` | Kolej Tingkatan Enam | K9 |
| `SEKOLAH_ANTARABANGSA` | Sekolah Antarabangsa | SEK. ANTARABANGSA |
| `SEKOLAH_MENENGAH_PERSENDIRIAN_CINA` | Sekolah Menengah Persendirian Cina | SEK. MEN. PERSENDIRIAN CINA |
| `SEKOLAH_MENENGAH_AKADEMIK` | Sekolah Menengah Akademik | SEK. MENENGAH AKADEMIK |
| `SEKOLAH_RENDAH_AKADEMIK` | Sekolah Rendah Akademik | SEK. RENDAH AKADEMIK |

---

## MySQL → Prisma Enum Mapping

```
SK                          → SEKOLAH_KEBANGSAAN
SMK                         → SEKOLAH_MENENGAH_KEBANGSAAN
SJKC                        → SEKOLAH_JENIS_KEBANGSAAN_CINA
SJKT                        → SEKOLAH_JENIS_KEBANGSAAN_TAMIL
SMKA                        → SEKOLAH_MENENGAH_KEBANGSAAN_AGAMA
SM SABK                     → SEKOLAH_MENENGAH_AGAMA_BANTUAN_KERAJAAN
SR SABK                     → SEKOLAH_RENDAH_AGAMA_BANTUAN_KERAJAAN
SEK. MENENGAH AGAMA         → SEKOLAH_MENENGAH_AGAMA
SEK. RENDAH AGAMA           → SEKOLAH_RENDAH_AGAMA
SK TAHFIZ                   → SEKOLAH_KEBANGSAAN_TAHFIZ
SBP                         → SEKOLAH_BERASRAMA_PENUH
MRSM                        → MAKTAB_RENDAH_SAINS_MARA
KV                          → KOLEJ_VOKASIONAL
SMT                         → SEKOLAH_MENENGAH_TEKNIK
SK KHAS                     → SEKOLAH_KEBANGSAAN_PENDIDIKAN_KHAS
SM KHAS                     → SEKOLAH_MENENGAH_PENDIDIKAN_KHAS
SBJK                        → SEKOLAH_BIMBINGAN_JALINAN_KASIH
MODEL KHAS                  → SEKOLAH_MODEL_KHAS
SENI                        → SEKOLAH_SENI_MALAYSIA
SUKAN                       → SEKOLAH_SUKAN_MALAYSIA
KT6                         → PUSAT_TINGKATAN_ENAM
K9                          → KOLEJ_TINGKATAN_ENAM
SEK. ANTARABANGSA           → SEKOLAH_ANTARABANGSA
SEK. MEN. PERSENDIRIAN CINA → SEKOLAH_MENENGAH_PERSENDIRIAN_CINA
SEK. MENENGAH AKADEMIK      → SEKOLAH_MENENGAH_AKADEMIK
SEK. RENDAH AKADEMIK        → SEKOLAH_RENDAH_AKADEMIK
AK                          → (skip — excluded)
```

---

## Implementation Steps

### Step 1 — Re-export schools from MySQL

Run this from your local machine (requires mysql access to `mtdb`):

```bash
npx tsx prisma/export-schools.ts
```

This regenerates `prisma/schools-export.json` with the new `category` (full enum
identifier) and `categoryShort` (original MySQL short code) fields.

> The export script reads directly from MySQL `mtdb` and applies the mapping above.

### Step 2 — Create the Prisma migration

```bash
npx prisma migrate dev --name school_category_full_names
```

This generates the migration SQL which:
- Drops the old `SchoolCategory` enum
- Creates the new 26-value enum
- Alters the `schools.category` column
- Adds the `categoryShort` column

> **Important:** The migration will fail if any existing row has a category value
> not in the new enum. Run the data reset in Step 3 first on dev, or apply the
> migration to a fresh DB.

### Step 3 — Re-import schools

After migration, re-run the import to populate schools with correct categories:

```bash
# Locally (dev)
npx tsx prisma/import-schools.ts

```

### Step 4 — Deploy

Push to `main` to trigger the GitHub Actions deploy. The workflow will:
1. Build the new image (with updated Prisma schema)
2. Run `prisma migrate deploy`
3. Restart the container

---

## Files Changed

| File | Change |
|---|---|
| `prisma/schema.prisma` | Updated `SchoolCategory` enum + added `categoryShort` to School model |
| `prisma/export-schools.ts` | New script — exports from MySQL with new category mapping |
| `prisma/import-schools.ts` | Updated — now also writes `categoryShort` |
| `prisma/schools-export.json` | Regenerated with new category values |
| `prisma/migrations/…_school_category_full_names/` | Auto-generated by Prisma |
