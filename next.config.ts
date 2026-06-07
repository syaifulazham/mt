import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    outputFileTracingIncludes: {
      // Include better-sqlite3 native binary for all mapping routes
      "/organizer/landing/mapping": ["./node_modules/better-sqlite3/**/*"],
      "/api/v2/organizer/mapping/**": ["./node_modules/better-sqlite3/**/*"],
    },
  },
};

export default withNextIntl(nextConfig);
