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
    await db.exec(await readFile(new URL(f, dir), "utf8"));
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
  it("defaults genuine job publication on without recording fabricated owner consent or releasing content", async () => {
    await as(owner);
    const result = (
      await db.query<{
        data: {
          profiles: { jobsPublicationEnabled: boolean }[];
          jobs: {
            publicationAllowed: boolean;
            consentedAt: string | null;
            releasedAt: string | null;
          }[];
        };
      }>("select public.my_launch_content() data")
    ).rows[0].data;
    expect(result.profiles[0].jobsPublicationEnabled).toBe(true);
    expect(result.jobs[0]).toMatchObject({
      publicationAllowed: true,
      consentedAt: null,
      releasedAt: null,
    });
    await as(admin);
    await decision("mode", null, null, true);
    await as("", "anon");
    expect((await db.query("select id from public.jobs")).rows).toHaveLength(0);
  });
  it("allows reviewed job release under the default after separate profile permission and release", async () => {
    await as(owner);
    await db.query(
      "select public.manage_launch_content('profile',$1,'consent')",
      [org],
    );
    await as(admin);
    await decision("mode", null, null, true);
    await decision("release", org, "profile");
    await decision("release", job, "job");
    await as("", "anon");
    expect((await db.query("select id from public.jobs")).rows).toEqual([
      { id: job },
    ]);
  });
  it("business opt-out covers current and future jobs and rejects individual consent while disabled", async () => {
    await as(owner);
    await db.query(
      "select public.manage_launch_content('business_jobs',$1,'withdraw')",
      [org],
    );
    await db.exec("reset role");
    const second = "73000000-0000-4000-8000-000000000002";
    await db.query(
      "insert into public.jobs(id,organisation_id,title,company,location,city,state,work_mode,employment_type,description,status,moderation_status) values($1,$2,'Future private job','Real Melbourne Employer','Melbourne VIC','Melbourne','VIC','On-site','Full time','Synthetic future listing for isolated preference tests.','draft','approved')",
      [second, org],
    );
    await as(owner);
    const result = (
      await db.query<{ data: { jobs: { publicationAllowed: boolean }[] } }>(
        "select public.my_launch_content() data",
      )
    ).rows[0].data;
    expect(result.jobs).toHaveLength(2);
    expect(result.jobs.every((j) => !j.publicationAllowed)).toBe(true);
    await db.exec("savepoint individual_consent");
    await expect(
      db.query("select public.manage_launch_content('job',$1,'consent')", [
        job,
      ]),
    ).rejects.toMatchObject({ code: "22023" });
    await db.exec("rollback to individual_consent");
  });
  it("retains an individual job opt-out across edits and business preference changes", async () => {
    await as(owner);
    await db.query("select public.manage_launch_content('job',$1,'withdraw')", [
      job,
    ]);
    await db.query(
      "select public.manage_launch_content('business_jobs',$1,'withdraw')",
      [org],
    );
    await db.query(
      "select public.manage_launch_content('business_jobs',$1,'consent')",
      [org],
    );
    await db.exec("reset role");
    await db.query(
      "update public.jobs set title='Updated private vacancy' where id=$1",
      [job],
    );
    await as(owner);
    const result = (
      await db.query<{
        data: {
          jobs: { publicationAllowed: boolean; publicationOptedOut: boolean }[];
        };
      }>("select public.my_launch_content() data")
    ).rows[0].data;
    expect(result.jobs[0]).toMatchObject({
      publicationAllowed: false,
      publicationOptedOut: true,
    });
    await db.query("select public.manage_launch_content('job',$1,'consent')", [
      job,
    ]);
    expect(
      (
        await db.query<{ data: { jobs: { publicationAllowed: boolean }[] } }>(
          "select public.my_launch_content() data",
        )
      ).rows[0].data.jobs[0].publicationAllowed,
    ).toBe(true);
  });
  it("business opt-out immediately hides released jobs and re-enabling does not restore an old release", async () => {
    await as(owner);
    await db.query(
      "select public.manage_launch_content('profile',$1,'consent')",
      [org],
    );
    await as(admin);
    await decision("mode", null, null, true);
    await decision("release", org, "profile");
    await decision("release", job, "job");
    await as(owner);
    await db.query(
      "select public.manage_launch_content('business_jobs',$1,'withdraw')",
      [org],
    );
    await as("", "anon");
    expect((await db.query("select id from public.jobs")).rows).toHaveLength(0);
    await as(owner);
    await db.query(
      "select public.manage_launch_content('business_jobs',$1,'consent')",
      [org],
    );
    await as("", "anon");
    expect((await db.query("select id from public.jobs")).rows).toHaveLength(0);
    await as(admin);
    await decision("release", job, "job");
    await as("", "anon");
    expect((await db.query("select id from public.jobs")).rows).toEqual([
      { id: job },
    ]);
  });
  it("does not allow another account or anonymous access to control business publication", async () => {
    await as(other);
    await db.exec("savepoint preference_access");
    await expect(
      db.query(
        "select public.manage_launch_content('business_jobs',$1,'withdraw')",
        [org],
      ),
    ).rejects.toMatchObject({ code: "42501" });
    await db.exec("rollback to preference_access");
    await as("", "anon");
    await expect(
      db.query("select private.launch_job_permission($1)", [job]),
    ).rejects.toMatchObject({ code: "42501" });
  });
  it("default publication never makes fixture jobs eligible", async () => {
    await db.exec("update public.organisations set is_test=true");
    await as(owner);
    await db.query(
      "select public.manage_launch_content('business_jobs',$1,'consent')",
      [org],
    );
    const result = (
      await db.query<{ data: { jobs: { publicationAllowed: boolean }[] } }>(
        "select public.my_launch_content() data",
      )
    ).rows[0].data;
    expect(result.jobs.every((j) => !j.publicationAllowed)).toBe(true);
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
  it("opening registration does not release unconsented content", async () => {
    await as(admin);
    await decision("mode", null, null, true);
    await as("", "anon");
    expect(
      (await db.query("select public.launch_status() open")).rows[0],
    ).toEqual({ open: true });
    expect((await db.query("select * from public.jobs")).rows).toHaveLength(0);
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
  it("closing a role withdraws its release so an employer cannot reopen it publicly", async () => {
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
    expect((await db.query("select id from public.jobs")).rows).toHaveLength(0);
  });
});
