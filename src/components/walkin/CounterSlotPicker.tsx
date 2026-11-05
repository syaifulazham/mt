"use client";

import { Loader2 } from "lucide-react";
import { fmtSlotMin, type SlotScheduleConfig } from "@/lib/walkin-slots";

export type SessionSlots = { n: number; start: number; end: number; booked: number[] };
export type SlotChoice = { sessionNumber: number; slotNumber: number };

const GOLD = "#f2dc0c";

/** Session/slot grid used by the walk-in counter (individual and team). */
export function CounterSlotPicker({ cfg, sessions, loading, choice, onChoose, disabled }: {
  cfg: SlotScheduleConfig;
  sessions: SessionSlots[] | null;
  loading: boolean;
  choice: SlotChoice | null;
  onChoose: (c: SlotChoice) => void;
  disabled?: boolean;
}) {
  const chosenSession = choice && sessions ? sessions.find(s => s.n === choice.sessionNumber) : null;
  return (
    <div className="space-y-2.5 pt-3 border-t border-white/10">
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
                      onClick={() => onChoose({ sessionNumber: s.n, slotNumber: slot })}
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

      {choice && chosenSession && (
        <p className="text-[11px] font-semibold rounded-lg px-3 py-2"
          style={{ background: "rgba(242,220,12,.1)", color: GOLD, border: "1px solid rgba(242,220,12,.3)" }}>
          Pilihan: Sesi {choice.sessionNumber} · Slot {choice.slotNumber} ({fmtSlotMin(chosenSession.start)} – {fmtSlotMin(chosenSession.end)})
        </p>
      )}
    </div>
  );
}
