# Development milestone verification

Verified locally on 12 November 2026.

- TypeScript check passed.
- Optimised Next.js production build passed.
- 85 automated tests passed across 11 files.
- Production dependency audit reported zero known vulnerabilities at the time of the check.
- The actual database migration executed against isolated PostgreSQL (PGlite), including access boundaries, application snapshots, withdrawal, intentional opens, stage updates, reports, precise pay amounts, AI quotas and billing leases.

Browser checks used the local production build:

- Job-title and location suggestions, including keyboard selection and empty suggestions.
- Combined work-arrangement filters and pay sorting.
- Premium CV-filter gating without a browser entitlement bypass.
- Search reset after cached navigation, including a local zero-result search.
- Saving a role on page two and finding it on the saved page.
- Opening Application Studio for a page-two role with the correct tailoring mode and title.
- Static CV example clearly labelled; no actual OpenAI request made.
- System dark appearance and manual light appearance.
- Narrow layouts at 390px and 320px with no horizontal overflow in the reviewed pages.

These checks do not verify live Supabase authentication, hosted migrations, email delivery, Stripe payments, OpenAI output quality, production performance under load, or complete accessibility conformance. Those require configured staging services and the release gates in `release-status.md`.

These local checks preceded cloud deployment. A dedicated Vercel project was subsequently created and the public demo verified; see [hosted deployment checks](deployment.md). No live payments or real applications were submitted. Sample vacancy data remains explicitly fictional.
