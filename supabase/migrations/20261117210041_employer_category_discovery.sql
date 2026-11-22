-- Dropdown options follow the caller-visible published inventory, including custom
-- employer categories. Invoker security preserves every existing job RLS rule.
create function public.employer_role_categories() returns setof text
language sql stable security invoker set search_path='' as $$
  select distinct category from public.jobs
  where status='published' and length(trim(category))>0
  order by category;
$$;
revoke all on function public.employer_role_categories() from public;
grant execute on function public.employer_role_categories() to anon,authenticated,service_role;
