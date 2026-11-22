# Careers+ server integrations

These handlers connect to OpenAI and Stripe through server-only credentials. They never return a fabricated AI review, pretend a subscription is active, or give a browser the service keys. Dedicated Westmere staging services are now configured; see [staging setup](staging-setup.md) for the verified checks and outstanding provider journeys. Tax review and full end-to-end billing/AI evaluation remain release gates.

## Configuration

Set server environment variables through the deployment provider's secret settings:

- `OPENAI_API_KEY`: project-scoped OpenAI key with appropriate model access and a spend limit.
- `OPENAI_MODEL`: defaults to `gpt-6.1-sol`, which the official model documentation listed as Responses- and Structured Outputs-capable at implementation. Pin an available snapshot after a CV quality/cost evaluation.
- `STRIPE_SECRET_KEY`: begin with a test-mode secret.
- `STRIPE_PRICE_ID`: a single-item, active recurring price for AUD 2,500 cents every month with **inclusive** tax treatment. The Checkout handler checks those properties with Stripe. Confirm GST setup with the business's adviser; the advertised total remains A$25.
- `STRIPE_WEBHOOK_SECRET`: signing secret for `/api/billing/webhook`, separate between test/live deployments.
- `SUPABASE_SERVICE_ROLE_KEY`: server-only key used for billing mapping/state and one-way usage settlement. Never put it in a `NEXT_PUBLIC_` variable.
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: the dedicated project's public connection settings, plus the backend migration.
- `NEXT_PUBLIC_SITE_URL`: exact canonical origin such as `https://careers.example.com`. Browser mutation endpoints require this origin. Local development accepts loopback URLs without it; production does not.
- `CRON_SECRET`: a random server secret of at least 32 characters, used as the exact Bearer credential for the scheduled reconciliation endpoint. Do not expose it to browsers.

There is no automatic use of a personal ChatGPT subscription as an API key. Model usage requires an API project. No key or account access is assumed by the code.

## CV studio

`POST /api/studio` accepts JSON:

```json
{
  "mode": "tailor",
  "cv": "The candidate's CV text (100–24,000 characters)",
  "jobDescription": "The target role description (50–16,000 characters)",
  "jobTitle": "Optional title",
  "goals": "Optional wording or emphasis preferences (up to 2,000 characters)",
  "consent": true
}
```

Modes are `review`, `improve`, `tailor`, `match` and `chat`. The conversational Assistant uses `chat`, with an optional first-turn category in the message rather than a standing mode. CV text is optional for `chat`; a non-empty question and per-request sharing consent are required. Role text is mandatory for tailoring and matching. Consent must be explicitly true. The server validates the authenticated session and a fresh paid entitlement, reserves one of the 100 shared requests per billing period in a database transaction, and only then calls OpenAI. The current monthly allowance includes matching requests as well as application packs; the product must disclose this before billing.

The Responses call uses a strict JSON schema, bounded input/output, a 50-second timeout, no tool access, and `store:false`. No raw CV appears in general logs or webhook tables. CV/job text is explicitly untrusted input. The instructions forbid invented experience, qualifications, numerical achievements, work rights or hiring probabilities. The candidate must verify factual accuracy. `store:false` controls response storage; it does not by itself establish zero retention or Australian data residency. Review the API project's data controls and subprocessors before launch.

Successful output is validated again and returned as `{result,reservationId}`. It contains summary, actionable improvements, revised CV, optional cover letter and matched/not-evidenced skill lists. Matching is evidence assistance, not a hiring decision. The response has `Cache-Control:no-store`; generated documents are not silently saved to a public store.

The private Studio editor and billing page are keyed to the current account identity. Signing out or changing accounts clears the in-memory editor, results and notices. Unmounting aborts browser requests and discards pending results or billing redirects; it does not imply that a provider request already received by the server can always be canceled. CV contents are not written to browser storage.

Usage settlement is service-only. Clients cannot refund successful generations. Failed/incomplete/refused generations are refunded; stale reservations recover through the database expiry rule. A model API rejection is shown as a service error, never an example presented as generated output. A separate durable generation worker remains advisable before scaling or raising timeouts beyond the web request limit.

## Billing

- `POST /api/billing/checkout`: authenticated user only. Resolves a trusted customer mapping, checks the actual Stripe price, rejects an existing active/pending subscription, reuses a matching open Checkout session and uses a short-window idempotency key for retries. Expiry is fixed within that window, so a retried Stripe request has identical parameters; the key includes the configured price. A stable integration identifier tags this checkout flow. A shared database lease serializes concurrent requests for the same user. Returns `{url}`. No client-selected prices, arbitrary customer IDs or redirect destinations are accepted.
- `POST /api/billing/portal`: opens the authenticated user's trusted Stripe Customer Portal mapping; return URL stays on the configured site. Configure cancellation and invoice access in Stripe first.
- `POST /api/billing/webhook`: verifies the **raw** signed body, records a unique event ID and minimal non-personal processing metadata, then reconciles current Stripe customer subscriptions. It ignores completed duplicate events and returns a retryable non-2xx response after a failure. Stripe retries provide initial recovery; the scheduler below repairs missed current-state updates. Backlog monitoring is still an operational requirement.
- `GET /api/billing/reconcile`: exact `Authorization: Bearer <CRON_SECRET>` required. The repository's `vercel.json` configures this path every 15 minutes (`*/15 * * * *`). The schedule becomes active on a supported production deployment; credentials and operational monitoring are still required. Authentication and all required provider settings are checked before customer processing. The actual configured price is validated before writes. The endpoint rotates through up to 100 trusted customer mappings by oldest reconciliation-attempt time, with five independent workers and an 80-second work budget. Each customer still takes the same per-user lease as Checkout and webhooks. It returns aggregate counts only; partial provider/database failures return HTTP 503 for monitoring. Deferred customers remain eligible for the next run. Confirm the schedule and duration are supported by the selected hosting plan.

The webhook deliberately reads current Stripe state **after acquiring a per-user database lease**, selects an eligible active/trialing Careers+ subscription ahead of old canceled subscriptions, and writes via a service-only RPC that verifies the same unexpired lease token. Checkout, webhook processing and scheduled reconciliation share this lock. An expired worker cannot overwrite a replacement worker's state; release is also token-checked. Event-created time is retained for audit, not treated as a substitute for current Stripe state. Entitlements require the exact configured price and an unexpired paid period, never the Checkout success URL or customer metadata. No payment is confirmed by a browser redirect.

The database lease lasts 90 seconds. External Checkout mutations must begin within a conservative 50-second monotonic deadline measured from before acquisition, and Stripe operations have an eight-second timeout with SDK network retries disabled. Checkout has a 60-second hosting duration. Duplicate browser requests are serialized, reuse a matching open session, and additionally use a five-minute idempotency window. Failed workers recover through lease expiry and provider retries; no process-local lock is relied upon. Same-second events, lease expiry and concurrent retry scenarios remain staging verification requirements even though the relevant controls and local tests are implemented.

Vercel does not automatically retry failed cron invocations. Monitor the endpoint's non-2xx responses and schedule health; the next scheduled run resumes the oldest-attempt rotation. Stripe webhook retries are a separate provider mechanism. Rotate `CRON_SECRET` through deployment secrets and redeploy, then verify the next invocation against the new deployment.

## Required staging verification

1. Apply the backend migration to an isolated Westmere project and test unauthenticated, non-paying, expired and active users. Verify usage limits under parallel requests; test that browser roles cannot settle usage or alter billing tables.
2. Run a consented CV evaluation set covering varied Australian roles. Verify no invented facts, useful changes, clear missing-evidence labels, formatting, refusal handling, timeout recovery and full-allowance costs.
3. Verify Checkout, authentication-required payment, renewal, cancellation, resume, failed payment, refund, dispute and repeated/delayed/out-of-order webhook events in Stripe test mode.
4. Test concurrent Checkout requests, a canceled old subscription alongside a new active one, multiple service instances, lease expiry and failed database writes. Enable the authenticated reconciliation schedule and operational alerts before live billing. Monitor non-2xx cron results and webhook backlog; verify a failed customer does not prevent the oldest-attempt rotation from reaching other users.
5. Configure the portal, tax treatment, customer notices, billing support and data-processing consent. Confirm cancellation preserves already-owned documents and revokes paid generation at the correct paid-through time.
6. Only after release gates pass, perform an explicitly authorised small live payment and cancellation verification.

## References

- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI response storage controls](https://developers.openai.com/api/docs/guides/conversation-state)
- [GPT-6.1 Sol model](https://developers.openai.com/api/docs/models/gpt-6.1-sol)
- [Stripe subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks)
- [Stripe Checkout Sessions](https://docs.stripe.com/api/checkout/sessions/create)
- [Stripe Customer Portal](https://docs.stripe.com/api/customer_portal/sessions/create)
- [Vercel Cron security and operation](https://vercel.com/docs/schedules/cron-jobs/manage-cron-jobs)
- [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration)


## Saved Assistant chats and streaming

Careers+ conversations save to `assistant_chats` through owner-scoped `/api/assistant/chats` endpoints. A row stores the transcript, generated results, extracted CV text, filename, role title and description. Originals are not stored by this flow. A private invoker trigger checks current personal Careers+ access and serialises creates with a per-owner advisory lock, enforcing at most ten chats. Owners may read or delete their chats after subscription expiry, but cannot add or update them. Deleting an account cascades to its chats. New chat resets the local view without deleting a saved chat; switching is disabled while unsaved changes need a retry. No chat content is stored in browser storage.

The Assistant streams display fields from OpenAI's structured output as they arrive, then validates the entire result before settling a credit. Partial JSON syntax is never rendered. Stop and provider failures still return the allowance for incomplete answers. The browser anchors the newest user message once per turn, does not scroll on token updates, and fades newly arriving text unless reduced motion is enabled.

Apply migration `20261117210014_assistant_saved_chats_and_allowance.sql` with the website release: it creates the owner-only chat table and raises the shared database-enforced allowance to 100 per billing period. Deploying only the frontend does not change the database allowance.

The Studio is a single full-width conversation workspace. Its desktop chat sidebar opens by default, and draft editing, copying and downloads remain inside each response. Signed-in personal Careers+ members are redirected from `/careers-plus` to `/studio`, and the main navigation points directly to their Studio. The saved-chat/allowance migration is applied on the connected Westmere database; see the release record for the deployed runtime and verification.

### Multiple documents and Role Strength

Studio supports up to ten removable attachments within the existing 24,000-character model-context bound. Optional attachment arrays in chat snapshots preserve compatibility with earlier saved chats. Uploading extracts text into the composer; Send submits text and/or attachments with request consent. New chat and saved-chat selection retain the sidebar state until deliberately closed. Pending CV statistics are indicated during generation and completed reports fade in.

Role Strength below the Studio uses the employer’s deterministic requirements-evidence measure, independently of the AI CV document-readiness rubric. Members can choose an uploaded CV, optional cover letter, or their saved base CV and use the same occupation autocomplete as job search. All matching public inventory pages are compared before showing ten results. Neither recommendations nor comparisons consume AI credit or send text to OpenAI. Explicit role links still prefill the Assistant after removal of the separate Studio role dropdown.

The connected release is now on the canonical production domain. Business live billing and the protected administrator sandbox use separate configurations; see the 22 November live-billing section below. See the production release record for origin/environment configuration and verification.

### One business plan per account — 19 November 2026

Business billing resolves the account’s single primary Stripe customer, regardless of which owned business starts the request. Historical customer mappings remain for webhook reconciliation and billing records. The partial unique index prevents another primary billing customer for the same user. The original ACME sandbox Growth subscription was retained and the duplicate Harbour Collective sandbox subscription cancelled without invoicing or proration.

The private business coverage list includes one business on Starter, three on Growth and ten on Enterprise (and the corresponding agency tiers). Profile exposes the current billing owner and coverage for each business, offers owner-only coverage selection, and links additional business creation directly to an open Verification form. Independent verification remains required. Invited managers inherit the business’s owner-funded hiring features without invoice or payment access and without using places on their own account plan.

The shared database tier helper now drives session entitlements, Applicants requirements evidence, Team, Discovery and publication limits. Coverage changes are serialised per billing owner. Plan changes below the selected business count are blocked before the Stripe confirmation flow; direct Stripe downgrades also cap effective coverage without deleting profiles or records. Uncovered businesses remain visible to their owners, with a clear explanation of missing paid coverage.

Supporting listing documents are now inside the role editor below Skills; refreshing document metadata preserves unsaved listing edits. Save and Close editor are separate controls.

Migration: `20261119034228_account_business_plan_coverage.sql`. Validation: 297 tests across 44 files, TypeScript, production build and all four deployment-traced PDF worker checks passed. Browser verification used isolated synthetic businesses and applications for changes to coverage and evidence lookups.

The live check located the reported disabled Project Coordinator evidence button under Fern Studio, outside the initial three-business selection. The button is correctly enabled for a covered business and the UI explains uncovered access. A proposed Banksia-to-Fern coverage swap was rejected by automatic approval review pending explicit approval of that exact business selection. Current coverage remains ACME, Banksia and Harbour; no access swap was executed.

### Enterprise candidate tools and owner invoice history

Enterprise and Agency Enterprise include Careers+ for the current subscription’s billing account only. `my_enterprise_careers_access()` resolves the caller’s primary billing mapping and active period, independently of shared business tiers. Session access, document extraction, Studio, chat writes, Role Strength and Strong Matches use this entitlement. Database reservation and chat triggers enforce the same owner boundary, the shared hundred-request period and ten-chat cap. Owner-only reads/deletes preserve access to the account’s own saved conversations without granting new AI access. Invited team members never receive another account’s allowance or chats.

Invoice pagination reads only Stripe customer mappings with `billing_user_id` equal to the authenticated caller. A cursor advances each owned customer’s stream independently, merging ten newest invoices per page while preserving Stripe order within same-second invoices. Historical cancelled business streams remain readable to their billing owner. Cursors referencing another customer are rejected. Current/historical invoices are presented together without including businesses managed by invitation.

The user approved and the connected data now applies the Banksia-to-Fern coverage swap described above. The previous pending-approval note is resolved.

## Agency capacity and reviewed billing transitions · 21 November 2026

| Sandbox monthly plan | Active vacancies | Active clients | Recruiter seats | Owned businesses |
| --- | ---: | ---: | ---: | ---: |
| Agency Starter · A$199 | 5 | 5 | 2 | 1 |
| Agency Growth · A$399 | 20 | 20 | 5 | 3 |
| Agency Enterprise · A$799 | 50 | 50 | 15 | 10 |

Capacity is pooled across the billing owner’s covered agency organisations. Owners count as seats; pending invitations reserve seats. Clients are separate private authorisations and do not consume owned-business coverage. Publication and invitation reservations serialize at the billing-owner boundary. Downgrade/cancellation retains records and necessary owner response access while blocking excess publication, surplus recruiter access and unattended intake. Current mandate authority remains a separate requirement.

The approved organisation type and primary billing audience must agree. A reviewed correction cannot reclassify another covered business. Subscribed corrections retain the user, organisation, customer, subscription and invoices: independent identity review → saved price/proration preview → explicit owner acceptance of its exact hash → Stripe pending update → trusted reconciliation → compatible classification and entitlements. Changed or expired quotes require a new preview. Payment failure does not activate agency permissions. Ordinary portal changes cannot cross the reviewed billing audience.

Enterprise candidate tools belong to the billed account only, for employer and agency Enterprise. Invited accounts do not inherit Careers+, Strong Matches, the 100-request period allowance or ten saved chats. Existing private chat history remains account-owned. All billing remains sandbox; these changes do not enable live payments or change tax configuration. Production charging requires the environment-specific product/price/portal and applicable tax setup already recorded in the launch plan.


### Free Assistant access for every account · 22 November 2026

Employer and agency accounts without a paid candidate-tool entitlement now retain the same three free Assistant requests as other signed-in accounts. Both the general Assistant API and its temporary upload endpoint use the existing server-owned allowance and upload controls. The interface reads the real balance and permits composing, uploads and consent without an Enterprise prerequisite. No ledger reset, database schema change, subscription grant or billing activation is involved. Automatic eligibility notices were removed from Careers+ and Assistant page entry; explicit subscription actions and premium-only tools retain their eligibility checks.


## Separate business live billing · 22 November 2026

The protected administrator’s immutable account ID selects the existing sandbox integration. Other employer/agency billing identities use live mode in Production. The browser cannot choose the mode. The existing `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and individual `STRIPE_PRICE_ID` remain sandbox values; do not overwrite them when enabling business payments.

Live business runtime configuration uses `STRIPE_LIVE_SECRET_KEY` (sensitive), `STRIPE_LIVE_WEBHOOK_SECRET` (sensitive), `STRIPE_LIVE_PLANS` (JSON map from the six business plan codes to live `priceId`/`productId`), and `STRIPE_LIVE_PORTAL_EMPLOYER`, `STRIPE_LIVE_PORTAL_AGENCY`, `STRIPE_LIVE_PORTAL_RESTRICTED`. The live webhook is `https://westmere.com.au/api/billing/webhook?mode=live`. Signature verification and event mode must agree. Plan validation checks the audience, product, price, amount, AUD currency, monthly interval and inclusive price treatment before opening checkout. A missing live setting never substitutes a test key.

A business moving from an old test stream keeps its customer mapping, invoices and subscription snapshot. Only the new live stream is primary. A stale sandbox reconciliation cannot overwrite the current subscription. Converting a personal account stops personal renewal and expires its personal entitlement before the business flow; Stripe cancellation, account conversion and later Enterprise purchase remain separate operations.
