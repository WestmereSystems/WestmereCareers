# Hosted staging verification

Verified 15 November 2026 against protected staging. This is a development checkpoint, not approval for real applications or live billing.

## Completed journeys

| Journey                  | Observed result                                                                                                                                                                                                        | Scope                                                                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Resend authentication    | Fresh email delivered from `hello@westmere.com.au`; opening its token-hash link established a persistent Chrome session.                                                                                               | The first iCloud message reached Junk. Inbox placement remains under review.                                                                 |
| Careers+ Checkout        | The authenticated app created/reused a Stripe Sandbox session; its AUD2,500 monthly payment completed with Stripe's synthetic test card.                                                                               | No real card or live charge.                                                                                                                 |
| Webhooks and entitlement | Checkout completion, subscription creation, invoice payment and subscription update reached the protected endpoint and completed. The exact Careers+ price granted access for the current paid period.                 | One initially unsuccessful concurrent event recovered through Stripe's retry; no provider events remained unprocessed.                       |
| Customer Portal          | The app opened the correct test customer's subscription, invoice history and cancellation controls. Cancellation was confirmed for 15 December 2026.                                                                   | Test access remains active through the paid period. Expiry/revocation at that future date has not yet been exercised.                        |
| General CV improvement   | One real OpenAI request returned a validated, editable CV and specific improvements. Dates, qualification and fictional labels were retained; no metrics or contact details were invented.                             | One synthetic CV, not a representative quality evaluation.                                                                                   |
| Role-specific tailoring  | A second real OpenAI request produced an editable CV, cover letter, evidenced skills and missing-evidence list. Instructions inside the job description to invent SQL, payroll and management experience were ignored. | One adversarial example, not a guarantee against every prompt injection.                                                                     |
| Usage settlement         | Both AI requests were recorded as completed: one `improve`, one `tailor`.                                                                                                                                              | Two of the 30 shared monthly requests used; actual failure/refusal refunds and concurrency limits remain to test.                            |
| Strong CV filter         | The entitled browser applied CV skill sorting and the strong-only filter, then removed it and cleared the temporary text. AI usage remained at two requests.                                                           | The vacancy database is empty: zero matching roles is expected. Ranking quality and scale remain unverified.                                 |
| Private profile          | A synthetic name/CV saved through the authenticated form and persisted after reload. Both fields were then cleared and saved.                                                                                          | Database checks confirmed no remaining stored profile name or CV text. Multi-account isolation still requires a separate hosted test matrix. |

The standalone Checkout return in the signed-out in-app browser did not grant access; the signed-in Chrome account obtained access only after provider reconciliation. No fictional vacancy or real application was added to the database.

## Cancellation representation

For this test, Stripe expressed the scheduled cancellation as `cancel_at` equal to the paid-through date while its `cancel_at_period_end` boolean remained false. The portal displayed the cancellation date correctly. The local field mirrors Stripe's boolean; it must not be used alone to conclude that no cancellation is scheduled. Showing the scheduled date within the app and exercising final expiry are remaining billing checks.

## Verification limits

The runtime's existing 91 automated tests and TypeScript/build checks passed before these provider journeys. These hosted checks used the deployed application, its configured private service keys, the real Stripe test endpoint and actual OpenAI responses. Mocked tests alone are not evidence of provider delivery.

Further gates include declined/authenticated payments, renewals, re-subscription, controlled duplicate/out-of-order delivery, refunds/disputes/fraud events, quota exhaustion and failure restoration, broader CV evaluations, signed-in data isolation, employer application activity, realistic search volume, monitoring and restore drills. Confirm GST treatment and any Stripe Tax registrations before live charging. See the complete [release status](release-status.md).

Checkout/portal bearer URLs, signing credentials, private account identifiers and the owner's recipient email are intentionally excluded from this record. Synthetic CV contents were never used as real application data.
