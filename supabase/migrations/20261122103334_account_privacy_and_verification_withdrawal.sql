begin;

alter table public.notifications drop constraint notifications_path_check;
alter table public.notifications add constraint notifications_path_check check(path in('/applications','/employers/dashboard','/account','/employers/sample','/account?tab=dashboard','/account?tab=verification','/account?tab=admin','/account?tab=billing','/account?tab=settings'));

alter table public.employer_verification_requests drop constraint employer_verification_requests_status_check;
alter table public.employer_verification_requests add constraint employer_verification_requests_status_check
 check(status in('pending','needs_information','approved','rejected','withdrawn'));
alter table public.employer_verification_requests add column withdrawn_at timestamptz,
 add column withdrawal_reason text check(char_length(withdrawal_reason)<=1000);

create function private.withdraw_business_verification(p_id uuid,p_version timestamptz,p_reason text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();r public.employer_verification_requests%rowtype;
begin
 if u is null or not exists(select 1 from auth.users where id=u and email_confirmed_at is not null) then raise exception 'Verified sign-in required' using errcode='42501';end if;
 perform private.require_launch_account();
 select * into r from public.employer_verification_requests where id=p_id for update;
 if not found or r.applicant_id<>u then raise exception 'Request unavailable' using errcode='42501';end if;
 if r.status not in('pending','needs_information') or p_version is distinct from r.updated_at then raise exception 'Request changed; refresh before withdrawing' using errcode='40001';end if;
 if char_length(coalesce(p_reason,''))>1000 then raise exception 'Reason too long' using errcode='22023';end if;
 update public.employer_verification_requests set status='withdrawn',withdrawn_at=clock_timestamp(),withdrawal_reason=nullif(trim(p_reason),''),updated_at=clock_timestamp() where id=p_id;
 insert into private.moderation_audit(actor_id,subject_type,subject_id,action,reason,evidence_checks)
 values(u,'verification',p_id,'withdraw',coalesce(nullif(trim(p_reason),''),'Applicant withdrew their pending verification request'),jsonb_build_object('previous_status',r.status,'result','withdrawn'));
 return p_id;
end;$$;
revoke all on function private.withdraw_business_verification(uuid,timestamptz,text) from public,anon;
grant execute on function private.withdraw_business_verification(uuid,timestamptz,text) to authenticated;
create function public.withdraw_business_verification(p_id uuid,p_version timestamptz,p_reason text default '') returns uuid
language sql security invoker set search_path='' as $$select private.withdraw_business_verification(p_id,p_version,p_reason);$$;
revoke all on function public.withdraw_business_verification(uuid,timestamptz,text) from public,anon;
grant execute on function public.withdraw_business_verification(uuid,timestamptz,text) to authenticated;

create table private.account_privacy_requests (
 id uuid primary key default gen_random_uuid(),user_id uuid references auth.users(id) on delete set null,
 email text not null,kind text not null check(kind in('deletion','information_copy')),
 account_kind text not null,status text not null default 'requested' check(status in('requested','in_review','completed','declined','withdrawn')),
 details text not null default '' check(char_length(details)<=2000),response text not null default '' check(char_length(response)<=6000),
 created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),
 due_at timestamptz not null default (clock_timestamp()+interval '30 days'),responded_at timestamptz,
 responded_by uuid references auth.users(id) on delete set null
);
create unique index account_privacy_one_active on private.account_privacy_requests(user_id,kind) where status in('requested','in_review');
create index account_privacy_queue on private.account_privacy_requests(status,created_at);
create table private.account_privacy_audit (
 id bigint generated always as identity primary key,request_id uuid references private.account_privacy_requests(id) on delete cascade,
 actor_id uuid references auth.users(id) on delete set null,action text not null,created_at timestamptz not null default clock_timestamp()
);
create table private.account_export_state (
 user_id uuid primary key references auth.users(id) on delete cascade,lease uuid,lease_until timestamptz,
 started_at timestamptz not null,completed_at timestamptz
);
do $$declare t text;begin foreach t in array array['account_privacy_requests','account_privacy_audit','account_export_state'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated',t);
 execute format('grant all on private.%I to service_role',t);
end loop;end;$$;
grant usage,select on sequence private.account_privacy_audit_id_seq to service_role;

-- Auth's user table intentionally has no service_role SELECT grant. This narrow private
-- lookup returns only a verified account email; it creates no new general Auth-table access.
create function private.account_privacy_email(p_user uuid) returns text language sql stable security definer set search_path='' as $$
 select email from auth.users where id=p_user and email_confirmed_at is not null;
$$;
revoke all on function private.account_privacy_email(uuid) from public,anon,authenticated;
grant execute on function private.account_privacy_email(uuid) to service_role;

-- Service-only HTTP operations authenticate the current account independently of marketplace admission.
-- No request can erase an account or cancel a subscription. Administrators record an assessed outcome.
create function public.account_privacy_request(p_user uuid,p_action text,p_kind text default null,p_details text default '',p_id uuid default null,p_version timestamptz default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare e text;k text;r private.account_privacy_requests%rowtype;
begin
 e:=private.account_privacy_email(p_user);
 if e is null then raise exception 'Verified account required' using errcode='42501';end if;
 if p_action='list' then return jsonb_build_object('email',e,'requests',(select coalesce(jsonb_agg(to_jsonb(q)-array['responded_by','email','account_kind'] order by q.created_at desc),'[]') from private.account_privacy_requests q where q.user_id=p_user));end if;
 if p_action='request' then
  if p_kind is null or p_kind not in('deletion','information_copy') or char_length(coalesce(p_details,''))>2000 then raise exception 'Invalid privacy request' using errcode='22023';end if;
  perform pg_advisory_xact_lock(hashtextextended('account-privacy:'||p_user::text,0));
  if exists(select 1 from private.account_privacy_requests where user_id=p_user and kind=p_kind and status in('requested','in_review')) then raise exception 'An active request already exists' using errcode='23505';end if;
  if (select count(*) from private.account_privacy_requests where user_id=p_user and created_at>clock_timestamp()-interval '1 day')>=5 then raise exception 'Request limit reached' using errcode='P0001';end if;
  select kind into k from public.business_accounts where user_id=p_user;
  insert into private.account_privacy_requests(user_id,email,kind,account_kind,details) values(p_user,e,p_kind,coalesce(k,'individual'),trim(coalesce(p_details,''))) returning * into r;
  insert into public.notifications(user_id,event_key,title,message,path)
   select user_id,'privacy-request:'||r.id,'New account privacy request','An account deletion or information-copy request needs administrator review.','/account?tab=admin' from private.staff_members where enabled and role='admin' on conflict do nothing;
 elsif p_action='withdraw' then
  select * into r from private.account_privacy_requests where id=p_id for update;
  if not found or r.user_id is distinct from p_user then raise exception 'Request unavailable' using errcode='42501';end if;
  if r.status not in('requested','in_review') or p_version is distinct from r.updated_at then raise exception 'Request changed' using errcode='40001';end if;
  update private.account_privacy_requests set status='withdrawn',updated_at=clock_timestamp() where id=r.id returning * into r;
 else raise exception 'Invalid privacy action' using errcode='22023';end if;
 insert into private.account_privacy_audit(request_id,actor_id,action) values(r.id,p_user,p_action);
 return to_jsonb(r)-array['responded_by','email','account_kind'];
end;$$;

create function public.admin_account_privacy(p_actor uuid,p_action text,p_id uuid default null,p_version timestamptz default null,p_status text default null,p_response text default '',p_offset integer default 0,p_all boolean default false) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r private.account_privacy_requests%rowtype;
begin
 if not exists(select 1 from private.staff_members where user_id=p_actor and enabled and role='admin') then raise exception 'Administrator required' using errcode='42501';end if;
 if p_action='list' then
  if p_offset<0 or p_offset>100000 then raise exception 'Invalid page' using errcode='22023';end if;
  return jsonb_build_object('requests',(select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at,q.id),'[]') from (select * from private.account_privacy_requests where p_all or status in('requested','in_review') order by created_at,id offset p_offset limit 25) q),
   'total',(select count(*) from private.account_privacy_requests where p_all or status in('requested','in_review')),
   'open',(select count(*) from private.account_privacy_requests where status in('requested','in_review')),
   'overdue',(select count(*) from private.account_privacy_requests where status in('requested','in_review') and due_at<clock_timestamp()));
 end if;
 if p_action is distinct from 'respond' or p_status is null or p_status not in('in_review','completed','declined') or char_length(trim(coalesce(p_response,''))) not between 10 and 6000 then raise exception 'Record a response and outcome' using errcode='22023';end if;
 select * into r from private.account_privacy_requests where id=p_id for update;
 if not found then raise exception 'Request unavailable' using errcode='42501';end if;
 if r.status not in('requested','in_review') or p_version is distinct from r.updated_at then raise exception 'Request changed' using errcode='40001';end if;
 update private.account_privacy_requests set status=p_status,response=trim(p_response),responded_by=p_actor,responded_at=clock_timestamp(),updated_at=clock_timestamp() where id=r.id returning * into r;
 insert into private.account_privacy_audit(request_id,actor_id,action) values(r.id,p_actor,p_status);
 if r.user_id is not null then insert into public.notifications(user_id,event_key,title,message,path) values(r.user_id,'privacy-response:'||r.id||':'||r.updated_at,'Your account privacy request has an update','Open Settings to read the administrator response.','/account?tab=settings') on conflict do nothing;end if;
 return to_jsonb(r);
end;$$;

create function public.account_export_control(p_user uuid,p_action text,p_token uuid default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare t uuid:=gen_random_uuid();
begin
 if private.account_privacy_email(p_user) is null then raise exception 'Verified account required' using errcode='42501';end if;
 if p_action='begin' then
  insert into private.account_export_state(user_id,started_at) values(p_user,'epoch') on conflict do nothing;
  update private.account_export_state set lease=t,lease_until=clock_timestamp()+interval '6 minutes',started_at=clock_timestamp() where user_id=p_user
   and (lease_until is null or lease_until<clock_timestamp()) and started_at<clock_timestamp()-interval '15 minutes';
  if not found then raise exception 'Wait before downloading another export' using errcode='P0001';end if;
  return to_jsonb(t);
 elsif p_action in('complete','fail') then
  update private.account_export_state set lease=null,lease_until=null,completed_at=case when p_action='complete' then clock_timestamp() else completed_at end,
   started_at=case when p_action='fail' then clock_timestamp()-interval '14 minutes' else started_at end where user_id=p_user and lease=p_token;
  if not found then raise exception 'Export lease changed' using errcode='40001';end if;
  return '{}'::jsonb;
 end if;
 raise exception 'Invalid export action' using errcode='22023';
end;$$;

-- Only a fixed server-defined set of account-owned records is exported. Never include Auth
-- credentials, unsubscribe tokens, another candidate's application or staff/security ledgers.
create function public.account_information_export(p_user uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare e text;owned uuid[];spec record;part jsonb;result jsonb:='{}';n bigint;size bigint;total bigint:=0;
begin
 e:=private.account_privacy_email(p_user);
 if e is null then raise exception 'Verified account required' using errcode='42501';end if;
 select coalesce(array_agg(m.organisation_id),'{}') into owned from public.organisation_members m join public.organisations o on o.id=m.organisation_id where m.user_id=p_user and m.role='owner' and o.removed_at is null;
 for spec in select * from (values
  ('profile','select * from public.profiles where id=$1',array[]::text[]),
  ('savedJobs','select * from public.saved_jobs where user_id=$1',array[]::text[]),
  ('savedSearches','select * from public.saved_searches where user_id=$1',array['unsubscribe_token']),
  ('applications','select * from public.applications where candidate_id=$1',array[]::text[]),
  ('applicationEvents','select event_type,source,message,occurred_at,meaningful_response,application_id from public.application_events where application_id in(select id from public.applications where candidate_id=$1)',array[]::text[]),
  ('applicationDocuments','select * from public.application_documents where application_id in(select id from public.applications where candidate_id=$1)',array[]::text[]),
  ('applicationUploads','select * from public.application_uploads where user_id=$1',array[]::text[]),
  ('cvs','select * from public.candidate_cvs where user_id=$1',array[]::text[]),
  ('assistantChats','select * from public.assistant_chats where user_id=$1',array[]::text[]),
  ('aiUsage','select * from public.ai_usage where user_id=$1',array[]::text[]),
  ('notifications','select * from public.notifications where user_id=$1',array[]::text[]),
  ('responseReports','select * from public.response_reports where candidate_id=$1',array[]::text[]),
  ('moderationRequests','select * from public.moderation_cases where requester_id=$1',array[]::text[]),
  ('businessAccount','select * from public.business_accounts where user_id=$1',array[]::text[]),
  ('memberships','select m.organisation_id,m.role,m.created_at,o.name,o.kind from public.organisation_members m join public.organisations o on o.id=m.organisation_id where m.user_id=$1',array[]::text[]),
  ('ownedBusinesses','select * from public.organisations where id=any($3)',array[]::text[]),
  ('ownedBusinessJobs','select * from public.jobs where organisation_id=any($3)',array['search_vector']),
  ('listingDocuments','select * from public.listing_documents where job_id in(select id from public.jobs where organisation_id=any($3))',array[]::text[]),
  ('verificationRequests','select * from public.employer_verification_requests where applicant_id=$1',array[]::text[]),
  ('employerNotificationPreferences','select * from public.employer_notification_preferences where user_id=$1',array[]::text[]),
  ('subscriptions','select * from public.subscriptions where user_id=$1',array[]::text[]),
  ('billingCustomers','select * from public.billing_customers where user_id=$1',array[]::text[]),
  ('billingHistory','select * from public.billing_customer_history where user_id=$1',array[]::text[]),
  ('businessBilling','select * from public.organisation_billing_accounts where billing_user_id=$1',array[]::text[]),
  ('businessSubscriptions','select * from public.business_subscriptions where stripe_customer_id in(select stripe_customer_id from public.organisation_billing_accounts where billing_user_id=$1)',array[]::text[]),
  ('businessAgreements','select * from private.business_agreements where user_id=$1',array[]::text[]),
  ('businessTypeRequests','select * from private.business_type_corrections where user_id=$1',array['reviewer_id','quote_hash']),
  ('createdAgencyClients','select * from private.agency_clients where created_by=$1 and agency_id=any($3)',array[]::text[]),
  ('createdAgencyAuthorisations','select * from private.agency_authorisations where created_by=$1 and agency_id=any($3)',array['reviewer_id','client_approved_by']),
  ('marketingPreferences','select email,enabled,consent_basis,consent_recorded_at,unsubscribed_at,created_at,updated_at from private.marketing_contacts where email=lower($2)',array[]::text[]),
  ('emailSuppression','select reason,created_at from private.alert_suppressions where user_id=$1',array[]::text[]),
  ('privacyRequests','select id,kind,status,details,response,created_at,updated_at,due_at,responded_at from private.account_privacy_requests where user_id=$1',array[]::text[])
 ) as s(name,query,excluded) loop
  execute 'select count(*),coalesce(sum(octet_length((to_jsonb(r)-$4)::text)),0) from ('||spec.query||' limit 5001) r' into n,size using p_user,e,owned,spec.excluded;
  total:=total+size;
  if n>5000 or total>8388608 then raise exception 'Request a complete information copy for this larger account' using errcode='54000';end if;
  execute 'select coalesce(jsonb_agg(to_jsonb(r)-$4),''[]''::jsonb) from ('||spec.query||') r' into part using p_user,e,owned,spec.excluded;
  result:=result||jsonb_build_object(spec.name,part);
 end loop;
 return result;
end;$$;
revoke all on function public.account_privacy_request(uuid,text,text,text,uuid,timestamptz),public.admin_account_privacy(uuid,text,uuid,timestamptz,text,text,integer,boolean),public.account_export_control(uuid,text,uuid),public.account_information_export(uuid) from public,anon,authenticated;
grant execute on function public.account_privacy_request(uuid,text,text,text,uuid,timestamptz),public.admin_account_privacy(uuid,text,uuid,timestamptz,text,text,integer,boolean),public.account_export_control(uuid,text,uuid),public.account_information_export(uuid) to service_role;
commit;
