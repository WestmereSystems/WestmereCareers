begin;
-- RETURNING is checked before a stable lookup can see a newly inserted job.
-- Check owner/admin identity at the organisation boundary for that path.
create or replace function private.agency_can_create_job(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.organisations o where o.id=p_org and (
 o.kind<>'agency' or (o.is_verified and o.suspended_at is null and o.removed_at is null and exists(
 select 1 from public.organisation_members m where m.organisation_id=o.id and m.user_id=auth.uid()
 and (m.role='owner' or (m.role='admin' and private.business_team_enabled(o.id) and private.agency_seat_allowed(o.id,m.user_id)))))));
$$;
grant execute on function private.agency_can_create_job(uuid) to anon,authenticated;
drop policy agency_job_read_scope on public.jobs;
create policy agency_job_read_scope on public.jobs as restrictive for select to anon,authenticated using(
 advertiser_kind<>'agency' or (status='published' and expires_at>now() and private.agency_job_available(id))
 or private.can_access_hiring_job(id,'listing') or private.agency_candidate_job_history(id)
 or private.agency_can_create_job(organisation_id));
commit;
