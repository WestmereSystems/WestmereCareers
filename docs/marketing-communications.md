# Marketing preferences and employer introductions

The canonical site is https://westmere.com.au. Sender: Westmere Careers <hello@westmere.com.au>; monitored reply address: hello@westmere.com.au. Invitations identify Westmere Systems, ABN 16 319 214 903, and are signed Louis only.

## Preferences, consent and suppression

Every delivery address has one private `marketing_contacts` record, including contacts without accounts. Account creation defaults the preference to enabled but does not invent consent evidence. A previous withdrawal always survives registration or an account email change to that address. Candidates, employers and agencies use Account → Settings → Marketing to save an explicit choice. Enabling it records affirmative marketing consent. Provider complaint/bounce blocks are not cleared by this choice.

`marketing_preference_events` retains the time, source and actor for substantive preference changes and recorded outreach evidence. Direct table access is denied to anonymous and ordinary authenticated roles. Public RPC wrappers use invoker security; private implementations verify the authenticated owner or enabled administrator, or require the service role. User-editable metadata is not an authority source.

Account → Admin → Unsubscribe register lists current withdrawals, searchable and paginated in groups of 25, with account type, time, source and reason. It refreshes every 15 seconds while visible and on window focus. Administrators may manually suppress any address and record the request. They cannot silently reinstate a recipient. A later affirmative account choice can restore the recipient's preference, while audit history remains.

## Email removal

The bottom email button opens `/marketing/unsubscribe?token=<opaque UUID>`. GET requests never change a preference. A plain HTML confirmation form POSTs to `/api/marketing/unsubscribe?token=...`, without sign-in, a reply, extra personal data or JavaScript. That endpoint also accepts RFC 8058 `List-Unsubscribe=One-Click` POSTs. The renderer provides both List-Unsubscribe headers and a plain-text alternative. Token pages are no-index, no-referrer and not cached; responses do not disclose the recipient address.

Confirmed withdrawals immediately update the register and cancel queued/leased `launch` and `marketing` messages. The worker checks eligibility again when freezing a delivery request. A message already handed to a provider cannot be recalled. Existing launch removal links synchronise into the global register. Essential account notices and separately requested saved-search alerts retain their existing controls.

## Preparing the three invitations

`public.prepare_marketing_contact` is service-only. It normalises the address, refuses suppressed contacts and records a basis and specific source evidence. It returns the unique removal path and does not enqueue or send mail. These official pages were checked on 22 November 2026:

- Y Victoria: https://victoria.ymca.org.au/suppliers — procurementenq.vic@ymca.org.au, prospective supplier expression of interest.
- Ausgrid: https://www.ausgrid.com.au/industry-partners/procurement-and-suppliers — purchasing@ausgrid.com.au, company information from prospective suppliers.
- Wiley: https://wiley.com.au/supply-chain/ — tenders@wiley.com.au, evaluation of potential suppliers' goods/services.

Record these as narrowly scoped inferred supplier-introduction consent, not an ongoing newsletter subscription. General marketing delivery requires recorded express consent. An outbox marketing snapshot must specify `purpose: supplier_introduction` or `purpose: marketing`; inferred evidence is accepted only for supplier introductions. Evidence must be reassessed for each new purpose and immediately before a send. A database label is not itself proof that a message is legally authorised.

Use `node scripts/generate-onboarding-emails.ts /private/path/to/recipient-paths.json` from the project root. The private input maps each recipient email to its returned unsubscribe path. It writes `deliverables/employer-invitations-20261122/index.html`, three self-contained HTML email previews, plain-text alternatives and optional provider payloads. It does not send anything. These recipient-specific files contain live removal capabilities: keep them private and never confirm their removal buttons as a test. A programmatic sender must retain the provider payload headers and use the guarded outbox, not bypass the suppression check.

The invitations explain the current founding phase: free registration, business verification, private profile/vacancy preparation and separate publication permission. Recheck this language when the marketplace opens. Do not claim a current vacancy, approved supplier status or an existing relationship.
