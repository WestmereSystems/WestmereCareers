import { businessPlanLimit } from "./business-plan";
import { hasDiscovery } from "./business";
export function businessPlanFeatures(tier: string) {
  const growth = hasDiscovery(tier);
  const enterprise = tier === "enterprise" || tier === "agency_enterprise";
  const limit = businessPlanLimit(tier);
  const agency = tier.startsWith("agency_");
  const agencyLimits = tier === "agency_enterprise" ? [50,50,15] : tier === "agency_growth" ? [20,20,5] : [5,5,2];
  return [
    ...(agency ? [{label:`${agencyLimits[0]} active vacancies · ${agencyLimits[1]} authorised clients · ${agencyLimits[2]} recruiter seats`,included:true}] : []),
    {
      label: `Up to ${limit} ${limit === 1 ? "business" : "businesses"} on one subscription`,
      included: true,
    },
    { label: "Company profile and listing management", included: true },
    { label: "Role views and application statistics", included: true },
    { label: "Candidate review, shortlisting and updates", included: true },
    { label: "Requirements evidence and score sorting", included: growth },
    { label: "Team invitations and shared hiring alerts", included: growth || agency },
    { label: "Discovery and visitor state insights", included: growth },
    { label: "Careers+ Studio · billing account only", included: enterprise },
    {
      label: "100 Assistant requests per billing period and 10 saved chats",
      included: enterprise,
    },
    { label: "Role Strength and Strong Matches", included: enterprise },
  ];
}
