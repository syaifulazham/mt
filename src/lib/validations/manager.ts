import { z } from "zod";

export const onboardingSchema = z.object({
  institutionType: z.enum(["SCHOOL", "HIGHER", "INDEPENDENT", "INTERNATIONAL"]),
  schoolId:            z.string().optional(),
  higherInstitutionId: z.string().optional(),
  groupName:           z.string().optional(),
  countryId:           z.string().optional(),
  phone:       z.string().min(10, "Enter a valid phone number").max(20),
  idType:      z.enum(["IC", "PASSPORT"]),
  idNumber:    z.string().min(5, "Enter a valid ID number"),
  nationality: z.string().min(2).default("MY"),
}).superRefine((data, ctx) => {
  if (data.institutionType === "SCHOOL" && !data.schoolId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Select a school", path: ["schoolId"] });
  }
  if (data.institutionType === "HIGHER" && !data.higherInstitutionId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Select an institution", path: ["higherInstitutionId"] });
  }
  if (data.institutionType === "INDEPENDENT" && !data.groupName?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a group name", path: ["groupName"] });
  }
  if (data.institutionType === "INTERNATIONAL" && !data.countryId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Select a country", path: ["countryId"] });
  }
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;
