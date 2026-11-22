begin;

-- Fixture identities remain quarantined even if somebody edits their display name or flag.
create table private.production_fixtures (
 kind text not null check(kind in('organisation','job')), id uuid not null,
 reason text not null, recorded_at timestamptz not null default now(), primary key(kind,id)
);
alter table private.production_fixtures enable row level security;
revoke all on private.production_fixtures from public,anon,authenticated;
grant all on private.production_fixtures to service_role;
insert into private.production_fixtures(kind,id,reason)
 select 'organisation',id,'Existing explicitly designated fixture' from public.organisations where is_test
 union all select 'organisation',id,'Known fictional ACME example company' from public.organisations where name='ACME Corporation (Example Inc.)'
 on conflict do nothing;
update public.organisations set is_test=true where id in(select id from private.production_fixtures where kind='organisation');
insert into private.production_fixtures(kind,id,reason)
 select 'job',j.id,'Existing fixture or vacancy belonging to a quarantined fixture organisation'
 from public.jobs j where j.is_test or exists(select 1 from private.production_fixtures f where f.kind='organisation' and f.id=j.organisation_id)
 on conflict do nothing;
update public.jobs set is_test=true,status='closed',publication_requested=false where id in(select id from private.production_fixtures where kind='job');
update private.launch_profiles set consented_at=null,consented_by=null,released_at=null,released_by=null where organisation_id in(select id from private.production_fixtures where kind='organisation');
update private.launch_jobs set consented_at=null,consented_by=null,released_at=null,released_by=null where job_id in(select id from private.production_fixtures where kind='job');

create function private.enforce_fixture_quarantine() returns trigger language plpgsql security definer set search_path='' as $$
declare v_kind text:=case when tg_table_name='jobs' then 'job' else 'organisation' end;begin
 new.is_test:=new.is_test or (tg_op='UPDATE' and old.is_test) or exists(select 1 from private.production_fixtures where kind=v_kind and id=new.id);
 if tg_table_name='jobs' then
  new.is_test:=new.is_test or exists(select 1 from public.organisations where id=new.organisation_id and is_test);
  if new.is_test and new.status='published' then new.status:='draft';new.publication_requested:=false;end if;
 end if;
 if new.is_test then insert into private.production_fixtures(kind,id,reason) values(v_kind,new.id,'Fixture quarantine enforced by database') on conflict do nothing;end if;
 return new;
end;$$;
revoke all on function private.enforce_fixture_quarantine() from public,anon,authenticated;
create trigger zzzzzz_fixture_quarantine before insert or update on public.organisations for each row execute function private.enforce_fixture_quarantine();
create trigger zzzzzz_fixture_quarantine before insert or update on public.jobs for each row execute function private.enforce_fixture_quarantine();

-- A public aggregate must not reveal the existence or measurements of a private business.
create policy insights_release_visibility on public.organisation_response_insights as restrictive for select to anon,authenticated
 using(private.launch_profile_public(organisation_id) or private.launch_can_prepare(organisation_id));

-- Sample workspaces and manually assigned test entitlements are reserved for the protected owner.
create function private.is_sandbox_owner(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select p_user='563e67cd-32d5-4e8c-a70a-2c0b51195bb6'::uuid and exists(select 1 from private.staff_members where user_id=p_user and enabled and role='admin');
$$;
revoke all on function private.is_sandbox_owner(uuid) from public,anon,authenticated;
grant execute on function private.is_sandbox_owner(uuid) to service_role;
create or replace function private.has_sample_workspace() returns boolean language sql stable security definer set search_path='' as $$
 select private.is_sandbox_owner(auth.uid()) and exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null);
$$;
create or replace function private.my_testing_access() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('tier',e.tier,'startsAt',e.starts_at,'expiresAt',e.expires_at) from private.test_entitlements e
 join auth.users u on u.id=e.user_id where e.user_id=auth.uid() and private.is_sandbox_owner(e.user_id)
 and e.starts_at<=now() and e.expires_at>now() and u.email_confirmed_at is not null;
$$;

-- Historical sandbox payments and manual test grants never unlock ordinary accounts.
do $$declare r record;v text;begin
 for r in select pg_get_functiondef(p.oid) def from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname in('account_business_tier','my_enterprise_careers_access','manage_test_entitlement') loop
  v:=replace(r.def,'where t.user_id=p_user and t.starts_at',
   'where t.user_id=p_user and private.is_sandbox_owner(t.user_id) and t.starts_at');
  v:=replace(v,'where t.user_id=auth.uid() and u.email_confirmed_at',
   'where t.user_id=auth.uid() and private.is_sandbox_owner(t.user_id) and u.email_confirmed_at');
  v:=replace(v,'where b.billing_user_id=p_user and b.is_primary and s.status',
   'where b.billing_user_id=p_user and b.is_primary and (b.livemode or private.is_sandbox_owner(p_user)) and s.status');
  v:=replace(v,'where b.billing_user_id=auth.uid() and b.is_primary and s.tier',
   'where b.billing_user_id=auth.uid() and b.is_primary and (b.livemode or private.is_sandbox_owner(auth.uid())) and s.tier');
  v:=replace(v,'if p_designate then',
   'if not exists(select 1 from auth.users u where lower(u.email)=lower(trim(p_email)) and private.is_sandbox_owner(u.id)) then raise exception ''Only the protected administrator can receive test access'' using errcode=''42501'';end if; if p_designate then');
  if r.def like '%private.account_business_tier%' or r.def like '%private.my_enterprise_careers_access%' then
   v:=replace(v,'join public.business_subscriptions s using(organisation_id)',
    'join public.business_subscriptions s on s.organisation_id=b.organisation_id and s.stripe_customer_id=b.stripe_customer_id');
  end if;
  execute v;
 end loop;
end;$$;

-- Keep earlier Stripe test records historical, and require explicit mode on current personal billing.
alter table public.billing_customers add column livemode boolean not null default false;
alter table public.subscriptions add column livemode boolean not null default false;
alter table public.billing_customers alter column livemode set default true;
alter table public.subscriptions alter column livemode set default true;
alter table public.billing_customer_history alter column organisation_id drop not null;
create function private.personal_subscription_mode() returns trigger language plpgsql security definer set search_path='' as $$
begin
 select livemode into new.livemode from public.billing_customers where user_id=new.user_id and stripe_customer_id=new.stripe_customer_id;
 if new.livemode is null then raise exception 'Trusted personal billing mapping required' using errcode='42501';end if;
 return new;
end;$$;
revoke all on function private.personal_subscription_mode() from public,anon,authenticated;
create trigger personal_subscription_mode before insert or update on public.subscriptions for each row execute function private.personal_subscription_mode();
create function public.archive_individual_test_billing(p_user uuid,p_token uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from private.billing_leases where user_id=p_user and token=p_token and expires_at>clock_timestamp() for update;
 if not found or private.is_sandbox_owner(p_user) then raise exception 'Billing transition unavailable' using errcode='42501';end if;
 insert into public.billing_customer_history(stripe_customer_id,user_id,organisation_id,livemode,subscription_snapshot)
 select c.stripe_customer_id,c.user_id,null,false,to_jsonb(s) from public.billing_customers c left join public.subscriptions s using(user_id)
 where c.user_id=p_user and not c.livemode on conflict do nothing;
 delete from public.subscriptions where user_id=p_user and not livemode;
 delete from public.billing_customers where user_id=p_user and not livemode;
end;$$;
revoke all on function public.archive_individual_test_billing(uuid,uuid) from public,anon,authenticated;
grant execute on function public.archive_individual_test_billing(uuid,uuid) to service_role;

-- Both the HTTP boundary and the database entitlement boundary must reject test payments for ordinary users.
create function private.personal_subscription_current(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.subscriptions s join public.billing_customers c on c.user_id=s.user_id and c.stripe_customer_id=s.stripe_customer_id
 where (p_user=auth.uid() or current_setting('role',true)='service_role') and s.user_id=p_user and s.status in('active','trialing') and s.price_id is not null and s.current_period_start<=now() and s.current_period_end>now()
 and s.livemode=c.livemode and (s.livemode or private.is_sandbox_owner(p_user)));
$$;
revoke all on function private.personal_subscription_current(uuid) from public,anon,authenticated;
grant execute on function private.personal_subscription_current(uuid) to authenticated,service_role;
-- Existing quota and chat implementations keep their contracts, but their personal lookup is now mode-fenced.
do $$declare r record;v text;begin
 for r in select p.oid,pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname in('reserve_ai_usage_internal','check_assistant_chat') loop
  v:=replace(r.def,'else select * into v_subscription from public.subscriptions where user_id = v_user;end if;',
   'else select * into v_subscription from public.subscriptions where user_id = v_user and private.personal_subscription_current(v_user);end if;');
  v:=replace(v,'if private.my_enterprise_careers_access() is null and coalesce(v_test->>''tier'','''')<>''careers_plus'' and not exists(',
   'if private.my_enterprise_careers_access() is null and coalesce(v_test->>''tier'','''')<>''careers_plus'' and not private.personal_subscription_current(v_user) and not exists(');
  -- The original chat subquery also needs the same mode requirement.
  v:=replace(v,'where user_id=v_user and status in (''active'',''trialing'') and price_id is not null',
   'where user_id=v_user and private.personal_subscription_current(v_user) and status in (''active'',''trialing'') and price_id is not null');
  execute v;
 end loop;
end;$$;

commit;
