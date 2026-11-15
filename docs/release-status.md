# Development release status

Westmere Careers is an executable implementation of the approved proposal, available as a public development preview and a connected review environment. It is not yet approved for genuine public applications or a paid production launch.

## Implemented

- Hopeful cream, green and purple visual design, system-aware dark mode, larger text and controls, original CC0 illustrations, and optional floating globe/ribbon/dot motion with pause and reduced-motion support.
- Job-title/location suggestions, sorting, quick filters, signed-in, account-saved roles, private saved searches and optional daily/weekly Resend alerts.
- Employer identity/authority intake, independent listing review, editing, feedback, concerns, appeals and administrative suspension/reinstatement.
- Candidate-reported response aggregation with unique mature cohorts, sample suppression, recent silence confirmation, late corrections and a published methodology.
- Profile landing after sign-in, recent applied jobs on the profile, application history, frozen application snapshots, first-open tracking and employer communication controls.
- Careers+ at A$25/month, CV skill-overlap filters and OpenAI-assisted general improvements and role-specific tailoring with explicit user consent.
- Test subscription purchase/cancellation, paid entitlement and real AI reviews on synthetic CV material.
- Faster navigation feedback, independent public inventory reads, removal of the duplicate initial search fetch, and prerendered Careers+ marketing.

TypeScript, 131 automated tests, the email worker check and the production build pass. An explicitly approved preview email, signed delivery, unsubscribe and disposable-test cleanup were verified. See [verification](staging-verification.md).

See the [candidate and employer release](candidate-and-employer-release.md) for private CV documents, email codes, conditional OAuth, account changes, notifications, employer branding/documents, the invited sample workspace, About and privacy pages.

## Remaining launch work

- A founding-employer and candidate pilot covering genuine reviewed listings, end-to-end applications, membership revocation, withdrawals and communication.
- Review staffing and service levels, verified team invitations and ownership transfers, support handling and broader abuse operations.
- Real-listing email digest evaluation, broader mailbox-placement testing and delivery monitoring.
- Realistic-volume search/matching quality and performance evaluation. Skill overlap must not be presented as a hiring probability.
- Independent accessibility, security and load reviews, production monitoring, budget alerts and restore drills.
- Wider subscription lifecycle testing: renewal, failed payments, refunds/disputes, duplicate/out-of-order events, re-subscription, final expiry and reconciliation. Display the scheduled cancellation date clearly.
- Broader AI evaluations covering factualness, prompt injection, refusals, quotas, concurrency, cost and output quality.
- Account export/deletion, retention/de-identification, operational retention/request handling and final professional legal/privacy review.
- Broader malware-processing review, scanned-CV text recognition and accessible DOCX/PDF export. Private PDF/.docx upload, history and extracted-text use are implemented.
- Interview rehearsal and its separate allowance, advanced workspace features and continuing candidate research.

## Development defaults

Sample employers, vacancies, salaries and response statistics remain clearly labelled fictional fixtures. They are never seeded as genuine vacancies and cannot receive real applications. Core search, applications and transparency stay free. Client preview state cannot grant paid access. No real candidate documents or service secrets belong in fixtures, public source or logs.
