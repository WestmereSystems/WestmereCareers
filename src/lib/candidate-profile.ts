import { z } from "zod";
export const profileLinkNames = {
  linkedin: "LinkedIn",
  portfolio: "Portfolio / website",
  github: "GitHub",
  other: "Other professional link",
} as const;
const link = z.union([
  z.literal(""),
  z
    .url()
    .max(500)
    .refine((value) => {
      try {
        const u = new URL(value);
        return u.protocol === "https:" && !u.username && !u.password;
      } catch {
        return false;
      }
    }, "Use an HTTPS link without embedded credentials."),
]);
export const profileLinksSchema = z
  .object({
    linkedin: link.optional(),
    portfolio: link.optional(),
    github: link.optional(),
    other: link.optional(),
  })
  .strict();
export type CandidateProfile = {
  first_name: string;
  last_name: string;
  full_name: string;
  email?: string;
  social_links: Record<string, string>;
  updated_at?: string;
};
export const workRightsOptions = {
  not_provided: "Prefer to discuss with the employer",
  au_citizen: "Australian citizen",
  nz_citizen: "New Zealand citizen",
  permanent_resident: "Australian permanent resident",
  visa_full_rights: "Visa with unrestricted work rights",
  visa_limited_rights: "Visa with work conditions or limits",
  require_sponsorship: "Sponsorship required",
} as const;
export const attachmentKinds = {
  cover_letter: "Cover letter",
  supporting: "Supporting document",
  certification: "Position certification",
  licence: "Driver’s licence",
  right_to_work: "Right-to-work document",
} as const;

/** Treat stored JSON as untrusted, including writes made directly through the Data API. */
export function safeProfileLinks(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const key of Object.keys(profileLinkNames)) {
    const candidate = (value as Record<string, unknown>)[key];
    if (
      typeof candidate === "string" &&
      candidate &&
      profileLinksSchema.safeParse({ [key]: candidate }).success
    )
      result[key] = candidate;
  }
  return result;
}
