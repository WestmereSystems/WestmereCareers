-- Sandbox-only billing, explicit testing entitlements, safer uploads and measured discovery.
begin;
alter table public.employer_plans drop constraint employer_plans_tier_check;
alter table public.employer_plans add constraint employer_plans_tier_check check(tier in ('starter','growth','enterprise','agency_starter','agency_growth','agency_enterprise'));
create table public.organisation_billing_accounts (
 organisation_id uuid primary key references public.organisations(id) on delete restrict,
 billing_user_id uuid not null references auth.users(id) on delete restrict,
 stripe_customer_id text not null unique check(stripe_customer_id like 'cus_%'),
 audience text not null check(audience in ('employer','agency')),
 last_reconciliation_attempt_at timestamptz,last_reconciled_at timestamptz,
 created_at timestamptz not null default now()
);
create index organisation_billing_user on public.organisation_billing_accounts(billing_user_id);
alter table public.organisation_billing_accounts enable row level security;
revoke all on public.organisation_billing_accounts from public,anon,authenticated;
grant select on public.organisation_billing_accounts to authenticated;grant all on public.organisation_billing_accounts to service_role;
create policy organisation_billing_owner_read on public.organisation_billing_accounts for select to authenticated using(billing_user_id=(select auth.uid()));
create table public.business_subscriptions(
 organisation_id uuid primary key references public.organisations(id) on delete restrict,
 stripe_customer_id text not null references public.organisation_billing_accounts(stripe_customer_id),
 stripe_subscription_id text unique,price_id text,tier text,
 status text not null,current_period_start timestamptz,current_period_end timestamptz,
 cancel_at_period_end boolean not null default false,updated_at timestamptz not null default now(),
 check(tier is null or tier in ('starter','growth','enterprise','agency_starter','agency_growth','agency_enterprise'))
);
alter table public.business_subscriptions enable row level security;
revoke all on public.business_subscriptions from public,anon,authenticated;
grant select on public.business_subscriptions to authenticated;grant all on public.business_subscriptions to service_role;
create policy business_subscription_member on public.business_subscriptions for select to authenticated using(exists(select 1 from public.organisation_members m where m.organisation_id=business_subscriptions.organisation_id and m.user_id=(select auth.uid())));

create table private.test_account_allowlist(email text primary key check(email=lower(email)),created_at timestamptz not null default now());
create table private.testing_operators(user_id uuid primary key references auth.users(id) on delete cascade);
create table private.test_entitlements(user_id uuid primary key references auth.users(id) on delete cascade,tier text not null check(tier in ('careers_plus','starter','growth','enterprise','agency_starter','agency_growth','agency_enterprise')),starts_at timestamptz not null default now(),expires_at timestamptz not null,actor_id uuid references auth.users(id) on delete set null,reason text not null check(length(reason) between 10 and 1000));
create table private.testing_audit(id uuid primary key default gen_random_uuid(),actor_id uuid references auth.users(id) on delete set null,target_id uuid references auth.users(id) on delete set null,tier text,action text not null,reason text not null,created_at timestamptz not null default now());
create index test_entitlement_actor on private.test_entitlements(actor_id);
create index testing_audit_actor on private.testing_audit(actor_id);
create index testing_audit_target on private.testing_audit(target_id);
alter table private.test_account_allowlist enable row level security;alter table private.testing_operators enable row level security;alter table private.test_entitlements enable row level security;alter table private.testing_audit enable row level security;
revoke all on private.test_account_allowlist,private.testing_operators,private.test_entitlements,private.testing_audit from public,anon,authenticated;grant all on private.test_account_allowlist,private.testing_operators,private.test_entitlements,private.testing_audit to service_role;

create function private.my_testing_access() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('tier',e.tier,'startsAt',e.starts_at,'expiresAt',e.expires_at) from private.test_entitlements e join auth.users u on u.id=e.user_id join private.test_account_allowlist a on a.email=lower(u.email) where e.user_id=auth.uid() and e.starts_at<=now() and e.expires_at>now() and u.email_confirmed_at is not null;
$$;
revoke all on function private.my_testing_access() from public,anon;grant execute on function private.my_testing_access() to authenticated;
create function public.my_testing_access() returns jsonb language sql security invoker set search_path='' as $$select private.my_testing_access();$$;
revoke all on function public.my_testing_access() from public,anon;grant execute on function public.my_testing_access() to authenticated;
create function private.can_manage_testing() returns boolean language sql stable security definer set search_path='' as $$select auth.uid() is not null and exists(select 1 from private.testing_operators where user_id=auth.uid()) and private.my_staff_role() is not null;$$;
revoke all on function private.can_manage_testing() from public,anon;grant execute on function private.can_manage_testing() to authenticated;
create function public.can_manage_testing() returns boolean language sql security invoker set search_path='' as $$select private.can_manage_testing();$$;
revoke all on function public.can_manage_testing() from public,anon;grant execute on function public.can_manage_testing() to authenticated;
create function private.manage_test_entitlement(p_email text,p_tier text,p_days integer,p_reason text,p_designate boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid;
begin
 if not private.can_manage_testing() then raise exception 'Testing operator access required' using errcode='42501';end if;
 if p_reason is null or length(trim(p_reason)) not between 10 and 1000 or p_days not between 1 and 30 then raise exception 'Choose a reason and a test duration up to 30 days' using errcode='22023';end if;
 if p_designate then
   if not exists(select 1 from auth.users where lower(email)=lower(trim(p_email)) and email_confirmed_at is not null) then raise exception 'A verified dedicated test account is required';end if;
   insert into private.test_account_allowlist(email) values(lower(trim(p_email))) on conflict do nothing;
 end if;
 if not exists(select 1 from private.test_account_allowlist where email=lower(trim(p_email))) then raise exception 'Only designated test accounts can receive test access' using errcode='42501';end if;
 select id into v_user from auth.users where lower(email)=lower(trim(p_email)) and email_confirmed_at is not null;
 if v_user is null then raise exception 'The designated account must sign up and verify its email first' using errcode='22023';end if;
 if p_tier is null then delete from private.test_entitlements where user_id=v_user;
 else
  if p_tier not in ('careers_plus','starter','growth','enterprise','agency_starter','agency_growth','agency_enterprise') then raise exception 'Unknown test tier' using errcode='22023';end if;
  if p_tier='careers_plus' and (exists(select 1 from public.business_accounts where user_id=v_user) or exists(select 1 from public.organisation_members where user_id=v_user)) then raise exception 'Careers+ requires a personal account' using errcode='22023';end if;
  if p_tier<>'careers_plus' and not exists(select 1 from public.business_accounts where user_id=v_user and case when p_tier like 'agency_%' then kind='agency' else kind='employer' end) then raise exception 'Complete the matching business account type first' using errcode='22023';end if;
  insert into private.test_entitlements(user_id,tier,starts_at,expires_at,actor_id,reason) values(v_user,p_tier,now(),now()+make_interval(days=>p_days),auth.uid(),trim(p_reason)) on conflict(user_id) do update set tier=excluded.tier,starts_at=excluded.starts_at,expires_at=excluded.expires_at,actor_id=excluded.actor_id,reason=excluded.reason;
 end if;
 insert into private.testing_audit(actor_id,target_id,tier,action,reason) values(auth.uid(),v_user,p_tier,case when p_tier is null then 'revoke' else 'assign' end,trim(p_reason));
 return jsonb_build_object('email',lower(trim(p_email)),'tier',p_tier,'testingOnly',true);
end;$$;
revoke all on function private.manage_test_entitlement(text,text,integer,text,boolean) from public,anon;grant execute on function private.manage_test_entitlement(text,text,integer,text,boolean) to authenticated;
create function public.manage_test_entitlement(p_email text,p_tier text,p_days integer,p_reason text,p_designate boolean default false) returns jsonb language sql security invoker set search_path='' as $$select private.manage_test_entitlement(p_email,p_tier,p_days,p_reason,p_designate);$$;
revoke all on function public.manage_test_entitlement(text,text,integer,text,boolean) from public,anon;grant execute on function public.manage_test_entitlement(text,text,integer,text,boolean) to authenticated;

create table private.assistant_upload_limits(network text not null,day date not null,attempts integer not null default 1,lease_token uuid,lease_expires_at timestamptz,primary key(network,day));
alter table private.assistant_upload_limits enable row level security;revoke all on private.assistant_upload_limits from public,anon,authenticated;grant all on private.assistant_upload_limits to service_role;
create function public.reserve_assistant_upload(p_network text) returns uuid language plpgsql security definer set search_path='' as $$
declare t uuid:=gen_random_uuid();r private.assistant_upload_limits%rowtype;
begin
 if p_network is null or p_network !~ '^[a-f0-9]{64}$' then raise exception 'Invalid upload request';end if;
 perform pg_advisory_xact_lock(hashtextextended('assistant-upload:'||p_network,0));
 delete from private.assistant_upload_limits where day<current_date-1;
 select * into r from private.assistant_upload_limits where network=p_network and day=current_date;
 if r.attempts>=20 or r.lease_expires_at>now() or (select coalesce(sum(attempts),0) from private.assistant_upload_limits where day=current_date)>=500 then raise exception 'Upload limit reached' using errcode='P0001';end if;
 insert into private.assistant_upload_limits(network,day,lease_token,lease_expires_at) values(p_network,current_date,t,now()+interval '90 seconds') on conflict(network,day) do update set attempts=assistant_upload_limits.attempts+1,lease_token=t,lease_expires_at=now()+interval '90 seconds';return t;
end;$$;
revoke all on function public.reserve_assistant_upload(text) from public,anon,authenticated;grant execute on function public.reserve_assistant_upload(text) to service_role;
create function public.release_assistant_upload(p_network text,p_token uuid) returns void language sql security definer set search_path='' as $$update private.assistant_upload_limits set lease_token=null,lease_expires_at=null where network=p_network and lease_token=p_token;$$;
revoke all on function public.release_assistant_upload(text,uuid) from public,anon,authenticated;grant execute on function public.release_assistant_upload(text,uuid) to service_role;

alter table public.ai_usage drop constraint ai_usage_mode_check;
alter table public.ai_usage add constraint ai_usage_mode_check check(mode in ('improve','tailor','match','review'));
create or replace function private.reserve_ai_usage_internal(p_mode text) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_subscription public.subscriptions%rowtype;
  v_test jsonb;
  v_count integer;
  v_id uuid;
begin
  if v_user is null then raise exception 'Sign in required.' using errcode = '42501'; end if;
  if p_mode not in ('improve','tailor','match','review') then raise exception 'Unknown generation mode.' using errcode = '22023'; end if;
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
  if v_count >= 30 then raise exception 'Monthly application allowance reached.' using errcode = 'P0001'; end if;
  insert into public.ai_usage(user_id,mode,period_start,period_end)
    values(v_user,p_mode,v_subscription.current_period_start,v_subscription.current_period_end) returning id into v_id;
  return v_id;
end;
$$;

-- Verified employers publish directly. Moderation can still quarantine or reject an unsafe listing.
create or replace function private.require_job_review() returns trigger language plpgsql security invoker set search_path='' as $$
declare requested boolean;
begin
 if current_user='authenticated' then
  requested:=new.publication_requested or new.status='published';
  if tg_op='UPDATE' and old.moderation_status in ('quarantined','rejected') then
   new.status:='draft';new.published_at:=null;new.publication_requested:=requested;new.moderation_status:=old.moderation_status;return new;
  end if;
  if requested then
   if not private.is_active_hiring_team(new.organisation_id) then raise exception 'Verified hiring authority required' using errcode='42501';end if;
   new.status:='published';new.published_at:=coalesce(new.published_at,now());new.publication_requested:=false;new.moderation_status:='approved';new.moderation_updated_at:=clock_timestamp();
  else new.moderation_status:='approved';new.published_at:=null;end if;
 end if;return new;
end;$$;
create function private.notify_listing_publication() returns trigger language plpgsql security definer set search_path='' as $$
declare s record;
begin
 if new.status='published' and (tg_op='INSERT' or old.status is distinct from 'published' or old.published_at is distinct from new.published_at) then
  for s in select user_id from private.staff_members where enabled loop
   perform private.queue_account_notice(s.user_id,'listing-published:'||new.id||':'||new.moderation_updated_at,'A vacancy has been published',left(new.company||' · '||new.title||'. Published by a verified hiring team; available for moderation.',2000),'/account?tab=admin',false);
  end loop;
 end if;return new;
end;$$;
revoke all on function private.notify_listing_publication() from public,anon,authenticated;
alter table public.notifications drop constraint notifications_path_check;
alter table public.notifications add constraint notifications_path_check check(path in ('/applications','/employers/dashboard','/account','/employers/sample','/account?tab=dashboard','/account?tab=verification','/account?tab=admin'));
create trigger listing_publication_notice after insert or update on public.jobs for each row execute function private.notify_listing_publication();

create table private.discovery_views(view_id uuid primary key,recorded_at timestamptz not null default now());
alter table private.discovery_views enable row level security;revoke all on private.discovery_views from public,anon,authenticated;grant all on private.discovery_views to service_role;
create function public.record_discovery_view(p_view uuid,p_orgs uuid[],p_kind text,p_region text,p_keyword text,p_network text) returns boolean language plpgsql security definer set search_path='' as $$
begin
 delete from private.discovery_views where recorded_at<now()-interval '48 hours';
 insert into private.discovery_views(view_id) values(p_view) on conflict do nothing;
 if not found then return false;end if;
 perform public.record_discovery(p_orgs,p_kind,p_region,p_keyword,p_network);return true;
end;$$;
revoke all on function public.record_discovery_view(uuid,uuid[],text,text,text,text) from public,anon,authenticated;grant execute on function public.record_discovery_view(uuid,uuid[],text,text,text,text) to service_role;
create function public.read_discovery_by_region(p_org uuid,p_days integer,p_region text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare d date:=(now() at time zone 'Australia/Melbourne')::date-(least(greatest(p_days,1),365)-1);
begin
 if p_region is not null and p_region not in ('ACT','NSW','NT','QLD','SA','TAS','VIC','WA','OTHER','UNKNOWN') then raise exception 'Invalid region';end if;
 return jsonb_build_object(
 'totals',coalesce((select jsonb_agg(x) from(select kind,sum(events)::integer as count from private.discovery_daily where organisation_id=p_org and day>=d and (p_region is null or region=p_region) group by kind having p_region is null or sum(events)>=5)x),'[]'::jsonb),
 'regions',coalesce((select jsonb_agg(x) from(select region,sum(events)::integer as count from private.discovery_daily where organisation_id=p_org and day>=d group by region having sum(events)>=5)x),'[]'::jsonb),
 'keywords',coalesce((select jsonb_agg(x) from(select keyword,sum(events)::integer as count from private.discovery_daily where organisation_id=p_org and day>=d and keyword<>'' and (p_region is null or region=p_region) group by keyword having sum(events)>=5 order by sum(events) desc limit 20)x),'[]'::jsonb),
 'keywordRegions',coalesce((select jsonb_agg(x) from(select keyword,region,sum(events)::integer as count from private.discovery_daily where organisation_id=p_org and day>=d and keyword<>'' and (p_region is null or region=p_region) group by keyword,region having sum(events)>=5 order by sum(events) desc limit 100)x),'[]'::jsonb),
 'selectedRegion',p_region);
end;$$;
revoke all on function public.read_discovery_by_region(uuid,integer,text) from public,anon,authenticated;grant execute on function public.read_discovery_by_region(uuid,integer,text) to service_role;
create table private.billing_risk_events(event_id text primary key,customer_id text not null,event_type text not null,object_id text not null,created_at timestamptz not null default now());
alter table private.billing_risk_events enable row level security;revoke all on private.billing_risk_events from public,anon,authenticated;grant all on private.billing_risk_events to service_role;
create function public.record_billing_risk(p_event text,p_customer text,p_type text,p_object text) returns void language plpgsql security definer set search_path='' as $$
declare s record;
begin
 if not exists(select 1 from public.billing_customers where stripe_customer_id=p_customer) and not exists(select 1 from public.organisation_billing_accounts where stripe_customer_id=p_customer) then return;end if;
 insert into private.billing_risk_events(event_id,customer_id,event_type,object_id) values(p_event,p_customer,p_type,p_object) on conflict do nothing;
 if not found then return;end if;
 for s in select user_id from private.staff_members where enabled loop
 perform private.queue_account_notice(s.user_id,'billing-risk:'||p_event,'Sandbox billing requires review',p_type||' recorded. Review the Stripe sandbox event '||p_event||'. Do not assume a warning proves fraud. Refund and subscription cancellation are separate actions.','/account?tab=admin',false);
 end loop;
end;$$;
revoke all on function public.record_billing_risk(text,text,text,text) from public,anon,authenticated;grant execute on function public.record_billing_risk(text,text,text,text) to service_role;
create function public.apply_business_subscription(p_org uuid,p_customer text,p_subscription text,p_price text,p_tier text,p_status text,p_start timestamptz,p_end timestamptz,p_cancel boolean,p_user uuid,p_token uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from private.billing_leases where user_id=p_user and token=p_token and expires_at>clock_timestamp() for update;
 if not found then raise exception 'A current billing lease is required' using errcode='42501';end if;
 if not exists(select 1 from public.organisation_billing_accounts where organisation_id=p_org and stripe_customer_id=p_customer and billing_user_id=p_user) then raise exception 'Unknown business billing mapping' using errcode='42501';end if;
 insert into public.business_subscriptions(organisation_id,stripe_customer_id,stripe_subscription_id,price_id,tier,status,current_period_start,current_period_end,cancel_at_period_end,updated_at) values(p_org,p_customer,p_subscription,p_price,p_tier,p_status,p_start,p_end,p_cancel,now())
 on conflict(organisation_id) do update set stripe_customer_id=excluded.stripe_customer_id,stripe_subscription_id=excluded.stripe_subscription_id,price_id=excluded.price_id,tier=excluded.tier,status=excluded.status,current_period_start=excluded.current_period_start,current_period_end=excluded.current_period_end,cancel_at_period_end=excluded.cancel_at_period_end,updated_at=now();
end;$$;
revoke all on function public.apply_business_subscription(uuid,text,text,text,text,text,timestamptz,timestamptz,boolean,uuid,uuid) from public,anon,authenticated;grant execute on function public.apply_business_subscription(uuid,text,text,text,text,text,timestamptz,timestamptz,boolean,uuid,uuid) to service_role;
commit;
