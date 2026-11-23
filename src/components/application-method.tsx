"use client";
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { externalApplicationTarget } from "@/lib/external-applications";

export function ApplicationMethodFields({
  source = "direct",
  externalUrl = "",
}: {
  source?: "direct" | "external";
  externalUrl?: string | null;
}) {
  const [method, setMethod] = useState(source);
  const [url, setUrl] = useState(externalUrl || "");
  return (
    <fieldset className="form-stack">
      <legend>How candidates apply</legend>
      <label className="field-label">
        Application method
        <select
          name="source"
          value={method}
          onChange={(event) =>
            setMethod(event.target.value as "direct" | "external")
          }
          aria-describedby="application-method-help"
        >
          <option value="direct">Apply on Westmere</option>
          <option value="external">Apply on an external website</option>
        </select>
      </label>
      <p className="fineprint" id="application-method-help">
        {method === "external"
          ? "Candidates open your application portal in a new tab. Westmere does not collect their application, send their CV to that site or track an external submission."
          : "Candidates submit through Westmere. Authorised hiring team members review those applications in Applicants."}{" "}
        Changing the method does not move or delete existing applications.
      </p>
      {method === "external" && (
        <label className="field-label">
          External application URL
          <input
            name="externalUrl"
            type="url"
            required
            maxLength={2000}
            pattern="https://.*"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://careers.yourbusiness.com.au/jobs/role"
            aria-describedby="external-application-help"
          />
          <span className="fineprint" id="external-application-help">
            Use the full HTTPS address for this role on a portal you are
            authorised to use. Do not include passwords, private access tokens
            or candidate information in the URL. A changed destination needs
            Westmere’s review and release again.
          </span>
        </label>
      )}
    </fieldset>
  );
}

export function ExternalApplicationPanel({
  url,
  isDemo = false,
}: {
  url?: string;
  isDemo?: boolean;
}) {
  const target = !isDemo ? externalApplicationTarget(url) : null;
  return (
    <div>
      {target ? (
        <>
          <a
            className="button primary"
            href={target.href}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
          >
            Apply on employer website <ExternalLink size={16} />
          </a>
          <p className="fineprint" style={{ marginTop: 12 }}>
            Application website: <strong>{target.hostname}</strong>
          </p>
        </>
      ) : (
        <p className="notice">
          {isDemo
            ? "External listing preview · no live application website is linked."
            : "The external application link is unavailable. Please contact the advertiser."}
        </p>
      )}
      <p className="fineprint" style={{ marginTop: 12 }}>
        You’ll apply outside Westmere under that website’s privacy arrangements.
        Westmere does not receive your application or send your CV to this
        website. External application activity and submission cannot be recorded
        here.
      </p>
    </div>
  );
}
