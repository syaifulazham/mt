import type { Metadata } from "next";
import { AttendanceCounterClient } from "@/components/attendance/AttendanceCounterClient";

export const metadata: Metadata = { title: "Log Kehadiran — Malaysia Techlympics 2026" };

export default async function AttendanceCounterPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <AttendanceCounterClient code={code} />;
}
