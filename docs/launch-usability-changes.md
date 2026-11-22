# Launch usability changes — 17 November 2026

Implementation is deployed to the canonical staging site. Workflow, administration, document, search, candidate-pool, billing, assistant and profile migrations are applied to the WestmereCareers database (`ldmwqupidlgrkkjjpcvn`); their filenames match its migration history. This database is shared with the existing production frontend; no separate staging database was provisioned. The production frontend deployment is unchanged.

## Interface and authentication

- Dashboard has the same bordered, rounded panel treatment as Discovery. The demo banner and content below its navigation have 32px desktop gaps; narrow layouts retain spacing without horizontal overflow.
- Employer navigation is Profile → Roles → Dashboard → Discovery. Roles contains listing controls, lifetime consented views, active application totals, private document review and actor-attributed listing history.
- Company links use `/companies/<company-name>-<full-unique-id>`. Old UUID links and older slugs redirect to the canonical name. The ID, rather than the name, determines identity.
- Closing the assistant leaves a purple star tab at the right. Its state survives refresh in the current browser tab session.
- One email sign-in flow handles both new and existing accounts. The account-creation checkbox is removed; nameless personal accounts complete name onboarding after authentication. Code instructions/errors are inline, the code field receives focus, the provider divider precedes the Google/Microsoft buttons, and both have service icons.
- Native checkboxes use Westmere colours, a visible check and a keyboard focus outline.

## Search

The existing curated suggestions are retained alongside 18,622 GeoNames Australian places and 3,338 ABS OSCA titles. See [directory provenance](search-directories.md).

Radius choices are 5, 10, 25, 50, 100 and 250 km. Distances measure a straight line between locality centres. Ambiguous town names require a state; nationwide remote roles remain eligible. New employer listings receive coordinates when their locality resolves. The existing database listing was geocoded.

Listing-age windows are 24 hours, 3, 7, 14, 30 and 40 days, with optional custom inclusive UTC calendar dates. The same filters survive URLs, saved searches and email digest matching.

## Listings, applications and transparency

- A free company can have one active published listing. The database serialises publication per company, so concurrent requests cannot bypass the limit.
- New and renewed listings expire after 40 days, or an earlier employer closing date. Public access stops at expiry; a five-minute database schedule archives expired rows. Applications, statistics and listing IDs survive.
- Renewal is available to an active verified hiring team for an approved listing. It extends availability without resetting the original publication date, applications or counters, and records the actor and expiry in history.
- Individual archive actions explain that applications and statistics remain. Whole-company removal is owner-only and requires the exact business name in a red confirmation dialog. It lists public profile, listing, Discovery and hiring-access losses. The database checks the name and archives records atomically. An active subscription must be cancelled and have ended before company removal; the removal flow does not silently change billing.
- Application forms load the account CV automatically. Candidates can select a library version, upload a new PDF/DOCX, or submit reviewed text. A selected original file is copied into private application storage; deleting a library CV does not alter the application. Editing extracted text switches to text-only submission to avoid silently attaching a different original file. The sharing checkbox resets after document or cover-letter changes.
- Original document downloads recheck verification, membership and withdrawal on every request. Documents are not public and cannot be browsed through a candidate Data API query.
- First intentional openings and employer stage changes use the existing candidate timeline, in-site notices and service-email preferences. Loading an applicant list does not count as a view.
- Employers explicitly select an interview pool and confirm closure. Selected candidates receive an interview-stage update; other active candidates receive a not-proceeding update. Existing interviews/offers are preserved and withdrawn applications are skipped. The confirmation checks the exact reviewed candidate IDs in the same transaction, preventing unseen new submissions or withdrawals from being silently included. The current review list is capped at 1,000 applications; a complete active list is required before pool confirmation.

## Billing and administration

Billing uses stable account/company identifiers as fetch dependencies and retains loaded data during session refresh. The business selector has no placeholder and contains only owned companies. The free allowance is explicit, plans use check-point feature lists, and advertising disclosures appear below the list. Cancelled subscriptions no longer disable a fresh plan selection as if they were current.

Business verification and accepted current Terms are required for purchase and plan changes on the server and in the interface. Existing cancellation/payment controls remain available when verification is suspended.

Testing controls inspect the target account and offer the matching personal, employer or agency tiers. Business test tiers require a verified owned company. Assignments remain separate from Stripe payments and are recorded in the shared Admin activity table with actor, target, reason, tier and time.

The user-authorised live permission transfer is complete and verified:

- Primary owner account: enabled admin, testing operator.
- Former staff account: staff disabled, testing operator removed; ordinary personal and owned-employer access is unchanged.
- Historical actions retain their original actor. The permission change itself is logged as system maintenance, not falsely attributed to an interactive account action.

## Policies and verification

Privacy and Terms describe the implemented flows. Terms version is `2026-11-17.1`, so existing business accounts will need to accept it before further hiring actions after the new website version is deployed. Operational wording specifies conditions and response periods, including verification response within 48 hours, complaints acknowledged in five business days and answered within 30 days, and cancellation requests actioned within two business days. These are operating commitments to review before launch. Statutory consumer/privacy protections remain in the documents.

TypeScript, all 209 tests, production compilation and traced PDF worker checks pass. Browser verification covered demo spacing/borders, sign-in layout and icons, nationwide suggestions, a 100 km Melbourne search including Geelong, persistent assistant closure and 390px/1440px layouts. No browser console errors were observed. The staging deployment additionally passed authenticated PDF and Word uploads, candidate submission with an account CV or a new Word CV, original-file employer download (matching SHA-256), first-open notices, interview selection and non-selection notices. Candidate receipt/open/interview emails were confirmed in the test inbox. Stripe sandbox Checkout was completed by the user; the webhook processed successfully and Careers+ access appeared. No live-mode payment was made.


## Billing confirmations

Billing notifications use the paper/check icon in both the notification menu and full activity page. Meaningful subscription state changes, renewals, cancellation scheduling/resumption, invoice payment success/failure, refunds, billing details/payment-method changes and audited test-tier grants/revocations generate private account notices. Stripe event notices are idempotent, customer mappings determine recipients, and business notices go to current owners. Reconciliation no-ops do not notify. Billing service mail uses the existing delivery outbox and is independent of candidate application-email preferences. Global delivery suppression remains in force.

The cancellation test exposed Stripe Portal using `cancel_at` with `cancel_at_period_end=false`. Personal and business reconciliation, entitlement end dates and Billing now honour either form; earlier cancellation never extends the paid period. Regression coverage includes the actual timestamp-only response shape. Personal billing no longer displays the employer job-advertisement disclosure.

Billing service-email validation now accepts the fixed private Billing-tab path. The existing alert worker was updated with no credential or dispatch-authentication changes, and a blocked synthetic confirmation was safely retried before provider delivery was checked.

Scheduled plan creation, changes, release, cancellation and completion, plus payment-method edits and automatic card updates, also produce billing notices. Schedule metadata-only edits do not send a notice. The Stripe sandbox endpoint subscribes to the corresponding events.

## Earlier launch-flow staging verification

Before the assistant overhaul below, the staging alias resolved to ready deployment `dpl_BrAfL9hbwZQcxzFth4FCMpVZFyYd`, built from runtime commit `480c43b47cf407310dec6913f4b08c9701e42e4b`. The existing alert worker is active at version 8. Runtime files were deployed directly through the authorized Vercel project; GitHub publication was blocked by automatic approval review and the remote branches remain unchanged. Private operational documents and unrelated local files were excluded from the deployment.

Both Google and Microsoft were verified from sign-in through the callback to `/account`. Google retained the original candidate user, uploaded CV versions and applications. Microsoft linked to the existing email-authenticated employer user and retained ACME membership. Each email still has exactly one Auth user; neither flow requested new-account name onboarding. Identity linking relies on Supabase's verified-email identity matching, with no client-side email merge. Microsoft's existing Azure tenant URL was corrected with user approval by removing a duplicated OAuth path; the tenant, client ID, secret and permissions were preserved.

The Stripe sandbox purchase and cancellation both produced private paper/check notifications and delivered service email. A fresh signed subscription webhook verified the timestamp-based cancellation fix. Careers+ remains available until 17 December 2026, with renewal cancelled. The existing ACME Growth subscription was retained; no second employer plan was purchased. Broader invoice/refund/payment-method/schedule cases have automated coverage but were not all separately exercised in the browser.

The synthetic non-selection application was withdrawn with explicit approval, and the employer's original-document download subsequently returned access denied. The candidate's original empty base CV was restored with explicit cleanup approval; all three synthetic library versions and submitted document copies remain. Both QA listings were closed and archived; the original employer draft remains unchanged.

All 209 tests, TypeScript, production build and traced PDF-worker checks pass. Final Google profile verification recorded no browser console errors. The remaining Supabase advisory is the pre-existing [disabled leaked-password protection setting](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); RLS-without-policy entries are deliberate service-only/private tables. No security setting was weakened for testing.

## Assistant and employer refinement — preceding staging release

Before the Discovery/profile release below, the canonical [staging site](https://westmere-careers-git-codex-staging-order-ward.vercel.app) resolved to READY deployment `dpl_5HQcNRafnwRR5hmBtjU5SimZLpaB`, built from source commit `e824d88ff18e2cf393cce44a352000303f883eb5`. Production still resolves to `dpl_Cy5vYXojAQnG8ADrWQq8QBEG3gXB` at `41dde6ad051cc9e0a3b3c9842fa43c9f2f969764`. Deployment protection remains enabled. Runtime source was deployed directly to the authorised Vercel project; the public GitHub remote remains unchanged following the earlier automatic approval rejection.

### Assistant

- The heading, greeting and response markers use the folded tab's star. The folded tab sits on the right and retains its closed state across refresh in the browser tab session.
- A dotted output surface separates the conversation from its container. The greeting enters within the chat. Starting options follow the pointer with a restrained radial gradient. The send and Stop controls have a square shape, curved corners and a purple gradient. Progress points and shimmer placeholders respect reduced-motion preferences.
- Short instructions and follow-up questions use the recent eight messages as context. Only relevant career-preparation work is actioned; unrelated requests receive a scope acknowledgement. Missing documents receive a local upload instruction without consuming an AI request.
- Assistant source documents are uploaded as PDF, DOCX or TXT. The original-CV paste box and duplicate legacy Studio form are removed. Instructions remain editable alongside the document, and generated results can still be edited, copied and downloaded. The styled consent checkbox explicitly covers document text, instructions and recent chat sent to OpenAI and resets after relevant changes.
- Stop aborts the request and provider call, with server-side cancellation polling as a fallback. Only completed answers consume a credit. Database locking resolves completion/cancellation races, including Stop arriving before allowance registration. A completed answer cannot subsequently be refunded by reusing Stop. The private cancellation ledger contains hashed identities and request/reservation identifiers, never CV text, prompts or generated answers.

### Notifications, billing and employer editing

- A bell-menu clear action dismisses that notice from the menu and marks it read, retaining it in the account's complete Notifications history. Menu links open the profile's Notifications tab. History has numbered ten-notice pages with previous/next navigation.
- New personal and employer paid subscriptions use recurring Stripe Checkout subscriptions and auto-renew by default. Billing states the renewal behaviour. Existing cancellation instructions are preserved: the user-cancelled sandbox Careers+ subscription was not reactivated and no additional subscription or payment was created during this refinement.
- The employer role editor uses the public listing's shared typography and body component for editing and preview. Employers can customise the role's introduction, section headings, responsibilities, requirements and skills. Salary is optional; both amounts must be supplied together or omitted. Omitted salary renders as “Salary not specified”.
- Saving a role updates only allowed listing columns. Organisation ownership is bound during creation and is never rewritten during edits; the existing database restriction remains intact.
- Employer profile/header pictures use the uploaded company image, with cache versioning and an initials fallback when no eligible image is available.

### Growth requirements evidence

The requested automated candidate ranking and 0–100 employment suitability scores were not implemented. Growth and higher plans instead have an optional purple requirements-evidence control. It locates literal wording in submitted documents and displays short source-attributed excerpts beside the role's requirements and skills. It does not call a model, infer candidate attributes, decide whether a requirement is met, score or rank applicants, or make selections. Candidates can be sorted by submission date, name or recorded stage. Sensitive/protected criteria are excluded from lookup.

The route reuses existing verified-employer membership, application-open and withdrawal checks in bounded batches of twenty, with four document reads at a time. Opening evidence records the existing intentional-view event; merely loading the applicant table does not. Responses include the evidence excerpts rather than entire CVs. An initial bulk-CV database RPC was rejected by automatic approval review, removed from the implementation, and verified absent from the hosted schema; no additional bulk CV access grant was applied.

### Verification and retained test data

- All **226 tests in 33 files**, TypeScript, production compilation and the three deployment-traced PDF-worker checks passed. Regression coverage includes paid/free cancellation and late completion, owner-scoped notification clearing/history, nullable salary/custom labels, immutable organisation ownership, Growth permission/withdrawal checks and literal source evidence without scores.
- A real staging assistant request was stopped before completion: the UI kept 30/30 requests, the private attempt was cancelled and the usage reservation failed. One subsequent completed request used exactly one credit (29/30), acknowledged the fictional CV and declined the unrelated joke request while answering the relevant CV instruction. The database confirms one cancelled and one completed attempt for that test account.
- Synthetic PDF, DOCX and TXT uploads were accepted. They did not alter the candidate's restored empty base-CV selection. Only the synthetic PDF was used for the new completed AI test; no personal document was sent for this verification.
- Clearing the synthetic application-open notice removed it from the bell menu, reduced the unread count and retained its row and full-history entry. Numbered page two showed the older two of twelve notices. Clicking a billing notification opened the profile Notifications tab.
- The existing ACME employer signed in through Microsoft and retained its membership and Growth plan. Its uploaded company image appeared in the header. The synthetic interview role saved with both salaries null, custom headings and updated requirements, retaining its application. The evidence view correctly quoted project coordination, Excel, scheduling and communication from the synthetic CV.
- Both synthetic roles were returned to their archived/closed state; application records, existing interview stage and statistics remain. The original Customer Success Manager draft remains unchanged. No hiring selection or notification stage was changed during this refinement.
- Final assistant layout checks measured 390px viewport/390px document width and 1280px viewport/1280px document width, with a full-width conversation/composer at each breakpoint. The temporary viewport override was reset. Final assistant and employer checks recorded zero browser console errors.

Visual proof is retained under `artifacts/`, including `westmere-assistant-final-full.jpg`, `westmere-assistant-mobile-verified.jpg`, `westmere-assistant-right-tab.jpg`, `westmere-notification-pagination.jpg`, `westmere-notification-retained.jpg`, `westmere-role-preview.jpg`, `westmere-requirements-evidence-verified.jpg` and `westmere-employer-profile-image.jpg`. Unrelated private policy drafts and deliverables were preserved locally and excluded from deployment.


## Discovery, profile and application overhaul — current staging release

The current release uses runtime source `5b6532414efbb09075f9104fdb51aaa298552060`, deployment `dpl_Gq8qZKHGCfH67pfRGAZdNr7Ezkxw`, on the canonical staging alias. Database migrations `20261117104850_discovery_profile_application_steps.sql` and `20261117112432_test_listing_context.sql` match hosted migration history. The shared maintenance worker is active at version 9. The database is shared with the production frontend: published test fixtures can also appear there. No production frontend release was requested or performed. Source was deployed directly to Vercel; public GitHub publication remains blocked by the earlier automatic approval review.

### Discovery and job results

- Discovery has eight selectable state/territory outlines derived from ABS boundaries, capital-city markers from the bundled GeoNames directory, selection zoom and labelled Christmas Island/Cocos (Keeling) Islands insets. Their GeoIP country codes CX/CC contribute to WA reporting. This is a reporting grouping of external territories, not a claim that they are legally part of WA. Source and licence attribution are in [directory provenance](search-directories.md).
- A capital marker appears only when that region has at least one recorded search appearance. Listing/profile views alone do not create it. Region outlines and keyboard controls remain available with zero searches. The top region selector, outline and region buttons share the same selection. An empty selected region explicitly says there is no data for it.
- Tables beside the map report search appearances, listing views, company-profile views, recognised career keywords and counts. All-region keyword rows identify the most frequent region in an adjacent badge; ties use alphabetical region codes. Regional selection filters the tables and summary cards. The five-event suppression threshold and former keyword-row limits are removed. The recognised career-keyword allowlist remains: arbitrary query text and personal search details are not retained. Other public employer-response cohort thresholds are unchanged.
- The public demo uses the same map and tables, including a single-appearance keyword and an empty-region state. Employer marketing describes the updated reporting.
- Job results have two-column/grid and single-column/list controls at the upper right, saved in local browser storage. Numbered pagination appears above and below multi-page searches, and below searches containing one page or fewer. The page controls share the same state and preserve filters.

### Profile and CV library

The main card is “Your Profile”. First name, last name, verified account email and optional LinkedIn, portfolio, GitHub and other professional links display as text until Edit Profile is selected. Email changes use the existing two-inbox confirmation flow. Name parts stay consistent with display names, including OAuth/onboarding records. HTTPS profile links are validated on write and filtered on read so malformed stored JSON cannot break an employer's application view. A compact horizontal privacy notice appears below the details.

“My CV” is a separate block below. The selected account CV is highlighted above the rounded drop area. Multiple PDF/DOCX files can be selected together or dropped into the area, up to twenty library versions in total. History has five timestamped versions per numbered page. The client, upload API and database enforce the capacity limit and explain that at least one resume must be deleted before adding another. Deleting the selected library file clears its account selection and base text, while submitted copies remain separate.

### Applications and private documents

A horizontal four-step form guides candidates through profile review, CV confirmation, optional documents/declarations, then final review and explicit sharing. The selected CV's filename appears in final review. Candidates can upload a different CV without replacing the account selection. Automatic CV loading reads the selected original file's authoritative extracted text. Cover letters can be written or uploaded; uploaded cover-letter text is taken from that file on the server. Up to eight optional PDF/DOCX attachments can be labelled cover letter, supporting document, certification, driver’s licence or work-rights document.

Work-rights choices include Australian/New Zealand citizenship, permanent residency, visa rights/conditions, sponsorship required and a choice to discuss with the employer. Driver’s licence and certifications are optional declarations. No declaration is presented as verified, and identity-document uploads are not mandatory. No candidate ranking or automated selection was added.

The final submission transaction claims only the candidate's own unused attachments, rejects duplicates, foreign IDs and expired uploads, and retains fixed CV, cover-letter, document and declaration records. Authorised employer openings display current profile name, email and links; they do not grant general access to the private profile or CV library. Existing withdrawal, verification and membership checks apply to openings and every document download. The privacy policy describes these flows.

Unsubmitted attachments become unusable after 24 hours. The existing five-minute maintenance run queues expired files and retries storage deletion before clearing queue records. Automatic approval review initially blocked replacing the shared worker; deployment occurred only after the user's explicit approval of this scoped cleanup addition. Authentication and mail-dispatch logic were preserved.

### Published fictional fixtures

Three new organisations—Westmere Test — Fern Studio, Westmere Test — Banksia Services and Westmere Test — Harbour Collective—have one published fictional role each. Ten further TEST ONLY roles are under the existing ACME example workspace, for thirteen published test roles across four workspaces. They cover all eight state/territory reporting groups, have optional salary omitted, and expire after forty days unless renewed. The existing original draft and two older archived QA roles were preserved. The test company/role flags are server-managed, and new roles under a fictional company inherit the test flag. Public labels and application confirmation explicitly state that no employment is available and synthetic data must be used.

The configured existing employer owner can review these applications through Roles. No new staff/admin role or real subscription was created. The fixture manifest is retained locally as `artifacts/westmere-published-test-roles.json`.

### Verification evidence

All **235 tests in 34 files**, TypeScript, production build and the four deployment-traced PDF upload workers pass. Tests cover single-event keyword reporting, top-region aggregation, CX/CC grouping, twenty-CV capacity, owned/foreign attachment claims, uploaded cover-letter consistency, expired-upload cleanup, current profile identity with fixed documents, untrusted stored links, and inherited fictional-role labels.

Browser and database checks confirmed:

- Thirteen live test results produced both pagination bars; page two showed the final role. A one-result Graduate Designer search had only the bottom navigator. Both layout controls worked.
- Live ACME Discovery had eight outlines and exactly one marker at Melbourne for its six recorded search appearances. Empty WA showed no count and the explicit no-data message. The demo showed the single-appearance keyword, correct state badge and selection zoom.
- Three synthetic CVs uploaded together, bringing the candidate library from three to six. History showed five on page one and one on page two. The incoming selected account CV (`61e8238c-ec61-4d46-a999-bcf16b4e6fae`) was preserved. All six versions are retained for review; no original library version was deleted.
- A complete fictional Project Coordinator application (`562f814b-be56-43a8-a4c5-f912c49fca28`) submitted with the account Word CV, a synthetic Word cover letter, a supporting PDF and clearly synthetic declarations. The employer saw its current profile link after a post-submission edit. CV and letter hashes remained identical, all three original files were retained, and the downloaded cover letter matched the upload byte-for-byte. The temporary portfolio link was removed afterwards.
- Loading the applicant list did not count as an opening. An intentional employer open created the candidate's opened event, visible alongside the receipt in My applications. No hiring selection or interview decision was made. The application remains opened for review, and its test role remains published as requested.
- A separate unused synthetic attachment was backdated to simulate expiry. The scheduled version-9 worker removed its pending row, storage object and cleanup-queue entry; submitted documents were unaffected. The second application flow was not submitted.
- At 390px, the profile, Discovery and final application review have a 390px document width. The application steps scroll within their 306px container instead of widening the page. At the normal 1280px viewport, the search layout fits without overflow. The temporary viewport override was reset.

Visual proof includes `westmere-discovery-live.jpg`, `westmere-discovery-overview.jpg`, `westmere-discovery-wa.jpg`, `westmere-discovery-mobile.jpg`, `westmere-jobs-list-layout.jpg`, `westmere-profile-cv-pagination.jpg`, `westmere-profile-mobile.jpg`, `westmere-application-review.jpg`, `westmere-application-submitted.jpg`, `westmere-application-mobile-final.jpg` and `westmere-employer-application-review.jpg` in the local `artifacts/` directory. The final advisor findings remain the existing leaked-password warning plus deliberate service-only/private RLS-without-policy entries; no security setting was weakened.

## Saved conversations and employer workspace release — 18 November 2026

The canonical connected review site, `https://westmere-careers-git-codex-staging-order-ward.vercel.app`, now points to READY deployment `dpl_7i6g2mLdhMMpY8akKB6zVFAhPQN8`, built from the isolated runtime snapshot `b9a34a5c5778476d217ae11bfc4befaa18633a21`. Source was uploaded directly to the existing Westmere Vercel project; its public GitHub remote and the separate production demo frontend were not changed. The release package includes the synthetic PDF fixture required by the build's document-worker checks. Deployment protection is preserved.

Migrations `20261117210014_assistant_saved_chats_and_allowance.sql` and `20261117210041_employer_category_discovery.sql` are applied and match hosted migration history. Read-back verified the 100-request database cap, enabled chat RLS with owner-scoped create/read/update/delete policies, and invoker security for category discovery. This remains the existing shared Westmere database. The new chat table introduced no security-advisor findings; pre-existing advisories are unchanged.

The homepage has a layout-shaped loading skeleton; other routes retain their previous skeletons. The Assistant streams validated display fields with word fading, keeps the latest prompt in view without scrolling on each update, shows one inline sharing reminder, and treats an optional category as a first-turn suggestion. Careers+ supports ten saved, owner-only conversations, reset, reopening and deletion. Drafts can be edited in the conversation and copied or downloaded. The Studio uses the full available width, with its chat menu open on the left on desktop. Signed-in personal Careers+ members go directly from Careers+ to the Studio, and their navigation/title reflects that destination. Employer accounts do not receive that personal-member redirect.

Explore employers has a hiring-category dropdown based on caller-visible published roles, preserving the category in pagination and combining it with literal employer-name search. Each employer-managed role is a separate horizontal card. Pencil edit controls are separated from the other actions; all role action buttons share dimensions within each responsive layout. Employer profile job cards have a 24px gap.

All 264 tests, TypeScript, the production build and four traced PDF upload-worker checks passed. The final copy/mobile consistency changes also passed their seven focused navigation/category tests and production checks. Hosted browser verification confirmed configured account services, live category filtering, 24px employer-profile card gaps, and the signed-in ACME employer role list. Its sixteen role cards each had a pencil control; action dimensions were uniformly 200×46 on desktop and 312×46 at a 390px viewport, with no horizontal page overflow. The member redirect and full-width Studio were additionally verified using the isolated synthetic-account browser fixture. No employer listings, applicant stages or billing settings were changed during this release verification.

Visual proof: `artifacts/westmere-roles-released.png` (hosted employer workspace) and `artifacts/westmere-studio-full-width.png` (synthetic-account Studio preview). Private drafts and unrelated local deliverables were excluded from the deployment.

## Business teams, applicant review and radius search — 18 November 2026

Released to the existing protected, connected review site (`https://westmere-careers-git-codex-staging-order-ward.vercel.app`). Runtime source commit: `24e05152c54eca739cbc9c7c53656e910f84e766`; deployment: `dpl_6gLU6cX9hdNAZmCVsLFTUA7Pt6cG` (`westmere-careers-657humhku-order-ward.vercel.app`). The separate public production demo remains on its prior frontend.

Applied hosted migration `20261118095318_business_teams_and_location_coordinates.sql` to the dedicated Westmere project, and deployed invitation support to `westmere-alerts` version 10, preserving its existing dispatch/webhook authentication. Team management is under Profile → Team; invited personal accounts can find Business invites in their profile. Applicants is directly to the right of Roles and includes role selection, private document review, current contact/social details, submitted declarations and optional evidence-coverage sorting.

Validation: full 279-test suite passed, followed by the new radius-count regression (10 search-server tests passed); production build and all four traced PDF workers passed. Isolated PostgreSQL tests covered creator-only permissions, Growth gating, email changes, revocation/replay, expiry, notification fan-out, invitation cancellation before dispatch, and invitation bounce isolation. Synthetic browser checks covered chronological/score sorting and full submitted details without sending real candidate notifications. Team layout at 390px had no horizontal page overflow. Hosted anonymous radius lookup returned Canberra across the NSW/ACT border; coordinates were populated for all existing listings. Security advisors showed no new warning category; private invitation/location tables intentionally have RLS with no client policies.

Microsoft OAuth intentionally does not set `prompt=login` or `prompt=select_account`. A valid Microsoft browser session can complete SSO without a visible sign-in/account-picker page; the authorization redirect still occurs and provider consent, session expiry or organisational policy can require interaction.

Final release readback confirmed the alias points to `dpl_6gLU6cX9hdNAZmCVsLFTUA7Pt6cG`, the hosted search reports **3 roles** for Queanbeyan NSW at 250 km including Canberra, and the signed-in personal profile exposes Business invites. Hosted owner-scoped RPC readback confirmed ACME’s Growth team is enabled. The browser’s active session changed to a personal Careers+ account during verification; employer detail/score interactions were verified with isolated synthetic browser data, without changing the user’s sign-in or sending candidate notices.

Applied the additional account-deletion regression fix in migration `20261118100318_business_invitation_account_cleanup.sql`; all 75 database tests passed. Invitation records no longer introduce an extra Auth account deletion restriction, and deletion of an inviter removes its invitations and pending invitation mail. Hosted foreign-key readback confirmed both cleanup behaviours. Proof: `artifacts/westmere-queanbeyan-radius-released.png`.

## Production release and Studio refinements — 19 November 2026

The complete connected release is now live at **https://westmere-careers.vercel.app**. Vercel production deployment `dpl_81zna8skYd2Yz3NSQHXhhJnucdXs` uses runtime commit `18dfaaaf5b0ed7fb887d2366b99c4bf045ef20ef`; its 206-file runtime source was verified byte-for-byte against the workspace. This includes all earlier homepage loading, saved chat/100-request allowance, business teams, applicant review and cross-state distance-search work. The production alias was read back against the expected deployment ID. Stripe retains its existing test billing mode; production publishing does not activate real payments.

Discovery dropdowns and refresh action all measure 46px in the live browser. Indian Ocean Territories render only for WA, including after live insight loading completes; All regions omits them. Tasmania retains its outline with a modest scale/placement adjustment and corresponding zoom bounds. Verification has three horizontal steps with an approved check, a darker rejected X and the existing reviewer feedback.

Jobs show one pagination navigation, labelled `Job result pages · bottom`. Business users receive a personal-account guidance notice in place of application controls, including external listings. Migration `20261119015333_prevent_business_job_applications.sql` adds an insert trigger so the restriction also applies to direct Data API submissions; the API independently returns the same boundary. Existing applications remain readable according to their prior permissions.

Studio places Westmere Assistant directly beneath the single-sentence introduction; the extra listed-role dropdown is removed while explicit role links can still prefill the Assistant. New chat and opening saved chats preserve the sidebar state. Up to ten current document attachments appear beneath Upload document, can be removed independently and restore with saved chats. Extracted context remains bounded to 24,000 characters. Uploading does not append a user turn or assistant reply; text and/or documents can enable Send. Review generation has an explicit pending-score status, and completed statistics fade in with reduced-motion support.

Role Strength appears below the Assistant. It uses the same requirements/skills helper and literal evidence percentage as the employer comparison, with CV and optional cover-letter selection, shared occupation autocomplete, current-vacancy suggestions and the top ten matches after inspecting all matching inventory pages. It is private to personal Careers+ accounts, makes no OpenAI request, uses no AI credit and does not apply or notify an employer. Sources, eligible/excluded criteria and the measure’s limits are visible. Original submitted application materials may differ from a later preview.

Production configuration was verified: existing service credentials were scoped to Production without exposing values; public client settings were copied; the canonical app origin is the live domain. Supabase default Site URL is production and both exact production and existing review callbacks are allowed. Newly queued mail uses the production origin. Existing review deployments retain their captured runtime environment; fresh review builds require separate credential configuration. Deployment protection remains intact for unique deployment URLs/previews.

Validation: 291 tests across 44 files passed; a final focused set of 23 tests and the final production build passed, including all four traced PDF workers. Database tests cover both business-account and team-member application rejection while personal applications remain permitted. Role Strength tests include a best match on a second inventory page and exclusions of sensitive criteria. Synthetic browser checks confirmed multi-upload with zero assistant requests before Send, attachment-only submission, pending-score feedback, saved attachment restoration, persistent sidebar and score fades. Studio/Role Strength and verification fitted a 390px viewport. Microsoft SSO completed to the live `/account` and loaded the real business workspace. Live browser checks confirmed Discovery dimensions/region visibility, bottom-only pagination and the actual personal-account guidance modal. No real AI request or candidate notification was generated during these UI checks.

Proof: `artifacts/westmere-discovery-live-20261119.png`.

The final production screenshot check also identified and removed an inherited 8px bottom margin on Discovery field labels. Dropdowns and the refresh action retain their shared 46px height and now align at the bottom edge. This CSS-only correction was rebuilt and deployed in the final runtime above.
