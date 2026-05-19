import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "ms"],
  defaultLocale: "en",
  localePrefix: "never",
});

export type Locale = (typeof routing.locales)[number];
