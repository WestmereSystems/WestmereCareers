"use client";
import { useState } from "react";
type Org = {
  id: string;
  name: string;
  description?: string;
  website?: string | null;
  social_links?: Record<string, string>;
  careers_email?: string | null;
  avatar_path?: string | null;
  banner_path?: string | null;
};
export function EmployerBranding({
  organisation,
  onSaved,
}: {
  organisation: Org;
  onSaved: () => void;
}) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function upload(file: File, kind: string) {
    setBusy(true);
    try {
      const f = new FormData();
      f.set("organisationId", organisation.id);
      f.set("kind", kind);
      f.set("file", file);
      const r = await fetch("/api/employers/assets", {
          method: "POST",
          body: f,
        }),
        d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setMessage(d.message);
      onSaved();
    } catch (e) {
      setMessage(
        e instanceof Error ? e.message : "Your image could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="brand-editor">
      <summary>Employer profile, images & contact</summary>
      <p>
        Your profile images appear on your employer page and listings. Use
        images you have permission to publish; avoid candidate or sensitive
        information.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          try {
            const r = await fetch("/api/employers/profile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  organisationId: organisation.id,
                  description: String(f.get("description")),
                  careersEmail: String(f.get("email")),
                  website: String(f.get("website")),
                  socialLinks: Object.fromEntries(
                    ["linkedin", "instagram", "facebook"].map((k) => [
                      k,
                      String(f.get(k) || ""),
                    ]),
                  ),
                }),
              }),
              d = await r.json();
            if (!r.ok) throw new Error(d.error);
            setMessage(d.message);
            onSaved();
          } catch (e) {
            setMessage(
              e instanceof Error
                ? e.message
                : "Your profile could not be saved.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field-label">
          About your organisation
          <textarea
            name="description"
            maxLength={10000}
            defaultValue={organisation.description || ""}
          />
        </label>
        <label className="field-label">
          Company website
          <input
            name="website"
            type="url"
            pattern="https://.*"
            maxLength={500}
            defaultValue={organisation.website || ""}
            placeholder="https://your-company.com.au"
          />
        </label>
        {["linkedin", "instagram", "facebook"].map((k) => (
          <label className="field-label" key={k}>
            {k[0].toUpperCase() + k.slice(1)} profile · optional
            <input
              name={k}
              type="url"
              pattern="https://.*"
              maxLength={500}
              defaultValue={organisation.social_links?.[k] || ""}
            />
          </label>
        ))}
        <label className="field-label">
          General careers email · optional
          <input
            type="email"
            name="email"
            maxLength={254}
            defaultValue={organisation.careers_email || ""}
          />
        </label>
        <p className="fineprint">
          This address is published on your employer profile. Only use an
          address you are authorised to share.
        </p>
        <button className="button secondary" disabled={busy}>
          Save employer profile
        </button>
      </form>
      <div className="account-grid">
        {(["avatar", "banner"] as const).map((kind) => (
          <label key={kind} className="field-label">
            {kind === "avatar" ? "Profile image" : "Top banner image"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f, kind);
                e.target.value = "";
              }}
            />
            <span className="fineprint">
              JPEG, PNG or WebP · up to 4 MB.{" "}
              {kind === "avatar" ? "Square crop" : "Wide crop"}; metadata
              removed.
            </span>
          </label>
        ))}
      </div>
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}
    </details>
  );
}
export function ListingDocuments({
  role,
  onSaved,
}: {
  role: {
    id: string;
    organisation_id: string;
    listing_documents?: { id: string; filename: string; bytes: number }[];
  };
  onSaved: () => void;
}) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <details className="listing-documents">
      <summary>
        Supporting documents ({role.listing_documents?.length || 0})
      </summary>
      <p className="fineprint">
        Add a role description or candidate information pack. These documents
        become public after listing review. Do not upload CVs, identity
        documents or private candidate information. Changes return the listing
        to review.
      </p>
      {role.listing_documents?.map((d) => (
        <div key={d.id} className="document-row">
          <a href={`/api/listing-documents?id=${d.id}`}>{d.filename}</a>
          <button
            className="text-button"
            disabled={busy}
            onClick={async () => {
              if (!window.confirm(`Remove ${d.filename} from this listing?`))
                return;
              setBusy(true);
              try {
                const r = await fetch("/api/listing-documents", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: d.id }),
                  }),
                  data = await r.json();
                if (!r.ok) throw new Error(data.error);
                setMessage(data.message);
                onSaved();
              } catch (e) {
                setMessage(
                  e instanceof Error
                    ? e.message
                    : "The document could not be removed.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Remove
          </button>
        </div>
      ))}
      <label className="field-label">
        Add PDF or Word (.docx) · up to 4 MB
        <input
          type="file"
          accept=".pdf,.docx"
          disabled={busy}
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            try {
              const f = new FormData();
              f.set("organisationId", role.organisation_id);
              f.set("jobId", role.id);
              f.set("kind", "document");
              f.set("file", file);
              const r = await fetch("/api/employers/assets", {
                  method: "POST",
                  body: f,
                }),
                d = await r.json();
              if (!r.ok) throw new Error(d.error);
              setMessage(d.message);
              onSaved();
            } catch (e) {
              setMessage(
                e instanceof Error
                  ? e.message
                  : "The document could not be uploaded.",
              );
            } finally {
              e.target.value = "";
              setBusy(false);
            }
          }}
        />
      </label>
      {message && (
        <p className="message" role="status">
          {message}
        </p>
      )}
    </details>
  );
}
