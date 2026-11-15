# Resend email delivery and sign-in

Resend is the selected provider for authentication and future transactional notifications. Authentication uses **Supabase Auth with Resend SMTP**; the browser never receives a Resend key. A separate application email worker/outbox remains a later feature.

The approved outgoing identity is **Westmere Careers <hello@westmere.com.au>** for welcome/authentication emails and future application updates. On 15 November 2026, Resend's dashboard confirmed `westmere.com.au` as verified and ready to send from Tokyo (`ap-northeast-1`). The dedicated sending key must be restricted to this domain.

## Authentication link format

Both the signup-confirmation and magic-link templates use the checked-in `supabase/templates/sign-in.html`:

```html
{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&amp;type=email
```

The callback verifies this email hash with Supabase and stores the session through the request-scoped SSR cookie client. This works when the email opens in a different browser, without the original PKCE verifier cookie. Existing PKCE links remain supported. Expired/used links reopen sign-in with a clear retry message. Authentication callbacks are never cached, never log token values and send a no-referrer policy.

Both hosted **Confirm sign up** and **Magic link or OTP** templates were saved and verified after deploying the callback code. Local `config.toml` template settings do not automatically change hosted Auth settings; keep both hosted copies aligned with this HTML and the checked-in subjects.

## Resend SMTP settings

In the dedicated WestmereCareers Supabase project, open Authentication → Emails → SMTP Settings:

| Setting      | Value                                                             |
| ------------ | ----------------------------------------------------------------- |
| Host         | `smtp.resend.com`                                                 |
| Port         | `465`                                                             |
| Username     | `resend`                                                          |
| Password     | A dedicated Resend sending API key, entered privately in Supabase |
| Sender name  | `Westmere Careers`                                                |
| Sender email | `hello@westmere.com.au`                                           |

Use a key limited to sending from the chosen domain. Keep sign-in email link tracking disabled, because authentication URLs contain one-time credentials. Do not use another product's API key or change shared domain settings without confirming the intended scope. The official [Resend Supabase SMTP guide](https://resend.com/docs/send-with-supabase-smtp) requires an API key and verified sender domain.

Confirm the domain's verification and delivery status in Resend, enable SMTP, and verify a newly requested sign-in email reaches the owner through Resend. Then verify session creation, account identity, logout and used-link recovery. No provider switch is considered complete merely because a key exists or a local template has changed.

## Current verification

The callback's token-hash, legacy-link, safe-return and failed-verification cases are covered by automated tests. Supabase accepted and confirmed the initial owner's email, but the original callback did not establish a session; the email callback has been updated to remove the original-browser dependency for the new templates. All 91 tests and both GitHub CI branches passed for that update. Invalid-link recovery was also verified in the hosted browser.

The owner saved the dedicated sending key privately in Supabase on 15 November 2026. After reloading the hosted settings, custom SMTP remained enabled with the approved sender, Resend host/port and stored password. The owner then requested a fresh sign-in email: Resend recorded delivery, and the token-hash callback established a persistent session in Chrome. Supabase confirmed one active session; the signed-in Careers+ page exposed account and billing controls. The current application uses passwordless email-link authentication; a separate password-reset interface is not needed for this flow. Future application emails, alerts and optional updates still require the planned outbox and notification preferences.

## Inbox placement

The first iCloud message reached Junk, although delivery and sign-in succeeded. Public DNS checks on 15 November confirmed the Resend DKIM TXT record, the `rsend` and `send` CNAME records shown as verified in Resend, and a published `v=DMARC1; p=none;` policy. The existing Microsoft 365 root SPF and MX records remain intact. These checks establish record availability, not the recipient's per-message authentication verdict.

No missing DNS record was identified. [Apple's postmaster guidance](https://support.apple.com/en-au/102322) explains that iCloud also uses domain/IP reputation, content and recipient feedback. The domain's new sending history may contribute, but the exact reason is unconfirmed without the received message's authentication headers. Mark legitimate test mail Not Junk, keep authentication link tracking disabled, and monitor delivery/bounce/complaint results. Do not replace the existing SPF or tighten domain-wide DMARC blindly; those changes can affect other Westmere mail services. Broader mailbox-provider testing remains a launch check.
