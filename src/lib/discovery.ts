const careerTerms = [
  "employer name search",
  "designer",
  "graphic designer",
  "product designer",
  "ux designer",
  "ui designer",
  "software developer",
  "web developer",
  "customer service",
  "sales assistant",
  "accountant",
  "electrician",
  "plumber",
  "teacher",
  "barista",
  "chef",
  "warehouse",
  "customer success",
  "product design",
  "software engineer",
  "retail assistant",
  "project manager",
  "registered nurse",
  "business analyst",
  "data analyst",
  "marketing",
  "hospitality",
  "retail",
  "healthcare",
  "technology",
  "design",
  "engineering",
  "operations",
  "administration",
  "finance",
  "accounting",
  "education",
  "construction",
  "sales",
  "support",
  "developer",
  "nurse",
  "manager",
  "recruitment",
  "graduate",
  "apprentice",
  "trainee",
];
/** Only allowlisted career terms leave the browser for analytics. Never persist arbitrary search text. */
export function discoveryKeyword(value: string) {
  const text = value.toLowerCase().trim();
  return careerTerms.find((term) => text === term) || "";
}
export function discoveryRegion(headers: Headers, vercel: boolean) {
  if (!vercel) return "UNKNOWN";
  const country = headers.get("x-vercel-ip-country");
  if (!country) return "UNKNOWN";
  if (country !== "AU") return "OTHER";
  const region = headers.get("x-vercel-ip-country-region") || "";
  return ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"].includes(region)
    ? region
    : "UNKNOWN";
}
