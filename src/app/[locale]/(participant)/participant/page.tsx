import { redirect } from "next/navigation";
import { getParticipantSession } from "@/lib/auth/participant-session";

export default async function ParticipantRoot() {
  const session = await getParticipantSession();
  redirect(session ? "/participant/dashboard" : "/participant/sign-in");
}
