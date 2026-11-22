begin;
-- This entitlement belongs to the billing identity, never to an organisation membership.
create function private.my_enterprise_careers_access() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(
  (select jsonb_build_object('startsAt',t.starts_at,'expiresAt',t.expires_at) from private.test_entitlements t
   join auth.users u on u.id=t.user_id join private.test_account_allowlist l on l.email=lower(u.email)
   join public.business_accounts a on a.user_id=t.user_id
   where t.user_id=auth.uid() and u.email_confirmed_at is not null and t.starts_at<=now() and t.expires_at>now()
   and ((t.tier='enterprise' and a.kind='employer') or (t.tier='agency_enterprise' and a.kind='agency'))
   and exists(select 1 from public.organisation_members m where m.user_id=t.user_id and m.role='owner')),
  (select jsonb_build_object('startsAt',s.current_period_start,'expiresAt',s.current_period_end)
   from public.organisation_billing_accounts b join public.business_subscriptions s using(organisation_id)
   where b.billing_user_id=auth.uid() and b.is_primary and s.tier in ('enterprise','agency_enterprise')
   and s.status in ('active','trialing') and s.current_period_start<=now() and s.current_period_end>now()));
$$;
revoke all on function private.my_enterprise_careers_access() from public,anon;
grant execute on function private.my_enterprise_careers_access() to authenticated;
create function public.my_enterprise_careers_access() returns jsonb language sql stable security invoker set search_path='' as $$select private.my_enterprise_careers_access();$$;
revoke all on function public.my_enterprise_careers_access() from public,anon;
grant execute on function public.my_enterprise_careers_access() to authenticated;
create or replace function private.reserve_ai_usage_internal(p_mode text) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_subscription public.subscriptions%rowtype;
  v_test jsonb;
  v_enterprise jsonb;
  v_count integer;
  v_id uuid;
begin
  if v_user is null then raise exception 'Sign in required.' using errcode = '42501'; end if;
  if p_mode not in ('improve','tailor','match','review','chat') then raise exception 'Unknown generation mode.' using errcode = '22023'; end if;
  -- Serialise reservations for this user; row writes are not exposed to the authenticated role.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 0));
  v_enterprise:=private.my_enterprise_careers_access();
  if (exists(select 1 from public.business_accounts where user_id=v_user) or exists(select 1 from public.organisation_members where user_id=v_user)) and v_enterprise is null then raise exception 'Use a personal Careers+ account or the Enterprise billing account' using errcode='42501';end if;
  v_test:=private.my_testing_access();
  if v_enterprise is not null then
    v_subscription.status:='active';v_subscription.price_id:='enterprise-included';v_subscription.current_period_start:=(v_enterprise->>'startsAt')::timestamptz;v_subscription.current_period_end:=(v_enterprise->>'expiresAt')::timestamptz;
  elsif v_test->>'tier'='careers_plus' then
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


create or replace function private.check_assistant_chat() returns trigger language plpgsql security invoker set search_path='' as $$
declare v_user uuid:=auth.uid(); v_test jsonb;
begin
 if v_user is null or new.user_id<>v_user then raise exception 'Sign in required' using errcode='42501';end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text,19));
 if (exists(select 1 from public.business_accounts where user_id=v_user) or exists(select 1 from public.organisation_members where user_id=v_user)) and private.my_enterprise_careers_access() is null then raise exception 'Use a personal Careers+ account or the Enterprise billing account' using errcode='42501';end if;
 v_test:=private.my_testing_access();
 if private.my_enterprise_careers_access() is null and coalesce(v_test->>'tier','')<>'careers_plus' and not exists(
  select 1 from public.subscriptions where user_id=v_user and status in ('active','trialing') and price_id is not null and current_period_start<=now() and current_period_end>now()
 ) then raise exception 'A current Careers+ subscription is required to save chats' using errcode='42501';end if;
 if tg_op='INSERT' and (select count(*) from public.assistant_chats where user_id=v_user)>=10 then raise exception 'You can save up to 10 chats. Delete a chat to start another.' using errcode='P0001';end if;
 new.updated_at:=clock_timestamp();
 return new;
end;$$;

commit;
