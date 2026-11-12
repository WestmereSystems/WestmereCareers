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
