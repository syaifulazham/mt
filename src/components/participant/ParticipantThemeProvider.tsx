"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";

export type ParticipantTheme = "light" | "electro" | "sakura";

type ThemeCtx = { theme: ParticipantTheme; setTheme: (t: ParticipantTheme) => void };
const ThemeContext = createContext<ThemeCtx>({ theme: "light", setTheme: () => {} });
export const useParticipantTheme = () => useContext(ThemeContext);

const STORAGE_KEY = "participant-theme";

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

function getSnapshot(): ParticipantTheme {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "electro" || v === "sakura" ? v : "light";
}

function getServerSnapshot(): ParticipantTheme {
  return "light";
}

export function ParticipantThemeProvider({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setTheme = useCallback((t: ParticipantTheme) => {
    localStorage.setItem(STORAGE_KEY, t);
    // Notify useSyncExternalStore in the same tab (storage event only fires cross-tab natively)
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
  }, []);

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
