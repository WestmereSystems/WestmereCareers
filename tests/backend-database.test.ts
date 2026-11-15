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
    create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
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
  it("keeps edited listings private until reviewed and rejects stale decisions", async () => {
    await asUser(employer);
    await db.query(
      "update public.jobs set title='Service Designer' where id=$1",
      [job],
    );
    const state = (
      await db.query(
        "select status,moderation_status,publication_requested from public.jobs where id=$1",
        [job],
      )
    ).rows[0];
    expect(state).toEqual({
      status: "draft",
      moderation_status: "pending",
      publication_requested: true,
    });
    await expect(
      db.query(
        "update public.jobs set moderation_status='approved' where id=$1",
        [job],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await asUser("", "anon");
    expect((await db.query("select id from public.jobs")).rows).toHaveLength(0);
    await staff();
    const queue = await db.query<{
      q: { items: { id: string; moderation_updated_at: string }[] };
    }>("select public.admin_queue('job') as q");
    expect(queue.rows[0].q.items).toHaveLength(1);
    const v = queue.rows[0].q.items[0].moderation_updated_at;
    await expect(
      db.query(
        "select public.review_trust_item('job',$1,'approve','Reviewed pay and role requirements','2000-01-01',false,false)",
        [job],
      ),
    ).rejects.toMatchObject({ code: "40001" });
    await db.query(
      "select public.review_trust_item('job',$1,'approve','Reviewed pay and role requirements',$2,false,false)",
      [job, v],
    );
    await asUser("", "anon");
    expect((await db.query("select id from public.jobs")).rows).toEqual([
      { id: job },
    ]);
    await expect(
      db.query("select * from public.listing_review_feedback"),
    ).rejects.toMatchObject({ code: "42501" });
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
      moderation_status: "pending",
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
        "select public.save_search(null,'My search','{}',false,'weekly',false) as id",
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
        "select public.save_search($1,'Hijacked search','{}',true,'daily',true)",
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
        "select public.save_search(null,'Another search','{}',true,'daily',true)",
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
            "select public.save_search(null,'Disposable preview','{}',true,'daily',true) id",
          )
        ).rows[0].id;
      await db.query("select public.preview_search_alert($1)", [id]);
      await db.query("select public.remove_saved_search($1)", [id]);
    }
    const next = (
      await db.query<{ id: string }>(
        "select public.save_search(null,'Another preview','{}',true,'daily',true) id",
      )
    ).rows[0].id;
    await expect(
      db.query("select public.preview_search_alert($1)", [next]),
    ).rejects.toMatchObject({ code: "P0001" });
    await expect(
      db.query("select * from private.alert_preview_allowance"),
    ).rejects.toMatchObject({ code: "42501" });
    await asUser(otherCandidate);
    const other = (
      await db.query<{ id: string }>(
        "select public.save_search(null,'Other account','{}',true,'daily',true) id",
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
    ).toEqual({ n: 3 });
    expect(
      (
        await db.query(
          "select count(*)::int n from private.alert_outbox where user_id=$1",
          [candidate],
        )
      ).rows[0],
    ).toEqual({ n: 0 });
  });
});
