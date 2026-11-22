import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, beforeEach, afterEach, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
let db: PGlite;
const admin = "81000000-0000-4000-8000-000000000001",
  user = "81000000-0000-4000-8000-000000000002";
async function as(id: string, role = "authenticated") {
  await db.exec(
    `reset role;select set_config('request.jwt.claim.sub','${id}',false);set role ${role};`,
  );
}
async function operation(
  action: string,
  view = "registrations",
  target: string | null = null,
  email: string | null = null,
  offset = 0,
) {
  return (
    await db.query<{ r: Record<string, any> }>(
      "select public.admin_launch_operations($1,$2,$3,$4,$5,'Verified administrator launch decision') r",
      [action, view, offset, target, email],
    )
  ).rows[0].r;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz not null default clock_timestamp());create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated,service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
  );
  const dir = new URL("../supabase/migrations/", import.meta.url);
  for (const f of (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort())
    await db.exec(await readFile(new URL(f, dir), "utf8"));
  await db.exec(
    `insert into auth.users(id,email,email_confirmed_at) values('${admin}','admin@example.org',now()),('${user}','member@example.org',now());insert into private.staff_members(user_id,role) values('${admin}','admin');insert into private.alert_settings(singleton,site_origin,unsubscribe_origin,sending_enabled) values(true,'https://westmere.com.au','https://westmere.com.au/api/alerts/unsubscribe',true);insert into private.launch_requests(email,kind,name) values('member@example.org','candidate',''),('launch-only@example.org','candidate','');`,
  );
  await db.exec(
    "update auth.users set created_at=(select existing_before-interval '1 day' from private.launch_settings where singleton)",
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
it("limits registration and mailing lists to administrators", async () => {
  await as(user);
  await expect(operation("list")).rejects.toMatchObject({ code: "42501" });
});
it("lists all registrations in stable pages of 25, including unverified accounts", async () => {
  await db.exec(
    `insert into auth.users(id,email) select ('82000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'unverified-'||i||'@example.org' from generate_series(1,30)i`,
  );
  await as(admin);
  const a = await operation("list"),
    b = await operation("list", "registrations", null, null, 25);
  expect(a.total).toBe(32);
  expect(a.rows).toHaveLength(25);
  expect(b.rows).toHaveLength(7);
  expect(new Set([...a.rows, ...b.rows].map((r: any) => r.id)).size).toBe(32);
  expect(a.rows.some((r: any) => !r.verified)).toBe(true);
});
it("protects administrator access from restriction and retains staff sign-in", async () => {
  await as(admin);
  await db.exec("savepoint protect");
  await expect(
    operation("restrict", "registrations", admin),
  ).rejects.toMatchObject({ code: "22023" });
  await db.exec("rollback to protect");
  await as("", "service_role");
  expect(
    (
      await db.query<{ ok: boolean }>(
        "select private.launch_email_allowed('admin@example.org') ok",
      )
    ).rows[0].ok,
  ).toBe(true);
});
it("blocks a restricted existing session at the account boundary and direct table RLS, then restores it", async () => {
  await as(admin);
  await operation("restrict", "registrations", user);
  await as(user);
  expect(
    (
      await db.query<{ ok: boolean }>(
        "select private.launch_account_allowed() ok",
      )
    ).rows[0].ok,
  ).toBe(false);
  expect((await db.query("select * from public.profiles")).rows).toHaveLength(
    0,
  );
  await as(admin);
  await operation("restore", "registrations", user);
  await as(user);
  expect(
    (
      await db.query<{ ok: boolean }>(
        "select private.launch_account_allowed() ok",
      )
    ).rows[0].ok,
  ).toBe(true);
});
it("deduplicates a registered account and homepage opt-in and persists mailing-list removals", async () => {
  await as(admin);
  let list = await operation("list", "mailing");
  expect(list.total).toBe(3);
  await operation("remove_mail", "mailing", null, "member@example.org");
  list = await operation("list", "mailing");
  expect(
    list.rows.find((r: any) => r.email === "member@example.org").removed_at,
  ).not.toBeNull();
});
it("requires the marketplace to be open before announcing it", async () => {
  await as(admin);
  await expect(operation("announce")).rejects.toMatchObject({ code: "22023" });
});
it("opens only on explicit action, queues one announcement per address, excludes removals and is retry safe", async () => {
  await as(admin);
  await operation("remove_mail", "mailing", null, "admin@example.org");
  const r = await operation("launch_and_email");
  expect(r.message).toContain("2 launch emails");
  await operation("announce");
  await as("", "service_role");
  const rows = (
    await db.query<{ recipient: string; snapshot: { siteOrigin: string } }>(
      "select recipient,snapshot from private.alert_outbox where kind='launch'",
    )
  ).rows;
  expect(rows.map((r) => r.recipient).sort()).toEqual([
    "launch-only@example.org",
    "member@example.org",
  ]);
  expect(
    rows.every((r) => r.snapshot.siteOrigin === "https://westmere.com.au"),
  ).toBe(true);
});
it("cancels queued launch emails after list removal and honours token-based unsubscription", async () => {
  await as(admin);
  await operation("launch_and_email");
  await operation("remove_mail", "mailing", null, "member@example.org");
  await as("", "service_role");
  const row = (
    await db.query<{ token: string }>(
      "select token from private.launch_mail_preferences where email='launch-only@example.org'",
    )
  ).rows[0];
  await db.query("select public.unsubscribe_launch($1)", [row.token]);
  expect(
    (
      await db.query(
        "select 1 from private.alert_outbox where kind='launch' and recipient in('member@example.org','launch-only@example.org') and status<>'canceled'",
      )
    ).rows,
  ).toHaveLength(0);
});
it("does not let normal users execute the service-only conversion or customer rotation", async () => {
  await as(user);
  await expect(
    db.query("select public.archive_sandbox_billing($1,gen_random_uuid())", [
      user,
    ]),
  ).rejects.toMatchObject({ code: "42501" });
});

it("retains sandbox customer and subscription history when preparing a separate live billing stream", async () => {
  const org = "83000000-0000-4000-8000-000000000001";
  await db.exec(
    `insert into public.organisations(id,name,slug,is_verified) values('${org}','Verified Business','verified-billing-fixture',true);insert into public.organisation_billing_accounts(organisation_id,billing_user_id,stripe_customer_id,audience) values('${org}','${user}','cus_sandbox_history','employer');insert into public.business_subscriptions(organisation_id,stripe_customer_id,stripe_subscription_id,price_id,tier,status,current_period_start,current_period_end) values('${org}','cus_sandbox_history','sub_sandbox_history','price_sandbox','starter','active',now()-interval '1 day',now()+interval '29 days');`,
  );
  await as("", "service_role");
  const lease = (
    await db.query<{ token: string }>(
      "select public.acquire_billing_lease($1) token",
      [user],
    )
  ).rows[0].token;
  await db.query("select public.archive_sandbox_billing($1,$2)", [user, lease]);
  expect(
    (await db.query("select * from public.organisation_billing_accounts")).rows,
  ).toHaveLength(1);
  expect(
    (
      await db.query<{ s: any }>(
        "select subscription_snapshot s from public.billing_customer_history",
      )
    ).rows[0].s.stripe_subscription_id,
  ).toBe("sub_sandbox_history");
  await db.query(
    "insert into public.organisation_billing_accounts(organisation_id,billing_user_id,stripe_customer_id,audience,livemode) values($1,$2,'cus_separate_live','employer',true)",
    [org, user],
  );
  expect(
    (await db.query("select * from public.organisation_billing_accounts")).rows,
  ).toHaveLength(2);
  await db.query(
    "insert into public.organisation_members(organisation_id,user_id,role) values($1,$2,'owner')",
    [org, user],
  );
  await db.exec("reset role");
  await db.query(
    "delete from private.business_plan_organisations where organisation_id=$1",
    [org],
  );
  await db.query("select private.fill_business_plan($1)", [user]);
  expect(
    (
      await db.query(
        "select * from private.business_plan_organisations where organisation_id=$1",
        [org],
      )
    ).rows,
  ).toHaveLength(1);
  await as("", "service_role");
  await db.exec("savepoint stale_stream");
  await expect(
    db.query(
      "select public.apply_business_subscription($1,'cus_sandbox_history','sub_sandbox_history','price_sandbox','enterprise','active',now(),now()+interval '1 month',false,$2,$3)",
      [org, user, lease],
    ),
  ).rejects.toMatchObject({ code: "42501" });
  await db.exec("rollback to stale_stream");

  expect(
    (
      await db.query<{ status: string }>(
        "select status from public.business_subscriptions",
      )
    ).rows[0].status,
  ).toBe("canceled");
});
it("revokes personal Careers+ on acknowledged conversion without modifying staff permissions", async () => {
  await db.exec(
    `insert into public.billing_customers(user_id,stripe_customer_id) values('${admin}','cus_admin_personal');insert into public.subscriptions(user_id,stripe_customer_id,stripe_subscription_id,status,price_id,current_period_start,current_period_end,last_event_created) values('${admin}','cus_admin_personal','sub_admin_personal','active','price_careers_plus',now()-interval '1 day',now()+interval '29 days',1);`,
  );
  await as("", "service_role");
  await db.query("select public.acquire_billing_lease($1)", [admin]);
  await db.query(
    "select public.complete_business_registration($1,'employer','Admin Business','test-terms',repeat('a',64),true)",
    [admin],
  );
  expect(
    (
      await db.query<{ status: string }>(
        "select status from public.subscriptions",
      )
    ).rows[0].status,
  ).toBe("canceled");
  await as(admin);
  expect(
    (await db.query<{ role: string }>("select public.my_staff_role() role"))
      .rows[0].role,
  ).toBe("admin");
  expect(
    (
      await db.query<{ allowed: boolean }>(
        "select (public.my_launch_access()->>'allowed')::boolean allowed",
      )
    ).rows[0].allowed,
  ).toBe(true);
});
