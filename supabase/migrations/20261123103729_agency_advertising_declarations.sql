begin;
-- A declaration activates ordinary client advertising. It grants no employer
-- account access, candidate impersonation or authority to communicate offers.
alter table private.agency_clients add column branding_confirmed_by uuid references auth.users(id) on delete set null,
 add column branding_confirmed_at timestamptz, add column blocked_at timestamptz, add column block_reason text;
alter table private.agency_authorisations drop constraint agency_authorisations_status_check;
alter table private.agency_authorisations add constraint agency_authorisations_status_check check(status in ('pending','needs_information','approved','declared','rejected','revoked'));
alter table private.agency_authorisations add column declared_by uuid references auth.users(id) on delete set null,
 add column declared_at timestamptz, add column declaration_version text,
 add column offer_requested boolean not null default false;
create table private.agency_relationship_events(
 id uuid primary key default gen_random_uuid(), authorisation_id uuid not null references private.agency_authorisations(id),
 actor_id uuid references auth.users(id) on delete set null, action text not null, reason text not null,
 created_at timestamptz not null default clock_timestamp()
);
create index agency_relationship_events_authorisation on private.agency_relationship_events(authorisation_id,created_at desc);
create index agency_declarations_actor on private.agency_authorisations(declared_by) where declared_by is not null;
create index agency_client_blocked on private.agency_clients(agency_id,employer_id) where blocked_at is not null;
alter table private.agency_relationship_events enable row level security;
revoke all on private.agency_relationship_events from public,anon,authenticated;
grant all on private.agency_relationship_events to service_role;
drop index private.agency_live_client_authorisation;
create unique index agency_live_client_authorisation on private.agency_authorisations(agency_id,client_id) where status in ('pending','needs_information','approved','declared');
-- Preserve reviewed mandates and historical records. Pending requests are never
-- silently converted into consent; their owner must make the new declaration.
alter function private.manage_agency(text,uuid,uuid,jsonb) rename to manage_agency_reviewed;
revoke all on function private.manage_agency_reviewed(text,uuid,uuid,jsonb) from public,anon,authenticated;

create or replace function private.agency_quota(p_org uuid) returns jsonb language sql stable security definer set search_path='' as $$
 with account as(select private.agency_billing_user(p_org) id),covered as(
 select a.organisation_id from private.business_plan_organisations a join account b on b.id=a.billing_user_id join public.organisations o on o.id=a.organisation_id
 where o.kind='agency' and o.removed_at is null and private.business_team_tier(o.id) like 'agency_%'),
 members as(select distinct m.user_id from public.organisation_members m join covered c using(organisation_id) where m.role in ('owner','admin','recruiter')),
 invites as(select distinct i.email from private.business_invitations i join covered c using(organisation_id) where i.revoked_at is null and i.accepted_at is null and i.expires_at>now()
 and not exists(select 1 from members m join auth.users u on u.id=m.user_id where lower(u.email)=i.email))
 select jsonb_build_object('tier',l.tier,'vacancies',coalesce(l.vacancies,0),'clients',coalesce(l.clients,0),'seats',coalesce(l.seats,0),
 'usedVacancies',(select count(*) from public.jobs j join covered c on c.organisation_id=j.organisation_id where j.status='published' and j.expires_at>now()),
 'usedClients',(select count(distinct a.client_id) from private.agency_authorisations a join covered c on c.organisation_id=a.agency_id where a.status in ('approved','declared') and a.valid_until>now()),
 'usedSeats',(select count(*) from members)+(select count(*) from invites))
 from (select 1) singleton left join private.agency_plan_limits l on l.tier=private.business_team_tier(p_org);
$$;
create or replace function private.agency_authority_valid(p_authorisation uuid,p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.agency_authorisations a join private.agency_clients c on c.id=a.client_id
 where a.id=p_authorisation and a.agency_id=p_org and c.agency_id=p_org and ((a.status='approved' and a.reviewed_at is not null and (c.employer_id is null or a.client_approved_at is not null)) or (a.status='declared' and a.declared_by is not null and a.declared_at is not null and a.declaration_version='agency-advertising-v1')) and not exists(select 1 from private.agency_clients b where b.agency_id=p_org and b.blocked_at is not null and (b.id=c.id or (c.employer_id is not null and b.employer_id=c.employer_id) or lower(trim(b.name))=lower(trim(c.name)) or lower(b.representative_email)=lower(c.representative_email)))
 and a.valid_from<=now() and a.valid_until>now()
 and (c.employer_id is null or exists(select 1 from public.organisations where id=c.employer_id and is_verified and suspended_at is null and removed_at is null)));
$$;
create or replace function private.agency_after_authority_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status in ('revoked','rejected','needs_information') and old.status in ('approved','declared') then
  update public.jobs set status='closed',publication_requested=false where id in(select job_id from private.agency_job_engagements where authorisation_id=new.id) and status='published';
  update private.alert_outbox b set status='canceled',error_code='agency_authority_revoked' where b.status in ('queued','leased') and b.kind='account'
  and exists(select 1 from public.applications a join private.agency_job_engagements e on e.job_id=a.job_id where e.authorisation_id=new.id and b.event_key like 'application:%' and exists(select 1 from public.application_events ev where ev.application_id=a.id and b.event_key='application:'||ev.id));
 end if;
 if old.can_offer and not new.can_offer then
  update private.alert_outbox b set status='canceled',error_code='agency_offer_authority_removed'
  where b.status in ('queued','leased') and b.kind='account' and exists(
   select 1 from public.application_events ev join public.applications ap on ap.id=ev.application_id
   join private.agency_job_engagements en on en.job_id=ap.job_id
   where en.authorisation_id=new.id and ev.event_type='decision' and b.event_key='application:'||ev.id);
 end if;
 return new;
end;$$;
create or replace function private.agency_listing_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare o public.organisations%rowtype;e private.agency_job_engagements%rowtype;c private.agency_clients%rowtype;v_billing uuid;q jsonb;
begin
 select * into o from public.organisations where id=new.organisation_id;
 new.advertiser_kind:=o.kind;
 if o.kind<>'agency' then new.agency_hiring_mode:='internal';new.client_label:=null;new.recruitment_lead:=null;return new;end if;
 select * into e from private.agency_job_engagements where job_id=new.id and agency_id=o.id;
 if new.agency_hiring_mode='client' then
  if e.authorisation_id is null then raise exception 'Choose a current client advertising declaration' using errcode='42501';end if;
  select c1.* into c from private.agency_clients c1 join private.agency_authorisations a on a.client_id=c1.id where a.id=e.authorisation_id and a.agency_id=o.id;
  new.client_label:=case when c.disclosed then c.public_label else 'Confidential client' end;
 else new.client_label:=o.name;end if;
 if tg_op='UPDATE' and (new.client_label is distinct from old.client_label or new.agency_hiring_mode<>old.agency_hiring_mode or new.recruitment_lead is distinct from old.recruitment_lead) then
  new.moderation_status:='pending';new.status:='draft';new.moderation_updated_at:=clock_timestamp();
 end if;
 if new.status='published' then
  if private.my_staff_role() is not null and exists(select 1 from private.agency_authorisations a join private.agency_clients lc on lc.id=a.client_id join public.organisation_members m on m.organisation_id=lc.employer_id where a.id=e.authorisation_id and m.user_id=auth.uid()) then raise exception 'Listing review must be independent of the client' using errcode='42501';end if;
  v_billing:=private.agency_billing_user(o.id);
  perform pg_advisory_xact_lock(hashtextextended('agency-capacity:'||coalesce(v_billing,o.id)::text,0));
  if new.moderation_status<>'approved' or not private.agency_job_available(new.id) then raise exception 'Agency publication requires an active client declaration, recruitment lead and agency plan' using errcode='42501';end if;
  q:=private.agency_quota(o.id);
  if (tg_op='INSERT' or old.status<>'published' or old.expires_at<=now()) and (q->>'usedVacancies')::integer>=(q->>'vacancies')::integer then raise exception 'Your agency active vacancy allowance is used' using errcode='23514';end if;
 end if;
 return new;
end;$$;
create or replace function private.manage_agency(p_action text,p_org uuid default null,p_id uuid default null,p_details jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare
 u uuid:=auth.uid(); staff boolean:=private.my_staff_role() is not null;
 a private.agency_authorisations%rowtype; c private.agency_clients%rowtype; o public.organisations%rowtype;
 member_role text; client_owner boolean:=false; independent boolean:=false;
 reason text:=trim(coalesce(p_details->>'reason','')); result jsonb; q jsonb; new_id uuid; billing uuid;
 from_date timestamptz; until_date timestamptz; page_offset integer:=greatest(0,coalesce((p_details->>'offset')::integer,0));
begin
 if u is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_action='relationship_register' then
  if not staff then raise exception 'Independent reviewer access required' using errcode='42501';end if;
  return jsonb_build_object('total',(select count(*) from private.agency_authorisations),
   'authorisations',(select coalesce(jsonb_agg(row),'[]') from (
    select to_jsonb(a)||jsonb_build_object('client',to_jsonb(c),'agencyName',o.name,
     'events',(select coalesce(jsonb_agg(ev order by ev.created_at desc),'[]') from (select action,reason,created_at from private.agency_relationship_events where authorisation_id=a.id order by created_at desc limit 20) ev),
     'canReview',a.created_by is distinct from u and not exists(select 1 from public.organisation_members m where m.user_id=u and m.organisation_id in(a.agency_id,c.employer_id))) row
    from private.agency_authorisations a join private.agency_clients c on c.id=a.client_id join public.organisations o on o.id=a.agency_id
    order by (a.status='needs_information' or (a.offer_requested and not a.can_offer)) desc,a.updated_at desc,a.id limit 50 offset page_offset
   ) rows));
 end if;
 if p_action in ('client_approve','revoke','review','dispute','submit_evidence','clear_block','request_offer') then
  select * into a from private.agency_authorisations where id=p_id;
  if not found then raise exception 'Relationship unavailable' using errcode='42501';end if;
  p_org:=a.agency_id;select * into c from private.agency_clients where id=a.client_id;
  client_owner:=exists(select 1 from public.organisation_members m join public.organisations co on co.id=m.organisation_id where m.user_id=u and m.organisation_id=c.employer_id and m.role='owner' and co.is_verified and co.suspended_at is null and co.removed_at is null);
  independent:=staff and a.created_by is distinct from u and not exists(select 1 from public.organisation_members m where m.user_id=u and m.organisation_id in(a.agency_id,c.employer_id));
 end if;
 select * into o from public.organisations where id=p_org;
 select role into member_role from public.organisation_members where organisation_id=p_org and user_id=u;
 if p_action='list' then
  result:=private.manage_agency_reviewed(p_action,p_org,p_id,p_details);
  return result||jsonb_build_object('events',(select coalesce(jsonb_agg(ev),'[]') from (
   select e.authorisation_id,e.action,e.reason,e.created_at from private.agency_relationship_events e join private.agency_authorisations a on a.id=e.authorisation_id join private.agency_clients c on c.id=a.client_id
   where (c.employer_id=p_org and member_role='owner') or (a.agency_id=p_org and member_role in('owner','admin') and private.is_active_hiring_team(p_org)) order by e.created_at desc limit 100
  ) ev));
 end if;
 if p_action in ('declare_client','request_authorisation','client_create','configure_job','submit_evidence','request_offer') then
  if o.kind is distinct from 'agency' or not o.is_verified or o.suspended_at is not null or o.removed_at is not null or member_role is null or member_role not in ('owner','admin') or (member_role='admin' and not private.is_active_hiring_team(o.id)) then raise exception 'Verified agency administration required' using errcode='42501';end if;
 end if;
 billing:=private.agency_billing_user(p_org);
 perform pg_advisory_xact_lock(hashtextextended('agency-capacity:'||coalesce(billing,p_org)::text,0));
 if p_action='client_create' then
  if coalesce((p_details->>'disclosed')::boolean,false) and not coalesce((p_details->>'brandingConfirmed')::boolean,false) then raise exception 'Confirm permission to disclose the client name or branding' using errcode='22023';end if;
  result:=private.manage_agency_reviewed(p_action,p_org,p_id,p_details);
  update private.agency_clients set branding_confirmed_by=case when disclosed then u end,branding_confirmed_at=case when disclosed then now() end where id=(result->>'id')::uuid;
  return result;
 elsif p_action in ('declare_client','request_authorisation') then
  select * into c from private.agency_clients where id=p_id and agency_id=o.id for update;
  if not found then raise exception 'Choose your agency client' using errcode='42501';end if;
  if not coalesce((p_details->>'advertisingConfirmed')::boolean,false) or p_details->>'declarationVersion' is distinct from 'agency-advertising-v1' then raise exception 'Accept the current client advertising declaration' using errcode='22023';end if;
  if c.disclosed and c.branding_confirmed_at is null and not coalesce((p_details->>'brandingConfirmed')::boolean,false) then raise exception 'Confirm client disclosure and branding permission' using errcode='22023';end if;
  if exists(select 1 from private.agency_clients b where b.agency_id=o.id and b.blocked_at is not null and (b.id=c.id or (c.employer_id is not null and b.employer_id=c.employer_id) or lower(trim(b.name))=lower(trim(c.name)) or lower(b.representative_email)=lower(c.representative_email))) then raise exception 'This client relationship is paused or disputed. Admin must resolve it before another declaration.' using errcode='42501';end if;
  from_date:=(p_details->>'validFrom')::timestamptz;until_date:=(p_details->>'validUntil')::timestamptz;
  if from_date is null or until_date is null or until_date<=greatest(now(),from_date) or until_date>now()+interval '1 year' or coalesce(length(trim(p_details->>'evidence')),0) not between 30 and 6000 then raise exception 'Describe the recruitment scope and choose valid dates within one year' using errcode='22023';end if;
  q:=private.agency_quota(o.id);
  if not exists(select 1 from private.agency_authorisations where client_id=c.id and status in ('approved','declared') and valid_until>now()) and (q->>'usedClients')::integer>=(q->>'clients')::integer then raise exception 'The agency active-client allowance is used' using errcode='23514';end if;
  -- An owner can replace a pending routine request, but cannot clear a staff or employer hold.
  if exists(select 1 from private.agency_authorisations where client_id=c.id and status='needs_information') then raise exception 'Respond to the evidence request before redeclaring this client' using errcode='42501';end if;
  if exists(select 1 from private.agency_authorisations where client_id=c.id and status in ('approved','declared') and valid_until>now()) then raise exception 'A current relationship already exists. Withdraw it before replacing the declaration.' using errcode='23514';end if;
  update private.agency_authorisations set status='revoked',updated_at=clock_timestamp() where client_id=c.id and status in ('approved','declared','pending');
  insert into private.agency_authorisations(client_id,agency_id,evidence,valid_from,valid_until,status,can_offer,can_communicate_decisions,created_by,declared_by,declared_at,declaration_version,offer_requested)
  values(c.id,o.id,trim(p_details->>'evidence'),from_date,until_date,'declared',false,true,u,u,now(),'agency-advertising-v1',coalesce((p_details->>'canOffer')::boolean,false)) returning id into new_id;
  if c.disclosed then update private.agency_clients set branding_confirmed_by=u,branding_confirmed_at=now() where id=c.id;end if;
  insert into private.agency_relationship_events(authorisation_id,actor_id,action,reason) values(new_id,u,'declaration',trim(p_details->>'evidence'));
  insert into private.moderation_audit(actor_id,subject_type,subject_id,action,reason) values(u,'agency_authorisation',new_id,'declaration','Agency accepted agency-advertising-v1: current client authority, genuine vacancies, evidence on request, branding permission and no proxy applications.');
  return jsonb_build_object('id',new_id,'status','declared');
 elsif p_action='configure_job' then
  if p_details->>'mode'='client' and not coalesce((p_details->>'advertisingConfirmed')::boolean,false) then raise exception 'Confirm authority and a genuine current vacancy before saving client advertising' using errcode='22023';end if;
  result:=private.manage_agency_reviewed(p_action,p_org,p_id,p_details);
  if p_details->>'mode'='client' then
   insert into private.moderation_audit(actor_id,subject_type,subject_id,action,reason) values(u,'job',(p_details->>'jobId')::uuid,'agency_advertising_declaration','Agency confirmed this is a genuine current vacancy it is authorised to advertise under the selected client relationship.');
  end if;
  return result;
 elsif p_action in ('client_approve','dispute','review','revoke','submit_evidence','clear_block','request_offer') then
  select * into a from private.agency_authorisations where id=p_id for update;
  if p_action in ('review','clear_block') and not independent then raise exception 'Independent reviewer access required' using errcode='42501';end if;
  if p_action in ('review','clear_block','client_approve','dispute') and (p_details->>'version')::timestamptz is distinct from a.updated_at then raise exception 'Refresh this relationship before changing it' using errcode='40001';end if;
  if p_action='client_approve' then
   if not client_owner or a.status not in ('pending','declared','approved','needs_information') then raise exception 'Only the verified employer owner can confirm this relationship' using errcode='42501';end if;
   update private.agency_authorisations set client_approved_by=u,client_approved_at=now(),offer_requested=coalesce((p_details->>'canOffer')::boolean,false),can_offer=false,updated_at=clock_timestamp() where id=a.id;
   reason:='Employer optionally confirmed this relationship. Offer communication remains subject to separate independent review.';
  elsif p_action='request_offer' then
   if not private.agency_authority_valid(a.id,o.id) then raise exception 'Choose a current advertising relationship' using errcode='42501';end if;
   update private.agency_authorisations set offer_requested=true,updated_at=clock_timestamp() where id=a.id;
   reason:='Agency requested separate verification of explicit employer authority to communicate offers. Advertising declaration grants no offer permission.';
  elsif p_action='submit_evidence' then
   if a.status<>'needs_information' or length(reason) not between 30 and 2000 then raise exception 'Respond with the requested agreement evidence or verification details' using errcode='22023';end if;
   update private.agency_authorisations set updated_at=clock_timestamp() where id=a.id;
  elsif p_action='dispute' or p_action='revoke' then
   if (p_action='dispute' and not client_owner) or (p_action='revoke' and not(client_owner or coalesce(member_role in ('owner','admin'),false) or independent)) then raise exception 'Relationship management access required' using errcode='42501';end if;
   if length(reason) not between 10 and 2000 then raise exception 'Give a reason for the relationship change' using errcode='22023';end if;
   if client_owner or independent then update private.agency_clients set blocked_at=now(),block_reason=reason where id=c.id;end if;
   update private.agency_authorisations set status=case when p_action='dispute' then 'needs_information' else 'revoked' end,can_offer=false,feedback=reason,updated_at=clock_timestamp() where client_id=c.id and status in ('declared','approved','pending','needs_information');
  elsif p_action='clear_block' then
   if length(reason)<10 or not coalesce((p_details->>'identityChecked')::boolean,false) or not coalesce((p_details->>'authorityChecked')::boolean,false) then raise exception 'Independently verify the client and authority before clearing a hold' using errcode='22023';end if;
   update private.agency_clients set blocked_at=null,block_reason=null where id=c.id;
   update private.agency_authorisations set updated_at=clock_timestamp() where id=a.id;
  else
   if length(reason)<10 then raise exception 'A review reason is required' using errcode='22023';end if;
   if p_details->>'decision'='approve' then
    if a.status not in ('pending','needs_information','declared','approved') then raise exception 'This historical relationship cannot be reactivated' using errcode='40001';end if;
    if not coalesce((p_details->>'identityChecked')::boolean,false) or not coalesce((p_details->>'authorityChecked')::boolean,false) then raise exception 'Independent identity and authority checks are required' using errcode='22023';end if;
    if not o.is_verified or o.suspended_at is not null or o.removed_at is not null then raise exception 'Agency verification required' using errcode='42501';end if;
    q:=private.agency_quota(o.id);
    if not (a.status in ('approved','declared') and a.valid_until>now()) and (q->>'usedClients')::integer>=(q->>'clients')::integer then raise exception 'The agency active-client allowance is used' using errcode='23514';end if;
    if a.valid_until<=now() then raise exception 'This relationship has expired' using errcode='22023';end if;
    update private.agency_clients set blocked_at=null,block_reason=null where id=c.id;
    -- Advertising audit does not require employer portal approval. Offers do.
    update private.agency_authorisations set status=case when declared_at is not null then 'declared' else 'approved' end,
     reviewer_id=u,reviewed_at=now(),feedback=reason,
     can_offer=(offer_requested or can_offer) and coalesce((p_details->>'offerAuthorityChecked')::boolean,false) and (c.employer_id is null or client_approved_at is not null),
     updated_at=clock_timestamp() where id=a.id;
   elsif p_details->>'decision' in ('reject','request_information') then
    update private.agency_clients set blocked_at=now(),block_reason=reason where id=c.id;
    update private.agency_authorisations set status=case when p_details->>'decision'='reject' then 'rejected' else 'needs_information' end,can_offer=false,feedback=reason,reviewer_id=u,updated_at=clock_timestamp() where id=a.id;
   else raise exception 'Choose an audit decision' using errcode='22023';end if;
  end if;
  insert into private.agency_relationship_events(authorisation_id,actor_id,action,reason) values(a.id,u,p_action,reason);
  insert into private.moderation_audit(actor_id,subject_type,subject_id,action,reason) values(u,'agency_authorisation',a.id,p_action,reason);
  return jsonb_build_object('saved',true);
 end if;
 return private.manage_agency_reviewed(p_action,p_org,p_id,p_details);
end;$$;
revoke all on function private.manage_agency(text,uuid,uuid,jsonb) from public,anon;
grant execute on function private.manage_agency(text,uuid,uuid,jsonb) to authenticated;
create or replace function public.manage_agency(p_action text,p_org uuid default null,p_id uuid default null,p_details jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.manage_agency(p_action,p_org,p_id,p_details);$$;
create or replace function public.account_information_export(p_user uuid) returns jsonb
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
  ('agencyRelationshipStatements','select e.authorisation_id,e.action,e.reason,e.created_at from private.agency_relationship_events e join private.agency_authorisations a on a.id=e.authorisation_id join private.agency_clients c on c.id=a.client_id where e.actor_id=$1 and e.action in (''declaration'',''client_approve'',''dispute'',''submit_evidence'',''request_offer'',''revoke'') and (a.agency_id=any($3) or c.employer_id=any($3))',array[]::text[]),
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
commit;
