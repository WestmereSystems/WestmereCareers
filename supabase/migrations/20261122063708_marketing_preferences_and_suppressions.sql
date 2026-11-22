begin;

-- One preference per delivery address, including prospective employers without accounts.
-- An enabled default is a preference, not evidence of consent to send marketing.
create table private.marketing_contacts (
 email text primary key check(email=lower(trim(email)) and length(email) between 3 and 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
 token uuid not null unique default gen_random_uuid(),
 enabled boolean not null default true,
 consent_basis text not null default 'none' check(consent_basis in('none','express','inferred')),
 consent_evidence text not null default '' check(length(consent_evidence)<=2000),
 consent_recorded_at timestamptz,
 unsubscribed_at timestamptz,
 source text not null default 'default',
 reason text not null default '' check(length(reason)<=2000),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check(enabled or unsubscribed_at is not null),
 check(consent_basis='none' or (consent_recorded_at is not null and length(trim(consent_evidence))>=10))
);
create index marketing_suppression_index on private.marketing_contacts(updated_at desc,email) where not enabled;
create table private.marketing_preference_events (
 id bigint generated always as identity primary key,email text not null,
 enabled boolean not null,source text not null,reason text not null default '',
 actor_id uuid references auth.users(id) on delete set null,created_at timestamptz not null default now()
);
create index marketing_events_address on private.marketing_preference_events(email,created_at desc);
create index marketing_events_actor on private.marketing_preference_events(actor_id);
alter table private.marketing_contacts enable row level security;
alter table private.marketing_preference_events enable row level security;
revoke all on private.marketing_contacts,private.marketing_preference_events from public,anon,authenticated;
grant all on private.marketing_contacts,private.marketing_preference_events to service_role;
grant usage,select on sequence private.marketing_preference_events_id_seq to service_role;

create function private.record_marketing_choice(p_email text,p_enabled boolean,p_source text,p_reason text,p_actor uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare v_email text:=lower(trim(p_email));v_previous private.marketing_contacts%rowtype;begin
 if p_enabled is null or v_email is null or length(v_email)>254 then raise exception 'Invalid preference' using errcode='22023';end if;
 -- Serialize changes for an address, including the first unsubscribe before signup.
 perform pg_advisory_xact_lock(hashtextextended(v_email,84431));
 select * into v_previous from private.marketing_contacts where email=v_email;
 insert into private.marketing_contacts(email,enabled,unsubscribed_at,source,reason,consent_basis,consent_evidence,consent_recorded_at)
 values(v_email,p_enabled,case when not p_enabled then now() end,p_source,p_reason,
  case when p_enabled and p_source='settings' then 'express' else 'none' end,
  case when p_enabled and p_source='settings' then 'Account holder saved the Westmere marketing email preference as enabled in Settings.' else '' end,
  case when p_enabled and p_source='settings' then now() end)
 on conflict(email) do update set enabled=excluded.enabled,
  unsubscribed_at=case when p_enabled then null else coalesce(marketing_contacts.unsubscribed_at,now()) end,
  source=excluded.source,reason=excluded.reason,updated_at=now(),
  consent_basis=case when p_enabled and p_source='settings' then excluded.consent_basis else marketing_contacts.consent_basis end,
  consent_evidence=case when p_enabled and p_source='settings' then excluded.consent_evidence else marketing_contacts.consent_evidence end,
  consent_recorded_at=case when p_enabled and p_source='settings' then excluded.consent_recorded_at else marketing_contacts.consent_recorded_at end;
 if v_previous.email is null or v_previous.enabled is distinct from p_enabled or (p_enabled and v_previous.consent_basis='none') then
  insert into private.marketing_preference_events(email,enabled,source,reason,actor_id) values(v_email,p_enabled,p_source,p_reason,p_actor);
 end if;
 if not p_enabled then
  update private.alert_outbox set status='canceled',error_code='MARKETING_UNSUBSCRIBED',lease_token=null,lease_expires_at=null
   where recipient=v_email and kind in('launch','marketing') and status in('queued','leased');
 elsif p_source='settings' then
  -- A fresh express choice may restore marketing, but never a provider bounce/complaint block.
  update private.launch_mail_preferences set removed_at=null,updated_at=now() where email=v_email and removed_at is not null;
 end if;
end;$$;
revoke all on function private.record_marketing_choice(text,boolean,text,text,uuid) from public,anon,authenticated;

-- Defaults never replace an existing opt-out, including signup under a previously suppressed email.
create function private.seed_marketing_contact() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.email is not null and new.email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
  insert into private.marketing_contacts(email) values(lower(trim(new.email))) on conflict do nothing;
 end if;return new;
end;$$;
revoke all on function private.seed_marketing_contact() from public,anon,authenticated;
create trigger marketing_contact_on_account after insert or update of email on auth.users for each row execute function private.seed_marketing_contact();
insert into private.marketing_contacts(email)
 select distinct lower(trim(email)) from auth.users where email is not null and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' on conflict do nothing;

-- Import and continue honouring every earlier launch-mail removal.
create function private.sync_launch_marketing_choice() returns trigger language plpgsql security definer set search_path='' as $$begin
 if new.removed_at is not null then perform private.record_marketing_choice(new.email,false,'launch_unsubscribe','Removed from launch marketing emails');end if;
 return new;
end;$$;
revoke all on function private.sync_launch_marketing_choice() from public,anon,authenticated;
create trigger marketing_launch_removal after insert or update of removed_at on private.launch_mail_preferences for each row execute function private.sync_launch_marketing_choice();
do $$declare r record;begin
 for r in select email from private.launch_mail_preferences where removed_at is not null loop
  perform private.record_marketing_choice(r.email,false,'launch_unsubscribe','Existing launch email opt-out preserved');
 end loop;
end;$$;

create function private.my_marketing_preferences() returns jsonb language plpgsql security definer set search_path='' as $$
declare v_email text;v_enabled boolean;begin
 select lower(trim(email)) into v_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if v_email is null then raise exception 'Verified sign-in required' using errcode='42501';end if;
 select enabled into v_enabled from private.marketing_contacts where email=v_email;
 return jsonb_build_object('enabled',coalesce(v_enabled,true),'email',v_email);
end;$$;
revoke all on function private.my_marketing_preferences() from public,anon;
grant execute on function private.my_marketing_preferences() to authenticated;
create function public.my_marketing_preferences() returns jsonb language sql security invoker set search_path='' as $$select private.my_marketing_preferences();$$;
revoke all on function public.my_marketing_preferences() from public,anon;
grant execute on function public.my_marketing_preferences() to authenticated;

create function private.save_marketing_preferences(p_enabled boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_email text;begin
 select lower(trim(email)) into v_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if v_email is null then raise exception 'Verified sign-in required' using errcode='42501';end if;
 perform private.record_marketing_choice(v_email,p_enabled,'settings','Account holder updated marketing email preference',auth.uid());
 return private.my_marketing_preferences();
end;$$;
revoke all on function private.save_marketing_preferences(boolean) from public,anon;
grant execute on function private.save_marketing_preferences(boolean) to authenticated;
create function public.save_marketing_preferences(p_enabled boolean) returns jsonb language sql security invoker set search_path='' as $$select private.save_marketing_preferences(p_enabled);$$;
revoke all on function public.save_marketing_preferences(boolean) from public,anon;
grant execute on function public.save_marketing_preferences(boolean) to authenticated;

-- Service-only capability operation: no address or list membership is exposed to the public.
create function private.unsubscribe_marketing(p_token uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_email text;begin
 if current_setting('role',true)<>'service_role' then raise exception 'Service access required' using errcode='42501';end if;
 select email into v_email from private.marketing_contacts where token=p_token;
 if v_email is null then raise exception 'Invalid unsubscribe link' using errcode='22023';end if;
 perform private.record_marketing_choice(v_email,false,'email_unsubscribe','Unsubscribed using an email button');
end;$$;
revoke all on function private.unsubscribe_marketing(uuid) from public,anon,authenticated;
grant execute on function private.unsubscribe_marketing(uuid) to service_role;
create function public.unsubscribe_marketing(p_token uuid) returns void language sql security invoker set search_path='' as $$select private.unsubscribe_marketing(p_token);$$;
revoke all on function public.unsubscribe_marketing(uuid) from public,anon,authenticated;
grant execute on function public.unsubscribe_marketing(uuid) to service_role;

create function private.marketing_delivery_allowed(p_email text,p_scope text default 'marketing') returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from private.marketing_contacts where email=lower(trim(p_email)) and not enabled)
 and not exists(select 1 from auth.users u join private.alert_suppressions s on s.user_id=u.id where lower(trim(u.email))=lower(trim(p_email)))
 and (p_scope='launch' or exists(select 1 from private.marketing_contacts where email=lower(trim(p_email)) and enabled
  and (consent_basis='express' or (p_scope='supplier_introduction' and consent_basis='inferred')) and consent_recorded_at is not null));
$$;
revoke all on function private.marketing_delivery_allowed(text,text) from public,anon,authenticated;

-- Future marketing delivery must pass a recorded consent basis as well as the preference.
alter table private.alert_outbox drop constraint alert_outbox_kind_check;
alter table private.alert_outbox add constraint alert_outbox_kind_check check(kind in('digest','preview','account','invitation','launch','marketing'));
alter table private.alert_outbox drop constraint alert_identity;
alter table private.alert_outbox add constraint alert_identity check((kind in('launch','marketing') and invitation_id is null and search_id is null) or (kind='invitation' and user_id is null and invitation_id is not null) or (kind not in('invitation','launch','marketing') and user_id is not null and invitation_id is null));
alter function private.delivery_eligible(private.alert_outbox) rename to delivery_eligible_before_marketing_preferences;
revoke all on function private.delivery_eligible_before_marketing_preferences(private.alert_outbox) from public,anon,authenticated;
create function private.delivery_eligible(b private.alert_outbox) returns boolean language sql stable security definer set search_path='' as $$
 select case when b.kind='marketing' then b.recipient !~* '[.](invalid|test)$' and b.snapshot->>'purpose' in('marketing','supplier_introduction')
  and private.marketing_delivery_allowed(b.recipient,b.snapshot->>'purpose')
 when b.kind='launch' then private.marketing_delivery_allowed(b.recipient,'launch') and private.delivery_eligible_before_marketing_preferences(b)
 else private.delivery_eligible_before_marketing_preferences(b) end;
$$;
revoke all on function private.delivery_eligible(private.alert_outbox) from public,anon,authenticated;

create function private.admin_marketing_contacts(p_action text,p_email text,p_reason text,p_query text,p_offset integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_rows jsonb;v_total integer;begin
 perform private.require_launch_account();
 if private.my_staff_role() is distinct from 'admin' then raise exception 'Administrator access required' using errcode='42501';end if;
 if p_offset<0 or p_offset>1000000 or p_offset%25<>0 or length(p_query)>254 then raise exception 'Invalid list page' using errcode='22023';end if;
 if p_action='suppress' then
  if length(trim(p_reason))<10 or length(p_reason)>2000 then raise exception 'Record the unsubscribe request or reason' using errcode='22023';end if;
  perform private.record_marketing_choice(p_email,false,'admin',trim(p_reason),auth.uid());
  return jsonb_build_object('message','Address added to the marketing unsubscribe register. Pending marketing emails have been cancelled.');
 elsif p_action<>'list' then raise exception 'Unknown marketing action' using errcode='22023';end if;
 select count(*) into v_total from private.marketing_contacts where not enabled and position(lower(trim(p_query)) in email)>0;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.updated_at desc,r.email),'[]') into v_rows from (
  select m.email,m.source,m.reason,m.unsubscribed_at,m.updated_at,
   coalesce((select b.kind from public.business_accounts b join auth.users u on u.id=b.user_id where lower(trim(u.email))=m.email limit 1),
    case when exists(select 1 from auth.users u where lower(trim(u.email))=m.email) then 'applicant' else 'external contact' end) as audience
  from private.marketing_contacts m where not m.enabled and position(lower(trim(p_query)) in m.email)>0
  order by m.updated_at desc,m.email limit 25 offset p_offset
 )r;
 return jsonb_build_object('rows',v_rows,'total',v_total);
end;$$;
revoke all on function private.admin_marketing_contacts(text,text,text,text,integer) from public,anon;
grant execute on function private.admin_marketing_contacts(text,text,text,text,integer) to authenticated;
create function public.admin_marketing_contacts(p_action text default 'list',p_email text default null,p_reason text default '',p_query text default '',p_offset integer default 0) returns jsonb language sql security invoker set search_path='' as $$select private.admin_marketing_contacts(p_action,p_email,p_reason,p_query,p_offset);$$;
revoke all on function public.admin_marketing_contacts(text,text,text,text,integer) from public,anon;
grant execute on function public.admin_marketing_contacts(text,text,text,text,integer) to authenticated;

-- Preparing a draft records its recipient and consent evidence, but does not enqueue or send mail.
create function private.prepare_marketing_contact(p_email text,p_basis text,p_evidence text,p_actor uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_email text:=lower(trim(p_email));v_token uuid;begin
 if current_setting('role',true)<>'service_role' then raise exception 'Service access required' using errcode='42501';end if;
 if p_actor is not null and not exists(select 1 from private.staff_members where user_id=p_actor and enabled and role='admin') then raise exception 'Administrator access required' using errcode='42501';end if;
 if p_basis is null or p_basis not in('express','inferred') or length(trim(p_evidence))<20 or length(p_evidence)>2000 then raise exception 'Record a consent basis and evidence' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(v_email,84431));
 if exists(select 1 from private.marketing_contacts where email=v_email and not enabled) or exists(select 1 from private.launch_mail_preferences where email=v_email and removed_at is not null)
 or exists(select 1 from auth.users u join private.alert_suppressions s on s.user_id=u.id where lower(trim(u.email))=v_email) then raise exception 'This address is suppressed' using errcode='42501';end if;
 insert into private.marketing_contacts(email,consent_basis,consent_evidence,consent_recorded_at,source) values(v_email,p_basis,trim(p_evidence),now(),'outreach_preparation')
 on conflict(email) do update set consent_basis=excluded.consent_basis,consent_evidence=excluded.consent_evidence,consent_recorded_at=now(),updated_at=now()
 returning token into v_token;
 insert into private.marketing_preference_events(email,enabled,source,reason,actor_id) values(v_email,true,'outreach_preparation',trim(p_evidence),p_actor);
 return jsonb_build_object('unsubscribePath','/marketing/unsubscribe?token='||v_token,'eligible',true);
end;$$;
revoke all on function private.prepare_marketing_contact(text,text,text,uuid) from public,anon,authenticated;
grant execute on function private.prepare_marketing_contact(text,text,text,uuid) to service_role;
create function public.prepare_marketing_contact(p_email text,p_basis text,p_evidence text,p_actor uuid default null) returns jsonb language sql security invoker set search_path='' as $$select private.prepare_marketing_contact(p_email,p_basis,p_evidence,p_actor);$$;
revoke all on function public.prepare_marketing_contact(text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.prepare_marketing_contact(text,text,text,uuid) to service_role;

-- Launch lists display global withdrawals, and new launch mail skips suppressed addresses.
create or replace function private.admin_launch_operations(p_action text,p_view text,p_offset integer,p_user uuid,p_email text,p_reason text) returns jsonb language plpgsql security definer set search_path='' as $$
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
    select l.*,coalesce(case when not coalesce(m.enabled,true) then m.unsubscribed_at end,p.removed_at) as removed_at,(select o.status from private.alert_outbox o where o.kind='launch' and o.recipient=l.email) as delivery_status
    from private.launch_mailing_list l left join private.launch_mail_preferences p using(email) left join private.marketing_contacts m using(email) order by l.created_at desc,l.email limit 25 offset p_offset
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
  where s.singleton and p.removed_at is null and private.marketing_delivery_allowed(l.email,'launch') and l.email !~* '[.](invalid|test)$'
   and not exists(select 1 from private.launch_access a where a.email=l.email and a.revoked_at is not null)
   and not exists(select 1 from auth.users u join private.alert_suppressions x on x.user_id=u.id where lower(u.email)=l.email)
  on conflict do nothing;
  get diagnostics v_count=row_count;
 else raise exception 'Unknown launch operation' using errcode='22023';end if;
 insert into private.moderation_audit(actor_id,subject_type,subject_id,action,reason,evidence_checks)
 values(auth.uid(),'launch_operations',coalesce(p_user,'00000000-0000-4000-8000-000000000001'::uuid),p_action,p_reason,jsonb_build_object('recipient',v_email,'queued',v_count));
 return jsonb_build_object('message',case when p_action in('launch_and_email','announce') then 'Marketplace is open. '||v_count||' launch emails queued for delivery.' when p_action='remove_mail' then 'Removed from the launch mailing list. Pending launch emails have been cancelled.' else 'Account access updated.' end);
end;$$;

commit;
