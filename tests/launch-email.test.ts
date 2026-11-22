import { expect, it } from "vitest";
import { renderLaunchEmail } from "../supabase/functions/_shared/launch-email";
const snapshot = {
  title: "Westmere Careers is live across Australia",
  message: "launch",
  siteOrigin: "https://westmere.com.au",
  unsubscribeUrl:
    "https://westmere.com.au/launch/unsubscribe?token=10000000-0000-4000-8000-000000000001",
};
it("uses the canonical domain for launch email actions, branding and removal", () => {
  const mail = renderLaunchEmail(
    "10000000-0000-4000-8000-000000000002",
    "member@example.test",
    snapshot,
  );
  expect(mail.subject).toContain("across Australia");
  expect(mail.html).not.toContain("vercel.app");
  expect(mail.html).toContain(snapshot.unsubscribeUrl);
  expect(mail.to).toEqual(["member@example.test"]);
  expect(mail.text).toContain("https://westmere.com.au");
});
it("rejects a cross-domain unsubscribe destination", () => {
  expect(() =>
    renderLaunchEmail(
      "10000000-0000-4000-8000-000000000002",
      "member@example.test",
      {
        ...snapshot,
        unsubscribeUrl:
          "https://unrelated.example/launch/unsubscribe?token=10000000-0000-4000-8000-000000000001",
      },
    ),
  ).toThrow();
});
