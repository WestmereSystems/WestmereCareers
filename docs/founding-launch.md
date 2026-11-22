# Westmere founding launch

The temporary public website lives in `src/app/launch`, served at `/launch`. The full marketplace remains in its original routes. While the database marketplace switch is closed, the homepage, employer marketing, sign-in, preview, account, Careers+, jobs and directory entry points redirect to the launch experience. Account query parameters survive the redirects. Shared account components, APIs, authentication callbacks and data remain in place; no accounts or listings need copying at public launch.

## Registration and onboarding

1. Employers and agencies use `/launch/register` (agency shortcut: `?kind=agency`). They verify their email, accept the current business Terms and create their normal business account. There is no consultation form, access-request approval, named-founder promise or artificial 60-day registration expiry.
2. They sign in and submit the existing verification form in Account → Verification. Identity, authority, business capacity, client permissions and agency pilot restrictions retain the usual independent checks. Email verification is not business verification.
3. Once verified, they can prepare their profile and vacancies privately. The founding phase provides Starter preparation coverage for the account’s employer/agency type without creating a paid subscription, card or Careers+ entitlement. Existing paid and testing coverage keeps priority. This founding preparation coverage ends when the public marketplace opens; normal plan and free allowances then apply.
4. Optional employer/agency subscription choices are visible directly on `/launch#plans`, at `/launch/plans` and Account → Billing. Checkout still requires verified business ownership and current Terms. Production business billing uses a separate live Stripe account, price catalogue, portal configurations and signed webhook endpoint. The protected owner identity retains its existing sandbox subscriptions. Missing live configuration fails closed, with a payments-being-prepared notice. Careers+ public checkout remains held until launch.
5. Account → Launch preparation shows a default-on job-publication preference for each business. Owners can turn it off for all current/future vacancies and can keep an individual vacancy private. Prior explicit job opt-outs remain in place. Business-profile permission is separate. Content or attachment edits clear Westmere’s release and require review/release of the updated version; they do not reset an opt-out. No preference, verification, moderation approval or subscription publishes anything during founding onboarding.

## Publication and launch

All business profiles and vacancies are private while `private.launch_settings.marketplace_open` is false, including records with an earlier individual release. Anonymous profile, job, category, document and image reads inherit this restriction. Owners, authorised team members and staff retain their normal private access. No public applications can be submitted to staged vacancies. The separate public product preview uses clearly labelled fictional content.

1. Review businesses in the usual verification queue and vacancies in Admin → Listings, including reviewed items. Owners can record publication permission ahead of launch.
2. Account → Admin → Registration and public release provides the administrator’s public-marketplace switch. Public release buttons are disabled while founding mode is active; the database also rejects a direct release call. Record a reason when changing the switch. Finish payment and indexing readiness separately before opening them.
3. Open the public marketplace when ready. Main routes resume their full marketplace pages; old `/launch` links redirect to the corresponding main pages. No redeployment or data migration is needed for this route transition.
4. Explicitly release a genuine verified profile with owner permission, then its reviewed current vacancy with job-publication permission enabled. The job preference is on by default unless the business or vacancy has opted out. Publication is separate from opening the marketplace. A vacancy’s fresh 30-day publication clock starts only on release, retaining quotas, compliance and agency checks. Opening alone exposes no unreleased content. Turning business publication off clears prior job releases; turning it back on requires fresh Westmere release and preserves individual vacancy opt-outs.
5. Make content private from these controls or withdraw owner permission. Returning the global switch to founding mode hides all public inventory immediately. Applications and audit records are preserved.

## Launch updates and earlier requests

Candidate launch-update opt-ins remain at `/launch#candidate-updates`: email only, specific permission, no account, CV, subscription or ongoing newsletter. Same-origin checks, strict bounded validation, a honeypot and six-per-hour keyed-network pacing remain in place. Raw network addresses are not stored. The form promises launch updates, not personal contact or a consultation.

The previous employer/agency access-request endpoint now directs callers to registration without saving another request. Earlier private requests remain in the admin queue for reference; approval of one is no longer required to register. Existing explicit account restrictions still apply. No invitation campaign is sent automatically.

## Verification

Dedicated API and real-migration database tests cover verified self-registration for both business types, normal verification submission, no automatic subscription, restricted identities, optional business checkout, anonymous privacy before launch, blocked premature release, explicit post-launch release, withdrawal, return to founding mode and retained quota/agency guards. The release record lists the actual hosted migration/deployment and live verification evidence.

## Careers+ browsing and free Assistant access · 22 November 2026

The founding Careers+ page now renders the shared production marketing component. On entry it explains that Careers+ opens at launch, as a separate applicant subscription or through the Enterprise business/agency billing owner. The free Assistant keeps its existing account-scoped allowance. Every verified signed-in account, including employer and agency accounts and invited team members, uses its own existing three-request free ledger when it has no paid Careers+ entitlement. Previous completed requests count towards those three; reopening, signing out or changing business type does not reset the balance. Only completed answers use a credit, and existing Stop/failure handling remains. Temporary document extraction is available for those requests. Paid Studio endpoints, saved-chat writes, Role Strength, Strong Matches and Enterprise billing-owner boundaries remain separately protected. Signed-in founding participants can open the Assistant from the launch Careers+ page.

The public launch homepage uses the same `HomeHero` component and dotted background rules as the main website, keeping the cafe image. The founding registration actions replace the public job-search controls below the shared hero. All six employer/agency plan comparisons are rendered on the homepage before registration; Prices are described as optional monthly plans. Sandbox notices appear only on the protected administrator’s billing account.


## Administrator launch desk · 22 November 2026

Account → Admin includes a paginated registration list (25 per page), account restriction/restoration and a separately deduplicated launch mailing list. Verified accounts and homepage update opt-ins appear on the list; removing an address persists a suppression and cancels its queued launch email. Enabled staff and the acting administrator cannot be restricted through this control. Restrictions are checked at sign-in, account APIs and the named private-account table policies; existing employer mutation guards remain in force. Restriction does not cancel a paid Stripe subscription.

The launch desk previews the one-time national announcement. Its explicit launch-and-email action opens the marketplace and queues one announcement per eligible address, excluding removed, restricted and delivery-suppressed addresses. Retrying the action cannot create another campaign. Delivery status is shown separately from queuing. An email preference link lets recipients withdraw before sending. Profiles and vacancies still require separate owner consent and staff release. No announcement is sent merely by deploying these controls.

Personal accounts, including Careers+ subscribers, can convert after a recent sign-in and explicit acknowledgement in a confirmation dialog. Personal renewal is stopped first, then the database commits the business account and revokes personal paid/testing access. The dialog states that the change cannot be reversed to a standard applicant account and future Careers+ access requires Enterprise or higher. Private candidate records and administrator permissions are retained.

The canonical production origin is https://westmere.com.au. Both www and the old public Vercel hostname redirect page requests to it with path/query preservation. Billing callbacks, account mail, alerts, launch mail and authentication template links use the canonical origin. The authentication service continues to use auth.westmere.com.au.


### Verified production billing activation

The 22 November production release activates the six live employer/agency prices without GST collection. The protected owner retains sandbox billing. The runtime key was approved, verified inside Vercel and saved only as a Production Secret. Checkout, invoice previews and all three portal configurations were checked without payment; the runtime verification sessions were expired and its empty customer was removed. The marketplace remains closed and no announcement was sent. See `docs/national-launch-release-20261122.txt` for deployment and verification evidence.


### Applicant registration remains closed during founding onboarding

The general profile sign-in dialog shows a launch notice and launch-update opt-in, with a separate business/approved-account sign-in link. General email sign-in cannot create a new account before public launch. Employer/agency registration receives a server-owned email admission lasting 15 minutes, with keyed-network pacing and normal email/provider verification. Google/Microsoft onboarding requires the same business email entered on the form. The Supabase Before User Created hook rejects direct email/password/OAuth signup without a valid business admission or an approved invitation/test identity. User-editable metadata cannot authorise registration. Enabled staff, pre-founding accounts, existing businesses and authorised team members retain access, subject to account restrictions. Opening the marketplace restores ordinary applicant registration automatically.


### Provider-selected business email

Google and Microsoft business sign-in no longer require typing an email, trading name or Terms acceptance before account selection. The provider supplies the verified account email; business details and Terms remain mandatory when completing onboarding after return. A short-lived, signed HttpOnly cookie records the requested business/provider flow. The callback exchanges the PKCE code (including an SDK flow identifier when supplied), verifies the returned email/provider identity, and only then prepares business admission. Typed email and unsigned intent cookies cannot authorise admission.

Supabase may create a pending Google/Microsoft authentication identity to verify its email. That identity receives no Westmere applicant or business access until the signed business callback admits it. Direct applicant email/password signup remains blocked; provider identities without business admission are denied by the existing session/database access gate. Existing staff/admin and verified business access remain unchanged.
