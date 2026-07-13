import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { onboardingSchema } from "@/lib/validations/manager";
import { Prisma } from "@prisma/client";

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });

  const body = await req.json();
  const parsed = onboardingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", details: parsed.error.errors } }, { status: 422 });
  }

  const { institutionType, schoolId, higherInstitutionId, groupName, countryId, phone, idType, idNumber, nationality } = parsed.data;

  const clerkUser = await currentUser();
  const email = clerkUser?.emailAddresses[0]?.emailAddress ?? "";
  const name  = [clerkUser?.firstName, clerkUser?.lastName].filter(Boolean).join(" ") || email;

  const profileData = {
    institutionType,
    schoolId:            institutionType === "SCHOOL" ? schoolId : null,
    higherInstitutionId: institutionType === "HIGHER" ? higherInstitutionId : null,
    phone,
    idType,
    idNumber,
    nationality,
    profileComplete: true,
  };

  let updated: Awaited<ReturnType<typeof db.managerProfile.upsert>>;
  try {
    updated = await db.managerProfile.upsert({
      where:  { clerkUserId: userId },
      create: { clerkUserId: userId, email, name, ...profileData },
      update: profileData,
    });
  } catch (err) {
    // P2002: email already taken by another Clerk account (e.g. user signed up twice)
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await db.managerProfile.findUnique({ where: { email } });
      if (existing) {
        // Reattach the new Clerk userId to the existing profile so the user
        // can log in and reach the portal with either account.
        updated = await db.managerProfile.update({
          where: { id: existing.id },
          data:  { clerkUserId: userId, ...profileData },
        });
      } else {
        console.error("[onboarding] P2002 but email not found:", email, userId);
        return NextResponse.json({ error: { code: "EMAIL_CONFLICT", message: "This email is already registered. Please sign in with your original account." } }, { status: 409 });
      }
    } else {
      console.error("[onboarding] upsert error:", err);
      return NextResponse.json({ error: { code: "DB_ERROR", message: String(err) } }, { status: 500 });
    }
  }

  try {
    // ── Block / short-circuit if already linked to a contingent ───────────
    const existingLink = await db.contingentManager.findFirst({
      where: { managerId: updated.id },
      include: { contingent: { select: { id: true, name: true } } },
    });
    if (existingLink?.status === "ACTIVE") {
      return NextResponse.json(
        {
          error: {
            code: "ALREADY_IN_CONTINGENT",
            message: `You are already managing "${existingLink.contingent.name}". Leave that contingent before joining or creating another.`,
          },
        },
        { status: 409 },
      );
    }
    // Already has a pending join request — return it so the client shows the
    // waiting screen (with dashboard link) without creating a duplicate row.
    if (existingLink?.status === "PENDING") {
      return NextResponse.json({
        data: {
          profileId:     updated.id,
          contingentId:  existingLink.contingent.id,
          status:        "PENDING",
          alreadyMember: true,
        },
      });
    }

    // ── For SCHOOL type: check for existing contingent (1 per school) ────────
    if (institutionType === "SCHOOL" && schoolId) {
      const existingContingent = await db.contingent.findUnique({
        where: { schoolId },
        include: {
          managers: { where: { managerId: updated.id } },
          _count: { select: { managers: { where: { status: { in: ["ACTIVE", "PENDING"] } } } } },
        },
      });

      if (existingContingent) {
        const myLink = existingContingent.managers[0];

        // This manager is already linked to the contingent
        if (myLink) {
          return NextResponse.json({
            data: {
              profileId:    updated.id,
              contingentId: existingContingent.id,
              status:       myLink.status,
              alreadyMember: true,
            },
          });
        }

        // Orphaned contingent (all managers removed) — claim as owner
        if (existingContingent._count.managers === 0) {
          await db.contingentManager.create({
            data: { contingentId: existingContingent.id, managerId: updated.id, role: "OWNER", status: "ACTIVE" },
          });
          return NextResponse.json({ data: { profileId: updated.id, contingentId: existingContingent.id } });
        }

        // Has active/pending managers — submit join request
        // Guard: if the manager somehow already has a link (race condition), handle P2002 gracefully
        let joinRequest;
        try {
          joinRequest = await db.contingentManager.create({
            data: {
              contingentId:   existingContingent.id,
              managerId:      updated.id,
              role:           "MANAGER",
              status:         "PENDING",
              requestMessage: `Join request from ${name}`,
            },
          });
        } catch (joinErr) {
          if (joinErr instanceof Prisma.PrismaClientKnownRequestError && joinErr.code === "P2002") {
            // Duplicate join request (race) — find and return the existing one
            const dupLink = await db.contingentManager.findFirst({ where: { contingentId: existingContingent.id, managerId: updated.id } });
            return NextResponse.json({
              data: {
                profileId:     updated.id,
                contingentId:  existingContingent.id,
                status:        dupLink?.status ?? "PENDING",
                alreadyMember: true,
              },
            });
          }
          throw joinErr;
        }

        return NextResponse.json({
          data: {
            profileId:              updated.id,
            contingentId:           existingContingent.id,
            existingContingentName: existingContingent.name,
            joinRequestId:          joinRequest.id,
            requiresJoinRequest:    true,
          },
        });
      }
    }

    // ── Resolve contingent name by type ─────────────────────────────────────
    let contingentName = "My Contingent";
    let resolvedCountryId: string | null = null;

    if (institutionType === "SCHOOL" && schoolId) {
      const school = await db.school.findUnique({ where: { id: schoolId }, select: { name: true } });
      contingentName = school?.name ?? "My Contingent";
    } else if (institutionType === "HIGHER" && higherInstitutionId) {
      const hi = await db.higherInstitution.findUnique({ where: { id: higherInstitutionId }, select: { name: true } });
      contingentName = hi?.name ?? "My Contingent";
    } else if (institutionType === "INDEPENDENT") {
      contingentName = groupName?.trim() ?? "My Group";
    } else if (institutionType === "INTERNATIONAL" && countryId) {
      const country = await db.country.findUnique({ where: { id: countryId }, select: { name: true } });
      contingentName = country?.name ?? "International";
      resolvedCountryId = countryId;
    }

    // Guard: another request may have created the contingent between the check above and now
    let contingent;
    try {
      contingent = await db.contingent.create({
        data: {
          name: contingentName,
          contingentType: institutionType,
          schoolId:            institutionType === "SCHOOL"       ? schoolId            : null,
          higherInstitutionId: institutionType === "HIGHER"       ? higherInstitutionId : null,
          countryId:           institutionType === "INTERNATIONAL" ? resolvedCountryId  : null,
          managers: {
            create: { managerId: updated.id, role: "OWNER", status: "ACTIVE" },
          },
        },
      });
    } catch (createErr) {
      if (createErr instanceof Prisma.PrismaClientKnownRequestError && createErr.code === "P2002" && institutionType === "SCHOOL" && schoolId) {
        // Race: someone else created this school's contingent just now — re-fetch and treat as join request
        const raceContingent = await db.contingent.findUnique({ where: { schoolId }, select: { id: true, name: true } });
        if (raceContingent) {
          const joinRequest = await db.contingentManager.create({
            data: { contingentId: raceContingent.id, managerId: updated.id, role: "MANAGER", status: "PENDING", requestMessage: `Join request from ${name}` },
          });
          return NextResponse.json({
            data: { profileId: updated.id, contingentId: raceContingent.id, existingContingentName: raceContingent.name, joinRequestId: joinRequest.id, requiresJoinRequest: true },
          });
        }
      }
      console.error("[onboarding] contingent.create error:", createErr);
      return NextResponse.json({ error: { code: "DB_ERROR", message: "Failed to create contingent" } }, { status: 500 });
    }

    return NextResponse.json({ data: { profileId: updated.id, contingentId: contingent.id } });
  } catch (err) {
    console.error("[onboarding] unexpected error:", err);
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: String(err) } }, { status: 500 });
  }
}
