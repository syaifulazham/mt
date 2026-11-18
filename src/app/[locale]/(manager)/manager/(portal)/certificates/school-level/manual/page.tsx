import type { Metadata } from "next";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { ManagerSchoolLevelManual } from "@/components/manager/ManagerSchoolLevelManual";

export const metadata: Metadata = { title: "School Level Certificates — Manual" };

/** Manager portal → Sijil → School Level Cert → Manual: how to generate school level certificates. */
export default async function SchoolLevelManualPage() {
  const { userId } = await auth();
  if (!userId) redirect("/manager/sign-in");
  return <ManagerSchoolLevelManual />;
}
