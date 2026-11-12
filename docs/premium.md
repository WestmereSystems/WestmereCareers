# Careers+ server integrations

These handlers connect to real OpenAI and Stripe services once configured. They never return a fabricated AI review, pretend a subscription is active, or give a browser the service keys. Live provider calls, tax settings, database policy deployment and webhook delivery have not been verified in this workspace without the relevant credentials and a dedicated Westmere Supabase project.

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

Modes are `improve`, `tailor` and `match`. Role text is mandatory for tailoring and matching. Consent must be explicitly true. The server validates the authenticated session and a fresh paid entitlement, reserves one of the 30 shared monthly studio requests in a database transaction, and only then calls OpenAI. The current monthly allowance includes matching requests as well as application packs; the product must disclose this before billing.

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
