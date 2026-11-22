import type { Job } from "./jobs";
import {
  requirementsEvidence,
  requirementsEvidenceScore,
} from "./requirements-evidence";
/** Shared with the employer view; only explicit requirements and skills enter the measure. */
export function jobRequirements(job: Pick<Job, "requirements" | "skills">) {
  return [...job.requirements, ...job.skills];
}
export function roleStrength(
  job: Pick<Job, "requirements" | "skills">,
  cv: string,
  coverLetter = "",
) {
  const evidence = requirementsEvidence(jobRequirements(job), cv, coverLetter);
  return { ...requirementsEvidenceScore(evidence), evidence };
}
export type RoleStrengthMeasure = ReturnType<typeof roleStrength>;
export type RoleStrengthMatch = { job: Job; measure: RoleStrengthMeasure };
export function compareRoleStrength(
  a: RoleStrengthMatch,
  b: RoleStrengthMatch,
) {
  return (
    (b.measure.score ?? -1) - (a.measure.score ?? -1) ||
    b.job.postedAt.localeCompare(a.job.postedAt) ||
    a.job.id.localeCompare(b.job.id)
  );
}
export function suggestedRoleTitle(title: string) {
  return title.replace(/^TEST ONLY\s*[—–:-]\s*/i, "").trim();
}
