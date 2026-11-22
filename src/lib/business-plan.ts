export type BusinessPlanCoverage = {
  tier: string | null;
  limit: number;
  used: number;
  billingOwnerId: string;
  billingOwnerEmail: string;
  organisations: {
    id: string;
    billingOwnerId: string | null;
    billingOwnerEmail: string | null;
    associated: boolean;
    covered: boolean;
    tier: string | null;
  }[];
};
export const businessPlanLimit = (tier: string | null) =>
  tier === "enterprise" || tier === "agency_enterprise"
    ? 10
    : tier === "growth" || tier === "agency_growth"
      ? 3
      : 1;
