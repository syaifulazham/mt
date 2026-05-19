import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/organizer/LoginForm";

export const metadata: Metadata = { title: "Sign In" };

export default function OrganizerLoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50">
      <div className="w-full max-w-sm space-y-6 rounded-xl border bg-white p-8 shadow-sm">
        <div className="space-y-1">
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
