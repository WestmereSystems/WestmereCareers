"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Plus,
  FileText,
  LoaderCircle,
  Check,
  Eye,
  MessageCircle,
  PencilLine,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ListingDocuments } from "./employer-branding";
import { useSession } from "./providers";
import { sendJson } from "./trust-workflows";
import { DashboardSkeleton } from "./skeleton";
import { ConfirmAction } from "./confirm-action";
import { jobSuggestions, locationSuggestions } from "@/lib/suggestions";
import { findPlace } from "@/lib/locations";
import { hasDiscovery } from "@/lib/business";
import { ApplicationProfileSummary } from "./candidate-profile";
import {
  type CandidateProfile,
  workRightsOptions,
  attachmentKinds,
} from "@/lib/candidate-profile";
import {
  requirementsEvidenceScore,
  type RequirementEvidence,
} from "@/lib/requirements-evidence";
import { ListingTextEditor } from "./listing-text-editor";
import { AgencyRoleFields } from "./agency-role-fields";
import { EmployerInsights } from "./employer-insights";
import { ApplicationMethodFields } from "./application-method";
import { externalApplicationTarget } from "@/lib/external-applications";

type Role = {
  id: string;
  title: string;
  published_at?: string | null;
  status: string;
  location: string;
  moderation_status: string;
  publication_requested: boolean;
  organisation_id: string;
  city: string;
  state: string;
  category: string;
  work_mode: string;
  employment_type: string;
  salary_min: number | null;
  salary_max: number | null;
  content_labels?: import("@/lib/listing-copy").ListingLabels;
  salary_period: string;
  super_included: boolean;
  description: string;
  responsibilities: string[];
  requirements: string[];
  skills: string[];
  contact_email?: string | null;
  source: "direct" | "external";
  external_url?: string | null;
  agency_hiring_mode?: "internal" | "client";
  recruitment_lead?: string | null;
  listing_documents?: { id: string; filename: string; bytes: number }[];
  expires_at?: string | null;
  listing_review_feedback: { message: string } | null;
};
type Membership = {
  organisation_id: string;
  role: string;
  organisations: {
    id: string;
    name: string;
    kind?: "employer" | "agency";
    is_verified: boolean;
    suspended_at: string | null;
    description?: string;
    careers_email?: string | null;
    avatar_path?: string | null;
    banner_path?: string | null;
  };
};
type Applicant = {
  candidate_name?: string | null;
  opened_at?: string | null;
  id: string;
  status: string;
  created_at: string;
  withdrawn_at: string | null;
};
type PrivateApplication = {
  id: string;
  cv_text_snapshot: string;
  cover_letter: string;
  status: string;
  candidate_id: string;
  candidate_name_snapshot?: string | null;
  candidate_profile?: CandidateProfile;
  answers?: Record<string, string>;
  documents?: {
    id: string;
    filename: string;
    media_type: string;
    kind?: keyof typeof attachmentKinds | "cv";
  }[];
};
export function EmployerWorkspace({
  view = "roles",
}: {
  view?: "roles" | "applicants";
}) {
  const session = useSession();
  return (
    <EmployerWorkspaceForUser
      key={`${session.user?.id ?? "signed-out"}:${view}`}
      view={view}
    />
  );
}
function EmployerWorkspaceForUser({ view }: { view: "roles" | "applicants" }) {
  const jobParameter = useSearchParams().get("job");
  const initialReview = useRef(false);
  const detail = useRef<HTMLElement>(null);
  const session = useSession();
  const [roles, setRoles] = useState<Role[]>([]);
  type Overview = {
    id: string;
    views: number | null;
    applications: number | null;
    accessLimited?: boolean;
    activity: {
      action: string;
      created_at: string;
      actor_email: string | null;
      details: { expiresAt?: string };
    }[];
  };
  const [overview, setOverview] = useState<Overview[]>([]);
  const [archiveRole, setArchiveRole] = useState<Role | null>(null);
  const [pool, setPool] = useState<string[]>([]);
  const [confirmPool, setConfirmPool] = useState(false);
  const [titleQuery, setTitleQuery] = useState("");
  const [cityQuery, setCityQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<Membership[]>([]);
  const postingMembers = members.filter(
    (member) =>
      ["owner", "admin", "recruiter"].includes(member.role) &&
      !member.organisations.suspended_at,
  );
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(false);
  const [draftFacts, setDraftFacts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Role | null>(null);
  useEffect(() => {
    if (form)
      document
        .getElementById("role-editor")
        ?.scrollIntoView({ block: "start" });
    setDraftFacts({});
  }, [form, editing?.id]);
  const [selected, setSelected] = useState("");
  const selectedBusiness = session.business?.organisations.find(
    (org) =>
      org.id === roles.find((role) => role.id === selected)?.organisation_id,
  );
  const canShowEvidence = Boolean(
    selectedBusiness?.verified && hasDiscovery(selectedBusiness.tier),
  );
  const [evidence, setEvidence] = useState<
    { id: string; evidence: RequirementEvidence[] }[] | null
  >(null);
  const [evidenceBusy, setEvidenceBusy] = useState(false);
  const [evidenceProgress, setEvidenceProgress] = useState(0);
  const evidenceRequest = useRef<AbortController | null>(null);
  const [candidateSort, setCandidateSort] = useState("submitted");
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [applicantLoading, setApplicantLoading] = useState(false);
  const [application, setApplication] = useState<PrivateApplication | null>(
    null,
  );
  const [stage, setStage] = useState("shortlisted");
  const [update, setUpdate] = useState("");
  const reviewVersion = useRef(0);
  const openVersion = useRef(0);
  async function load(signal?: AbortSignal, quiet = false) {
    if (!quiet) setLoading(true);
    try {
      const r = await fetch("/api/employers", { cache: "no-store", signal });
      const data = await r.json();
      if (r.ok) {
        setRoles(data.jobs || []);
        setOverview(data.overview || []);
        setMembers(data.memberships || []);
        if (data.message) setMessage(data.message);
      } else setMessage(data.error);
    } catch {
      if (!signal?.aborted)
        setMessage("The hiring workspace is temporarily unavailable.");
    } finally {
      if (!signal?.aborted && !quiet) setLoading(false);
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    if (session.user) void load(controller.signal);
    return () => {
      controller.abort();
      evidenceRequest.current?.abort();
      reviewVersion.current++;
      openVersion.current++;
    };
  }, [session.user?.id]);
  useEffect(() => {
    if (
      view === "applicants" &&
      !loading &&
      !initialReview.current &&
      roles.length
    ) {
      initialReview.current = true;
      if (jobParameter && roles.some((role) => role.id === jobParameter))
        void review(jobParameter);
    }
  }, [view, loading, jobParameter, roles]);
  useEffect(() => {
    if (application) {
      detail.current?.scrollIntoView({ block: "start", behavior: "smooth" });
      detail.current?.focus({ preventScroll: true });
    }
  }, [application?.id]);
  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!postingMembers.length) return;
    const data = new FormData(event.currentTarget);
    setBusy(true);
    try {
      const r = await fetch("/api/employers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editing ? { id: editing.id } : {}),
          organisationId: String(data.get("organisation")),
          ...(data.get("agencyMode")
            ? {
                agencyMode: data.get("agencyMode"),
                authorisationId: data.get("authorisationId") || null,
                leadUserId: data.get("leadUserId"),
                recruitmentLead: data.get("recruitmentLead"),
              }
            : {}),
          title: String(data.get("title")),
          expiresAt: data.get("closingDate")
            ? new Date(String(data.get("closingDate"))).toISOString()
            : null,
          location: `${findPlace(String(data.get("city")), String(data.get("state")))?.city || data.get("city")}, ${data.get("state")}`,
          city:
            findPlace(String(data.get("city")), String(data.get("state")))
              ?.city || String(data.get("city")),
          state: String(data.get("state")),
          category: String(data.get("category")),
          workMode: String(data.get("workMode")),
          employmentType: String(data.get("employmentType")),
          salaryMin: data.get("salaryMin")
            ? Number(data.get("salaryMin"))
            : null,
          salaryMax: data.get("salaryMax")
            ? Number(data.get("salaryMax"))
            : null,
          salaryPeriod: String(data.get("salaryPeriod")),
          superIncluded: data.get("superIncluded") === "on",
          contentLabels: Object.fromEntries(
            ["about", "responsibilities", "requirements", "skills"].map(
              (key) => [key, String(data.get(`${key}Heading`) || "")],
            ),
          ),
          description: String(data.get("description")),
          responsibilities: String(data.get("responsibilities") || "")
            .split("\n")
            .filter(Boolean),
          requirements: String(data.get("requirements") || "")
            .split("\n")
            .filter(Boolean),
          skills: String(data.get("skills") || "")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
          contactEmail: String(data.get("contactEmail") || ""),
          source: String(data.get("source") || "direct"),
          externalUrl:
            String(data.get("source")) === "external"
              ? String(data.get("externalUrl") || "")
              : "",
          publish: data.get("publish") === "on",
          complianceConfirmed: data.get("complianceConfirmed") === "on",
        }),
      });
      const result = await r.json();
      setMessage(result.message || result.error);
      if (r.ok) {
        setForm(false);
        setEditing(null);
        await load();
      }
    } catch {
      setMessage("Your role was not saved. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function compareEvidence() {
    if (evidence) {
      setEvidence(null);
      return;
    }
    setEvidenceBusy(true);
    setEvidenceProgress(0);
    const controller = new AbortController();
    evidenceRequest.current = controller;
    const version = reviewVersion.current;
    try {
      const ids = applicants
        .filter((application) => !application.withdrawn_at)
        .map((application) => application.id);
      const collected: { id: string; evidence: RequirementEvidence[] }[] = [];
      for (let index = 0; index < ids.length; index += 20) {
        const response = await fetch("/api/employers/applications/evidence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            jobId: selected,
            applicationIds: ids.slice(index, index + 20),
          }),
        });
        const data = await response.json();
        if (version !== reviewVersion.current || controller.signal.aborted)
          return;
        if (!response.ok)
          throw Error(data.error || "Evidence could not be loaded.");
        collected.push(...data.comparisons);
        setEvidence([...collected]);
        setEvidenceProgress(Math.min(index + 20, ids.length));
      }
      const updated = await fetch(
        `/api/employers/applications?job=${encodeURIComponent(selected)}`,
        { cache: "no-store" },
      );
      if (updated.ok && version === reviewVersion.current) {
        const body = await updated.json();
        setApplicants(body.applications);
      }
    } catch (cause) {
      if (!controller.signal.aborted && version === reviewVersion.current)
        setMessage(cause instanceof Error ? cause.message : "Try again.");
    } finally {
      if (version === reviewVersion.current) setEvidenceBusy(false);
      if (evidenceRequest.current === controller)
        evidenceRequest.current = null;
    }
  }
  async function review(jobId: string) {
    evidenceRequest.current?.abort();
    setEvidenceBusy(false);
    const version = ++reviewVersion.current;
    openVersion.current++;
    setSelected(jobId);
    setApplicantLoading(true);
    setEvidence(null);
    setCandidateSort("submitted");
    setPool([]);
    setApplication(null);
    setApplicants([]);
    setUpdate("");
    try {
      const r = await fetch(
        `/api/employers/applications?job=${encodeURIComponent(jobId)}`,
        { cache: "no-store" },
      );
      const data = await r.json();
      if (version !== reviewVersion.current) return;
      if (r.ok) {
        setApplicants(data.applications);
        setPool(
          data.applications
            .filter(
              (a: Applicant) =>
                ["shortlisted", "interview", "offer"].includes(a.status) &&
                !a.withdrawn_at,
            )
            .map((a: Applicant) => a.id),
        );
      } else setMessage(data.error);
    } catch {
      if (version === reviewVersion.current)
        setMessage("Applications could not be loaded.");
    } finally {
      if (version === reviewVersion.current) setApplicantLoading(false);
    }
  }
  async function open(id: string) {
    const version = reviewVersion.current;
    const opening = ++openVersion.current;
    setApplication(null);
    try {
      const r = await fetch("/api/employers/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId: id }),
      });
      const data = await r.json();
      if (version !== reviewVersion.current || opening !== openVersion.current)
        return;
      if (r.ok) {
        setApplication(data.application);
        const refreshed = await fetch(
          `/api/employers/applications?job=${encodeURIComponent(selected)}`,
          { cache: "no-store" },
        );
        const refreshedData = await refreshed.json();
        if (
          refreshed.ok &&
          version === reviewVersion.current &&
          opening === openVersion.current
        )
          setApplicants(refreshedData.applications || []);
      } else setMessage(data.error);
    } catch {
      if (version === reviewVersion.current && opening === openVersion.current)
        setMessage("This application could not be opened.");
    }
  }
  async function sendUpdate(event: React.FormEvent) {
    event.preventDefault();
    if (!application) return;
    const version = reviewVersion.current;
    setBusy(true);
    try {
      const r = await fetch("/api/employers/applications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: application.id,
          status: stage,
          message: update,
        }),
      });
      const data = await r.json();
      if (version !== reviewVersion.current) return;
      setMessage(data.message || data.error);
      if (r.ok) {
        setUpdate("");
        await review(selected);
      }
    } catch {
      setMessage("The candidate update was not recorded. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  if (session.loading || (session.user && loading))
    return <DashboardSkeleton />;
  if (!session.user)
    return (
      <div className="employer-signed-out">
        <EmployerInsights />
        <div className="panel">
          <span className="round-icon">
            <FileText size={25} />
          </span>
          <h2>Your hiring workspace.</h2>
          <p className="muted" style={{ fontSize: 16, margin: "16px 0 22px" }}>
            Sign in to create clear opportunities and keep your candidates
            informed.
          </p>
          <button className="button primary" onClick={session.openAuth}>
            Sign in to start hiring
            <ArrowRight size={17} />
          </button>
          <p className="working-notice">
            Business ownership review is required before a new employer can
            publish. The development preview does not accept live job
            advertisements.
          </p>
        </div>
      </div>
    );
  return (
    <>
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}
      <div className="section-heading">
        <div>
          <p className="eyebrow">Your hiring workspace</p>
          <h2>
            {view === "applicants" ? "Review applicants." : "Your roles."}
          </h2>
        </div>
        {view === "roles" && postingMembers.length > 0 && (
          <button
            className="button primary"
            onClick={() => {
              setEditing(null);
              setForm(!form);
            }}
          >
            <Plus size={17} />
            Create a role
          </button>
        )}
      </div>
      {!members.length ? (
        <div className="panel">
          <h3>Let’s get to know your business first.</h3>
          <p className="muted" style={{ marginTop: 14 }}>
            Your account needs an approved organisation membership before you
            can publish or access applications. Submit the business details in
            the Verification tab for independent review.
          </p>
        </div>
      ) : null}
      <p>
        <Link className="text-link" href="/notifications">
          View hiring notifications →
        </Link>
      </p>
      {session.sampleWorkspace && (
        <p className="notice">
          <Link href="/employers/sample">
            Open your private sample hiring workspace
          </Link>
        </p>
      )}

      {view === "roles" && form && (
        <form
          className="panel employer-form"
          key={editing?.id ?? "new"}
          id="role-editor"
          onSubmit={create}
          onChange={(event) =>
            setDraftFacts(
              Object.fromEntries(
                [...new FormData(event.currentTarget)].filter(
                  (entry): entry is [string, string] =>
                    typeof entry[1] === "string",
                ),
              ),
            )
          }
          style={{ marginBottom: 25 }}
        >
          <h2 style={{ fontSize: 26 }}>
            {editing
              ? "Refine your opportunity."
              : "A clear role is a great beginning."}
          </h2>
          {editing && (
            <p className="notice">
              {session.marketplaceOpen
                ? "Saving without publishing keeps a private draft. Select Publish to submit your changes; owner permission and Westmere’s release remain required."
                : "Your business details and vacancies are not public. Save a private draft or submit it for review ahead of launch. Verification and review do not make it public."}
            </p>
          )}
          <label className="field-label">
            Hiring business
            <select
              name="organisation"
              required
              defaultValue={editing?.organisation_id}
            >
              {postingMembers.map((m) => (
                <option value={m.organisation_id} key={m.organisation_id}>
                  {m.organisations.name}
                </option>
              ))}
            </select>
          </label>
          {postingMembers.find(
            (m) =>
              m.organisation_id ===
              (draftFacts.organisation ||
                editing?.organisation_id ||
                postingMembers[0]?.organisation_id),
          )?.organisations.kind === "agency" && (
            <AgencyRoleFields
              key={
                draftFacts.organisation ||
                editing?.organisation_id ||
                postingMembers[0]?.organisation_id
              }
              organisationId={
                draftFacts.organisation ||
                editing?.organisation_id ||
                postingMembers[0]?.organisation_id
              }
              jobId={editing?.id}
              mode={editing?.agency_hiring_mode}
              leadName={editing?.recruitment_lead || ""}
            />
          )}
          <label className="field-label">
            Role title
            <input
              name="title"
              defaultValue={editing?.title}
              list="role-title-suggestions"
              onChange={(e) => setTitleQuery(e.target.value)}
              required
              minLength={3}
              maxLength={180}
              placeholder="e.g. Customer Success Manager"
            />
          </label>
          <datalist id="role-title-suggestions">
            {jobSuggestions(titleQuery).map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
          <div className="account-grid">
            <label className="field-label">
              City or suburb
              <input
                name="city"
                defaultValue={editing?.city}
                required
                list="role-location-suggestions"
                onChange={(e) => {
                  setCityQuery(e.target.value);
                  const place = findPlace(e.target.value);
                  if (place) {
                    const state = e.target.form?.elements.namedItem(
                      "state",
                    ) as HTMLSelectElement | null;
                    if (state) state.value = place.state;
                  }
                }}
              />
              <datalist id="role-location-suggestions">
                {locationSuggestions(cityQuery)
                  .filter((v) => v !== "Anywhere in Australia")
                  .map((v) => (
                    <option key={v} value={v} />
                  ))}
              </datalist>
            </label>
            <label className="field-label">
              State or territory
              <select name="state" defaultValue={editing?.state}>
                {["VIC", "NSW", "QLD", "WA", "SA", "TAS", "ACT", "NT"].map(
                  (s) => (
                    <option key={s}>{s}</option>
                  ),
                )}
              </select>
            </label>
          </div>
          <label className="field-label">
            Closing date & time · optional
            <input
              type="datetime-local"
              name="closingDate"
              defaultValue={
                editing?.expires_at
                  ? new Date(
                      Date.parse(editing.expires_at) -
                        new Date(editing.expires_at).getTimezoneOffset() *
                          60000,
                    )
                      .toISOString()
                      .slice(0, 16)
                  : ""
              }
            />
            <span className="fineprint">
              Your device’s local timezone. New roles expire after 40 days if
              blank. Used for listing expiry and your team’s closing reminders.
            </span>
          </label>
          <label className="field-label">
            Category
            <input
              name="category"
              defaultValue={editing?.category}
              required
              placeholder="e.g. Technology"
            />
          </label>
          <div className="account-grid">
            <label className="field-label">
              Working arrangement
              <select name="workMode" defaultValue={editing?.work_mode}>
                {["Hybrid", "Remote", "On-site"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Employment type
              <select
                name="employmentType"
                defaultValue={editing?.employment_type}
              >
                {["Full time", "Part time", "Contract", "Casual"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="account-grid">
            <label className="field-label">
              Minimum salary (A$) · optional
              <input
                name="salaryMin"
                defaultValue={editing?.salary_min ?? ""}
                type="number"
                min={0}
                max={100000000}
                step="0.01"
              />
            </label>
            <label className="field-label">
              Maximum salary (A$) · optional
              <input
                name="salaryMax"
                defaultValue={editing?.salary_max ?? ""}
                type="number"
                min={0}
                max={100000000}
                step="0.01"
              />
            </label>
          </div>
          <label className="field-label">
            Pay period
            <select name="salaryPeriod" defaultValue={editing?.salary_period}>
              <option value="year">Per year</option>
              <option value="hour">Per hour</option>
            </select>
          </label>
          <label className="checkbox-label">
            <input
              name="superIncluded"
              type="checkbox"
              defaultChecked={editing?.super_included}
            />
            These amounts include superannuation
          </label>
          <p className="fineprint">
            Salary is optional. Leave both amounts blank to show “Salary not
            specified”.
          </p>
          <ListingTextEditor
            afterSkills={
              editing ? (
                <ListingDocuments
                  role={roles.find((role) => role.id === editing.id) || editing}
                  onSaved={() => void load(undefined, true)}
                />
              ) : (
                <p className="fineprint">
                  Save this role first, then edit it to add supporting
                  documents.
                </p>
              )
            }
            initial={{
              description: editing?.description || "",
              responsibilities: editing?.responsibilities || [],
              requirements: editing?.requirements || [],
              skills: editing?.skills || [],
              contentLabels: editing?.content_labels,
            }}
            title={draftFacts.title ?? editing?.title ?? ""}
            company={
              members.find(
                (m) =>
                  m.organisation_id ===
                  (draftFacts.organisation ||
                    editing?.organisation_id ||
                    postingMembers[0]?.organisation_id),
              )?.organisations.name || "Your company"
            }
            location={`${draftFacts.city ?? editing?.city ?? ""}, ${draftFacts.state ?? editing?.state ?? "VIC"}`}
            workMode={draftFacts.workMode ?? editing?.work_mode ?? "Hybrid"}
            employmentType={
              draftFacts.employmentType ??
              editing?.employment_type ??
              "Full time"
            }
            salary={{
              salaryMin:
                draftFacts.salaryMin !== undefined
                  ? draftFacts.salaryMin
                    ? Number(draftFacts.salaryMin)
                    : null
                  : (editing?.salary_min ?? null),
              salaryMax:
                draftFacts.salaryMax !== undefined
                  ? draftFacts.salaryMax
                    ? Number(draftFacts.salaryMax)
                    : null
                  : (editing?.salary_max ?? null),
              salaryPeriod: (draftFacts.salaryPeriod ||
                editing?.salary_period ||
                "year") as "year" | "hour",
              superIncluded:
                draftFacts.superIncluded !== undefined
                  ? true
                  : editing?.super_included || false,
            }}
          />
          <ApplicationMethodFields
            source={editing?.source}
            externalUrl={editing?.external_url}
          />
          <label className="field-label">
            Contact email for this listing · optional
            <input
              name="contactEmail"
              type="email"
              maxLength={254}
              defaultValue={editing?.contact_email || ""}
            />
            <span className="fineprint">
              Public, revealed by click. Use a work address you are authorised
              to publish.
            </span>
          </label>
          <label className="checkbox-label">
            <input type="checkbox" name="publish" />
            {session.marketplaceOpen
              ? "Request publication (verified businesses only); otherwise save a draft"
              : "Submit for pre-launch review (verified businesses only); this stays private"}
          </label>
          <label className="checkbox-label">
            <input type="checkbox" name="complianceConfirmed" />I am authorised
            to advertise this genuine role and have checked its pay and
            conditions against the applicable award or agreement, lawful
            recruitment requirements and any required labour-hire licence. The
            employer or agency is responsible for this advertisement and its
            hiring conduct. Required when publishing.
          </label>
          <p className="fineprint">
            <a
              href="https://www.fairwork.gov.au/starting-employment/job-ads"
              target="_blank"
              rel="noopener noreferrer"
            >
              Fair Work job-ad rules
            </a>{" "}
            ·{" "}
            <Link href="/terms#terms-listing-rules">
              Advertisement responsibilities
            </Link>
            . Flagged content needs independent review; publication is not legal
            clearance.
          </p>
          <div className="actions-row">
            <button className="button primary" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Check size={16} />
              )}
              Save this opportunity
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => {
                setForm(false);
                setEditing(null);
              }}
            >
              Close editor
            </button>
          </div>
        </form>
      )}
      {view === "roles" && roles.length > 0 && (
        <div className="employer-role-list">
          {roles.map((role) => (
            <article
              className="panel employer-role-card"
              key={role.id}
              aria-labelledby={`role-${role.id}-title`}
            >
              <div className="role-card-content">
                <h3 id={`role-${role.id}-title`}>{role.title}</h3>
                <div className="role-metrics">
                  <span>
                    {overview.find((o) => o.id === role.id)?.accessLimited
                      ? "Restricted"
                      : (overview.find((o) => o.id === role.id)?.views ??
                        0)}{" "}
                    recorded views
                  </span>
                  <span>
                    {overview.find((o) => o.id === role.id)?.accessLimited
                      ? "Restricted"
                      : (overview.find((o) => o.id === role.id)?.applications ??
                        0)}{" "}
                    active Westmere applications
                  </span>
                  <span>
                    {role.expires_at
                      ? `Closes ${new Date(role.expires_at).toLocaleString("en-AU")}`
                      : "No closing time"}
                  </span>
                </div>
                <p className="fineprint">
                  Views count visitors who allow optional analytics. Renewing
                  retains this role’s views and applications.
                </p>
                {role.source === "external" && (
                  <p className="fineprint">
                    External applications ·{" "}
                    {externalApplicationTarget(role.external_url)?.hostname ||
                      "Check the application URL"}
                    . Submissions on that website are not counted here. Existing
                    Westmere applications remain available.
                  </p>
                )}
                <details className="role-activity">
                  <summary>Listing activity and renewals</summary>
                  <ul>
                    {(
                      overview.find((o) => o.id === role.id)?.activity || []
                    ).map((a, i) => (
                      <li key={`${a.created_at}:${i}`}>
                        {new Date(a.created_at).toLocaleString("en-AU")} ·{" "}
                        {a.action.replaceAll("_", " ")} ·{" "}
                        {a.actor_email || "System"}
                        {a.details.expiresAt
                          ? ` · expires ${new Date(a.details.expiresAt).toLocaleString("en-AU")}`
                          : ""}
                      </li>
                    ))}
                  </ul>
                </details>
                <p>
                  {role.location} ·{" "}
                  {role.status === "closed" ? "Archived" : role.status} ·{" "}
                  {role.publication_requested
                    ? "Moderation review"
                    : role.moderation_status}
                </p>
                {role.listing_review_feedback?.message && (
                  <p className="fineprint">
                    Reviewer feedback: {role.listing_review_feedback.message}
                  </p>
                )}
              </div>
              <div className="role-card-actions">
                <div className="role-edit-action">
                  <button
                    className="button secondary role-option-button"
                    onClick={() => {
                      setEditing(role);
                      setForm(true);
                    }}
                  >
                    <PencilLine size={16} aria-hidden="true" />
                    Edit listing
                  </button>
                </div>
                <div className="role-option-actions">
                  {role.status === "draft" && (
                    <button
                      className="button secondary role-option-button"
                      onClick={async () => {
                        try {
                          const d = await sendJson(
                            "/api/employers",
                            { id: role.id, action: "submit" },
                            "PATCH",
                          );
                          setMessage(d.message);
                          await load();
                        } catch (e) {
                          setMessage(
                            e instanceof Error
                              ? e.message
                              : "Please try again.",
                          );
                        }
                      }}
                    >
                      Publish listing
                    </button>
                  )}
                  {role.status !== "closed" && (
                    <button
                      className="button secondary role-option-button"
                      onClick={() => setArchiveRole(role)}
                    >
                      Archive listing
                    </button>
                  )}
                  {role.moderation_status === "approved" &&
                    (role.published_at || role.status === "closed") && (
                      <button
                        className="button secondary role-option-button"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            const d = await sendJson(
                              "/api/employers",
                              { id: role.id, action: "renew" },
                              "PATCH",
                            );
                            setMessage(d.message);
                            await load();
                          } catch (e) {
                            setMessage(
                              e instanceof Error
                                ? e.message
                                : "Renewal failed.",
                            );
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Renew for 40 days
                      </button>
                    )}
                  <Link
                    className="button secondary role-option-button"
                    href={`/account?tab=applicants&job=${role.id}`}
                  >
                    Review applicants <ArrowRight size={15} />
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {view === "applicants" && (
        <div className="panel applicant-role-picker">
          <label className="field-label" htmlFor="applicant-role">
            Role to review
          </label>
          <select
            id="applicant-role"
            value={selected}
            onChange={(event) => {
              if (event.target.value) void review(event.target.value);
            }}
          >
            <option value="">Choose a role</option>
            {roles.map((role) => (
              <option
                key={role.id}
                value={role.id}
                disabled={overview.find((o) => o.id === role.id)?.accessLimited}
              >
                {role.title} · {role.location} ·{" "}
                {overview.find((item) => item.id === role.id)?.accessLimited
                  ? "Authority unavailable"
                  : overview.find((item) => item.id === role.id)
                      ?.applications || 0}{" "}
                applications
              </option>
            ))}
          </select>
          <p className="fineprint">
            Choose a role to see its applicants. Opening a full application or
            looking up document evidence records the first view and notifies the
            candidate once.
          </p>
        </div>
      )}
      {selected && (
        <section className="panel" style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 25 }}>
            {roles.find((role) => role.id === selected)?.title || "Applicants"}
          </h2>
          <p className="fineprint" style={{ marginTop: 12 }}>
            Opening an application records a timestamp visible to its candidate.
            Loading this list does not. The list shows the latest 1,000
            applications. Select the candidates you want to interview, then
            confirm the candidate pool to close applications and notify everyone
            else. Existing interview invitations and offers are retained.
          </p>
          {applicantLoading ? (
            <p role="status">Loading applications…</p>
          ) : applicants.length ? (
            <>
              <div className="actions-row">
                <button
                  className="button primary"
                  onClick={() => setConfirmPool(true)}
                >
                  Close applications and confirm interview pool ({pool.length})
                </button>
              </div>
              <div className="candidate-evidence-controls">
                <button
                  type="button"
                  className="button premium"
                  aria-pressed={Boolean(evidence)}
                  disabled={evidenceBusy || (!evidence && !canShowEvidence)}
                  onClick={() => void compareEvidence()}
                >
                  {evidenceBusy ? (
                    <LoaderCircle size={16} className="spin" />
                  ) : (
                    <FileText size={16} />
                  )}
                  {evidence
                    ? "Hide requirements evidence"
                    : "Show requirements evidence"}
                </button>
                {!canShowEvidence && (
                  <p className="notice">
                    {selectedBusiness?.name || "This business"} needs active
                    Growth or Enterprise coverage to show requirements evidence.
                    The billing owner can update covered businesses in Profile.
                  </p>
                )}
                {evidenceBusy && (
                  <>
                    <p role="status">
                      Reviewed {evidenceProgress} of{" "}
                      {
                        applicants.filter(
                          (application) => !application.withdrawn_at,
                        ).length
                      }{" "}
                      active applications
                    </p>
                    <button
                      type="button"
                      className="button secondary small"
                      onClick={() => {
                        evidenceRequest.current?.abort();
                        setEvidenceBusy(false);
                      }}
                    >
                      Stop lookup
                    </button>
                  </>
                )}
                <label className="field-label">
                  Sort candidates
                  <select
                    value={candidateSort}
                    onChange={(event) => setCandidateSort(event.target.value)}
                  >
                    <option value="submitted">Most recent first</option>
                    <option value="oldest">Oldest first</option>
                    <option value="score" disabled={!evidence || evidenceBusy}>
                      Requirements evidence score · highest first
                    </option>
                    <option value="name">Name</option>
                    <option value="stage">Recorded stage</option>
                  </select>
                </label>
                <p className="fineprint">
                  Growth and higher plans. Show requirements evidence to enable
                  score sorting. The score is the percentage of eligible role
                  criteria with literal wording in the submitted CV or cover
                  letter. Sensitive criteria are excluded. It can miss
                  equivalent wording and does not establish suitability or
                  verified skills. Review the original documents and make your
                  own hiring decision. Looking up evidence records first views.
                </p>
              </div>
              <div className="insights-table-scroll employer-applicant-table">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Interview pool</th>
                      <th scope="col">Candidate</th>
                      <th scope="col">Submitted</th>
                      <th scope="col">Current stage</th>
                      <th scope="col">Opened by team</th>
                      <th scope="col">Review</th>
                      {evidence && (
                        <th scope="col">Requirements evidence score</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {[...applicants]
                      .sort((a, b) =>
                        candidateSort === "name"
                          ? (a.candidate_name || "").localeCompare(
                              b.candidate_name || "",
                            )
                          : candidateSort === "stage"
                            ? a.status.localeCompare(b.status)
                            : candidateSort === "score"
                              ? (requirementsEvidenceScore(
                                  evidence?.find((row) => row.id === b.id)
                                    ?.evidence || [],
                                ).score ?? -1) -
                                  (requirementsEvidenceScore(
                                    evidence?.find((row) => row.id === a.id)
                                      ?.evidence || [],
                                  ).score ?? -1) ||
                                b.created_at.localeCompare(a.created_at)
                              : candidateSort === "oldest"
                                ? a.created_at.localeCompare(b.created_at)
                                : b.created_at.localeCompare(a.created_at),
                      )
                      .map((a, index) => (
                        <tr key={a.id}>
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`Select ${a.candidate_name || `application ${index + 1}`} for interview`}
                              disabled={
                                Boolean(a.withdrawn_at) ||
                                [
                                  "not_proceeding",
                                  "interview",
                                  "offer",
                                ].includes(a.status)
                              }
                              checked={pool.includes(a.id)}
                              onChange={(e) =>
                                setPool((ids) =>
                                  e.target.checked
                                    ? [...ids, a.id]
                                    : ids.filter((id) => id !== a.id),
                                )
                              }
                            />
                          </td>
                          <th scope="row">
                            {a.candidate_name || `Application ${index + 1}`}
                            <small>{a.id.slice(0, 8)}</small>
                          </th>
                          <td>
                            {new Date(a.created_at).toLocaleDateString("en-AU")}
                          </td>
                          <td>
                            {a.withdrawn_at
                              ? "Withdrawn"
                              : a.status.replaceAll("_", " ")}
                          </td>
                          <td>
                            {a.opened_at
                              ? new Date(a.opened_at).toLocaleString("en-AU")
                              : "Not recorded"}
                          </td>
                          <td>
                            {!a.withdrawn_at && (
                              <button
                                className="button secondary small"
                                onClick={() => void open(a.id)}
                              >
                                <Eye size={15} />
                                Open application
                              </button>
                            )}
                          </td>
                          {evidence && (
                            <td className="candidate-evidence">
                              {!a.withdrawn_at &&
                                (() => {
                                  const measure = requirementsEvidenceScore(
                                    evidence.find((row) => row.id === a.id)
                                      ?.evidence || [],
                                  );
                                  return (
                                    <p className="applicant-evidence-score">
                                      {measure.score === null
                                        ? "Not assessed"
                                        : `${measure.score}/100 · ${measure.evidenced}/${measure.total} criteria with wording evidence`}
                                    </p>
                                  );
                                })()}
                              {a.withdrawn_at ? (
                                "Withdrawn — unavailable"
                              ) : (
                                <details>
                                  <summary>View wording and sources</summary>
                                  {evidence
                                    .find((item) => item.id === a.id)
                                    ?.evidence.map((item, i) => (
                                      <div key={i}>
                                        <strong>{item.requirement}</strong>
                                        {item.excluded ? (
                                          <p>
                                            Excluded from automated text lookup.
                                            Use job-relevant requirements.
                                          </p>
                                        ) : item.excerpts.length ? (
                                          item.excerpts.map((excerpt, n) => (
                                            <blockquote key={n}>
                                              <small>
                                                {excerpt.source} · matching
                                                wording
                                              </small>
                                              <p>{excerpt.text}</p>
                                            </blockquote>
                                          ))
                                        ) : (
                                          <p>
                                            No matching wording located. Read
                                            the application; this does not
                                            establish a lack of experience.
                                          </p>
                                        )}
                                      </div>
                                    ))}
                                  {!evidence.find((item) => item.id === a.id)
                                    ?.evidence.length && (
                                    <p>No role requirements supplied.</p>
                                  )}
                                </details>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="muted" style={{ marginTop: 20 }}>
              No applications to review yet.
            </p>
          )}
        </section>
      )}
      {application && (
        <section
          ref={detail}
          tabIndex={-1}
          className="panel applicant-review-detail"
          style={{ marginTop: 24 }}
          aria-label="Full application review"
        >
          <h2 style={{ fontSize: 25 }}>
            {application.candidate_profile?.full_name ||
              application.candidate_name_snapshot ||
              "Their experience, in their words."}
          </h2>
          {application.candidate_profile && (
            <ApplicationProfileSummary
              profile={application.candidate_profile}
              audience="employer"
            />
          )}
          <p className="fineprint">
            Current profile details above; the submitted documents and
            declarations below remain unchanged.
          </p>
          <h3>Submitted documents</h3>
          <div className="application-document-menu">
            {application.documents?.map((d) => (
              <a
                key={d.id}
                className="button secondary small"
                href={`/api/employers/applications/document?id=${d.id}`}
              >
                <FileText size={16} aria-hidden="true" />{" "}
                {d.kind && d.kind !== "cv" ? attachmentKinds[d.kind] : "CV"}:{" "}
                {d.filename}
              </a>
            ))}
          </div>
          <details className="application-cv-text" open>
            <summary>Submitted CV text</summary>
            <pre
              style={{
                whiteSpace: "pre-wrap",
                font: "inherit",
                fontSize: 15,
                marginTop: 22,
                color: "var(--muted)",
              }}
            >
              {application.cv_text_snapshot}
            </pre>
          </details>
          {application.cover_letter && (
            <>
              <h3 style={{ marginTop: 22 }}>Cover letter</h3>
              <p
                style={{ whiteSpace: "pre-wrap", fontSize: 15, marginTop: 12 }}
              >
                {application.cover_letter}
              </p>
            </>
          )}
          {application.answers && (
            <div className="application-final-review">
              <h3>Submitted declarations</h3>
              <p>
                Right to work:{" "}
                {workRightsOptions[
                  application.answers
                    .right_to_work as keyof typeof workRightsOptions
                ] || "Not declared"}
              </p>
              <p>
                Driver’s licence:{" "}
                {application.answers.drivers_licence === "yes"
                  ? "Yes"
                  : application.answers.drivers_licence === "no"
                    ? "No"
                    : "Not declared"}
              </p>
              <p>
                Certifications:{" "}
                {application.answers.certifications || "Not declared"}
              </p>
              <p className="fineprint">
                Candidate declarations only; not verified by Westmere.
              </p>
            </div>
          )}
          <form onSubmit={sendUpdate} style={{ marginTop: 30 }}>
            <label className="field-label" htmlFor="candidate-stage">
              Next stage
            </label>
            <select
              id="candidate-stage"
              value={stage}
              onChange={(e) => setStage(e.target.value)}
            >
              <option value="shortlisted">Shortlisted</option>
              <option value="interview">Interview</option>
              <option value="offer">Offer</option>
              <option value="not_proceeding">Not proceeding</option>
            </select>
            <label
              className="field-label"
              htmlFor="candidate-update"
              style={{ marginTop: 15 }}
            >
              A useful update for this candidate
            </label>
            <textarea
              id="candidate-update"
              minLength={10}
              maxLength={4000}
              required
              value={update}
              onChange={(e) => setUpdate(e.target.value)}
              placeholder="Let them know what happens next…"
            />
            <button
              className="button primary"
              style={{ marginTop: 15 }}
              disabled={busy}
            >
              <MessageCircle size={16} />
              Record update for candidate
            </button>
            <p className="fineprint" style={{ marginTop: 12 }}>
              This records an update in the candidate’s timeline and
              notifications. Email follows their service-email preferences.
            </p>
          </form>
        </section>
      )}
      {archiveRole && (
        <ConfirmAction
          title={`Archive ${archiveRole.title}?`}
          confirmLabel="Archive listing"
          onClose={() => setArchiveRole(null)}
          onConfirm={async () => {
            const d = await sendJson(
              "/api/employers",
              { id: archiveRole.id, action: "close" },
              "PATCH",
            );
            setMessage(d.message);
            await load();
          }}
        >
          <p>
            This removes the listing from search and stops new applications.
            Existing applications, documents and statistics remain in your Roles
            tab. You can renew it later.
          </p>
        </ConfirmAction>
      )}
      {confirmPool && (
        <ConfirmAction
          title="Confirm the interview candidate pool?"
          confirmLabel="Close applications and notify candidates"
          onClose={() => setConfirmPool(false)}
          onConfirm={async () => {
            const d = await sendJson(
              "/api/employers/applications",
              {
                action: "finalise_pool",
                jobId: selected,
                selected: pool,
                reviewed: applicants
                  .filter((a) => !a.withdrawn_at)
                  .map((a) => a.id),
              },
              "PATCH",
            );
            setMessage(d.message);
            await review(selected);
            await load();
          }}
        >
          <p>
            Applications for this role will close. {pool.length} selected
            candidate(s) will be in the interview pool. Remaining active
            candidates who do not already have an interview invitation or offer
            will receive a recorded update that they have not been selected to
            proceed to interview. Withdrawn applications receive no update.
          </p>
          <p>
            Review your selection before confirming. These candidate notices
            cannot be recalled.
          </p>
        </ConfirmAction>
      )}
    </>
  );
}
