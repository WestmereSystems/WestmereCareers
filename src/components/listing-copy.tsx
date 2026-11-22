import type { Job } from "@/lib/jobs";
import { listingLabels } from "@/lib/listing-copy";
import { RichText } from "./rich-text";
export function ListingCopy({
  job,
}: {
  job: Pick<
    Job,
    | "description"
    | "responsibilities"
    | "requirements"
    | "skills"
    | "contentLabels"
  >;
}) {
  const labels = { ...listingLabels, ...job.contentLabels };
  return (
    <>
      <h2>{labels.about}</h2>
      <RichText text={job.description} />
      {(["responsibilities", "requirements"] as const).map(
        (key) =>
          job[key].length > 0 && (
            <section key={key}>
              <h2>{labels[key]}</h2>
              <ul>
                {job[key].map((text, index) => (
                  <li key={index}>{text}</li>
                ))}
              </ul>
            </section>
          ),
      )}
      {job.skills.length > 0 && (
        <section>
          <h2>{labels.skills}</h2>
          <div className="job-tags">
            {job.skills.map((skill, index) => (
              <span key={index}>{skill}</span>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
