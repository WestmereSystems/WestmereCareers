# Westmere Careers

**Your career starts with Westmere.**

A warm, optimistic Australian careers marketplace built with Next.js, TypeScript, Supabase, Stripe and OpenAI. This repository contains the initial development release, not a public-ready employment service.

[Open the hosted development preview](https://westmere-careers.vercel.app). It uses fictional vacancies; live accounts, applications, billing and AI are not enabled. See [deployment status](docs/deployment.md) for the deployed version and remaining setup.

## Run locally

Use Node.js 24 LTS. The package and Vercel runtime are pinned to the 24.x release line.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. With Supabase unset, browsing uses clearly marked fictional fixtures. Sign-in, live application submission, payments and paid AI fail closed until configured; a static Studio example is labelled as a demonstration. There is no client-side Premium bypass.

```sh
npm run typecheck
npm test
npm run build
npm start
```

## Included in this milestone

- Responsive homepage with original CC0 illustration and locally hosted OFL variable fonts.
- Cream/sage light appearance by default, automatic system dark appearance, explicit Auto/Light/Dark selection without an appearance flash.
- Keyboard-accessible job-title/location suggestions, combinable filters, sort controls, job details and employer profiles.
- Development sample inventory clearly distinguished from live data; errors in a configured live database do not silently fall back to fictional vacancies.
- Device-local saved-role IDs; CV text is never persisted to browser storage.
- Supabase email-link sign-in, private profile/CV text, direct applications with immutable snapshots, application history and withdrawal.
- Organisation-scoped job publishing and intentional application opens, with candidate-facing activity events.
- Careers+ server entitlement checks; named-skill overlap filter; OpenAI CV improvement and role-specific tailoring with explicit consent, goals and editable text exports.
- Stripe Checkout, Customer Portal, verified webhooks, a fixed AUD25 monthly inclusive-price check and atomic AI usage accounting.
- SQL row-level security, database execution tests, route/security tests, CI and Vercel compute colocated with the selected Tokyo database.

Premium features are implemented but require your dedicated Supabase project and service credentials before they can run against live accounts. The initial Studio allowance is **30 requests per billing period**. Interview rehearsal, richer document imports/exports and remaining proposal features are later milestones; they are not advertised as available in this release.

## Service setup

1. Connect the dedicated **WestmereCareers** Supabase project authorised for this app: Tokyo, inside the OrderWard organisation. Never use the separate OrderWard DB or restore-drill databases. Follow [backend setup](docs/backend.md) and the [staging setup record](docs/staging-setup.md).
2. Add the Supabase URL and publishable key, and keep the service-role key server-only. Never put a secret key in a `NEXT_PUBLIC_` variable.
3. In Stripe test mode, create a price of **AUD 25.00 monthly**, tax-inclusive if applicable, configure Checkout/Portal and route signed events to `/api/billing/webhook`. Follow [premium setup](docs/premium.md).
4. Configure an OpenAI project API key and model. CV processing requires explicit consent and a verified active Careers+ subscription. No ChatGPT subscription credential is assumed to include API access.
5. The dedicated Vercel project is connected to this repository. `vercel.json` sets Tokyo compute, matching the selected database. Use the exact deployment origin, keep indexing disabled, and scope staging credentials to Preview branch `codex/staging`.
6. Complete the [release checklist](docs/release-status.md) before accepting real applications, payments or public employer response reports.

Never paste credentials into GitHub issues, source files or screenshots. This repository is public; only synthetic fixtures, sample CVs and non-secret setup names belong in it.

## Architecture and source

`src/app` contains server-rendered routes and server APIs. `src/components` contains the interactive interface. `src/lib/jobs-server.ts` reads public listing projections; `src/lib/server` checks authenticated access. `src/lib/premium` owns billing and OpenAI contracts. The database migration includes explicit grants and RLS; application and subscription state must never be trusted from the browser.

Files in `proposal/` preserve the approved design proposal. The implementation status and remaining milestones are tracked separately; the proposal is not a claim that every planned feature has shipped.

## Asset rights

The original SVG illustrations in `public/illustrations` are dedicated under CC0-1.0. Fonts are self-hosted under their included SIL Open Font Licences; Lucide icons use their included permissive licences. See [asset provenance](docs/asset-licences.md). Application code remains copyright Westmere Systems; the CC0 dedication applies to the specified illustrations only.
