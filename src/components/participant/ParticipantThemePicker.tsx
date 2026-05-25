"use client";

import { useParticipantTheme, type ParticipantTheme } from "./ParticipantThemeProvider";

const THEMES: {
  id: ParticipantTheme;
  label: string;
  bg: string;
  border: string;
  ring: string;
  dot?: string;
}[] = [
  {
    id: "light",
    label: "Light",
    bg: "#ffffff",
    border: "#d1d5db",
    ring: "#6b7280",
    dot: "#e5e7eb",
  },
  {
    id: "electro",
    label: "Electro Blue",
    bg: "#071524",
    border: "#00c8ff",
    ring: "#00c8ff",
    dot: "#00c8ff",
  },
  {
    id: "sakura",
    label: "Pink Sakura",
    bg: "#0e0619",
    border: "#ff3a8c",
    ring: "#ff3a8c",
    dot: "#ff3a8c",
  },
];

export function ParticipantThemePicker() {
  const { theme, setTheme } = useParticipantTheme();

  return (
    <div className="flex items-center gap-2" title="Tukar tema">
      {THEMES.map((t) => {
        const isActive = theme === t.id;
        return (
          <button
            key={t.id}
            onClick={() => setTheme(t.id)}
            title={t.label}
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: t.bg,
              border: `2px solid ${isActive ? t.border : "rgba(150,150,150,0.35)"}`,
              boxShadow: isActive
                ? `0 0 0 2px ${t.ring}50, 0 0 10px ${t.ring}70`
                : "none",
              transition: "all 0.2s ease",
              flexShrink: 0,
              position: "relative",
              cursor: "pointer",
            }}
          >
            {/* Inner dot shown when active */}
            {isActive && (
              <span
                style={{
                  position: "absolute",
                  inset: 3,
                  borderRadius: "50%",
                  background: t.dot,
                  opacity: 0.85,
                }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
