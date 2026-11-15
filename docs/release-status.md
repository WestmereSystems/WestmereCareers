# Development release status

This is the first executable implementation of the approved Westmere Careers proposal. It is suitable for local/staging review. **It is not approved for public applications or paid production launch.**

## Current integrations

The [public development preview](https://westmere-careers.vercel.app) and source/proposal are published, with GitHub CI and automatic Vercel deployments. Protected staging uses the explicitly selected WestmereCareers Supabase project inside OrderWard, in Tokyo. Migrations/advisor checks, Resend authentication email and persistent sign-in passed. Careers+ Sandbox Checkout, actual webhook delivery/retry, paid entitlement and portal cancellation passed. Two real OpenAI reviews passed on synthetic data: general improvement and role tailoring with an adversarial job-description check. Private profile persistence/cleanup and the premium filter's empty-catalogue flow also passed. See [hosted verification](staging-verification.md) for evidence and limits. No live charges or real applications have been submitted.

## Critical staging verification

- Maintain the verified hosted grants/RLS and advisor checks as migrations change; complete signed-in account isolation tests against the selected Tokyo project.
- Extend the successful email sign-in check to logout, refresh expiry, multi-account isolation and broader mailbox-provider/inbox-placement testing.
- Test live-query listing expiry, filters, full text, pagination and access controls with realistic data volume.
- Verify candidate submission, snapshot immutability, duplicate protection, withdrawals, employer membership revocation and intentional opens end to end.
- Extend the successful test purchase/cancellation to renewal, payment failure, re-subscription, refund, dispute, duplicate/out-of-order events, final expiry and scheduled reconciliation. Surface the actual scheduled cancellation date in the app.
- Expand the two successful OpenAI samples into a varied evaluation set covering factualness, prompt injection, refusal, quota restoration, concurrency, maximum spend and output quality.
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
