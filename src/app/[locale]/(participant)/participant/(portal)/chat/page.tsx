import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getParticipantSession } from "@/lib/auth/participant-session";
import { ChatClient } from "@/components/participant/ChatClient";

export const metadata: Metadata = { title: "AI Rimau" };

export default async function ChatPage() {
  const session = await getParticipantSession();
  if (!session) redirect("/participant/sign-in");

  return (
    <div className="max-w-2xl mx-auto">
      <ChatClient />
    </div>
  );
}
