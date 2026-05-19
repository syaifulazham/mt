import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const createUserSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email"),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "OPERATOR", "PARTICIPANTS_MANAGER", "JUDGE_COORDINATOR", "VIEWER"]),
});

export const acceptInviteSchema = z.object({
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

export const totpVerifySchema = z.object({
  code: z.string().length(6, "TOTP code must be 6 digits").regex(/^\d+$/, "TOTP code must be numeric"),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;
