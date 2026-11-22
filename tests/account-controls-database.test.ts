import { beforeAll, afterAll, beforeEach, afterEach, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
let db: PGlite;
const individual = "81000000-0000-4000-8000-000000000001",
  employer = "81000000-0000-4000-8000-000000000002",
  agency = "81000000-0000-4000-8000-000000000003",
  admin = "81000000-0000-4000-8000-000000000004",
  reviewer = "81000000-0000-4000-8000-000000000005",
  request = "82000000-0000-4000-8000-000000000001";
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
}, 30000);
afterAll(async () => {
  await db?.close();
});
beforeEach(async () => {
  await db.exec(
    "reset role;select set_config('request.jwt.claim.sub','',false);truncate auth.users cascade;",
  );
  for (const [id, name] of [
    [individual, "individual"],
    [employer, "employer"],
    [agency, "agency"],
    [admin, "admin"],
    [reviewer, "reviewer"],
  ])
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
      [id, `${name}@example.test`],
    );
  await db.exec(
    `insert into private.staff_members(user_id,role) values('${admin}','admin'),('${reviewer}','reviewer');update private.launch_settings set marketplace_open=true;`,
  );
  for (const [id, kind] of [
    [employer, "employer"],
    [agency, "agency"],
  ])
    await db.query(
      "insert into public.business_accounts(user_id,kind,trading_name,terms_version,terms_sha256) values($1,$2,'Synthetic test account','2026-11-21',repeat('a',64))",
      [id, kind],
    );
});
afterEach(async () => {
  await db.exec(
    "reset role;select set_config('request.jwt.claim.sub','',false)",
  );
});
async function as(id: string, role = "authenticated") {
  await db.exec(`reset role;set role ${role}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
async function pending(status = "pending") {
  await db.query(
    "insert into public.employer_verification_requests(id,applicant_id,business_name,abn,website,contact_role,ownership_evidence,status) values($1,$2,'Synthetic Review','16319214903','https://example.test','Owner','Synthetic evidence of authority for database testing',$3)",
    [request, employer, status],
  );
  return (
    await db.query<{ updated_at: string }>(
      "select updated_at from public.employer_verification_requests where id=$1",
      [request],
    )
  ).rows[0].updated_at;
}
it("lets the applicant withdraw a pending or information-needed request and releases the business slot", async () => {
  for (const status of ["pending", "needs_information"]) {
    const version = await pending(status);
    await as(employer);
    await db.query(
      "select public.withdraw_business_verification($1,$2,'No longer proceeding')",
      [request, version],
    );
    expect(
      (
        await db.query(
          "select status,withdrawn_at is not null recorded from public.employer_verification_requests where id=$1",
          [request],
        )
      ).rows[0],
    ).toEqual({ status: "withdrawn", recorded: true });
    expect(
      (
        await db.query<{ data: { pending: number } }>(
          "select public.my_business_registration_capacity() data",
        )
      ).rows[0].data.pending,
    ).toBe(0);
    await db.exec("reset role");
    await db.query(
      "delete from public.employer_verification_requests where id=$1",
      [request],
    );
  }
  expect(
    (
      await db.query<{ n: number }>(
        "select count(*)::integer n from private.moderation_audit where action='withdraw'",
      )
    ).rows[0].n,
  ).toBe(2);
});
it("blocks withdrawal by another account, decided requests and stale versions", async () => {
  const version = await pending();
  await as(agency);
  await expect(
    db.query("select public.withdraw_business_verification($1,$2)", [
      request,
      version,
    ]),
  ).rejects.toMatchObject({ code: "42501" });
  await as(employer);
  await expect(
    db.query("select public.withdraw_business_verification($1,'2000-01-01')", [
      request,
    ]),
  ).rejects.toMatchObject({ code: "40001" });
  await db.exec("reset role");
  await db.query(
    "update public.employer_verification_requests set status='rejected' where id=$1",
    [request],
  );
  await as(employer);
  await expect(
    db.query("select public.withdraw_business_verification($1,$2)", [
      request,
      version,
    ]),
  ).rejects.toMatchObject({ code: "40001" });
});
it("a withdrawn request cannot be approved by a reviewer using its former version", async () => {
  const version = await pending();
  await as(employer);
  await db.query("select public.withdraw_business_verification($1,$2)", [
    request,
    version,
  ]);
  await as(admin);
  await expect(
    db.query(
      "select public.review_business_verification($1,'approve','Synthetic independent review', $2,true,true,'employer',false)",
      [request, version],
    ),
  ).rejects.toMatchObject({ code: "40001" });
});
it("keeps privacy and export RPCs and private tables inaccessible to anonymous and ordinary roles", async () => {
  for (const role of ["anon", "authenticated"]) {
    await as(individual, role);
    for (const sql of [
      "select * from private.account_privacy_requests",
      `select public.account_privacy_request('${individual}','list')`,
      `select public.account_information_export('${individual}')`,
      `select public.admin_account_privacy('${admin}','list')`,
      `select public.account_export_control('${individual}','begin')`,
    ])
      await expect(db.query(sql)).rejects.toMatchObject({ code: "42501" });
  }
});
it("accepts private requests for individual, employer, agency and Admin accounts while the marketplace remains closed", async () => {
  await db.exec("update private.launch_settings set marketplace_open=false");
  await as("", "service_role");
  for (const id of [individual, employer, agency, admin]) {
    const r = (
      await db.query<{ data: { kind: string; status: string } }>(
        "select public.account_privacy_request($1,'request','deletion','Please review my account closure') data",
        [id],
      )
    ).rows[0].data;
    expect(r).toMatchObject({ kind: "deletion", status: "requested" });
  }
  expect(
    (await db.query("select public.launch_status() open")).rows[0],
  ).toEqual({ open: false });
});
it("prevents duplicate requests, cross-account withdrawal and unauthorised Admin review", async () => {
  await as("", "service_role");
  const r = (
    await db.query<{ data: { id: string; updated_at: string } }>(
      "select public.account_privacy_request($1,'request','deletion') data",
      [individual],
    )
  ).rows[0].data;
  await expect(
    db.query("select public.account_privacy_request($1,'request','deletion')", [
      individual,
    ]),
  ).rejects.toMatchObject({ code: "23505" });
  await expect(
    db.query(
      "select public.account_privacy_request($1,'withdraw',null,'',$2,$3)",
      [employer, r.id, r.updated_at],
    ),
  ).rejects.toMatchObject({ code: "42501" });
  await expect(
    db.query("select public.admin_account_privacy($1,'list')", [reviewer]),
  ).rejects.toMatchObject({ code: "42501" });
  const own = (
    await db.query<{ data: { requests: { id: string }[] } }>(
      "select public.account_privacy_request($1,'list') data",
      [employer],
    )
  ).rows[0].data;
  expect(own.requests).toEqual([]);
  await db.query(
    "select public.account_privacy_request($1,'withdraw',null,'',$2,$3)",
    [individual, r.id, r.updated_at],
  );
});
it("records an Admin response without deleting the account, and refuses a stale or repeated outcome", async () => {
  await as("", "service_role");
  const r = (
    await db.query<{ data: { id: string; updated_at: string } }>(
      "select public.account_privacy_request($1,'request','deletion') data",
      [individual],
    )
  ).rows[0].data;
  await db.query(
    "select public.admin_account_privacy($1,'respond',$2,$3,'declined','The retained records and review date are explained here.')",
    [admin, r.id, r.updated_at],
  );
  expect(
    (
      await db.query<{
        data: { requests: { response: string; status: string }[] };
      }>("select public.account_privacy_request($1,'list') data", [individual])
    ).rows[0].data.requests[0],
  ).toMatchObject({ status: "declined" });
  await expect(
    db.query(
      "select public.admin_account_privacy($1,'respond',$2,$3,'completed','A stale response must not overwrite the outcome.')",
      [admin, r.id, r.updated_at],
    ),
  ).rejects.toMatchObject({ code: "40001" });
  await db.exec("reset role");
  expect(
    (
      await db.query<{ n: number }>(
        "select count(*)::integer n from auth.users where id=$1",
        [individual],
      )
    ).rows[0].n,
  ).toBe(1);
});
it("exports only account-owned records and omits unsubscribe and marketing tokens", async () => {
  await db.query(
    "insert into public.profiles(id,full_name,cv_text) values($1,'Own private profile','Own CV'),($2,'Other private profile','Other CV')",
    [individual, employer],
  );
  await db.query(
    "insert into public.saved_searches(user_id,name) values($1,'Own search'),($2,'Other search')",
    [individual, employer],
  );
  await as("", "service_role");
  const r = (
    await db.query<{ data: Record<string, unknown[]> }>(
      "select public.account_information_export($1) data",
      [individual],
    )
  ).rows[0].data;
  expect(r.profile).toHaveLength(1);
  expect(JSON.stringify(r)).toContain("Own private profile");
  expect(JSON.stringify(r)).not.toContain("Other private profile");
  expect(JSON.stringify(r)).not.toContain("Other search");
  expect(JSON.stringify(r)).not.toContain("unsubscribe_token");
});
it("serialises account exports and rate-limits repeated successful downloads", async () => {
  await as("", "service_role");
  const token = (
    await db.query<{ token: string }>(
      "select public.account_export_control($1,'begin') token",
      [individual],
    )
  ).rows[0].token;
  await expect(
    db.query("select public.account_export_control($1,'begin')", [individual]),
  ).rejects.toMatchObject({ code: "P0001" });
  await db.query("select public.account_export_control($1,'complete',$2)", [
    individual,
    token,
  ]);
  await expect(
    db.query("select public.account_export_control($1,'begin')", [individual]),
  ).rejects.toMatchObject({ code: "P0001" });
});

it("a hiring owner cannot export candidates' application contents through their account copy", async () => {
  const org = "a1000000-0000-4000-8000-000000000001",
    job = "a2000000-0000-4000-8000-000000000001";
  await db.query(
    "insert into public.organisations(id,name,slug,is_verified) values($1,'Synthetic hiring owner','synthetic-owner',true)",
    [org],
  );
  await db.query(
    "insert into public.organisation_members(organisation_id,user_id,role) values($1,$2,'owner')",
    [org, employer],
  );
  await db.query(
    "insert into public.jobs(id,organisation_id,title,company,location,city,state,work_mode,employment_type,salary_min,salary_max,description,status,published_at,moderation_status) values($1,$2,'Synthetic owned role','Synthetic hiring owner','Melbourne VIC','Melbourne','VIC','On-site','Full time',65000,75000,'Synthetic listing used only in an isolated database test.','published',now()-interval '1 day','approved')",
    [job, org],
  );
  await db.query(
    "insert into private.launch_profiles(organisation_id,consented_at,consented_by,released_at,released_by) values($1,now(),$2,now(),$3)",
    [org, employer, admin],
  );
  await db.query(
    "insert into private.launch_jobs(job_id,consented_at,consented_by,released_at,released_by) values($1,now(),$2,now(),$3)",
    [job, employer, admin],
  );
  await db.query(
    "insert into public.applications(job_id,candidate_id,cv_text_snapshot) values($1,$2,repeat('Own candidate application CV ',4)),($1,$3,repeat('Other candidate application CV ',4))",
    [job, individual, reviewer],
  );
  await as("", "service_role");
  const candidateCopy = JSON.stringify(
    (
      await db.query("select public.account_information_export($1) data", [
        individual,
      ])
    ).rows[0],
  );
  expect(candidateCopy).toContain("Own candidate application CV");
  expect(candidateCopy).not.toContain("Other candidate application CV");
  const ownerCopy = JSON.stringify(
    (
      await db.query("select public.account_information_export($1) data", [
        employer,
      ])
    ).rows[0],
  );
  expect(ownerCopy).toContain("Synthetic owned role");
  expect(ownerCopy).not.toContain("Own candidate application CV");
  expect(ownerCopy).not.toContain("Other candidate application CV");
});

it("larger accounts require a reviewed full copy instead of returning a truncated export", async () => {
  await db.query(
    "insert into public.notifications(user_id,event_key,title,message,path) select $1,'synthetic-size-'||g,'Synthetic large export',repeat('x',2000),'/account' from generate_series(1,4500) g",
    [individual],
  );
  await as("", "service_role");
  await expect(
    db.query("select public.account_information_export($1)", [individual]),
  ).rejects.toMatchObject({ code: "54000" });
});
