import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
let db: PGlite;
const owner = "91000000-0000-4000-8000-000000000001",
  member = "91000000-0000-4000-8000-000000000002",
  other = "91000000-0000-4000-8000-000000000003",
  org = "92000000-0000-4000-8000-000000000001";
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz not null default clock_timestamp(),raw_app_meta_data jsonb default '{}',raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated,service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
  );
  const dir = new URL("../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(dir))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(await readFile(new URL(file, dir), "utf8"));
  for (const [id, email] of [
    [owner, "owner@example.test"],
    [member, "member@example.test"],
    [other, "other@example.test"],
  ])
    await db.query<Record<string, unknown>>(
      "insert into auth.users(id,email,email_confirmed_at) values($1,$2,clock_timestamp())",
      [id, email],
    );
}, 30000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(
    "begin;update private.launch_settings set marketplace_open=true",
  );
});
afterEach(async () => {
  await db.exec("rollback;reset role");
});
async function account(user = owner, kind = "employer") {
  await db.query<Record<string, unknown>>(
    "insert into public.business_accounts(user_id,kind,trading_name,terms_version,terms_sha256) values($1,$2,'Synthetic employer','fixture',$3)",
    [user, kind, "a".repeat(64)],
  );
  return (
    await db.query<{ id: string }>(
      "select id from public.ads_employers where owner_user_id=$1",
      [user],
    )
  ).rows[0]?.id;
}
async function billingMappings() {
  await db.exec(
    "insert into public.organisations(id,name,slug,is_verified) select id,'Synthetic billing company','ads-'||id::text,true from public.ads_employers on conflict do nothing;insert into public.organisation_billing_accounts(organisation_id,billing_user_id,stripe_customer_id,audience,livemode) select id,owner_user_id,'cus_'||replace(id::text,'-',''),'employer',true from public.ads_employers where owner_user_id is not null on conflict do nothing",
  );
}
async function lease() {
  await billingMappings();
  return (
    await db.query<{ id: string; scan_token: string }>(
      "select * from public.ads_claim_employers(5)",
    )
  ).rows[0];
}
async function complete(
  claim: { id: string; scan_token: string },
  first: unknown,
) {
  return db.query<Record<string, unknown>>(
    "select public.ads_complete_history($1,$2,$3::jsonb)",
    [claim.id, claim.scan_token, JSON.stringify(first)],
  );
}
const first = (invoiceId = "in_first", valueMinor: number | null = 10000) => ({
  invoiceId,
  paidAt: new Date(Date.now() - 60000).toISOString(),
  valueMinor,
  issue: valueMinor === null ? "MISSING_RECORDED_TAX" : null,
});
describe("durable employer acquisition boundaries", () => {
  it("captures persisted employer registration once and ignores terms/name updates", async () => {
    const id = await account();
    await db.query<Record<string, unknown>>(
      "update public.business_accounts set trading_name='Updated synthetic employer' where user_id=$1",
      [owner],
    );
    const rows = await db.query<{
      kind: string;
      value_minor: number;
      transaction_id: string;
    }>(
      "select kind,value_minor,transaction_id from public.ads_conversion_events where employer_id=$1",
      [id],
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].kind).toBe("registration");
    expect(Number(rows.rows[0].value_minor)).toBe(0);
    expect(rows.rows[0].transaction_id.length).toBeLessThanOrEqual(64);
  });
  it("does not count agency, invited team or jobseeker accounts", async () => {
    await account(owner, "agency");
    await db.query<Record<string, unknown>>(
      "insert into public.organisations(id,name,slug,is_verified) values($1,'Synthetic company','ads-fixture',true)",
      [org],
    );
    await db.query<Record<string, unknown>>(
      "insert into public.organisation_members(organisation_id,user_id,role) values($1,$2,'recruiter')",
      [org, member],
    );
    await account(member);
    expect(
      (
        await db.query<Record<string, unknown>>(
          "select * from public.ads_employers",
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("does not turn an invited or transferred owner login into a new employer", async () => {
    await db.query(
      "insert into public.organisations(id,name,slug,is_verified) values($1,'Existing employer','ads-existing',true)",
      [org],
    );
    await db.query(
      "insert into public.organisation_members(organisation_id,user_id,role) values($1,$2,'owner')",
      [org, owner],
    );
    expect(await account()).toBeUndefined();
  });
  it("captures the original first invoice and reuses one transaction across replays", async () => {
    const id = await account();
    let claim = await lease();
    await complete(claim, first());
    const original = (
      await db.query<Record<string, unknown>>(
        "select * from public.ads_conversion_events where kind='purchase'",
      )
    ).rows[0];
    claim = await lease();
    await complete(claim, first());
    const again = (
      await db.query<Record<string, unknown>>(
        "select * from public.ads_conversion_events where kind='purchase'",
      )
    ).rows;
    expect(again).toHaveLength(1);
    expect(again[0].transaction_id).toBe(original.transaction_id);
    expect(again[0].employer_id).toBe(id);
  });
  it("serializes concurrent claims and fences a stale worker", async () => {
    await account();
    const claim = await lease();
    expect(
      (
        await db.query<Record<string, unknown>>(
          "select * from public.ads_claim_employers(5)",
        )
      ).rows,
    ).toHaveLength(0);
    await complete(claim, first());
    await db.exec("savepoint stale");
    await expect(complete(claim, first("in_renewal"))).rejects.toMatchObject({
      code: "40001",
    });
    await db.exec("rollback to savepoint stale;release savepoint stale");
    expect(
      (
        await db.query<Record<string, unknown>>(
          "select * from public.ads_conversion_events where kind='purchase'",
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("never makes a renewal eligible when the first value is missing or tracking was suppressed", async () => {
    await account();
    await complete(await lease(), first("in_original", null));
    await complete(await lease(), first("in_renewal", 20000));
    const event = (
      await db.query<Record<string, unknown>>(
        "select invoice_id,value_minor,review_code from public.ads_conversion_events where kind='purchase'",
      )
    ).rows[0];
    expect(event).toMatchObject({
      invoice_id: "in_original",
      value_minor: null,
      review_code: "FIRST_PAYMENT_CONFLICT",
    });
  });
  it("resolves held revenue only against the original invoice without a new ID", async () => {
    await account();
    await complete(await lease(), first("in_original", null));
    const id = (
      await db.query<Record<string, unknown>>(
        "select transaction_id from public.ads_conversion_events where kind='purchase'",
      )
    ).rows[0].transaction_id;
    await complete(await lease(), first("in_original", 10000));
    const event = (
      await db.query<Record<string, unknown>>(
        "select transaction_id,value_minor,status from public.ads_conversion_events where kind='purchase'",
      )
    ).rows[0];
    expect(event.transaction_id).toBe(id);
    expect(Number(event.value_minor)).toBe(10000);
    expect(event.status).toBe("queued");
  });
  it("does not reset eligibility after a refund or disabled delivery", async () => {
    const id = await account();
    await complete(await lease(), first());
    await db.query<Record<string, unknown>>(
      "update public.ads_conversion_events set status='suppressed',review_code='REFUND_REVIEW_REQUIRED' where kind='purchase'",
    );
    await complete(await lease(), first());
    expect(
      (
        await db.query<Record<string, unknown>>(
          "select first_invoice_id from public.ads_employers where id=$1",
          [id],
        )
      ).rows[0].first_invoice_id,
    ).toBe("in_first");
    expect(
      (
        await db.query<Record<string, unknown>>(
          "select * from public.ads_conversion_events where kind='purchase'",
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("does not let a measurement-storage error break registration, and recovers later", async () => {
    await db.exec(
      "alter table public.ads_conversion_events rename to ads_events_unavailable",
    );
    await account();
    expect(
      (
        await db.query<Record<string, unknown>>(
          "select * from public.business_accounts where user_id=$1",
          [owner],
        )
      ).rows,
    ).toHaveLength(1);
    await db.exec(
      "alter table public.ads_events_unavailable rename to ads_conversion_events;select public.ads_seed_employers()",
    );
    expect(
      (
        await db.query<Record<string, unknown>>(
          "select * from public.ads_conversion_events where kind='registration'",
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("binds attribution only to the trusted commercial owner, never a different account", async () => {
    await account();
    await account(other);
    const c = (
      await db.query<{ id: string }>(
        "insert into public.ads_contexts(measurement,ad_user_data,consent_version,granted_at,user_data_granted_at) values(true,true,'2026-11-26.1',clock_timestamp()-interval '1 hour',clock_timestamp()-interval '1 hour') returning id",
      )
    ).rows[0].id;
    await db.query<Record<string, unknown>>(
      "select public.ads_bind_context($1,$2)",
      [c, owner],
    );
    expect(
      (
        await db.query<Record<string, unknown>>(
          "select public.ads_bind_context($1,$2) id",
          [c, other],
        )
      ).rows[0].id,
    ).toBeNull();
    const event = (
      await db.query<Record<string, unknown>>(
        "select context_id from public.ads_conversion_events where kind='registration' and employer_id=(select id from public.ads_employers where owner_user_id=$1)",
        [owner],
      )
    ).rows[0];
    expect(event.context_id).toBe(c);
  });
  it("restricts measurement tables, receipts, matching data and worker RPCs to the server", async () => {
    await account();
    const objects = [
      "ads_employers",
      "ads_contexts",
      "ads_conversion_events",
      "ads_delivery_attempts",
      "ads_payment_reviews",
      "ads_customer_identities",
      "ads_business_identities",
      "ads_worker_lease",
    ];
    for (const role of ["anon", "authenticated"]) {
      for (const table of objects) {
        const result = await db.query<{ allowed: boolean }>(
          "select has_table_privilege($1,$2,'select') allowed",
          [role, `public.${table}`],
        );
        expect(result.rows[0].allowed).toBe(false);
      }
      expect(
        (
          await db.query<{ allowed: boolean }>(
            "select has_function_privilege($1,'public.ads_complete_history(uuid,uuid,jsonb,text)','execute') allowed",
            [role],
          )
        ).rows[0].allowed,
      ).toBe(false);
    }
  });
  it("allows the service role to recover registrations without granting Auth table access", async () => {
    await account();
    await billingMappings();
    await db.exec("set role service_role;select public.ads_seed_employers()");
    expect(
      (
        await db.query<Record<string, unknown>>(
          "select * from public.ads_claim_employers(5)",
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("purges expired matching data and payloads while retaining lifetime eligibility", async () => {
    await account();
    await complete(await lease(), first());
    await db.query(
      "insert into public.ads_contexts(consent_version,measurement,ad_user_data,identifiers,email_hash,expires_at) values('2026-11-26.1',true,true,'{\"gclid\":\"synthetic\"}',$1,clock_timestamp()-interval '1 day')",
      ["a".repeat(64)],
    );
    await db.query(
      "update public.ads_conversion_events set occurred_at=clock_timestamp()-interval '91 days',delivery_payload='{\"events\":[]}' where kind='purchase'",
    );
    await db.exec("set role service_role;select public.ads_purge_expired()");
    expect(
      (
        await db.query<Record<string, unknown>>(
          "select identifiers,email_hash,measurement from public.ads_contexts",
        )
      ).rows[0],
    ).toEqual({ identifiers: {}, email_hash: null, measurement: false });
    expect(
      (
        await db.query<Record<string, unknown>>(
          "select first_invoice_id from public.ads_employers",
        )
      ).rows[0].first_invoice_id,
    ).toBe("in_first");
    expect(
      (
        await db.query<Record<string, unknown>>(
          "select delivery_payload from public.ads_conversion_events where kind='purchase'",
        )
      ).rows[0].delivery_payload,
    ).toBeNull();
  });
  it("bounds anonymous context writes using a short-lived hashed network key", async () => {
    for (let n = 0; n < 60; n++)
      expect(
        (
          await db.query<{ allowed: boolean }>(
            "select public.ads_context_allowed($1) allowed",
            ["a".repeat(64)],
          )
        ).rows[0].allowed,
      ).toBe(true);
    expect(
      (
        await db.query<{ allowed: boolean }>(
          "select public.ads_context_allowed($1) allowed",
          ["a".repeat(64)],
        )
      ).rows[0].allowed,
    ).toBe(false);
  });
  it("leases dispatch independently of billing and releases only the matching token", async () => {
    const a = "93000000-0000-4000-8000-000000000001",
      b = "93000000-0000-4000-8000-000000000002";
    expect(
      (
        await db.query<Record<string, unknown>>(
          "select public.ads_worker_lock($1) ok",
          [a],
        )
      ).rows[0].ok,
    ).toBe(true);
    expect(
      (
        await db.query<Record<string, unknown>>(
          "select public.ads_worker_lock($1) ok",
          [b],
        )
      ).rows[0].ok,
    ).toBe(false);
    expect(
      (
        await db.query<Record<string, unknown>>(
          "select public.ads_worker_lock($1,true) ok",
          [b],
        )
      ).rows[0].ok,
    ).toBe(false);
    expect(
      (
        await db.query<Record<string, unknown>>(
          "select public.ads_worker_lock($1,true) ok",
          [a],
        )
      ).rows[0].ok,
    ).toBe(true);
  });
});
