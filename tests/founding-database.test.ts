import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
} from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
const owner = "71000000-0000-4000-8000-000000000001",
  other = "71000000-0000-4000-8000-000000000002",
  admin = "71000000-0000-4000-8000-000000000003",
  outsider = "71000000-0000-4000-8000-000000000004",
  org = "72000000-0000-4000-8000-000000000001",
  job = "73000000-0000-4000-8000-000000000001";
let db: PGlite;
let historicalWithdrawalPreserved = false;
let migratedPreferences: Record<string, unknown> = {};
async function as(id: string, role = "authenticated") {
  await db.exec(
    `reset role;select set_config('request.jwt.claim.sub','${id}',false);set role ${role};`,
  );
}
async function decision(
  action: string,
  id: string | null = null,
  kind: string | null = null,
  open = false,
) {
  return db.query(
    "select public.admin_launch($1,$2,$3,'Verified founding launch decision',$4) result",
    [action, id, kind, open],
  );
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz not null default clock_timestamp());create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated,service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
  );
  const dir = new URL("../supabase/migrations/", import.meta.url),
    files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    if (f.includes("founding_launch_access")) {
      await db.exec(
        `insert into auth.users values('${owner}','owner@example.test',now()),('${other}','other@example.test',now()),('${admin}','admin@example.test',now());insert into private.staff_members(user_id,role) values('${admin}','admin');insert into public.organisations(id,name,slug,is_verified) values('${org}','Real Melbourne Employer','real-melbourne',true);insert into public.organisation_members(organisation_id,user_id,role) values('${org}','${owner}','owner');insert into public.jobs(id,organisation_id,title,company,location,city,state,work_mode,employment_type,salary_min,salary_max,description,status,published_at,moderation_status) values('${job}','${org}','Office Coordinator','Real Melbourne Employer','Melbourne VIC','Melbourne','VIC','On-site','Full time',65000,75000,'Coordinate the office and support our Melbourne team.','published',now()-interval '1 day','approved');`,
      );
    }
    if (f.includes("default_launch_job_publication")) {
      await db.query("insert into private.launch_jobs(job_id) values($1)", [
        job,
      ]);
      await db.query(
        "insert into private.moderation_audit(id,subject_type,subject_id,action,reason,created_at) values('ffffffff-ffff-4fff-8fff-ffffffffffff','launch_job',$1,'consent','Synthetic earlier publication permission',now()-interval '2 days'),('00000000-0000-4000-8000-000000000001','launch_job',$1,'withdraw','Synthetic later publication withdrawal',now()-interval '1 day')",
        [job],
      );
    }
    if (f.includes("default_launch_visibility_and_closed_role_opt_outs")) {
      await db.query(
        "insert into private.launch_profiles(organisation_id,jobs_publication_enabled) values($1,false)",
        [org],
      );
      await db.query(
        "insert into private.moderation_audit(subject_type,subject_id,action,reason) values('launch_profile',$1,'withdraw','Synthetic existing profile opt-out'),('launch_profile',$1,'hide','Synthetic existing profile staff hold'),('launch_job',$2,'hide','Synthetic existing job staff hold')",
        [org, job],
      );
    }
    await db.exec(await readFile(new URL(f, dir), "utf8"));
    if (f.includes("default_launch_visibility_and_closed_role_opt_outs")) {
      migratedPreferences = (
        await db.query<Record<string, unknown>>(
          "select p.profile_publication_enabled,p.hidden_at is not null profile_held,j.publication_opted_out,j.hidden_at is not null job_held,r.status from private.launch_profiles p cross join private.launch_jobs j join public.jobs r on r.id=j.job_id where p.organisation_id=$1 and j.job_id=$2",
          [org, job],
        )
      ).rows[0];
      await db.query(
        "delete from private.launch_profiles where organisation_id=$1",
        [org],
      );
      await db.query("delete from private.launch_jobs where job_id=$1", [job]);
      await db.query(
        "delete from private.moderation_audit where subject_id in($1,$2)",
        [org, job],
      );
      await db.query("update public.jobs set status='draft' where id=$1", [
        job,
      ]);
    }
    if (f.includes("default_launch_job_publication")) {
      historicalWithdrawalPreserved = (
        await db.query<{ publication_opted_out: boolean }>(
          "select publication_opted_out from private.launch_jobs where job_id=$1",
          [job],
        )
      ).rows[0].publication_opted_out;
      await db.query(
        "update private.launch_jobs set publication_opted_out=false where job_id=$1",
        [job],
      );
      await db.query(
        "delete from private.moderation_audit where subject_type='launch_job' and subject_id=$1",
        [job],
      );
    }
  }
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
describe("founding launch privacy and release", () => {
  it("preserves a historical explicit withdrawal using audit time rather than random UUID order", () => {
    expect(historicalWithdrawalPreserved).toBe(true);
  });
  it("migrates existing privacy choices and staff holds without opting withdrawn content back in", () => {
    expect(migratedPreferences).toEqual({
      profile_publication_enabled: false,
      profile_held: true,
      publication_opted_out: true,
      job_held: true,
      status: "closed",
    });
  });
  it("includes verified profiles and reviewed roles by default without fabricating owner consent", async () => {
    await as(owner);
    const result = (
      await db.query<{
        data: {
          profiles: { publicationAllowed: boolean; consentedAt: null }[];
          jobs: { publicationAllowed: boolean; consentedAt: null }[];
        };
      }>("select public.my_launch_content() data")
    ).rows[0].data;
    expect(result.profiles[0]).toMatchObject({
      publicationAllowed: true,
      consentedAt: null,
    });
    expect(result.jobs[0]).toMatchObject({
      publicationAllowed: true,
      consentedAt: null,
    });
    await as("", "anon");
    expect(
      (await db.query("select id from public.organisations")).rows,
    ).toHaveLength(0);
    expect((await db.query("select id from public.jobs")).rows).toHaveLength(0);
    await as(admin);
    await decision("mode", null, null, true);
    await as("", "anon");
    expect(
      (await db.query("select id from public.organisations")).rows,
    ).toEqual([{ id: org }]);
    expect(
      (
        await db.query(
          "select id,expires_at>now()+interval '29 days' fresh from public.jobs",
        )
      ).rows,
    ).toEqual([{ id: job, fresh: true }]);
  });
  it("lets staff review default launch inclusion without claiming explicit employer approval", async () => {
    await as(admin);
    const listing = (await decision("list")).rows[0] as {
      result: {
        jobs: {
          id: string;
          organisationName: string;
          publicationAllowed: boolean;
          consentedAt: null;
        }[];
      };
    };
    expect(listing.result.jobs[0]).toMatchObject({
      id: job,
      organisationName: "Real Melbourne Employer",
      publicationAllowed: true,
      consentedAt: null,
    });
    await as(owner);
    await db.query("select public.manage_launch_content('job',$1,'withdraw')", [
      job,
    ]);
    await as(admin);
    const closed = (await decision("list")).rows[0] as {
      result: { jobs: { status: string; publicationAllowed: boolean }[] };
    };
    expect(closed.result.jobs[0]).toMatchObject({
      status: "closed",
      publicationAllowed: false,
    });
  });
  it("hides every listing with its profile and restores active listings without restarting their clocks", async () => {
    await as(admin);
    await decision("mode", null, null, true);
    await db.exec("reset role");
    const original = (
      await db.query(
        "select status,published_at,expires_at from public.jobs where id=$1",
        [job],
      )
    ).rows[0];
    await as(owner);
    await db.query(
      "select public.manage_launch_content('profile',$1,'withdraw')",
      [org],
    );
    await as("", "anon");
    expect(
      (await db.query("select id from public.organisations")).rows,
    ).toHaveLength(0);
    expect((await db.query("select id from public.jobs")).rows).toHaveLength(0);
    await as(owner);
    await db.query(
      "select public.manage_launch_content('profile',$1,'consent')",
      [org],
    );
    await as("", "anon");
    expect((await db.query("select id from public.jobs")).rows).toEqual([
      { id: job },
    ]);
    await db.exec("reset role");
    expect(
      (
        await db.query(
          "select status,published_at,expires_at from public.jobs where id=$1",
          [job],
        )
      ).rows[0],
    ).toEqual(original);
  });
  it("does not restore a listing manually closed while its business was private", async () => {
    await as(admin);
    await decision("mode", null, null, true);
    await as(owner);
    await db.query(
      "select public.manage_launch_content('profile',$1,'withdraw')",
      [org],
    );
    await db.query(
      "update public.jobs set status='closed',publication_requested=false where id=$1",
      [job],
    );
    await db.query(
      "select public.manage_launch_content('profile',$1,'consent')",
      [org],
    );
    await as("", "anon");
    expect(
      (await db.query("select id from public.organisations")).rows,
    ).toEqual([{ id: org }]);
    expect((await db.query("select id from public.jobs")).rows).toHaveLength(0);
    await as(owner);
    expect(
      (await db.query("select status from public.jobs where id=$1", [job]))
        .rows[0],
    ).toEqual({ status: "closed" });
  });
  it("keeps a business private at launch and restores its included roles when the owner makes it public", async () => {
    await as(owner);
    await db.query(
      "select public.manage_launch_content('profile',$1,'withdraw')",
      [org],
    );
    await as(admin);
    await decision("mode", null, null, true);
    await as("", "anon");
    expect((await db.query("select id from public.jobs")).rows).toHaveLength(0);
    await as(owner);
    await db.query(
      "select public.manage_launch_content('profile',$1,'consent')",
      [org],
    );
    await as("", "anon");
    expect((await db.query("select id from public.jobs")).rows).toEqual([
      { id: job },
    ]);
  });
  it("moves an excluded launch vacancy to Closed and lets the standard renewal workflow republish it", async () => {
    await as(owner);
    await db.query("select public.manage_launch_content('job',$1,'withdraw')", [
      job,
    ]);
    expect(
      (await db.query("select status from public.jobs where id=$1", [job]))
        .rows[0],
    ).toEqual({ status: "closed" });
    await as(admin);
    await decision("mode", null, null, true);
    await as("", "anon");
    expect((await db.query("select id from public.jobs")).rows).toHaveLength(0);
    await as(owner);
    await db.query("select public.renew_listing($1)", [job]);
    await as("", "anon");
    expect((await db.query("select id from public.jobs")).rows).toEqual([
      { id: job },
    ]);
  });
  it("retains the Closed state across edits until the employer explicitly republishes", async () => {
    await as(owner);
    await db.query("select public.manage_launch_content('job',$1,'withdraw')", [
      job,
    ]);
    await db.exec("reset role");
    await db.query(
      "update public.jobs set title='Updated closed vacancy' where id=$1",
      [job],
    );
    await as(owner);
    const data = (
      await db.query<{
        data: {
          jobs: {
            status: string;
            publicationAllowed: boolean;
            publicationOptedOut: boolean;
          }[];
        };
      }>("select public.my_launch_content() data")
    ).rows[0].data;
    expect(data.jobs[0]).toMatchObject({
      status: "closed",
      publicationAllowed: false,
      publicationOptedOut: true,
    });
    await db.query("select public.renew_listing($1)", [job]);
    await as(admin);
    await decision("mode", null, null, true);
    await as("", "anon");
    expect((await db.query("select id from public.jobs")).rows).toEqual([
      { id: job },
    ]);
  });
  it("restricts visibility controls to the business owner and keeps private publication helpers inaccessible", async () => {
    await as(other);
    await db.exec("savepoint preference_access");
    await expect(
      db.query("select public.manage_launch_content('profile',$1,'withdraw')", [
        org,
      ]),
    ).rejects.toMatchObject({ code: "42501" });
    await db.exec("rollback to preference_access");
    await as("", "anon");
    await expect(
      db.query("select private.launch_job_permission($1)", [job]),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("never includes fictional fixture content by default", async () => {
    await db.exec("update public.organisations set is_test=true");
    await as(owner);
    const result = (
      await db.query<{ data: { jobs: { publicationAllowed: boolean }[] } }>(
        "select public.my_launch_content() data",
      )
    ).rows[0].data;
    expect(result.jobs.every((item) => !item.publicationAllowed)).toBe(true);
    await as(admin);
    await decision("mode", null, null, true);
    await as("", "anon");
    expect(
      (await db.query("select id from public.organisations")).rows,
    ).toHaveLength(0);
    expect((await db.query("select id from public.jobs")).rows).toHaveLength(0);
  });
  it("preserves staff holds when the owner restores profile visibility or renews a role", async () => {
    await as(admin);
    await decision("mode", null, null, true);
    await decision("hide", org, "profile");
    await as(owner);
    await db.query(
      "select public.manage_launch_content('profile',$1,'withdraw')",
      [org],
    );
    await db.query(
      "select public.manage_launch_content('profile',$1,'consent')",
      [org],
    );
    await as("", "anon");
    expect((await db.query("select id from public.jobs")).rows).toHaveLength(0);
    await as(admin);
    await decision("release", org, "profile");
    await decision("hide", job, "job");
    await as(owner);
    await db.query("select public.renew_listing($1)", [job]);
    await as("", "anon");
    expect((await db.query("select id from public.jobs")).rows).toHaveLength(0);
  });
  it("keeps each business visibility preference independent within the same owner account", async () => {
    const secondOrg = "72000000-0000-4000-8000-000000000002";
    await db.query(
      "insert into public.organisations(id,name,slug,is_verified) values($1,'Second owned business','second-owned-business',true)",
      [secondOrg],
    );
    await db.query(
      "insert into public.organisation_members(organisation_id,user_id,role) values($1,$2,'owner')",
      [secondOrg, owner],
    );
    await as(owner);
    await db.query(
      "select public.manage_launch_content('profile',$1,'withdraw')",
      [org],
    );
    await as(admin);
    await decision("mode", null, null, true);
    await as("", "anon");
    expect(
      (await db.query("select id from public.organisations")).rows,
    ).toEqual([{ id: secondOrg }]);
  });
  it("excludes private businesses from new digests and cancels a queued digest if its business becomes private", async () => {
    await db.exec(
      "insert into private.alert_settings(singleton,site_origin,unsubscribe_origin,sending_enabled) values(true,'https://westmere.test','https://westmere.test/api/alerts/unsubscribe',true)",
    );
    await as(other);
    const search = (
      await db.query<{ id: string }>(
        `select public.save_search(null,'Synthetic launch roles','{"keyword":"office","location":"Melbourne VIC"}',true,'daily',true) id`,
      )
    ).rows[0].id;
    await as(admin);
    await decision("mode", null, null, true);
    await as(owner);
    await db.query(
      "select public.manage_launch_content('profile',$1,'withdraw')",
      [org],
    );
    await db.exec("reset role");
    await db.query(
      "update public.saved_searches set next_run_at=now()-interval '1 minute',consent_at=now()-interval '1 day' where id=$1",
      [search],
    );
    expect(
      (await db.query("select public.prepare_job_alerts() n")).rows[0],
    ).toEqual({ n: 0 });
    await as(owner);
    await db.query(
      "select public.manage_launch_content('profile',$1,'consent')",
      [org],
    );
    await db.exec("reset role");
    await db.query(
      "update public.saved_searches set next_run_at=now()-interval '1 minute' where id=$1",
      [search],
    );
    expect(
      (await db.query("select public.prepare_job_alerts() n")).rows[0],
    ).toEqual({ n: 1 });
    const claimed = (
      await db.query<{ items: { id: string; lease_token: string }[] }>(
        "select public.claim_job_alerts() items",
      )
    ).rows[0].items[0];
    await as(owner);
    await db.query(
      "select public.manage_launch_content('profile',$1,'withdraw')",
      [org],
    );
    await db.exec("reset role");
    expect(
      (
        await db.query("select public.freeze_job_alert($1,$2,'{}') request", [
          claimed.id,
          claimed.lease_token,
        ])
      ).rows[0],
    ).toEqual({ request: null });
    expect(
      (
        await db.query(
          "select status,error_code from private.alert_outbox where id=$1",
          [claimed.id],
        )
      ).rows[0],
    ).toEqual({ status: "canceled", error_code: "VACANCY_CHANGED" });
  });
  it("leaves excess roles private without blocking launch and retains the active-role allowance", async () => {
    const second = "73000000-0000-4000-8000-000000000002";
    await db.query(
      "insert into public.jobs(id,organisation_id,title,company,location,city,state,work_mode,employment_type,description,status,moderation_status) values($1,$2,'Second reviewed role','Real Melbourne Employer','Melbourne VIC','Melbourne','VIC','On-site','Full time','Synthetic current role used to check the launch publication allowance.','draft','approved')",
      [second, org],
    );
    await as(admin);
    await decision("mode", null, null, true);
    await db.exec("reset role");
    expect(
      (
        await db.query(
          "select count(*)::int n from public.jobs where status='published'",
        )
      ).rows[0],
    ).toEqual({ n: 1 });
    expect(
      (
        await db.query(
          "select count(*)::int n from private.moderation_audit where action='launch_deferred'",
        )
      ).rows[0],
    ).toEqual({ n: 1 });
  });
  it("keeps unreviewed roles private at launch", async () => {
    await db.query(
      "update public.jobs set moderation_status='pending' where id=$1",
      [job],
    );
    await as(admin);
    await decision("mode", null, null, true);
    await as("", "anon");
    expect((await db.query("select id from public.jobs")).rows).toHaveLength(0);
  });
  it("does not let an agency role with missing authority block the marketplace opening", async () => {
    await db.query(
      "update public.organisations set kind='agency' where id=$1",
      [org],
    );
    await as(admin);
    await decision("mode", null, null, true);
    expect(
      (await db.query("select public.launch_status() open")).rows[0],
    ).toEqual({ open: true });
    await as("", "anon");
    expect((await db.query("select id from public.jobs")).rows).toHaveLength(0);
  });
  it("keeps automatic launch publication and private visibility tables inaccessible to browser roles", async () => {
    expect(
      (
        await db.query(
          "select has_function_privilege('anon','private.publish_default_launch_roles()','execute') anonymous,has_function_privilege('authenticated','private.publish_default_launch_roles()','execute') signed_in,has_table_privilege('authenticated','private.launch_profiles','UPDATE') direct_update",
        )
      ).rows[0],
    ).toEqual({ anonymous: false, signed_in: false, direct_update: false });
  });
  it("keeps consented profiles private and blocks reviewer release before public launch", async () => {
    await as(owner);
    await db.query(
      "select public.manage_launch_content('profile',$1,'consent')",
      [org],
    );
    await db.query("select public.manage_launch_content('job',$1,'consent')", [
      job,
    ]);
    await as(admin);
    await db.exec("savepoint release_attempt");
    await expect(decision("release", org, "profile")).rejects.toMatchObject({
      code: "22023",
    });
    await db.exec("rollback to release_attempt");
    await as("", "anon");
    expect(
      (await db.query("select * from public.organisations")).rows,
    ).toHaveLength(0);
    expect((await db.query("select * from public.jobs")).rows).toHaveLength(0);
  });
  it("returning to founding mode hides content that was individually released", async () => {
    await as(owner);
    await db.query(
      "select public.manage_launch_content('profile',$1,'consent')",
      [org],
    );
    await db.query("select public.manage_launch_content('job',$1,'consent')", [
      job,
    ]);
    await as(admin);
    await decision("mode", null, null, true);
    await decision("release", org, "profile");
    await decision("release", job, "job");
    await decision("mode", null, null, false);
    await as("", "anon");
    expect(
      (await db.query("select * from public.organisations")).rows,
    ).toHaveLength(0);
    expect((await db.query("select * from public.jobs")).rows).toHaveLength(0);
  });
  it.each(["employer", "agency"])(
    "gives a newly registered %s private preparation without a subscription or invitation",
    async (kind) => {
      await db.query(
        "insert into auth.users values($1,'self-register@example.test',now())",
        [outsider],
      );
      await db.query(
        "insert into public.business_accounts(user_id,kind,trading_name,terms_version,terms_sha256,accepted_at) values($1,$2,'Synthetic Melbourne Business','2026-11-21',repeat('a',64),now())",
        [outsider, kind],
      );
      await as(outsider);
      const access = (
        await db.query<{ a: Record<string, unknown> }>(
          "select public.my_launch_access() a",
        )
      ).rows[0].a;
      expect(access).toMatchObject({ allowed: true, kind, expiresAt: null });
      await db.query("select public.submit_typed_business_verification($1)", [
        {
          kind,
          businessName: "Synthetic Melbourne Business",
          abn: "12345678901",
          website: "https://example.test",
          contactRole: "Director",
          evidence:
            "Synthetic independent public authority evidence for business review.",
          linkedin: "https://www.linkedin.com/company/example",
          hrEmail: "hr@example.test",
          hrPhone: "+61 3 9000 0000",
          contactSource: "https://example.test/contact",
          contactPermission: true,
          specialisms: ["Office support"],
          regions: ["VIC"],
        },
      ]);
      await db.exec("reset role");
      expect(
        (
          await db.query<{ tier: string }>(
            "select private.account_business_tier($1) tier",
            [outsider],
          )
        ).rows[0].tier,
      ).toBe(kind === "agency" ? "agency_starter" : "starter");
      expect(
        (await db.query("select * from public.business_subscriptions")).rows,
      ).toHaveLength(0);
      expect(
        (await db.query("select * from private.launch_access")).rows,
      ).toHaveLength(0);
      await as("", "anon");
      await expect(
        db.query("select * from public.employer_verification_requests"),
      ).rejects.toMatchObject({ code: "42501" });
    },
  );
  it("does not let an expressly revoked identity regain onboarding access through self-registration", async () => {
    await db.query(
      "insert into auth.users values($1,'revoked@example.test',now())",
      [outsider],
    );
    await db.query(
      "insert into private.launch_access(email,kind,user_id,revoked_at) values('revoked@example.test','employer',$1,now())",
      [outsider],
    );
    await as(outsider);
    expect(
      (
        await db.query<{ a: { allowed: boolean } }>(
          "select public.my_launch_access() a",
        )
      ).rows[0].a.allowed,
    ).toBe(false);
    await expect(
      db.query("select public.my_business_registration_capacity()"),
    ).rejects.toMatchObject({ code: "42501" });
  });

  it("hides verified profiles, jobs and their categories from anonymous discovery while retaining the owner’s workspace", async () => {
    await as("", "anon");
    expect(
      (await db.query("select * from public.organisations")).rows,
    ).toHaveLength(0);
    expect((await db.query("select * from public.jobs")).rows).toHaveLength(0);
    expect(
      (await db.query("select public.employer_role_categories() categories"))
        .rows,
    ).toEqual([]);
    await as(owner);
    expect(
      (await db.query("select * from public.organisations")).rows,
    ).toHaveLength(1);
    expect((await db.query("select * from public.jobs")).rows).toHaveLength(1);
    await as(other);
    expect((await db.query("select * from public.jobs")).rows).toHaveLength(0);
  });
  it("requires owner consent and independent review before release, and resets the listing clock", async () => {
    await as(admin);
    await expect(decision("release", org, "profile")).rejects.toMatchObject({
      code: "22023",
    });
  });
  it("publishes only the selected consented content and withdraws it immediately", async () => {
    await as(owner);
    await db.query(
      "select public.manage_launch_content('profile',$1,'consent')",
      [org],
    );
    await db.query("select public.manage_launch_content('job',$1,'consent')", [
      job,
    ]);
    await as(admin);
    await decision("mode", null, null, true);
    await decision("release", org, "profile");
    await decision("release", job, "job");
    await as("", "anon");
    expect((await db.query("select id from public.jobs")).rows).toEqual([
      { id: job },
    ]);
    const d = (
      await db.query<{ fresh: boolean }>(
        "select expires_at>now()+interval '29 days' fresh from public.jobs",
      )
    ).rows[0];
    expect(d.fresh).toBe(true);
    await as(owner);
    await db.query(
      "select public.manage_launch_content('profile',$1,'withdraw')",
      [org],
    );
    await as("", "anon");
    expect((await db.query("select id from public.jobs")).rows).toHaveLength(0);
  });
  it("clears permission on content edits", async () => {
    await as(owner);
    await db.query(
      "select public.manage_launch_content('profile',$1,'consent')",
      [org],
    );
    await as(admin);
    await decision("mode", null, null, true);
    await decision("release", org, "profile");
    await db.exec("reset role");
    await db.query(
      "update public.organisations set description='Updated public business description' where id=$1",
      [org],
    );
    expect(
      (
        await db.query(
          "select consented_at,released_at from private.launch_profiles",
        )
      ).rows[0],
    ).toEqual({ consented_at: null, released_at: null });
  });
  it("does not let an unrelated employer consent to another business", async () => {
    await as(other);
    await expect(
      db.query("select public.manage_launch_content('profile',$1,'consent')", [
        org,
      ]),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("allows a new email-verified business identity with a server-prepared registration into onboarding", async () => {
    await as("", "service_role");
    await db.query("select public.prepare_business_signup($1,'employer',$2)", [
      "outsider@example.test",
      "a".repeat(64),
    ]);
    await db.exec("reset role");
    await db.query(
      "insert into auth.users values($1,'outsider@example.test',now())",
      [outsider],
    );
    await as(outsider);
    expect(
      (
        await db.query<{ a: { allowed: boolean } }>(
          "select public.my_launch_access() a",
        )
      ).rows[0].a.allowed,
    ).toBe(true);
    const capacity = await db.query<{ c: { canSubmit: boolean } }>(
      "select public.my_business_registration_capacity() c",
    );
    expect(capacity.rows[0].c.canSubmit).toBe(true);
  });
  it("retains private legacy requests without making their approval necessary for registration", async () => {
    await as("", "service_role");
    await db.query(
      "select public.submit_launch_request('new@example.test','employer','New Owner','Melbourne Business','','" +
        "a".repeat(64) +
        "')",
    );
    await as(admin);
    const requests = (await decision("list")).rows[0] as {
      result: { requests: { id: string }[] };
    };
    const id = requests.result.requests[0].id;
    await decision("approve", id);
    await db.exec(
      "reset role;select set_config('request.jwt.claim.sub','',false)",
    );
    await db.query(
      "insert into auth.users values($1,'new@example.test',now())",
      [outsider],
    );
    await as(outsider);
    const a = (
      await db.query<{ a: { allowed: boolean; kind: string } }>(
        "select public.my_launch_access() a",
      )
    ).rows[0].a;
    expect(a).toMatchObject({ allowed: true, kind: null, expiresAt: null });
    await db.exec("reset role");
    expect(
      (await db.query("select * from public.business_subscriptions")).rows,
    ).toHaveLength(0);
    expect(
      (await db.query("select * from private.test_entitlements")).rows,
    ).toHaveLength(0);
  });
  it("does not let an employer open the public marketplace", async () => {
    await as(owner);
    await expect(decision("mode", null, null, true)).rejects.toMatchObject({
      code: "42501",
    });
  });
  it("opening the marketplace publishes eligible default-included roles", async () => {
    await as(admin);
    await decision("mode", null, null, true);
    await as("", "anon");
    expect(
      (await db.query("select public.launch_status() open")).rows[0],
    ).toEqual({ open: true });
    expect((await db.query("select id from public.jobs")).rows).toEqual([
      { id: job },
    ]);
  });
  it("does not let an unverified-email identity enter employer onboarding through the direct Data API", async () => {
    await db.query(
      "insert into auth.users values($1,'outsider@example.test',null)",
      [outsider],
    );
    await as(outsider);
    await expect(
      db.query(
        "insert into public.employer_verification_requests(applicant_id,business_name,abn,website,contact_role,ownership_evidence) values($1,'Unapproved Business','12345678901','https://example.test','Director',repeat('Unverified authority evidence. ',3))",
        [outsider],
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("keeps a staged vacancy unavailable to applications", async () => {
    await as(other);
    await expect(
      db.query(
        "insert into public.applications(job_id,candidate_id,cv_text_snapshot) values($1,$2,repeat('Relevant office experience. ',5))",
        [job, other],
      ),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("does not allow fictional test content to be released", async () => {
    await db.exec("update public.organisations set is_test=true");
    await as(owner);
    await db.query(
      "select public.manage_launch_content('profile',$1,'consent')",
      [org],
    );
    await as(admin);
    await expect(decision("release", org, "profile")).rejects.toMatchObject({
      code: "22023",
    });
  });
  it("enforces the free active-role limit when a second vacancy is released", async () => {
    const second = "73000000-0000-4000-8000-000000000002";
    await db.query(
      "insert into public.jobs(id,organisation_id,title,company,location,city,state,work_mode,employment_type,description,status,moderation_status) values($1,$2,'Second office role','Real Melbourne Employer','Melbourne VIC','Melbourne','VIC','On-site','Full time','A second genuine office role with clear responsibilities.','draft','approved')",
      [second, org],
    );
    await as(owner);
    for (const [kind, id] of [
      ["profile", org],
      ["job", job],
      ["job", second],
    ])
      await db.query("select public.manage_launch_content($1,$2,'consent')", [
        kind,
        id,
      ]);
    await as(admin);
    await decision("mode", null, null, true);
    await decision("release", org, "profile");
    await decision("release", job, "job");
    await expect(decision("release", second, "job")).rejects.toMatchObject({
      code: "23514",
    });
  });
  it("allows the employer to republish a closed role using standard renewal", async () => {
    await as(owner);
    await db.query(
      "select public.manage_launch_content('profile',$1,'consent')",
      [org],
    );
    await db.query("select public.manage_launch_content('job',$1,'consent')", [
      job,
    ]);
    await as(admin);
    await decision("mode", null, null, true);
    await decision("release", org, "profile");
    await decision("release", job, "job");
    await as(owner);
    await db.query(
      "update public.jobs set status='closed',publication_requested=false where id=$1",
      [job],
    );
    await db.query("select public.renew_listing($1)", [job]);
    await as("", "anon");
    expect((await db.query("select id from public.jobs")).rows).toEqual([
      { id: job },
    ]);
  });
});
