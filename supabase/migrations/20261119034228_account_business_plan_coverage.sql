begin;
-- Historical Stripe customer mappings remain available for reconciliation, but only
-- one billing stream per account may create or change a subscription.
alter table public.organisation_billing_accounts add column is_primary boolean not null default true;
with ranked as (
 select b.organisation_id,row_number() over(partition by b.billing_user_id order by
   case when s.status in ('active','trialing') and s.current_period_end>now() then 0 else 1 end,
   b.created_at,b.organisation_id) n
 from public.organisation_billing_accounts b left join public.business_subscriptions s using(organisation_id)
)
update public.organisation_billing_accounts b set is_primary=(r.n=1) from ranked r where r.organisation_id=b.organisation_id;
create unique index one_business_billing_stream on public.organisation_billing_accounts(billing_user_id) where is_primary;

create table private.business_plan_organisations(
 organisation_id uuid primary key references public.organisations(id) on delete cascade,
 billing_user_id uuid not null references auth.users(id) on delete cascade,
 linked_at timestamptz not null default clock_timestamp()
);
create index business_plan_owner on private.business_plan_organisations(billing_user_id,linked_at,organisation_id);
alter table private.business_plan_organisations enable row level security;
revoke all on private.business_plan_organisations from public,anon,authenticated;
grant all on private.business_plan_organisations to service_role;

create function private.business_plan_limit(p_tier text) returns integer language sql immutable set search_path='' as $$
 select case when p_tier in ('enterprise','agency_enterprise') then 10 when p_tier in ('growth','agency_growth') then 3 else 1 end;
$$;
revoke all on function private.business_plan_limit(text) from public,anon,authenticated;

create function private.account_business_tier(p_user uuid) returns text language sql stable security definer set search_path='' as $$
 select coalesce(
  (select t.tier from private.test_entitlements t join auth.users u on u.id=t.user_id
   join private.test_account_allowlist l on l.email=lower(u.email) join public.business_accounts a on a.user_id=t.user_id
   where t.user_id=p_user and t.starts_at<=now() and t.expires_at>now() and u.email_confirmed_at is not null
   and t.tier<>'careers_plus' and case when t.tier like 'agency_%' then a.kind='agency' else a.kind='employer' end),
  (select s.tier from public.organisation_billing_accounts b join public.business_subscriptions s using(organisation_id)
   where b.billing_user_id=p_user and b.is_primary and s.status in ('active','trialing')
   and s.current_period_start<=now() and s.current_period_end>now()),
  (select p.tier from public.employer_plans p join public.organisation_members m using(organisation_id)
   where m.user_id=p_user and m.role='owner' and p.starts_at<=now() and p.ends_at>now()
   order by private.business_plan_limit(p.tier) desc,p.starts_at desc limit 1));
$$;
revoke all on function private.account_business_tier(uuid) from public,anon,authenticated;

-- The ordered association list also caps entitlements if a plan is downgraded in
-- Stripe directly. Business profiles and application history are never deleted.
create or replace function private.business_team_tier(p_org uuid) returns text language sql stable security definer set search_path='' as $$
 select private.account_business_tier(a.billing_user_id) from private.business_plan_organisations a
 where a.organisation_id=p_org
 and exists(select 1 from public.organisation_members m where m.organisation_id=p_org and m.user_id=a.billing_user_id and m.role='owner')
 and (select count(*) from private.business_plan_organisations b join public.organisations o on o.id=b.organisation_id
      where b.billing_user_id=a.billing_user_id and o.removed_at is null
      and exists(select 1 from public.organisation_members m where m.organisation_id=b.organisation_id and m.user_id=b.billing_user_id and m.role='owner')
      and (b.linked_at,b.organisation_id)<=(a.linked_at,a.organisation_id))
     <=private.business_plan_limit(private.account_business_tier(a.billing_user_id));
$$;

create function private.fill_business_plan(p_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_room integer; r record;
begin
 perform pg_advisory_xact_lock(hashtextextended('business-plan:'||p_user::text,0));
 select greatest(0,private.business_plan_limit(private.account_business_tier(p_user))-count(*))::integer into v_room
 from private.business_plan_organisations a join public.organisations o on o.id=a.organisation_id
 where a.billing_user_id=p_user and o.removed_at is null;
 for r in select m.organisation_id from public.organisation_members m join public.organisations o on o.id=m.organisation_id
 left join public.organisation_billing_accounts b on b.organisation_id=o.id
 where m.user_id=p_user and m.role='owner' and o.removed_at is null
 and not exists(select 1 from private.business_plan_organisations a where a.organisation_id=o.id)
 order by coalesce(b.is_primary,false) desc,(b.organisation_id is not null) desc,o.created_at,o.id limit v_room
 loop
  insert into private.business_plan_organisations(organisation_id,billing_user_id) values(r.organisation_id,p_user);
 end loop;
end;$$;
revoke all on function private.fill_business_plan(uuid) from public,anon,authenticated;
do $$declare r record;begin for r in select distinct user_id from public.organisation_members where role='owner' loop perform private.fill_business_plan(r.user_id);end loop;end;$$;

create function private.link_new_business_plan() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.role='owner' then perform private.fill_business_plan(new.user_id);end if;
 return new;
end;$$;
revoke all on function private.link_new_business_plan() from public,anon,authenticated;
create trigger link_new_business_plan after insert on public.organisation_members for each row execute function private.link_new_business_plan();

create function private.expand_business_plan() returns trigger language plpgsql security definer set search_path='' as $$
declare v_user uuid;
begin
 if new.status in ('active','trialing') then
  if tg_op='INSERT' or old.status not in ('active','trialing') or private.business_plan_limit(new.tier)>private.business_plan_limit(old.tier) then
   select billing_user_id into v_user from public.organisation_billing_accounts where organisation_id=new.organisation_id and is_primary;
   if v_user is not null then perform private.fill_business_plan(v_user);end if;
  end if;
 end if;
 return new;
end;$$;
revoke all on function private.expand_business_plan() from public,anon,authenticated;
create trigger expand_business_plan after insert or update on public.business_subscriptions for each row execute function private.expand_business_plan();

-- Exposes the billing identity and effective coverage to the hiring team, without
-- exposing Stripe IDs, invoices or payment methods to invited managers.
create function private.my_business_plan() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_tier text;
begin
 if v_user is null then raise exception 'Sign in to view business coverage' using errcode='42501';end if;
 v_tier:=private.account_business_tier(v_user);
 return jsonb_build_object('tier',v_tier,'limit',private.business_plan_limit(v_tier),
  'used',(select count(*) from private.business_plan_organisations a join public.organisations o on o.id=a.organisation_id where a.billing_user_id=v_user and o.removed_at is null),
  'billingOwnerId',v_user,'billingOwnerEmail',(select email from auth.users where id=v_user),
  'organisations',(select coalesce(jsonb_agg(jsonb_build_object('id',m.organisation_id,
   'billingOwnerId',coalesce(a.billing_user_id,owner.user_id),'billingOwnerEmail',u.email,
   'associated',a.organisation_id is not null,'covered',private.business_team_tier(m.organisation_id) is not null,
   'tier',private.business_team_tier(m.organisation_id))),'[]')
   from public.organisation_members m join public.organisations o on o.id=m.organisation_id
   left join private.business_plan_organisations a on a.organisation_id=m.organisation_id
   left join lateral(select user_id from public.organisation_members where organisation_id=m.organisation_id and role='owner' order by user_id limit 1) owner on true
   left join auth.users u on u.id=coalesce(a.billing_user_id,owner.user_id)
   where m.user_id=v_user and o.removed_at is null and (m.role='owner' or private.business_team_enabled(m.organisation_id))));
end;$$;
revoke all on function private.my_business_plan() from public,anon;
grant execute on function private.my_business_plan() to authenticated;
create function public.my_business_plan() returns jsonb language sql stable security invoker set search_path='' as $$select private.my_business_plan();$$;
revoke all on function public.my_business_plan() from public,anon;
grant execute on function public.my_business_plan() to authenticated;

create function private.set_business_plan_organisations(p_organisations uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_limit integer;
begin
 if v_user is null or p_organisations is null then raise exception 'Sign in to manage business coverage' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('business-plan:'||v_user::text,0));
 v_limit:=private.business_plan_limit(private.account_business_tier(v_user));
 if cardinality(p_organisations)>v_limit then raise exception 'This plan includes up to % businesses. Remove a business from coverage or review your plan.',v_limit using errcode='23514';end if;
 if cardinality(p_organisations)<>(select count(distinct x) from unnest(p_organisations) x)
 or exists(select 1 from unnest(p_organisations) x where not exists(select 1 from public.organisation_members m join public.organisations o on o.id=m.organisation_id where m.organisation_id=x and m.user_id=v_user and m.role='owner' and o.removed_at is null)) then
  raise exception 'Only businesses you own can be linked to your plan' using errcode='42501';
 end if;
 delete from private.business_plan_organisations where billing_user_id=v_user and not(organisation_id=any(p_organisations));
 insert into private.business_plan_organisations(organisation_id,billing_user_id)
 select x,v_user from unnest(p_organisations) x where not exists(select 1 from private.business_plan_organisations a where a.organisation_id=x);
 if exists(select 1 from unnest(p_organisations) x join private.business_plan_organisations a on a.organisation_id=x where a.billing_user_id<>v_user) then
  raise exception 'This business is already linked to another billing owner' using errcode='42501';
 end if;
 return private.my_business_plan();
end;$$;
revoke all on function private.set_business_plan_organisations(uuid[]) from public,anon;
grant execute on function private.set_business_plan_organisations(uuid[]) to authenticated;
create function public.set_business_plan_organisations(p_organisations uuid[]) returns jsonb language sql security invoker set search_path='' as $$select private.set_business_plan_organisations(p_organisations);$$;
revoke all on function public.set_business_plan_organisations(uuid[]) from public,anon;
grant execute on function public.set_business_plan_organisations(uuid[]) to authenticated;

-- All publication limits resolve the same account coverage as Applicants and Team.
create or replace function private.enforce_listing_lifecycle() returns trigger language plpgsql security definer set search_path='' as $$
declare paid boolean;
begin
 if new.status='published' then
  perform 1 from public.organisations where id=new.organisation_id and is_verified and suspended_at is null and removed_at is null for update;
  if not found then raise exception 'An active verified business is required' using errcode='42501';end if;
  paid:=private.business_team_tier(new.organisation_id) is not null;
  if not paid and exists(select 1 from public.jobs where organisation_id=new.organisation_id and id<>new.id and status='published' and expires_at>now()) then
   raise exception 'Free accounts include one active job posting per company. Archive the existing role before publishing or renewing another.' using errcode='23514';
  end if;
  if tg_op='INSERT' then new.expires_at:=least(coalesce(new.expires_at,now()+interval '40 days'),now()+interval '40 days');
  elsif old.published_at is null and (old.expires_at=old.created_at+interval '40 days' or old.expires_at=old.created_at+interval '30 days') then new.expires_at:=now()+interval '40 days';
  elsif old.status is distinct from 'published' and new.expires_at<=now() then new.expires_at:=now()+interval '40 days';
  else new.expires_at:=least(new.expires_at,now()+interval '40 days');end if;
  if new.expires_at<=now() then raise exception 'Choose a closing time in the future' using errcode='22023';end if;
 end if;
 return new;
end;$$;
commit;
