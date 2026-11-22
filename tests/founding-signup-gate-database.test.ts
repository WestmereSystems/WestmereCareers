import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, beforeEach, afterEach, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";
let db: PGlite;
const owner = "91000000-0000-4000-8000-000000000001";
async function as(id = "", role = "authenticated") {
  await db.exec(
    `reset role;select set_config('request.jwt.claim.sub','${id}',false);set role ${role}`,
  );
}
async function hook(email: string, metadata: unknown = {}) {
  return (
    await db.query<{ r: any }>("select public.before_user_created($1) r", [
      { user: { email, user_metadata: metadata } },
    ])
  ).rows[0].r;
}
async function prepare(
  email: string,
  kind = "employer",
  network = "a".repeat(64),
) {
  await as("", "service_role");
  await db.query("select public.prepare_business_signup($1,$2,$3)", [
    email,
    kind,
    network,
  ]);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create role supabase_auth_admin;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz not null default clock_timestamp());create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated,service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
  );
  const dir = new URL("../supabase/migrations/", import.meta.url);
  for (const f of (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort())
    await db.exec(await readFile(new URL(f, dir), "utf8"));
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
it("blocks new ordinary users at Auth even if they claim business or admin metadata", async () => {
  await as("", "supabase_auth_admin");
  expect(
    await hook("ordinary@example.test", { intent: "employer", role: "admin" }),
  ).toMatchObject({ error: { http_code: 403 } });
});
it.each(["google", "azure"])(
  "keeps a newly authenticated %s identity locked until business admission",
  async (provider) => {
    await as("", "supabase_auth_admin");
    const authenticated = await db.query<{ r: any }>(
      "select public.before_user_created($1) r",
      [
        {
          user: {
            email: "chosen@example.test",
            app_metadata: { provider },
            user_metadata: { role: "admin" },
          },
        },
      ],
    );
    expect(authenticated.rows[0].r).toEqual({});
    await db.exec("reset role");
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,'chosen@example.test',now())",
      [owner],
    );
    await as(owner);
    expect(
      (await db.query<{ r: any }>("select public.my_launch_access() r")).rows[0]
        .r.allowed,
    ).toBe(false);
    await prepare("chosen@example.test", "agency");
    await as(owner);
    expect(
      (await db.query<{ r: any }>("select public.my_launch_access() r")).rows[0]
        .r,
    ).toMatchObject({ allowed: true, kind: "agency" });
  },
);
it.each(["employer", "agency"])(
  "admits a %s only after server preparation, then admits its verified account",
  async (kind) => {
    await prepare("owner@example.test", kind);
    await as("", "supabase_auth_admin");
    expect(await hook("owner@example.test")).toEqual({});
    await db.exec("reset role");
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
      [owner, "owner@example.test"],
    );
    await as(owner);
    expect(
      (await db.query<{ r: any }>("select public.my_launch_access() r")).rows[0]
        .r,
    ).toMatchObject({ allowed: true, kind });
  },
);
it("expires unused business admissions without granting ongoing applicant access", async () => {
  await prepare("owner@example.test");
  await db.exec(
    "reset role;update private.launch_business_signup set expires_at=now()-interval '1 second'",
  );
  await as("", "supabase_auth_admin");
  expect(await hook("owner@example.test")).toMatchObject({
    error: { http_code: 403 },
  });
});
it("keeps a completed business account allowed after its admission expires", async () => {
  await prepare("owner@example.test");
  await db.exec("reset role");
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'owner@example.test',now());",
    [owner],
  );
  await db.query(
    "insert into public.business_accounts(user_id,kind,trading_name,terms_version,terms_sha256) values($1,'employer','Test Employer','2026-11-22.1',repeat('a',64))",
    [owner],
  );
  await db.exec(
    "update private.launch_business_signup set expires_at=now()-interval '1 second'",
  );
  await as(owner);
  expect(
    (await db.query<{ r: any }>("select public.my_launch_access() r")).rows[0].r
      .allowed,
  ).toBe(true);
});
it("retains staff sign-in despite a restriction and does not let metadata create staff access", async () => {
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'admin@example.test',now())",
    [owner],
  );
  await db.query(
    "insert into private.staff_members(user_id,role) values($1,'admin')",
    [owner],
  );
  await db.query(
    "insert into private.launch_access(email,kind,user_id,revoked_at) values('admin@example.test','existing',$1,now())",
    [owner],
  );
  await as(owner);
  expect(
    (await db.query<{ r: any }>("select public.my_launch_access() r")).rows[0].r
      .allowed,
  ).toBe(true);
});
it("does not let a new unapproved verified applicant use an existing session", async () => {
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'new-applicant@example.test',now())",
    [owner],
  );
  await as(owner);
  expect(
    (await db.query<{ r: any }>("select public.my_launch_access() r")).rows[0].r
      .allowed,
  ).toBe(false);
});
it("allows ordinary registration only after the public switch is opened", async () => {
  await db.exec(
    "update private.launch_settings set marketplace_open=true where singleton",
  );
  await as("", "supabase_auth_admin");
  expect(await hook("ordinary@example.test")).toEqual({});
});
it("prevents unauthenticated and authenticated callers issuing admissions or invoking the Auth hook", async () => {
  for (const role of ["anon", "authenticated"]) {
    await as("", role);
    await db.exec("savepoint denied");
    await expect(
      db.query(
        "select public.prepare_business_signup('fake@example.test','employer',$1)",
        ["a".repeat(64)],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await db.exec("rollback to denied");
    await db.exec("savepoint hook_denied");
    await expect(hook("fake@example.test")).rejects.toMatchObject({
      code: "42501",
    });
    await db.exec("rollback to hook_denied");
  }
});
it("applies network pacing and never re-admits restricted accounts", async () => {
  for (let i = 0; i < 6; i++) await prepare(`owner-${i}@example.test`);
  await db.exec("savepoint paced");
  await expect(prepare("seventh@example.test")).rejects.toMatchObject({
    code: "P0001",
  });
  await db.exec("rollback to paced");
  await db.exec(
    "reset role;insert into private.launch_access(email,kind,revoked_at) values('restricted@example.test','employer',now())",
  );
  await db.exec("savepoint restricted");
  await expect(
    prepare("restricted@example.test", "employer", "b".repeat(64)),
  ).rejects.toMatchObject({ code: "42501" });
  await db.exec("rollback to restricted");
});
