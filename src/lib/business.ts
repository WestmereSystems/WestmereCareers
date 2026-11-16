export type BusinessKind = "employer" | "agency";
export type BusinessSummary = {
  needsOnboarding?: boolean;
  kind: BusinessKind;
  tradingName: string;
  verified: boolean;
  pending: boolean;
  tier: string | null;
  organisations: {
    id: string;
    name: string;
    role: string;
    verified: boolean;
    tier: string | null;
  }[];
};
export const planLabels: Record<string, string> = {
  starter: "Starter",
  agency_starter: "Agency Starter",
  growth: "Growth",
  enterprise: "Enterprise",
  agency_growth: "Agency Growth",
  agency_enterprise: "Agency Enterprise",
};
export const hasDiscovery = (tier: string | null) =>
  Boolean(
    tier &&
    ["growth", "enterprise", "agency_growth", "agency_enterprise"].includes(
      tier,
    ),
  );
