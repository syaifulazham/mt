import { redirect } from "next/navigation";

export default function ParticipantRoot() {
  redirect("/participant/sign-in");
}
