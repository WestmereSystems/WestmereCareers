import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";

// Execute the real migration in isolated PostgreSQL/WASM. auth/storage fixtures model Supabase-owned schemas.
// This does not establish hosted Supabase configuration or test its HTTP gateway.
const candidate = "10000000-0000-4000-8000-000000000001";
const protectedOwner = "563e67cd-32d5-4e8c-a70a-2c0b51195bb6";
const otherCandidate = "10000000-0000-4000-8000-000000000002";
const employer = "10000000-0000-4000-8000-000000000003";
const otherEmployer = "10000000-0000-4000-8000-000000000004";
const org = "20000000-0000-4000-8000-000000000001";
const otherOrg = "20000000-0000-4000-8000-000000000002";
const job = "30000000-0000-4000-8000-000000000001";
let db: PGlite;

describe("assistant stops and notification menu history", () => {
  const principal = "a".repeat(64),
    otherPrincipal = "b".repeat(64),
    abuse = "c".repeat(64);
  const attempt = "60000000-0000-4000-8000-000000000001";
  it("returns a trial credit on Stop and cannot complete or access another identity’s attempt", async () => {
    const reservation = (
      await db.query<{ id: string }>(
        "select public.reserve_trial_ai_usage($1,'account',$2,$3) id",
        [principal, abuse, candidate],
      )
    ).rows[0].id;
    await db.query(
      "select public.register_assistant_attempt($1,$2,$3,false,$4)",
      [attempt, principal, reservation, candidate],
    );
    await expect(
      db.query("select public.cancel_assistant_attempt($1,$2)", [
        attempt,
        otherPrincipal,
      ]),
    ).rejects.toMatchObject({ code: "42501" });
    await db.query("select public.cancel_assistant_attempt($1,$2)", [
      attempt,
      principal,
    ]);
    expect(
      (
        await db.query("select public.complete_assistant_attempt($1,$2) done", [
          attempt,
          principal,
        ])
      ).rows[0],
    ).toEqual({ done: false });
    expect(
      (
        await db.query(
          "select public.trial_ai_remaining($1,'account') remaining",
          [principal],
        )
      ).rows[0],
    ).toEqual({ remaining: 3 });
    await asUser(candidate);
    await expect(
      db.query("select public.cancel_assistant_attempt($1,$2)", [
        attempt,
        principal,
      ]),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("honours Stop before registration and never refunds an already completed paid answer", async () => {
    await db.query("select public.cancel_assistant_attempt($1,$2)", [
      attempt,
      principal,
    ]);
    await asUser(candidate);
    const reservation = (
      await db.query<{ id: string }>(
        "select public.reserve_ai_usage('review') id",
      )
    ).rows[0].id;
    await db.exec("reset role");
    expect(
      (
        await db.query(
          "select public.register_assistant_attempt($1,$2,$3,true,$4) active",
          [attempt, principal, reservation, candidate],
        )
      ).rows[0],
    ).toEqual({ active: false });
    await db.query("select public.settle_ai_usage($1,false)", [reservation]);
    const finished = "60000000-0000-4000-8000-000000000002";
    await asUser(candidate);
    const second = (
      await db.query<{ id: string }>(
        "select public.reserve_ai_usage('review') id",
      )
    ).rows[0].id;
    await db.exec("reset role");
    await db.query(
      "select public.register_assistant_attempt($1,$2,$3,true,$4)",
      [finished, principal, second, candidate],
    );
    expect(
      (
        await db.query("select public.complete_assistant_attempt($1,$2) done", [
          finished,
          principal,
        ])
      ).rows[0],
    ).toEqual({ done: true });
    expect(
      (
        await db.query("select public.cancel_assistant_attempt($1,$2) status", [
          finished,
          principal,
        ])
      ).rows[0],
    ).toEqual({ status: "completed" });
    expect(
      (
        await db.query("select status from public.ai_usage where id=$1", [
          second,
        ])
      ).rows[0],
    ).toEqual({ status: "completed" });
  });
  it("clears only owned menu items, preserves history, and resurfaces a genuinely updated notice", async () => {
    await db.query(
      "insert into public.notifications(user_id,event_key,title,message,path) values($1,'synthetic:clear','Update','Recorded application update','/applications')",
      [candidate],
    );
    await asUser(otherCandidate);
    await db.query(
      "update public.notifications set dismissed_at=now() where user_id=$1",
      [candidate],
    );
    await asUser(candidate);
    await db.query(
      "update public.notifications set dismissed_at=now(),read_at=now() where event_key='synthetic:clear'",
    );
    expect(
      (
        await db.query(
          "select id from public.notifications where event_key='synthetic:clear' and dismissed_at is null",
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          "select id from public.notifications where event_key='synthetic:clear'",
        )
      ).rows,
    ).toHaveLength(1);
    await db.exec("reset role");
    await db.query(
      "update public.notifications set message='New application activity',read_at=null where event_key='synthetic:clear'",
    );
    expect(
      (
        await db.query(
          "select dismissed_at from public.notifications where event_key='synthetic:clear'",
        )
      ).rows[0],
    ).toEqual({ dismissed_at: null });
  });
  it("accepts an omitted salary and custom headings, rejecting partial or inverted ranges", async () => {
    await asUser(employer);
    await db.query(
      "update public.jobs set salary_min=null,salary_max=null,content_labels='{" +
        '"about":"Inside this role"' +
        "}' where id=$1",
      [job],
    );
    expect(
      (
        await db.query(
          "select salary_min,salary_max,content_labels from public.jobs where id=$1",
          [job],
        )
      ).rows[0],
    ).toEqual({
      salary_min: null,
      salary_max: null,
      content_labels: { about: "Inside this role" },
    });
    await expect(
      db.query("update public.jobs set salary_min=10 where id=$1", [job]),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      db.query(
        "update public.jobs set salary_min=100,salary_max=50 where id=$1",
        [job],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
});

async function asUser(id: string, role = "authenticated") {
  await db.exec("reset role");
  // These regression fixtures model an already-open marketplace with owner-approved content.
  // The dedicated founding suite exercises withheld permission and explicit release.
  await db.exec(`insert into private.launch_profiles(organisation_id,consented_at,released_at) select id,now(),now() from public.organisations where is_verified on conflict(organisation_id) do update set consented_at=now(),released_at=now();
    insert into private.launch_jobs(job_id,consented_at,released_at) select id,now(),now() from public.jobs where status='published' and moderation_status='approved' on conflict(job_id) do update set consented_at=now(),released_at=now();`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec(`set role ${role}`);
}

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz not null default clock_timestamp());
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  `);
  const migrations = new URL("../supabase/migrations/", import.meta.url);
  for (const name of (await readdir(migrations))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    if (name < "20261121093503_founding_launch_access.sql")
      await db.exec(await readFile(new URL(name, migrations), "utf8"));
  }
  await db.exec(`
    insert into auth.users(id,email,email_confirmed_at) values('${candidate}','candidate@example.test',now()),('${otherCandidate}','other@example.test',now()),('${employer}','employer@example.test',now()),('${otherEmployer}','other-employer@example.test',now());
    insert into public.profiles(id,cv_text) values('${candidate}','Private candidate CV'),('${otherCandidate}','Other private CV');
    insert into public.organisations(id,name,slug,is_verified) values('${org}','Fern Studio','fern-studio',true),('${otherOrg}','Banksia Group','banksia-group',true);
    insert into public.organisation_members(organisation_id,user_id,role) values('${org}','${employer}','owner'),('${otherOrg}','${otherEmployer}','owner');
    insert into public.jobs(id,organisation_id,title,company,location,city,state,work_mode,employment_type,salary_min,salary_max,description,status,published_at,moderation_status)
      values('${job}','${org}','Product Designer','Fern Studio','Melbourne VIC','Melbourne','VIC','Hybrid','Full time',100000,130000,'Design thoughtful digital products with our team.','published',now()-interval '1 day','approved');
    insert into public.billing_customers(user_id,stripe_customer_id) values('${candidate}','cus_candidate'),('${otherCandidate}','cus_other');
    insert into public.subscriptions(user_id,stripe_customer_id,stripe_subscription_id,status,price_id,current_period_start,current_period_end,last_event_created)
      values('${candidate}','cus_candidate','sub_candidate','active','price_careers_plus',now()-interval '1 day',now()+interval '29 days',10);
  `);
  // Seed legacy identities before the founding cutoff, then apply every later
  // migration in its real dependency order, including concurrently added work.
  for (const name of (await readdir(migrations))
    .filter(
      (name) =>
        name.endsWith(".sql") &&
        name >= "20261121093503_founding_launch_access.sql",
    )
    .sort())
    await db.exec(await readFile(new URL(name, migrations), "utf8"));
  await db.exec(
    `update private.launch_settings set marketplace_open=true where singleton;
     update public.billing_customers set livemode=true;
     update public.subscriptions set livemode=true;
     alter table public.organisation_billing_accounts alter column livemode set default true;
     insert into auth.users(id,email,email_confirmed_at) values('${protectedOwner}','protected-owner@example.test',now());
     insert into private.staff_members(user_id,role) values('${protectedOwner}','admin');`,
  );
}, 20_000);

afterEach(async () => {
  await db?.close();
});

describe("billing notifications", () => {
  it("notifies real state changes once and keeps invoice notices private and replay-safe", async () => {
    const before = (
      await db.query<{ count: number }>(
        "select count(*)::int count from public.notifications where event_key like 'billing:%' and user_id=$1",
        [candidate],
      )
    ).rows[0].count;
    expect(before).toBe(1);
    await db.exec(
      "insert into private.alert_settings(singleton,site_origin,unsubscribe_origin,sending_enabled) values(true,'https://careers.example.test','https://careers.example.test/unsubscribe',true)",
    );
    await db.query(
      "update public.profiles set application_email_enabled=false where id=$1",
      [candidate],
    );
    await db.query(
      "update public.subscriptions set updated_at=now() where user_id=$1",
      [candidate],
    );
    expect(
      (
        await db.query<{ count: number }>(
          "select count(*)::int count from public.notifications where event_key like 'billing:%' and user_id=$1",
          [candidate],
        )
      ).rows[0].count,
    ).toBe(before);
    await db.query(
      "update public.subscriptions set cancel_at_period_end=true where user_id=$1",
      [candidate],
    );
    expect(
      (
        await db.query(
          "select title,path from public.notifications where title='Careers+ cancellation scheduled'",
        )
      ).rows,
    ).toEqual([
      {
        title: "Careers+ cancellation scheduled",
        path: "/account?tab=billing",
      },
    ]);
    await db.exec(
      "insert into public.stripe_events(id,type,payload) values('evt_paid','invoice.paid','{}')",
    );
    await asUser(candidate);
    await expect(
      db.query(
        "select public.record_billing_notice('evt_paid','cus_candidate','Payment received','Confirmed payment')",
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await asUser(candidate, "service_role");
    for (let i = 0; i < 2; i++)
      await db.query(
        "select public.record_billing_notice('evt_paid','cus_candidate','Payment received','Confirmed payment')",
      );
    await db.exec("reset role");
    expect(
      (
        await db.query(
          "select user_id from public.notifications where event_key='billing:event:evt_paid'",
        )
      ).rows,
    ).toEqual([{ user_id: candidate }]);
    expect(
      (
        await db.query(
          "select user_id from private.alert_outbox where event_key='billing:event:evt_paid'",
        )
      ).rows,
    ).toEqual([{ user_id: candidate }]); // Billing mail is separate from application email preferences.
    await asUser(otherCandidate);
    expect(
      (
        await db.query(
          "select id from public.notifications where event_key='billing:event:evt_paid'",
        )
      ).rows,
    ).toHaveLength(0);
  });
});

describe("database security boundaries", () => {
  it.each(["individual", "employer", "agency"])(
    "retains exactly three completed free Assistant uses for a non-subscriber %s",
    async (kind) => {
      if (kind !== "individual")
        await db.query(
          "insert into public.business_accounts(user_id,kind,trading_name,terms_version,terms_sha256) values($1,$2,'Synthetic free business','test',repeat('a',64))",
          [otherCandidate, kind],
        );
      await asUser(otherCandidate, "service_role");
      const principal = "e".repeat(64),
        abuse = "f".repeat(64);
      for (let used = 0; used < 3; used++) {
        expect(
          (
            await db.query<{ n: number }>(
              "select public.trial_ai_remaining($1,'account') n",
              [principal],
            )
          ).rows[0].n,
        ).toBe(3 - used);
        const id = (
          await db.query<{ id: string }>(
            "select public.reserve_trial_ai_usage($1,'account',$2,$3) id",
            [principal, abuse, otherCandidate],
          )
        ).rows[0].id;
        await db.query("select public.settle_trial_ai_usage($1,true)", [id]);
      }
      expect(
        (
          await db.query<{ n: number }>(
            "select public.trial_ai_remaining($1,'account') n",
            [principal],
          )
        ).rows[0].n,
      ).toBe(0);
      await expect(
        db.query("select public.reserve_trial_ai_usage($1,'account',$2,$3)", [
          principal,
          abuse,
          otherCandidate,
        ]),
      ).rejects.toThrow();
    },
  );

  it("enforces guest and free-account AI allowances in the server-only ledger", async () => {
    await asUser(candidate);
    await expect(
      db.query("select * from public.ai_trial_usage"),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      db.query("select public.reserve_trial_ai_usage($1,'account',$2,$3)", [
        "a".repeat(64),
        "b".repeat(64),
        candidate,
      ]),
    ).rejects.toMatchObject({ code: "42501" });
    await asUser(candidate, "service_role");
    const reserve = async (
      principal: string,
      tier: string,
      abuse: string,
      user: string | null,
    ) =>
      (
        await db.query<{ id: string }>(
          "select public.reserve_trial_ai_usage($1,$2,$3,$4) as id",
          [principal.repeat(64), tier, abuse.repeat(64), user],
        )
      ).rows[0].id;
    const guest = await reserve("a", "guest", "b", null);
    await expect(reserve("a", "guest", "b", null)).rejects.toThrow();
    await db.query("select public.settle_trial_ai_usage($1,false)", [guest]);
    const retry = await reserve("a", "guest", "b", null);
    await db.query("select public.settle_trial_ai_usage($1,true)", [retry]);
    await expect(reserve("a", "guest", "b", null)).rejects.toThrow();
    for (let index = 0; index < 3; index++)
      await reserve("c", "account", "d", candidate);
    await expect(reserve("c", "account", "d", candidate)).rejects.toThrow();
    expect(
      (
        await db.query<{ remaining: number }>(
          "select public.trial_ai_remaining($1,'account') as remaining",
          ["c".repeat(64)],
        )
      ).rows[0].remaining,
    ).toBe(0);
  });
  it("isolates candidate profiles and prevents self-awarded subscriptions", async () => {
    await asUser(candidate);
    expect((await db.query("select id from public.profiles")).rows).toEqual([
      { id: candidate },
    ]);
    await expect(
      db.query(
        "insert into public.subscriptions(user_id,stripe_customer_id,status) values($1,'cus_other','active')",
        [otherCandidate],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      db.query(
        "update public.organisation_members set role = $1 where user_id = $2",
        ["owner", candidate],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      db.query(
        "insert into public.ai_usage(user_id,mode,period_start,period_end) values($1,$2,now(),now()+interval '1 day')",
        [candidate, "improve"],
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("publishes only live roles and prevents advertisers from forging response evidence", async () => {
    await db.exec(`update public.jobs set status='draft' where id='${job}'`);
    await asUser("", "anon");
    expect((await db.query("select id from public.jobs")).rows).toHaveLength(0);
    await asUser(employer);
    expect((await db.query("select id from public.jobs")).rows).toHaveLength(1);
    await db.query(
      "update public.jobs set company='Unrelated famous employer' where id=$1",
      [job],
    );
    expect(
      (await db.query("select company from public.jobs where id=$1", [job]))
        .rows,
    ).toEqual([{ company: "Fern Studio" }]);
    await db.query(
      "update public.jobs set title='Service Designer' where id=$1",
      [job],
    );
    expect(
      (
        await db.query(
          "select id from public.jobs where search_vector @@ websearch_to_tsquery('english','service designer')",
        )
      ).rows,
    ).toHaveLength(1);
    await expect(
      db.query("update public.jobs set response_days = 1 where id = $1", [job]),
    ).rejects.toMatchObject({ code: "42501" });
    await asUser(otherEmployer);
    expect((await db.query("select id from public.jobs")).rows).toHaveLength(0);
  });

  it("freezes submitted material and creates a receipt atomically", async () => {
    await asUser(candidate);
    await db.query(
      "insert into public.applications(job_id,candidate_id,cv_text_snapshot) values($1,$2,$3)",
      [
        job,
        candidate,
        "My actual experience and skills recorded in a sufficiently detailed CV.",
      ],
    );
    const result = await db.query<{ id: string; job_title_snapshot: string }>(
      "select id,job_title_snapshot from public.applications",
    );
    expect(result.rows[0].job_title_snapshot).toBe("Product Designer");
    expect(
      (await db.query("select event_type from public.application_events")).rows,
    ).toEqual([{ event_type: "received" }]);
    await expect(
      db.query("update public.applications set cv_text_snapshot = $1", [
        "Invented replacement CV",
      ]),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      db.query(
        "insert into public.applications(job_id,candidate_id,cv_text_snapshot) values($1,$2,$3)",
        [
          job,
          candidate,
          "A second copy of my real application attempting a duplicate submission.",
        ],
      ),
    ).rejects.toMatchObject({ code: "23505" });
    await asUser(otherCandidate);
    expect(
      (await db.query("select id from public.applications")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select id from public.application_events")).rows,
    ).toHaveLength(0);
  });

  it("blocks closed roles even when submission bypasses the website", async () => {
    await db.exec(`update public.jobs set status='closed' where id='${job}'`);
    await asUser(candidate);
    await expect(
      db.query(
        "insert into public.applications(job_id,candidate_id,cv_text_snapshot) values($1,$2,$3)",
        [
          job,
          candidate,
          "My real application text trying to submit against a role that is closed.",
        ],
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("keeps a candidate's applied-job history visible after the listing closes", async () => {
    await asUser(candidate);
    await db.query(
      "insert into public.applications(job_id,candidate_id,cv_text_snapshot) values($1,$2,$3)",
      [
        job,
        candidate,
        "My actual experience and skills recorded in a sufficiently detailed CV.",
      ],
    );
    await db.exec("reset role");
    await db.query("update public.jobs set status='closed' where id=$1", [job]);
    await asUser(candidate);
    expect(
      (
        await db.query(
          "select job_title_snapshot,company_snapshot from public.applications",
        )
      ).rows,
    ).toEqual([
      {
        job_title_snapshot: "Product Designer",
        company_snapshot: "Fern Studio",
      },
    ]);
    await asUser(otherCandidate);
    expect(
      (await db.query("select id from public.applications")).rows,
    ).toHaveLength(0);
  });

  it("preserves cents in hourly salary ranges", async () => {
    await asUser(employer);
    await db.query(
      "update public.jobs set salary_min=32.50,salary_max=38.75,salary_period='hour' where id=$1",
      [job],
    );
    const result = await db.query<{ salary_min: string; salary_max: string }>(
      "select salary_min,salary_max from public.jobs where id=$1",
      [job],
    );
    expect(Number(result.rows[0].salary_min)).toBe(32.5);
    expect(Number(result.rows[0].salary_max)).toBe(38.75);
  });

  it("records a first open only for the current hiring team", async () => {
    await asUser(candidate);
    const inserted = await db.query<{ id: string }>(
      "insert into public.applications(job_id,candidate_id,cv_text_snapshot) values($1,$2,$3) returning id",
      [
        job,
        candidate,
        "My actual experience and skills recorded in a sufficiently detailed CV.",
      ],
    );
    const application = inserted.rows[0].id;
    await expect(
      db.query("select public.open_application($1)", [application]),
    ).rejects.toMatchObject({ code: "42501" });
    await asUser(otherEmployer);
    await expect(
      db.query("select public.open_application($1)", [application]),
    ).rejects.toMatchObject({ code: "42501" });
    await asUser(employer);
    await db.query("select public.open_application($1)", [application]);
    await db.query("select public.open_application($1)", [application]);
    expect(
      (
        await db.query(
          "select event_type from public.application_events where event_type='opened'",
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (await db.query("select status from public.applications")).rows,
    ).toEqual([{ status: "opened" }]);
    await db.exec("reset role");
    await db.query("delete from public.organisation_members where user_id=$1", [
      employer,
    ]);
    await asUser(employer);
    await expect(
      db.query("select public.open_application($1)", [application]),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("enforces quota in the database and denies user-controlled refunds", async () => {
    await asUser(candidate);
    const reservation = await db.query<{ id: string }>(
      "select public.reserve_ai_usage('improve') as id",
    );
    expect(reservation.rows[0].id).toBeTruthy();
    await expect(
      db.query("select public.settle_ai_usage($1,false)", [
        reservation.rows[0].id,
      ]),
    ).rejects.toMatchObject({ code: "42501" });
    for (let i = 1; i < 100; i++)
      await db.query("select public.reserve_ai_usage('tailor')");
    await expect(
      db.query("select public.reserve_ai_usage('match')"),
    ).rejects.toMatchObject({ code: "P0001" });
    await asUser("", "service_role");
    await db.query("select public.settle_ai_usage($1,false)", [
      reservation.rows[0].id,
    ]);
    await asUser(candidate);
    await expect(
      db.query("select public.reserve_ai_usage('improve')"),
    ).resolves.toBeTruthy();
    await asUser(otherCandidate);
    await expect(
      db.query("select public.reserve_ai_usage('improve')"),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("serialises current billing snapshots and rejects expired workers and unknown mappings", async () => {
    await asUser("", "service_role");
    const acquired = await db.query<{ token: string }>(
      "select public.acquire_billing_lease($1) as token",
      [candidate],
    );
    const lease = acquired.rows[0].token;
    expect(lease).toBeTruthy();
    expect(
      (
        await db.query<{ token: string | null }>(
          "select public.acquire_billing_lease($1) as token",
          [candidate],
        )
      ).rows[0].token,
    ).toBeNull();
    const call = (customerId: string, status: string, created: number) =>
      db.query(
        `select public.apply_subscription_state($1,$2,'sub_candidate',$3,'price_careers_plus',now()-interval '1 day',now()+interval '29 days',false,$4,$5)`,
        [candidate, customerId, status, created, lease],
      );
    await call("cus_candidate", "canceled", 5);
    expect(
      (
        await db.query(
          "select status,last_event_created from public.subscriptions",
        )
      ).rows,
    ).toEqual([{ status: "canceled", last_event_created: 10 }]);
    await expect(call("cus_other", "active", 12)).rejects.toMatchObject({
      code: "42501",
    });
    await db.query(
      "update private.billing_leases set expires_at=now()-interval '1 second' where user_id=$1",
      [candidate],
    );
    const replacement = await db.query<{ token: string }>(
      "select public.acquire_billing_lease($1) as token",
      [candidate],
    );
    expect(replacement.rows[0].token).not.toBe(lease);
    await expect(call("cus_candidate", "active", 13)).rejects.toMatchObject({
      code: "42501",
    });
    // An expired worker's finaliser cannot release the replacement worker's lease.
    await db.query("select public.release_billing_lease($1,$2)", [
      candidate,
      lease,
    ]);
    expect(
      (
        await db.query(
          "select token from private.billing_leases where user_id=$1",
          [candidate],
        )
      ).rows,
    ).toEqual([{ token: replacement.rows[0].token }]);
    await expect(call("cus_candidate", "active", 13)).rejects.toMatchObject({
      code: "42501",
    });
    await asUser(candidate);
    await expect(call("cus_candidate", "active", 13)).rejects.toMatchObject({
      code: "42501",
    });
    await expect(
      db.query("select public.acquire_billing_lease($1)", [candidate]),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("authorises stage updates atomically and prevents candidate impersonation", async () => {
    await asUser(candidate);
    const inserted = await db.query<{ id: string }>(
      "insert into public.applications(job_id,candidate_id,cv_text_snapshot) values($1,$2,$3) returning id",
      [
        job,
        candidate,
        "My actual experience and skills recorded in a sufficiently detailed CV.",
      ],
    );
    const id = inserted.rows[0].id;
    const update = () =>
      db.query(
        "select public.update_application_stage($1,'interview','We would like to invite you to an interview.')",
        [id],
      );
    await expect(update()).rejects.toMatchObject({ code: "42501" });
    await asUser(otherEmployer);
    await expect(update()).rejects.toMatchObject({ code: "42501" });
    await asUser(employer);
    await update();
    expect(
      (await db.query("select status from public.applications")).rows,
    ).toEqual([{ status: "interview" }]);
    await asUser(candidate);
    expect(
      (
        await db.query(
          "select event_type,message from public.application_events where event_type='employer_update'",
        )
      ).rows,
    ).toEqual([
      {
        event_type: "employer_update",
        message: "We would like to invite you to an interview.",
      },
    ]);
  });

  it("revokes new employer CV access after withdrawal but preserves safe summaries", async () => {
    await asUser(candidate);
    const inserted = await db.query<{ id: string }>(
      "insert into public.applications(job_id,candidate_id,cv_text_snapshot) values($1,$2,$3) returning id",
      [
        job,
        candidate,
        "My actual experience and skills recorded in a sufficiently detailed CV.",
      ],
    );
    const id = inserted.rows[0].id;
    await db.query(
      "update public.applications set withdrawn_at=now() where id=$1",
      [id],
    );
    await asUser(employer);
    expect(
      (await db.query("select id,cv_text_snapshot from public.applications"))
        .rows,
    ).toHaveLength(0);
    await expect(
      db.query("select public.open_application($1)", [id]),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      db.query(
        "select public.update_application_stage($1,'interview','Please attend an interview next week.')",
        [id],
      ),
    ).rejects.toMatchObject({ code: "22023" });
    const summary = await db.query<{
      list: { id: string; withdrawn_at: string; cv_text_snapshot?: string }[];
    }>("select public.list_job_applications($1) as list", [job]);
    expect(summary.rows[0].list).toHaveLength(1);
    expect(summary.rows[0].list[0].id).toBe(id);
    expect(summary.rows[0].list[0].withdrawn_at).toBeTruthy();
    expect(summary.rows[0].list[0].cv_text_snapshot).toBeUndefined();
    await asUser(otherEmployer);
    await expect(
      db.query("select public.list_job_applications($1)", [job]),
    ).rejects.toMatchObject({ code: "42501" });
    await asUser(candidate);
    expect(
      (await db.query("select id from public.applications")).rows,
    ).toHaveLength(1);
  });

  it("derives direct response-report attribution and prevents duplicate title reviews", async () => {
    await asUser(candidate);
    const inserted = await db.query<{ id: string }>(
      "insert into public.applications(job_id,candidate_id,cv_text_snapshot) values($1,$2,$3) returning id",
      [
        job,
        candidate,
        "My actual experience and skills recorded in a sufficiently detailed CV.",
      ],
    );
    const id = inserted.rows[0].id;
    const submit = () =>
      db.query(
        "select public.submit_response_report($1,$2,$3,now(),false,null)",
        [id, otherOrg, "Untrusted supplied job reference"],
      );
    await submit();
    const reports = await db.query(
      "select organisation_id,job_reference,evidence_source,moderation_status from public.response_reports",
    );
    expect(reports.rows).toEqual([
      {
        organisation_id: org,
        job_reference: "Product Designer",
        evidence_source: "direct_application",
        moderation_status: "accepted",
      },
    ]);
    await expect(submit()).rejects.toMatchObject({ code: "23505" });
    expect(
      (await db.query("select id from public.response_reports")).rows,
    ).toHaveLength(1);
    await asUser(otherCandidate);
    await expect(submit()).rejects.toMatchObject({ code: "42501" });
    expect(
      (await db.query("select id from public.response_reports")).rows,
    ).toHaveLength(0);
  });
});

describe("independent trust review", () => {
  async function staff(role = "reviewer") {
    await db.exec("reset role");
    await db.query(
      "insert into private.staff_members(user_id,role) values($1,$2) on conflict(user_id) do update set role=excluded.role",
      [otherCandidate, role],
    );
    await asUser(otherCandidate);
  }
  it("requires independent evidence checks and never grants ownership from an ABN alone", async () => {
    await asUser(candidate);
    const request = await db.query<{ id: string }>(
      "select public.submit_employer_verification('Acacia Pty Ltd','12345678901','https://acacia.example','Director','Public business contact can independently confirm my authority to hire.') as id",
    );
    const id = request.rows[0].id;
    expect(
      (await db.query("select public.my_staff_role() as role")).rows[0],
    ).toEqual({ role: null });
    await expect(
      db.query(
        "insert into private.staff_members(user_id,role) values($1,'admin')",
        [candidate],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await db.exec("reset role");
    await db.query(
      "insert into private.staff_members(user_id,role) values($1,'reviewer')",
      [candidate],
    );
    await asUser(candidate);
    const version = (
      await db.query<{ v: string }>(
        "select updated_at::text as v from public.employer_verification_requests where id=$1",
        [id],
      )
    ).rows[0].v;
    await expect(
      db.query(
        "select public.review_trust_item('verification',$1,'approve','Identity and ownership independently confirmed',$2,true,true)",
        [id, version],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await staff();
    await expect(
      db.query(
        "select public.review_trust_item('verification',$1,'approve','Identity checked but ownership not confirmed',$2,true,false)",
        [id, version],
      ),
    ).rejects.toMatchObject({ code: "22023" });
    await db.query(
      "select public.review_trust_item('verification',$1,'approve','Registration and business-domain contact independently confirmed',$2,true,true)",
      [id, version],
    );
    await db.exec("reset role");
    expect(
      (
        await db.query(
          "select m.user_id,m.role from public.organisation_members m join public.organisations o on o.id=m.organisation_id where o.abn='12345678901'",
        )
      ).rows,
    ).toEqual([{ user_id: candidate, role: "owner" }]);
    expect(
      (
        await db.query(
          "select count(*)::int as n from private.moderation_audit",
        )
      ).rows[0],
    ).toEqual({ n: 1 });
    await asUser(employer);
    expect(
      (await db.query("select id from public.employer_verification_requests"))
        .rows,
    ).toHaveLength(0);
  });
  it("stages verified listings privately, notifies staff after owner consent and preserves quarantine", async () => {
    await staff();
    await asUser(employer);
    await db.query(
      "update public.jobs set status='closed',publication_requested=false where id=$1",
      [job],
    );
    const inserted = (
      await db.query<{ id: string }>(
        "insert into public.jobs(organisation_id,title,company,location,city,state,work_mode,employment_type,salary_min,salary_max,description,status,publication_requested) values($1,'Service Designer','Fern Studio','Melbourne VIC','Melbourne','VIC','Hybrid','Full time',100000,130000,'Design thoughtful services with the team.','draft',true) returning id",
        [org],
      )
    ).rows[0].id;
    expect(
      (
        await db.query(
          "select status,moderation_status,publication_requested from public.jobs where id=$1",
          [inserted],
        )
      ).rows[0],
    ).toEqual({
      status: "draft",
      moderation_status: "approved",
      publication_requested: false,
    });
    await db.query("select public.manage_launch_content('job',$1,'consent')", [
      inserted,
    ]);
    await db.exec("reset role");
    expect(
      (
        await db.query(
          "select id from public.notifications where path='/account?tab=admin'",
        )
      ).rows.length,
    ).toBeGreaterThan(0);
    await staff();
    const version = (
      await db.query<{ v: string }>(
        "select moderation_updated_at v from public.jobs where id=$1",
        [inserted],
      )
    ).rows[0].v;
    await db.query(
      "select public.review_trust_item('job',$1,'quarantine','Listing safety investigation pending',$2,false,false)",
      [inserted, version],
    );
    await asUser(employer);
    await db.query(
      "update public.jobs set title='Edited Service Designer',status='draft',publication_requested=true where id=$1",
      [inserted],
    );
    expect(
      (
        await db.query(
          "select status,moderation_status from public.jobs where id=$1",
          [inserted],
        )
      ).rows[0],
    ).toEqual({ status: "draft", moderation_status: "quarantined" });
    await asUser("", "anon");
    expect(
      (await db.query("select id from public.jobs where id=$1", [inserted]))
        .rows,
    ).toHaveLength(0);
  });

  it("respects an employer's explicit private-draft choice when editing a published role", async () => {
    await asUser(employer);
    await db.query(
      "update public.jobs set title='A revised Product Designer role',status='draft',publication_requested=false where id=$1",
      [job],
    );
    expect(
      (
        await db.query(
          "select status,publication_requested,moderation_status from public.jobs where id=$1",
          [job],
        )
      ).rows[0],
    ).toEqual({
      status: "draft",
      publication_requested: false,
      moderation_status: "approved",
    });
    await staff();
    expect(
      (
        await db.query<{ q: { items: unknown[] } }>(
          "select public.admin_queue('job') q",
        )
      ).rows[0].q.items,
    ).toHaveLength(0);
  });
  it("revokes every hiring document entry point when an administrator suspends a business", async () => {
    await asUser(candidate);
    const a = (
      await db.query<{ id: string }>(
        "insert into public.applications(job_id,candidate_id,cv_text_snapshot) values($1,$2,'My genuine skills and experience recorded in a sufficiently detailed application for this role.') returning id",
        [job, candidate],
      )
    ).rows[0].id;
    await staff();
    await expect(
      db.query(
        "select public.review_trust_item('organisation',$1,'suspend','Investigation confirmed a material concern',null)",
        [org],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await staff("admin");
    await db.query(
      "select public.review_trust_item('organisation',$1,'suspend','Investigation confirmed a material concern',null)",
      [org],
    );
    await asUser(employer);
    expect(
      (await db.query("select id from public.applications")).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select public.open_application($1)", [a]),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      db.query("select private.open_application_before_trust($1)", [a]),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      db.query("select public.list_job_applications($1)", [job]),
    ).rejects.toMatchObject({ code: "42501" });
    await staff("admin");
    await expect(
      db.query(
        "select public.review_trust_item('organisation',$1,'reinstate','Appeal resolved and verification repeated',null,false,false)",
        [org],
      ),
    ).rejects.toMatchObject({ code: "22023" });
    await db.query(
      "select public.review_trust_item('organisation',$1,'reinstate','Appeal resolved and verification repeated',null,true,true)",
      [org],
    );
    await db.exec("reset role");
    expect(
      (await db.query("select status from public.jobs where id=$1", [job]))
        .rows[0],
    ).toEqual({ status: "closed" });
    expect(
      (
        await db.query(
          "select is_verified,suspended_at from public.organisations where id=$1",
          [org],
        )
      ).rows[0],
    ).toEqual({ is_verified: true, suspended_at: null });
  });
  it("aggregates unique candidates, suppresses small samples and replaces silence with late responses", async () => {
    for (let i = 10; i < 20; i++) {
      const uid = `10000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
      await db.query("insert into auth.users(id) values($1)", [uid]);
      await db.query(
        "insert into public.response_reports(candidate_id,organisation_id,job_reference,application_date,response_received,response_date,evidence_source,moderation_status) values($1,$2,$3,now()-interval '4 months',$4,case when $4 then now()-interval '4 months'+interval '10 days' end,'external_application','accepted')",
        [uid, org, `Role ${i}`, i >= 16],
      );
    }
    let insight = (
      await db.query(
        "select eligible_reports,no_response_reports,median_response_days,is_unresponsive from public.organisation_response_insights where organisation_id=$1",
        [org],
      )
    ).rows[0];
    expect(insight).toEqual({
      eligible_reports: 10,
      no_response_reports: 6,
      median_response_days: null,
      is_unresponsive: true,
    });
    await db.query(
      "insert into public.response_reports(candidate_id,organisation_id,job_reference,application_date,response_received,evidence_source,moderation_status) values('10000000-0000-4000-8000-000000000010',$1,'Another role',now()-interval '5 months',false,'external_application','accepted')",
      [org],
    );
    expect(
      (
        await db.query(
          "select eligible_reports from public.organisation_response_insights where organisation_id=$1",
          [org],
        )
      ).rows[0],
    ).toEqual({ eligible_reports: 10 });
    await db.query(
      "update public.response_reports set response_received=true,response_date=application_date+interval '20 days' where job_reference='Role 10'",
    );
    insight = (
      await db.query(
        "select eligible_reports,no_response_reports,median_response_days,is_unresponsive from public.organisation_response_insights where organisation_id=$1",
        [org],
      )
    ).rows[0];
    expect(insight).toEqual({
      eligible_reports: 10,
      no_response_reports: 5,
      median_response_days: "10.0",
      is_unresponsive: false,
    });
    await db.query(
      "update public.response_reports set confirmed_at=now()-interval '31 days' where job_reference='Role 11'",
    );
    expect(
      (
        await db.query(
          "select eligible_reports,no_response_reports,median_response_days,is_unresponsive from public.organisation_response_insights where organisation_id=$1",
          [org],
        )
      ).rows[0],
    ).toEqual({
      eligible_reports: null,
      no_response_reports: null,
      median_response_days: null,
      is_unresponsive: false,
    });
    await asUser(candidate);
    await expect(
      db.query("select public.refresh_response_insights()"),
    ).rejects.toMatchObject({ code: "42501" });
  });
});

describe("consented saved-search outbox", () => {
  async function saved() {
    await asUser(candidate);
    const id = (
      await db.query<{ id: string }>(
        'select public.save_search(null,\'Design in Melbourne\',\'{"keyword":"designer","location":"Melbourne VIC"}\',true,\'daily\',true) as id',
      )
    ).rows[0].id;
    await db.exec("reset role");
    await db.exec(
      "insert into private.alert_settings(singleton,site_origin,unsubscribe_origin,sending_enabled) values(true,'https://westmere.example','https://ldmwqupidlgrkkjjpcvn.supabase.co/functions/v1/westmere-alerts/unsubscribe',true)",
    );
    await db.query(
      "update public.saved_searches set consent_at=now()-interval '2 days',next_run_at=now()-interval '1 minute' where id=$1",
      [id],
    );
    return id;
  }
  it("requires verified-email consent and prevents cross-user access or private CV filters", async () => {
    await asUser(candidate);
    await expect(
      db.query(
        "select public.save_search(null,'My search','{}',true,'daily',false)",
      ),
    ).rejects.toMatchObject({ code: "22023" });
    await expect(
      db.query(
        "select public.save_search(null,'My search','{\"cvText\":\"private CV\"}',false,'daily',false)",
      ),
    ).rejects.toMatchObject({ code: "22023" });
    const id = (
      await db.query<{ id: string }>(
        'select public.save_search(null,\'My search\',\'{"keyword":"designer","location":"Melbourne VIC"}\',false,\'weekly\',false) as id',
      )
    ).rows[0].id;
    await expect(
      db.query("select unsubscribe_token from public.saved_searches"),
    ).rejects.toMatchObject({ code: "42501" });
    await asUser(otherCandidate);
    expect(
      (await db.query("select id from public.saved_searches")).rows,
    ).toHaveLength(0);
    await expect(
      db.query(
        'select public.save_search($1,\'Hijacked search\',\'{"keyword":"designer","location":"Melbourne VIC"}\',true,\'daily\',true)',
        [id],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      db.query("select public.claim_job_alerts()"),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("deduplicates jobs transactionally and rechecks unsubscribe before a leased send", async () => {
    const id = await saved();
    await db.query("select public.prepare_job_alerts()");
    await db.query(
      "update public.saved_searches set next_run_at=now()-interval '1 day' where id=$1",
      [id],
    );
    await db.query("select public.prepare_job_alerts()");
    expect(
      (await db.query("select count(*)::int n from private.alert_outbox"))
        .rows[0],
    ).toEqual({ n: 1 });
    const claim = (
      await db.query<{ items: { id: string; lease_token: string }[] }>(
        "select public.claim_job_alerts() as items",
      )
    ).rows[0].items[0];
    expect(claim).toBeDefined();
    const token = (
      await db.query<{ token: string }>(
        "select unsubscribe_token::text token from public.saved_searches where id=$1",
        [id],
      )
    ).rows[0].token;
    await db.query("select public.unsubscribe_job_alert($1)", [token]);
    expect(
      (
        await db.query(
          "select public.freeze_job_alert($1,$2,'{}') as request",
          [claim.id, claim.lease_token],
        )
      ).rows[0],
    ).toEqual({ request: null });
    expect(
      (
        await db.query(
          "select alerts_enabled from public.saved_searches where id=$1",
          [id],
        )
      ).rows[0],
    ).toEqual({ alerts_enabled: false });
  });
  it("freezes identical provider requests, handles webhook races and suppresses complaints", async () => {
    await saved();
    await db.query("select public.prepare_job_alerts()");
    const item = (
      await db.query<{ q: { id: string; lease_token: string }[] }>(
        "select public.claim_job_alerts() q",
      )
    ).rows[0].q[0];
    const body = {
      from: "Westmere Careers <hello@westmere.com.au>",
      to: ["candidate@example.test"],
      subject: "A thoughtful opportunity",
    };
    await db.query("select public.freeze_job_alert($1,$2,$3)", [
      item.id,
      item.lease_token,
      JSON.stringify(body),
    ]);
    expect(
      (
        await db.query<{ body: unknown }>(
          'select public.freeze_job_alert($1,$2,\'{"subject":"different"}\') body',
          [item.id, item.lease_token],
        )
      ).rows[0].body,
    ).toEqual(body);
    await db.query(
      "select public.apply_alert_webhook('evt_delivery','email_123','email.delivered',now(),$1)",
      [item.id],
    );
    await db.query(
      "select public.settle_job_alert($1,$2,'accepted','email_123')",
      [item.id, item.lease_token],
    );
    await db.query(
      "select public.apply_alert_webhook('evt_old_sent','email_123','email.sent',now()-interval '1 minute',$1)",
      [item.id],
    );
    expect(
      (await db.query("select status from private.alert_outbox")).rows[0],
    ).toEqual({ status: "delivered" });
    await db.query(
      "select public.apply_alert_webhook('evt_complaint','email_123','email.complained',now(),$1)",
      [item.id],
    );
    await db.query(
      "select public.apply_alert_webhook('evt_complaint','email_123','email.complained',now(),$1)",
      [item.id],
    );
    expect(
      (
        await db.query(
          "select count(*)::int n from private.alert_webhook_events",
        )
      ).rows[0],
    ).toEqual({ n: 3 });
    expect(
      (await db.query("select alerts_enabled from public.saved_searches"))
        .rows[0],
    ).toEqual({ alerts_enabled: false });
    await asUser(candidate);
    await expect(
      db.query(
        'select public.save_search(null,\'Another search\',\'{"keyword":"designer","location":"Melbourne VIC"}\',true,\'daily\',true)',
      ),
    ).rejects.toMatchObject({ code: "P0001" });
  });
  it("stops retrying outside the provider idempotency window", async () => {
    await saved();
    await db.query("select public.prepare_job_alerts()");
    await db.exec(
      "update private.alert_outbox set first_attempt_at=now()-interval '24 hours'",
    );
    expect(
      (await db.query("select public.claim_job_alerts() q")).rows[0],
    ).toEqual({ q: [] });
    expect(
      (await db.query("select status from private.alert_outbox")).rows[0],
    ).toEqual({ status: "ambiguous" });
  });
  it("preserves preview allowance across search deletion and isolates it per user", async () => {
    let id = await saved();
    await asUser(candidate);
    for (let i = 0; i < 3; i++) {
      if (i)
        id = (
          await db.query<{ id: string }>(
            'select public.save_search(null,\'Disposable preview\',\'{"keyword":"designer","location":"Melbourne VIC"}\',true,\'daily\',true) id',
          )
        ).rows[0].id;
      await db.query("select public.preview_search_alert($1)", [id]);
      await db.query("select public.remove_saved_search($1)", [id]);
      await db.exec("reset role");
      await db.query(
        "update private.alert_preview_allowance set recent_requests=(select array_agg(t-interval '16 minutes') from unnest(recent_requests) t) where user_id=$1",
        [candidate],
      );
      await asUser(candidate);
    }
    const next = (
      await db.query<{ id: string }>(
        'select public.save_search(null,\'Another preview\',\'{"keyword":"designer","location":"Melbourne VIC"}\',true,\'daily\',true) id',
      )
    ).rows[0].id;
    await db.query("select public.preview_search_alert($1)", [next]);
    await expect(
      db.query("select public.preview_search_alert($1)", [next]),
    ).rejects.toMatchObject({ code: "P0001" });
    await expect(
      db.query("select * from private.alert_preview_allowance"),
    ).rejects.toMatchObject({ code: "42501" });
    await asUser(otherCandidate);
    const other = (
      await db.query<{ id: string }>(
        'select public.save_search(null,\'Other account\',\'{"keyword":"designer","location":"Melbourne VIC"}\',true,\'daily\',true) id',
      )
    ).rows[0].id;
    await db.query("select public.preview_search_alert($1)", [other]);
    await db.exec("reset role");
    expect(
      (
        await db.query(
          "select cardinality(recent_requests) n from private.alert_preview_allowance where user_id=$1",
          [candidate],
        )
      ).rows[0],
    ).toEqual({ n: 4 });
    expect(
      (
        await db.query(
          "select count(*)::int n from private.alert_outbox where user_id=$1",
          [candidate],
        )
      ).rows[0],
    ).toEqual({ n: 1 });
  });
});

describe("candidate and employer release", () => {
  beforeEach(async () => {
    await db.exec(
      "insert into private.alert_settings(singleton,site_origin,unsubscribe_origin,sending_enabled) values(true,'https://westmere.example','https://ldmwqupidlgrkkjjpcvn.supabase.co/functions/v1/westmere-alerts/unsubscribe',false)",
    );
  });
  it("isolates private CV history and rejects another candidate’s selected CV", async () => {
    await db.exec(
      `insert into public.candidate_cvs(id,user_id,filename,storage_path,media_type,bytes,extracted_text) values('50000000-0000-4000-8000-000000000001','${candidate}','CV.pdf','own/cv.pdf','application/pdf',100,'A sufficiently detailed CV with real supported skills and experience.'),('50000000-0000-4000-8000-000000000002','${otherCandidate}','Other.docx','other/cv.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document',100,'Another sufficiently detailed CV, private to the other candidate account.');`,
    );
    await asUser(candidate);
    expect(
      (await db.query("select filename from public.candidate_cvs")).rows,
    ).toEqual([{ filename: "CV.pdf" }]);
    await expect(
      db.query("update public.profiles set active_cv_id=$1 where id=$2", [
        "50000000-0000-4000-8000-000000000002",
        candidate,
      ]),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      db.query(
        "insert into public.candidate_cvs(user_id,filename,storage_path,media_type,bytes,extracted_text) values($1,'Fake.pdf','x','application/pdf',100,repeat('x',60))",
        [candidate],
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("requires sign-in and ownership for server-side saved roles", async () => {
    await asUser(candidate);
    await db.query(
      "insert into public.saved_jobs(user_id,job_id) values($1,$2)",
      [candidate, job],
    );
    await asUser(otherCandidate);
    expect(
      (await db.query("select * from public.saved_jobs")).rows,
    ).toHaveLength(0);
    await expect(
      db.query("insert into public.saved_jobs(user_id,job_id) values($1,$2)", [
        candidate,
        job,
      ]),
    ).rejects.toMatchObject({ code: "42501" });
    await asUser("", "anon");
    await expect(
      db.query("select * from public.saved_jobs"),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("queues a welcome once after a new account adds a name", async () => {
    await asUser(candidate);
    await db.query("update public.profiles set full_name='Alex' where id=$1", [
      candidate,
    ]);
    await db.query(
      "update public.profiles set full_name='Alex Candidate' where id=$1",
      [candidate],
    );
    await db.exec("reset role");
    expect(
      (
        await db.query(
          "select count(*)::int as count from private.alert_outbox where user_id=$1 and event_key='welcome'",
          [candidate],
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
  });
  it("records candidate activity emails and groups employer site updates without employer email", async () => {
    await asUser(candidate);
    await db.query(
      "insert into public.applications(job_id,candidate_id,cv_text_snapshot) values($1,$2,repeat('Supported experience. ',5))",
      [job, candidate],
    );
    await db.exec("reset role");
    expect(
      (
        await db.query(
          "select count(*)::int as count from public.notifications where user_id=$1 and event_key not like 'billing:%'",
          [candidate],
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
    expect(
      (
        await db.query(
          "select count(*)::int as count from private.alert_outbox where user_id=$1",
          [candidate],
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
    expect(
      (
        await db.query(
          "select count(*)::int as count from private.alert_outbox where user_id=$1",
          [employer],
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
    await asUser(otherCandidate);
    await db.query(
      "insert into public.applications(job_id,candidate_id,cv_text_snapshot) values($1,$2,repeat('Other real experience. ',5))",
      [job, otherCandidate],
    );
    await asUser(employer);
    expect(
      (
        await db.query(
          "select title from public.notifications where event_key not like 'billing:%'",
        )
      ).rows,
    ).toEqual([{ title: "New applications to review" }]);
    await expect(
      db.query("update public.notifications set user_id=$1", [candidate]),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("supports email opt-out while retaining site receipts", async () => {
    await asUser(candidate);
    await db.query(
      "update public.profiles set application_email_enabled=false where id=$1",
      [candidate],
    );
    await db.query(
      "insert into public.applications(job_id,candidate_id,cv_text_snapshot) values($1,$2,repeat('Supported experience. ',5))",
      [job, candidate],
    );
    await db.exec("reset role");
    expect(
      (
        await db.query(
          "select count(*)::int as count from private.alert_outbox where user_id=$1",
          [candidate],
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
    expect(
      (
        await db.query(
          "select count(*)::int as count from public.notifications where user_id=$1 and event_key not like 'billing:%'",
          [candidate],
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
  });
  it("keeps sample vacancies separate and reserves access for the protected administrator", async () => {
    await db.query(
      "insert into private.sample_employer_invites(email) values('candidate@example.test')",
    );
    await asUser(candidate);
    expect(
      (await db.query("select public.my_sample_workspace() as allowed")).rows,
    ).toEqual([{ allowed: false }]);
    await asUser(protectedOwner);
    expect(
      (await db.query("select public.my_sample_workspace() as allowed")).rows,
    ).toEqual([{ allowed: true }]);
    await db.query(
      "insert into public.sample_jobs(user_id,title,description) values($1,'Sample role',repeat('Synthetic only. ',5))",
      [protectedOwner],
    );
    await asUser(otherCandidate);
    expect(
      (await db.query("select * from public.sample_jobs")).rows,
    ).toHaveLength(0);
    await expect(
      db.query(
        "insert into public.sample_jobs(user_id,title,description) values($1,'Forged role',repeat('Synthetic only. ',5))",
        [otherCandidate],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await asUser("", "anon");
    expect((await db.query("select title from public.jobs")).rows).toEqual([
      { title: "Product Designer" },
    ]);
  });
});

describe("notification delivery controls", () => {
  beforeEach(async () => {
    await db.exec(
      "insert into private.alert_settings(singleton,site_origin,unsubscribe_origin,sending_enabled) values(true,'https://westmere.example','https://ldmwqupidlgrkkjjpcvn.supabase.co/functions/v1/westmere-alerts/unsubscribe',true)",
    );
  });
  it("notifies one first view, an interview update and a vacancy closure", async () => {
    await asUser(candidate);
    const inserted = await db.query<{ id: string }>(
      "insert into public.applications(job_id,candidate_id,cv_text_snapshot) values($1,$2,repeat('Supported experience. ',5)) returning id",
      [job, candidate],
    );
    const id = inserted.rows[0].id;
    await asUser(employer);
    await db.query("select public.open_application($1)", [id]);
    await db.query("select public.open_application($1)", [id]);
    await db.query(
      "select public.update_application_stage($1,'interview','We would like to arrange an interview with you.')",
      [id],
    );
    await db.query("update public.jobs set status='closed' where id=$1", [job]);
    await asUser(candidate);
    const notices = await db.query<{ title: string }>(
      "select title from public.notifications order by created_at,id",
    );
    expect(
      notices.rows.filter((x) => x.title === "Application opened"),
    ).toHaveLength(1);
    expect(notices.rows.map((x) => x.title)).toEqual(
      expect.arrayContaining([
        "Application received",
        "Interview selection update",
        "Vacancy closed",
      ]),
    );
    await db.exec("reset role");
    expect(
      (
        await db.query(
          "select count(*)::int as count from private.alert_outbox where user_id=$1",
          [candidate],
        )
      ).rows,
    ).toEqual([{ count: 4 }]);
  });
  it("rate-limits explicitly requested owner sample email previews and denies ordinary accounts", async () => {
    await db.exec(
      `insert into public.sample_jobs(id,user_id,title,description) values('60000000-0000-4000-8000-000000000001','${protectedOwner}','Private sample role',repeat('Synthetic role. ',5));insert into public.sample_applications(id,job_id,user_id) values('70000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','${protectedOwner}');`,
    );
    await asUser(protectedOwner);
    for (let i = 0; i < 3; i++)
      await db.query(
        "select public.request_sample_notification('70000000-0000-4000-8000-000000000001',true)",
      );
    await expect(
      db.query(
        "select public.request_sample_notification('70000000-0000-4000-8000-000000000001',true)",
      ),
    ).rejects.toMatchObject({ code: "P0001" });
    await db.query(
      "select public.request_sample_notification('70000000-0000-4000-8000-000000000001',false)",
    );
    await asUser(otherCandidate);
    await expect(
      db.query(
        "select public.request_sample_notification('70000000-0000-4000-8000-000000000001',true)",
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("returns a listing to review atomically when a supporting document changes", async () => {
    await db.query(
      "insert into public.listing_documents(job_id,uploaded_by,filename,storage_path,media_type,bytes) values($1,$2,'Role pack.pdf','employer/role-pack.pdf','application/pdf',100)",
      [job, employer],
    );
    expect(
      (
        await db.query(
          "select status,moderation_status from public.jobs where id=$1",
          [job],
        )
      ).rows,
    ).toEqual([{ status: "draft", moderation_status: "pending" }]);
    await asUser("", "anon");
    expect(
      (await db.query("select id from public.listing_documents")).rows,
    ).toHaveLength(0);
  });
});

describe("bounded upload processing", () => {
  it("allows one server-reserved upload at a time and keeps leases private", async () => {
    await asUser(candidate);
    await expect(
      db.query("select public.reserve_document_upload($1)", [candidate]),
    ).rejects.toMatchObject({ code: "42501" });
    await asUser(candidate, "service_role");
    const r = await db.query<{ token: string }>(
      "select public.reserve_document_upload($1) as token",
      [candidate],
    );
    await expect(
      db.query("select public.reserve_document_upload($1)", [candidate]),
    ).rejects.toMatchObject({ code: "P0001" });
    await db.query(
      "select public.release_document_upload($1,'80000000-0000-4000-8000-000000000001')",
      [candidate],
    );
    await expect(
      db.query("select public.reserve_document_upload($1)", [candidate]),
    ).rejects.toMatchObject({ code: "P0001" });
    await db.query("select public.release_document_upload($1,$2)", [
      candidate,
      r.rows[0].token,
    ]);
    expect(
      (
        await db.query("select public.reserve_document_upload($1) as token", [
          candidate,
        ])
      ).rows[0],
    ).toHaveProperty("token");
  });
});

describe("business account and discovery boundaries", () => {
  it("does not allow a user to self-award business identity or paid plans", async () => {
    await asUser(candidate);
    await expect(
      db.query(
        "insert into public.business_accounts(user_id,kind,trading_name,terms_version,terms_sha256) values($1,'employer','Example','v1',$2)",
        [candidate, "a".repeat(64)],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      db.query(
        "insert into public.employer_plans(organisation_id,tier,order_reference,starts_at,ends_at) values($1,'growth','order-test',now(),now()+interval '1 month')",
        [org],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await db.exec("reset role");
    await db.query(
      "insert into public.business_accounts(user_id,kind,trading_name,terms_version,terms_sha256) values($1,'employer','Example','v1',$2)",
      [candidate, "a".repeat(64)],
    );
    await db.query(
      "update public.business_accounts set terms_version='v2',terms_sha256=$2 where user_id=$1",
      [candidate, "b".repeat(64)],
    );
    expect(
      (
        await db.query(
          "select count(*)::int as n from private.business_agreements where user_id=$1",
          [candidate],
        )
      ).rows,
    ).toEqual([{ n: 2 }]);
    await asUser(otherCandidate);
    expect(
      (await db.query("select * from public.business_accounts")).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select * from private.business_agreements"),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("requires public verification contacts and contact permission", async () => {
    await asUser(candidate);
    const args = [
      null,
      "New Example",
      "12345678901",
      "https://example.test",
      "Director",
      "Authority can be confirmed with the public HR contact.",
      "https://www.linkedin.com/company/example/",
      "hr@example.test",
      "+61 3 9000 0000",
      "https://example.test/contact",
      false,
    ];
    await expect(
      db.query(
        "select public.submit_business_verification($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        args,
      ),
    ).rejects.toThrow();
    args[10] = true;
    const missing = [...args];
    missing[6] = null;
    await expect(
      db.query(
        "select public.submit_business_verification($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        missing,
      ),
    ).rejects.toThrow();
    await db.query(
      "select public.submit_business_verification($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
      args,
    );
    const contacts = await db.query<{
      hr_email: string;
      contact_permission_at: string;
    }>(
      "select hr_email,contact_permission_at from public.employer_verification_requests",
    );
    expect(contacts.rows[0].hr_email).toBe("hr@example.test");
    expect(contacts.rows[0].contact_permission_at).toBeTruthy();
    await asUser(otherCandidate);
    expect(
      (
        await db.query(
          "select hr_email from public.employer_verification_requests",
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("keeps discovery aggregates server-only, includes small breakdowns and rate limits events", async () => {
    await asUser(candidate);
    await expect(
      db.query(
        "select public.record_discovery($1,'search','VIC','design',$2)",
        [[org], "a".repeat(64)],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      db.query("select public.read_discovery($1,30)", [org]),
    ).rejects.toMatchObject({ code: "42501" });
    await asUser(candidate, "service_role");
    for (let i = 0; i < 4; i++)
      await db.query(
        "select public.record_discovery($1,'search','VIC','design',$2)",
        [[org], "a".repeat(64)],
      );
    let report = (
      await db.query<{ d: { regions: unknown[]; keywords: unknown[] } }>(
        "select public.read_discovery($1,30) as d",
        [org],
      )
    ).rows[0].d;
    expect(report.regions).toEqual([
      { region: "VIC", count: 4, searches: 4, listing: 0, profile: 0 },
    ]);
    expect(report.keywords).toEqual([
      { keyword: "design", count: 4, topRegion: "VIC", topRegionCount: 4 },
    ]);
    await db.query(
      "select public.record_discovery($1,'search','VIC','design',$2)",
      [[org], "a".repeat(64)],
    );
    report = (
      await db.query<{ d: { regions: unknown[]; keywords: unknown[] } }>(
        "select public.read_discovery($1,30) as d",
        [org],
      )
    ).rows[0].d;
    expect(report.regions).toEqual([
      { region: "VIC", count: 5, searches: 5, listing: 0, profile: 0 },
    ]);
    expect(report.keywords).toEqual([
      { keyword: "design", count: 5, topRegion: "VIC", topRegionCount: 5 },
    ]);
    await db.exec("reset role");
    await db.query(
      "update private.discovery_rate set events=120 where network=$1",
      ["a".repeat(64)],
    );
    await asUser(candidate, "service_role");
    await db.query(
      "select public.record_discovery($1,'search','VIC','design',$2)",
      [[org], "a".repeat(64)],
    );
    expect(
      (
        await db.query<{ d: { totals: { count: number }[] } }>(
          "select public.read_discovery($1,30) as d",
          [org],
        )
      ).rows[0].d.totals[0].count,
    ).toBe(5);
  });
  it("honours employer submission preferences without dropping the candidate receipt", async () => {
    await asUser(employer);
    await db.query(
      "insert into public.employer_notification_preferences(user_id,submissions) values($1,false)",
      [employer],
    );
    await asUser(candidate);
    await db.query(
      "insert into public.applications(job_id,candidate_id,cv_text_snapshot) values($1,$2,repeat('Supported experience. ',5))",
      [job, candidate],
    );
    expect(
      (
        await db.query(
          "select title from public.notifications where event_key not like 'billing:%'",
        )
      ).rows,
    ).toEqual([{ title: "Application received" }]);
    await asUser(employer);
    expect(
      (
        await db.query(
          "select title from public.notifications where event_key not like 'billing:%'",
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      db.query(
        "update public.employer_notification_preferences set follow_up_days=0",
      ),
    ).rejects.toThrow();
  });
});

it("keeps employer reminder delivery idempotent and rechecks preference changes before sending", async () => {
  await db.exec("reset role");
  await db.query(
    "insert into private.alert_settings(singleton,site_origin,unsubscribe_origin,sending_enabled) values(true,'https://westmere.example','https://ldmwqupidlgrkkjjpcvn.supabase.co/functions/v1/westmere-alerts/unsubscribe',true)",
  );
  await db.query(
    "insert into public.employer_notification_preferences(user_id,email_enabled) values($1,true)",
    [employer],
  );
  await db.query(
    "update public.jobs set expires_at=now()+interval '2 days' where id=$1",
    [job],
  );
  await asUser(employer, "service_role");
  await db.query("select public.queue_employer_reminders()");
  await db.query("select public.queue_employer_reminders()");
  await db.exec("reset role");
  expect(
    (
      await db.query(
        "select count(*)::int as n from public.notifications where user_id=$1 and event_key not like 'billing:%' and event_key like 'closing:%'",
        [employer],
      )
    ).rows,
  ).toEqual([{ n: 1 }]);
  expect(
    (
      await db.query(
        "select count(*)::int as n from private.alert_outbox where user_id=$1 and event_key like 'closing:%'",
        [employer],
      )
    ).rows,
  ).toEqual([{ n: 1 }]);
  await asUser(employer);
  await db.query(
    "update public.employer_notification_preferences set closing_reminders=false where user_id=$1",
    [employer],
  );
  await asUser(employer, "service_role");
  expect(
    (await db.query<{ q: unknown[] }>("select public.claim_job_alerts() q"))
      .rows[0].q,
  ).toEqual([]);
  await db.exec("reset role");
  expect(
    (
      await db.query(
        "select status from private.alert_outbox where user_id=$1",
        [employer],
      )
    ).rows,
  ).toEqual([{ status: "canceled" }]);
});
it("queues a verification outcome email even when candidate activity email is off", async () => {
  await db.exec("reset role");
  await db.query(
    "insert into private.alert_settings(singleton,site_origin,unsubscribe_origin,sending_enabled) values(true,'https://westmere.example','https://ldmwqupidlgrkkjjpcvn.supabase.co/functions/v1/westmere-alerts/unsubscribe',true)",
  );
  await db.query(
    "insert into private.staff_members(user_id,role) values($1,'reviewer')",
    [otherEmployer],
  );
  await asUser(candidate);
  await db.query(
    "update public.profiles set application_email_enabled=false where id=$1",
    [candidate],
  );
  const result = await db.query<{ id: string }>(
    "select public.submit_business_verification(null,'New Example','12345678901','https://example.test','Director','Authority confirmed using the public HR contact details.','https://www.linkedin.com/company/example/','hr@example.test','+61 3 9000 0000','https://example.test/contact',true) id",
  );
  const id = result.rows[0].id;
  const version = (
    await db.query<{ updated_at: string }>(
      "select updated_at from public.employer_verification_requests where id=$1",
      [id],
    )
  ).rows[0].updated_at;
  await asUser(otherEmployer);
  await db.query(
    "select public.review_trust_item('verification',$1,'approve','Registration and public HR authority independently checked',$2,true,true)",
    [id, version],
  );
  await asUser(candidate);
  expect(
    (
      await db.query(
        "select title from public.notifications where event_key like 'business-verified:%'",
      )
    ).rows,
  ).toEqual([{ title: "Your business is verified" }]);
  await asUser(candidate, "service_role");
  const emails = (
    await db.query<{ q: { snapshot: { path: string } }[] }>(
      "select public.claim_job_alerts() q",
    )
  ).rows[0].q;
  expect(emails).toHaveLength(1);
  expect(emails[0].snapshot.path).toBe("/account?tab=dashboard");
});

describe("sandbox administration and measured discovery", () => {
  it("refuses historical test assignments to ordinary accounts, including from a testing operator", async () => {
    await db.exec(
      `insert into private.staff_members(user_id,role) values('${otherCandidate}','reviewer');insert into private.testing_operators(user_id) values('${otherCandidate}');`,
    );
    await asUser(candidate);
    await expect(
      db.query(
        "select public.manage_test_entitlement('candidate@example.test','careers_plus',7,'Dedicated synthetic account',true)",
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await asUser(otherCandidate);
    await expect(
      db.query(
        "select public.manage_test_entitlement('candidate@example.test','careers_plus',7,'Dedicated synthetic account',false)",
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      db.query(
        "select public.manage_test_entitlement('candidate@example.test','careers_plus',7,'Dedicated synthetic account',true)",
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await asUser(candidate);
    const access = (
      await db.query<{ t: { tier: string } }>(
        "select public.my_testing_access() t",
      )
    ).rows[0].t;
    expect(access).toBeNull();
    await db.exec("reset role");
    expect(
      (
        await db.query(
          "select stripe_subscription_id from public.subscriptions where user_id=$1",
          [candidate],
        )
      ).rows[0],
    ).toEqual({ stripe_subscription_id: "sub_candidate" });
    await db.query(
      "update private.test_entitlements set expires_at=now()-interval '1 second' where user_id=$1",
      [candidate],
    );
    await asUser(candidate);
    expect(
      (await db.query("select public.my_testing_access() t")).rows[0],
    ).toEqual({ t: null });
  });
  it("does not grant business authority or allow an agency test tier on an employer account", async () => {
    await db.exec(
      `insert into private.staff_members(user_id,role) values('${otherCandidate}','reviewer');insert into private.testing_operators(user_id) values('${otherCandidate}');`,
    );
    await asUser(otherCandidate);
    await expect(
      db.query(
        "select public.manage_test_entitlement('employer@example.test','agency_growth',7,'Dedicated synthetic account',true)",
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        "select public.manage_test_entitlement('employer@example.test','careers_plus',7,'Dedicated synthetic account',true)",
      ),
    ).rejects.toThrow();
  });
  it("deduplicates views and includes single keyword-state appearances", async () => {
    await asUser("", "service_role");
    const view = "40000000-0000-4000-8000-000000000001";
    for (let i = 0; i < 5; i++)
      await db.query(
        "select public.record_discovery_view($1,array[$2::uuid],'search','VIC','designer',$3)",
        [
          i === 0
            ? view
            : `40000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
          org,
          "a".repeat(64),
        ],
      );
    await db.query(
      "select public.record_discovery_view($1,array[$2::uuid],'search','VIC','designer',$3)",
      [view, org, "b".repeat(64)],
    );
    await db.query(
      "select public.record_discovery_view('40000000-0000-4000-8000-000000000010',array[$1::uuid],'search','NSW','designer',$2)",
      [org, "c".repeat(64)],
    );
    const data = (
      await db.query<{ d: { keywordRegions: unknown[] } }>(
        "select public.read_discovery_by_region($1,30,null) d",
        [org],
      )
    ).rows[0].d;
    expect(data.keywordRegions).toEqual([
      { keyword: "designer", region: "VIC", count: 5 },
      { keyword: "designer", region: "NSW", count: 1 },
    ]);
    await asUser(candidate);
    await expect(
      db.query(
        "select public.record_discovery_view($1,array[$2::uuid],'search','VIC','designer',$3)",
        [view, org, "b".repeat(64)],
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
});

describe("business billing fencing", () => {
  it("requires the current trusted customer mapping and a live service-only billing lease", async () => {
    await db.query(
      "insert into public.organisation_billing_accounts(organisation_id,billing_user_id,stripe_customer_id,audience) values($1,$2,'cus_business','employer')",
      [org, employer],
    );
    await asUser(employer, "service_role");
    const token = (
      await db.query<{ t: string }>(
        "select public.acquire_billing_lease($1) t",
        [employer],
      )
    ).rows[0].t;
    const apply = () =>
      db.query(
        "select public.apply_business_subscription($1,'cus_business','sub_business','price_sandbox','growth','active',now(),now()+interval '1 month',false,$2,$3)",
        [org, employer, token],
      );
    await apply();
    await db.exec("reset role");
    expect(
      (
        await db.query(
          "select tier from public.business_subscriptions where organisation_id=$1",
          [org],
        )
      ).rows[0],
    ).toEqual({ tier: "growth" });
    await db.query(
      "update private.billing_leases set expires_at=now()-interval '1 second' where user_id=$1",
      [employer],
    );
    await asUser(employer, "service_role");
    await expect(apply()).rejects.toMatchObject({ code: "42501" });
    await asUser(otherEmployer);
    expect(
      (
        await db.query(
          "select organisation_id from public.business_subscriptions",
        )
      ).rows,
    ).toHaveLength(0);
    await expect(apply()).rejects.toMatchObject({ code: "42501" });
  });
});

describe("launch listing and candidate workflows", () => {
  async function applicationFor(id: string) {
    await asUser(id);
    return (
      await db.query<{ id: string }>(
        "insert into public.applications(job_id,candidate_id,cv_text_snapshot) values($1,$2,repeat('Relevant career experience. ',4)) returning id",
        [job, id],
      )
    ).rows[0].id;
  }
  it("enforces the active free listing quota and holds a closed role’s renewal for release", async () => {
    await asUser(employer);
    const second = (
      await db.query<{ id: string }>(
        "insert into public.jobs(organisation_id,title,company,location,city,state,work_mode,employment_type,salary_min,salary_max,description,status) values($1,'Second role','Fern Studio','Melbourne VIC','Melbourne','VIC','Hybrid','Full time',100000,130000,repeat('A useful description ',3),'draft') returning id",
        [org],
      )
    ).rows[0].id;
    await expect(
      db.query(
        "update public.jobs set publication_requested=true where id=$1",
        [second],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await db.query(
      "update public.jobs set status='closed',publication_requested=false where id=$1",
      [job],
    );
    await db.query(
      "update public.jobs set publication_requested=true where id=$1",
      [second],
    );
    const renewal = await db.query<{ renew_listing: { status: string } }>(
      "select public.renew_listing($1)",
      [job],
    );
    expect(renewal.rows[0].renew_listing.status).toBe("draft");
  });
  it("renews the same job for forty days and retains applications, original publication and audit attribution", async () => {
    await applicationFor(candidate);
    await asUser(employer);
    const before = (
      await db.query<{ published_at: string }>(
        "select published_at from public.jobs where id=$1",
        [job],
      )
    ).rows[0];
    await db.query("select public.renew_listing($1)", [job]);
    await db.query("select public.renew_listing($1)", [job]);
    const current = (
      await db.query<{ published_at: string; days: number }>(
        "select published_at,extract(epoch from expires_at-now())/86400 days from public.jobs where id=$1",
        [job],
      )
    ).rows[0];
    expect(current.published_at).toEqual(before.published_at);
    expect(Number(current.days)).toBeGreaterThan(39.99);
    const overview = (
      await db.query<{
        data: {
          id: string;
          applications: number;
          activity: { action: string; actor_email: string }[];
        }[];
      }>("select public.role_overview() data")
    ).rows[0].data.find((x) => x.id === job)!;
    expect(overview.applications).toBe(1);
    expect(
      overview.activity.filter((a) => a.action === "renewed"),
    ).toHaveLength(2);
    expect(
      overview.activity.find((a) => a.action === "renewed")?.actor_email,
    ).toBe("employer@example.test");
  });
  it("archives elapsed listings without deleting their applications", async () => {
    await applicationFor(candidate);
    await db.exec("reset role");
    await db.exec(
      "alter table public.jobs disable trigger zz_listing_lifecycle",
    );
    await db.query(
      "update public.jobs set expires_at=now()-interval '1 minute' where id=$1",
      [job],
    );
    await db.exec(
      "alter table public.jobs enable trigger zz_listing_lifecycle",
    );
    await db.query("select private.archive_expired_listings()");
    expect(
      (await db.query("select status from public.jobs where id=$1", [job]))
        .rows[0],
    ).toEqual({ status: "closed" });
    expect(
      (
        await db.query("select id from public.applications where job_id=$1", [
          job,
        ])
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          "select action from private.job_activity where job_id=$1 and action='expired'",
          [job],
        )
      ).rows,
    ).toHaveLength(1);
  });
  it("closes applications and notifies both selected and non-selected candidates once", async () => {
    const chosen = await applicationFor(candidate),
      other = await applicationFor(otherCandidate);
    await asUser(employer);
    await db.query(
      "select public.finalise_candidate_pool($1,$2::uuid[],$3::uuid[])",
      [job, [chosen], [chosen, other]],
    );
    expect(
      (
        await db.query(
          "select id,status from public.applications order by candidate_id",
        )
      ).rows,
    ).toEqual([
      { id: chosen, status: "interview" },
      { id: other, status: "not_proceeding" },
    ]);
    await db.query(
      "select public.finalise_candidate_pool($1,$2::uuid[],$3::uuid[])",
      [job, [chosen], [chosen, other]],
    );
    await asUser(otherCandidate);
    const events = (
      await db.query<{ event_type: string; message: string }>(
        "select event_type,message from public.application_events where application_id=$1",
        [other],
      )
    ).rows;
    expect(events.filter((e) => e.event_type === "decision")).toHaveLength(1);
    expect(events.some((e) => e.message.includes("not been selected"))).toBe(
      true,
    );
    expect(
      (
        await db.query(
          "select id from public.notifications where user_id=$1 and title='Application decision'",
          [otherCandidate],
        )
      ).rows.length,
    ).toBeGreaterThan(0);
  });
  it("prevents a recruiter for another business from changing a candidate pool", async () => {
    await applicationFor(candidate);
    await asUser(otherEmployer);
    await expect(
      db.query(
        "select public.finalise_candidate_pool($1,'{}'::uuid[],'{}'::uuid[])",
        [job],
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("requires the exact company name and owner and archives its public presence", async () => {
    await applicationFor(candidate);
    await asUser(otherEmployer);
    await expect(
      db.query("select public.remove_company($1,'Fern Studio')", [org]),
    ).rejects.toMatchObject({ code: "42501" });
    await asUser(employer);
    await expect(
      db.query("select public.remove_company($1,'fern studio')", [org]),
    ).rejects.toMatchObject({ code: "22023" });
    await db.query("select public.remove_company($1,'Fern Studio')", [org]);
    await asUser("", "anon");
    expect(
      (await db.query("select id from public.organisations where id=$1", [org]))
        .rows,
    ).toEqual([]);
    expect(
      (await db.query("select id from public.jobs where id=$1", [job])).rows,
    ).toEqual([]);
    await asUser(candidate);
    expect(
      (
        await db.query("select id from public.applications where job_id=$1", [
          job,
        ])
      ).rows,
    ).toHaveLength(1);
  });
  it("protects private documents and creates submission plus document metadata atomically", async () => {
    await asUser(candidate);
    await expect(
      db.query("select * from public.application_documents"),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      db.query(
        "select public.submit_application_material(gen_random_uuid(),$1,$2,repeat('CV ',30),'','{}',null)",
        [candidate, job],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await asUser("", "service_role");
    const a = (
      await db.query<{ a: { id: string } }>(
        "select public.submit_application_material(gen_random_uuid(),$1,$2,repeat('CV ',30),'Cover letter','{}',$3::jsonb) a",
        [
          candidate,
          job,
          JSON.stringify({
            filename: "CV.pdf",
            path: "candidate/submission.pdf",
            mediaType: "application/pdf",
            bytes: 200,
          }),
        ],
      )
    ).rows[0].a;
    expect(
      (
        await db.query(
          "select filename from public.application_documents where application_id=$1",
          [a.id],
        )
      ).rows,
    ).toEqual([{ filename: "CV.pdf" }]);
  });
  it("exposes shared actor-attributed admin history only to currently enabled staff", async () => {
    await db.exec(
      `insert into private.staff_members(user_id,role) values('${employer}','admin'),('${otherEmployer}','reviewer');insert into private.testing_audit(actor_id,target_id,tier,action,reason) values('${otherEmployer}','${candidate}','careers_plus','assign','Manual synthetic access assignment');`,
    );
    await asUser(employer);
    const history = (
      await db.query<{ a: { actor_email: string }[] }>(
        "select public.admin_activity() a",
      )
    ).rows[0].a;
    expect(history[0].actor_email).toBe("other-employer@example.test");
    await db.exec("reset role");
    await db.query(
      "update private.staff_members set enabled=false where user_id=$1",
      [otherEmployer],
    );
    await asUser(otherEmployer);
    await expect(
      db.query("select public.admin_activity()"),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("retains radius and listing windows when a search is saved and applies them to alerts", async () => {
    await db.query(
      "update public.jobs set latitude=-37.814,longitude=144.963 where id=$1",
      [job],
    );
    await asUser(candidate);
    const filters = {
      keyword: "",
      location: "Melbourne, VIC",
      workMode: [],
      employmentType: [],
      directOnly: false,
      distance: 100,
      centreLat: -37.814,
      centreLon: 144.963,
      listedWithin: 7,
      listedFrom: "2020-01-01",
      listedTo: "2099-01-01",
    };
    await db.exec("reset role");
    // Simulate renewed publication permission for the revised fixture.
    await db.query(
      "update public.jobs set status='published',moderation_status='approved' where id=$1",
      [job],
    );
    await asUser(candidate);
    const search = (
      await db.query<{ id: string }>(
        "select public.save_search(null,'Nearby recent roles',$1::jsonb,false,'daily',false) id",
        [JSON.stringify(filters)],
      )
    ).rows[0].id;
    expect(
      (
        await db.query(
          "select distance,listed_within from public.saved_searches where id=$1",
          [search],
        )
      ).rows[0],
    ).toEqual({ distance: 100, listed_within: 7 });
    await db.exec("reset role");
    expect(
      (
        await db.query<{ matches: boolean }>(
          "select private.job_matches_search(j,s) matches from public.jobs j cross join public.saved_searches s where j.id=$1 and s.id=$2",
          [job, search],
        )
      ).rows[0].matches,
    ).toBe(true);
    await db.query(
      "update public.jobs set latitude=-33.8688,longitude=151.2093 where id=$1",
      [job],
    );
    expect(
      (
        await db.query<{ matches: boolean }>(
          "select private.job_matches_search(j,s) matches from public.jobs j cross join public.saved_searches s where j.id=$1 and s.id=$2",
          [job, search],
        )
      ).rows[0].matches,
    ).toBe(false);
  });
  it("requires a fresh review when applications arrive after a pool was selected", async () => {
    const chosen = await applicationFor(candidate);
    await applicationFor(otherCandidate);
    await asUser(employer);
    await expect(
      db.query(
        "select public.finalise_candidate_pool($1,$2::uuid[],$3::uuid[])",
        [job, [chosen], [chosen]],
      ),
    ).rejects.toMatchObject({ code: "22023" });
    expect(
      (await db.query("select status from public.jobs where id=$1", [job]))
        .rows[0],
    ).toEqual({ status: "published" });
  });
});

describe("reviewed applications and current profile details", () => {
  it("shows current identity only to the authorised hiring team while documents stay fixed", async () => {
    await db.query(
      "update profiles set first_name='Alex',last_name='Example',full_name='Alex Example',social_links='{\"portfolio\":\"https://example.test/alex\"}' where id=$1",
      [candidate],
    );
    await asUser("", "service_role");
    const id = (
      await db.query<{ a: { id: string } }>(
        "select submit_application_bundle(gen_random_uuid(),$1,$2,repeat('Original CV ',10),'Original letter','{\"right_to_work\":\"nz_citizen\"}',null,'{}') a",
        [candidate, job],
      )
    ).rows[0].a.id;
    await asUser(candidate);
    await db.query(
      "update profiles set full_name='Alex Updated',last_name='Updated',social_links='{\"portfolio\":\"https://example.test/new\"}' where id=$1",
      [candidate],
    );
    await asUser(employer);
    const a = (
      await db.query<{
        a: {
          candidate_profile: {
            full_name: string;
            social_links: Record<string, string>;
          };
          cv_text_snapshot: string;
          cover_letter: string;
          answers: Record<string, string>;
        };
      }>("select open_application($1) a", [id])
    ).rows[0].a;
    expect(a.candidate_profile.full_name).toBe("Alex Updated");
    expect(a.candidate_profile.social_links.portfolio).toBe(
      "https://example.test/new",
    );
    expect(a.cv_text_snapshot).toBe("Original CV ".repeat(10));
    expect(a.cover_letter).toBe("Original letter");
    expect(a.answers.right_to_work).toBe("nz_citizen");
    await asUser(otherEmployer);
    await expect(
      db.query("select open_application($1)", [id]),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("atomically claims owned attachments, fixes cover text to the uploaded original and rejects foreign IDs", async () => {
    const upload = "70000000-0000-4000-8000-000000000001",
      foreign = "70000000-0000-4000-8000-000000000002";
    await asUser("", "service_role");
    await db.query(
      "insert into application_uploads(id,user_id,filename,storage_path,media_type,bytes,kind,extracted_text) values($1,$2,'Letter.pdf','own/letter.pdf','application/pdf',200,'cover_letter','Original uploaded cover letter'),($3,$4,'Other.pdf','other/letter.pdf','application/pdf',200,'supporting','Private')",
      [upload, candidate, foreign, otherCandidate],
    );
    await expect(
      db.query(
        "select submit_application_bundle(gen_random_uuid(),$1,$2,repeat('CV ',30),'Changed','{}',null,array[$3::uuid])",
        [candidate, job, foreign],
      ),
    ).rejects.toMatchObject({ code: "22023" });
    expect((await db.query("select id from applications")).rows).toHaveLength(
      0,
    );
    const id = (
      await db.query<{ a: { id: string } }>(
        "select submit_application_bundle(gen_random_uuid(),$1,$2,repeat('CV ',30),'Changed','{}',null,array[$3::uuid]) a",
        [candidate, job, upload],
      )
    ).rows[0].a.id;
    expect(
      (
        await db.query("select cover_letter from applications where id=$1", [
          id,
        ])
      ).rows[0],
    ).toEqual({ cover_letter: "Original uploaded cover letter" });
    expect(
      (
        await db.query(
          "select kind,storage_path from application_documents where application_id=$1",
          [id],
        )
      ).rows,
    ).toEqual([{ kind: "cover_letter", storage_path: "own/letter.pdf" }]);
    await expect(
      db.query("select remove_application_upload($1,$2)", [upload, candidate]),
    ).rejects.toMatchObject({ code: "42501" });
    await asUser(candidate);
    await expect(
      db.query("select * from application_uploads"),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("expires unsubmitted uploads into a private retryable deletion queue", async () => {
    await asUser("", "service_role");
    await db.query(
      "insert into application_uploads(id,user_id,filename,storage_path,media_type,bytes,kind,created_at) values(gen_random_uuid(),$1,'Old.pdf','own/old.pdf','application/pdf',200,'supporting',now()-interval '25 hours')",
      [candidate],
    );
    expect(
      (await db.query("select storage_path from expire_application_uploads()"))
        .rows,
    ).toEqual([{ storage_path: "own/old.pdf" }]);
    expect(
      (await db.query("select id from application_uploads")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select storage_path from expire_application_uploads()"))
        .rows,
    ).toHaveLength(1);
  });
});

describe("CV library capacity", () => {
  it("accepts twenty versions and rejects a twenty-first without changing the selected CV", async () => {
    await asUser("", "service_role");
    await db.query(
      "insert into candidate_cvs(user_id,filename,storage_path,media_type,bytes,extracted_text) select $1,'Synthetic CV '||n||'.pdf','synthetic/'||n||'.pdf','application/pdf',200,repeat('Fictional experience ',5) from generate_series(1,20)n",
      [candidate],
    );
    await expect(
      db.query(
        "insert into candidate_cvs(user_id,filename,storage_path,media_type,bytes,extracted_text) values($1,'Synthetic 21.pdf','synthetic/21.pdf','application/pdf',200,repeat('Synthetic ',8))",
        [candidate],
      ),
    ).rejects.toMatchObject({ code: "22023" });
    expect(
      (
        await db.query(
          "select count(*)::integer n from candidate_cvs where user_id=$1",
          [candidate],
        )
      ).rows[0],
    ).toEqual({ n: 20 });
    expect(
      (
        await db.query("select active_cv_id from profiles where id=$1", [
          candidate,
        ])
      ).rows[0],
    ).toEqual({ active_cv_id: null });
  });
});

describe("fictional company role context", () => {
  it("retains the test label for a new role created under a test company", async () => {
    await db.query("update organisations set is_test=true where id=$1", [org]);
    await asUser(employer);
    const result = await db.query<{ is_test: boolean }>(
      "insert into jobs(organisation_id,title,company,location,city,state,work_mode,employment_type,description) values($1,'Fictional test listing','Fern Studio','Melbourne, VIC','Melbourne','VIC','Hybrid','Full time','A sufficiently detailed fictional software test listing.') returning is_test",
      [org],
    );
    expect(result.rows[0].is_test).toBe(true);
  });
});

describe("saved assistant conversations", () => {
  const snapshot = JSON.stringify({
    entries: [],
    cv: "Private CV text",
    filename: "CV.txt",
    description: "",
  });
  async function createChat() {
    return (
      await db.query<{ id: string }>(
        "insert into public.assistant_chats(user_id,title,snapshot) values($1,'My CV',$2::jsonb) returning id",
        [candidate, snapshot],
      )
    ).rows[0].id;
  }
  it("saves full context privately and prevents another account from reading, editing or deleting it", async () => {
    await asUser(candidate);
    const id = await createChat();
    expect(
      (
        await db.query(
          "select snapshot->>'cv' cv from public.assistant_chats where id=$1",
          [id],
        )
      ).rows,
    ).toEqual([{ cv: "Private CV text" }]);
    await asUser(otherCandidate);
    expect(
      (await db.query("select * from public.assistant_chats")).rows,
    ).toEqual([]);
    expect(
      (
        await db.query(
          "update public.assistant_chats set title='Hijacked' where id=$1 returning id",
          [id],
        )
      ).rows,
    ).toEqual([]);
    expect(
      (
        await db.query(
          "delete from public.assistant_chats where id=$1 returning id",
          [id],
        )
      ).rows,
    ).toEqual([]);
    await expect(createChat()).rejects.toMatchObject({ code: "42501" });
    await asUser(candidate);
    await expect(
      db.query("update public.assistant_chats set user_id=$1 where id=$2", [
        otherCandidate,
        id,
      ]),
    ).rejects.toMatchObject({ code: "42501" });
    await asUser("", "anon");
    await expect(
      db.query("select * from public.assistant_chats"),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("enforces ten chats while allowing updates at the cap and replacement after deletion", async () => {
    await asUser(candidate);
    const id = await createChat();
    for (let i = 1; i < 10; i++) await createChat();
    await expect(createChat()).rejects.toMatchObject({ code: "P0001" });
    await db.query(
      "update public.assistant_chats set title='Updated follow-up' where id=$1",
      [id],
    );
    expect(
      (await db.query("select count(*)::int total from public.assistant_chats"))
        .rows[0],
    ).toEqual({ total: 10 });
    await db.query("delete from public.assistant_chats where id=$1", [id]);
    await expect(createChat()).resolves.toBeTruthy();
  });
  it("keeps reading and deletion available after subscription expiry but prevents new saves", async () => {
    await asUser(candidate);
    const id = await createChat();
    await db.exec("reset role");
    await db.query(
      "update public.subscriptions set current_period_end=now()-interval '1 minute' where user_id=$1",
      [candidate],
    );
    await asUser(candidate);
    expect(
      (await db.query("select id from public.assistant_chats")).rows,
    ).toEqual([{ id }]);
    await expect(createChat()).rejects.toMatchObject({ code: "42501" });
    await expect(
      db.query(
        "update public.assistant_chats set title='New title' where id=$1",
        [id],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await db.query("delete from public.assistant_chats where id=$1", [id]);
    expect(
      (await db.query("select * from public.assistant_chats")).rows,
    ).toEqual([]);
  });
  it("shares the 100-request billing allowance with category-free chat requests and renews by period", async () => {
    await db.query(
      "insert into public.ai_usage(user_id,mode,status,period_start,period_end) select user_id,'review','completed',current_period_start,current_period_end from public.subscriptions cross join generate_series(1,99)",
    );
    await asUser(candidate);
    await expect(
      db.query("select public.reserve_ai_usage('chat')"),
    ).resolves.toBeTruthy();
    await expect(
      db.query("select public.reserve_ai_usage('chat')"),
    ).rejects.toMatchObject({ code: "P0001" });
    await db.exec("reset role");
    await db.query(
      "update public.subscriptions set current_period_start=now(),current_period_end=now()+interval '1 month' where user_id=$1",
      [candidate],
    );
    await asUser(candidate);
    await expect(
      db.query("select public.reserve_ai_usage('chat')"),
    ).resolves.toBeTruthy();
  });
});

describe("employer category options", () => {
  it("excludes expired, scheduled and suspended-business categories from discovery", async () => {
    await db.query(
      "insert into public.employer_plans(organisation_id,tier,order_reference,starts_at,ends_at) values($1,'growth','category-inventory-test',now()-interval '1 day',now()+interval '1 month')",
      [org],
    );
    await db.query("update public.jobs set category='Technology' where id=$1", [
      job,
    ]);
    // Seed the state of a previously valid listing after its closing time passes.
    // The normal write guard correctly refuses publishing an already expired role.
    await db.exec(
      "alter table public.jobs disable trigger zz_listing_lifecycle",
    );
    await db.query(
      `insert into public.jobs(organisation_id,title,company,location,city,state,category,work_mode,employment_type,salary_min,salary_max,description,status,moderation_status,published_at,expires_at,source,external_url)
      select case when category='Orphan' then null else $1::uuid end,'Synthetic role','Synthetic business','Melbourne VIC','Melbourne','VIC',category,'Hybrid','Full time',100000,120000,'A sufficiently detailed synthetic role for directory testing.','published','approved',
      case when category='Scheduled' then now()+interval '1 day' else now()-interval '2 days' end,
      case when category='Expired' then now()-interval '1 day' else now()+interval '30 days' end,
      'external','https://example.test/role'
      from unnest(array['Expired','Scheduled']) category`,
      [org],
    );
    await db.exec(
      "alter table public.jobs enable trigger zz_listing_lifecycle",
    );
    await db.exec("reset role");
    // Simulate renewed publication permission for the revised fixture.
    await db.query(
      "update public.jobs set status='published',moderation_status='approved' where id=$1",
      [job],
    );
    await asUser("", "anon");
    expect(
      (await db.query("select public.employer_role_categories() category"))
        .rows,
    ).toEqual([{ category: "Technology" }]);
    await db.exec("reset role");
    await db.query(
      "update public.organisations set suspended_at=now() where id=$1",
      [org],
    );
    await asUser("", "anon");
    expect(
      (await db.query("select public.employer_role_categories() category"))
        .rows,
    ).toEqual([]);
  });
  it("returns distinct caller-visible categories without leaking unpublished roles", async () => {
    await db.query("update public.jobs set category='Technology' where id=$1", [
      job,
    ]);
    await db.query(
      "insert into public.jobs(organisation_id,title,company,location,city,state,category,work_mode,employment_type,salary_min,salary_max,description,status,moderation_status) values($1,'Draft role','Fern Studio','Melbourne VIC','Melbourne','VIC','Private draft category','Hybrid','Full time',100000,120000,'A sufficiently detailed draft role for private testing.','draft','approved')",
      [org],
    );
    await db.exec("reset role");
    // Simulate renewed publication permission for the revised fixture.
    await db.query(
      "update public.jobs set status='published',moderation_status='approved' where id=$1",
      [job],
    );
    await asUser("", "anon");
    expect(
      (await db.query("select public.employer_role_categories() category"))
        .rows,
    ).toEqual([{ category: "Technology" }]);
  });
});

describe("business teams and radius search", () => {
  async function growth() {
    await db.exec("reset role");
    await db.query(
      "insert into public.employer_plans(organisation_id,tier,order_reference,starts_at,ends_at) values($1,'growth','team-test',now()-interval '1 day',now()+interval '1 month')",
      [org],
    );
    await db.exec(
      "insert into private.alert_settings(singleton,site_origin,unsubscribe_origin,sending_enabled) values(true,'https://careers.example.test','https://careers.example.test/unsubscribe',true)",
    );
    await db.query(
      "insert into public.business_accounts(user_id,kind,trading_name,terms_version,terms_sha256) values($1,'employer','Example','v1',$2)",
      [otherCandidate, "a".repeat(64)],
    );
    await asUser(employer);
  }
  async function invite(email = "other@example.test") {
    await db.query("select public.manage_business_team('invite',$1,$2)", [
      org,
      email,
    ]);
    await db.exec("reset role");
    return (
      await db.query<{ id: string }>(
        "select id from private.business_invitations order by created_at desc limit 1",
      )
    ).rows[0].id;
  }
  it("backfills coordinates and returns Canberra across the ACT/NSW border within Queanbeyan’s radius", async () => {
    await db.query(
      "update public.jobs set city='Canberra',state='ACT',location='Canberra, ACT',latitude=null,longitude=null where id=$1",
      [job],
    );
    const coordinates = (
      await db.query<{ latitude: number; longitude: number }>(
        "select latitude,longitude from public.jobs where id=$1",
        [job],
      )
    ).rows[0];
    expect(coordinates.latitude).toBeTypeOf("number");
    const origin = (
      await db.query<{ latitude: number; longitude: number }>(
        "select latitude,longitude from private.place_centres where city='Queanbeyan' and state='NSW'",
      )
    ).rows[0];
    await db.exec("reset role");
    // Simulate renewed publication permission for the revised fixture.
    await db.query(
      "update public.jobs set status='published',moderation_status='approved' where id=$1",
      [job],
    );
    await asUser("", "anon");
    expect(
      (
        await db.query(
          "select id from public.jobs_within_distance($1,$2,250)",
          [origin.latitude, origin.longitude],
        )
      ).rows,
    ).toContainEqual({ id: job });
    expect(
      (
        await db.query("select id from public.jobs_within_distance($1,$2,5)", [
          origin.latitude,
          origin.longitude,
        ])
      ).rows,
    ).not.toContainEqual({ id: job });
  });
  it("requires an owner and Growth, and keeps invitation data private", async () => {
    await asUser(employer);
    await expect(
      db.query(
        "select public.manage_business_team('invite',$1,'other@example.test')",
        [org],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await growth();
    await asUser(otherEmployer);
    await expect(
      db.query(
        "select public.manage_business_team('invite',$1,'other@example.test')",
        [org],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      db.query("select * from private.business_invitations"),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("binds accepted access to the account ID across an email change and prevents replay after revocation", async () => {
    await growth();
    const id = await invite();
    await asUser(otherCandidate);
    await db.query(
      "select public.manage_business_team('accept',null,null,$1)",
      [id],
    );
    expect(
      (
        await db.query("select private.is_active_hiring_team($1) allowed", [
          org,
        ])
      ).rows[0],
    ).toEqual({ allowed: true });
    await db.exec("reset role");
    await db.query(
      "update auth.users set email='changed@example.test' where id=$1",
      [otherCandidate],
    );
    await asUser(otherCandidate);
    expect(
      (
        await db.query("select private.is_active_hiring_team($1) allowed", [
          org,
        ])
      ).rows[0],
    ).toEqual({ allowed: true });
    expect(
      (
        await db.query<{ tiers: { id: string; tier: string }[] }>(
          "select public.my_business_team_tiers() tiers",
        )
      ).rows[0].tiers,
    ).toContainEqual({ id: org, tier: "growth" });
    await asUser(employer);
    await db.query(
      "select public.manage_business_team('revoke',$1,null,null,$2)",
      [org, otherCandidate],
    );
    await asUser(otherCandidate);
    expect(
      (
        await db.query("select private.is_active_hiring_team($1) allowed", [
          org,
        ])
      ).rows[0],
    ).toEqual({ allowed: false });
    await expect(
      db.query("select public.manage_business_team('accept',null,null,$1)", [
        id,
      ]),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      db.query("select public.open_application($1)", [
        "40000000-0000-4000-8000-000000000001",
      ]),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("checks the verified invited email and expiry, and cancels a revoked invitation’s email before dispatch", async () => {
    await growth();
    const id = await invite("new-account@example.test");
    await asUser(otherCandidate);
    await expect(
      db.query("select public.manage_business_team('accept',null,null,$1)", [
        id,
      ]),
    ).rejects.toMatchObject({ code: "42501" });
    await asUser(employer);
    await db.query("select public.manage_business_team('revoke',$1,null,$2)", [
      org,
      id,
    ]);
    await db.exec("reset role");
    await db.query("select public.claim_job_alerts(10)");
    expect(
      (
        await db.query(
          "select status from private.alert_outbox where invitation_id=$1",
          [id],
        )
      ).rows[0],
    ).toEqual({ status: "canceled" });
    await asUser(employer);
    const second = await invite();
    await db.query(
      "update private.business_invitations set expires_at=now()-interval '1 second' where id=$1",
      [second],
    );
    await asUser(otherCandidate);
    await expect(
      db.query("select public.manage_business_team('accept',null,null,$1)", [
        second,
      ]),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("shares business alerts with accepted members and removes hiring access on downgrade", async () => {
    await growth();
    const id = await invite();
    await asUser(otherCandidate);
    await db.query(
      "select public.manage_business_team('accept',null,null,$1)",
      [id],
    );
    await db.exec("reset role");
    await db.query(
      "insert into public.applications(job_id,candidate_id,cv_text_snapshot,cover_letter) values($1,$2,repeat('Synthetic CRM experience. ',5),'Application letter')",
      [job, candidate],
    );
    const notices = (
      await db.query(
        "select user_id from public.notifications where event_key=$1",
        ["hiring:" + job],
      )
    ).rows;
    expect(notices).toContainEqual({ user_id: employer });
    expect(notices).toContainEqual({ user_id: otherCandidate });
    await db.query(
      "update public.employer_plans set tier='starter' where organisation_id=$1",
      [org],
    );
    await asUser(otherCandidate);
    expect(
      (
        await db.query("select private.is_active_hiring_team($1) allowed", [
          org,
        ])
      ).rows[0],
    ).toEqual({ allowed: false });
    expect(
      (await db.query("select * from public.organisation_members")).rows,
    ).toHaveLength(0);
    await asUser(employer);
    expect(
      (
        await db.query("select private.is_active_hiring_team($1) allowed", [
          org,
        ])
      ).rows[0],
    ).toEqual({ allowed: true });
  });
  it("leases active invitation mail without an Auth account and never suppresses the inviter on an invitation bounce", async () => {
    await growth();
    const id = await invite("new-account@example.test");
    const claimed = (
      await db.query<{
        items: { id: string; kind: string; lease_token: string }[];
      }>("select public.claim_job_alerts(10) items")
    ).rows[0].items;
    const item = claimed.find((row) => row.kind === "invitation")!;
    expect(item).toBeDefined();
    const frozen = {
      from: "Westmere Careers <hello@westmere.com.au>",
      to: ["new-account@example.test"],
    };
    expect(
      (
        await db.query<{ body: unknown }>(
          "select public.freeze_job_alert($1,$2,$3::jsonb) body",
          [item.id, item.lease_token, JSON.stringify(frozen)],
        )
      ).rows[0].body,
    ).toEqual(frozen);
    await db.query(
      "select public.apply_alert_webhook('invite-bounce','invite-provider','email.bounced',now(),$1)",
      [item.id],
    );
    expect(
      (
        await db.query(
          "select status from private.alert_outbox where invitation_id=$1",
          [id],
        )
      ).rows[0],
    ).toEqual({ status: "failed" });
    expect(
      (
        await db.query(
          "select * from private.alert_suppressions where user_id=$1",
          [employer],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("does not block invited-account deletion or retain pending mail after creator deletion", async () => {
    await growth();
    const id = await invite();
    await asUser(otherCandidate);
    await db.query(
      "select public.manage_business_team('accept',null,null,$1)",
      [id],
    );
    await db.exec("reset role");
    await db.query("delete from auth.users where id=$1", [otherCandidate]);
    expect(
      (
        await db.query(
          "select accepted_by from private.business_invitations where id=$1",
          [id],
        )
      ).rows[0],
    ).toEqual({ accepted_by: null });
    await asUser(employer);
    const pending = await invite("new-account@example.test");
    await db.query("delete from auth.users where id=$1", [employer]);
    expect(
      (
        await db.query(
          "select id from private.business_invitations where id=$1",
          [pending],
        )
      ).rows,
    ).toHaveLength(0);
    expect(
      (
        await db.query(
          "select id from private.alert_outbox where invitation_id=$1",
          [pending],
        )
      ).rows,
    ).toHaveLength(0);
  });
});

describe("personal accounts for applications", () => {
  it("blocks business accounts and team members even through direct application inserts", async () => {
    await asUser(employer);
    await expect(
      db.query(
        "insert into public.applications(job_id,candidate_id,cv_text_snapshot) values($1,$2,repeat('Example CV text. ',8))",
        [job, employer],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await db.exec("reset role");
    await db.query(
      "insert into public.business_accounts(user_id,kind,trading_name,terms_version,terms_sha256) values($1,'employer','Example','v1',$2)",
      [otherCandidate, "a".repeat(64)],
    );
    await asUser(otherCandidate);
    await expect(
      db.query(
        "insert into public.applications(job_id,candidate_id,cv_text_snapshot) values($1,$2,repeat('Example CV text. ',8))",
        [job, otherCandidate],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await asUser(candidate);
    await db.query(
      "insert into public.applications(job_id,candidate_id,cv_text_snapshot) values($1,$2,repeat('Example CV text. ',8))",
      [job, candidate],
    );
    expect(
      (
        await db.query(
          "select candidate_id from public.applications where job_id=$1",
          [job],
        )
      ).rows,
    ).toContainEqual({ candidate_id: candidate });
  });
});

describe("one account plan across businesses", () => {
  async function ownedBusinesses(count: number) {
    const ids = (
      await db.query<{ id: string }>(
        `insert into public.organisations(name,slug,is_verified)
       select 'Covered business '||n,'covered-'||n,true from generate_series(1,$1::int) n returning id`,
        [count],
      )
    ).rows.map((row) => row.id);
    for (const id of ids)
      await db.query(
        "insert into public.organisation_members(organisation_id,user_id,role) values($1,$2,'owner')",
        [id, employer],
      );
    return [org, ...ids];
  }
  async function paid(tier = "growth") {
    await db.query(
      "insert into public.organisation_billing_accounts(organisation_id,billing_user_id,stripe_customer_id,audience) values($1,$2,'cus_account','employer')",
      [org, employer],
    );
    await db.query(
      "insert into public.business_subscriptions(organisation_id,stripe_customer_id,stripe_subscription_id,tier,status,current_period_start,current_period_end) values($1,'cus_account','sub_account',$2,'active',now(),now()+interval '1 month')",
      [org, tier],
    );
  }
  async function coverage() {
    return (
      await db.query<{
        plan: {
          limit: number;
          used: number;
          organisations: {
            id: string;
            covered: boolean;
            tier: string | null;
            billingOwnerId: string;
            billingOwnerEmail: string;
          }[];
        };
      }>("select public.my_business_plan() plan")
    ).rows[0].plan;
  }
  it("shares one Growth subscription across three businesses and never grants a fourth its tier", async () => {
    const ids = await ownedBusinesses(3);
    await paid();
    await asUser(employer);
    const plan = await coverage();
    expect(plan).toMatchObject({ limit: 3, used: 3 });
    expect(plan.organisations.filter((o) => o.covered)).toHaveLength(3);
    expect(
      plan.organisations.every(
        (o) => o.billingOwnerEmail === "employer@example.test",
      ),
    ).toBe(true);
    await expect(
      db.query("select public.set_business_plan_organisations($1::uuid[])", [
        ids,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
    await db.query(
      "select public.set_business_plan_organisations($1::uuid[])",
      [ids.slice(1)],
    );
    expect(
      (await coverage()).organisations.find((o) => o.id === org),
    ).toMatchObject({ covered: false, tier: null });
    expect(
      (
        await db.query<{ tiers: { id: string; tier: string | null }[] }>(
          "select public.my_business_team_tiers() tiers",
        )
      ).rows[0].tiers.find((o) => o.id === ids[1]),
    ).toMatchObject({ tier: "growth" });
  });
  it("enforces Starter 1, Growth 3 and Enterprise 10, including a direct Stripe downgrade", async () => {
    const ids = await ownedBusinesses(10);
    await paid("starter");
    await asUser(employer);
    expect(await coverage()).toMatchObject({ limit: 1, used: 1 });
    await expect(
      db.query("select public.set_business_plan_organisations($1::uuid[])", [
        ids.slice(0, 2),
      ]),
    ).rejects.toMatchObject({ code: "23514" });
    await db.exec("reset role");
    await db.query(
      "update public.business_subscriptions set tier='enterprise' where organisation_id=$1",
      [org],
    );
    await asUser(employer);
    expect(await coverage()).toMatchObject({ limit: 10, used: 10 });
    await expect(
      db.query("select public.set_business_plan_organisations($1::uuid[])", [
        ids,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
    await db.exec("reset role");
    await db.query(
      "update public.business_subscriptions set tier='growth' where organisation_id=$1",
      [org],
    );
    await asUser(employer);
    expect(
      (await coverage()).organisations.filter((o) => o.covered),
    ).toHaveLength(3);
    await db.exec("reset role");
    await db.query(
      "update public.business_subscriptions set status='canceled' where organisation_id=$1",
      [org],
    );
    await asUser(employer);
    expect((await coverage()).organisations.some((o) => o.covered)).toBe(false);
  });
  it("allows only one primary Stripe customer per account and ignores historical streams for entitlement", async () => {
    const ids = await ownedBusinesses(1);
    await paid("starter");
    await expect(
      db.query(
        "insert into public.organisation_billing_accounts(organisation_id,billing_user_id,stripe_customer_id,audience) values($1,$2,'cus_duplicate','employer')",
        [ids[1], employer],
      ),
    ).rejects.toMatchObject({ code: "23505" });
    await db.query(
      "insert into public.organisation_billing_accounts(organisation_id,billing_user_id,stripe_customer_id,audience,is_primary) values($1,$2,'cus_history','employer',false)",
      [ids[1], employer],
    );
    await db.query(
      "insert into public.business_subscriptions(organisation_id,stripe_customer_id,tier,status,current_period_start,current_period_end) values($1,'cus_history','enterprise','active',now(),now()+interval '1 month')",
      [ids[1]],
    );
    await asUser(employer);
    expect(await coverage()).toMatchObject({ limit: 1 });
    expect(
      (await coverage()).organisations.find((o) => o.id === ids[1]),
    ).toMatchObject({ covered: false, tier: null });
  });
  it("keeps billing ownership separate from invited management and cannot link another owner's company", async () => {
    await paid();
    await db.query(
      "insert into public.organisation_members(organisation_id,user_id,role) values($1,$2,'recruiter')",
      [org, otherEmployer],
    );
    await asUser(otherEmployer);
    const plan = await coverage();
    expect(plan.used).toBe(1); // This account's own free business, not its invitation.
    expect(plan.organisations.find((o) => o.id === org)).toMatchObject({
      tier: "growth",
      billingOwnerId: employer,
      billingOwnerEmail: "employer@example.test",
    });
    expect(
      (await db.query("select * from public.organisation_billing_accounts"))
        .rows,
    ).toHaveLength(0);
    await expect(
      db.query("select public.set_business_plan_organisations($1::uuid[])", [
        [org],
      ]),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      db.query("select * from private.business_plan_organisations"),
    ).rejects.toMatchObject({ code: "42501" });
    await asUser(candidate);
    expect((await coverage()).organisations).toHaveLength(0);
    await asUser("", "anon");
    await expect(coverage()).rejects.toMatchObject({ code: "42501" });
  });
});

describe("Enterprise Careers+ belongs only to the billed account", () => {
  async function enterprise() {
    await db.query(
      "insert into public.organisation_billing_accounts(organisation_id,billing_user_id,stripe_customer_id,audience) values($1,$2,'cus_enterprise','employer')",
      [org, employer],
    );
    await db.query(
      "insert into public.business_subscriptions(organisation_id,stripe_customer_id,tier,status,current_period_start,current_period_end) values($1,'cus_enterprise','enterprise','active',now(),now()+interval '1 month')",
      [org],
    );
  }
  it("grants the billing owner the period and rejects invited Enterprise managers", async () => {
    await enterprise();
    await db.query(
      "insert into public.organisation_members(organisation_id,user_id,role) values($1,$2,'recruiter')",
      [org, otherEmployer],
    );
    await asUser(employer);
    expect(
      (
        await db.query<{ access: unknown }>(
          "select public.my_enterprise_careers_access() access",
        )
      ).rows[0].access,
    ).toBeTruthy();
    await asUser(otherEmployer);
    expect(
      (
        await db.query<{ access: unknown }>(
          "select public.my_enterprise_careers_access() access",
        )
      ).rows[0].access,
    ).toBeNull();
    await expect(
      db.query("select public.reserve_ai_usage('chat')"),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      db.query(
        "insert into public.assistant_chats(user_id,title) values($1,'Not inherited')",
        [otherEmployer],
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("provides one hundred requests and ten owner-only chats on the Enterprise billing period", async () => {
    await enterprise();
    await asUser(employer);
    for (let i = 0; i < 100; i++)
      await db.query("select public.reserve_ai_usage('chat')");
    await expect(
      db.query("select public.reserve_ai_usage('review')"),
    ).rejects.toMatchObject({ code: "P0001" });
    for (let i = 0; i < 10; i++)
      await db.query(
        "insert into public.assistant_chats(user_id,title) values($1,$2)",
        [employer, "Chat " + i],
      );
    await expect(
      db.query(
        "insert into public.assistant_chats(user_id,title) values($1,'Eleventh')",
        [employer],
      ),
    ).rejects.toMatchObject({ code: "P0001" });
    await asUser(otherEmployer);
    expect(
      (await db.query("select * from public.assistant_chats")).rows,
    ).toHaveLength(0);
  });
  it.each(["growth", "starter", "expired", "canceled"])(
    "removes owner-only Careers+ for %s",
    async (change) => {
      await enterprise();
      if (change === "expired")
        await db.query(
          "update public.business_subscriptions set current_period_end=now()-interval '1 second' where organisation_id=$1",
          [org],
        );
      else if (change === "canceled")
        await db.query(
          "update public.business_subscriptions set status='canceled' where organisation_id=$1",
          [org],
        );
      else
        await db.query(
          "update public.business_subscriptions set tier=$2 where organisation_id=$1",
          [org, change],
        );
      await asUser(employer);
      expect(
        (
          await db.query<{ access: unknown }>(
            "select public.my_enterprise_careers_access() access",
          )
        ).rows[0].access,
      ).toBeNull();
      await expect(
        db.query("select public.reserve_ai_usage('chat')"),
      ).rejects.toMatchObject({ code: "42501" });
    },
  );
});

describe("reviewed agency boundaries and pooled capacity", () => {
  const recruiter = "10000000-0000-4000-8000-000000000005";
  const roleB = "30000000-0000-4000-8000-000000000002";
  let authority: string;
  async function agency() {
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,'assigned@example.test',now())",
      [recruiter],
    );
    await db.query(
      "update public.organisations set kind='agency',agency_pilot_enabled=true where id=$1",
      [org],
    );
    await db.query(
      "insert into public.organisation_billing_accounts(organisation_id,billing_user_id,stripe_customer_id,audience) values($1,$2,'cus_agency','agency')",
      [org, employer],
    );
    await db.query(
      "insert into public.business_subscriptions(organisation_id,stripe_customer_id,tier,status,current_period_start,current_period_end) values($1,'cus_agency','agency_growth','active',now(),now()+interval '1 month')",
      [org],
    );
    await db.exec("update private.agency_release set enabled=true");
    await db.query(
      "insert into public.organisation_members(organisation_id,user_id,role) values($1,$2,'recruiter'),($1,$3,'recruiter')",
      [org, recruiter, otherEmployer],
    );
    const c = (
      await db.query<{ id: string }>(
        "insert into private.agency_clients(agency_id,name,public_label,representative_name,representative_email,created_by) values($1,'Secret Client Legal Name','Confidential client','Independent representative','representative@example.test',$2) returning id",
        [org, employer],
      )
    ).rows[0].id;
    authority = (
      await db.query<{ id: string }>(
        "insert into private.agency_authorisations(client_id,agency_id,evidence,valid_from,valid_until,status,reviewer_id,reviewed_at,created_by) values($1,$2,'Independent authority evidence checked for client recruitment.',now()-interval '1 day',now()+interval '30 days','approved',$3,now(),$4) returning id",
        [c, org, otherCandidate, employer],
      )
    ).rows[0].id;
    await db.query(
      "insert into private.agency_job_engagements(job_id,agency_id,authorisation_id,lead_user_id) values($1,$2,$3,$4)",
      [job, org, authority, recruiter],
    );
    await db.query(
      "insert into private.agency_job_assignments(job_id,user_id,assigned_by) values($1,$2,$3)",
      [job, recruiter, employer],
    );
    await db.query(
      "update public.jobs set agency_hiring_mode='client',recruitment_lead='Assigned Recruiter' where id=$1",
      [job],
    );
    await db.query(
      "update public.jobs set status='published',moderation_status='approved',expires_at=now()+interval '30 days' where id=$1",
      [job],
    );
    await db.query(
      "insert into public.jobs(id,organisation_id,title,company,location,city,state,work_mode,employment_type,description,status) values($1,$2,'Other client role','Fern Studio','Sydney NSW','Sydney','NSW','Hybrid','Full time','A separate client recruitment role with a clear description.','draft')",
      [roleB, org],
    );
  }
  async function clientDeclaration(
    linked = false,
    extra: Record<string, unknown> = {},
  ) {
    await asUser(employer);
    const c = (
      await db.query<{ d: { id: string } }>(
        "select public.manage_agency('client_create',$1,null,$2) d",
        [
          org,
          {
            name: "Declared employer client",
            representativeName: "Hiring Manager",
            representativeEmail: "manager@client.example",
            employerId: linked ? otherOrg : null,
          },
        ],
      )
    ).rows[0].d.id;
    const details = {
      evidence:
        "External agreement ABC authorises advertising current technology vacancies.",
      validFrom: new Date(Date.now() - 86400000).toISOString(),
      validUntil: new Date(Date.now() + 86400000 * 60).toISOString(),
      advertisingConfirmed: true,
      declarationVersion: "agency-advertising-v1",
      ...extra,
    };
    const d = (
      await db.query<{ d: { id: string; status: string } }>(
        "select public.manage_agency('declare_client',$1,$2,$3) d",
        [org, c, details],
      )
    ).rows[0].d;
    return { ...d, client: c, details };
  }
  async function auditVersion(id: string) {
    await db.exec("reset role");
    return (
      await db.query<{ updated_at: string }>(
        "select updated_at from private.agency_authorisations where id=$1",
        [id],
      )
    ).rows[0].updated_at;
  }
  async function reviewer() {
    await db.exec("reset role");
    await db.query(
      "insert into private.staff_members(user_id,role) values($1,'reviewer') on conflict(user_id) do update set enabled=true",
      [otherCandidate],
    );
    await asUser(otherCandidate);
  }
  it("activates declared clients without an account or routine approval and records each vacancy declaration", async () => {
    await agency();
    const d = await clientDeclaration(false);
    await db.query(
      "select public.manage_agency('request_offer',null,$1,'{}')",
      [d.id],
    );
    expect(d.status).toBe("declared");
    await db.exec("reset role");
    expect(
      (
        await db.query(
          "select status,declared_by,declaration_version,reviewed_at,can_offer,offer_requested,private.agency_authority_valid(id,agency_id) valid from private.agency_authorisations where id=$1",
          [d.id],
        )
      ).rows[0],
    ).toMatchObject({
      status: "declared",
      declared_by: employer,
      declaration_version: "agency-advertising-v1",
      reviewed_at: null,
      can_offer: false,
      offer_requested: true,
      valid: true,
    });
    await asUser(employer);
    await expect(
      db.query("select public.manage_agency('configure_job',$1,null,$2)", [
        org,
        {
          jobId: roleB,
          mode: "client",
          authorisationId: d.id,
          leadUserId: employer,
          leadName: "Agency Lead",
        },
      ]),
    ).rejects.toMatchObject({ code: "22023" });
    await db.query("select public.manage_agency('configure_job',$1,null,$2)", [
      org,
      {
        jobId: roleB,
        mode: "client",
        authorisationId: d.id,
        leadUserId: employer,
        leadName: "Agency Lead",
        advertisingConfirmed: true,
      },
    ]);
    await expect(
      db.query(
        "select private.manage_agency_reviewed('configure_job',$1,null,'{}')",
        [org],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      db.query("select * from private.agency_relationship_events"),
    ).rejects.toMatchObject({ code: "42501" });
    await reviewer();
    expect(
      (
        await db.query<{ d: { authorisations: { id: string }[] } }>(
          "select public.manage_agency('relationship_register') d",
        )
      ).rows[0].d.authorisations.some((a) => a.id === d.id),
    ).toBe(true);
    await db.exec("reset role");
    expect(
      (
        await db.query(
          "select count(*)::integer n from private.moderation_audit where subject_id=$1 and action='agency_advertising_declaration'",
          [roleB],
        )
      ).rows[0],
    ).toEqual({ n: 1 });
  });
  it("keeps employer confirmation optional, offer authority separate and applies an employer dispute immediately", async () => {
    await agency();
    const d = await clientDeclaration(true);
    await db.query("select public.manage_agency('configure_job',$1,null,$2)", [
      org,
      {
        jobId: roleB,
        mode: "client",
        authorisationId: d.id,
        leadUserId: employer,
        leadName: "Agency Lead",
        advertisingConfirmed: true,
      },
    ]);
    await db.exec("reset role");
    await db.query(
      "update public.jobs set status='published',published_at=now(),moderation_status='approved',expires_at=now()+interval '30 days' where id=$1",
      [roleB],
    );
    await asUser(candidate);
    await db.query(
      "insert into public.applications(candidate_id,job_id,cv_text_snapshot) values($1,$2,repeat('Synthetic application experience and skills. ',10))",
      [candidate, roleB],
    );
    await asUser(employer);
    await expect(
      db.query(
        "insert into public.applications(candidate_id,job_id,cv_text_snapshot) values($1,$2,repeat('Synthetic application experience and skills. ',10))",
        [employer, roleB],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    let version = await auditVersion(d.id);
    expect(
      (
        await db.query("select private.agency_authority_valid($1,$2) valid", [
          d.id,
          org,
        ])
      ).rows[0],
    ).toEqual({ valid: true });
    await asUser(otherEmployer);
    await db.query("select public.manage_agency('client_approve',null,$1,$2)", [
      d.id,
      { version, canOffer: true },
    ]);
    version = await auditVersion(d.id);
    expect(
      (
        await db.query(
          "select can_offer,client_approved_at is not null confirmed from private.agency_authorisations where id=$1",
          [d.id],
        )
      ).rows[0],
    ).toEqual({ can_offer: false, confirmed: true });
    await reviewer();
    await db.query("select public.manage_agency('review',null,$1,$2)", [
      d.id,
      {
        version,
        decision: "approve",
        reason: "Independently verified separate explicit offer authority.",
        identityChecked: true,
        authorityChecked: true,
        offerAuthorityChecked: true,
      },
    ]);
    version = await auditVersion(d.id);
    expect(
      (
        await db.query(
          "select can_offer from private.agency_authorisations where id=$1",
          [d.id],
        )
      ).rows[0],
    ).toEqual({ can_offer: true });
    await asUser(otherEmployer);
    await db.query("select public.manage_agency('dispute',null,$1,$2)", [
      d.id,
      {
        version,
        reason:
          "This agency is no longer authorised to advertise our positions.",
      },
    ]);
    await db.exec("reset role");
    expect(
      (
        await db.query(
          "select status,can_offer,private.agency_authority_valid(id,agency_id) valid from private.agency_authorisations where id=$1",
          [d.id],
        )
      ).rows[0],
    ).toEqual({ status: "needs_information", can_offer: false, valid: false });
    expect(
      (await db.query("select status from public.jobs where id=$1", [roleB]))
        .rows[0],
    ).toEqual({ status: "closed" });
    expect(
      (
        await db.query(
          "select private.user_can_access_job($1,$2,'application') allowed",
          [employer, roleB],
        )
      ).rows[0],
    ).toEqual({ allowed: false });
    expect(
      (
        await db.query(
          "select recipient_snapshot from public.applications where job_id=$1",
          [roleB],
        )
      ).rows,
    ).toHaveLength(1);
    await asUser(employer);
    const duplicate = (
      await db.query<{ d: { id: string } }>(
        "select public.manage_agency('client_create',$1,null,$2) d",
        [
          org,
          {
            name: "Different label to bypass hold",
            representativeName: "Another Rep",
            representativeEmail: "other@client.example",
            employerId: otherOrg,
          },
        ],
      )
    ).rows[0].d.id;
    await expect(
      db.query("select public.manage_agency('declare_client',$1,$2,$3)", [
        org,
        duplicate,
        d.details,
      ]),
    ).rejects.toMatchObject({ code: "42501" });
    await db.query(
      "select public.manage_agency('submit_evidence',null,$1,$2)",
      [
        d.id,
        {
          reason:
            "Updated written agreement and representative confirmation supplied for independent verification.",
        },
      ],
    );
    await db.exec("reset role");
    expect(
      (
        await db.query(
          "select status from private.agency_authorisations where id=$1",
          [d.id],
        )
      ).rows[0],
    ).toEqual({ status: "needs_information" });
    version = await auditVersion(d.id);
    await reviewer();
    await db.query("select public.manage_agency('review',null,$1,$2)", [
      d.id,
      {
        version,
        decision: "approve",
        reason:
          "Employer and agreement independently verified after dispute resolution.",
        identityChecked: true,
        authorityChecked: true,
      },
    ]);
    await db.exec("reset role");
    expect(
      (
        await db.query("select private.agency_authority_valid($1,$2) valid", [
          d.id,
          org,
        ])
      ).rows[0],
    ).toEqual({ valid: true });
    expect(
      (await db.query("select status from public.jobs where id=$1", [roleB]))
        .rows[0],
    ).toEqual({ status: "closed" });
  });
  it("requires declarations and branding permission, rejects quota overflow and prevents self-clearing audited holds", async () => {
    await agency();
    await asUser(employer);
    await expect(
      db.query("select public.manage_agency('client_create',$1,null,$2)", [
        org,
        {
          name: "Disclosed client",
          representativeName: "Client Owner",
          representativeEmail: "rep@client.example",
          publicLabel: "Client Brand",
          disclosed: true,
        },
      ]),
    ).rejects.toMatchObject({ code: "22023" });
    const d = await clientDeclaration();
    let version = await auditVersion(d.id);
    await reviewer();
    await expect(
      db.query("select public.manage_agency('review',null,$1,$2)", [
        d.id,
        {
          version: new Date(Date.now() + 999999).toISOString(),
          decision: "request_information",
          reason: "Need agreement evidence for this risk-based audit.",
        },
      ]),
    ).rejects.toMatchObject({ code: "40001" });
    await db.query("select public.manage_agency('review',null,$1,$2)", [
      d.id,
      {
        version,
        decision: "request_information",
        reason: "Need agreement evidence for this risk-based audit.",
      },
    ]);
    version = await auditVersion(d.id);
    await asUser(employer);
    await expect(
      db.query("select public.manage_agency('clear_block',null,$1,$2)", [
        d.id,
        {
          version,
          reason: "Attempt to clear my own advertising hold.",
          identityChecked: true,
          authorityChecked: true,
        },
      ]),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      db.query("select public.manage_agency('declare_client',$1,$2,$3)", [
        org,
        d.client,
        d.details,
      ]),
    ).rejects.toMatchObject({ code: "42501" });
    await reviewer();
    await db.query("select public.manage_agency('review',null,$1,$2)", [
      d.id,
      {
        version,
        decision: "approve",
        reason: "Agreement and representative independently verified.",
        identityChecked: true,
        authorityChecked: true,
      },
    ]);
    await db.exec("reset role");
    expect(
      (
        await db.query("select private.agency_authority_valid($1,$2) valid", [
          d.id,
          org,
        ])
      ).rows[0],
    ).toEqual({ valid: true });
    await db.query(
      "update public.business_subscriptions set tier='agency_starter' where organisation_id=$1",
      [org],
    );
    await db.exec(
      "update private.agency_plan_limits set clients=2 where tier='agency_starter'",
    );
    await asUser(employer);
    const overflow = (
      await db.query<{ d: { id: string } }>(
        "select public.manage_agency('client_create',$1,null,$2) d",
        [
          org,
          {
            name: "Overflow client",
            representativeName: "Client Owner",
            representativeEmail: "overflow@client.example",
          },
        ],
      )
    ).rows[0].d.id;
    await expect(
      db.query("select public.manage_agency('declare_client',$1,$2,$3)", [
        org,
        overflow,
        d.details,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      db.query("select public.manage_agency('declare_client',$1,$2,$3)", [
        org,
        overflow,
        { ...d.details, advertisingConfirmed: false },
      ]),
    ).rejects.toMatchObject({ code: "22023" });
  });
  it("discovers an agency's published category only while its client mandate is active", async () => {
    await agency();
    await db.query(
      "update public.jobs set category='Agency technology' where id=$1",
      [job],
    );
    await db.query(
      "update public.jobs set status='published',moderation_status='approved' where id=$1",
      [job],
    );
    await asUser("", "anon");
    expect(
      (await db.query("select public.employer_role_categories() category"))
        .rows,
    ).toEqual([{ category: "Agency technology" }]);
    await db.exec("reset role");
    await db.query(
      "update private.agency_authorisations set status='revoked' where id=$1",
      [authority],
    );
    await asUser("", "anon");
    expect(
      (await db.query("select public.employer_role_categories() category"))
        .rows,
    ).toEqual([]);
  });
  it("scopes private client lists and keeps mandate review independent and version checked", async () => {
    await agency();
    await asUser(otherCandidate);
    await expect(
      db.query("select public.manage_agency('revoke',$1,$2,$3)", [
        org,
        authority,
        JSON.stringify({
          reason: "An unrelated account attempts a mandate revocation.",
        }),
      ]),
    ).rejects.toMatchObject({ code: "42501" });
    await asUser(otherEmployer);
    const hidden = (
      await db.query<{ d: { clients: unknown[]; authorisations: unknown[] } }>(
        "select public.manage_agency('list',$1) d",
        [org],
      )
    ).rows[0].d;
    expect(hidden.clients).toHaveLength(0);
    expect(hidden.authorisations).toHaveLength(0);
    await asUser(recruiter);
    expect(
      (
        await db.query<{ d: { clients: unknown[] } }>(
          "select public.manage_agency('list',$1) d",
          [org],
        )
      ).rows[0].d.clients,
    ).toHaveLength(1);
    await db.exec("reset role");
    await db.query(
      "insert into private.staff_members(user_id,role) values($1,'reviewer')",
      [otherCandidate],
    );
    await asUser(otherCandidate);
    expect(
      (
        await db.query<{ d: { authorisations: unknown[] } }>(
          "select public.manage_agency('review_queue') d",
        )
      ).rows[0].d.authorisations,
    ).toHaveLength(0);
    await expect(
      db.query("select public.manage_agency('review',$1,$2,$3)", [
        org,
        authority,
        JSON.stringify({
          decision: "approve",
          version: new Date().toISOString(),
          reason: "Independent evidence checked again",
          identityChecked: true,
          authorityChecked: true,
        }),
      ]),
    ).rejects.toMatchObject({ code: "40001" });
  });
  it("corrects a reviewed identity only after an independent decision and preserves IDs", async () => {
    await db.query(
      "insert into public.business_accounts(user_id,kind,trading_name,terms_version,terms_sha256,accepted_at) values($1,'employer','Fern','v',repeat('a',64),now())",
      [employer],
    );
    await db.query(
      "insert into private.staff_members(user_id,role) values($1,'reviewer')",
      [otherCandidate],
    );
    await asUser(employer);
    await expect(
      db.query(
        "update public.business_accounts set kind='agency' where user_id=$1",
        [employer],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    const request = (
      await db.query<{ d: { id: string } }>(
        "select public.manage_business_type('request',$1,$2) d",
        [
          org,
          JSON.stringify({
            kind: "agency",
            evidence:
              "This business is a recruitment agency and independent authority evidence supports this correction.",
            specialisms: ["Design"],
            regions: ["VIC"],
          }),
        ],
      )
    ).rows[0].d;
    await db.exec("reset role");
    const version = (
      await db.query<{ updated_at: Date }>(
        "select updated_at from private.business_type_corrections where id=$1",
        [request.id],
      )
    ).rows[0].updated_at;
    await asUser(employer);
    await expect(
      db.query("select public.manage_business_type('review',$1,$2)", [
        request.id,
        JSON.stringify({
          decision: "approve",
          version,
          reason: "Independent correction evidence checked",
          identityChecked: true,
          authorityChecked: true,
        }),
      ]),
    ).rejects.toMatchObject({ code: "42501" });
    await asUser(otherCandidate);
    await db.query("select public.manage_business_type('review',$1,$2)", [
      request.id,
      JSON.stringify({
        decision: "approve",
        version,
        reason: "Independent correction evidence checked",
        identityChecked: true,
        authorityChecked: true,
      }),
    ]);
    await db.exec("reset role");
    expect(
      (
        await db.query("select id,kind from public.organisations where id=$1", [
          org,
        ])
      ).rows[0],
    ).toEqual({ id: org, kind: "agency" });
    expect(
      (
        await db.query(
          "select status from private.business_type_corrections where id=$1",
          [request.id],
        )
      ).rows[0],
    ).toEqual({ status: "completed" });
    expect(
      (await db.query("select id,status from public.jobs where id=$1", [job]))
        .rows[0],
    ).toEqual({ id: job, status: "draft" });
  });
  it("applies agency seat limits to admin client records and direct membership reads", async () => {
    await agency();
    await db.query(
      "update public.organisation_members set role='admin' where organisation_id=$1 and user_id=$2",
      [org, recruiter],
    );
    await db.query(
      "update public.organisation_members set created_at=now()-interval '1 hour' where organisation_id=$1 and user_id=$2",
      [org, otherEmployer],
    );
    await db.query(
      "update public.business_subscriptions set tier='agency_starter' where organisation_id=$1",
      [org],
    );
    await asUser(recruiter);
    expect(
      (
        await db.query(
          "select organisation_id from public.organisation_members where organisation_id=$1",
          [org],
        )
      ).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select public.manage_agency('list',$1)", [org]),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      db.query("select public.manage_agency('client_create',$1,null,$2)", [
        org,
        JSON.stringify({
          name: "Surplus admin client",
          representativeName: "Fixture",
          representativeEmail: "fixture@example.test",
          publicLabel: "Confidential client",
        }),
      ]),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("expires temporary staff access without requiring a new login", async () => {
    await db.query(
      "insert into private.staff_members(user_id,role,expires_at) values($1,'reviewer',now()+interval '5 minutes')",
      [otherCandidate],
    );
    await asUser(otherCandidate);
    expect(
      (
        await db.query<{ role: string | null }>(
          "select public.my_staff_role() role",
        )
      ).rows[0].role,
    ).toBe("reviewer");
    await db.exec("reset role");
    await db.query(
      "update private.staff_members set expires_at=now()-interval '1 second' where user_id=$1",
      [otherCandidate],
    );
    await asUser(otherCandidate);
    expect(
      (
        await db.query<{ role: string | null }>(
          "select public.my_staff_role() role",
        )
      ).rows[0].role,
    ).toBeNull();
    await expect(
      db.query("select public.manage_agency('review_queue')"),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("allows an agency owner to create and return a private draft without opening draft access to recruiters", async () => {
    await agency();
    await asUser(employer);
    const created = (
      await db.query<{ id: string; status: string }>(
        "insert into public.jobs(organisation_id,title,company,location,city,state,work_mode,employment_type,description,status) values($1,'Agency owner draft','Fern Studio','Melbourne VIC','Melbourne','VIC','Hybrid','Full time','A private agency draft created through an authenticated session.','draft') returning id,status",
        [org],
      )
    ).rows[0];
    expect(created.status).toBe("draft");
    await asUser(recruiter);
    expect(
      (await db.query("select id from public.jobs where id=$1", [created.id]))
        .rows,
    ).toHaveLength(0);
    await expect(
      db.query(
        "insert into public.jobs(organisation_id,title,company,location,city,state,work_mode,employment_type,description,status) values($1,'Unassigned recruiter draft','Fern Studio','Melbourne VIC','Melbourne','VIC','Hybrid','Full time','A recruiter cannot create an unassigned agency vacancy.','draft') returning id",
        [org],
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("enforces the pooled active-vacancy cap without charging a renewal twice", async () => {
    await agency();
    await db.query(
      "update public.business_subscriptions set tier='agency_starter' where organisation_id=$1",
      [org],
    );
    await db.query(
      "update public.jobs set status='closed' where organisation_id=$1",
      [org],
    );
    const published: string[] = [];
    for (let i = 0; i < 6; i++) {
      const id = (
        await db.query<{ id: string }>(
          "insert into public.jobs(organisation_id,title,company,location,city,state,work_mode,employment_type,description,status) values($1,$2,'Fern Studio','Melbourne VIC','Melbourne','VIC','Hybrid','Full time','A synthetic agency vacancy for pooled capacity checks.','draft') returning id",
          [org, `Capacity vacancy ${i}`],
        )
      ).rows[0].id;
      const publish = () =>
        db.query(
          "update public.jobs set status='published',published_at=now(),moderation_status='approved',expires_at=now()+interval '20 days' where id=$1",
          [id],
        );
      if (i < 5) {
        await publish();
        published.push(id);
      } else await expect(publish()).rejects.toMatchObject({ code: "23514" });
    }
    await asUser(employer);
    await db.query("select public.renew_listing($1)", [published[0]]);
    await db.exec("reset role");
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from public.jobs where organisation_id=$1 and status='published'",
          [org],
        )
      ).rows[0].n,
    ).toBe(5);
  });
  it("holds a subscribed correction until the owner accepts exact billing terms and trusted reconciliation confirms them", async () => {
    await db.query(
      "insert into public.business_accounts(user_id,kind,trading_name,terms_version,terms_sha256,accepted_at) values($1,'employer','Fern','v',repeat('a',64),now())",
      [employer],
    );
    await db.query(
      "insert into public.organisation_billing_accounts(organisation_id,billing_user_id,stripe_customer_id,audience) values($1,$2,'cus_transition','employer')",
      [org, employer],
    );
    await db.query(
      "insert into public.business_subscriptions(organisation_id,stripe_customer_id,stripe_subscription_id,tier,status,current_period_start,current_period_end) values($1,'cus_transition','sub_transition','growth','active',now(),now()+interval '1 month')",
      [org],
    );
    await db.query(
      "insert into private.staff_members(user_id,role) values($1,'reviewer')",
      [otherCandidate],
    );
    await asUser(employer);
    const id = (
      await db.query<{ d: { id: string } }>(
        "select public.manage_business_type('request',$1,$2) d",
        [
          org,
          JSON.stringify({
            kind: "agency",
            evidence:
              "Independent evidence for the agency identity and subscribed account correction.",
            specialisms: ["Design"],
            regions: ["VIC"],
          }),
        ],
      )
    ).rows[0].d.id;
    await db.exec("reset role");
    const version = (
      await db.query<{ v: Date }>(
        "select updated_at v from private.business_type_corrections where id=$1",
        [id],
      )
    ).rows[0].v;
    await asUser(otherCandidate);
    await db.query("select public.manage_business_type('review',$1,$2)", [
      id,
      JSON.stringify({
        decision: "approve",
        version,
        reason: "Independently verified the corrected agency identity.",
        identityChecked: true,
        authorityChecked: true,
      }),
    ]);
    await db.exec("reset role");
    expect(
      (
        await db.query("select kind from public.organisations where id=$1", [
          org,
        ])
      ).rows[0],
    ).toEqual({ kind: "employer" });
    await asUser(employer);
    await expect(
      db.query("select public.business_type_billing('complete',$1,$2,'{}')", [
        id,
        employer,
      ]),
    ).rejects.toMatchObject({ code: "42501" });
    await asUser("", "service_role");
    await db.query("select public.business_type_billing('quote',$1,$2,$3)", [
      id,
      employer,
      JSON.stringify({
        hash: "a".repeat(64),
        quote: {
          subscriptionId: "sub_transition",
          priceId: "price_agency",
          plan: "agency_growth",
        },
      }),
    ]);
    await asUser(employer);
    await expect(
      db.query("select public.manage_business_type('accept',$1,$2)", [
        id,
        JSON.stringify({ quoteHash: "b".repeat(64) }),
      ]),
    ).rejects.toMatchObject({ code: "40001" });
    await db.query("select public.manage_business_type('accept',$1,$2)", [
      id,
      JSON.stringify({ quoteHash: "a".repeat(64) }),
    ]);
    await asUser("", "service_role");
    await expect(
      db.query("select public.business_type_billing('complete',$1,$2,$3)", [
        id,
        employer,
        JSON.stringify({
          subscriptionId: "sub_other",
          priceId: "price_agency",
        }),
      ]),
    ).rejects.toMatchObject({ code: "42501" });
    await db.query("select public.business_type_billing('complete',$1,$2,$3)", [
      id,
      employer,
      JSON.stringify({
        subscriptionId: "sub_transition",
        priceId: "price_agency",
      }),
    ]);
    await db.exec("reset role");
    expect(
      (
        await db.query("select kind from public.organisations where id=$1", [
          org,
        ])
      ).rows[0],
    ).toEqual({ kind: "agency" });
    expect(
      (
        await db.query(
          "select stripe_customer_id,audience from public.organisation_billing_accounts where billing_user_id=$1",
          [employer],
        )
      ).rows[0],
    ).toEqual({ stripe_customer_id: "cus_transition", audience: "agency" });
    expect(
      (
        await db.query(
          "select stripe_subscription_id from public.business_subscriptions where organisation_id=$1",
          [org],
        )
      ).rows[0],
    ).toEqual({ stripe_subscription_id: "sub_transition" });
  });
  it("keeps default business selection inside current verified memberships", async () => {
    await db.query(
      "insert into public.business_accounts(user_id,kind,trading_name,terms_version,terms_sha256,accepted_at) values($1,'employer','Fern','v',repeat('a',64),now())",
      [employer],
    );
    await asUser(employer);
    await db.query("select public.set_default_business($1)", [org]);
    await expect(
      db.query("select public.set_default_business($1)", [otherOrg]),
    ).rejects.toMatchObject({ code: "42501" });
    expect(
      (
        await db.query(
          "select default_organisation_id from public.business_accounts",
        )
      ).rows[0],
    ).toMatchObject({ default_organisation_id: org });
  });
  it("requires vacancy assignments across applicant RPCs, direct rows and role aggregates", async () => {
    await agency();
    await asUser(candidate);
    const a = (
      await db.query<{ id: string }>(
        "insert into public.applications(candidate_id,job_id,cv_text_snapshot) values($1,$2,repeat('Synthetic CV experience and skills. ',10)) returning id",
        [candidate, job],
      )
    ).rows[0].id;
    await asUser(otherEmployer);
    expect(
      (await db.query("select * from public.applications where id=$1", [a]))
        .rows,
    ).toHaveLength(0);
    await expect(
      db.query("select public.open_application($1)", [a]),
    ).rejects.toMatchObject({ code: "42501" });
    await expect(
      db.query("select public.list_job_applications($1)", [job]),
    ).rejects.toMatchObject({ code: "42501" });
    expect(
      (
        await db.query<{ value: unknown[] }>(
          "select public.role_overview() value",
        )
      ).rows[0].value,
    ).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: job })]),
    );
    await asUser(recruiter);
    expect(
      (
        await db.query<{ data: unknown[] }>(
          "select public.list_job_applications($1) data",
          [job],
        )
      ).rows[0].data,
    ).toHaveLength(1);
    expect(
      (await db.query("select id from public.jobs where id=$1", [roleB])).rows,
    ).toHaveLength(0);
    await db.query("select public.open_application($1)", [a]);
    await db.exec("reset role");
    expect(
      (
        await db.query(
          "select user_id from public.notifications where event_key like 'hiring-submission:%' and user_id=$1",
          [otherEmployer],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("freezes safe application attribution and blocks reads and intake immediately on mandate expiry", async () => {
    await agency();
    await asUser(candidate);
    const a = (
      await db.query<{ id: string }>(
        "insert into public.applications(candidate_id,job_id,cv_text_snapshot) values($1,$2,repeat('Synthetic CV experience and skills. ',10)) returning id",
        [candidate, job],
      )
    ).rows[0].id;
    const snapshot = (
      await db.query<{
        advertiser_kind_snapshot: string;
        client_label_snapshot: string;
        recipient_snapshot: string;
      }>(
        "select advertiser_kind_snapshot,client_label_snapshot,recipient_snapshot from public.applications where id=$1",
        [a],
      )
    ).rows[0];
    expect(snapshot).toEqual({
      advertiser_kind_snapshot: "agency",
      client_label_snapshot: "Confidential client",
      recipient_snapshot: "Fern Studio (recruitment agency)",
    });
    await db.exec("reset role");
    await db.query(
      "update private.agency_authorisations set valid_until=now()-interval '1 minute',valid_from=now()-interval '2 days' where id=$1",
      [authority],
    );
    await asUser(recruiter);
    await expect(
      db.query("select public.open_application($1)", [a]),
    ).rejects.toMatchObject({ code: "42501" });
    await asUser(otherCandidate);
    await expect(
      db.query(
        "insert into public.applications(candidate_id,job_id,cv_text_snapshot) values($1,$2,repeat('Synthetic CV experience and skills. ',10))",
        [otherCandidate, job],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await asUser("", "anon");
    expect(
      (await db.query("select id from public.jobs where id=$1", [job])).rows,
    ).toHaveLength(0);
    await asUser(candidate);
    expect(
      (
        await db.query(
          "select recipient_snapshot from public.applications where id=$1",
          [a],
        )
      ).rows[0],
    ).toEqual({ recipient_snapshot: snapshot.recipient_snapshot });
  });
  it("revocation cancels unsent application mail and membership replay does not restore assignments", async () => {
    await agency();
    await asUser(candidate);
    const a = (
      await db.query<{ id: string }>(
        "insert into public.applications(candidate_id,job_id,cv_text_snapshot) values($1,$2,repeat('Synthetic CV experience and skills. ',10)) returning id",
        [candidate, job],
      )
    ).rows[0].id;
    await db.exec("reset role");
    await db.query(
      "delete from public.organisation_members where organisation_id=$1 and user_id=$2",
      [org, recruiter],
    );
    await db.query(
      "insert into public.organisation_members(organisation_id,user_id,role) values($1,$2,'recruiter')",
      [org, recruiter],
    );
    await asUser(recruiter);
    await expect(
      db.query("select public.open_application($1)", [a]),
    ).rejects.toMatchObject({ code: "42501" });
    await asUser(employer);
    await db.query("select public.manage_agency('revoke',$1,$2,$3)", [
      org,
      authority,
      JSON.stringify({
        reason: "Client ended the agency recruitment mandate.",
      }),
    ]);
    await db.exec("reset role");
    expect(
      (await db.query("select status from public.jobs where id=$1", [job]))
        .rows[0],
    ).toEqual({ status: "closed" });
    expect(
      (
        await db.query<{ status: string }>(
          "select status from private.alert_outbox where event_key like 'application:%'",
        )
      ).rows.every((r) => r.status !== "queued"),
    ).toBe(true);
  });
  it("keeps private client identity out of public projections and cannot transfer an application to another engagement", async () => {
    await agency();
    await asUser("", "anon");
    const visible = (
      await db.query<{ value: Record<string, unknown> }>(
        "select to_jsonb(j) value from public.jobs j where id=$1",
        [job],
      )
    ).rows[0].value;
    expect(JSON.stringify(visible)).not.toContain("Secret Client Legal Name");
    expect(visible).toMatchObject({
      advertiser_kind: "agency",
      client_label: "Confidential client",
    });
    await asUser(candidate);
    await db.query(
      "insert into public.applications(candidate_id,job_id,cv_text_snapshot) values($1,$2,repeat('Synthetic CV experience and skills. ',10))",
      [candidate, job],
    );
    await asUser(employer);
    await expect(
      db.query("select public.manage_agency('configure_job',$1,null,$2)", [
        org,
        JSON.stringify({
          jobId: job,
          mode: "internal",
          leadName: "Agency Owner",
          leadUserId: employer,
        }),
      ]),
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("locks agency billing audience and enforces approved seat allowances including reservations", async () => {
    await agency();
    await db.query(
      "delete from public.organisation_members where organisation_id=$1 and role='recruiter'",
      [org],
    );
    await db.query(
      "update public.business_subscriptions set tier='agency_starter' where organisation_id=$1",
      [org],
    );
    await db.exec(
      "insert into private.alert_settings(singleton,site_origin,unsubscribe_origin,sending_enabled) values(true,'https://careers.example.test','https://careers.example.test/unsubscribe',false)",
    );
    await asUser(employer);
    await db.query(
      "select public.manage_business_team('invite',$1,'first@example.test')",
      [org],
    );
    await expect(
      db.query(
        "select public.manage_business_team('invite',$1,'second@example.test')",
        [org],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      db.query("select public.set_business_plan_organisations($1::uuid[])", [
        [otherOrg],
      ]),
    ).rejects.toMatchObject({ code: "42501" });
    await db.exec("reset role");
    expect(
      (
        await db.query<{ q: unknown }>("select private.agency_quota($1) q", [
          org,
        ])
      ).rows[0].q,
    ).toMatchObject({ vacancies: 5, clients: 5, seats: 2, usedSeats: 2 });
  });
  it.each([
    ["agency_starter", 5],
    ["agency_growth", 20],
    ["agency_enterprise", 50],
  ] as const)(
    "enforces %s active-client capacity at independent approval and frees it on revocation",
    async (tier, limit) => {
      await agency();
      await db.query(
        "update public.business_subscriptions set tier=$1 where organisation_id=$2",
        [tier, org],
      );
      for (let i = 1; i < limit; i++) {
        const c = (
          await db.query<{ id: string }>(
            "insert into private.agency_clients(agency_id,name,public_label,representative_name,representative_email,created_by) values($1,$2,'Confidential client','Synthetic rep','rep@example.test',$3) returning id",
            [org, `Private synthetic client ${i}`, employer],
          )
        ).rows[0].id;
        await db.query(
          "insert into private.agency_authorisations(client_id,agency_id,evidence,valid_from,valid_until,status,created_by) values($1,$2,repeat('Synthetic authority evidence. ',3),now()-interval '1 day',now()+interval '30 days','approved',$3)",
          [c, org, employer],
        );
      }
      const c = (
        await db.query<{ id: string }>(
          "insert into private.agency_clients(agency_id,name,public_label,representative_name,representative_email,created_by) values($1,'Overflow client','Confidential client','Synthetic rep','rep@example.test',$2) returning id",
          [org, employer],
        )
      ).rows[0].id;
      const a = (
        await db.query<{ id: string; updated_at: string }>(
          "insert into private.agency_authorisations(client_id,agency_id,evidence,valid_from,valid_until,created_by) values($1,$2,repeat('Synthetic authority evidence. ',3),now()-interval '1 day',now()+interval '30 days',$3) returning id,updated_at",
          [c, org, employer],
        )
      ).rows[0];
      await db.query(
        "insert into private.staff_members(user_id,role,enabled) values($1,'reviewer',true)",
        [otherCandidate],
      );
      await asUser(otherCandidate);
      const approve = () =>
        db.query("select public.manage_agency('review',$1,$2,$3)", [
          org,
          a.id,
          {
            decision: "approve",
            version: a.updated_at,
            identityChecked: true,
            authorityChecked: true,
            reason: "Synthetic independent capacity approval.",
          },
        ]);
      await expect(approve()).rejects.toMatchObject({ code: "23514" });
      await db.query("select public.manage_agency('revoke',$1,$2,$3)", [
        org,
        authority,
        { reason: "Synthetic client capacity release after revocation." },
      ]);
      await approve();
      await db.exec("reset role");
      expect(
        (
          await db.query<{ q: { usedClients: number } }>(
            "select private.agency_quota($1) q",
            [org],
          )
        ).rows[0].q.usedClients,
      ).toBe(limit);
    },
  );
});

describe("search preview cooldown and mail dispatch", () => {
  it("enforces a 15 minute preview cooldown across searches and keeps other users independent", async () => {
    await db.exec(
      "insert into private.alert_settings(singleton,site_origin,unsubscribe_origin,sending_enabled) values(true,'https://westmere.example','https://ldmwqupidlgrkkjjpcvn.supabase.co/functions/v1/westmere-alerts/unsubscribe',true)",
    );
    await asUser(candidate);
    const create = async (name: string) =>
      (
        await db.query<{ id: string }>(
          "select public.save_search(null,$1,$2,true,'daily',true) id",
          [name, { keyword: "designer", location: "Melbourne VIC" }],
        )
      ).rows[0].id;
    const first = await create("First search"),
      second = await create("Second search");
    await db.query("select public.preview_search_alert($1)", [first]);
    await expect(
      db.query("select public.preview_search_alert($1)", [second]),
    ).rejects.toMatchObject({ code: "P0001" });
    expect(
      (
        await db.query<{ at: string }>(
          "select public.my_preview_available_at() at",
        )
      ).rows[0].at,
    ).toBeTruthy();
    await db.exec("reset role");
    await db.query(
      "update private.alert_preview_allowance set recent_requests=array[now()-interval '16 minutes'] where user_id=$1",
      [candidate],
    );
    await asUser(candidate);
    await db.query("select public.preview_search_alert($1)", [second]);
    await asUser(otherCandidate);
    const other = await create("Independent search");
    await db.query("select public.preview_search_alert($1)", [other]);
  });
  it("leases one delivery worker at a time and excludes reserved invalid recipients", async () => {
    await db.exec(
      "insert into private.alert_settings(singleton,site_origin,unsubscribe_origin,sending_enabled) values(true,'https://westmere.example','https://ldmwqupidlgrkkjjpcvn.supabase.co/functions/v1/westmere-alerts/unsubscribe',true)",
    );
    const first = (
      await db.query<{ q: unknown[] }>("select public.claim_job_alerts() q")
    ).rows[0].q;
    expect(
      (await db.query("select public.claim_job_alerts() q")).rows[0],
    ).toEqual({ q: [] });
    await db.query("select public.finish_alert_dispatch(60)");
    expect(
      (await db.query("select public.claim_job_alerts() q")).rows[0],
    ).toEqual({ q: [] });
    await db.query(
      "update private.alert_dispatch_control set provider_resume_at=now()-interval '1 second' where singleton",
    );
    const invalid = (
      await db.query<{ valid: boolean }>(
        'select private.delivery_eligible(jsonb_populate_record(null::private.alert_outbox,\'{"recipient":"synthetic@example.invalid"}\')) valid',
      )
    ).rows[0];
    expect(invalid).toEqual({ valid: false });
    await asUser(candidate);
    await expect(
      db.query("select public.finish_alert_dispatch(0)"),
    ).rejects.toMatchObject({ code: "42501" });
  });
});

describe("candidate search and response quality", () => {
  it("selects only the first owned upload as the base CV and keeps later uploads separate", async () => {
    const insert = async (id: string) =>
      db.query(
        "insert into public.candidate_cvs(id,user_id,filename,storage_path,media_type,bytes,extracted_text) values($1,$2,'CV.pdf',$3,'application/pdf',100,repeat('Supported skills and experience. ',4))",
        [id, candidate, id],
      );
    const first = "50000000-0000-4000-8000-000000000081",
      second = "50000000-0000-4000-8000-000000000082";
    await insert(first);
    await insert(second);
    expect(
      (
        await db.query("select active_cv_id from public.profiles where id=$1", [
          candidate,
        ])
      ).rows[0],
    ).toEqual({ active_cv_id: first });
  });
  it("retains immutable closed listings only for candidates who saved or applied", async () => {
    await asUser(candidate);
    await db.query(
      "insert into public.saved_jobs(user_id,job_id) values($1,$2)",
      [candidate, job],
    );
    await db.query(
      "insert into public.applications(job_id,candidate_id,cv_text_snapshot) values($1,$2,repeat('Real supported experience. ',5))",
      [job, candidate],
    );
    await db.exec("reset role");
    await db.query(
      "update public.jobs set status='closed',description='Changed after closure' where id=$1",
      [job],
    );
    await asUser(candidate);
    const kept = (
      await db.query<{
        roles: { snapshot: { description: string }; closed: boolean }[];
      }>("select public.my_retained_roles() roles")
    ).rows[0].roles;
    expect(kept).toHaveLength(2);
    expect(
      kept.every(
        (r) => r.closed && r.snapshot.description !== "Changed after closure",
      ),
    ).toBe(true);
    await asUser(otherCandidate);
    expect(
      (await db.query("select public.my_retained_roles() roles")).rows[0],
    ).toEqual({ roles: [] });
    await asUser("", "anon");
    expect(
      (await db.query("select id from public.jobs where id=$1", [job])).rows,
    ).toHaveLength(0);
    await expect(
      db.query("select public.my_retained_roles()"),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("requires two restrictive groups for saved searches and cannot count radius or every work option twice", async () => {
    await asUser(candidate);
    for (const filters of [
      {},
      {
        location: "Melbourne VIC",
        distance: 250,
        centreLat: -37.8,
        centreLon: 145,
      },
      {
        workMode: ["On-site", "Hybrid", "Remote"],
        employmentType: ["Full time", "Part time", "Contract", "Casual"],
      },
    ])
      await expect(
        db.query(
          "select public.save_search(null,'Broad search',$1,false,'daily',false)",
          [filters],
        ),
      ).rejects.toMatchObject({ code: "22023" });
    await db.query(
      "select public.save_search(null,'Specific search',$1,false,'daily',false)",
      [{ keyword: "designer", location: "Melbourne VIC" }],
    );
  });
  it("uses recorded meaningful on-site responses and affirms feedback without allowing duplicate title reviews", async () => {
    await asUser(candidate);
    await db.exec("reset role");
    const a = (
      await db.query<{ id: string }>(
        "insert into public.applications(job_id,candidate_id,cv_text_snapshot,created_at) values($1,$2,repeat('Real supported experience. ',5),now()-interval '5 days') returning id",
        [job, candidate],
      )
    ).rows[0].id;
    await db.exec("reset role");

    await asUser(employer);
    await db.query("select public.open_application($1)", [a]);
    await db.query(
      "select public.update_application_stage($1,'interview','We would like to invite you to a meaningful interview.')",
      [a],
    );
    await db.exec("reset role");
    await db.query(
      "update public.jobs set source='external',external_url='https://example.test/apply' where id=$1",
      [job],
    );
    await asUser(candidate);
    await db.query(
      "select public.submit_response_report($1,null,null,null,true,now())",
      [a],
    );
    expect(
      (
        await db.query(
          "select corroborated,moderation_status from public.response_reports where application_id=$1",
          [a],
        )
      ).rows[0],
    ).toEqual({ corroborated: true, moderation_status: "accepted" });
    await expect(
      db.query(
        "select public.submit_response_report($1,null,null,null,true,now())",
        [a],
      ),
    ).rejects.toMatchObject({ code: "23505" });
    await db.exec("reset role");
    expect(
      (
        await db.query(
          "select event_type from public.application_events where application_id=$1 and meaningful_response",
          [a],
        )
      ).rows,
    ).toEqual([{ event_type: "employer_update" }]);
  });
  it("keeps inaccurate candidate reports out of on-site response averages", async () => {
    for (let i = 0; i < 10; i++) {
      const id = `10000000-0000-4000-9000-${String(i).padStart(12, "0")}`;
      await db.query(
        "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
        [id, `cohort${i}@example.test`],
      );
      await asUser(id);
      await db.exec("reset role");
      const a = (
        await db.query<{ id: string }>(
          "insert into public.applications(job_id,candidate_id,cv_text_snapshot,created_at) values($1,$2,repeat('Supported applicant experience. ',4),now()-interval '4 months') returning id",
          [job, id],
        )
      ).rows[0].id;
      await db.exec("reset role");

      if (i < 5)
        await db.query(
          "insert into public.application_events(application_id,actor_id,event_type,message,occurred_at) select id,$2,'employer_update','A meaningful interview invitation',created_at+interval '10 days' from public.applications where id=$1",
          [a, employer],
        );
      await db.query(
        "insert into public.response_reports(candidate_id,application_id,organisation_id,job_reference,application_date,response_date,response_received,evidence_source,moderation_status) select candidate_id,id,$2,id::text,created_at,created_at+interval '1 day',true,'direct_application','accepted' from public.applications where id=$1",
        [a, org],
      );
    }
    await db.query("select private.refresh_response_insights($1)", [org]);
    expect(
      (
        await db.query(
          "select response_days::float8 response_days,eligible_reports,response_reports,no_response_reports from public.jobs where id=$1",
          [job],
        )
      ).rows[0],
    ).toEqual({
      response_days: 10,
      eligible_reports: 10,
      response_reports: 5,
      no_response_reports: 5,
    });
  });
  it("offers recent closed role titles, accepts off-site experiences, and prevents repeat reviews across duplicate titles", async () => {
    await db.query(
      "update public.jobs set source='external',external_url='https://example.test/apply',status='closed' where id=$1",
      [job],
    );
    await asUser(candidate);
    const roles = (
      await db.query<{ r: { id: string; title: string; closed: boolean }[] }>(
        "select public.response_report_roles($1) r",
        [org],
      )
    ).rows[0].r;
    expect(roles).toContainEqual(
      expect.objectContaining({ id: job, closed: true }),
    );
    await db.query(
      "select public.submit_response_report(null,$1,$2,now()-interval '4 days',false,null)",
      [org, job],
    );
    await expect(
      db.query(
        "select public.submit_response_report(null,$1,$2,now()-interval '4 days',false,null)",
        [org, job],
      ),
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      db.query(
        "select public.submit_response_report(null,$1,'Invented role',now(),false,null)",
        [org],
      ),
    ).rejects.toMatchObject({ code: "22023" });
  });
});

describe("candidate admin regression release", () => {
  it("approves a separately checked shared-ABN agency without granting the existing company", async () => {
    await db.exec("reset role");
    await db.query(
      "update public.organisations set abn='12345678901' where id=$1",
      [org],
    );
    await db.query(
      "insert into public.business_accounts(user_id,kind,trading_name,terms_version,terms_sha256) values($1,'agency','New Agency','test',repeat('a',64))",
      [candidate],
    );
    await asUser(candidate);
    const id = (
      await db.query<{ id: string }>(
        "select public.submit_typed_business_verification($1) id",
        [
          {
            kind: "employer",
            businessName: "Separate recruitment brand",
            abn: "12345678901",
            website: "https://brand.example.test",
            contactRole: "Director",
            evidence:
              "A separate authorised trading brand independently verifiable through the company contact.",
            linkedin: "https://linkedin.com/company/example",
            hrEmail: "hr@example.test",
            hrPhone: "+61 3 9000 0000",
            contactSource: "https://brand.example.test/contact",
            contactPermission: true,
            specialisms: ["Technology"],
            regions: ["VIC"],
          },
        ],
      )
    ).rows[0].id;
    await db.exec("reset role");
    await db.query(
      "insert into private.staff_members(user_id,role) values($1,'admin')",
      [otherCandidate],
    );
    const v = (
      await db.query<{ v: string }>(
        "select updated_at::text v from public.employer_verification_requests where id=$1",
        [id],
      )
    ).rows[0].v;
    await asUser(otherCandidate);
    await expect(
      db.query(
        "select public.review_business_verification($1,'approve','Independently checked this separate brand',$2,true,true,'agency',false)",
        [id, v],
      ),
    ).rejects.toMatchObject({ code: "22023" });
    await db.query(
      "select public.review_business_verification($1,'approve','Independently confirmed the shared ABN and separate agency authority',$2,true,true,'agency',true)",
      [id, v],
    );
    await asUser(candidate);
    expect(
      (
        await db.query(
          "select kind from public.business_accounts where user_id=$1",
          [candidate],
        )
      ).rows[0],
    ).toEqual({ kind: "agency" });
    expect(
      (
        await db.query(
          "select organisation_id from public.organisation_members where user_id=$1",
          [candidate],
        )
      ).rows,
    ).toHaveLength(1);
    expect(
      (
        await db.query(
          "select id,kind from public.organisations where name='Separate recruitment brand'",
        )
      ).rows[0],
    ).toMatchObject({ kind: "agency" });
    expect(
      (
        await db.query(
          "select organisation_id from public.organisation_members where user_id=$1 and organisation_id=$2",
          [candidate, org],
        )
      ).rows,
    ).toHaveLength(0);
  });
  it("removes the three-preview daily trap but still blocks previews inside fifteen minutes", async () => {
    await db.exec(
      "insert into private.alert_settings(singleton,site_origin,unsubscribe_origin,sending_enabled) values(true,'https://westmere.example','https://westmere.example/unsubscribe',true)",
    );
    await asUser(candidate);
    const id = (
      await db.query<{ id: string }>(
        "select public.save_search(null,'Designer Melbourne',$1,true,'daily',true) id",
        [{ keyword: "designer", location: "Melbourne VIC" }],
      )
    ).rows[0].id;
    await db.exec("reset role");
    await db.query(
      "insert into private.alert_preview_allowance(user_id,recent_requests) values($1,array[now()-interval '60 minutes',now()-interval '40 minutes',now()-interval '16 minutes'])",
      [candidate],
    );
    await asUser(candidate);
    await db.query("select public.preview_search_alert($1)", [id]);
    const delay = (
      await db.query<{ m: number }>(
        "select extract(epoch from (public.my_preview_available_at()-now()))/60 m",
      )
    ).rows[0].m;
    expect(Number(delay)).toBeGreaterThan(14);
    expect(Number(delay)).toBeLessThan(16);
    await expect(
      db.query("select public.preview_search_alert($1)", [id]),
    ).rejects.toMatchObject({ code: "P0001" });
  });
  it("paginates every email record privately with deterministic ordering", async () => {
    await db.query(
      "insert into private.alert_outbox(user_id,recipient,kind,snapshot,status) select $1,'candidate@example.test','account','{}','canceled' from generate_series(1,23)",
      [candidate],
    );
    await asUser(candidate);
    const read = async (n: number) =>
      (
        await db.query<{
          d: { deliveries: { id: string }[]; deliveryTotal: number };
        }>("select public.my_alert_activity($1) d", [n])
      ).rows[0].d;
    const a = await read(1),
      b = await read(2),
      c = await read(3);
    expect(a.deliveryTotal).toBeGreaterThanOrEqual(23);
    expect(a.deliveries).toHaveLength(10);
    expect(b.deliveries).toHaveLength(10);
    expect(c.deliveries.length).toBeGreaterThanOrEqual(3);
    expect(
      new Set(
        [...a.deliveries, ...b.deliveries, ...c.deliveries].map((d) => d.id),
      ).size,
    ).toBe(a.deliveryTotal);
    await asUser(otherCandidate);
    expect((await read(1)).deliveries).toHaveLength(0);
  });
  it("serves five collapsed-queue records per cursor and eleven activity records for lookahead", async () => {
    await db.query(
      "insert into private.staff_members(user_id,role) values($1,'admin')",
      [otherCandidate],
    );
    await db.exec(
      "insert into auth.users(id,email,email_confirmed_at) select gen_random_uuid(),'pagination-'||i||'@example.test',now() from generate_series(1,12)i",
    );
    await db.exec(
      "insert into public.employer_verification_requests(applicant_id,business_name,abn,website,contact_role,ownership_evidence) select id,'Brand '||email,lpad(row_number() over()::text,11,'0'),'https://example.test','Director',repeat('Verified independent authority evidence. ',2) from auth.users where email like 'pagination-%'",
    );
    await db.query(
      "insert into private.moderation_audit(actor_id,subject_type,subject_id,action,reason) select $1,'verification',gen_random_uuid(),'review','Synthetic pagination regression' from generate_series(1,23)",
      [otherCandidate],
    );
    await asUser(otherCandidate);
    const first = (
      await db.query<{
        d: {
          items: { id: string }[];
          cursor: { at: string; id: string };
          hasMore: boolean;
        };
      }>("select public.admin_queue('verification') d")
    ).rows[0].d;
    const next = (
      await db.query<{ d: { items: { id: string }[] } }>(
        "select public.admin_queue('verification',$1,$2) d",
        [first.cursor.at, first.cursor.id],
      )
    ).rows[0].d;
    expect(first.items).toHaveLength(5);
    expect(first.hasMore).toBe(true);
    expect(next.items).toHaveLength(5);
    expect(new Set([...first.items, ...next.items].map((x) => x.id)).size).toBe(
      10,
    );
    expect(
      (await db.query<{ d: unknown[] }>("select public.admin_activity() d"))
        .rows[0].d,
    ).toHaveLength(11);
  });
  it("suppresses small popularity samples then ranks actual deduplicated recognised searches", async () => {
    await asUser(candidate, "service_role");
    expect(
      (await db.query("select public.popular_site_searches() d")).rows[0],
    ).toEqual({ d: [] });
    for (let i = 0; i < 30; i++)
      await db.query("select public.record_site_search($1,$2,$3)", [
        crypto.randomUUID(),
        i < 20 ? "software engineer" : "designer",
        String(i).padStart(64, "a"),
      ]);
    expect(
      (await db.query("select public.popular_site_searches() d")).rows[0],
    ).toEqual({ d: ["software engineer", "designer"] });
    await asUser(candidate);
    await expect(
      db.query("select public.popular_site_searches()"),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("quarantines explicit noncompliance on direct publication and requires independent review", async () => {
    await asUser(employer);
    await db.query(
      "update public.jobs set description='Native English speakers only. This is an explicit restriction needing independent assessment.',publication_requested=true where id=$1",
      [job],
    );
    expect(
      (
        await db.query(
          "select status,moderation_status,publication_requested from public.jobs where id=$1",
          [job],
        )
      ).rows[0],
    ).toEqual({
      status: "draft",
      moderation_status: "quarantined",
      publication_requested: true,
    });
    await db.query(
      "update public.jobs set publication_requested=true where id=$1",
      [job],
    );
    expect(
      (await db.query("select status from public.jobs where id=$1", [job]))
        .rows[0],
    ).toEqual({ status: "draft" });
  });
});

describe("business review capacity", () => {
  const submit = (name: string, abn: string, id: string | null = null) =>
    db.query<{ id: string }>(
      "select public.submit_employer_verification($1,$2,'https://example.test','Director','Synthetic public authority evidence for independent business review.',$3) id",
      [name, abn, id],
    );
  it("reserves the free slot for a pending review and blocks every submission entry point at capacity", async () => {
    await asUser(otherCandidate);
    const id = (await submit("First test business", "12345678901")).rows[0].id;
    expect(
      (
        await db.query<{ c: Record<string, unknown> }>(
          "select public.my_business_registration_capacity() c",
        )
      ).rows[0].c,
    ).toMatchObject({
      limit: 1,
      owned: 0,
      pending: 1,
      remaining: 0,
      canSubmit: false,
    });
    await expect(
      submit("Second test business", "12345678902"),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      db.query("select public.submit_typed_business_verification($1)", [
        JSON.stringify({
          kind: "employer",
          businessName: "Typed overflow",
          abn: "12345678903",
          website: "https://example.test",
          contactRole: "Director",
          evidence: "Synthetic evidence checked independently.",
          linkedin: "https://www.linkedin.com/company/synthetic-test/",
          hrEmail: "hr@example.test",
          hrPhone: "12345678",
          contactSource: "https://example.test/contact",
          contactPermission: true,
        }),
      ]),
    ).rejects.toMatchObject({ code: "23514" });
    await db.exec("reset role");
    await db.query(
      "update public.employer_verification_requests set status='needs_information' where id=$1",
      [id],
    );
    await asUser(otherCandidate);
    await expect(
      submit("Updated first business", "12345678901", String(id)),
    ).resolves.toBeTruthy();
  });
  it("counts existing ownership and rejects direct insertion beyond the free allowance", async () => {
    await asUser(employer);
    expect(
      (
        await db.query<{ c: Record<string, unknown> }>(
          "select public.my_business_registration_capacity() c",
        )
      ).rows[0].c,
    ).toMatchObject({ limit: 1, owned: 1, pending: 0, canSubmit: false });
    await expect(submit("Extra business", "12345678909")).rejects.toMatchObject(
      { code: "23514" },
    );
    await db.exec("reset role");
    await expect(
      db.query(
        "insert into public.employer_verification_requests(applicant_id,business_name,abn,website,contact_role,ownership_evidence) values($1,'Direct overflow','12345678908','https://example.test','Director','Synthetic direct insertion cannot bypass the subscription allowance.')",
        [employer],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
  it.each([
    ["growth", 3],
    ["enterprise", 10],
    ["agency_growth", 3],
    ["agency_enterprise", 10],
  ] as const)(
    "enforces the %s business ceiling of %i including pending reviews",
    async (tier, limit) => {
      if (tier.startsWith("agency_"))
        await db.query(
          "update public.organisations set kind='agency' where id=$1",
          [org],
        );
      await db.query(
        "insert into public.organisation_billing_accounts(organisation_id,billing_user_id,stripe_customer_id,audience) values($1,$2,'cus_capacity',$3)",
        [org, employer, tier.startsWith("agency_") ? "agency" : "employer"],
      );
      await db.query(
        "insert into public.business_subscriptions(organisation_id,stripe_customer_id,tier,status,current_period_start,current_period_end) values($1,'cus_capacity',$2,'active',now(),now()+interval '1 month')",
        [org, tier],
      );
      for (let i = 0; i < limit - 2; i++)
        await db.query(
          "insert into public.employer_verification_requests(applicant_id,business_name,abn,website,contact_role,ownership_evidence,created_at) values($1,$2,$3,'https://example.test','Director','Synthetic historical pending review with an independent authority check.',now()-interval '40 days')",
          [employer, "Pending " + i, String(22345678900 + i)],
        );
      await asUser(employer);
      await submit("Last available business", "32345678901");
      expect(
        (
          await db.query<{ c: Record<string, unknown> }>(
            "select public.my_business_registration_capacity() c",
          )
        ).rows[0].c,
      ).toMatchObject({
        limit,
        used: limit,
        pending: limit - 1,
        canSubmit: false,
      });
      await expect(
        submit("One too many businesses", "32345678902"),
      ).rejects.toMatchObject({ code: "23514" });
    },
  );
  it("does not consume a business slot for an invitation and keeps each account's counts private", async () => {
    await db.query(
      "insert into public.organisation_members(organisation_id,user_id,role) values($1,$2,'recruiter')",
      [org, otherCandidate],
    );
    await asUser(otherCandidate);
    expect(
      (
        await db.query<{ c: Record<string, unknown> }>(
          "select public.my_business_registration_capacity() c",
        )
      ).rows[0].c,
    ).toMatchObject({ owned: 0, pending: 0, canSubmit: true });
    await asUser("", "anon");
    await expect(
      db.query("select public.my_business_registration_capacity()"),
    ).rejects.toMatchObject({ code: "42501" });
  });
});
