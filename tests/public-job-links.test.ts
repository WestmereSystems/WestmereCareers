import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { companyPath } from "../src/lib/company-urls";
import { JobCard } from "../src/components/job-card";
import { demoJobs } from "../src/lib/jobs";
describe("published vacancy links", () => {
  it("opens the job identifier while retaining the distinct employer profile link", () => {
    const job = {
      ...demoJobs[0],
      id: "11111111-1111-4111-8111-111111111111",
      organisationId: "22222222-2222-4222-8222-222222222222",
    };
    const html = renderToStaticMarkup(createElement(JobCard, { job }));
    expect(html).toContain(`href="/jobs/${job.id}"`);
    expect(html).not.toContain(`href="/jobs/${job.organisationId}"`);
    expect(html).toContain(
      `href="${companyPath(job.company, job.organisationId)}"`,
    );
  });
});
