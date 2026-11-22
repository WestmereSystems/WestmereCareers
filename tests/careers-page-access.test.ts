import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  session: vi.fn(),
  notify: vi.fn(),
  mountEffects: [] as Array<() => void | (() => void)>,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  // Run mount callbacks explicitly: a static render alone would miss the old pop-up.
  useEffect: (effect: () => void | (() => void)) => m.mountEffects.push(effect),
}));
vi.mock("@/components/providers", () => ({ useSession: m.session }));
vi.mock("@/components/notices", () => ({
  useNotice: () => m.notify,
  individualNotice: {},
  foundingCareersNotice: { title: "Careers+ opens at launch" },
}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  // Leave the unrelated checkout-return handler suspended in its normal boundary.
  useSearchParams: () => {
    throw new Promise(() => {});
  },
}));
vi.mock("@/components/career-assistant", () => ({ CareerChat: () => null }));
vi.mock("@/components/role-strength", () => ({ RoleStrength: () => null }));
vi.mock("@/components/animated-art", () => ({ AnimatedArt: () => null }));
import {
  CareersPlus,
  ApplicationStudio,
} from "../src/components/premium-pages";
import { FoundingHome } from "../src/app/launch/_components/founding-launch";

beforeEach(() => {
  vi.clearAllMocks();
  m.mountEffects.length = 0;
  m.session.mockReturnValue({
    loading: false,
    user: { id: "free-business" },
    business: { kind: "employer" },
    isPremium: false,
  });
});
describe("Careers+ browsing and public launch plans", () => {
  it.each(["employer", "agency"])(
    "explains launch availability on Careers+ entry for an unpaid %s while keeping the shared production page",
    (kind) => {
      m.session.mockReturnValue({ ...m.session(), business: { kind } });
      renderToStaticMarkup(createElement(CareersPlus));
      const studio = renderToStaticMarkup(
        createElement(ApplicationStudio, { jobs: [], isDemoInventory: false }),
      );
      for (const effect of m.mountEffects) effect()?.();
      expect(m.notify).toHaveBeenCalledWith({
        title: "Careers+ opens at launch",
      });
      expect(studio).toContain("three free Assistant requests");
    },
  );
  it("shows both sets of subscription prices on the homepage before an account exists", () => {
    m.session.mockReturnValue({
      loading: false,
      user: null,
      business: null,
      isPremium: false,
    });
    const html = renderToStaticMarkup(createElement(FoundingHome));
    for (const plan of [
      "Employer Starter",
      "Employer Growth",
      "Employer Enterprise",
      "Agency Starter",
      "Agency Growth",
      "Agency Enterprise",
    ])
      expect(html).toContain(plan);
    expect(html).toContain("A$129");
    expect(html).toContain("A$199");
    expect(html).toContain('id="plans"');
    expect(html).toContain("Optional monthly subscriptions.");
    expect(html).toContain("/images/cafe-team.webp");
  });
});
