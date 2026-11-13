# Resend email delivery and sign-in

Resend is the selected provider for authentication and future transactional notifications. Authentication uses **Supabase Auth with Resend SMTP**; the browser never receives a Resend key. A separate application email worker/outbox remains a later feature.

## Authentication link format

Both the signup-confirmation and magic-link templates use the checked-in `supabase/templates/sign-in.html`:

```html
{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&amp;type=email
```

The callback verifies this email hash with Supabase and stores the session through the request-scoped SSR cookie client. This works when the email opens in a different browser, without the original PKCE verifier cookie. Existing PKCE links remain supported. Expired/used links reopen sign-in with a clear retry message. Authentication callbacks are never cached, never log token values and send a no-referrer policy.

The hosted templates must be updated after deploying the callback code; local `config.toml` template settings do not automatically change hosted Auth settings. Use the same HTML for **Confirm sign up** and **Magic link or OTP**, with the appropriate checked-in subjects.

## Resend SMTP settings

In the dedicated WestmereCareers Supabase project, open Authentication → Emails → SMTP Settings:

| Setting      | Value                                                             |
| ------------ | ----------------------------------------------------------------- |
| Host         | `smtp.resend.com`                                                 |
| Port         | `465`                                                             |
| Username     | `resend`                                                          |
| Password     | A dedicated Resend sending API key, entered privately in Supabase |
| Sender name  | `Westmere Careers`                                                |
| Sender email | The owner's chosen address on a verified Resend domain            |

Use a key limited to sending from the chosen domain. Keep sign-in email link tracking disabled, because authentication URLs contain one-time credentials. Do not use another product's API key or change shared domain settings without confirming the intended scope. The official [Resend Supabase SMTP guide](https://resend.com/docs/send-with-supabase-smtp) requires an API key and verified sender domain.

Confirm the domain's verification and delivery status in Resend, enable SMTP, and verify a newly requested sign-in email reaches the owner through Resend. Then verify session creation, account identity, logout and used-link recovery. No provider switch is considered complete merely because a key exists or a local template has changed.

## Current verification

The callback's token-hash, legacy-link, safe-return and failed-verification cases are covered by automated tests. Supabase accepted and confirmed the initial owner's email, but the original callback did not establish a session; the email callback has been updated to remove the original-browser dependency for the new templates. Actual Resend delivery and a successful signed-in browser journey must still be verified after the account's domain, sender and SMTP credentials are configured.
