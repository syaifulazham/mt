import { NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { onboardingSchema } from "@/lib/validations/manager";

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

  const updated = await db.managerProfile.upsert({
    where:  { clerkUserId: userId },
    create: { clerkUserId: userId, email, name, ...profileData },
    update: profileData,
  });

  // ── Block if already in an active contingent (1 contingent per manager) ───
  const activeLink = await db.contingentManager.findFirst({
    where: { managerId: updated.id, status: "ACTIVE" },
    include: { contingent: { select: { name: true } } },
  });
  if (activeLink) {
    return NextResponse.json(
      {
        error: {
          code: "ALREADY_IN_CONTINGENT",
          message: `You are already managing "${activeLink.contingent.name}". Leave that contingent before joining or creating another.`,
        },
      },
      { status: 409 },
    );
  }

  // ── For SCHOOL type: check for existing contingent (1 per school) ──────────
  if (institutionType === "SCHOOL" && schoolId) {
    const existingContingent = await db.contingent.findUnique({
      where: { schoolId },
      include: {
        managers: { where: { managerId: updated.id } },
        _count: { select: { managers: { where: { status: { in: ["ACTIVE", "PENDING"] } } } } },
      },
    });

    if (existingContingent) {
      const existingLink = existingContingent.managers[0];

      // This manager is already linked to the contingent
      if (existingLink) {
        return NextResponse.json({
          data: {
            profileId:    updated.id,
            contingentId: existingContingent.id,
            status:       existingLink.status,
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
      const joinRequest = await db.contingentManager.create({
        data: {
          contingentId:   existingContingent.id,
          managerId:      updated.id,
          role:           "MANAGER",
          status:         "PENDING",
          requestMessage: `Join request from ${name}`,
        },
      });

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

  // ── Resolve contingent name by type ───────────────────────────────────────
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

  const contingent = await db.contingent.create({
    data: {
      name: contingentName,
      contingentType: institutionType,
      schoolId:            institutionType === "SCHOOL"   ? schoolId            : null,
      higherInstitutionId: institutionType === "HIGHER"   ? higherInstitutionId : null,
      countryId:           institutionType === "INTERNATIONAL" ? resolvedCountryId : null,
      managers: {
        create: { managerId: updated.id, role: "OWNER", status: "ACTIVE" },
      },
    },
  });

  return NextResponse.json({ data: { profileId: updated.id, contingentId: contingent.id } });
}
