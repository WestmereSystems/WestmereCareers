import type { JobFilters } from "./search";

/** Count restrictive groups, rather than counting every checkbox in one group. */
export function savedSearchFilterCount(f: JobFilters): number {
  return [
    Boolean(f.keyword?.trim()),
    Boolean(f.location?.trim()),
    Boolean(f.workMode?.length && f.workMode.length < 3),
    Boolean(f.employmentType?.length && f.employmentType.length < 4),
    Number(f.minSalary) > 0,
    Boolean(f.directOnly),
    Boolean(f.listedWithin || f.listedFrom || f.listedTo),
  ].filter(Boolean).length;
}
