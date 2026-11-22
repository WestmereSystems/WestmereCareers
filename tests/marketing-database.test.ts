import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, beforeEach, afterEach, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";

let db: PGlite;
const admin = "91000000-0000-4000-8000-000000000001",
  user = "91000000-0000-4000-8000-000000000002",
  employer = "91000000-0000-4000-8000-000000000003",
  agency = "91000000-0000-4000-8000-000000000004";
async function as(id = "", role = "authenticated") {
  await db.exec(
    `reset role;select set_config('request.jwt.claim.sub','${id}',false);set role ${role};`,
  );
}
async function choice(enabled: boolean) {
  return (
    await db.query<{ r: { enabled: boolean; email: string } }>(
      "select public.save_marketing_preferences($1) r",
      [enabled],
    )
  ).rows[0].r;
}
async function prepare(email = "prospect@example.org") {
  return (
    await db.query<{ r: { unsubscribePath: string } }>(
      "select public.prepare_marketing_contact($1,'inferred','Official supplier invitation https://business.example.org/suppliers checked 22 November 2026') r",
      [email],
    )
  ).rows[0].r;
}
async function list() {
  return (
    await db.query<{ r: { rows: any[]; total: number } }>(
      "select public.admin_marketing_contacts() r",
    )
  ).rows[0].r;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz not null default clock_timestamp());create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated,service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
  );
  const directory = new URL("../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(directory))
    .filter((file) => file.endsWith(".sql"))
    .sort())
    await db.exec(await readFile(new URL(file, directory), "utf8"));
  await db.exec(
    `insert into auth.users(id,email,email_confirmed_at) values('${admin}','admin@example.org',now()),('${user}','candidate@example.org',now()),('${employer}','employer@example.org',now()),('${agency}','agency@example.org',now());insert into private.staff_members(user_id,role) values('${admin}','admin');insert into public.business_accounts(user_id,kind,trading_name,terms_version,terms_sha256,accepted_at) values('${employer}','employer','Employer','test',repeat('a',64),now()),('${agency}','agency','Agency','test',repeat('a',64),now());update auth.users set created_at=(select existing_before-interval '1 day' from private.launch_settings where singleton);insert into private.alert_settings(singleton,site_origin,unsubscribe_origin,sending_enabled) values(true,'https://westmere.com.au','https://westmere.com.au/api/alerts/unsubscribe',true);`,
  );
}, 30000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec("begin");
});
afterEach(async () => {
  await db.exec(
    "rollback;reset role;select set_config('request.jwt.claim.sub','',false)",
  );
});

it("defaults preferences on without inventing consent to send", async () => {
  await as(user);
  expect(
    (
      await db.query<{ r: { enabled: boolean } }>(
        "select public.my_marketing_preferences() r",
      )
    ).rows[0].r.enabled,
  ).toBe(true);
  await db.exec("reset role");
  expect(
    (
      await db.query<{ allowed: boolean }>(
        "select private.marketing_delivery_allowed('candidate@example.org') allowed",
      )
    ).rows[0].allowed,
  ).toBe(false);
});
it("lets candidates, employers and agencies withdraw and expressly opt back in", async () => {
  for (const id of [user, employer, agency]) {
    await as(id);
    expect((await choice(false)).enabled).toBe(false);
  }
  await as(admin);
  expect((await list()).rows.map((row) => row.audience).sort()).toEqual([
    "agency",
    "applicant",
    "employer",
  ]);
  await as(user);
  expect((await choice(true)).enabled).toBe(true);
  await db.exec("reset role");
  expect(
    (
      await db.query<{ allowed: boolean }>(
        "select private.marketing_delivery_allowed('candidate@example.org') allowed",
      )
    ).rows[0].allowed,
  ).toBe(true);
  expect(
    (
      await db.query(
        "select * from private.marketing_preference_events where email='candidate@example.org'",
      )
    ).rows,
  ).toHaveLength(2);
});
it("records a token withdrawal for a contact without an account, without duplicate audit entries", async () => {
  await as("", "service_role");
  const prepared = await prepare();
  const token = new URL(
    prepared.unsubscribePath,
    "https://westmere.com.au",
  ).searchParams.get("token");
  await db.exec("reset role");
  expect(
    (
      await db.query<{ allowed: boolean }>(
        "select private.marketing_delivery_allowed('prospect@example.org') allowed",
      )
    ).rows[0].allowed,
  ).toBe(false);
  expect(
    (
      await db.query<{ allowed: boolean }>(
        "select private.marketing_delivery_allowed('prospect@example.org','supplier_introduction') allowed",
      )
    ).rows[0].allowed,
  ).toBe(true);
  await as("", "service_role");
  await db.query("select public.unsubscribe_marketing($1)", [token]);
  await db.query("select public.unsubscribe_marketing($1)", [token]);
  await as(admin);
  expect((await list()).rows[0]).toMatchObject({
    email: "prospect@example.org",
    audience: "external contact",
    source: "email_unsubscribe",
  });
  await db.exec("reset role");
  expect(
    (
      await db.query(
        "select * from private.marketing_preference_events where email='prospect@example.org' and not enabled",
      )
    ).rows,
  ).toHaveLength(1);
});
it("adds manual entries case-insensitively, persists them through signup and refuses a new outreach draft", async () => {
  await as(admin);
  await db.query(
    "select public.admin_marketing_contacts('suppress','  CONTACT@Example.org  ','Requested removal by telephone on 22 November 2026')",
  );
  await db.exec("reset role");
  await db.exec(
    "insert into auth.users(id,email,email_confirmed_at) values('91000000-0000-4000-8000-000000000009','contact@example.org',now())",
  );
  expect(
    (
      await db.query<{ enabled: boolean }>(
        "select enabled from private.marketing_contacts where email='contact@example.org'",
      )
    ).rows[0].enabled,
  ).toBe(false);
  await as("", "service_role");
  await expect(prepare("contact@example.org")).rejects.toMatchObject({
    code: "42501",
  });
});
it("denies ordinary accounts access to other addresses, the suppression register and service-only operations", async () => {
  await as(user);
  await db.exec("savepoint denied");
  for (const sql of [
    "select * from private.marketing_contacts",
    "select public.admin_marketing_contacts()",
    "select public.unsubscribe_marketing(gen_random_uuid())",
    "select public.prepare_marketing_contact('target@example.org','inferred','A made up consent claim')",
  ]) {
    await expect(db.exec(sql)).rejects.toMatchObject({ code: "42501" });
    await db.exec("rollback to denied");
  }
});
it("rejects a forged unsubscribe token", async () => {
  await as("", "service_role");
  await expect(
    db.query("select public.unsubscribe_marketing(gen_random_uuid())"),
  ).rejects.toMatchObject({ code: "22023" });
});
it("imports new legacy launch withdrawals into the global register", async () => {
  await db.exec(
    "insert into private.launch_mail_preferences(email,removed_at) values('legacy@example.org',now())",
  );
  await as(admin);
  expect((await list()).rows[0]).toMatchObject({
    email: "legacy@example.org",
    source: "launch_unsubscribe",
  });
});
it("checks eligibility again after a delivery lease and keeps essential account mail available", async () => {
  await as("", "service_role");
  await prepare("candidate@example.org");
  const id = (
    await db.query<{ id: string }>(
      `insert into private.alert_outbox(user_id,recipient,kind,event_key,snapshot) values($1,'candidate@example.org','marketing','outreach','{"purpose":"supplier_introduction"}') returning id`,
      [user],
    )
  ).rows[0].id;
  const claimed = (
    await db.query<{ r: any[] }>("select public.claim_job_alerts(10) r")
  ).rows[0].r;
  expect(claimed.map((row) => row.id)).toContain(id);
  await as(user);
  await choice(false);
  await as("", "service_role");
  const frozen = (
    await db.query<{ r: any }>(
      "select public.freeze_job_alert($1,$2,$3::jsonb) r",
      [
        id,
        claimed.find((row) => row.id === id).lease_token,
        JSON.stringify({
          from: "Westmere Careers <hello@westmere.com.au>",
          to: ["candidate@example.org"],
        }),
      ],
    )
  ).rows[0].r;
  expect(frozen).toBeNull();
  expect(
    (
      await db.query<{ status: string }>(
        "select status from private.alert_outbox where id=$1",
        [id],
      )
    ).rows[0].status,
  ).toBe("canceled");
  await db.exec("reset role");
  const account = (
    await db.query<{ ok: boolean }>(
      "with notice as (insert into private.alert_outbox(user_id,recipient,kind,event_key,snapshot) values($1,'candidate@example.org','account','welcome','{}') returning *) select private.delivery_eligible(notice) ok from notice",
      [user],
    )
  ).rows[0].ok;
  expect(account).toBe(true);
});
it("retains email-provider suppression after an account opts marketing back in", async () => {
  await db.query(
    "insert into private.alert_suppressions(user_id,reason) values($1,'complained')",
    [user],
  );
  await as(user);
  await choice(true);
  await db.exec("reset role");
  expect(
    (
      await db.query<{ allowed: boolean }>(
        "select private.marketing_delivery_allowed('candidate@example.org') allowed",
      )
    ).rows[0].allowed,
  ).toBe(false);
});
