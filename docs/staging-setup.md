# Protected staging setup

Updated 13 November 2026. This is a development environment, not a live recruitment or billing launch.

## Access and completed setup

- Public visual preview: https://westmere-careers.vercel.app, with fictional roles and candidate services disabled.
- Protected staging: https://westmere-careers-git-codex-staging-order-ward.vercel.app, branch `codex/staging`. Anonymous requests redirect to Vercel authentication. An authorised request to `/api/profile` confirms `configured:true`, no user and no premium entitlement.
- Dedicated Supabase project: `WestmereCareers`, ref `ldmwqupidlgrkkjjpcvn`, Tokyo, inside OrderWard. The user explicitly selected this existing project; no new organisation or duplicate database was created.
- Foundation and `harden_hosted_defaults` migrations are applied. All 12 application tables have RLS. Public profile reads are denied, `private` is not exposed through the Data API and browser roles cannot execute the provider's RLS event-trigger function.
- Advisor security/performance WARN and ERROR findings were cleared. [RLS with no policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) is intentional for service-only billing tables. [Unused index notices](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) are expected in this empty database; the default Auth connection allocation needs review when scaling.
- Stripe **test** product: `prod_westmere_careers_plus_test`, Careers+; price `price_1UawvkRX8vZXnntOma2QGAyR`, AUD2,500 cents/month, inclusive tax behaviour. No live product, customer subscription or charge was created.
- Test Customer Portal: `bpc_1Uax45RX8vZXnntOsqutY8zk`, default in the dedicated test account. Invoice history, payment-method updates and end-of-period cancellation are enabled. Upgrades, quantity changes and cancellation offers are disabled.
- Public Supabase settings, the exact staging origin, test price and a generated cron secret are scoped to Preview branch `codex/staging`. Fork protection is enabled. Production retains the visual demo.

## Server credentials

The owner has added the three required server keys. Their names, Secret type and staging-only scope were verified without reading their values.

In [Vercel environment settings](https://vercel.com/order-ward/westmere-careers/settings/environment-variables), select **Preview**, restrict to **codex/staging**, and store these as **Secrets**:

| Variable                    | Required value                                                                                                                                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY` | The selected Westmere project's server secret/service-role key. This bypasses RLS and must stay server-only.                                                                                                                              |
| `STRIPE_SECRET_KEY`         | A restricted test key from the dedicated Westmere Careers account. Grant Customers, Checkout Sessions and Customer Portal write access, with Prices and Subscriptions read access. Verify actual calls with that key before live billing. |
| `OPENAI_API_KEY`            | A project-scoped OpenAI API key, with a project spend limit and access to the evaluated model. A ChatGPT subscription does not supply API credentials.                                                                                    |

`CRON_SECRET` has already been generated and stored as a staging Secret. Do not copy keys into this repository, chat, screenshots or `.env.example`. Redeploy the staging branch after secrets change.

## Authentication and email

The approved Site URL and exact `/auth/callback` are saved and verified. No wildcard callbacks are allowed. Resend is the selected SMTP provider; see [email setup](email.md) for the cross-browser token-hash templates, verified sender and private SMTP key configuration. The owner’s first email was confirmed, but successful browser sign-in and Resend delivery remain to verify after the email update. No sign-in email has been sent by the setup agent.

## Required webhook routing

The subscription integration requires signed webhooks. The owner explicitly approved a revocable automation-bypass credential for this project's protected deployments, given only to the Westmere Stripe test endpoint. Endpoint `we_1Ub4EbRX8vZXnntODycIAFPv` targets the protected staging webhook route with API version `2026-10-28.endive`, matching the installed SDK. Its credential-bearing URL is private and is never stored here. Vercel requires its primary automation credential to remain available as its standard server-side automation environment variable. Application sign-in and Supabase RLS still apply.

The signing secret is stored as a staging Secret. A synthetic signed HTTP probe returned 200 and `{received:true}`; guarded reconciliation returned 200 with zero customers and no failures, validating the configured service/Stripe-price access. This probe was generated by the setup process, not delivered by Stripe. Actual provider event delivery, retries and paid-entitlement changes remain to verify during test Checkout. No live charge has been made.

The current handler processes Checkout completion, subscription lifecycle, `invoice.paid` and `invoice.payment_failed`. Refund, dispute and early-fraud-warning handling remains a production release gate, along with delayed payment success/failure coverage. Subscribe only to events the handler actually processes. See [Stripe billing verification](premium.md).

Verify purchase, renewals, payment failure, cancellation, duplicate/out-of-order events and reconciliation with synthetic accounts. Paid entitlement must come from verified current provider state, never a Checkout success redirect.

Before live charging, confirm GST registration/tax treatment and any Stripe Tax configuration. Inclusive price behaviour preserves the advertised A$25 total; it does not establish that tax is being calculated or collected.

## CV and release gates

Use synthetic CVs during staging evaluation. Verify factualness, consent, prompt-injection resistance, refusals, quotas and cost. Production employer onboarding, report moderation, alerts, document import/export, account deletion/export, operations and final privacy/legal documents remain in [release status](release-status.md). Policies must accurately describe the selected Tokyo hosting and any AI subprocessors before real candidate information is collected.
