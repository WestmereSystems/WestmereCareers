begin;
-- Existing sandbox customer IDs remain historical; they never become live customers.
alter table public.organisation_billing_accounts add column livemode boolean not null default false;
-- Preserve every existing mapping, including its original Stripe customer ID.
-- The only existing FK targets stripe_customer_id, whose unique constraint is retained.
alter table public.organisation_billing_accounts drop constraint organisation_billing_accounts_pkey;
alter table public.organisation_billing_accounts add primary key(organisation_id,livemode);
create table public.billing_customer_history (
 stripe_customer_id text primary key, user_id uuid not null references auth.users(id) on delete restrict,
 organisation_id uuid not null references public.organisations(id) on delete restrict,
 livemode boolean not null, subscription_snapshot jsonb, archived_at timestamptz not null default now()
);
create index billing_history_owner on public.billing_customer_history(user_id,archived_at);
create index billing_history_organisation on public.billing_customer_history(organisation_id);
alter table public.billing_customer_history enable row level security;
revoke all on public.billing_customer_history from public,anon,authenticated;
grant select on public.billing_customer_history to authenticated;
grant all on public.billing_customer_history to service_role;
create policy billing_history_own on public.billing_customer_history for select to authenticated using(user_id=(select auth.uid()));
create function public.archive_sandbox_billing(p_user uuid,p_token uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from private.billing_leases where user_id=p_user and token=p_token and expires_at>clock_timestamp() for update;
 if not found or p_user='563e67cd-32d5-4e8c-a70a-2c0b51195bb6'::uuid then raise exception 'Billing transition unavailable' using errcode='42501';end if;
 insert into public.billing_customer_history(stripe_customer_id,user_id,organisation_id,livemode,subscription_snapshot)
 select b.stripe_customer_id,b.billing_user_id,b.organisation_id,false,to_jsonb(s) from public.organisation_billing_accounts b left join public.business_subscriptions s on s.stripe_customer_id=b.stripe_customer_id where b.billing_user_id=p_user and not b.livemode on conflict do nothing;
 update public.employer_plans set ends_at=least(ends_at,now()) where organisation_id in(select organisation_id from public.organisation_billing_accounts where billing_user_id=p_user and not livemode);
 update public.business_subscriptions set status='canceled',current_period_end=least(current_period_end,now()),updated_at=now() where stripe_customer_id in(select stripe_customer_id from public.organisation_billing_accounts where billing_user_id=p_user and not livemode);
 update public.organisation_billing_accounts set is_primary=false where billing_user_id=p_user and not livemode;
end;$$;
revoke all on function public.archive_sandbox_billing(uuid,uuid) from public,anon,authenticated;
grant execute on function public.archive_sandbox_billing(uuid,uuid) to service_role;
-- Conversion is recorded atomically after Stripe has stopped the personal renewal.
create function private.complete_business_registration(p_user uuid,p_kind text,p_name text,p_terms text,p_hash text,p_confirmed boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if current_setting('role',true)<>'service_role' then raise exception 'Service access required' using errcode='42501';end if;
 if not p_confirmed or not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null) then raise exception 'Confirm the permanent account conversion' using errcode='42501';end if;
 perform 1 from private.billing_leases where user_id=p_user and expires_at>clock_timestamp() for update;
 if not found then raise exception 'Current billing lease required' using errcode='42501';end if;
 if not exists(select 1 from public.business_accounts where user_id=p_user) then
  update public.subscriptions set status='canceled',cancel_at_period_end=false,current_period_end=least(current_period_end,now()) where user_id=p_user;
  update private.test_entitlements set expires_at=least(expires_at,now()) where user_id=p_user and tier='careers_plus';
 end if;
 insert into public.business_accounts(user_id,kind,trading_name,terms_version,terms_sha256,accepted_at)
 values(p_user,p_kind,p_name,p_terms,p_hash,now()) on conflict(user_id) do update set trading_name=excluded.trading_name,terms_version=excluded.terms_version,terms_sha256=excluded.terms_sha256,accepted_at=excluded.accepted_at;
end;$$;
revoke all on function private.complete_business_registration(uuid,text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function private.complete_business_registration(uuid,text,text,text,text,boolean) to service_role;
create function public.complete_business_registration(p_user uuid,p_kind text,p_name text,p_terms text,p_hash text,p_confirmed boolean) returns void language sql security invoker set search_path='' as $$select private.complete_business_registration(p_user,p_kind,p_name,p_terms,p_hash,p_confirmed);$$;
revoke all on function public.complete_business_registration(uuid,text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function public.complete_business_registration(uuid,text,text,text,text,boolean) to service_role;
-- A verified enabled staff identity retains sign-in during founding onboarding.
create or replace function private.launch_email_allowed(p_email text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u join private.staff_members s on s.user_id=u.id where lower(u.email)=lower(trim(p_email)) and u.email_confirmed_at is not null and s.enabled)
 or not exists(select 1 from private.launch_access a where a.email=lower(trim(p_email)) and a.revoked_at is not null);
$$;
-- Account restrictions also apply to direct Data API table access and existing JWTs.
-- Only private account records gain an additional deny policy. Public discovery,
-- billing, subscription and unrelated application tables keep their existing RLS.
do $$declare t text;begin
 foreach t in array array['profiles','applications','saved_jobs','saved_searches','notifications','business_accounts','organisation_members','employer_verification_requests'] loop
 execute format('create policy launch_account_restriction on public.%I as restrictive for all to authenticated using ((select private.launch_account_allowed())) with check ((select private.launch_account_allowed()))',t);
 end loop;
end;$$;
create table private.launch_mail_preferences (
 email text primary key check(email=lower(trim(email))), token uuid not null unique default gen_random_uuid(),
 removed_at timestamptz, updated_at timestamptz not null default now()
);
create table private.launch_campaign (
 singleton boolean primary key default true check(singleton),queued_at timestamptz not null default now(),queued_by uuid references auth.users(id) on delete set null
);
alter table private.launch_mail_preferences enable row level security;
alter table private.launch_campaign enable row level security;
revoke all on private.launch_mail_preferences,private.launch_campaign from public,anon,authenticated;
grant all on private.launch_mail_preferences,private.launch_campaign to service_role;
create index launch_campaign_actor on private.launch_campaign(queued_by);
create view private.launch_mailing_list as
 select email,bool_or(registered) as registered,bool_or(opted_in) as opted_in,min(created_at) as created_at
 from (
  select lower(email) as email,true as registered,false as opted_in,created_at from auth.users where email_confirmed_at is not null and email is not null
  union all select email,false,true,created_at from private.launch_requests where kind='candidate' and status not in('revoked','declined')
 ) recipients group by email;
revoke all on private.launch_mailing_list from public,anon,authenticated;
grant select on private.launch_mailing_list to service_role;
alter table private.alert_outbox drop constraint alert_identity;
alter table private.alert_outbox add constraint alert_identity check((kind='launch' and invitation_id is null and search_id is null) or (kind='invitation' and user_id is null and invitation_id is not null) or (kind not in('invitation','launch') and user_id is not null and invitation_id is null));
alter table private.alert_outbox drop constraint alert_outbox_kind_check;
alter table private.alert_outbox add constraint alert_outbox_kind_check check(kind in('digest','preview','account','invitation','launch'));
create unique index launch_announcement_once on private.alert_outbox(recipient) where kind='launch';
alter function private.delivery_eligible(private.alert_outbox) rename to delivery_eligible_before_launch_mail;
revoke all on function private.delivery_eligible_before_launch_mail(private.alert_outbox) from public,anon,authenticated;
create function private.delivery_eligible(b private.alert_outbox) returns boolean language sql stable security definer set search_path='' as $$
 select case when b.kind='launch' then
 private.launch_open() and b.recipient !~* '[.](invalid|test)$' and exists(select 1 from private.launch_campaign where singleton)
 and exists(select 1 from private.launch_mailing_list where email=b.recipient)
 and not exists(select 1 from private.launch_mail_preferences where email=b.recipient and removed_at is not null)
 and not exists(select 1 from private.launch_access where email=b.recipient and revoked_at is not null)
 and not exists(select 1 from auth.users u join private.alert_suppressions s on s.user_id=u.id where lower(u.email)=b.recipient)
 else private.delivery_eligible_before_launch_mail(b) end;
$$;
revoke all on function private.delivery_eligible(private.alert_outbox) from public,anon,authenticated;
-- Public unsubscribe capability exposes neither email addresses nor list membership.
create function public.unsubscribe_launch(p_token uuid) returns void language plpgsql security definer set search_path='' as $$declare v_email text;begin
 update private.launch_mail_preferences set removed_at=now(),updated_at=now() where token=p_token returning email into v_email;
 if v_email is not null then update private.alert_outbox set status='canceled',error_code='LAUNCH_UNSUBSCRIBED' where kind='launch' and recipient=v_email and status in('queued','leased');end if;
end;$$;
revoke all on function public.unsubscribe_launch(uuid) from public,anon,authenticated;
grant execute on function public.unsubscribe_launch(uuid) to service_role;
create function private.admin_launch_operations(p_action text,p_view text,p_offset integer,p_user uuid,p_email text,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_email text;v_count integer;v_rows jsonb;v_total integer;begin
 perform private.require_launch_account();
 if private.my_staff_role() is distinct from 'admin' then raise exception 'Administrator access required' using errcode='42501';end if;
 if p_offset<0 or p_offset>1000000 or p_offset%25<>0 then raise exception 'Invalid page' using errcode='22023';end if;
 if p_action='list' then
  if p_view='registrations' then
   select count(*) into v_total from auth.users;
   select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id desc),'[]') into v_rows from(
    select u.id,u.email,u.created_at,u.email_confirmed_at is not null as verified,coalesce(b.kind,'applicant') as kind,
     exists(select 1 from private.staff_members s where s.user_id=u.id and s.enabled) as staff,
     exists(select 1 from private.launch_access a where a.revoked_at is not null and (a.user_id=u.id or (a.user_id is null and a.email=lower(u.email)))) as restricted
    from auth.users u left join public.business_accounts b on b.user_id=u.id order by u.created_at desc,u.id desc limit 25 offset p_offset
   )r;
  elsif p_view='mailing' then
   select count(*) into v_total from private.launch_mailing_list;
   select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at desc,r.email),'[]') into v_rows from(
    select l.*,p.removed_at,(select o.status from private.alert_outbox o where o.kind='launch' and o.recipient=l.email) as delivery_status
    from private.launch_mailing_list l left join private.launch_mail_preferences p using(email) order by l.created_at desc,l.email limit 25 offset p_offset
   )r;
  else raise exception 'Choose a list' using errcode='22023';end if;
  return jsonb_build_object('rows',v_rows,'total',v_total,'marketplaceOpen',private.launch_open(),'announcementQueuedAt',(select queued_at from private.launch_campaign where singleton),
   'delivery',(select jsonb_build_object('queued',count(*) filter(where status in('queued','leased')),'accepted',count(*) filter(where status in('accepted','delivered')),'failed',count(*) filter(where status in('failed','blocked','ambiguous')),'canceled',count(*) filter(where status='canceled')) from private.alert_outbox where kind='launch'));
 end if;
 if length(trim(p_reason))<10 or length(p_reason)>2000 then raise exception 'Record a decision reason' using errcode='22023';end if;
 if p_action in('restrict','restore') then
  select lower(email) into v_email from auth.users where id=p_user;
  if v_email is null or p_user=auth.uid() or exists(select 1 from private.staff_members where user_id=p_user and enabled) then raise exception 'Staff and own accounts cannot be restricted here' using errcode='22023';end if;
  insert into private.launch_access(email,kind,user_id,revoked_at,approved_by) values(v_email,'existing',p_user,case when p_action='restrict' then now() end,auth.uid())
  on conflict(email) do update set user_id=excluded.user_id,revoked_at=excluded.revoked_at,approved_by=auth.uid();
  if p_action='restrict' then update private.alert_outbox set status='canceled',error_code='ACCOUNT_RESTRICTED' where user_id=p_user and status in('queued','leased');end if;
 elsif p_action='remove_mail' then
  v_email:=lower(trim(p_email));
  if not exists(select 1 from private.launch_mailing_list where email=v_email) then raise exception 'Recipient unavailable' using errcode='22023';end if;
  insert into private.launch_mail_preferences(email,removed_at) values(v_email,now()) on conflict(email) do update set removed_at=now(),updated_at=now();
  update private.alert_outbox set status='canceled',error_code='LAUNCH_LIST_REMOVAL' where kind='launch' and recipient=v_email and status in('queued','leased');
 elsif p_action in('launch_and_email','announce') then
  -- Row lock and unique singleton make retries safe, including a lost HTTP response.
  perform 1 from private.launch_settings where singleton for update;
  if p_action='launch_and_email' then perform private.admin_launch('mode',null,null,p_reason,true,0);end if;
  if not private.launch_open() then raise exception 'Open the marketplace before announcing launch' using errcode='22023';end if;
  if not exists(select 1 from private.alert_settings where singleton and sending_enabled) then raise exception 'Email sending is not configured' using errcode='22023';end if;
  insert into private.launch_campaign(singleton,queued_by) values(true,auth.uid()) on conflict do nothing;
  if not found then return jsonb_build_object('message','The launch announcement has already been queued. Duplicate emails were not created.');end if;
  insert into private.launch_mail_preferences(email) select email from private.launch_mailing_list on conflict do nothing;
  insert into private.alert_outbox(user_id,recipient,kind,event_key,snapshot)
  select (select id from auth.users where lower(email)=l.email and email_confirmed_at is not null limit 1),l.email,'launch','public-launch',
   jsonb_build_object('title','Westmere Careers is live across Australia','message','Westmere Careers has launched across Australia. Explore opportunities, prepare your next application or open your business workspace. Your private account details remain private. Business profiles and vacancies appear only after their separate publication approvals.','siteOrigin',s.site_origin,'unsubscribeUrl',s.site_origin||'/launch/unsubscribe?token='||p.token)
  from private.launch_mailing_list l join private.launch_mail_preferences p using(email) cross join private.alert_settings s
  where s.singleton and p.removed_at is null and l.email !~* '[.](invalid|test)$'
   and not exists(select 1 from private.launch_access a where a.email=l.email and a.revoked_at is not null)
   and not exists(select 1 from auth.users u join private.alert_suppressions x on x.user_id=u.id where lower(u.email)=l.email)
  on conflict do nothing;
  get diagnostics v_count=row_count;
 else raise exception 'Unknown launch operation' using errcode='22023';end if;
 insert into private.moderation_audit(actor_id,subject_type,subject_id,action,reason,evidence_checks)
 values(auth.uid(),'launch_operations',coalesce(p_user,'00000000-0000-4000-8000-000000000001'::uuid),p_action,p_reason,jsonb_build_object('recipient',v_email,'queued',v_count));
 return jsonb_build_object('message',case when p_action in('launch_and_email','announce') then 'Marketplace is open. '||v_count||' launch emails queued for delivery.' when p_action='remove_mail' then 'Removed from the launch mailing list. Pending launch emails have been cancelled.' else 'Account access updated.' end);
end;$$;
revoke all on function private.admin_launch_operations(text,text,integer,uuid,text,text) from public,anon;
grant execute on function private.admin_launch_operations(text,text,integer,uuid,text,text) to authenticated;
create function public.admin_launch_operations(p_action text default 'list',p_view text default 'registrations',p_offset integer default 0,p_user uuid default null,p_email text default null,p_reason text default '') returns jsonb language sql security invoker set search_path='' as $$select private.admin_launch_operations(p_action,p_view,p_offset,p_user,p_email,p_reason);$$;
revoke all on function public.admin_launch_operations(text,text,integer,uuid,text,text) from public,anon;
grant execute on function public.admin_launch_operations(text,text,integer,uuid,text,text) to authenticated;
commit;
