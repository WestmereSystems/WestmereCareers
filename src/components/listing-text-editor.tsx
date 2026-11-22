"use client";
import { useState, type ReactNode } from "react";
import { Eye, Pencil } from "lucide-react";
import { ListingCopy } from "./listing-copy";
import { listingLabels, type ListingLabels } from "@/lib/listing-copy";
import { formatSalary } from "@/lib/search";
import type { Job } from "@/lib/jobs";
type Copy = Pick<
  Job,
  | "description"
  | "responsibilities"
  | "requirements"
  | "skills"
  | "contentLabels"
>;
export function ListingTextEditor({
  initial,
  title,
  company,
  location,
  workMode,
  employmentType,
  salary,
  afterSkills,
}: {
  initial: Copy;
  title: string;
  company: string;
  location: string;
  workMode: string;
  employmentType: string;
  salary: Pick<
    Job,
    "salaryMin" | "salaryMax" | "salaryPeriod" | "superIncluded"
  >;
  afterSkills?: ReactNode;
}) {
  const [preview, setPreview] = useState(false);
  const [copy, setCopy] = useState(initial);
  const labels = { ...listingLabels, ...copy.contentLabels };
  return (
    <section
      className="listing-editor"
      aria-label="Public listing preview and text editor"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Your listing, as applicants see it</p>
          <h3>Edit in context.</h3>
        </div>
        <button
          type="button"
          className="button secondary small"
          aria-pressed={preview}
          onClick={() => setPreview((v) => !v)}
        >
          {preview ? <Pencil size={16} /> : <Eye size={16} />}
          {preview ? "Edit listing text" : "Preview public listing"}
        </button>
      </div>
      <p className="fineprint">
        Change the title and listing details above; customise every
        introduction, section heading, requirement and skill below. Preview uses
        the public listing’s typography and formatting. Company identity,
        verification and application controls are managed separately.
      </p>
      <article className="detail-card listing-editor-card">
        <header className="detail-header">
          <div className="company-monogram tone-0" aria-hidden="true">
            {company.slice(0, 1)}
          </div>
          <div>
            <h2 className="listing-preview-title">
              {title || "Your role title"}
            </h2>
            <p className="company-name">{company}</p>
          </div>
        </header>
        <div className="job-facts">
          <span>
            {location || "Location"} · {workMode}
          </span>
          <span>{employmentType}</span>
        </div>
        <div className="detail-salary">{formatSalary(salary)}</div>
        <div hidden={preview}>
          {(Object.keys(listingLabels) as (keyof ListingLabels)[]).map(
            (key) => (
              <section key={key} className="listing-inline-section">
                <label className="field-label">
                  <span className="sr-only">{key} section heading</span>
                  <input
                    className="listing-heading-input"
                    name={`${key}Heading`}
                    aria-label={`${key} section heading`}
                    value={labels[key]}
                    required={!preview}
                    maxLength={100}
                    onChange={(event) =>
                      setCopy((c) => ({
                        ...c,
                        contentLabels: {
                          ...c.contentLabels,
                          [key]: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
                {key === "skills" ? (
                  <label className="field-label">
                    <span className="fineprint">
                      Skills, separated by commas
                    </span>
                    <input
                      name="skills"
                      aria-label="Skills, separated by commas"
                      value={copy.skills.join(", ")}
                      maxLength={3000}
                      onChange={(event) =>
                        setCopy((c) => ({
                          ...c,
                          skills: event.target.value
                            .split(",")
                            .map((v) => v.trimStart()),
                        }))
                      }
                    />
                  </label>
                ) : (
                  <label className="field-label">
                    <span className="fineprint">
                      {key === "about"
                        ? "Introduction · ## headings, - bullets and **bold** supported"
                        : "One item per line"}
                    </span>
                    <textarea
                      name={key === "about" ? "description" : key}
                      aria-label={
                        key === "about"
                          ? "Role introduction"
                          : `${key} — one item per line`
                      }
                      value={
                        key === "about"
                          ? copy.description
                          : copy[key].join("\n")
                      }
                      required={key === "about" && !preview}
                      minLength={key === "about" && !preview ? 20 : undefined}
                      maxLength={key === "about" ? 20000 : 30000}
                      onChange={(event) =>
                        setCopy((c) => ({
                          ...c,
                          [key === "about" ? "description" : key]:
                            key === "about"
                              ? event.target.value
                              : event.target.value.split("\n"),
                        }))
                      }
                    />
                  </label>
                )}
                {key === "skills" && afterSkills}
              </section>
            ),
          )}
        </div>
        {preview && (
          <ListingCopy
            job={{
              ...copy,
              responsibilities: copy.responsibilities.filter((v) => v.trim()),
              requirements: copy.requirements.filter((v) => v.trim()),
              skills: copy.skills.map((v) => v.trim()).filter(Boolean),
            }}
          />
        )}
      </article>
    </section>
  );
}
