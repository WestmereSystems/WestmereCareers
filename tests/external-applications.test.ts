import { beforeEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { externalApplicationTarget } from "../src/lib/external-applications";
import {
  ApplicationMethodFields,
  ExternalApplicationPanel,
} from "../src/components/application-method";
const m = vi.hoisted(() => ({
  session: vi.fn(),
  auth: vi.fn(),
  admin: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({ requireSession: m.auth }));
vi.mock("@/lib/premium/providers", () => ({ premiumAdmin: m.admin }));
import { POST as submitApplication } from "../src/app/api/applications/route";
vi.mock("../src/components/providers", () => ({
  useSession: m.session,
  SaveButton: () => null,
}));
vi.mock("../src/components/notices", () => ({
  useNotice: () => vi.fn(),
  individualNotice: {},
}));
import { ApplyPanel } from "../src/components/candidate-pages";
import type { Job } from "../src/lib/jobs";
const url =
  "https://careers.example.com.au/apply/123?source=westmere&ref=job#application";
beforeEach(() =>
  m.session.mockReturnValue({ user: null, business: null, loading: false }),
);
it("preserves the full employer URL, including job-specific query and fragment", () => {
  expect(externalApplicationTarget(url)?.href).toBe(url);
});
it("rejects malformed, credential-bearing, local and Westmere destinations", () => {
  for (const value of [
    null,
    {},
    "//example.com/apply",
    "data:text/html,x",
    "https://user:pass@example.com/apply",
    "https://localhost/apply",
    "https://hiring.local/apply",
    "https://192.168.1.1/apply",
    "https://[::1]/apply",
    "https://westmere.com.au/jobs/123",
    "https://auth.westmere.com.au",
    "https://westmere-careers.vercel.app/jobs/123",
    "https://careers.example.com/" + "a".repeat(2000),
  ])
    expect(externalApplicationTarget(value)).toBeNull();
});
it("renders the exact external portal in a separate protected tab without a Westmere form", () => {
  const html = renderToStaticMarkup(
    createElement(ExternalApplicationPanel, { url }),
  );
  expect(html).toContain(
    'href="https://careers.example.com.au/apply/123?source=westmere&amp;ref=job#application"',
  );
  expect(html).toContain('target="_blank"');
  expect(html).toContain('rel="noopener noreferrer"');
  expect(html).toContain('referrerPolicy="no-referrer"');
  expect(html).toContain("careers.example.com.au");
  expect(html).not.toContain("<form");
});
it.each([
  { user: null, business: null, loading: false },
  { user: { id: "employer" }, business: { kind: "employer" }, loading: false },
  { user: null, business: null, loading: true },
])(
  "allows an external destination without Westmere sign-in or applicant access: %j",
  (session) => {
    m.session.mockReturnValue(session);
    const html = renderToStaticMarkup(
      createElement(ApplyPanel, {
        job: { id: "external", source: "external", externalUrl: url } as Job,
        isDemo: false,
      }),
    );
    expect(html).toContain("Apply on employer website");
    expect(html).not.toContain("Use a personal account");
    expect(html).not.toContain("Checking application access");
    expect(html).not.toContain("Apply for this role");
  },
);
it("never exposes a live link for a demo or falls back to Westmere when the destination is invalid", () => {
  for (const props of [
    { url, isDemo: true },
    { url: "javascript:alert(1)" },
    { url: undefined },
  ]) {
    const html = renderToStaticMarkup(
      createElement(ExternalApplicationPanel, props),
    );
    expect(html).not.toContain("href=");
    expect(html).not.toContain("<form");
  }
});
it("loads the saved external editor option and its required HTTPS field", () => {
  const html = renderToStaticMarkup(
    createElement(ApplicationMethodFields, {
      source: "external",
      externalUrl: url,
    }),
  );
  expect(html).toContain('value="external" selected=""');
  expect(html).toContain('name="externalUrl"');
  expect(html).toContain('type="url"');
  expect(html).toContain('required=""');
  expect(html).toContain(
    "Changing the method does not move or delete existing applications",
  );
  const direct = renderToStaticMarkup(createElement(ApplicationMethodFields));
  expect(direct).toContain('value="direct" selected=""');
  expect(direct).not.toContain('name="externalUrl"');
});
it("rejects Westmere submissions for an external role before preparing any private file or application write", async () => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://westmere.test");
  m.admin.mockClear();
  const q = {
    select: () => q,
    eq: () => q,
    maybeSingle: async () => ({
      data: {
        id: "e1000000-0000-4000-8000-000000000001",
        source: "external",
        status: "published",
        published_at: new Date(Date.now() - 86400000).toISOString(),
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      },
      error: null,
    }),
  };
  m.auth.mockResolvedValue({
    user: { id: "candidate" },
    business: null,
    supabase: { from: () => q },
  });
  try {
    const response = await submitApplication(
      new Request("https://westmere.test/api/applications", {
        method: "POST",
        headers: {
          origin: "https://westmere.test",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jobId: "e1000000-0000-4000-8000-000000000001",
          cvText:
            "Synthetic application text used only for API denial verification. ".repeat(
              2,
            ),
          consent: true,
        }),
      }),
    );
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("EXTERNAL_APPLICATION");
    expect(m.admin).not.toHaveBeenCalled();
  } finally {
    vi.unstubAllEnvs();
  }
});
