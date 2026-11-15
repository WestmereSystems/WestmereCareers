# Candidate and employer workflows

This release extends the connected review environment. The public development preview still uses fictional inventory and has no connected account, payment or AI secrets.

## Candidate experience

- Private PDF and Word (.docx) CV uploads, extracted-text review, a history of up to 20 files, authorised downloads, deletion and base-CV selection. Files are limited to 4 MB; older .doc files must be saved as .docx and scanned PDFs need text recognition. Parsing is bounded; the product does not claim antivirus certification.
- The saved base CV can be loaded into applications, Careers+ Application Studio and skill-overlap filtering. Uploading or selecting a file never sends it to OpenAI. AI assistance retains its separate consent and paid-entitlement checks.
- Email-code entry, a required name during account completion, a named greeting and confirmed account-email changes. Google and Microsoft OAuth paths use PKCE and identity/email scopes; provider buttons enable only after the corresponding private provider configuration is available.
- Signed-in saved jobs are stored in the account rather than a shared device list. Public browsing stays available without signing in.
- A private notification inbox and optional application-activity email updates. Receipt, first intentional opening, interview/shortlist/offer/decision updates and vacancy closure are recorded separately. Vacancy closure does not imply rejection.

## Hiring experience

- Employer profile and banner images are re-encoded, resized and stripped of metadata. A general careers email is optional; per-listing contact email is revealed by click. Both are public when supplied.
- Listing descriptions support headings, bold text and bullet points through a small text format; arbitrary HTML, embedded images and executable links are never interpreted.
- Up to five PDF/Word supporting documents per listing. Document changes atomically return the listing to review. Reviewers can download the supporting material before approval.
- Employer site notifications group new applications by vacancy. No email is sent for each new applicant.
- The invited sample hiring workspace uses separate synthetic jobs/applications. It cannot publish to the genuine job board or grant verified-business authority. It includes deliberate site/email notification previews to the invited account only, with a three-email-per-day limit.

## Communications and information

Authentication, welcome, account updates and job-alert templates include the Westmere logo, privacy and support links. New-account welcome messages are queued once after name completion. Job-alert preferences remain separate from service updates. Delivery uses the existing durable Resend outbox, signed webhook processing, retry limits and suppression handling.

The About page explains the service's purpose. Two verified CC0 photographs and public-domain Australian geography complement the original illustrations; exact sources are recorded in [asset licences](asset-licences.md).

The privacy page adapts the supplied policy to these implemented data flows. Provider-country detail and operational privacy/retention procedures still require ongoing owner and professional review; publishing the page does not certify legal compliance.

## Verification and limits

Automated checks cover document parsing, code authentication, private history, saved-role ownership, first-view events, notification preferences, welcome idempotency, sample access, sample email limits, upload leases and document-review invalidation. Production builds and the email-worker type check are also required.

Real provider OAuth sign-ins require owner-entered credentials and an interactive account test. End-to-end mailbox tests and real-candidate/employer pilot testing remain distinct from isolated automated tests. Uploaded originals are offered as attachments, never embedded as executable page content; a broader independent security and malware-processing review remains part of public-launch preparation.
