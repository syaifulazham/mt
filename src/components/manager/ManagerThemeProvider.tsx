"use client";

import { createContext, useContext, useEffect, useState } from "react";

type ThemeCtx = { dark: boolean; toggle: () => void };
const ThemeContext = createContext<ThemeCtx>({ dark: false, toggle: () => {} });
export const useManagerTheme = () => useContext(ThemeContext);

const STORAGE_KEY = "manager-theme";

export function ManagerThemeProvider({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (localStorage.getItem(STORAGE_KEY) === "dark") setDark(true);
  }, []);

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
        className={`${mounted && dark ? "dark" : ""} ${className ?? ""}`.trim()}
        style={{ colorScheme: mounted && dark ? "dark" : "normal" }}
      >
        {children}
      </div>
    </ThemeContext.Provider>
  );
}
