import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LoginForm } from "@/components/organizer/LoginForm";

export const metadata: Metadata = { title: "Sign In" };

export default function OrganizerLoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="w-full max-w-sm space-y-6 rounded-xl border bg-white p-8 shadow-sm">
        <div className="space-y-1">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-700 transition-colors mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Kembali
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Techlympics</h1>
          <p className="text-sm text-muted-foreground">Organizer portal — staff access only</p>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
