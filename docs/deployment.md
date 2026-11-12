# Hosted development preview

Review the website at **https://westmere-careers.vercel.app**. It is an executable development preview using fictional vacancies, employers, salaries and response figures. It is not accepting real applications or paid subscriptions.

## Deployed version

- Vercel team: `order-ward`, expressly approved for the separate Westmere project.
- Dedicated project: `westmere-careers` (`prj_7m79zrwAwdyKob8krItDCh5LPBGE`). No existing OrderWard project or database was modified.
- Application source commit: `0792c13a4560894c817643c66d32b2c0bcda3567`.
- Deployment: `dpl_2Yvn7vNyFQqU8nx2Rg5ap9eF1rnn`, READY on 12 November 2026.
- Node runtime: 24.x LTS; function region: Sydney (`syd1`). Cloud compilation and TypeScript checks passed.
- Public production alias hosts the demonstration. Individual deployment URLs and previews retain Vercel authentication protection.
- `ALLOW_INDEXING=false`. Only the public site origin and indexing configuration were added; no provider secrets were uploaded.

The Vercel production environment name describes the hosting target, not the product's readiness for a production employment service. Source files were uploaded directly while GitHub write access remains blocked. Git-connected continuous deployment and publication of the source/proposal are still pending; the Git metadata attached to Vercel is not proof of a successful GitHub push.

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

1. Grant the GitHub connection repository contents-write access for `WestmereSystems/WestmereCareers`, publish the reviewed source and proposal, and connect that repository to this dedicated Vercel project.
2. Make the new **Westmere Systems** Supabase organisation available to the connection. The connector currently exposes only OrderWard and cannot create organisations. Obtain approval of any quoted nonzero project cost before creating the dedicated Sydney project.
3. Apply the reviewed migration and verify grants, RLS, advisors, Auth redirects and email delivery against protected staging.
4. Connect a dedicated Westmere Stripe sandbox, configure Careers+ at AUD25/month and verify checkout, renewal, failure, cancellation, signed webhooks and reconciliation.
5. Configure OpenAI with synthetic CV evaluations, provider consent, quotas and spend controls in protected staging.

Adding Supabase configuration switches browsing to the live database and enables account functionality. Do this in protected staging first; do not silently enable real candidate collection on this public demonstration. The checked-in Vercel configuration includes a 15-minute reconciliation trigger, but it cannot perform billing work until its dedicated credentials and cron secret are configured and verified.

Use separate staging and production credentials. Complete the [release requirements](release-status.md) before accepting real candidate data, employer postings or payments.
