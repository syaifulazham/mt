"use client";

import { createContext, useContext, useState } from "react";

type ThemeCtx = { dark: boolean; toggle: () => void };
const ThemeContext = createContext<ThemeCtx>({ dark: false, toggle: () => {} });
export const useManagerTheme = () => useContext(ThemeContext);

const STORAGE_KEY = "manager-theme";

function readStoredTheme(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "dark";
}

export function ManagerThemeProvider({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [dark, setDark] = useState<boolean>(readStoredTheme);

  function toggle() {
    setDark(prev => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? "dark" : "light");
      return next;
    });
  }

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
