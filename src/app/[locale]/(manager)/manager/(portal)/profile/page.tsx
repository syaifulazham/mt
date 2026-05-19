import { Construction } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  return <UnderConstruction title="Profile" />;
}

function UnderConstruction({ title }: { title: string }) {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center p-8">
      <div className="rounded-full bg-amber-50 p-5">
        <Construction className="h-10 w-10 text-amber-500" />
      </div>
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="text-muted-foreground max-w-sm">
        <span className="font-medium text-foreground">{title}</span> is currently under construction.
        Check back soon.
      </p>
    </div>
  );
}
