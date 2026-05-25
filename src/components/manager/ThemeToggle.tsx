"use client";

import { Sun, Moon } from "lucide-react";
import { useManagerTheme } from "./ManagerThemeProvider";

export function ThemeToggle() {
  const { dark, toggle } = useManagerTheme();
  return (
    <button
      onClick={toggle}
      className="rounded-full p-2 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 transition-colors"
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark
        ? <Sun  className="h-4 w-4" />
        : <Moon className="h-4 w-4" />
      }
    </button>
  );
}
