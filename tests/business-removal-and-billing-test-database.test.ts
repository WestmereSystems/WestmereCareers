import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { beforeAll, afterAll, beforeEach, afterEach, expect, it } from "vitest";

let db: PGlite;
const owner = "83000000-0000-4000-8000-000000000001",
  member = "83000000-0000-4000-8000-000000000002",
  outsider = "83000000-0000-4000-8000-000000000003",
  admin = "563e67cd-32d5-4e8c-a70a-2c0b51195bb6",
  org = "84000000-0000-4000-8000-000000000001";

async function as(id = "", role = "authenticated") {
  await db.exec(`reset role;set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
async function rejects(work: () => Promise<unknown>, code: string) {
  await db.exec("savepoint rejected_action");
  try {
    await expect(work()).rejects.toMatchObject({ code });
  } finally {
    await db.exec(
      "rollback to savepoint rejected_action;release savepoint rejected_action",
    );
  }
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz not null default clock_timestamp(),raw_app_meta_data jsonb default '{}',raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub','t'),'')::uuid$$;
    grant usage on schema auth to anon,authenticated,service_role;
    create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`);
  const dir = new URL("../supabase/migrations/", import.meta.url);
  for (const f of (await readdir(dir)).filter((n) => n.endsWith(".sql")).sort())
    await db.exec(await readFile(new URL(f, dir), "utf8"));
  for (const [id, email] of [
    [owner, "owner@example.test"],
    [member, "member@example.test"],
    [outsider, "outsider@example.test"],
    [admin, "admin@example.test"],
  ])
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
      [id, email],
    );
  await db.query(
    "insert into private.staff_members(user_id,role) values($1,'admin')",
    [admin],
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
  await db.exec(
    "rollback;reset role;select set_config('request.jwt.claim.sub','',false)",
  );
});

async function business(kind = "employer") {
  await db.query(
    "insert into public.business_accounts(user_id,kind,trading_name,terms_version,terms_sha256) values($1,$2,'Synthetic business','test',$3)",
    [owner, kind, "a".repeat(64)],
  );
  await db.query(
    "insert into public.organisations(id,name,slug,kind,is_verified,is_test) values($1,'Synthetic business','removal-fixture',$2,true,true)",
    [org, kind],
  );
  for (const [user, role] of [
    [owner, "owner"],
    [member, "recruiter"],
  ])
    await db.query(
      "insert into public.organisation_members(organisation_id,user_id,role) values($1,$2,$3)",
      [org, user, role],
    );
}
async function subscription() {
  await db.query(
    "insert into public.organisation_billing_accounts(organisation_id,stripe_customer_id,billing_user_id,audience,livemode) values($1,'cus_synthetic',$2,'employer',false)",
    [org, owner],
  );
  await db.query(
    "insert into public.business_subscriptions(organisation_id,stripe_customer_id,tier,status,current_period_start,current_period_end) values($1,'cus_synthetic','enterprise','active',now()-interval '1 day',now()+interval '1 day')",
    [org],
  );
}

it.each(["employer", "agency"])(
  "records a %s removal for its team and Admin without queuing email",
  async (kind) => {
    await business(kind);
    await as(owner);
    await db.query("select public.remove_company($1,'Synthetic business')", [
      org,
    ]);
    const notices = await db.query<{
      title: string;
      message: string;
      path: string;
    }>(
      "select title,message,path from public.notifications where event_key like 'business-removed:%'",
    );
    expect(notices.rows).toHaveLength(1);
    expect(notices.rows[0]).toMatchObject({
      title: "Business removed: Synthetic business",
      path: "/account",
    });
    expect(notices.rows[0].message).toContain(
      "team no longer has hiring access",
    );
    await as(member);
    expect(
      (
        await db.query(
          "select id from public.notifications where event_key like 'business-removed:%'",
        )
      ).rows,
    ).toHaveLength(1);
    await as(outsider);
    expect(
      (
        await db.query(
          "select id from public.notifications where event_key like 'business-removed:%'",
        )
      ).rows,
    ).toHaveLength(0);
    await as("", "service_role");
    expect(
      (
        await db.query(
          "select user_id from public.notifications where event_key like 'business-removed:%'",
        )
      ).rows,
    ).toHaveLength(3);
    expect(
      (
        await db.query(
          "select id from private.alert_outbox where event_key like 'business-removed:%'",
        )
      ).rows,
    ).toHaveLength(0);
  },
);

it("preserves the original removal time, audit and notice on a retry", async () => {
  await business();
  await as(owner);
  await db.query("select public.remove_company($1,'Synthetic business')", [
    org,
  ]);
  await db.exec("reset role");
  const first = (
    await db.query("select removed_at from public.organisations where id=$1", [
      org,
    ])
  ).rows[0];
  await as(owner);
  await db.query("select public.remove_company($1,'Synthetic business')", [
    org,
  ]);
  await db.exec("reset role");
  expect(
    (
      await db.query(
        "select removed_at from public.organisations where id=$1",
        [org],
      )
    ).rows[0],
  ).toEqual(first);
  expect(
    (
      await db.query(
        "select id from private.moderation_audit where subject_id=$1 and action='owner_removed'",
        [org],
      )
    ).rows,
  ).toHaveLength(1);
  expect(
    (
      await db.query(
        "select id from public.notifications where user_id=$1 and event_key like 'business-removed:%'",
        [owner],
      )
    ).rows,
  ).toHaveLength(1);
});

it("does not log a removal when ownership, exact-name or active billing checks reject it", async () => {
  await business();
  await as(outsider);
  await rejects(
    () =>
      db.query("select public.remove_company($1,'Synthetic business')", [org]),
    "42501",
  );
  await as(owner);
  await rejects(
    () =>
      db.query("select public.remove_company($1,'synthetic business')", [org]),
    "22023",
  );
  await db.exec("reset role");
  await subscription();
  await as(owner);
  await rejects(
    () =>
      db.query("select public.remove_company($1,'Synthetic business')", [org]),
    "22023",
  );
  await db.exec("reset role");
  expect(
    (
      await db.query(
        "select id from public.notifications where event_key like 'business-removed:%'",
      )
    ).rows,
  ).toHaveLength(0);
});

it("accepts a designated verified tester's sandbox subscription without granting staff or sample access", async () => {
  await business();
  await db.query(
    "update auth.users set raw_app_meta_data='{\"westmere_billing_test\":true}' where id=$1",
    [owner],
  );
  await db.query(
    "insert into private.test_account_allowlist(email) values('owner@example.test')",
  );
  await subscription();
  await as(owner);
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
  expect(
    (
      await db.query(
        "select public.my_staff_role() r,public.my_sample_workspace() s",
      )
    ).rows[0],
  ).toEqual({ r: null, s: false });
  expect(
    (await db.query("select id from public.organisations where id=$1", [org]))
      .rows,
  ).toHaveLength(1);
  await as("", "anon");
  expect(
    (await db.query("select id from public.organisations where id=$1", [org]))
      .rows,
  ).toHaveLength(0);
});

it("ignores editable metadata and requires the private designation, verified email and allowlist", async () => {
  await business();
  await subscription();
  await db.query(
    "update auth.users set raw_user_meta_data='{\"westmere_billing_test\":true}' where id=$1",
    [owner],
  );
  await as(owner);
  expect(
    (await db.query("select public.my_business_plan() p")).rows[0],
  ).toMatchObject({ p: { tier: null } });
  await db.exec("reset role");
  await db.query(
    "update auth.users set raw_app_meta_data='{\"westmere_billing_test\":true}' where id=$1",
    [owner],
  );
  await as(owner);
  expect(
    (await db.query("select public.my_business_plan() p")).rows[0],
  ).toMatchObject({ p: { tier: null } });
  await db.exec(
    "reset role;insert into private.test_account_allowlist(email) values('owner@example.test')",
  );
  await db.query("update auth.users set email_confirmed_at=null where id=$1", [
    owner,
  ]);
  await as(owner);
  expect(
    (await db.query("select public.my_business_plan() p")).rows[0],
  ).toMatchObject({ p: { tier: null } });
  await rejects(
    () => db.query("select private.is_billing_test_account($1)", [owner]),
    "42501",
  );
});
