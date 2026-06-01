"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";

type ThemeCtx = { dark: boolean; toggle: () => void };
const ThemeContext = createContext<ThemeCtx>({ dark: false, toggle: () => {} });
export const useManagerTheme = () => useContext(ThemeContext);

const STORAGE_KEY = "manager-theme";

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}

function getSnapshot(): boolean {
  return localStorage.getItem(STORAGE_KEY) === "dark";
}

function getServerSnapshot(): boolean {
  return false;
}

export function ManagerThemeProvider({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const dark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    const next = localStorage.getItem(STORAGE_KEY) !== "dark";
    localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
    window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY }));
  }, []);

  return (
    <ThemeContext.Provider value={{ dark, toggle }}>
      <div
        className={`${dark ? "dark" : ""} ${className ?? ""}`.trim()}
        style={{ colorScheme: dark ? "dark" : "normal" }}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
