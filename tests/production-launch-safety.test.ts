import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { beforeAll, afterAll, beforeEach, afterEach, expect, it } from "vitest";
let db: PGlite;
const owner = "563e67cd-32d5-4e8c-a70a-2c0b51195bb6",
  candidate = "93000000-0000-4000-8000-000000000001",
  pending = "93000000-0000-4000-8000-000000000002",
  attacker = "93000000-0000-4000-8000-000000000003";
const fixture = "94000000-0000-4000-8000-000000000001",
  genuine = "94000000-0000-4000-8000-000000000002",
  fixtureJob = "95000000-0000-4000-8000-000000000001";
async function as(user = "", role = "authenticated") {
  await db.exec(
    `reset role;select set_config('request.jwt.claim.sub','${user}',false);set role ${role}`,
  );
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz not null default clock_timestamp());create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated,service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
  );
  const dir = new URL("../supabase/migrations/", import.meta.url);
  for (const name of (await readdir(dir))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    await db.exec(await readFile(new URL(name, dir), "utf8"));
  await db.exec(
    `insert into auth.users(id,email,email_confirmed_at) values('${owner}','owner@example.org',now()),('${candidate}','candidate@example.org',now()),('${pending}','business@example.org',now()),('${attacker}','unadmitted@example.org',now());update auth.users set created_at=(select existing_before-interval '1 day' from private.launch_settings where singleton) where id in('${owner}','${candidate}');insert into private.staff_members(user_id,role) values('${owner}','admin');insert into public.organisations(id,name,slug,is_verified,is_test) values('${fixture}','Explicit private fixture','private-fixture',true,true),('${genuine}','Genuine reviewed business','genuine-business',true,false);insert into public.jobs(id,organisation_id,title,company,location,city,state,work_mode,employment_type,description,status,moderation_status,published_at,expires_at) values('${fixtureJob}','${fixture}','Fixture vacancy','Explicit private fixture','Melbourne VIC','Melbourne','VIC','On-site','Full time','A synthetic test vacancy with no employment offered.','published','approved',now(),now()+interval '30 days');`,
  );
  await as("", "service_role");
  await db.query(
    "select public.prepare_business_signup('business@example.org','employer',$1)",
    ["a".repeat(64)],
  );
  await db.exec("reset role");
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
it("keeps a fixture private even after an administrator opens the marketplace and attempts to release it", async () => {
  await as(owner);
  await db.query(
    "select public.admin_launch('mode',null,null,'Rollback-only production release test',true)",
  );
  await expect(
    db.query(
      "select public.admin_launch('release',$1,'profile','Should reject this synthetic company')",
      [fixture],
    ),
  ).rejects.toMatchObject({ code: "22023" });
});
it("makes fixture flags sticky and blocks publication through direct row writes", async () => {
  await db.query(
    "update public.organisations set is_test=false,name=$2 where id=$1",
    [fixture, "Renamed fixture"],
  );
  await db.query(
    "update public.jobs set is_test=false,status='published' where id=$1",
    [fixtureJob],
  );
  expect(
    (
      await db.query<{ is_test: boolean }>(
        "select is_test from public.organisations where id=$1",
        [fixture],
      )
    ).rows[0].is_test,
  ).toBe(true);
  expect(
    (
      await db.query<{ is_test: boolean; status: string }>(
        "select is_test,status from public.jobs where id=$1",
        [fixtureJob],
      )
    ).rows[0],
  ).toMatchObject({ is_test: true, status: "draft" });
});
it("denies anonymous fixture reads even with forged release metadata", async () => {
  await db.exec(
    "update private.launch_settings set marketplace_open=true where singleton",
  );
  await db.query(
    "insert into private.launch_profiles(organisation_id,consented_at,released_at) values($1,now(),now())",
    [fixture],
  );
  await as("", "anon");
  expect(
    (
      await db.query("select id from public.organisations where id=$1", [
        fixture,
      ])
    ).rows,
  ).toHaveLength(0);
  expect(
    (await db.query("select id from public.jobs where id=$1", [fixtureJob]))
      .rows,
  ).toHaveLength(0);
});
it("withholds response aggregates until a genuine business is released", async () => {
  await db.query(
    "insert into public.organisation_response_insights(organisation_id,period_start,period_end,as_of) values($1,current_date-90,current_date,now())",
    [genuine],
  );
  await as("", "anon");
  expect(
    (
      await db.query(
        "select organisation_id from public.organisation_response_insights",
      )
    ).rows,
  ).toHaveLength(0);
  await db.exec(
    "reset role;update private.launch_settings set marketplace_open=true where singleton",
  );
  await db.query(
    "insert into private.launch_profiles(organisation_id,consented_at,released_at) values($1,now(),now())",
    [genuine],
  );
  await as("", "anon");
  expect(
    (
      await db.query(
        "select organisation_id from public.organisation_response_insights",
      )
    ).rows,
  ).toEqual([{ organisation_id: genuine }]);
});
it("does not convert an ordinary business sandbox subscription into paid plan or Enterprise career access", async () => {
  await db.exec(
    "update private.launch_settings set marketplace_open=true where singleton",
  );
  await db.query(
    "insert into public.business_accounts(user_id,kind,trading_name,terms_version,terms_sha256) values($1,'employer','Genuine business','test',$2)",
    [candidate, "a".repeat(64)],
  );
  await db.query(
    "insert into public.organisation_members(organisation_id,user_id,role) values($1,$2,'owner')",
    [genuine, candidate],
  );
  await db.query(
    "insert into public.organisation_billing_accounts(organisation_id,stripe_customer_id,billing_user_id,audience,livemode) values($1,'cus_test_business',$2,'employer',false)",
    [genuine, candidate],
  );
  await db.query(
    "insert into public.business_subscriptions(organisation_id,stripe_customer_id,tier,status,current_period_start,current_period_end) values($1,'cus_test_business','enterprise','active',now()-interval '1 day',now()+interval '1 day')",
    [genuine],
  );
  await as(candidate);
  expect(
    (await db.query("select public.my_business_plan() p")).rows[0],
  ).toMatchObject({ p: { tier: null } });
  expect(
    (await db.query("select public.my_enterprise_careers_access() e")).rows[0],
  ).toEqual({ e: null });
  await db.exec(
    "reset role;update public.organisation_billing_accounts set livemode=true where stripe_customer_id='cus_test_business'",
  );
  await as(candidate);
  expect(
    (await db.query("select public.my_business_plan() p")).rows[0],
  ).toMatchObject({ p: { tier: "enterprise" } });
  expect(
    (
      await db.query<{ e: unknown }>(
        "select public.my_enterprise_careers_access() e",
      )
    ).rows[0].e,
  ).toBeTruthy();
});
it("reserves sample workspaces for the enabled protected administrator", async () => {
  await db.exec(
    "insert into private.sample_employer_invites(email) values('candidate@example.org') on conflict do nothing",
  );
  await as(candidate);
  expect(
    (await db.query<{ ok: boolean }>("select public.my_sample_workspace() ok"))
      .rows[0].ok,
  ).toBe(false);
  await as(owner);
  expect(
    (await db.query<{ ok: boolean }>("select public.my_sample_workspace() ok"))
      .rows[0].ok,
  ).toBe(true);
});
it("separates a valid business admission from applicant access before launch", async () => {
  await as(pending);
  const access = (
    await db.query<{
      r: { allowed: boolean; applicantAllowed: boolean; kind: string };
    }>("select public.my_launch_access() r")
  ).rows[0].r;
  expect(access).toMatchObject({
    allowed: true,
    applicantAllowed: false,
    kind: "employer",
  });
  await expect(
    db.query("insert into public.profiles(id,cv_text) values($1,$2)", [
      pending,
      "This is an attempted applicant CV before launch",
    ]),
  ).rejects.toMatchObject({ code: "42501" });
});
it("does not let an unadmitted OAuth identity gain account access from editable intent metadata", async () => {
  await as(attacker);
  expect(
    (
      await db.query<{ r: { allowed: boolean } }>(
        "select public.my_launch_access() r",
      )
    ).rows[0].r.allowed,
  ).toBe(false);
});
it("opens genuine applicant access when the marketplace opens, while fixture quarantine remains", async () => {
  await db.exec(
    "update private.launch_settings set marketplace_open=true where singleton",
  );
  await as(pending);
  expect(
    (
      await db.query<{ r: { applicantAllowed: boolean } }>(
        "select public.my_launch_access() r",
      )
    ).rows[0].r.applicantAllowed,
  ).toBe(true);
});
it("rejects a test personal subscription for an ordinary user but honours the owner test exception", async () => {
  for (const id of [candidate, owner])
    await db.query(
      `insert into public.billing_customers(user_id,stripe_customer_id,livemode) values($1,$2,false);`,
      [id, "cus_" + id.replaceAll("-", "")],
    );
  await db.exec(
    `insert into public.subscriptions(user_id,stripe_customer_id,stripe_subscription_id,status,price_id,current_period_start,current_period_end) select user_id,stripe_customer_id,'sub_'||user_id,'active','price_test',now()-interval '1 day',now()+interval '1 day' from public.billing_customers`,
  );
  await as(candidate);
  expect(
    (
      await db.query<{ ok: boolean }>(
        "select private.personal_subscription_current($1) ok",
        [candidate],
      )
    ).rows[0].ok,
  ).toBe(false);
  await as(owner);
  expect(
    (
      await db.query<{ ok: boolean }>(
        "select private.personal_subscription_current($1) ok",
        [owner],
      )
    ).rows[0].ok,
  ).toBe(true);
});
it("accepts a current live personal subscription and denies cross-user entitlement probes", async () => {
  await db.query(
    "insert into public.billing_customers(user_id,stripe_customer_id,livemode) values($1,'cus_live',true)",
    [candidate],
  );
  await db.query(
    "insert into public.subscriptions(user_id,stripe_customer_id,stripe_subscription_id,status,price_id,current_period_start,current_period_end) values($1,'cus_live','sub_live','active','price_live',now()-interval '1 day',now()+interval '1 day')",
    [candidate],
  );
  await as(candidate);
  expect(
    (
      await db.query<{ ok: boolean }>(
        "select private.personal_subscription_current($1) ok",
        [candidate],
      )
    ).rows[0].ok,
  ).toBe(true);
  await as(owner);
  expect(
    (
      await db.query<{ ok: boolean }>(
        "select private.personal_subscription_current($1) ok",
        [candidate],
      )
    ).rows[0].ok,
  ).toBe(false);
});
