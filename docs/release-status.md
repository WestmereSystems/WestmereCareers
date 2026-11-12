# Development release status

This is the first executable implementation of the approved Westmere Careers proposal. It is suitable for local/staging review. **It is not approved for public applications or paid production launch.**

## Current integrations

The application contains real Supabase, Stripe and OpenAI integration code, with access controls and clear unconfigured states. A dedicated `westmere-careers` Vercel project now hosts the [public development preview](https://westmere-careers.vercel.app), inside the existing OrderWard Vercel team with explicit user approval. No existing OrderWard project or database was changed. Dedicated Supabase, Stripe and OpenAI setup remains pending. Private credentials are not committed. See [deployment status](deployment.md) for the deployed commit and hosted checks.

## Critical staging verification

- Provision the dedicated Sydney database and apply migrations. Confirm its real grants/RLS and Supabase advisors, rather than relying solely on isolated PostgreSQL execution tests.
- Verify email-link sign-in, redirect allowlists, session refresh, logout and account isolation against the hosted project.
- Test live-query listing expiry, filters, full text, pagination and access controls with realistic data volume.
- Verify candidate submission, snapshot immutability, duplicate protection, withdrawals, employer membership revocation and intentional opens end to end.
- Configure Stripe in test mode; test purchase, renewal, payment failure, cancellation, re-subscription, refund, dispute, duplicate/out-of-order events and scheduled reconciliation.
- Run OpenAI requests on synthetic CVs; evaluate factualness, prompt injection, refusal, quota restoration, maximum spend and output quality. Actual provider calls are not covered by mocked tests.
- Test dedicated service secrets, environment separation, origin checks and protected deployment access.

## Proposal features still to complete

- Production employer onboarding and ownership review, admin console and moderation/appeals operations.
- Structured response-report public aggregation with sample suppression, mature cohorts, freshness and audit rules; figures currently shown in fixtures are fictional.
- Email delivery/outbox, saved searches and alerts, contact/support handling and abuse controls.
- File-based CV import with malware scanning, private Storage buckets, accessible DOCX/PDF export and document backup/restore.
- Account export/deletion, retention/de-identification workflows, final legal/privacy documents and operating-entity contact details.
- Interview rehearsal and its separate allowance; advanced workspace and continuing candidate research.
- Restored database/file drills, production monitoring, budget alerts, load testing and complete accessibility/security review.
- Search quality and production-scale matching evaluation. Skill overlap must not be presented as a hiring probability.

## Default safeguards

`ALLOW_INDEXING=false` is the default. Demo roles are never seeded into live vacancy tables and cannot receive genuine applications. Client preview state never grants paid entitlement. Paid Studio requests require an authenticated, current subscription with the configured exact Stripe price. No real candidate data belongs in fixtures, logs or Git history.

## First release review

Confirm the hopeful tone, default light appearance, system dark appearance, mobile usability, suggestions/filters, CV editing and provider-consent flow. Record remaining requirements as subsequent milestones without relabelling this release as production-ready.
