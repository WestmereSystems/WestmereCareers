import { expect, it } from "vitest";
import { requirementsEvidence } from "../src/lib/requirements-evidence";
it("locates literal evidence with source attribution without claiming suitability", () => {
  const evidence = requirementsEvidence(
    ["Experience with CRM systems", "Payroll expertise"],
    "Managed CRM systems for a support team.",
    "I would welcome an interview.",
  );
  expect(evidence[0].excerpts).toEqual([
    { source: "CV", text: "Managed CRM systems for a support team." },
  ]);
  expect(evidence[1].excerpts).toEqual([]);
  expect(evidence[0]).not.toHaveProperty("score");
});
it("excludes sensitive criteria and does not make substring matches", () => {
  const evidence = requirementsEvidence(
    ["Age under 30", "Native English speaker", "Art skills"],
    "Native English speaker, aged 24. Department administration.",
    "",
  );
  expect(
    evidence
      .slice(0, 2)
      .every((row) => row.excluded && row.excerpts.length === 0),
  ).toBe(true);
  expect(evidence[2].excerpts).toEqual([]);
});

import { requirementsEvidenceScore } from "../src/lib/requirements-evidence";
it("measures document wording coverage, excludes sensitive criteria and leaves empty criteria unscored", () => {
  const evidence = requirementsEvidence(
    ["CRM systems", "Payroll expertise", "Age under 30", "Experience required"],
    "Managed CRM systems.",
    "",
  );
  expect(requirementsEvidenceScore(evidence)).toEqual({
    evidenced: 1,
    total: 2,
    score: 50,
  });
  expect(requirementsEvidenceScore([])).toEqual({
    evidenced: 0,
    total: 0,
    score: null,
  });
});
