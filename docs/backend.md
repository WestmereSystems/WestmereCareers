# Westmere Careers backend foundation

This checkout contains a Supabase schema and real server integration routes. No hosted database has been created or changed. Existing OrderWard projects are unrelated and must not receive these migrations.

## Setup

Use the pinned Supabase CLI in this repository. The checked-in migration was created with `supabase migration new westmere_foundation`, using CLI 3.1.0. Read `supabase <command> --help` before operating: v3 targets local development by default and separately confirms hosted changes.

1. Start an isolated local Supabase stack or provision a dedicated **Westmere Careers** project in Sydney. Never link to an existing unrelated app.
2. Inspect the target's tables and Data API exposure configuration, then apply the reviewed migration through the normal staging workflow. `private` must never be an exposed API schema.
3. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and `NEXT_PUBLIC_SITE_URL`. Use the public publishable key in browser settings, never the secret/service key.
4. Add the exact `/auth/callback` URL for the application origin to Supabase Auth's redirect allowlist. Configure production SMTP, sender-domain verification, email templates and abuse limits. The local configuration uses the local email viewer.
5. Configure Stripe and OpenAI according to the premium integration documentation. `STRIPE_PRICE_ID` must identify the allowed Careers+ plan; without it the server never grants premium access.
6. Provision verified organisations and memberships through a trusted operator workflow after business ownership checks. There is no public endpoint that can self-grant membership or mark an organisation verified.

The application handles unconfigured services with explicit 503 responses rather than simulating account creation, applications or billing. Public browsing can show labelled development fixtures only while Supabase is unconfigured. Once configured, database failures do not fall back to fictional listings.

## Server contracts

- `createClient()` from `src/lib/supabase/server.ts` creates a request-scoped client under the user's RLS context, or returns `null` when not configured. It is never shared between requests.
- `getSessionContext()` returns `{supabase,user,isPremium}`. The user comes from `auth.getUser()`, which validates against Supabase Auth. Premium requires trusted database subscription state, the configured allowed Stripe price, active/trialing status and an unexpired billing window. User metadata and client flags cannot grant it.
- `src/proxy.ts` refreshes auth cookies before rendering and propagates the cache-prevention headers provided by `@supabase/ssr`. Authenticated API responses are private and no-store. No session-sensitive route should use ISR.
- State-changing JSON APIs require a matching `Origin`, reject cross-site requests, bound request-body size while streaming, validate input and return generic infrastructure errors without database details or personal documents.

## Endpoints

| Endpoint                                     | Behaviour                                                                                                                                                                                                                                                   |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/sign-in`                     | `{email}` sends a Supabase PKCE magic link. The response does not reveal whether an account already existed.                                                                                                                                                |
| `GET /auth/callback`                         | Exchanges the code for a session and restricts return URLs to safe application paths.                                                                                                                                                                       |
| `POST /api/auth/sign-out`                    | Signs out the current session.                                                                                                                                                                                                                              |
| `GET /api/profile`                           | Returns `{configured,user,isPremium,profile}`; private profile fields are accessible only to their owner.                                                                                                                                                   |
| `POST /api/profile`                          | Updates `{fullName?,cvText?}` for the signed-in user. CV text is private. This does not send it to OpenAI.                                                                                                                                                  |
| `GET /api/applications`                      | Lists the candidate's applications and recorded events, excluding CV contents. Role/title/location snapshots remain available after the role closes.                                                                                                        |
| `POST /api/applications`                     | `{jobId,cvText,coverLetter?,answers?,consent:true}` submits to a live direct listing. A database constraint prevents duplicates. A transactional trigger snapshots the job context and creates the received event.                                          |
| `PATCH /api/applications`                    | `{applicationId}` withdraws the candidate's own active application. It cannot alter submitted material.                                                                                                                                                     |
| `GET /api/employers`                         | Lists the user's verified memberships and permitted roles. No memberships returns an empty workspace with a truthful ownership-review message.                                                                                                              |
| `POST /api/employers`                        | Validates a role draft or publication under the user's current organisation membership. Public listing requires a verified organisation.                                                                                                                    |
| `GET /api/employers/applications?job=<uuid>` | Lists application summaries for a role the current user can recruit for. Loading the list does not record an open.                                                                                                                                          |
| `POST /api/employers/applications`           | `{applicationId}` intentionally opens an application. The database rechecks current membership, records only the first open and returns the private application snapshot.                                                                                   |
| `PATCH /api/employers/applications`          | `{applicationId,status,message}` records an authorised shortlist/interview/offer/not-proceeding stage and candidate-facing update in one transaction. This updates the in-app timeline; email delivery is not claimed.                                      |
| `POST /api/applications/reports`             | Records the candidate's response experience privately for moderation. Direct reports derive employer and submission date from the candidate's owned application. External reports remain explicitly self-reported. Corrections reset moderation to pending. |

The employer role-creation payload uses camelCase validated fields mapped to the snake_case database columns. The company name comes from the organisation record, not from the incoming request. Response metrics and search vectors are excluded from client write grants.

## Access boundaries

All application-owned public tables have RLS enabled and explicit privileges. Candidates cannot query other candidates' profiles or applications; recruiters can access only applications belonging to their current organisations. Memberships, verification, subscription state, Stripe customers, webhook records and response projections cannot be changed by a candidate through REST.

Submitted CV text, cover letters, answers and role snapshots are immutable. An application-close race is checked again in a database trigger that locks the role during submission. Direct REST calls receive the same protection as website requests. Withdrawal revokes further employer CV reads and intentional-open calls; a separate authorised summary RPC preserves the withdrawal in the hiring workspace without exposing the CV. Previously supplied or downloaded copies cannot be recalled.

`private` contains privileged function implementations with a pinned empty search path and explicit actor checks. Public RPC entry points use security-invoker wrappers. The private schema must remain unexposed. Deliberate review of these functions and Supabase advisors is required before hosted release.

### Premium RPCs

- `reserve_ai_usage(p_mode text)` is authenticated-only. It serialises reservations with a transaction advisory lock, checks a current trusted Careers+ subscription and enforces a fixed allowance of 30 shared `improve`/`tailor`/`match` requests per billing period. Client limits cannot raise it. Failed or abandoned reservations are returned to the allowance; stale reservations expire after 15 minutes.
- `settle_ai_usage(p_reservation_id uuid,p_success boolean)` is **service-role-only** and settles only a currently reserved row. Candidates cannot refund their own successful output or reset their usage.
- `acquire_billing_lease(p_user_id)` and `release_billing_lease(p_user_id,p_token)` are **service-role-only**. Checkout, webhook and scheduled reconciliation share a 90-second per-user lease before reading current Stripe state. An expired worker cannot overwrite another reconciliation.
- `apply_subscription_state(...,p_lease_token)` is **service-role-only**, locks and validates the current lease and the pre-existing trusted customer mapping. The worker retrieves current Stripe state after acquiring the lease. Event time is retained as an audit maximum, not used to reject a fresh snapshot triggered by an old webhook.

The schema has no client write policy for billing state or usage records. The service key must stay server-only and is not required for ordinary browsing, sign-in or application submission.

## Verification performed

`tests/backend-database.test.ts` runs the actual SQL migration in PGlite, an isolated PostgreSQL/WASM runtime, using model Supabase auth/storage schemas and database roles. It verifies candidate isolation, hidden drafts, response-metric write protection, immutable application snapshots, transactional received events, duplicate/closed submissions, first-open attribution, membership revocation, authorised stage updates, response-report ownership and attribution, atomic quota enforcement, denied user refunds, trusted customer mapping and billing lease protection.

`tests/backend-security.test.ts` verifies origin checks, safe redirects, bounded/malformed JSON and the trusted subscription window. TypeScript checks cover the route and helper interfaces.

This verification does not establish hosted Supabase gateway settings, email delivery, real Stripe/OpenAI access, cloud infrastructure readiness, load performance or an end-to-end user journey with a configured hosted project. No hosted advisors were run because no Westmere project is linked.

## Before accepting real applications

The private `candidate-documents` Storage bucket is provisioned but direct file uploads remain disabled until malware quarantine, parsing and signed-access workflows exist. Initial submissions use private text snapshots. Complete those workflows before advertising PDF/DOCX upload support.

Structured response reports are private/pending by default. A moderation and appeal process must produce reviewed public aggregates using the approved cohort rules; employers cannot set those projections. Do not publish arbitrary raw reports as company findings.

An email notification worker, durable outbox/retries, employer outcome messaging, organisation onboarding/admin tools, rate-limit monitoring, account export/deletion operations, database/file recovery drills, qualified policy review and hosted security checks remain release requirements. The recorded application receipt is persisted in the database; it is not a claim that an email was delivered.
