import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { VerificationProgress } from "../src/components/verification-progress";
it("presents verification as three accessible steps with distinct approved and rejected outcomes", () => {
  for (const status of [
    "pending",
    "needs_information",
    "approved",
    "rejected",
  ]) {
    const html = renderToStaticMarkup(
      createElement(VerificationProgress, { status }),
    );
    expect(html.match(/<li /g)).toHaveLength(3);
    expect(html).toContain('aria-current="step"');
    expect(html).toContain(
      status === "approved"
        ? "Approved"
        : status === "rejected"
          ? "Not approved"
          : status === "needs_information"
            ? "More information needed"
            : "Under review",
    );
    if (status === "rejected") expect(html).toContain("is-rejected");
  }
});
