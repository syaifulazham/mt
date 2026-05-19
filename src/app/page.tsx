import { notFound } from "next/navigation";

// Middleware (localePrefix: "never") rewrites "/" → "/[locale]/" before routing,
// so this file is unreachable in normal operation.
export default function RootPage() {
  notFound();
}
