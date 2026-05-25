import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { ChatClient } from "@/components/participant/ChatClient";

export const metadata: Metadata = { title: "Smart Chat" };

export default async function ChatPage() {
  const session = await getParticipantSession();
  if (!session) redirect("/participant/sign-in");

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-1">Smart Chat</h1>
      <p className="text-sm text-muted-foreground mb-4">
        Tanya apa sahaja tentang Techlympics
      </p>
      <ChatClient />
    </div>
  );
}
