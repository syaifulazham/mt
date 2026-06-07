"use client";

import { useState, useEffect, Fragment } from "react";
import { useTranslations } from "next-intl";

const TARGET = new Date("2026-08-15T09:00:00+08:00");

function pad(n: number, w = 2) { return String(n).padStart(w, "0"); }

export function Countdown() {
  const t = useTranslations("landing");
  const [diff, setDiff] = useState(0);

  useEffect(() => {
    const tick = () => setDiff(Math.max(0, TARGET.getTime() - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);

  const blocks = [
    { val: pad(d, 3), label: t("countdownDays")    },
    { val: pad(h),    label: t("countdownHours")   },
    { val: pad(m),    label: t("countdownMinutes") },
    { val: pad(s),    label: t("countdownSeconds") },
  ];

  return (
    <div className="flex gap-0.5">
      {blocks.map((b, i) => (
        <Fragment key={b.label}>
          {i > 0 && (
            <div
              className="self-center pb-3 px-1 font-black text-3xl"
              style={{ fontFamily: "'Exo 2', sans-serif", color: "rgba(255,255,255,0.2)" }}
            >
              :
            </div>
          )}
          <div
            className="flex flex-col items-center min-w-[80px] px-6 py-4"
            style={{
              background: "rgba(0,245,255,0.04)",
              border: "1px solid rgba(0,245,255,0.12)",
            }}
          >
            <span
              className="text-4xl font-black leading-none tracking-wide text-white"
              style={{ fontFamily: "'Exo 2', sans-serif" }}
            >
              {b.val}
            </span>
            <span
              className="mt-1.5 text-[10px] uppercase tracking-widest"
              style={{ color: "#00F5FF", opacity: 0.7 }}
            >
              {b.label}
            </span>
          </div>
        </Fragment>
      ))}
    </div>
  );
}
