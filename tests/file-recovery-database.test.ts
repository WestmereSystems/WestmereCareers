import { beforeAll, afterAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz not null default clock_timestamp());create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated,service_role;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,updated_at timestamptz default now(),archived_at timestamptz,is_delete_marker boolean default false);grant usage on schema storage to service_role;grant all on storage.objects to service_role;`,
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
it("keeps inventory, backup state and recovery audit inaccessible to ordinary roles", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    for (const sql of [
      "select public.file_recovery_inventory()",
      "select public.file_recovery_control('status')",
      "select * from private.file_recovery_events",
    ])
      await expect(db.query(sql)).rejects.toMatchObject({ code: "42501" });
    await db.exec("reset role");
  }
});
it("lists only current eligible buckets and excludes disposable restoration probes", async () => {
  await db.exec(
    `insert into storage.objects(bucket_id,name,metadata) values('candidate-documents','real-record.pdf','{"size":42,"mimetype":"application/pdf"}'),('employer-assets','__recovery_verify__/probe.png','{"size":20}'),('other-app','private.pdf','{"size":50}');set role service_role;`,
  );
  const result = await db.query<{ files: { path: string }[] }>(
    "select public.file_recovery_inventory() files",
  );
  expect(result.rows[0].files.map((f) => f.path)).toEqual(["real-record.pdf"]);
  await db.exec("reset role");
});
it("serialises backup runs and rejects stale completion tokens", async () => {
  await db.exec("set role service_role");
  const token = (
    await db.query<{ token: string }>(
      "select public.file_recovery_control('acquire') token",
    )
  ).rows[0].token;
  expect(token).toMatch(/^[a-f0-9-]{36}$/);
  expect(
    (await db.query("select public.file_recovery_control('acquire') token"))
      .rows[0],
  ).toEqual({ token: null });
  await expect(
    db.query(
      "select public.file_recovery_control('complete','10000000-0000-4000-8000-000000000001',null,'{}')",
    ),
  ).rejects.toMatchObject({ code: "42501" });
  await db.query(
    'select public.file_recovery_control(\'complete\',$1,null,\'{"files":1,"bytes":42,"verified":true}\')',
    [token],
  );
  const status = (
    await db.query<{ s: { files: number; verified_at: string } }>(
      "select public.file_recovery_control('status') s",
    )
  ).rows[0].s;
  expect(status.files).toBe(1);
  expect(status.verified_at).toBeTruthy();
  expect(status).not.toHaveProperty("lease");
  await db.exec("reset role");
});
it("refuses restoration when a document reference is gone", async () => {
  await db.exec("set role service_role");
  expect(
    (
      await db.query(
        "select public.file_recovery_restore_allowed('candidate-documents','missing.pdf') ok",
      )
    ).rows[0],
  ).toEqual({ ok: false });
  await db.exec("reset role");
});
