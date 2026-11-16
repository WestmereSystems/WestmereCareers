export const sandboxPlans = [
  {
    code: "careers_plus",
    name: "Careers+",
    audience: "individual",
    amount: 2500,
    productId: "prod_westmere_careers_plus_test",
    priceId: "price_1UawvkRX8vZXnntOma2QGAyR",
  },
  {
    code: "starter",
    name: "Employer Starter",
    audience: "employer",
    amount: 12900,
    productId: "prod_westmere_starter_sandbox_v1",
    priceId: "price_1UcMkhRX8vZXnntOpsJ91p69",
  },
  {
    code: "growth",
    name: "Employer Growth",
    audience: "employer",
    amount: 24900,
    productId: "prod_westmere_growth_sandbox_v1",
    priceId: "price_1UcMkmRX8vZXnntO2mnRXjuO",
  },
  {
    code: "enterprise",
    name: "Employer Enterprise",
    audience: "employer",
    amount: 49900,
    productId: "prod_westmere_enterprise_sandbox_v1",
    priceId: "price_1UcMksRX8vZXnntO0hz8eG27",
  },
  {
    code: "agency_starter",
    name: "Agency Starter",
    audience: "agency",
    amount: 19900,
    productId: "prod_westmere_agency_starter_sandbox_v1",
    priceId: "price_1UcMkwRX8vZXnntOD7HzqVMD",
  },
  {
    code: "agency_growth",
    name: "Agency Growth",
    audience: "agency",
    amount: 39900,
    productId: "prod_westmere_agency_growth_sandbox_v1",
    priceId: "price_1UcMl1RX8vZXnntOOrWwYZ2D",
  },
  {
    code: "agency_enterprise",
    name: "Agency Enterprise",
    audience: "agency",
    amount: 79900,
    productId: "prod_westmere_agency_enterprise_sandbox_v1",
    priceId: "price_1UcMl5RX8vZXnntOwxKcDxjS",
  },
] as const;
export type PlanCode = (typeof sandboxPlans)[number]["code"];
export const planFor = (code: string) =>
  sandboxPlans.find((p) => p.code === code);
