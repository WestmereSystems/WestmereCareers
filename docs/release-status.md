# Live connected release — 19 November 2026

The connected application is deployed to https://westmere-careers.vercel.app. It includes the earlier account, saved-chat, employer-team, applicant-review, homepage loading and distance-search work, plus the Discovery, verification, Studio attachment and Role Strength refinements. All test listings remain labelled and Stripe remains in test billing mode. The operational pilot, real-payment activation and wider launch reviews below remain separate work.

## Account plan and hiring refinements — 19 November 2026

One account subscription now covers selected businesses: Starter 1, Growth 3, Enterprise 10. Profile identifies the billing owner and active coverage, allows the owner to update business selections, and links another business to Verification. Applicants evidence resolves the same effective coverage as the other hiring features. Listing documents are below Skills in the editor, alongside a separate Close editor control. The duplicate sandbox Growth subscription was consolidated into the original ACME stream.

Migration `20261119034228_account_business_plan_coverage.sql` is applied. Runtime commit: `347200ac2a72c169099c0e39b2db6f02247cd940`. Production deployment: `dpl_BXm2ExZpv6LToY7rtqf8os68UKM2`. TypeScript, 297 tests and production build pass.

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

Live read-back confirmed the canonical alias points to `dpl_BXm2ExZpv6LToY7rtqf8os68UKM2`. Billing shows one account Growth plan, Profile shows the billing owner and three selected businesses, the additional-business link opens the Verification form, and role documents and Close editor work in production. Evidence is selectable on a covered live business; evidence generation was exercised only with synthetic applications locally to avoid applicant-view notices.

Current coverage remains ACME, Banksia Services and Harbour Collective. Fern Studio’s Project Coordinator role is outside that selection. Automatic approval review rejected a proposed Banksia-to-Fern coverage swap because the user had not explicitly approved this exact business access change. No swap was executed; explicit approval is required for it. The initial coverage and all code changes remain deployed.

## Enterprise and launch usability — 19 November 2026

The approved coverage swap is complete: ACME, Fern Studio and Harbour Collective are selected on the Growth account; Banksia Services is outside paid coverage. The live Fern Project Coordinator evidence control is enabled. No application documents were opened during live verification.

The Discovery disclaimer now uses 13px type, a 1.65 line height and three paragraphs separated by 12px. Verification independently lists every approved business membership, including businesses without a verification-request row, five per page. Requests also paginate by five. Invoice history merges the authenticated billing owner’s current and historical Stripe customer streams, ten invoices per page; invited businesses are excluded.

Plan comparisons show checks for included features and grey crosses for excluded ones. Enterprise grants Careers+ Studio, 100 requests per billing period, ten private chats, Role Strength and Strong Matches to its billed account only. Invited managers do not inherit this entitlement. Starter/Growth and invited accounts are guided to personal Careers+ or Enterprise on their own billing account. Job applications still require a personal account. Settings now provides always-accessible analytics controls, with changes synchronised to the footer preference display; the preference applies to the current browser/device.

Migration `20261119040832_enterprise_owner_careers_access.sql` is applied. Production deployment `dpl_3RaeLRfmzthQcKEAPa8N1ro2bvz3`, runtime commit `f0b5862545e2ec99631d071d6f9760d48db15697`, is READY and assigned to westmere-careers.vercel.app. TypeScript, all 314 tests across 47 files, production build and the four deployment-traced PDF worker checks pass. Synthetic browser checks exercised 5/5/1 verified-business pages, 10/10/3 invoice pages, both analytics choices, Enterprise Studio/allowance access and matching inputs, and non-Enterprise guidance. Live read-only checks confirmed all four approved businesses, the disclaimer layout, owner invoice history, saved analytics controls, feature crosses/checks and Fern evidence availability. Stripe remains in test mode.

## Agency and Enterprise acceptance · 21 November 2026

The reviewed agency identity, private client/mandate, vacancy assignment, safe public disclosure, reviewed billing correction and pooled quota implementation is deployed to the production project. Default-business selection and focused Discovery reloads are included. Discovery keeps the existing map/table structure and skeleton-loads changing figures and rows.

Verification so far: Node 24.22.3; 229 application tests plus all 99 database cases passed (database cases isolated to avoid repeated PGlite/WASM allocation stalls); production build and all four deployment-traced PDF workers passed; email worker `deno check` passed. Supabase advisors report no agency foreign-key indexing warnings and no new security warning; private no-policy RLS findings are intentional service-only tables.

The hosted synthetic acceptance flow verified: actual sandbox Enterprise subscription/reconciliation; owner Studio generation, saved chat and 100→99 allowance; scored Strong Matches; invited Studio/matching HTTP 403; default business heading change; Discovery state changes with the same map node and table headers retained; separate agency identity review; higher Agency Growth price; independently approved registered/unregistered client mandates; client-owner approval without a subscription; recruiter invitations/acceptance; independent agency publication; confidential public projection; real synthetic PDF CV/supporting uploads; assigned applicant/file/evidence access; unassigned/client-owner denials; no offer without a grant; one agency first-open event; scoped statistics; revocation/re-invitation; immediate client revocation with the other client unaffected and candidate history retained.

Final runtime commit `ad587c7bcd7338199de93f63260d7b22a4c5c4da` is READY as production deployment `dpl_A9PYwcsmMeMhm2yB4bm4gDFaCHd1`; the canonical alias is assigned to it. Final read-back confirms the temporary acceptance endpoint returns HTTP 404 and the public jobs endpoint returns HTTP 200 with the 12 existing fictional roles and no pilot listings. All 328 test cases passed across application and isolated database runs. The final production build passes TypeScript and all four deployment-traced PDF document workers. Stripe remains in sandbox mode; genuine payment activation is outside this release.

The three superseded pilot deployments containing the temporary acceptance endpoint were deleted after the clean production alias was verified. Local pilot credentials, session-cookie files and temporary harness files were removed, and the synthetic browser tab was closed. Financial and security audit records remain available; no genuine billing-owner subscription was changed during the pilot.

A real sandbox employer Enterprise → Agency Enterprise correction also passed: independent review before activation, A$799 monthly quote and explicit acceptance, same user/customer/subscription, preserved chat, billed-account Careers+ retained and invited access denied. Hosted concurrency, downgrade and cancellation checks passed: Starter enforced 5 active vacancies / 2 seats, two simultaneous final-slot publication reviews returned HTTP 200 and 409, and exactly five vacancies remained published. Cancellation removed Enterprise tools and agency intake while preserving private chat history and necessary owner response access until mandate revocation. Both synthetic sandbox subscriptions are canceled, the three synthetic organisations and seven listings are archived, eight fixture accounts are disabled, their sessions are revoked, test notices are canceled, and the temporary reviewer role is removed. The temporary acceptance route is removed from the final production release.

## Agency plan and candidate quality acceptance · 21 November 2026

All three agency plans completed the normal hosted registration, independent identity review, sandbox Checkout and subscription webhook flows at A$199 / A$399 / A$799 monthly. Recruiter limits count the owner and pending invitations: Starter 2, Growth 5, Enterprise 15. Each blocked the next invitation and allowed a replacement after revocation. Hosted independent mandate reviews reached 5 / 20 / 50 active clients, blocked overflow and reused a slot after revocation. The controlled reviewer existed only within the test transaction and was removed before commit. Registration now preserves the stored agency account type when renewing an existing account.

Strong CV matches automatically uses the private selected base CV. Its optional experience field stays empty, provides a smaller bonus and cannot reduce a strong base-CV score. Existing page filters remain applied and a clear-all control is available. Changing the CV happens in Profile; the first CV upload automatically becomes the base CV. Enterprise billing owners can manage their private CV library; invited managers do not inherit Careers+ access.

Closed public roles no longer expose listing content; Next.js can return its streamed unavailable page with noindex rather than a transport 404. Saved roles and applications retain private, frozen listing details for their owners. Saved searches require two independent specific filters in the UI, API and database. Preview email requests have a per-account 15-minute cooldown. Immediate outbox dispatch plus a one-minute recovery sweep replaces the five-minute sweep, with a global worker lease, provider-aware pacing, retry delays and idempotency preserved. Synthetic reserved-domain recipients remain excluded from delivery.

On-site response figures use recorded meaningful employer application events, retaining the original on-site evidence when a listing later changes source. Candidate dates agreeing with those events are affirmed. Off-site experiences remain candidate reports. Review choices use styled radio controls, listing titles come from six months of published history including closed roles, and duplicate reviews of a title at the same business are blocked. Concern/appeal entry points are removed from employer profiles and Trust Activity. Incidental service names are removed while necessary sharing consent, billing and policy disclosures remain.

Applied migrations: `20261121012552_candidate_search_and_response_quality.sql` and `20261121013130_preserve_recorded_response_origin.sql`. Email worker version 11 is active. All 234 application and 110 database cases passed across application and isolated database runs; production build, TypeScript, four traced PDF workers and email-worker type checking pass. No new database security warnings were introduced. Hosted checks passed first-CV selection, later-CV preservation, server-side base matching, filter minimum, preview cooldown, on/off-site feedback, duplicate prevention, unavailable public closed roles and both retained private histories.

The three disposable sandbox subscriptions are canceled through normal provider events; the genuine Growth subscription is unchanged. Four fixture organisations are archived; client authorities and invitations are revoked, four accounts disabled and their sessions revoked, and synthetic notices canceled. The temporary notice guard and local credentials are removed. Financial and security audit history is retained.

Final clean runtime commit `2384ade36af6a1826d409febd9a29c57508e1883` is READY as production deployment `dpl_8UrGXGx2DEe3R9YQpqCSJetht8xQ`, assigned to the canonical alias `westmere-careers.vercel.app`. The acceptance endpoint is absent from this release.

Final live smoke checks return HTTP 200 for Home, Find a job, Explore employers and public job inventory (12 original fictional roles, no acceptance fixtures), HTTP 404 for the removed acceptance API, and an unavailable/no-content response for the closed synthetic role. The latest three email recovery cron runs succeeded; no synthetic mail remains queued or leased.

The four superseded acceptance deployments, including the failed initial build, were deleted after the final clean production checks. The prior clean stable release remains available for rollback.


## Candidate and admin fixes · 21 November 2026

Production deployment `dpl_9buiQgRADME2DBNHpcqs5V2WQmkr`, runtime snapshot `08fae9440ad0f18e1a5b0ce6cde307785da97302`, is READY at https://westmere-careers.vercel.app. Migration `20261121033001_candidate_admin_and_listing_compliance.sql` is applied. TypeScript, 237 application/API cases, 116 isolated database cases, Node 24 production build and all four traced PDF workers pass. See `candidate-admin-release-20261121.txt` for scope, live evidence, WM Recruitment's shared-ABN review, legal limits and the Chrome file-upload permission limitation. Enterprise billing-owner access is preserved; non-entitled business accounts receive access guidance. Stripe remains in sandbox mode.


Assistant/agency follow-up (21 November 2026): production `dpl_GkHyxHAdC3H42UujyttDtY74MPrw` / `a909d701bbb4a2cade107ff94907675163b9640a` READY. WM Recruitment approved as fictional test agency without ACME access; separate agency plans confirmed by API/page regression tests. Local and live guest Assistant checks, image placements and directory filtering pass. Details: `assistant-agency-release-20261121.txt`.


Employer dashboard follow-up (21 November 2026): `dpl_HwmK7b4Titqi7oYx4gwRmKydEhZK` / `8161603f7ce3ac4fa736b390e4e13b0b55c02182` READY. App/database regression checks and live analytics/filter checks pass. Terms must be accepted personally in Billing before plan changes. Business review capacity includes owned businesses and pending requests. The owner subsequently approved the paid custom sign-in domain add-on; `auth.westmere.com.au` is active. Google displays westmere.com.au and Microsoft sign-in returned to the existing business account. Configuration and verification are recorded in [branded-sign-in-20261121.txt](branded-sign-in-20261121.txt).


Clients wording follow-up (21 November 2026): production deployment `dpl_38wvuwxtXew793wfxPrMpyrmKHAP`, runtime snapshot `18f3ebf09b34cce9de5b5a4561e8965213193d30`, is READY. Employer/agency wording follows the selected business and loaded empty authorisation results show guidance. The live Harbour Collective selection was verified with the existing business session. TypeScript, eight focused regressions, seven rendered scenarios, production build and four traced PDF workers pass; scoped runtime-error scan is clean. The release changes only `agency-workspace.tsx` relative to the preceding founding-launch deployment. See [clients-wording-release-20261121.txt](clients-wording-release-20261121.txt).


## Founding site and normal business registration · 21 November 2026

The temporary public site now lives under `/launch`, with automatic redirects from the main entry points. Employers and agencies register directly, submit the usual verification form and prepare profiles/vacancies privately. The global founding hold prevents all public releases; separate owner permission and staff release remain required after opening. Optional verified-business plans use the existing clearly labelled Stripe sandbox. See [the operating guide](founding-launch.md) and [release evidence](founding-launch-release-20261121.txt) for the deployed snapshot, migrations, checks and remaining payment-readiness boundary.


## Careers+ allowance and public launch homepage · 22 November 2026

Production `dpl_9kpAhAXVbtvMVN4LmA4Vq7cPQb26`, source `74e9205910062ab69a838590a484e1697240e204`, removes automatic eligibility notices on Careers+/Assistant entry and restores the existing three-request free Assistant allowance to unpaid employer/agency accounts. The launch homepage shares the main hero layout and shows all six subscription comparisons before registration. The cafe image, private-publication controls and explicitly sandbox billing remain. All 271 app/API cases, five targeted database allowance cases, TypeScript, production build and four PDF worker checks passed. See [release evidence](careers-home-release-20261122.txt).
