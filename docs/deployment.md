# Current live deployment — 19 November 2026

The complete connected release now runs at **https://westmere-careers.vercel.app**. Production deployment `dpl_81zna8skYd2Yz3NSQHXhhJnucdXs` uses runtime commit `18dfaaaf5b0ed7fb887d2366b99c4bf045ef20ef`. This supersedes the development-only status recorded below. Private account, assistant, team, applicant and Role Strength services use the dedicated Westmere database. Stripe remains in its existing test billing mode; enabling real payments is a separate change.

The canonical production URL and Supabase default site URL are the live origin. Exact authentication callbacks are allowed for production and the existing review URL. New notification mail uses the production origin. Service credentials were moved from the branch-only preview configuration to Production without reading or exposing their values. Existing review deployments retain the environment captured at their deployment; new review builds need separately scoped credentials. Deployment protection remains enabled for unique deployment URLs and previews, with the canonical production domain public.

See [the release record](launch-usability-changes.md) for validation and migration details.

---

# Hosted development preview

Review the website at **https://westmere-careers.vercel.app**. It is an executable development preview using fictional vacancies, employers, salaries and response figures. It is not accepting real applications or paid subscriptions.

## Deployed version

- Vercel team: `order-ward`, expressly approved for the separate Westmere project.
- Dedicated project: `westmere-careers` (`prj_7m79zrwAwdyKob8krItDCh5LPBGE`). No existing OrderWard project or database was modified.
- Initial full source publication: `ec72c88ecc7e418a0cf031e37b25b099c36e0d75`; current source is [main](https://github.com/WestmereSystems/WestmereCareers).
- Automatic deployment from `main` was verified READY (`dpl_8mE1n41qvwWMrtetuewEieRtkvKg`). The [Vercel dashboard](https://vercel.com/order-ward/westmere-careers/deployments) records subsequent releases.
- Node runtime: 24.x LTS. Function region is now configured as Tokyo (`hnd1`), colocating server work with the selected database. Cloud compilation and TypeScript checks passed on the initial deployment.
- Public production alias hosts the demonstration. Individual deployment URLs and previews retain Vercel authentication protection.
- `ALLOW_INDEXING=false`. The public demo has no candidate-service credentials. Supabase connection settings and the test price are scoped to protected Preview branch `codex/staging`.

The Vercel production environment name describes the hosting target, not the product's readiness for a production employment service. Source, the approved proposal and CI are published on GitHub. The initial published tree hash exactly matched the reviewed local snapshot. [GitHub Actions passed](https://github.com/WestmereSystems/WestmereCareers/actions/runs/43213480494) using Node 24. The dedicated Vercel project is connected to this repository for automatic deployment on future pushes.

## Hosted verification

Verified on 12 November 2026:

- The public URL responds with HTTP 200 without a Vercel sign-in.
- Keyboard job-title and location suggestions lead to the correct filtered search results.
- Remote filtering and highest-advertised-pay sorting update the URL and displayed state.
- A saved sample role appears on the saved page; the test save was removed afterwards.
- The cream light theme is available. Auto appearance continues to follow the system preference.
- Public search API returns sample inventory; `/api/profile` reports `configured:false` and no user or premium entitlement.
- Checkout and Studio return HTTP 503 with `NOT_CONFIGURED`, rather than accepting payments or transmitting a CV.
- The homepage includes the fictional-data notice and `noindex` metadata.
- No browser console errors were observed during the reviewed flow. This is not a load test or complete accessibility/security audit.

The earlier [local verification](development-checks.md) includes 85 automated tests and wider responsive/theme checks. It does not replace provider end-to-end tests.

## Remaining service setup

1. Add the server credentials listed in [staging setup](staging-setup.md), directly to Vercel Secrets for the staging branch.
2. Complete email delivery, signed-in candidate/employer workflows and provider end-to-end tests.
3. Configure and verify signed Stripe webhook delivery to protected staging, reconciliation, renewals, failures and cancellation.
4. Evaluate OpenAI on synthetic CVs, including prompt injection, quotas, failure recovery and spend controls.

Adding Supabase configuration switches browsing to the live database and enables account functionality. Do this in protected staging first; do not silently enable real candidate collection on this public demonstration. The checked-in Vercel configuration includes a 15-minute reconciliation trigger, but it cannot perform billing work until its dedicated credentials and cron secret are configured and verified.

Use separate staging and production credentials. Complete the [release requirements](release-status.md) before accepting real candidate data, employer postings or payments.


## Candidate and admin fixes · 21 November 2026

Production deployment `dpl_9buiQgRADME2DBNHpcqs5V2WQmkr`, runtime snapshot `08fae9440ad0f18e1a5b0ce6cde307785da97302`, is READY at https://westmere-careers.vercel.app. Migration `20261121033001_candidate_admin_and_listing_compliance.sql` is applied. TypeScript, 237 application/API cases, 116 isolated database cases, Node 24 production build and all four traced PDF workers pass. See `candidate-admin-release-20261121.txt` for scope, live evidence, WM Recruitment's shared-ABN review, legal limits and the Chrome file-upload permission limitation. Enterprise billing-owner access is preserved; non-entitled business accounts receive access guidance. Stripe remains in sandbox mode.


## Assistant and fictional agency follow-up · 21 November 2026

Production `dpl_GkHyxHAdC3H42UujyttDtY74MPrw`, runtime snapshot `a909d701bbb4a2cade107ff94907675163b9640a`, is READY at https://westmere-careers.vercel.app. WM Recruitment is now approved as a separate fictional test agency at the site owner’s explicit instruction. Assistant sharing preferences, floating reminders, current verification checks, category discovery and supplied photographs are live. All 247 app/API tests, three category database regressions, TypeScript/production build and four traced PDF workers pass. See `assistant-agency-release-20261121.txt` for the consent storage, legal/provider wording retained, exact Billing validation and live evidence. This supersedes the earlier note that WM Recruitment was pending. Stripe remains sandbox.


## Employer dashboard and capacity follow-up · 21 November 2026

Production `dpl_HwmK7b4Titqi7oYx4gwRmKydEhZK`, runtime snapshot `8161603f7ce3ac4fa736b390e4e13b0b55c02182`, is READY at https://westmere-careers.vercel.app. Cafe hero/mobile layout, conditional analytics denial label, region label spacing, candidate invite-tab visibility, explicit current-Terms renewal in Billing, and server-enforced business registration capacity are live. Migration `20261121064750_business_verification_capacity.sql` is applied. All 253 app/API tests, 11 relevant database cases, TypeScript/build and traced PDF checks pass. The owner subsequently approved the custom sign-in domain add-on; `auth.westmere.com.au` is now active, Google displays the Westmere domain and Microsoft production sign-in completes. No application redeployment was necessary for this external configuration. Detailed verification is recorded in [branded-sign-in-20261121.txt](branded-sign-in-20261121.txt). See `employer-dashboard-release-20261121.txt` for the dashboard release.


Clients wording follow-up (21 November 2026): production deployment `dpl_38wvuwxtXew793wfxPrMpyrmKHAP`, runtime snapshot `18f3ebf09b34cce9de5b5a4561e8965213193d30`, is READY. Employer/agency wording follows the selected business and loaded empty authorisation results show guidance. The live Harbour Collective selection was verified with the existing business session. TypeScript, eight focused regressions, seven rendered scenarios, production build and four traced PDF workers pass; scoped runtime-error scan is clean. The release changes only `agency-workspace.tsx` relative to the preceding founding-launch deployment. See [clients-wording-release-20261121.txt](clients-wording-release-20261121.txt).


## Founding site and normal business registration · 21 November 2026

The temporary public site now lives under `/launch`, with automatic redirects from the main entry points. Employers and agencies register directly, submit the usual verification form and prepare profiles/vacancies privately. The global founding hold prevents all public releases; separate owner permission and staff release remain required after opening. Optional verified-business plans use the existing clearly labelled Stripe sandbox. See [the operating guide](founding-launch.md) and [release evidence](founding-launch-release-20261121.txt) for the deployed snapshot, migrations, checks and remaining payment-readiness boundary.


## Careers+ allowance and public launch homepage · 22 November 2026

Production `dpl_9kpAhAXVbtvMVN4LmA4Vq7cPQb26`, source `74e9205910062ab69a838590a484e1697240e204`, removes automatic eligibility notices on Careers+/Assistant entry and restores the existing three-request free Assistant allowance to unpaid employer/agency accounts. The launch homepage shares the main hero layout and shows all six subscription comparisons before registration. The cafe image, private-publication controls and explicitly sandbox billing remain. All 271 app/API cases, five targeted database allowance cases, TypeScript, production build and four PDF worker checks passed. See [release evidence](careers-home-release-20261122.txt).
