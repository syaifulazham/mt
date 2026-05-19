import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { db } from "@/lib/db";

type ClerkUserEvent = {
  type: "user.created" | "user.updated" | "user.deleted";
  data: {
    id: string;
    email_addresses: Array<{ email_address: string; id: string }>;
    primary_email_address_id: string;
    first_name: string | null;
    last_name: string | null;
    phone_numbers: Array<{ phone_number: string }>;
    deleted?: boolean;
  };
};

export async function POST(req: Request) {
  const secret = process.env.CLERK_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const headersList = await headers();
  const svixId = headersList.get("svix-id");
  const svixTimestamp = headersList.get("svix-timestamp");
  const svixSignature = headersList.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: "Missing svix headers" }, { status: 400 });
  }

  const body = await req.text();
  const wh = new Webhook(secret);

  let event: ClerkUserEvent;
  try {
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkUserEvent;
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const { type, data } = event;

  const primaryEmail = data.email_addresses.find(
    (e) => e.id === data.primary_email_address_id
  )?.email_address;

  if (!primaryEmail) {
    return NextResponse.json({ error: "No primary email" }, { status: 400 });
  }

  const fullName = [data.first_name, data.last_name].filter(Boolean).join(" ") || "Unknown";

  try {
    if (type === "user.created") {
      await db.managerProfile.create({
        data: {
          clerkUserId: data.id,
          email: primaryEmail,
          name: fullName,
          phone: data.phone_numbers[0]?.phone_number ?? null,
        },
      });
    } else if (type === "user.updated") {
      await db.managerProfile.update({
        where: { clerkUserId: data.id },
        data: {
          email: primaryEmail,
          name: fullName,
          phone: data.phone_numbers[0]?.phone_number ?? null,
        },
      });
    } else if (type === "user.deleted") {
      await db.managerProfile.update({
        where: { clerkUserId: data.id },
        data: { deletedAt: new Date() },
      });
    }
  } catch (err) {
    console.error("[clerk-webhook] DB error:", err);
    return NextResponse.json({ error: "Database error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
