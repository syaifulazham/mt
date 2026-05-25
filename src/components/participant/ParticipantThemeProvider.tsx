"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type ParticipantTheme = "light" | "electro" | "sakura";

type ThemeCtx = { theme: ParticipantTheme; setTheme: (t: ParticipantTheme) => void };
const ThemeContext = createContext<ThemeCtx>({ theme: "light", setTheme: () => {} });
export const useParticipantTheme = () => useContext(ThemeContext);

const STORAGE_KEY = "participant-theme";

export function ParticipantThemeProvider({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [theme, setThemeState] = useState<ParticipantTheme>("light");

  useEffect(() => {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "electro" || v === "sakura") setThemeState(v);
  }, []);

  function setTheme(t: ParticipantTheme) {
    setThemeState(t);
    localStorage.setItem(STORAGE_KEY, t);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <div
        data-pt-theme={theme}
        className={`${theme !== "light" ? "dark" : ""} ${className ?? ""}`.trim()}
        style={{ colorScheme: theme !== "light" ? "dark" : "normal" }}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
