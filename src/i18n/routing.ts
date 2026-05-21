import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["ms", "en"],
  defaultLocale: "ms",
  localePrefix: "never",
});

export type Locale = (typeof routing.locales)[number];
