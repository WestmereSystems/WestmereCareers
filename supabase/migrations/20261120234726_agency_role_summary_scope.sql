begin;
create or replace function private.role_overview() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object(
 'id',j.id,'accessLimited',not private.can_access_hiring_job(j.id,'application'),
 'views',case when private.can_access_hiring_job(j.id,'application') then (select count(*) from private.job_view_events v where v.job_id=j.id) else null end,
 'applications',case when private.can_access_hiring_job(j.id,'application') then (select count(*) from public.applications a where a.job_id=j.id and a.withdrawn_at is null) else null end,
 'activity',case when private.can_access_hiring_job(j.id,'application') then (select coalesce(jsonb_agg(h),'[]') from (select x.action,x.created_at,x.details,u.email actor_email from private.job_activity x left join auth.users u on u.id=x.actor_id where x.job_id=j.id order by x.created_at desc limit 20) h) else '[]'::jsonb end
 )),'[]') from public.jobs j where private.can_access_hiring_job(j.id,'listing'));
end;$$;
commit;
