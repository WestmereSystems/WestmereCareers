# Trust, saved searches and email alerts — 15 November 2026

This milestone is for development/staging review. The public development demo and connected protected staging remain separate. No genuine vacancies, employer identities, reports or applications were seeded.

## Employer verification and moderation

The employer workspace accepts registered business name, ABN, HTTPS website, hiring role and a description of independently checkable authority. Applicants can see status and reviewer feedback and supply additional information when requested. ABN format is checked; an ABN is not automatic proof of identity or ownership. A human reviewer must independently attest both business identity and authority to hire. Approval creates a new organisation and its owner membership transactionally; an existing ABN never grants access to an existing organisation.

`/admin` uses a fresh private staff-membership lookup. Reviewers cannot review themselves, their own organisations, their own response evidence or their own cases. Neither editable Auth metadata nor an employer membership grants staff access. The initial staff table is deliberately empty until the owner chooses the first administrator.

Listings are drafts until independently approved. Employers can edit, submit for review, or close them. Saving a private draft withdraws publication intent; editing published content removes public visibility until reviewed. Reviewer feedback is private to the hiring team. Decisions use an item version to reject stale reviews, append an audit entry, and leave explicit feedback. Paginated queues cover verification, listings, candidate reports, concerns/appeals and decision history. Administrators can suspend a business, close roles and revoke candidate-document access; reinstatement repeats both evidence checks and leaves roles closed until individually resubmitted and reviewed.

Candidates can privately report a listing/business concern. Authorised business owners/admins can appeal response insights. Requesters follow feedback in `/trust-activity`. Reviewers should check independent registration/contact evidence and role accuracy, request further evidence when needed, and record factual reasons without sensitive documents. Team invitations and ownership transfers need a separate verified workflow before a wider employer launch.

## Candidate-reported response aggregation

Only accepted reports contribute. Use the application cohort from six calendar months ago to three calendar months ago, in Australia/Melbourne, with the end date excluded. Count one latest eligible application per candidate per employer. Exclude current organisation members. No-response evidence must have been reconfirmed within 30 days; a late response/correction returns to review and replaces that experience after acceptance.

Publish aggregate figures only with at least ten unique eligible candidates. A response median also needs at least five responders and describes responders only. Mark “Unresponsive” only when more than half of the eligible cohort reports no meaningful reply after strictly more than two calendar months. Automated receipts and application opens do not count as meaningful replies. Self-selection and external-report provenance remain limitations, clearly explained on employer profiles and `/transparency`.

Accepted-report changes refresh aggregates transactionally. An hourly Supabase Cron refresh ages the cohorts and confirmations. Public profiles and job cards suppress snapshots older than 24 hours; raw reports and candidate identities are never public. Empty/small samples do not imply a responsive employer. Company profiles use organisation IDs and can exist without current vacancies.

## Saved searches and Resend delivery

`/saved-searches` persists up to twenty private searches per user, with normal search filters and a daily/weekly digest choice. CV content, matching consent and private premium comparisons never enter saved filters, URLs or emails. Alerts require the owner’s explicit consent and current verified account email. New, approved matching roles since consent are eligible; no matches means no email. Pausing, deleting, changing filters or unsubscribing cancels unsent work.

The database transaction selects matching roles, creates a durable outbox entry and records unique `(search, job)` delivery membership. Workers claim short leases, recheck current consent/address/suppression and vacancy eligibility, freeze the exact provider payload, and use a stable Resend idempotency key. At most six messages are attempted per run, two concurrently, with bounded timeouts, at most eight attempts and Retry-After/backoff. Uncertain requests stop for manual investigation before the 24-hour provider idempotency window expires; they are never blindly resent later. Closed/changed vacancies cancel an unsent digest rather than emailing stale content.

Emails use `Westmere Careers <hello@westmere.com.au>`, escaped HTML and text alternatives, saved-search controls, visible unsubscribe, and RFC one-click unsubscribe headers. A GET only opens a confirmation page; a POST pauses the one search without sign-in. The unprotected confirmation page works even while staging uses Vercel protection. Receiving-server delivery is distinguished from provider acceptance; neither proves inbox placement or reading. Users can explicitly queue a preview to their own verified address (three per day).

The `westmere-alerts` Edge Function authenticates dispatch with a dedicated alerts-only Vault credential, verifies webhook raw bytes against Svix HMAC signatures with a five-minute tolerance, and handles only known Westmere outbox/provider IDs. Webhook IDs are deduplicated; delivery states are not downgraded by older sent events. Bounces, complaints and suppressions pause all alerts for that account. Other Resend team traffic, including OrderWard and Auth SMTP, is ignored. No Vercel bypass credential is shared with Resend.

The hosted function disables the platform JWT gate because each route supplies its own authentication or public unsubscribe semantics. Its injected Supabase server credential never goes into Cron headers. Cron stores an alerts-only random token in Vault and the function verifies a hash through a service-only RPC. `pg_net` temporarily exposes queued headers to database login roles, so this token grants only bounded processing of already consented messages, never database access.

## Deployment and operations

Target only Supabase project `ldmwqupidlgrkkjjpcvn` (WestmereCareers, Tokyo). Edge Function secrets `RESEND_API_KEY` (Sending access, westmere.com.au only) and `RESEND_WEBHOOK_SECRET` are entered privately by the owner. The signing endpoint is `https://ldmwqupidlgrkkjjpcvn.supabase.co/functions/v1/westmere-alerts/webhook`. SMTP uses its separate key.

Schedules are `westmere-job-alerts` every five minutes, `westmere-response-insights` hourly at minute 17, and bounded 14-day history cleanup daily. The sending switch starts disabled; Cron performs no HTTP send while disabled. Enable only after both keys and the correct webhook endpoint are verified. A dry-run reports configuration booleans only. Cron SQL success alone does not prove HTTP delivery: inspect the associated `net._http_response`, outbox, signed delivery event and owner-initiated unsubscribe.

Investigate blocked/ambiguous rows before retrying; compare the immutable request and provider idempotency history without exposing recipients or secrets in logs. Do not manually resend a request beyond the provider idempotency window. Monitor queue age, provider errors, complaints and mailbox placement. Never lift a complaint suppression automatically. A support-assisted preference recovery and wider retention/export/deletion operations remain launch work.

## Validation and limits

The local suite executes all migrations in isolated PostgreSQL/WASM and tests permissions, independence, stale review decisions, suspension/reinstatement, unique report aggregation, small samples, late responses, stale confirmations, consent, cross-user isolation, deduplication, frozen requests, webhook races, unsubscribe and expired retries. Native Web Crypto tests use the official Svix vector and tampered/stale messages. TypeScript, Deno checking and the production build are required before publishing.

Hosted checks must also cover the actual injected keys, scheduled HTTP dispatch, signed Resend delivery and owner-initiated unsubscribe. These checks do not establish production-scale latency, broad accessibility compliance, inbox placement, legal readiness, staffed moderation, realistic-volume abuse resistance or a paid production launch. See `release-status.md` for the remaining launch gates.
