// Registration open/close switch, set by organizers under Settings.
// Stored in app_settings; a missing row means open, so nothing changes until
// someone closes it. Always read per request — never cache this value.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const REGISTRATION_SETTING_KEY = "registration_open";

export const REGISTRATION_CLOSED_MESSAGE =
  "Pendaftaran telah ditutup. Pendaftaran pengurus baharu tidak dibuka buat masa ini.";

export const PARTICIPANT_CLOSED_MESSAGE =
  "Pendaftaran telah ditutup. Peserta baharu tidak boleh ditambah buat masa ini.";

export async function isRegistrationOpen(): Promise<boolean> {
  const row = await db.appSetting.findUnique({ where: { key: REGISTRATION_SETTING_KEY } });
  return row?.value !== "false";
}

export async function setRegistrationOpen(open: boolean): Promise<void> {
  const value = open ? "true" : "false";
  await db.appSetting.upsert({
    where:  { key: REGISTRATION_SETTING_KEY },
    update: { value },
    create: { key: REGISTRATION_SETTING_KEY, value },
  });
}

/** 403 returned by participant-create endpoints while registration is closed. */
export function participantsClosedResponse() {
  return NextResponse.json(
    { error: "REGISTRATION_CLOSED", message: PARTICIPANT_CLOSED_MESSAGE },
    { status: 403 },
  );
}
