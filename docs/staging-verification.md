# Development verification

The current application passes TypeScript checks, 103 automated tests across 14 files, Deno checking for the email worker, and the production build. GitHub application checks have passed on both development branches.

## Product workflows checked

- Independent business and listing review, rejection of self-review and stale decisions, employer suspension/reinstatement, and the choice to keep an edited listing as a private draft.
- Candidate-report aggregation with unique contributors, mature application cohorts, small-sample suppression, fresh silence confirmations and late-response corrections.
- Private saved-search consent and account isolation, job deduplication, immutable email requests, bounded retries, webhook event ordering and complaint suppression.
- One explicitly approved preview email: provider acceptance, signed delivery confirmation and a delivered state in the website. Receiving-server delivery does not establish inbox placement or reading.
- Unsubscribe: opening the confirmation page left preferences enabled; submitting unsubscribe paused alerts, cleared consent and the next schedule, and left no queued delivery. The disposable test search and its application-side delivery records were removed.
- Larger typography, cream light and system dark appearance, a 390px phone layout without horizontal overflow, filtering and saved-search navigation, and the Careers+ globe/ribbon artwork with pause/play controls.

Public inventory is explicitly labelled as fictional development content. It is not imported as genuine vacancies or candidate experiences.

## Further launch validation

Run a founding-employer pilot with genuine reviewed listings and consented candidates. Extend testing to real job digests, broader mailbox placement, realistic search volume and complete candidate/employer application journeys. Finish independent accessibility, load and security reviews, subscription lifecycle coverage, account export/deletion and document handling before a paid public launch.

See [release status](release-status.md) for the remaining work and [trust and alerts](trust-and-alerts.md) for the product behaviour.
