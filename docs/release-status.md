# Development release status

This is the first executable implementation of the approved Westmere Careers proposal. It is suitable for local/staging review. **It is not approved for public applications or paid production launch.**

## Current integrations

The [public development preview](https://westmere-careers.vercel.app) and source/proposal are published, with GitHub CI and automatic Vercel deployments. Protected staging uses the explicitly selected WestmereCareers Supabase project inside OrderWard, in Tokyo. Migrations/advisor checks, Resend authentication email and persistent sign-in passed. Careers+ Sandbox Checkout, actual webhook delivery/retry, paid entitlement and portal cancellation passed. Two real OpenAI reviews passed on synthetic data: general improvement and role tailoring with an adversarial job-description check. Private profile persistence/cleanup and the premium filter's empty-catalogue flow also passed. See [hosted verification](staging-verification.md) for evidence and limits. No live charges or real applications have been submitted.

## 15 November trust and accessibility milestone

Employer verification intake, an independently authorised review console, listing moderation/editing, concerns and appeals, and privacy-preserving response aggregation are implemented. Private saved searches, explicit daily/weekly consent, a durable Resend outbox, signed delivery events and unsubscribe handling are implemented. The hosted worker and schedules are installed; activation and owner-initiated email verification are tracked in [trust and alerts](trust-and-alerts.md). The public demo keeps fictional data separate from the connected staging service.

Typography is larger, public reads no longer use session cookies, the initial job search is not immediately fetched twice, page loading boundaries provide feedback, and Careers+ marketing is prerendered. New original CC0 globe/ribbon artwork uses pausable CSS motion with reduced-motion support.

## Critical staging verification

- Maintain the verified hosted grants/RLS and advisor checks as migrations change; complete signed-in account isolation tests against the selected Tokyo project.
- Extend the successful email sign-in check to logout, refresh expiry, multi-account isolation and broader mailbox-provider/inbox-placement testing.
- Test live-query listing expiry, filters, full text, pagination and access controls with realistic data volume.
- Verify candidate submission, snapshot immutability, duplicate protection, withdrawals, employer membership revocation and intentional opens end to end.
- Extend the successful test purchase/cancellation to renewal, payment failure, re-subscription, refund, dispute, duplicate/out-of-order events, final expiry and scheduled reconciliation. Surface the actual scheduled cancellation date in the app.
- Expand the two successful OpenAI samples into a varied evaluation set covering factualness, prompt injection, refusal, quota restoration, concurrency, maximum spend and output quality.
- Test dedicated service secrets, environment separation, origin checks and protected deployment access.

## Proposal features still to complete

- Assign the first independent trust administrator, run the founding-employer onboarding/review pilot, establish review staffing and service levels, and complete verified team invitations/ownership transfers. The core intake, admin console, listing review, suspension/reinstatement and appeals workflow is implemented.
- Validate response aggregation at realistic volume and with a staffed moderation pilot. Unique mature cohorts, small-sample suppression, recent silence confirmations, late corrections, audit and hourly refresh are implemented; fixture figures remain fictional.
- Complete owner-initiated alert delivery/unsubscribe verification and mailbox placement checks, then operate delivery monitoring. Saved searches, the Resend outbox, consent, bounded retries, delivery events and suppression are implemented. Contact/support handling and broader abuse operations remain.
- File-based CV import with malware scanning, private Storage buckets, accessible DOCX/PDF export and document backup/restore.
- Account export/deletion, retention/de-identification workflows, final legal/privacy documents and operating-entity contact details.
- Interview rehearsal and its separate allowance; advanced workspace and continuing candidate research.
- Restored database/file drills, production monitoring, budget alerts, load testing and complete accessibility/security review.
- Search quality and production-scale matching evaluation. Skill overlap must not be presented as a hiring probability.

## Default safeguards

`ALLOW_INDEXING=false` is the default. Demo roles are never seeded into live vacancy tables and cannot receive genuine applications. Client preview state never grants paid entitlement. Paid Studio requests require an authenticated, current subscription with the configured exact Stripe price. No real candidate data belongs in fixtures, logs or Git history.

## First release review

Confirm the hopeful tone, default light appearance, system dark appearance, mobile usability, suggestions/filters, CV editing and provider-consent flow. Record remaining requirements as subsequent milestones without relabelling this release as production-ready.
