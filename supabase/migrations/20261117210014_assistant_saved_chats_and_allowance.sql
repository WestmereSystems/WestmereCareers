-- Careers+ shares one allowance across Studio and conversational requests.
alter table public.ai_usage drop constraint ai_usage_mode_check;
alter table public.ai_usage add constraint ai_usage_mode_check check(mode in ('improve','tailor','match','review','chat'));

create or replace function private.reserve_ai_usage_internal(p_mode text) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_subscription public.subscriptions%rowtype;
  v_test jsonb;
  v_count integer;
  v_id uuid;
begin
  if v_user is null then raise exception 'Sign in required.' using errcode = '42501'; end if;
  if p_mode not in ('improve','tailor','match','review','chat') then raise exception 'Unknown generation mode.' using errcode = '22023'; end if;
  -- Serialise reservations for this user; row writes are not exposed to the authenticated role.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 0));
  if exists(select 1 from public.business_accounts where user_id=v_user) or exists(select 1 from public.organisation_members where user_id=v_user) then raise exception 'Individual account required' using errcode='42501';end if;
  v_test:=private.my_testing_access();
  if v_test->>'tier'='careers_plus' then
    v_subscription.status:='active';v_subscription.price_id:='testing-only';v_subscription.current_period_start:=(v_test->>'startsAt')::timestamptz;v_subscription.current_period_end:=(v_test->>'expiresAt')::timestamptz;
  else select * into v_subscription from public.subscriptions where user_id = v_user;end if;
  if v_subscription.status is null or v_subscription.status not in ('active','trialing') or v_subscription.price_id is null
    or v_subscription.current_period_start is null or v_subscription.current_period_start > now()
    or v_subscription.current_period_end is null or v_subscription.current_period_end <= now() then
    raise exception 'A current Careers+ subscription is required.' using errcode = '42501';
  end if;
  update public.ai_usage set status = 'failed', settled_at = now()
    where user_id = v_user and status = 'reserved' and created_at < now() - interval '15 minutes';
  select count(*) into v_count from public.ai_usage where user_id = v_user
    and period_start = v_subscription.current_period_start and status in ('reserved','completed');
  if v_count >= 100 then raise exception 'Your 100 requests for this billing period are used.' using errcode = 'P0001'; end if;
  insert into public.ai_usage(user_id,mode,period_start,period_end)
    values(v_user,p_mode,v_subscription.current_period_start,v_subscription.current_period_end) returning id into v_id;
  return v_id;
end;
$$;

-- Saved conversations contain personal document text and replies. They are owner-only,
-- are removed with the account, and are never included in public profile/search data.
create table public.assistant_chats (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(length(title) between 1 and 100),
 snapshot jsonb not null default '{}'::jsonb check(jsonb_typeof(snapshot)='object' and octet_length(snapshot::text)<=4000000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index assistant_chats_owner_updated on public.assistant_chats(user_id,updated_at desc,id);
alter table public.assistant_chats enable row level security;
revoke all on public.assistant_chats from public,anon,authenticated;
grant select,delete on public.assistant_chats to authenticated;
grant insert(id,user_id,title,snapshot),update(title,snapshot) on public.assistant_chats to authenticated;
grant all on public.assistant_chats to service_role;
create policy assistant_chats_read on public.assistant_chats for select to authenticated using(user_id=(select auth.uid()));
create policy assistant_chats_create on public.assistant_chats for insert to authenticated with check(user_id=(select auth.uid()));
create policy assistant_chats_update on public.assistant_chats for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy assistant_chats_delete on public.assistant_chats for delete to authenticated using(user_id=(select auth.uid()));

-- Run with the caller's RLS permissions. The advisory lock serialises concurrent
-- creates, so two tabs cannot create an eleventh chat. No client can raise the cap.
create function private.check_assistant_chat() returns trigger language plpgsql security invoker set search_path='' as $$
declare v_user uuid:=auth.uid(); v_test jsonb;
begin
 if v_user is null or new.user_id<>v_user then raise exception 'Sign in required' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text,19));
 if exists(select 1 from public.business_accounts where user_id=v_user) or exists(select 1 from public.organisation_members where user_id=v_user) then raise exception 'Individual account required' using errcode='42501';end if;
 v_test:=private.my_testing_access();
 if coalesce(v_test->>'tier','')<>'careers_plus' and not exists(
  select 1 from public.subscriptions where user_id=v_user and status in ('active','trialing') and price_id is not null and current_period_start<=now() and current_period_end>now()
 ) then raise exception 'A current Careers+ subscription is required to save chats' using errcode='42501';end if;
 if tg_op='INSERT' and (select count(*) from public.assistant_chats where user_id=v_user)>=10 then raise exception 'You can save up to 10 chats. Delete a chat to start another.' using errcode='P0001';end if;
 new.updated_at:=clock_timestamp();
 return new;
end;$$;
revoke all on function private.check_assistant_chat() from public,anon,authenticated;
create trigger check_assistant_chat before insert or update on public.assistant_chats for each row execute function private.check_assistant_chat();
