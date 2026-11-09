"use client";

import { CalendarDays, Loader2 } from "lucide-react";
import { fmtSlotDate, fmtSlotMin, type SlotScheduleConfig } from "@/lib/walkin-slots";

export type SessionSlots = { n: number; start: number; end: number; booked: number[] };
export type SlotChoice = { sessionNumber: number; slotNumber: number; slotDate?: string };

const GOLD = "#f2dc0c";

/**
 * Session/slot grid used by the walk-in counter (individual and team). On
 * multi-day events (`dates` non-empty) a date is picked first; the sessions are
 * the same every day.
 */
export function CounterSlotPicker({ cfg, sessions, loading, choice, onChoose, disabled, dates = [], date = null, onDate }: {
  cfg: SlotScheduleConfig;
  sessions: SessionSlots[] | null;
  loading: boolean;
  choice: SlotChoice | null;
  onChoose: (c: SlotChoice) => void;
  disabled?: boolean;
  dates?: string[];
  date?: string | null;
  onDate?: (d: string | null) => void;
}) {
  const chosenSession = choice && sessions ? sessions.find(s => s.n === choice.sessionNumber) : null;
  const needDate = dates.length > 0 && !date;
  return (
    <div className="space-y-2.5 pt-3 border-t border-white/10">
      {dates.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color: GOLD }}>Pilih Tarikh</p>
            {date && (
              <button type="button" disabled={disabled} onClick={() => onDate?.(null)}
                className="text-[10px] font-bold uppercase hover:underline" style={{ color: "rgba(255,255,255,.5)" }}>
                Tukar
              </button>
            )}
          </div>
          {needDate ? (
            <div className="grid grid-cols-2 gap-1.5">
              {dates.map(d => (
                <button key={d} type="button" disabled={disabled} onClick={() => onDate?.(d)}
                  className="rounded-lg px-3 py-2 text-left transition-all hover:scale-[1.02]"
                  style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.15)" }}>
                  <p className="text-[11px] font-bold text-white">{fmtSlotDate(d, { weekday: "long" })}</p>
                  <p className="text-[10px]" style={{ color: "rgba(255,255,255,.5)" }}>
                    {fmtSlotDate(d, { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[11px] font-semibold flex items-center gap-1.5 rounded-lg px-3 py-1.5"
              style={{ background: "rgba(242,220,12,.1)", color: GOLD, border: "1px solid rgba(242,220,12,.3)" }}>
              <CalendarDays className="h-3.5 w-3.5" /> {fmtSlotDate(date!)}
            </p>
          )}
        </div>
      )}

      {!needDate && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-bold tracking-[0.2em] uppercase" style={{ color: GOLD }}>
              Pilih Slot
            </p>
            <div className="flex items-center gap-2.5 text-[9px]" style={{ color: "rgba(255,255,255,.4)" }}>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded" style={{ background: "rgba(255,255,255,.08)", border: "1px solid rgba(255,255,255,.2)" }} /> Tersedia
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded" style={{ background: "rgba(255,255,255,.04)" }} /> Ditempah
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded" style={{ background: GOLD }} /> Pilihan
              </span>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-6" style={{ color: "rgba(255,255,255,.4)" }}>
              <Loader2 className="h-4 w-4 animate-spin" style={{ color: GOLD }} />
              <span className="text-xs">Memuatkan slot…</span>
            </div>
          ) : sessions && (
            <div className="max-h-72 overflow-y-auto pr-1 space-y-3">
              {sessions.map(s => (
                <div key={s.n} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-bold" style={{ color: "rgba(255,255,255,.75)" }}>
                      Sesi {s.n}
                      <span className="ml-1.5 font-normal" style={{ color: "rgba(255,255,255,.3)" }}>
                        {cfg.slotsPerSession - s.booked.length}/{cfg.slotsPerSession}
                      </span>
                    </p>
                    <p className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,.3)" }}>
                      {fmtSlotMin(s.start)} – {fmtSlotMin(s.end)}
                    </p>
                  </div>
                  <div className="grid grid-cols-5 gap-1">
                    {Array.from({ length: cfg.slotsPerSession }, (_, i) => i + 1).map(slot => {
                      const isBooked = s.booked.includes(slot);
                      const isSel = choice?.sessionNumber === s.n && choice?.slotNumber === slot;
                      return (
                        <button key={slot} type="button"
                          disabled={isBooked || disabled}
                          onClick={() => onChoose({ sessionNumber: s.n, slotNumber: slot, ...(date && { slotDate: date }) })}
                          className="h-7 rounded-md text-[10px] font-bold transition-all"
                          style={isBooked
                            ? { background: "rgba(255,255,255,.04)", color: "rgba(255,255,255,.2)", cursor: "not-allowed", textDecoration: "line-through" }
                            : isSel
                              ? { background: GOLD, color: "#000", boxShadow: `0 0 10px ${GOLD}50` }
                              : { background: "rgba(255,255,255,.08)", color: "rgba(255,255,255,.75)", border: "1px solid rgba(255,255,255,.15)" }}
                        >
                          {slot}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {choice && chosenSession && (
        <p className="text-[11px] font-semibold rounded-lg px-3 py-2"
          style={{ background: "rgba(242,220,12,.1)", color: GOLD, border: "1px solid rgba(242,220,12,.3)" }}>
          Pilihan: {choice.slotDate && `${fmtSlotDate(choice.slotDate, { day: "numeric", month: "short" })} · `}
          Sesi {choice.sessionNumber} · Slot {choice.slotNumber} ({fmtSlotMin(chosenSession.start)} – {fmtSlotMin(chosenSession.end)})
        </p>
      )}
    </div>
  );
}
