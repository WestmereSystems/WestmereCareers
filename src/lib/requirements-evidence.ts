const stopWords = new Set(
  "and the with for from your our this that have will able ability strong excellent relevant skills experience candidate required requirements essential desirable demonstrated proven working work role years year minimum least within including knowledge understanding".split(
    " ",
  ),
);
// Exclude criteria involving protected/sensitive attributes rather than turning them into filters or inferences.
const sensitive =
  /\b(age|aged|gender|sex|sexual|race|racial|ethnic|nationality|citizenship|citizen|religion|religious|disability|disabled|pregnan\w*|marital|married|health|medical|birth|native|appearance|personality)\b/i;
export type RequirementEvidence = {
  requirement: string;
  terms: string[];
  excerpts: { source: "CV" | "Cover letter"; text: string }[];
  excluded: boolean;
};
/** Literal wording navigation, never a fitness score, inferred skill or ranking. */
export function requirementsEvidence(
  requirements: string[],
  cv: string,
  letter: string,
): RequirementEvidence[] {
  return requirements.slice(0, 60).map((requirement) => {
    const excluded = sensitive.test(requirement);
    const terms = excluded
      ? []
      : [
          ...new Set(
            (
              requirement.toLowerCase().match(/[\p{L}\p{N}+#.]+/gu) || []
            ).filter((word) => word.length > 2 && !stopWords.has(word)),
          ),
        ];
    const excerpts: RequirementEvidence["excerpts"] = [];
    for (const [source, text] of [
      ["CV", cv],
      ["Cover letter", letter],
    ] as const) {
      for (const line of text.split(/\n|(?<=[.!?])\s+/u)) {
        const words = new Set(
          line.toLowerCase().match(/[\p{L}\p{N}+#.]+/gu) || [],
        );
        if (terms.some((term) => words.has(term)))
          excerpts.push({ source, text: line.trim().slice(0, 500) });
        if (excerpts.length >= 3) break;
      }
      if (excerpts.length >= 3) break;
    }
    return { requirement, terms, excerpts, excluded };
  });
}

/** Transparent document-navigation measure; not an assessment of the applicant. */
export function requirementsEvidenceScore(evidence: RequirementEvidence[]) {
  const criteria = evidence.filter(
    (row) => !row.excluded && row.terms.length > 0,
  );
  const evidenced = criteria.filter((row) => row.excerpts.length > 0).length;
  return {
    evidenced,
    total: criteria.length,
    score: criteria.length
      ? Math.round((100 * evidenced) / criteria.length)
      : null,
  };
}
