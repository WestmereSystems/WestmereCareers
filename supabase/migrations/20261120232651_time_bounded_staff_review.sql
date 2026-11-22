begin;
alter table private.staff_members add column expires_at timestamptz;
create or replace function private.my_staff_role() returns text language sql stable security definer set search_path='' as $$
 select role from private.staff_members where user_id=(select auth.uid()) and enabled and (expires_at is null or expires_at>now());
$$;
commit;
