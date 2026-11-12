import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";

// Execute the real migration in isolated PostgreSQL/WASM. auth/storage fixtures model Supabase-owned schemas.
// This does not establish hosted Supabase configuration or test its HTTP gateway.
const candidate = "10000000-0000-4000-8000-000000000001";
const otherCandidate = "10000000-0000-4000-8000-000000000002";
const employer = "10000000-0000-4000-8000-000000000003";
const otherEmployer = "10000000-0000-4000-8000-000000000004";
const org = "20000000-0000-4000-8000-000000000001";
const otherOrg = "20000000-0000-4000-8000-000000000002";
const job = "30000000-0000-4000-8000-000000000001";
let db: PGlite;

async function asUser(id: string, role = "authenticated") {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec(`set role ${role}`);
}

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    create schema storage;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  `);
  const migrations = new URL("../supabase/migrations/", import.meta.url);
  for (const name of (await readdir(migrations))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    await db.exec(await readFile(new URL(name, migrations), "utf8"));
  }
  await db.exec(`
    insert into auth.users values('${candidate}'),('${otherCandidate}'),('${employer}'),('${otherEmployer}');
    insert into public.profiles(id,cv_text) values('${candidate}','Private candidate CV'),('${otherCandidate}','Other private CV');
    insert into public.organisations(id,name,slug,is_verified) values('${org}','Fern Studio','fern-studio',true),('${otherOrg}','Banksia Group','banksia-group',true);
    insert into public.organisation_members(organisation_id,user_id,role) values('${org}','${employer}','owner'),('${otherOrg}','${otherEmployer}','owner');
    insert into public.jobs(id,organisation_id,title,company,location,city,state,work_mode,employment_type,salary_min,salary_max,description,status,published_at)
      values('${job}','${org}','Product Designer','Fern Studio','Melbourne VIC','Melbourne','VIC','Hybrid','Full time',100000,130000,'Design thoughtful digital products with our team.','published',now()-interval '1 day');
    insert into public.billing_customers(user_id,stripe_customer_id) values('${candidate}','cus_candidate'),('${otherCandidate}','cus_other');
    insert into public.subscriptions(user_id,stripe_customer_id,stripe_subscription_id,status,price_id,current_period_start,current_period_end,last_event_created)
      values('${candidate}','cus_candidate','sub_candidate','active','price_careers_plus',now()-interval '1 day',now()+interval '29 days',10);
  `);
}, 20_000);

afterEach(async () => {
  await db?.close();
});

describe("database security boundaries", () => {
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
    for (let i = 1; i < 30; i++)
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

  it("derives direct response-report attribution and queues corrections for review", async () => {
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
        job_reference: id,
        evidence_source: "direct_application",
        moderation_status: "pending",
      },
    ]);
    await submit();
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
