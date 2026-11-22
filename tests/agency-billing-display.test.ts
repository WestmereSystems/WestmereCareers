import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("@/components/providers", () => ({
  useSession: () => ({
    user: { id: "test-agency-owner" },
    business: {
      kind: "agency",
      needsOnboarding: true,
      organisations: [
        {
          id: "77549531-6dc1-4a4c-99f5-f9366fa922e9",
          name: "WM Recruitment",
          kind: "agency",
          role: "owner",
          verified: true,
        },
      ],
    },
  }),
}));
vi.mock("@/components/notices", () => ({ useNotice: () => vi.fn() }));
import { Billing } from "../src/components/billing";
it("renders agency subscription choices for WM Recruitment while requiring current terms before purchase", () => {
  const html = renderToStaticMarkup(createElement(Billing));
  for (const plan of ["Agency Starter", "Agency Growth", "Agency Enterprise"])
    expect(html).toContain(plan);
  for (const price of ["$199.00", "$399.00", "$799.00"])
    expect(html).toContain(price);
  expect(html).not.toContain("Employer Starter");
  expect(html).toContain("disabled");
  expect(html).toContain("Accept Terms and enable plan changes");
  expect(html).not.toContain(
    "Verify your business before starting a test subscription",
  );
});
