import { z } from "zod";
import { requireSession } from "@/lib/server/auth";
import { requireEmployer } from "@/lib/server/employers";
import { hasDiscovery } from "@/lib/business";
import { jobRequirements } from "@/lib/role-strength";
import { requirementsEvidence } from "@/lib/requirements-evidence";
import {
  apiError,
  ApiError,
  assertSameOrigin,
  json,
  parseBody,
} from "@/lib/server/http";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { jobId, applicationIds } = await parseBody(
      request,
      z
        .object({
          jobId: z.uuid(),
          applicationIds: z.array(z.uuid()).min(1).max(20),
        })
        .strict(),
      2000,
    );
    const context = await requireSession();
    const { data: job, error } = await context.supabase
      .from("jobs")
      .select("organisation_id,requirements,skills")
      .eq("id", jobId)
      .maybeSingle();
    if (error || !job) throw new ApiError(404, "Choose an available role.");
    const { supabase, business } = await requireEmployer(job.organisation_id, false, jobId);
    const organisation = business?.organisations.find(
      (org) => org.id === job.organisation_id,
    );
    if (!organisation?.verified || !hasDiscovery(organisation.tier))
      throw new ApiError(
        403,
        "Requirements evidence is included in Employer Growth and higher plans.",
      );
    const { data: applications, error: sourceError } = await supabase.rpc(
      "list_job_applications",
      { p_job_id: jobId },
    );
    if (sourceError || !Array.isArray(applications))
      throw new ApiError(
        503,
        "Evidence could not be loaded. Refresh the candidates and try again.",
      );
    const requirements = jobRequirements(job);
    if (
      applicationIds.some(
        (id) => !applications.some((application) => application.id === id),
      )
    )
      throw new ApiError(403, "Choose applications from this role.");
    const queue = [...new Set(applicationIds)].filter((id) =>
      applications.some(
        (application) => application.id === id && !application.withdrawn_at,
      ),
    );
    const comparisons: {
      id: string;
      evidence: ReturnType<typeof requirementsEvidence>;
    }[] = [];
    // Existing single-application access control rechecks membership, verification and withdrawal for every document.
    // No new database CV-reading function or grant is introduced.
    await Promise.all(
      Array.from({ length: Math.min(4, queue.length) }, async () => {
        while (queue.length) {
          const id = queue.shift()!;
          const opened = await supabase.rpc("open_application", {
            p_application_id: id,
          });
          if (opened.error?.code === "42501") continue; // Withdrawal or access revocation wins a concurrent lookup.
          if (opened.error || !opened.data)
            throw new ApiError(
              503,
              "Refresh the candidates and try the evidence lookup again.",
            );
          comparisons.push({
            id,
            evidence: requirementsEvidence(
              requirements,
              opened.data.cv_text_snapshot || "",
              opened.data.cover_letter || "",
            ),
          });
        }
      }),
    );
    return json({ comparisons });
  } catch (error) {
    return apiError(error);
  }
}
