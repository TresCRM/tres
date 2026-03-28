import { z } from "zod";

export const SignupSchema = z.object({
  tenant: z.object({
    name: z.string().min(2),
    slug: z.string().regex(/^[a-z0-9-]+$/i),
    plan: z.enum(["INDIVIDUAL","COMPANY"]).default("INDIVIDUAL")
  }),
  owner: z.object({
    firstName: z.string().trim().min(1),
    lastName: z.string().trim().min(1),
    email: z.email(),
    password: z.string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter")
      .regex(/[0-9]/, "Password must contain at least one digit")
  }),
  branding: z.object({
    primaryColor: z.string().optional(),
    surfaceColor: z.string().optional(),
    logoUrl: z.url().optional(),
    emailFrom: z.email().optional()
  }).partial().optional()
});

export const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
  tenantSlug: z.string().min(1)
});

export const VerifySchema = z.object({
  email: z.email(),
  tenantSlug: z.string().min(1),
  token: z.string().min(10)
});
