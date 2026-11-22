-- Keep directory categories tied to a public business profile and a current role.
-- Invoker security retains public listing and agency mandate restrictions.
create or replace function public.employer_role_categories() returns setof text
language sql stable security invoker set search_path='' as $$
  select distinct j.category
  from public.jobs j
  join public.organisations o on o.id=j.organisation_id
  where j.status='published' and j.published_at<=now() and j.expires_at>now()
    and o.is_verified and o.suspended_at is null and o.removed_at is null
    and length(trim(j.category))>0
  order by j.category;
$$;
revoke all on function public.employer_role_categories() from public;
grant execute on function public.employer_role_categories() to anon,authenticated,service_role;
