# Agency account implementation plan

19 November 2026 · Implementation plan

Approved package limits: Agency Starter A$199/month: 5 active vacancies, 5 active clients and 2 recruiter seats; Agency Growth A$399: 20/20/5; Agency Enterprise A$799: 50/50/15. Owners count as seats and pending invitations reserve seats. These sandbox prices remain separate from the 1/3/10 owned-business coverage limits.

Introduce agency accounts through the existing organisation, vacancy, application, moderation and billing workflows. Give agencies a reviewed business identity and explicit client authorisations, then restrict each recruiter to the vacancies they manage. Keep employer ownership, recruitment authority and payment responsibility as separate relationships.

Deliver each phase as a reviewable change with its own database and API checks. Enable public agency publishing only after phases 1–5 pass together; phase 6 controls the pilot and wider release.

## Recommended first release

- Use one shared business login screen for employers and agencies, with separate Employer and Recruitment agency onboarding options. Returning users go to their authorised workspace without selecting an account type again.
- Provide a Change account type option for accidental employer onboarding. Allow unverified, unsubscribed users to correct their onboarding selection; require independent review for an approved organisation and explicit acceptance of any subscription changes. Preserve the existing login, organisation and history.
- Treat an independent recruiter as a one-person agency organisation. Individual public recruiter pages can follow later.
- Keep `jobs.organisation_id` as the advertiser and primary organisation boundary. Agency advertisements belong to the agency; the client is linked through a private engagement record.
- Let a client authorise an agency without buying a Westmere subscription. An existing verified employer owner can approve the delegation; an independently checked client representative can supply authority evidence when the client has no Westmere account. Westmere independently reviews the mandate before activation in the first release.
- Keep the final hiring decision with the employer. Agencies can screen, shortlist, arrange interviews and communicate employer-approved decisions. Broader offer authority needs an explicit grant.
- Charge the agency through its existing billing owner's primary subscription stream, with capacity pooled across covered agency organisations. Employer-owned business coverage and agency client capacity remain separate.
- Start with monthly packages containing stated vacancy and recruiter allowances. Keep the existing prices as provisional values until those allowances and agency features are defined.
- Preserve the existing Enterprise rule: included career tools belong to the billed account, and invited recruiters do not inherit them. Business accounts continue to be unable to submit candidate job applications.

## Existing foundation and required changes

| Existing area                                           | Reuse                                                                              | Change needed                                                                                                                                              |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Business sign-in and Auth callback                      | Existing email-code and OAuth authentication and Supabase identity                 | Separate sign-in from business onboarding; preserve the selected onboarding journey through authentication without treating it as authority.               |
| `business_accounts`, `BusinessSummary`, `businessFor()` | Business onboarding, Terms acceptance and session context                          | Approved organisation type must become authoritative. The current user-level `kind` cannot determine every organisation's permissions or billing audience. |
| Business verification and trust review                  | Evidence submission, independent review, feedback, suspension and audit            | Record requested type, approved type and agency evidence; add client-authorisation review.                                                                 |
| Organisation memberships and invitations                | Owner-controlled invitations, confirmed-email acceptance and revocation            | Add assignment scope for agency recruiters. Current invitations grant the organisation's recruiter role.                                                   |
| Account business plan coverage                          | One primary billing stream and selected owned businesses                           | Clients must use an authorisation relationship, rather than becoming owned businesses on the agency plan.                                                  |
| Listings and applications                               | Drafts, listing review, immutable submissions, intentional opens and stage updates | Separate advertiser from client; enforce access by engagement and assigned vacancy.                                                                        |
| Public profiles and discovery                           | Profile components, directories, search and analytics                              | Expose agency type and safe client labels; scope reports and preserve response attribution.                                                                |

Relevant starting points are [business context](../src/lib/server/business.ts), [hiring access](../src/lib/server/employers.ts), [team invitations](../src/app/api/employers/team/route.ts), [plan coverage](../src/app/api/employers/plan/route.ts), and [business billing](../src/lib/premium/business-billing.ts).

## Phase 0 Confirm boundaries and establish the baseline

Record the permission matrix, quota definitions, mandate evidence requirements and behaviour on expiry before schema implementation. Define an active vacancy, whether the owner counts as a recruiter seat, and whether pending invitations reserve seats. Recommended defaults are to count the owner and reserve capacity for pending invitations.

Capture the current migration state and run the existing checks against the exact implementation baseline. This checkout contains ongoing changes, including team invitations, account billing coverage and Enterprise access. Build on those changes without replacing unrelated work. Inspect the target database and migration history before any future hosted application.

Retain one billing audience per account's primary billing stream for the first release. An agency user may join an employer's team without changing either organisation's type or subscription. Mixed ownership of agency and employer organisations needs support review before a purchase or coverage change; multiple billing workspaces per login are a later extension.

**Exit gate:** product rules are explicit, the current checks have a recorded result, and existing employer behaviour has regression examples. Rollout does not automatically convert existing employers; requested corrections follow phase 1 and, where billing is involved, phase 5.

## Phase 1 Establish reviewed agency identity

Add `organisations.kind` with employer and agency values. Add a requested type to verification submissions and persist the approved classification when the organisation is created. Keep `business_accounts.kind` for onboarding intent and compatibility while updating callers to use the selected organisation's approved type.

Backfill organisation types from reviewed business evidence and owner records. Put ambiguous classifications into a review list; a current owner's editable account selection is insufficient evidence. Add the final constraints after backfill checks. Preserve existing organisation IDs and ABN uniqueness.

Extend the current verification form with agency identity, representative authority, recruitment specialisms and service regions. Reuse the existing request statuses and feedback. A reviewer must be independent of the agency, and paying for a subscription cannot verify it. Changes to an approved classification require a separate audited review with a billing compatibility check.

### Shared login and separate onboarding

Keep `/employers/sign-in` as the common business login initially and reuse the existing email-code and OAuth authentication. Offer Employer and Recruitment agency registration entry points that select different onboarding forms through the same authentication flow. An agency registration link may preselect `kind=agency`; that selection expresses onboarding intent only.

Separate authentication from the account-completion write. Returning users should sign in without resubmitting a trading name, changing their classification or repeating initial onboarding. Resolve their workspace from approved organisation type, membership and permissions. Where they belong to several organisations, offer an authorised workspace selector.

Preserve onboarding intent across email-code and OAuth callbacks, including the existing business-intent cookie, without trusting URL parameters, cookies or user-editable metadata to grant agency permissions. Invitation acceptance takes users into the invited organisation's context and must not change the type of a business they already own.

### Correct an employer account to an agency account

Expose Change account type during onboarding and in business settings. An organisation owner requests an approved organisation's correction; an invited recruiter cannot change its classification.

| Current state                                | Correction process                                                                                                                                                                                                                            |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unverified and no subscription to change     | Let the applicant select Recruitment agency, complete agency-specific evidence and resubmit verification. Supersede the employer submission, preserve its audit history and invalidate any stale review decision.                             |
| Verified and no subscription to change       | Create an independently reviewed correction request. Show its status and feedback while retaining the existing approved classification until the correction is completed.                                                                     |
| A subscription or billing stream is affected | Review the agency evidence and billing compatibility, show the proposed plan and effective price/date, and obtain the billing owner's acceptance before changing billing. Complete the correction through the coordinated process in phase 5. |

Use a private correction request to record the organisation, previous and requested type, requesting owner, evidence, review version, decision, billing acceptance when needed, and completion state. Preserve the Auth user ID, organisation ID, memberships, listings, application snapshots, invoices and audit history. Account duplication, a new email address and duplicate organisation records are unnecessary for this correction.

Keep agency-only permissions locked until the agency review is approved and the correction is complete. Review existing advertisements affected by the correction: genuine own-business roles can retain their valid employer workflow while client advertisements require the agency mandate and listing checks. Historical application snapshots retain the recipient details shown at submission. The correction grants no client ownership or new access to candidate records.

**Code changes:**

- Update `src/lib/business.ts`, `src/lib/server/business.ts` and session/UI contracts to include the type of each organisation.
- Separate sign-in and onboarding in `src/app/employers/sign-in/page.tsx` and `employer-sign-in.tsx`; update employer marketing entry links, `/api/auth/oauth`, `/api/auth/verify` and `src/app/auth/callback/route.ts` as needed to preserve the selected onboarding path safely.
- Update `/api/employers/account` so sign-in and Terms renewal cannot silently overwrite an approved classification or the billing audience. Permit pre-verification corrections only when their state allows them.
- Add a proposed `/api/employers/account-type` endpoint and private correction-request RPCs for requesting, tracking and completing reviewed changes. Extend `/api/admin/trust` with independent account-type correction review and reject stale or repeated completion attempts.
- Extend `/api/employers/verification`, the verification SQL functions, `/api/admin/trust`, and `private.review_trust_item` to snapshot and approve the requested classification.
- Update `employer-sign-in.tsx`, `trust-workflows.tsx`, `verification-progress.tsx`, `moderation-workspace.tsx` and `profile-hub.tsx` with agency labels and review context.
- Keep evidence and reviewer notes private. Public profiles receive only approved business fields.

**Exit gate:** employers and agencies authenticate through the same screen, separate onboarding survives each supported authentication method, and returning users reach the correct workspace. An agency cannot self-verify or change its approved type through login parameters. An accidental employer signup can be corrected without losing records, with review and billing acceptance enforced where required. A person invited to organisations of different types receives the correct context for each.

## Phase 2 Add client authorisation and revocation

Create private records for agency clients and their authorisations. A client record may link to an existing employer organisation, but a confidential or unregistered client must not be inserted into the publicly readable organisation table merely to represent the relationship.

An authorisation records the agency, client identity, requesting actor, verified approving representative, evidence reference, permitted actions, validity dates, review version, decision and revocation. Use pending, needs information, approved, rejected, expired and revoked states. Evaluate validity dates at access time; expiry must not depend on a scheduled worker running successfully.

Allow an employer owner to approve or revoke delegation for its business. For a client without an account, independently verify the representative and evidence through Westmere's reviewer workflow. A matching email domain alone does not grant authority. Keep first-release activation subject to independent Westmere review and reject reviewers affiliated with either party.

Add a private engagement record connecting each agency vacancy to its approved authorisation. Validate that the job advertiser, client and authorisation belong to the same engagement. Support an explicit own-business hiring mode for an agency's internal vacancies.

Revocation or suspension must synchronously block new agency actions and reads of candidate material under the mandate, withdraw affected advertisements from public applications, and cancel unsent recruitment messages. Preserve application history and audit records. Reinstatement requires review; it must not automatically reopen advertisements or transfer applications to another recipient.

**Code changes:**

- Add private client, authorisation and job-engagement tables through new migrations, with explicit grants, indexes, constraints and controlled RPCs.
- Add proposed `/api/employers/clients` and `/api/employers/authorisations` endpoints and a client-management component.
- Extend `/api/admin/trust` and the trust queue to review mandates independently from agency verification and listing approval.
- Reuse the moderation audit and durable notification outbox for decisions, expiry notices and revocation.
- Update listing publication and application-submission checks so a revoked or expired mandate cannot continue accepting applications through a stale public page.

**Exit gate:** agency verification alone cannot activate a client. Revocation blocks a direct API or database submission as well as the visible interface, and pending mail cannot be sent under withdrawn authority.

## Phase 3 Restrict recruiters by assigned vacancy

Reuse membership roles for the agency's own team, then add private job assignments for recruiters. For the first release, use job-level assignments; a portfolio filter must not grant access by itself. Owner/admin oversight remains subject to a valid mandate.

| Actor                 | Agency profile and mandates                                                                         | Vacancy and application access                                          | Billing                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------- |
| Agency owner          | Manage the agency and request mandates; independently reviewed decisions remain outside its control | All authorised agency engagements                                       | Existing billing owner only                               |
| Agency admin          | Manage operational records within delegated administration scope                                    | All authorised agency engagements                                       | No payment or invoice access by default                   |
| Recruiter             | Read the client context needed for an assignment                                                    | Assigned vacancies and their applications only                          | None                                                      |
| Client representative | Approve or revoke its own delegation                                                                | No agency application access by default                                 | Its own employer billing only                             |
| Westmere reviewer     | Review evidence independently                                                                       | Moderation evidence required for the review; no general candidate inbox | No customer payment management through review permissions |

Keep team invitations owner-controlled initially. Joining an agency must not create memberships in its client organisations. A future client reviewer portal can expose specifically shared shortlists after an explicit candidate-sharing step.

Introduce a shared server access helper accepting the resource and action, backed by database checks for the same rules. Add a job-aware database permission helper and use it throughout policies, RPCs and triggers. Review every existing permissive organisation-level policy: adding a narrower permissive policy does not remove access granted by an older policy.

Keep the existing employer path in `private.is_active_hiring_team`, but require agency jobs to pass a new job-aware helper. Update `list_job_applications`, `open_application`, stage updates, pool finalisation and role-overview functions as well as their API callers. A service-role storage read must occur only after the caller's resource permission has been checked. Use a consistent transaction lock order for mandate changes, publication and submission to handle revocation races.

**Code changes:**

- Extend `src/lib/server/employers.ts` or introduce `src/lib/server/hiring-access.ts`, with employer and agency paths sharing the session and Terms checks.
- Extend `/api/employers/team` and `business-team.tsx` with recruiter assignment management and seat checks.
- Apply scope checks to `/api/employers`, application list/open/stage/finalise-pool RPCs, documents, evidence comparisons, assets and listing-document mutations.
- Update statistics, discovery, role-overview RPCs, reminders and notification delivery to respect the same scope. Aggregates must not reveal another client's activity.
- Recheck membership and assignment on every document download and message dispatch. Preserve withdrawal and suspension protections.

**Exit gate:** a recruiter assigned to client A cannot discover or read client B's drafts, applicant names, documents, activity or statistics by changing identifiers. Removing an assignment or membership blocks all those entry points and invitation replay cannot restore access.

## Phase 4 Integrate agency listings and candidate disclosure

Reuse the existing editor and application pipeline. Add client selection and a named recruitment lead when an agency creates a vacancy. The public interface should distinguish the agency advertiser, disclosed hiring employer or confidential-client label, and initial application recipient.

Keep `jobs.organisation_id` and the existing `company` field attributable to the advertiser. Introduce a separate safe public client display projection. Private client identifiers, approval evidence and confidential names stay outside public job columns, search vectors, document metadata and analytics payloads. A hidden UI field is insufficient because public database grants and APIs can expose it.

Freeze advertiser and candidate-visible client/recipient details in the application snapshot. Changing a client's name or a recruiter's assignment must not rewrite past submissions. Changes to the advertised client or disclosure require listing review. Replacing an engagement after applications exist requires a reviewed handover; the first release should close the original role and create a newly reviewed role instead of silently transferring submissions.

Retain the existing direct/external source meaning. An agency can accept applications on Westmere. Attribute response insights to the recruiting advertiser and describe agency communication accurately. Preserve the existing cohort, moderation and small-sample protections.

**Code changes:**

- Extend job validation in `/api/employers`, the job-name/search triggers, listing-review invalidation, application snapshot triggers and public projection functions.
- Update `src/lib/jobs.ts`, `jobs-server.ts`, `companies-server.ts`, `search.ts`, `employer-workspace.tsx`, `job-card.tsx`, job detail pages and company directory/profile pages. Derive verified-agency badges from approved organisation state.
- Extend directory category functions and job alerts with approved agency fields and optional advertiser-type filters.
- Update candidate application timelines and account-email wording so an agency open is not presented as an end-employer review. Keep existing first-open event semantics.
- Update the canonical Terms and privacy JSON and the corresponding operational documentation to describe initial recipients, onward sharing and revocation accurately.

**Exit gate:** a candidate can identify who will initially receive an application. Anonymous APIs, search, feeds, alerts and supporting documents do not reveal confidential client information. Saved-role links and existing employer profiles still work.

## Phase 5 Connect agency capacity to billing

Extend the current primary billing stream and trusted subscription reconciliation. Keep owned-business coverage separate from authorised clients. An agency's subscription funds its recruitment capacity; authorising that agency does not move an employer onto the agency's subscription or expose either party's invoices.

Derive plan eligibility from approved organisation classification and the trusted billing audience. Pin the audience when the billing stream is established and require reviewed changes. The first-release one-audience rule applies to covered owned organisations; invited memberships use their existing owner's plan.

For an employer-to-agency correction, preview the agency package, total price, any proration or credit, and the effective date. Record the billing owner's acceptance against the reviewed request and invalidate it if the quoted terms change. Check every organisation on the primary stream so converting one business does not silently reclassify or reprice unrelated businesses.

Coordinate the approved correction with the existing subscription change and reconciliation flow. Preserve the current customer mapping, invoice history and primary stream; prevent a second subscription from being created as a shortcut. Activate the agency classification, compatible billing audience and entitlements only when the accepted subscription change is confirmed. Since Stripe and the database cannot share one transaction, keep a recoverable pending state with idempotent completion. A failed, declined or abandoned change must not enable agency access or charge an unaccepted plan, and billing cancellation remains available throughout.

Define agency entitlements centrally: active vacancy allowance, active client allowance, recruiter seats, team access and analytics. Count capacity across all covered agency organisations on the same billing stream. Serialise publication and invitation reservations at that scope so two simultaneous requests cannot exceed the allowance. Test that creating another client or covered organisation does not reset a quota.

Continue using the existing agency plan codes and distinct portal configuration. Distinguish the 1/3/10 owned-business coverage limits from the new agency client and vacancy allowances. Publish exact allowances alongside prices before selling the packages.

On cancellation or downgrade, show the effective date and affected capacity. Block new capacity beyond the effective allowance; preserve application records and owner access needed to respond, close roles and manage records. Surplus team access follows the published entitlement rules. Keep cancellation, revocation and billing management available when purchasing eligibility is lost. If a role can no longer be serviced by an authorised team, pause it rather than continue collecting applications unattended.

**Code changes:**

- Extend `src/lib/business-plan.ts`, `plan-features.ts`, `business.ts`, `billing-plans.ts`, and the database entitlement helpers.
- Update `src/lib/premium/business-billing.ts`, `/api/billing/account`, reconciliation and webhook paths, invoice ownership checks, and `/api/employers/plan`. Add reviewed cross-audience correction handling without allowing ordinary portal plan switching to bypass classification review.
- Update `billing.tsx`, `business-profile.tsx` and employer marketing to distinguish owned businesses, authorised clients and pooled usage.
- Preserve billing leases, idempotency, signature verification, lifecycle/risk-event handling and historical customer mappings. Verify agency changes through [subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks) and restrict plan switching through the [Customer Portal configuration](https://docs.stripe.com/customer-management/configure-portal).
- Test in the existing sandbox first. Production activation needs explicit environment-specific product, price and portal configuration: current price validation and webhook handling deliberately reject live mode. Make that selection explicit and fail closed on mismatches.
- Confirm GST/tax display and registration setup before activating production agency prices. If Stripe Tax is used, complete the [recurring-payment tax configuration](https://docs.stripe.com/tax/subscriptions) as part of the catalogue setup.

**Exit gate:** employer prices cannot purchase agency access; duplicate or out-of-order webhooks cannot double-grant capacity; clients and invited recruiters cannot open the agency's invoices; payment never grants verification or a mandate; concurrent publications respect the shared limit. A subscribed employer can complete an approved correction only after accepting its billing changes, with no duplicate subscription or inconsistent access during a failed or retried transition.

## Phase 6 Verify the full journey and release gradually

Use synthetic agencies, two clients, an agency owner, an assigned recruiter, an unassigned recruiter and separate candidate accounts. Include an employer owner with no agency affiliation and an independent reviewer. Test organisation and client boundaries through ordinary sessions, direct database calls and all document routes.

Extend the current PGlite migration execution tests and route tests. Add focused agency coverage rather than UI-only checks:

- Shared login, separate Employer/Recruitment agency onboarding, email-code/OAuth return paths, returning-user routing and invitation/workspace context. A forged `kind` parameter or business-intent cookie must not change approved type or grant permissions.
- Approved type backfill, conflict handling, Terms renewal and attempted self-conversion.
- Accidental employer onboarding corrected before review; stale review rejection after resubmission; verified and subscribed correction requests; owner-only requests; independent review; rejected/canceled requests; preserved identifiers, records and historical application snapshots.
- Accepted billing previews, changed-quote invalidation, failed or retried cross-audience subscription updates, no duplicate subscription, mixed-business coverage conflicts and agency permissions remaining locked until completion.
- Independent verification, mandate approval, expiry, revocation and suspension.
- Client A versus client B access, removed assignments, withdrawal, stale requests and invitation replay.
- Confidential client projections, immutable application attribution, accurate open events and safe response insights.
- Billing audience, invoice isolation, pooled quota races, pending invitation reservations, cancellation and downgrade.
- Existing direct-employer free posting, Growth team access, owned-business coverage, Enterprise billed-account career tools and business-account application restrictions.

Starting test suites are `backend-database.test.ts`, `auth-callback.test.ts`, `business-account.test.ts`, `business-team-api.test.ts`, `employer-statistics-api.test.ts`, `billing-account.test.ts`, `premium-billing-lock.test.ts`, `enterprise-session.test.ts` and the search/profile suites. Run `npm run check`, the email-worker type check, and browser journeys at desktop and mobile sizes against the final change.

Use an expand, backfill and enforce migration sequence: add compatible fields and private tables, resolve existing classifications, deploy compatible readers and writers, then enable agency behaviour and final constraints. Replace broad agency access policies atomically; never leave both broad and scoped access enabled as a compatibility measure. Keep agency activation disabled until the schema and application are ready together. Create migration files through the repository's Supabase CLI workflow; do not edit applied migrations. Keep private schemas unexposed and give new tables explicit grants and policies, following [Supabase row-level security guidance](https://supabase.com/docs/guides/database/postgres/row-level-security). Follow the installed Next.js security and authentication guides for request checks and private, uncached responses.

Run a staging pilot first, then an invite-only production pilot with reviewed agencies and clients. Confirm the complete flow: shared login, agency onboarding, agency verification, client authorisation, recruiter invitation/assignment, publication review, candidate application, intentional open, candidate update, revocation and billing lifecycle. Include an accidental employer onboarding correction and a subscribed correction with accepted pricing. Monitor permission denials, reviewer workload, notification delivery, quota usage and subscription reconciliation.

Use a server-enforced agency release setting to stop new agency onboarding/publication if required. Preserve the restrictive database rules, revocation controls, records and necessary owner/billing access during recovery. Removing UI controls or reverting to the earlier broad access policies is not a rollback strategy.

**Exit gate:** all security and billing acceptance checks pass, a reviewer can operate the queues, the pilot demonstrates candidate and client clarity, and support can suspend an agency or revoke one mandate without affecting unrelated employers.

## Later extensions

Add individual recruiter profile pages, client shortlist portals with recorded sharing permissions, richer portfolio reporting, ATS imports and multiple billing workspaces after the core pilot. Each should reuse the approved agency identity, mandate and vacancy-scope boundaries established above.

## Delivery order

| Change set                               | Dependency       | Reviewable outcome                                                                     |
| ---------------------------------------- | ---------------- | -------------------------------------------------------------------------------------- |
| 0 Baseline and product rules             | Current checkout | Permission matrix, capacity definitions and regression baseline                        |
| 1 Agency classification and verification | 0                | Shared login, separate onboarding, approved organisation type and reviewed corrections |
| 2 Private clients and mandates           | 1                | Audited authorisation, expiry and revocation                                           |
| 3 Recruiter scope                        | 2                | Scoped database/API access and assignment management                                   |
| 4 Listings and candidate experience      | 3                | Clearly attributed agency advertisements and applications                              |
| 5 Billing and capacity                   | 1–4              | Agency packages, accepted billing corrections, safe reconciliation and pooled limits   |
| 6 Pilot and release                      | 1–5              | Verified complete journey and controlled availability                                  |

Update `docs/backend.md`, `docs/premium.md`, `docs/trust-and-alerts.md` and `docs/release-status.md` as each change ships. Keep the proposal's defaults separate from the implementation status and active price catalogue.

## First-release implementation and acceptance

The first-release identity, correction, private client mandate, recruiter assignment, disclosure, billing and capacity workflow is implemented. The synthetic hosted pilot covered two clients, separate assigned/unassigned accounts, candidate CV/supporting PDF handling, first-open attribution, scope denials, revocation/re-invitation, actual sandbox billing corrections, downgrade, concurrent last-slot publication and cancellation. Temporary reviewer access and test accounts were removed or disabled after acceptance; financial/audit records remain archived. Agency publishing remains controlled by independent per-agency pilot approval and current authority. Live billing, public recruiter pages, client shortlist sharing, ATS and multiple billing workspaces remain outside this release. See the release-status and premium documents for final checks and sandbox boundaries.
