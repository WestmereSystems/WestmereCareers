# Development verification

The current application passes TypeScript checks, 131 automated tests across 17 files, Deno checking for the email worker, and the production build. GitHub application checks have passed on both development branches using Node 24. Each build also checks the compiled PDF reader using only the files included in each upload route's deployment trace.

## Product workflows checked

- Independent business and listing review, rejection of self-review and stale decisions, employer suspension/reinstatement, and the choice to keep an edited listing as a private draft.
- Candidate-report aggregation with unique contributors, mature application cohorts, small-sample suppression, fresh silence confirmations and late-response corrections.
- Private saved-search consent and account isolation, job deduplication, immutable email requests, bounded retries, webhook event ordering and complaint suppression.
- One explicitly approved preview email: provider acceptance, signed delivery confirmation and a delivered state in the website. Receiving-server delivery does not establish inbox placement or reading.
- Unsubscribe: opening the confirmation page left preferences enabled; submitting unsubscribe paused alerts, cleared consent and the next schedule, and left no queued delivery. The disposable test search and its application-side delivery records were removed.
- Larger typography, cream light and system dark appearance, a 390px phone layout without horizontal overflow, filtering and saved-search navigation, and the Careers+ globe/ribbon artwork with pause/play controls.
- A real Google sign-in returned to the profile with the named greeting and invited sample workspace available. Google and Microsoft are enabled; the interactive Microsoft sign-in remains to be checked with an owner's Microsoft account.
- Live synthetic PDF and Word uploads, history, base-CV selection and attachment downloads. Both downloaded files matched their original SHA-256 digests. The approved test files, history entries and synthetic base text were then removed; the profile name remained intact.
- A private sample role, synthetic application, first-view and interview stages, and a deliberately requested site-only interview notification. The sample was not published to the genuine job board and no sample preview email was requested.
- One new-account welcome was recorded as delivered through Resend. Secure email changes require confirmation in both the current and proposed inboxes. Email-code and email-change templates contain codes, the Westmere wordmark and useful links; actual mailbox/code-entry and email-change journeys still require interactive owner checks.
- The About page, two self-hosted CC0 photographs, public-domain Australia icon and adapted privacy policy. The published privacy and email support contact is hello@westmere.com.au.

Public inventory is explicitly labelled as fictional development content. It is not imported as genuine vacancies or candidate experiences.

## Further launch validation

Run a founding-employer pilot with genuine reviewed listings and consented candidates. Extend testing to real job digests, broader mailbox placement, realistic search volume and complete candidate/employer application journeys. Finish independent accessibility, load and security reviews, subscription lifecycle coverage, account export/deletion and document handling before a paid public launch.

See [release status](release-status.md) for the remaining work and [trust and alerts](trust-and-alerts.md) for the product behaviour.
