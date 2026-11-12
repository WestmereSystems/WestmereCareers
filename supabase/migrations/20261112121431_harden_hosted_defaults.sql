-- Keep the hosted Supabase RLS event trigger available to its owner, never RPC callers.
-- The helper is provider-created and may be absent in local/test projects.
begin;
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;

-- Cover foreign-key checks and future retention/deletion operations.
create index if not exists application_events_actor on public.application_events(actor_id);
create index if not exists response_reports_application on public.response_reports(application_id);
create index if not exists response_reports_organisation on public.response_reports(organisation_id);
create index if not exists subscriptions_customer on public.subscriptions(stripe_customer_id);

-- One SELECT policy per role preserves the existing live-or-team access rule.
drop policy jobs_live on public.jobs;
drop policy jobs_team_read on public.jobs;
create policy jobs_live on public.jobs for select to anon
  using (status = 'published' and published_at <= now() and expires_at > now());
create policy jobs_authenticated_read on public.jobs for select to authenticated using (
  (status = 'published' and published_at <= now() and expires_at > now())
  or exists (
    select 1 from public.organisation_members m
    where m.organisation_id = jobs.organisation_id and m.user_id = (select auth.uid())
  )
);

-- Candidates retain their own history; recruiter CV reads still stop on withdrawal.
drop policy applications_candidate_read on public.applications;
drop policy applications_team_read on public.applications;
create policy applications_authorised_read on public.applications for select to authenticated using (
  candidate_id = (select auth.uid())
  or (
    withdrawn_at is null and exists (
      select 1 from public.jobs j
      join public.organisation_members m on m.organisation_id = j.organisation_id
      where j.id = applications.job_id and m.user_id = (select auth.uid())
        and m.role in ('owner','admin','recruiter')
    )
  )
);
commit;
