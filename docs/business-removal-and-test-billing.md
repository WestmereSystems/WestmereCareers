# Business removal notices and designated billing testers

Removing a company or agency records a durable in-app notification for its
current team and enabled administrators. The notice identifies the business,
the removal time in Melbourne and the effect on public visibility and hiring
access. The existing moderation audit retains the acting account. Notices
remain available in notification history after the business becomes hidden.
The profile refreshes the notification menu immediately after removal.

The notice is created in the same database transaction as removal. No email
is queued. Exact-name confirmation, ownership checks and the requirement to
end an active business subscription remain. Repeating a completed removal
preserves its original time and does not create duplicate audit or notice
records. A failed removal creates no removal notice.

Stripe test billing remains separate from live payments. In addition to the
protected original administrator, an operator can designate a verified
dedicated test account through the privileged Supabase Auth app_metadata
boolean `westmere_billing_test`. Database entitlement checks also require
the account's private test-email allowlist entry. Profile/user_metadata,
request payloads and browser settings cannot grant this access. Designation
does not grant a staff role, sample-workspace access, business verification,
publication or general manual test-tier assignment permissions.

The designation must be made through an authorised operational change, never
a public account setting. Audit it in the restricted testing ledger. Check
for live subscriptions before changing billing mode. Revoke both the flag
and the allowlist entry when a dedicated account leaves testing, and resolve
its existing test customers/subscriptions through the established transition
process before using live billing. Do not delete its historical invoices.

Regression coverage checks employer and agency removal, correct recipients,
absence of outbound mail, retry safety, failed-removal isolation, sandbox
entitlement acceptance and rejection of unverified/unapproved designations.
Public fixture quarantine and existing ordinary-account billing tests remain.
