export const listingLabels = {
  about: "A little about the opportunity",
  responsibilities: "What you’ll be doing",
  requirements: "What you’ll bring",
  skills: "Skills for this role",
} as const;
export type ListingLabels = Partial<Record<keyof typeof listingLabels, string>>;
export function readListingLabels(value: unknown): ListingLabels {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.keys(listingLabels).flatMap((key) => {
      const text = (value as Record<string, unknown>)[key];
      return typeof text === "string" &&
        text.trim().length > 0 &&
        text.length <= 100
        ? [[key, text.trim()]]
        : [];
    }),
  );
}
