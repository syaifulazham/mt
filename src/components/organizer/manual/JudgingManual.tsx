import Link from "next/link";
import {
  ArrowLeft, ArrowRight, Award, BookOpen, Check, CheckCircle2, Copy, ExternalLink, Flag, Gavel, Globe, Lightbulb,
  Lock, Medal, Megaphone, Pause, Play, Plus, QrCode, Sparkles, Split, Swords, Tag, Trophy, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Manual Pengguna: from setting up judging to announcing the results.
// The "snapshots" are drawn mock-ups of the real screens (no live data), so
// they never expose participants and keep matching the current labels.

type Step = { n: number; id: string; title: string; icon: React.ElementType; color: string };
const STEPS: Step[] = [
  { n: 1, id: "sedia",      title: "Sediakan pertandingan",        icon: Gavel,     color: "text-amber-600 bg-amber-50" },
  { n: 2, id: "skor",       title: "Penilaian kaedah Skor",         icon: Tag,       color: "text-violet-600 bg-violet-50" },
  { n: 3, id: "duel",       title: "Pertandingan kaedah Duel",      icon: Swords,    color: "text-rose-600 bg-rose-50" },
  { n: 4, id: "status",     title: "Selesai & sahkan penghakiman", icon: CheckCircle2, color: "text-sky-600 bg-sky-50" },
  { n: 5, id: "keputusan",  title: "Keputusan & paparan awam",      icon: Trophy,    color: "text-rose-600 bg-rose-50" },
  { n: 6, id: "anugerah",   title: "Anugerah Tambahan",             icon: Award,     color: "text-fuchsia-600 bg-fuchsia-50" },
  { n: 7, id: "pengumuman", title: "Pengumuman oleh MC",            icon: Megaphone, color: "text-emerald-600 bg-emerald-50" },
];

/** A browser-like frame around a drawn snapshot. */
function Shot({ title, children, caption }: { title: string; children: React.ReactNode; caption?: string }) {
  return (
    <figure className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="flex items-center gap-1.5 border-b bg-zinc-50 px-3 py-1.5">
        <span className="h-2 w-2 rounded-full bg-red-300" /><span className="h-2 w-2 rounded-full bg-amber-300" /><span className="h-2 w-2 rounded-full bg-emerald-300" />
        <span className="ml-2 truncate font-mono text-[10px] text-zinc-400">{title}</span>
      </div>
      <div className="p-3 text-xs">{children}</div>
      {caption && <figcaption className="border-t bg-zinc-50/60 px-3 py-1.5 text-[11px] text-zinc-500">{caption}</figcaption>}
    </figure>
  );
}

const Pill = ({ children, on, tone = "zinc" }: { children: React.ReactNode; on?: boolean; tone?: "violet" | "rose" | "zinc" | "emerald" | "sky" }) => (
  <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium",
    on ? { violet: "border-violet-600 bg-violet-600 text-white", rose: "border-rose-600 bg-rose-600 text-white", zinc: "border-zinc-800 bg-zinc-800 text-white",
      emerald: "border-emerald-600 bg-emerald-600 text-white", sky: "border-sky-600 bg-sky-600 text-white" }[tone] : "bg-white text-zinc-600")}>
    {children}
  </span>
);
const Badge = ({ children, cls }: { children: React.ReactNode; cls: string }) => (
  <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", cls)}>{children}</span>
);

function Section({ step, children }: { step: Step; children: React.ReactNode }) {
  return (
    <section id={step.id} className="scroll-mt-6 space-y-4 rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="flex items-center gap-3 text-lg font-bold text-zinc-900">
        <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl", step.color)}><step.icon className="h-4.5 w-4.5" /></span>
        <span><span className="mr-1.5 font-mono text-zinc-300">{step.n}</span>{step.title}</span>
      </h2>
      {children}
    </section>
  );
}

const Do = ({ items }: { items: React.ReactNode[] }) => (
  <ol className="space-y-1.5 text-sm text-zinc-700">
    {items.map((it, i) => (
      <li key={i} className="flex gap-2.5">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-[11px] font-bold text-zinc-500">{i + 1}</span>
        <span>{it}</span>
      </li>
    ))}
  </ol>
);
const Tip = ({ children }: { children: React.ReactNode }) => (
  <p className="flex gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900"><Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" /> <span>{children}</span></p>
);
const B = ({ children }: { children: React.ReactNode }) => <b className="font-semibold text-zinc-900">{children}</b>;

export function JudgingManual({ event }: { event: { name: string; slug: string } }) {
  const base = `/organizer/events/${event.slug}/manage`;
  const go = (href: string, label: string) => (
    <Link href={`${base}/${href}`} className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:underline">{label} <ExternalLink className="h-3 w-3" /></Link>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-start gap-4">
        <Link href={base} className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700"><ArrowLeft className="h-3.5 w-3.5" /> Kembali</Link>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-xl font-bold text-zinc-900"><BookOpen className="h-5 w-5 text-sky-600" /> Manual Pengguna: Penghakiman hingga Pengumuman</h1>
          <p className="text-sm text-zinc-500">{event.name} · panduan langkah demi langkah untuk penganjur. Gambar rajah adalah lakaran skrin sebenar.</p>
        </div>
      </div>

      {/* Flow overview */}
      <div className="rounded-2xl border bg-gradient-to-br from-sky-50 to-white p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-sky-700">Aliran keseluruhan</p>
        <div className="flex flex-wrap items-center gap-2">
          {STEPS.map((s, i) => (
            <span key={s.id} className="flex items-center gap-2">
              <a href={`#${s.id}`} className="flex items-center gap-1.5 rounded-lg border bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 shadow-sm hover:border-sky-300">
                <span className={cn("flex h-5 w-5 items-center justify-center rounded-md", s.color)}><s.icon className="h-3 w-3" /></span>
                <span className="font-mono text-zinc-400">{s.n}</span> {s.title}
              </a>
              {i < STEPS.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-zinc-300" />}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs text-zinc-600">
          Langkah 2 <i>atau</i> 3 bergantung pada kaedah pertandingan. Keputusan hanya muncul di paparan awam dan papan MC <B>selepas disahkan</B> oleh Super Admin (langkah 4).
        </p>
      </div>

      {/* 1 */}
      <Section step={STEPS[0]}>
        <p className="text-sm text-zinc-600">Semua tetapan penghakiman dibuat di kad setiap pertandingan pada halaman <B>Penghakiman</B>. {go("judging", "Buka Penghakiman")}</p>
        <div className="grid gap-4 md:grid-cols-2">
          <Do items={[
            <>Pilih <B>Kaedah penghakiman</B>: <B>Skor</B> (borang markah oleh hakim) atau <B>Duel</B> (perlawanan berpusingan).</>,
            <>Pilih <B>Konfigurasi keputusan</B>: <B>Kebangsaan</B> (satu kedudukan) atau <B>Negeri</B> (kedudukan berasingan setiap negeri).</>,
            <>Kaedah Skor: tambah <B>Templat</B> — pilih sedia ada dengan <B>+ Tambah templat</B>, atau jana dengan <B>Pembantu AI</B> daripada arahan / dokumen peraturan.</>,
            <>Pilihan: <B>Pecahkan pertandingan</B> jika satu pertandingan dinilai dalam beberapa bahagian (cth. Kereta Terpantas & Pembentangan Terbaik).</>,
            <>Pilihan: tandakan <B>Gabungan negeri</B> untuk menggabungkan pasukan negeri yang sama (JOHOR A, JOHOR B) dan <B>Susun gabungan</B>.</>,
            <>Setelah tetapan muktamad, klik <B>Kunci konfigurasi</B> supaya tidak berubah semasa pertandingan.</>,
          ]} />
          <Shot title={`${base}/judging`} caption="Kad pertandingan: kaedah, konfigurasi keputusan, templat dan kunci.">
            <p className="mb-2 font-semibold text-zinc-800"><span className="mr-1 font-mono text-zinc-400">4.2R</span> Cabaran Kereta Roket</p>
            <div className="space-y-2">
              <div className="flex items-center gap-2"><span className="w-24 text-zinc-500">Kaedah</span><Pill on tone="violet"><Gavel className="h-3 w-3" /> Skor</Pill><Pill><Swords className="h-3 w-3" /> Duel</Pill></div>
              <div className="flex items-center gap-2"><span className="w-24 text-zinc-500">Keputusan</span><Pill on>Kebangsaan</Pill><Pill>Negeri</Pill><span className="ml-auto"><Pill><Lock className="h-3 w-3" /> Kunci konfigurasi</Pill></span></div>
              <div className="flex flex-wrap items-center gap-1.5"><span className="w-24 text-zinc-500">Templat</span>
                <span className="rounded-full border border-violet-200 px-2 py-0.5 text-[11px] text-violet-700">Kereta Roket A</span>
                <span className="rounded-full border border-dashed border-violet-300 px-2 py-0.5 text-[11px] text-violet-600"><Plus className="inline h-3 w-3" /> Tambah templat</span>
                <span className="rounded-full border border-violet-300 bg-violet-50 px-2 py-0.5 text-[11px] text-violet-700"><Sparkles className="inline h-3 w-3" /> Pembantu AI</span>
              </div>
              <div className="flex items-center gap-2 rounded-md bg-violet-50/60 px-2 py-1"><input type="checkbox" readOnly checked className="accent-violet-600" /><Users className="h-3 w-3 text-violet-600" /> Gabungan negeri</div>
              <div className="flex items-center gap-2 text-zinc-500"><Split className="h-3 w-3 text-indigo-500" /> Pecahan <span className="ml-auto"><Pill>Pecahkan pertandingan</Pill></span></div>
            </div>
          </Shot>
        </div>
        <Tip>Kriteria jenis <b>Masa</b> dengan markah maksimum memberi markah berkurang dari maksimum (0 saat) ke 0 pada masa maksimum. Tanpa markah maksimum, masa hanya menjadi penentu seri.</Tip>
      </Section>

      {/* 2 */}
      <Section step={STEPS[1]}>
        <div className="grid gap-4 md:grid-cols-2">
          <Do items={[
            <>Di bawah setiap templat, klik <B>Cipta Tugas</B> — satu tugas bagi setiap hakim / panel (cth. &ldquo;Hakim 1&rdquo;).</>,
            <>Setiap tugas mempunyai <B>URL</B> dan <B>passcode</B>. Klik ikon <QrCode className="inline h-3.5 w-3.5 text-violet-500" /> untuk paparan <B>kod QR + passcode</B> yang boleh diimbas oleh hakim.</>,
            <>Hakim membuka pautan, memasukkan passcode, memilih pasukan dan mengisi markah. Jumlah dikira automatik.</>,
            <>Pantau kemajuan di jadual <B>Status Penghakiman</B> — lajur <B>Dinilai</B> menunjukkan pasukan yang telah dinilai.</>,
            <>Hakim menekan <B>Penghakiman Selesai</B> apabila habis; borangnya dikunci.</>,
          ]} />
          <Shot title="Tugas penghakiman" caption="Baris tugas: salin pautan, buka, atau papar kod QR untuk hakim.">
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-3 gap-y-2">
              <span className="font-medium text-zinc-800">Hakim 1</span>
              <span className="font-mono text-zinc-400">/judging/2070d…</span>
              <span className="flex gap-1.5 text-zinc-400"><Copy className="h-3.5 w-3.5" /><ExternalLink className="h-3.5 w-3.5" /><QrCode className="h-3.5 w-3.5 text-violet-500" /></span>
            </div>
            <div className="mt-3 flex items-center gap-3 rounded-lg border p-2">
              <div className="grid h-16 w-16 grid-cols-5 gap-0.5 rounded bg-white p-1 ring-1 ring-zinc-200">
                {Array.from({ length: 25 }, (_, i) => <span key={i} className={cn("rounded-[1px]", [0,1,3,5,6,8,12,14,16,18,19,20,22,24].includes(i) ? "bg-zinc-800" : "bg-white")} />)}
              </div>
              <div><p className="text-[10px] uppercase tracking-widest text-violet-500">Kod laluan</p><p className="font-mono text-xl font-black tracking-[0.3em] text-violet-900">K7QM2X</p></div>
            </div>
          </Shot>
        </div>
      </Section>

      {/* 3 */}
      <Section step={STEPS[2]}>
        <p className="text-sm text-zinc-600">Untuk pertandingan kaedah Duel, klik <B>Urus duel →</B> pada kad pertandingan, atau buka dari <B>Scoreboard</B>. {go("scoreboard", "Buka Scoreboard")}</p>
        <div className="grid gap-4 md:grid-cols-2">
          <Do items={[
            <>Tetapkan format (<B>Kalah mati berperingkat</B> atau <B>Liga kumpulan → kalah mati</B>), saiz sesi, arena dan masa di Penghakiman. Pilihan: <B>Kad skor duel</B> untuk rekod mata & penalti.</>,
            <>Tab <B>Cabutan</B>: pilih pasukan (boleh termasuk yang belum hadir), klik <B>Cabut</B>, seret untuk tukar, kemudian <B>Sahkan & jadualkan</B>.</>,
            <>Di kad arena: <B>Mula</B> setiap perlawanan, atau <B>Mula semua</B> untuk semua arena serentak. <B>Jeda</B> / <B>Tamat</B> bila perlu.</>,
            <>Butang <B>Kad skor</B> memaparkan kod QR untuk marsyal menanda kad skor di telefon. Atau klik <B>Beri kedudukan</B> di kad arena.</>,
            <>Apabila semua sesi selesai, <B>Cabut / Jana pusingan seterusnya</B> hingga Akhir. Tab <B>Kedudukan Akhir</B> memaparkan kedudukan keseluruhan.</>,
            <><B>Pautan kawalan</B> membolehkan marsyal tanpa akaun penganjur mengawal arena dengan kod laluan.</>,
          ]} />
          <div className="space-y-3">
            <Shot title="Pengurus duel · Pusingan 1" caption="Kad arena dengan jam, pasukan dan kawalan.">
              <div className="rounded-xl bg-gradient-to-br from-violet-950 via-indigo-900 to-violet-800 p-3 text-white">
                <div className="flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-widest text-cyan-300">Arena 1</span><span className="rounded-full bg-emerald-400/90 px-2 text-[10px] font-bold text-emerald-950">Berlangsung</span></div>
                <div className="mt-1 flex items-end justify-between"><span className="font-bold">Sesi A</span><span className="font-mono text-3xl font-black">1:42</span></div>
                <div className="mt-2 space-y-1">{["Pasukan Merah", "Pasukan Biru"].map(t => <div key={t} className="rounded bg-white/10 px-2 py-1 text-[11px]">{t}</div>)}</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="flex items-center gap-1 rounded bg-amber-500 px-2 py-0.5 text-[11px] font-semibold"><Pause className="h-3 w-3" /> Jeda</span>
                  <span className="flex items-center gap-1 rounded bg-cyan-500 px-2 py-0.5 text-[11px] font-semibold text-violet-950"><Flag className="h-3 w-3" /> Beri kedudukan</span>
                  <span className="flex items-center gap-1 rounded bg-white/15 px-2 py-0.5 text-[11px]"><QrCode className="h-3 w-3" /> Kad skor</span>
                </div>
              </div>
              <div className="mt-2 flex justify-end"><Pill on tone="emerald"><Play className="h-3 w-3" /> Mula semua (6 arena)</Pill></div>
            </Shot>
          </div>
        </div>
        <Tip>Kedudukan Akhir duel terus dipaparkan di halaman Keputusan (lajur &ldquo;Mata&rdquo;) — tiada markah templat diperlukan.</Tip>
      </Section>

      {/* 4 */}
      <Section step={STEPS[3]}>
        <div className="grid gap-4 md:grid-cols-2">
          <Do items={[
            <>Di jadual <B>Status Penghakiman</B> (halaman Penghakiman atau Keputusan), klik <B>Selesai</B> untuk mengumumkan penghakiman selesai — bagi semua negeri atau satu negeri. Borang hakim berkenaan dikunci.</>,
            <><B>Super Admin</B> menyemak keputusan, kemudian klik <B>Sahkan</B> → status menjadi <B>VERIFIED</B>.</>,
            <>Hanya keputusan VERIFIED dihantar ke paparan awam dan papan MC. Bagi keputusan per negeri, setiap negeri boleh disahkan berasingan.</>,
            <>Perlu pembetulan? Super Admin boleh <B>Buka semula</B>; keputusan ditarik balik dari paparan awam sehingga disahkan semula.</>,
          ]} />
          <Shot title="Status Penghakiman" caption="DIBUKA → SELESAI → VERIFIED.">
            <div className="divide-y rounded-lg border">
              {[["Semua", "12/12", "VERIFIED", "border-emerald-200 bg-emerald-50 text-emerald-700", null],
                ["Johor", "4/4", "SELESAI", "border-amber-200 bg-amber-50 text-amber-700", "Sahkan"],
                ["Kedah", "2/4", "DIBUKA", "border-sky-200 bg-sky-50 text-sky-700", "Selesai"]].map(([n, d, st, cls, act]) => (
                <div key={n as string} className="flex items-center gap-3 px-2 py-1.5">
                  <span className="w-16 font-medium text-zinc-700">{n}</span>
                  <span className="w-12 font-mono text-zinc-500">{d}</span>
                  <Badge cls={cls as string}>{st}</Badge>
                  {act && <span className={cn("ml-auto rounded px-2 py-0.5 text-[11px] font-semibold text-white", act === "Sahkan" ? "bg-emerald-600" : "bg-amber-500")}>{act === "Sahkan" ? <Check className="mr-0.5 inline h-3 w-3" /> : <Megaphone className="mr-0.5 inline h-3 w-3" />}{act}</span>}
                </div>
              ))}
            </div>
          </Shot>
        </div>
      </Section>

      {/* 5 */}
      <Section step={STEPS[4]}>
        <p className="text-sm text-zinc-600">{go("results", "Buka Keputusan")}</p>
        <div className="grid gap-4 md:grid-cols-2">
          <Do items={[
            <>Pilih pertandingan di bahagian atas untuk melihat kedudukan; tukar paparan <B>Kebangsaan / Negeri</B>.</>,
            <>Tandakan <B>Pilih</B> untuk pasukan yang mara (cth. ke peringkat seterusnya). <B>Muat Turun</B> mengeksport keputusan.</>,
            <>Bahagian <B>Paparan Awam</B>: klik <B>Jana Pautan</B> untuk papan keputusan awam (boleh dengan passcode) — sesuai dipaparkan di skrin dewan.</>,
            <><B>Medal Tally</B> (kad Keputusan) mengira pingat mengikut negeri daripada keputusan yang disahkan.</>,
          ]} />
          <Shot title={`${base}/results`} caption="Kedudukan pertandingan dan jana pautan paparan awam.">
            <div className="mb-2 flex flex-wrap gap-1">{["2.1R", "2.3R", "4.1R", "4.2R"].map((c, i) => <Pill key={c} on={i === 2} tone="rose">{c}</Pill>)}</div>
            <div className="divide-y rounded-lg border">
              {[["1", "Pasukan A", "4"], ["2", "Pasukan B", "3"], ["3", "Pasukan C", "2"]].map(([r, t, m]) => (
                <div key={r} className="flex items-center gap-3 px-2 py-1.5">
                  <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold", r === "1" ? "bg-amber-100 text-amber-800" : r === "2" ? "bg-zinc-200 text-zinc-700" : "bg-orange-100 text-orange-800")}>{r}</span>
                  <span className="flex-1 text-zinc-800">{t}</span><span className="font-bold text-rose-700">{m}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between rounded-lg border px-2 py-1.5"><span className="flex items-center gap-1 text-zinc-600"><Globe className="h-3 w-3" /> Paparan Awam</span><Pill><Plus className="h-3 w-3" /> Jana Pautan</Pill></div>
          </Shot>
        </div>
      </Section>

      {/* 6 */}
      <Section step={STEPS[5]}>
        <div className="grid gap-4 md:grid-cols-2">
          <Do items={[
            <>Buka kad <B>Anugerah Tambahan</B> di halaman acara, klik <B>Anugerah baharu</B>.</>,
            <>Isi nama, asas (<B>Pertandingan</B> / <B>Bebas</B>), penerima (<B>Pasukan</B> / <B>Individu</B>), dan penentuan pemenang: <B>Templat penghakiman</B> (dikira automatik) atau <B>Pilih manual</B>.</>,
            <>Untuk pilih manual, klik <B>Pilih pemenang</B> dan cari pasukan / peserta.</>,
            <>Anugerah dan pemenangnya dipaparkan di bahagian bawah halaman Keputusan.</>,
          ]} />
          <Shot title={`${base}/awards`} caption="Satu anugerah dengan pemenangnya.">
            <p className="font-semibold text-zinc-800">Pembentang Terbaik</p>
            <div className="mt-1 flex flex-wrap gap-1"><Badge cls="border-transparent bg-zinc-100 text-zinc-600">4.2R</Badge><Badge cls="border-transparent bg-sky-50 text-sky-700">Individu</Badge><Badge cls="border-transparent bg-fuchsia-50 text-fuchsia-700">Pilih manual</Badge></div>
            <div className="mt-2 flex items-center gap-2 rounded-lg border px-2 py-1.5"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-[10px] font-bold text-amber-800">1</span> Nama Peserta <span className="text-zinc-400">· Sekolah</span></div>
          </Shot>
        </div>
      </Section>

      {/* 7 */}
      <Section step={STEPS[6]}>
        <p className="text-sm text-zinc-600">{go("announcements", "Buka Pengumuman")}</p>
        <div className="grid gap-4 md:grid-cols-2">
          <Do items={[
            <>Bahagian <B>Papan Pengumuman (MC / Juruacara)</B>: klik <B>Jana Pautan</B> dan beri <B>URL + passcode</B> kepada MC.</>,
            <>Tetapkan <B>Bilangan tempat diumumkan</B> (cth. 3 untuk Johan, Naib Johan, Ketiga).</>,
            <>Di <B>Senarai Pengumuman</B>, keputusan VERIFIED muncul sebagai <B>Sedia diumumkan</B>. Susun ikut turutan majlis dengan seret.</>,
            <>Klik <B>Beri lampu hijau — MC boleh mengumumkan</B> untuk pertandingan yang hendak diumumkan sekarang.</>,
            <>MC mengumumkan dari papan; status bertukar kepada <B>Telah Diumumkan</B>. <B>Tarik balik lampu hijau</B> jika perlu menangguh.</>,
          ]} />
          <Shot title={`${base}/announcements`} caption="Pertandingan yang diberi lampu hijau muncul di papan MC.">
            <div className="space-y-2">
              {[["4.1R Cabaran Robot Tempur", "Lampu hijau", "bg-emerald-600 text-white"], ["4.2R Cabaran Kereta Roket", "Sedia diumumkan", "border border-zinc-200 bg-white text-zinc-600"], ["2.3R Cabaran FC-1 AI", "Telah Diumumkan", "bg-zinc-100 text-zinc-500"]].map(([c, s, cls]) => (
                <div key={c} className="flex items-center gap-2 rounded-lg border px-2 py-1.5">
                  <span className="text-zinc-300">⋮⋮</span><span className="flex-1 text-zinc-800">{c}</span>
                  <span className={cn("rounded px-2 py-0.5 text-[10px] font-semibold", cls)}>{s}</span>
                </div>
              ))}
            </div>
          </Shot>
        </div>
        <Tip>Selepas majlis, sijil pencapaian boleh dijana dari <b>Sijil → Penjana</b> menggunakan sumber &ldquo;Pencapaian Acara&rdquo; — ia mengambil keputusan yang sama.</Tip>
      </Section>

      <div className="flex items-center justify-between rounded-2xl border bg-zinc-50 px-4 py-3 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5"><Medal className="h-3.5 w-3.5" /> Peranan: Admin menyediakan & menyelesaikan; Super Admin mengesahkan dan membuka semula.</span>
        <Link href={base} className="font-semibold text-sky-700 hover:underline">Kembali ke halaman acara →</Link>
      </div>
    </div>
  );
}
