import { z } from "zod";
import { t } from "@/i18n/es-AR";
import { isValidCuit, normalizeCuit } from "@/lib/cuit";

const e = t.onboarding.errors;

export const onboardingSchema = z.object({
  fullName: z.string().trim().min(2, e.invalidFullName).max(120, e.invalidFullName),
  dni: z
    .string()
    .transform((v) => v.replace(/[.\s-]/g, ""))
    .refine((v) => /^[0-9]{7,8}$/.test(v), e.invalidDni),
  companyName: z.string().trim().min(2, e.invalidName).max(120, e.invalidName),
  cuit: z.string().refine(isValidCuit, e.invalidCuit).transform(normalizeCuit),
});
