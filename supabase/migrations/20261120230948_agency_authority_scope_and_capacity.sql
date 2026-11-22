begin;
create table private.agency_release(singleton boolean primary key default true check(singleton),enabled boolean not null default false);
insert into private.agency_release values(true,false);
create table private.agency_plan_limits(tier text primary key,vacancies integer not null,clients integer not null,seats integer not null);
insert into private.agency_plan_limits values('agency_starter',5,5,2),('agency_growth',20,20,5),('agency_enterprise',50,50,15);
create table private.agency_clients(
 id uuid primary key default gen_random_uuid(),agency_id uuid not null references public.organisations(id),
 employer_id uuid references public.organisations(id),name text not null check(length(name) between 2 and 180),
 public_label text not null check(length(public_label) between 2 and 180),disclosed boolean not null default false,
 representative_name text not null,representative_email text not null,created_by uuid references auth.users(id) on delete set null,created_at timestamptz not null default now()
);
create index agency_clients_org on private.agency_clients(agency_id);
create index agency_clients_employer on private.agency_clients(employer_id);
create table private.agency_authorisations(
 id uuid primary key default gen_random_uuid(),client_id uuid not null references private.agency_clients(id),agency_id uuid not null references public.organisations(id),
 evidence text not null check(length(evidence) between 30 and 6000),valid_from timestamptz not null,valid_until timestamptz not null check(valid_until>valid_from),
 can_offer boolean not null default false,can_communicate_decisions boolean not null default true,
 status text not null default 'pending' check(status in ('pending','needs_information','approved','rejected','revoked')),
 client_approved_by uuid references auth.users(id) on delete set null,client_approved_at timestamptz,
 reviewer_id uuid references auth.users(id) on delete set null,feedback text not null default '',reviewed_at timestamptz,
 created_by uuid references auth.users(id) on delete set null,created_at timestamptz not null default now(),updated_at timestamptz not null default clock_timestamp()
);
create index agency_authorisations_agency on private.agency_authorisations(agency_id,status,valid_until);
create index agency_authorisations_client on private.agency_authorisations(client_id);
create unique index agency_live_client_authorisation on private.agency_authorisations(agency_id,client_id) where status in ('pending','needs_information','approved');
create table private.agency_job_engagements(
 job_id uuid primary key references public.jobs(id),agency_id uuid not null references public.organisations(id),
 authorisation_id uuid references private.agency_authorisations(id),lead_user_id uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now()
);
create index agency_job_engagements_authorisation on private.agency_job_engagements(authorisation_id,job_id);
create table private.agency_job_assignments(
 job_id uuid not null references public.jobs(id),user_id uuid not null references auth.users(id) on delete cascade,assigned_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default clock_timestamp(),revoked_at timestamptz,primary key(job_id,user_id)
);
create index agency_assignments_user on private.agency_job_assignments(user_id,job_id) where revoked_at is null;
do $$declare t text;begin foreach t in array array['agency_release','agency_plan_limits','agency_clients','agency_authorisations','agency_job_engagements','agency_job_assignments'] loop
 execute format('alter table private.%I enable row level security',t);execute format('revoke all on private.%I from public,anon,authenticated',t);execute format('grant all on private.%I to service_role',t);end loop;end;$$;
alter table public.jobs add column advertiser_kind text not null default 'employer' check(advertiser_kind in ('employer','agency'));
alter table public.jobs add column agency_hiring_mode text not null default 'internal' check(agency_hiring_mode in ('internal','client'));
alter table public.jobs add column client_label text;
alter table public.jobs add column recruitment_lead text;
alter table public.applications add column advertiser_kind_snapshot text not null default 'employer';
alter table public.applications add column client_label_snapshot text;
alter table public.applications add column recipient_snapshot text;

create function private.agency_billing_user(p_org uuid) returns uuid language sql stable security definer set search_path='' as $$
 select a.billing_user_id from private.business_plan_organisations a join public.organisations o on o.id=a.organisation_id
 where a.organisation_id=p_org and o.kind='agency' and private.business_team_tier(p_org) like 'agency_%';
$$;
revoke all on function private.agency_billing_user(uuid) from public,anon,authenticated;
create function private.agency_quota(p_org uuid) returns jsonb language sql stable security definer set search_path='' as $$
 with account as(select private.agency_billing_user(p_org) id),covered as(
 select a.organisation_id from private.business_plan_organisations a join account b on b.id=a.billing_user_id join public.organisations o on o.id=a.organisation_id
 where o.kind='agency' and o.removed_at is null and private.business_team_tier(o.id) like 'agency_%'),
 members as(select distinct m.user_id from public.organisation_members m join covered c using(organisation_id) where m.role in ('owner','admin','recruiter')),
 invites as(select distinct i.email from private.business_invitations i join covered c using(organisation_id) where i.revoked_at is null and i.accepted_at is null and i.expires_at>now()
 and not exists(select 1 from members m join auth.users u on u.id=m.user_id where lower(u.email)=i.email))
 select jsonb_build_object('tier',l.tier,'vacancies',coalesce(l.vacancies,0),'clients',coalesce(l.clients,0),'seats',coalesce(l.seats,0),
 'usedVacancies',(select count(*) from public.jobs j join covered c on c.organisation_id=j.organisation_id where j.status='published' and j.expires_at>now()),
 'usedClients',(select count(distinct a.client_id) from private.agency_authorisations a join covered c on c.organisation_id=a.agency_id where a.status='approved' and a.valid_until>now()),
 'usedSeats',(select count(*) from members)+(select count(*) from invites))
 from (select 1) singleton left join private.agency_plan_limits l on l.tier=private.business_team_tier(p_org);
$$;
revoke all on function private.agency_quota(uuid) from public,anon,authenticated;
create function private.agency_seat_allowed(p_org uuid,p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 with account as(select private.agency_billing_user(p_org) id),members as(
 select m.user_id,min(m.created_at) joined,bool_or(m.role='owner') owner from public.organisation_members m join private.business_plan_organisations a using(organisation_id) join account b on b.id=a.billing_user_id
 join public.organisations o on o.id=m.organisation_id where o.kind='agency' and o.removed_at is null and m.role in ('owner','admin','recruiter') group by m.user_id),
 ranked as(select user_id,row_number() over(order by owner desc,joined,user_id) position from members)
 select coalesce((select position<=(private.agency_quota(p_org)->>'seats')::integer from ranked where user_id=p_user),false);
$$;
revoke all on function private.agency_seat_allowed(uuid,uuid) from public,anon,authenticated;
create function private.agency_authority_valid(p_authorisation uuid,p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.agency_authorisations a join private.agency_clients c on c.id=a.client_id
 where a.id=p_authorisation and a.agency_id=p_org and c.agency_id=p_org and a.status='approved' and a.reviewed_at is not null
 and a.valid_from<=now() and a.valid_until>now() and (c.employer_id is null or a.client_approved_at is not null)
 and (c.employer_id is null or exists(select 1 from public.organisations where id=c.employer_id and is_verified and suspended_at is null and removed_at is null)));
$$;
revoke all on function private.agency_authority_valid(uuid,uuid) from public,anon,authenticated;
create function private.user_can_access_job(p_user uuid,p_job uuid,p_action text default 'application') returns boolean language plpgsql stable security definer set search_path='' as $$
declare j public.jobs%rowtype;o public.organisations%rowtype;m text;e private.agency_job_engagements%rowtype;
begin
 if p_user is null then return false;end if;
 select * into j from public.jobs where id=p_job;select * into o from public.organisations where id=j.organisation_id;
 if o.id is null or not o.is_verified or o.suspended_at is not null or o.removed_at is not null then return false;end if;
 select role into m from public.organisation_members where organisation_id=o.id and user_id=p_user;
 if m not in ('owner','admin','recruiter') or m is null then return false;end if;
 if o.kind='employer' then return m='owner' or private.business_team_enabled(o.id);end if;
 if m<>'owner' and (not private.business_team_enabled(o.id) or not private.agency_seat_allowed(o.id,p_user)) then return false;end if;
 select * into e from private.agency_job_engagements where job_id=j.id and agency_id=o.id;
 if m='recruiter' and not exists(select 1 from private.agency_job_assignments where job_id=j.id and user_id=p_user and revoked_at is null) then return false;end if;
 if p_action='listing' then return true;end if;
 if j.agency_hiring_mode='client' then
  if not private.agency_authority_valid(e.authorisation_id,o.id) then return false;end if;
  if p_action='offer' then return (select can_offer from private.agency_authorisations where id=e.authorisation_id);end if;
  if p_action='decision' then return (select can_communicate_decisions from private.agency_authorisations where id=e.authorisation_id);end if;
 end if;
 return true;
end;$$;
revoke all on function private.user_can_access_job(uuid,uuid,text) from public,anon,authenticated;
create function private.can_access_hiring_job(p_job uuid,p_action text default 'application') returns boolean language sql stable security definer set search_path='' as $$select private.user_can_access_job(auth.uid(),p_job,p_action);$$;
revoke all on function private.can_access_hiring_job(uuid,text) from public,anon;
grant execute on function private.can_access_hiring_job(uuid,text) to authenticated;
create function public.can_access_hiring_job(p_job uuid,p_action text default 'application') returns boolean language sql stable security invoker set search_path='' as $$select private.can_access_hiring_job(p_job,p_action);$$;
revoke all on function public.can_access_hiring_job(uuid,text) from public,anon;
grant execute on function public.can_access_hiring_job(uuid,text) to authenticated;

create function private.agency_job_available(p_job uuid) returns boolean language plpgsql stable security definer set search_path='' as $$
declare j public.jobs%rowtype;o public.organisations%rowtype;e private.agency_job_engagements%rowtype;
begin
 select * into j from public.jobs where id=p_job;select * into o from public.organisations where id=j.organisation_id;
 if o.kind='employer' then return true;end if;
 if o.id is null or not o.is_verified or o.suspended_at is not null or o.removed_at is not null or not o.agency_pilot_enabled
 or not exists(select 1 from private.agency_release where enabled) or private.agency_billing_user(o.id) is null then return false;end if;
 select * into e from private.agency_job_engagements where job_id=p_job and agency_id=o.id;
 if e.job_id is null or not private.user_can_access_job(e.lead_user_id,j.id,'application') then return false;end if;
 return j.agency_hiring_mode='internal' or private.agency_authority_valid(e.authorisation_id,o.id);
end;$$;
revoke all on function private.agency_job_available(uuid) from public;
grant execute on function private.agency_job_available(uuid) to anon,authenticated;

create function private.agency_candidate_job_history(p_job uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.applications where job_id=p_job and candidate_id=auth.uid());
$$;
revoke all on function private.agency_candidate_job_history(uuid) from public;
grant execute on function private.agency_candidate_job_history(uuid) to anon,authenticated;

-- Restrictive policies intersect every older permissive policy, including future
-- organisation-level grants. Recruiter scope cannot be widened by their union.
create policy agency_job_read_scope on public.jobs as restrictive for select to anon,authenticated using(
 advertiser_kind<>'agency' or (status='published' and expires_at>now() and private.agency_job_available(id)) or private.can_access_hiring_job(id,'listing') or private.agency_candidate_job_history(id));
create policy agency_job_update_scope on public.jobs as restrictive for update to authenticated using(
 advertiser_kind<>'agency' or private.can_access_hiring_job(id,'listing')) with check(advertiser_kind<>'agency' or private.can_access_hiring_job(id,'listing'));
create policy agency_application_read_scope on public.applications as restrictive for select to authenticated using(candidate_id=(select auth.uid()) or private.can_access_hiring_job(job_id,'application'));
create policy agency_application_event_read_scope on public.application_events as restrictive for select to authenticated using(exists(select 1 from public.applications a where a.id=application_id and (a.candidate_id=(select auth.uid()) or private.can_access_hiring_job(a.job_id,'application'))));

create function private.agency_listing_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare o public.organisations%rowtype;e private.agency_job_engagements%rowtype;c private.agency_clients%rowtype;v_billing uuid;q jsonb;
begin
 select * into o from public.organisations where id=new.organisation_id;
 new.advertiser_kind:=o.kind;
 if o.kind<>'agency' then new.agency_hiring_mode:='internal';new.client_label:=null;new.recruitment_lead:=null;return new;end if;
 select * into e from private.agency_job_engagements where job_id=new.id and agency_id=o.id;
 if new.agency_hiring_mode='client' then
  if e.authorisation_id is null then raise exception 'Choose a reviewed client authorisation' using errcode='42501';end if;
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
  if new.moderation_status<>'approved' or not private.agency_job_available(new.id) then raise exception 'Agency publication requires an active reviewed mandate, recruitment lead and agency plan' using errcode='42501';end if;
  q:=private.agency_quota(o.id);
  if (tg_op='INSERT' or old.status<>'published' or old.expires_at<=now()) and (q->>'usedVacancies')::integer>=(q->>'vacancies')::integer then raise exception 'Your agency active vacancy allowance is used' using errcode='23514';end if;
 end if;
 return new;
end;$$;
revoke all on function private.agency_listing_guard() from public,anon,authenticated;
create trigger zzz_agency_listing_guard before insert or update on public.jobs for each row execute function private.agency_listing_guard();

create function private.agency_new_job_context() returns trigger language plpgsql security definer set search_path='' as $$
declare v_lead uuid;
begin
 if new.advertiser_kind='agency' then
  select user_id into v_lead from public.organisation_members where organisation_id=new.organisation_id and role='owner' order by created_at,user_id limit 1;
  if v_lead is not null then
   insert into private.agency_job_engagements(job_id,agency_id,lead_user_id) values(new.id,new.organisation_id,v_lead) on conflict do nothing;
   insert into private.agency_job_assignments(job_id,user_id,assigned_by) values(new.id,v_lead,v_lead) on conflict do nothing;
  end if;
 end if;
 return new;
end;$$;
revoke all on function private.agency_new_job_context() from public,anon,authenticated;
create trigger agency_new_job_context after insert on public.jobs for each row execute function private.agency_new_job_context();

create function private.agency_application_snapshot() returns trigger language plpgsql security definer set search_path='' as $$
declare j public.jobs%rowtype;
begin
 select * into j from public.jobs where id=new.job_id for share;
 if not private.agency_job_available(j.id) then raise exception 'This recruitment authorisation is no longer available' using errcode='42501';end if;
 new.advertiser_kind_snapshot:=j.advertiser_kind;new.client_label_snapshot:=j.client_label;
 new.recipient_snapshot:=case when j.advertiser_kind='agency' then j.company||' (recruitment agency)' else j.company end;
 return new;
end;$$;
revoke all on function private.agency_application_snapshot() from public,anon,authenticated;
create trigger agency_application_snapshot before insert on public.applications for each row execute function private.agency_application_snapshot();
create function private.agency_snapshot_immutable() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (new.advertiser_kind_snapshot,new.client_label_snapshot,new.recipient_snapshot) is distinct from (old.advertiser_kind_snapshot,old.client_label_snapshot,old.recipient_snapshot) then raise exception 'Application recipient snapshots are immutable' using errcode='42501';end if;
 return new;
end;$$;
revoke all on function private.agency_snapshot_immutable() from public,anon,authenticated;
create trigger agency_snapshot_immutable before update on public.applications for each row execute function private.agency_snapshot_immutable();

grant execute on function private.can_access_hiring_job(uuid,text) to anon;
create function private.agency_after_authority_change() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status in ('revoked','rejected','needs_information') and old.status='approved' then
  update public.jobs set status='closed',publication_requested=false where id in(select job_id from private.agency_job_engagements where authorisation_id=new.id) and status='published';
  update private.alert_outbox b set status='canceled',error_code='agency_authority_revoked' where b.status in ('queued','leased') and b.kind='account'
  and exists(select 1 from public.applications a join private.agency_job_engagements e on e.job_id=a.job_id where e.authorisation_id=new.id and b.event_key like 'application:%' and exists(select 1 from public.application_events ev where ev.application_id=a.id and b.event_key='application:'||ev.id));
 end if;
 return new;
end;$$;
revoke all on function private.agency_after_authority_change() from public,anon,authenticated;
create trigger agency_authority_changed after update on private.agency_authorisations for each row execute function private.agency_after_authority_change();

create function private.manage_agency(p_action text,p_org uuid default null,p_id uuid default null,p_details jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare v_user uuid:=auth.uid();v_role text;o public.organisations%rowtype;c private.agency_clients%rowtype;a private.agency_authorisations%rowtype;v_id uuid;q jsonb;v_billing uuid;v_client_owner boolean;v_staff boolean:=private.my_staff_role() is not null;v_job uuid;v_member uuid;v_reason text:=trim(p_details->>'reason');
begin
 if v_user is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_action='pilot' then
  if not v_staff or exists(select 1 from public.organisation_members where user_id=v_user and organisation_id=p_org) or length(v_reason)<10 then raise exception 'Independent pilot review and reason required' using errcode='42501';end if;
  update public.organisations set agency_pilot_enabled=coalesce((p_details->>'enabled')::boolean,false) where id=p_org and kind='agency' and is_verified;
  if not found then raise exception 'Choose a verified agency' using errcode='22023';end if;
  if coalesce((p_details->>'enabled')::boolean,false) then update private.agency_release set enabled=true;end if;
  insert into private.moderation_audit(actor_id,subject_type,subject_id,action,reason) values(v_user,'agency_pilot',p_org,'pilot',v_reason);
  return jsonb_build_object('saved',true);
 end if;
 if p_action='review_queue' then
  if not v_staff then raise exception 'Independent reviewer access required' using errcode='42501';end if;
  return jsonb_build_object('authorisations',(select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('client',to_jsonb(c),'agencyName',o.name)),'[]')
   from private.agency_authorisations a join private.agency_clients c on c.id=a.client_id join public.organisations o on o.id=a.agency_id
   where a.status in ('pending','needs_information') and not exists(select 1 from public.organisation_members m where m.user_id=v_user and m.organisation_id in(a.agency_id,c.employer_id))),
   'corrections',(select coalesce(jsonb_agg(to_jsonb(r)||jsonb_build_object('businessName',o.name)),'[]') from private.business_type_corrections r left join public.organisations o on o.id=r.organisation_id where r.status in ('pending','needs_information') and r.user_id<>v_user and not exists(select 1 from public.organisation_members m where m.user_id=v_user and m.organisation_id=r.organisation_id)));
 end if;
 if p_action in ('client_approve','revoke','review') then
  select * into a from private.agency_authorisations where id=p_id;
  if not found then raise exception 'Authorisation unavailable' using errcode='42501';end if;
  p_org:=a.agency_id;select * into c from private.agency_clients where id=a.client_id;
  v_client_owner:=exists(select 1 from public.organisation_members m join public.organisations co on co.id=m.organisation_id where m.user_id=v_user and m.organisation_id=c.employer_id and m.role='owner' and co.is_verified and co.suspended_at is null and co.removed_at is null);
 end if;
 select * into o from public.organisations where id=p_org;
 select role into v_role from public.organisation_members where organisation_id=p_org and user_id=v_user;
 if p_action='list' then
  if o.kind='employer' and v_role='owner' then
   return jsonb_build_object('delegations',(select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('client',to_jsonb(c),'agencyName',ag.name)),'[]') from private.agency_authorisations a join private.agency_clients c on c.id=a.client_id join public.organisations ag on ag.id=a.agency_id where c.employer_id=o.id));
  end if;
  if o.kind<>'agency' or not private.is_active_hiring_team(o.id) then raise exception 'Agency access required' using errcode='42501';end if;
  return jsonb_build_object('quota',case when v_role in ('owner','admin') then private.agency_quota(o.id) else null end,'pilotEnabled',o.agency_pilot_enabled,
   'clients',(select coalesce(jsonb_agg(to_jsonb(c)),'[]') from private.agency_clients c where c.agency_id=o.id and (v_role in('owner','admin') or exists(select 1 from private.agency_job_engagements e join private.agency_authorisations a on a.id=e.authorisation_id where a.client_id=c.id and private.can_access_hiring_job(e.job_id,'application')))),
   'authorisations',(select coalesce(jsonb_agg(to_jsonb(a)||jsonb_build_object('client',to_jsonb(c))),'[]') from private.agency_authorisations a join private.agency_clients c on c.id=a.client_id where a.agency_id=o.id and (v_role in('owner','admin') or exists(select 1 from private.agency_job_engagements e where e.authorisation_id=a.id and private.can_access_hiring_job(e.job_id,'application')))),
   'engagements',(select coalesce(jsonb_agg(to_jsonb(e)),'[]') from private.agency_job_engagements e where e.agency_id=o.id and (v_role in('owner','admin') or private.can_access_hiring_job(e.job_id,'listing'))),
   'assignments',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from private.agency_job_assignments s join public.jobs j on j.id=s.job_id where j.organisation_id=o.id and (v_role in('owner','admin') or s.user_id=v_user)),
   'members',(select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'role',m.role,'email',u.email)),'[]') from public.organisation_members m join auth.users u on u.id=m.user_id where m.organisation_id=o.id and v_role in('owner','admin')));
 end if;
 v_billing:=private.agency_billing_user(p_org);
 perform pg_advisory_xact_lock(hashtextextended('agency-capacity:'||coalesce(v_billing,p_org)::text,0));
 if p_action in ('review','client_approve','revoke') then
  select * into a from private.agency_authorisations where id=p_id for update;
  if p_action='client_approve' then
   if not v_client_owner or a.status not in ('pending','needs_information') then raise exception 'Only the verified client owner can authorise this delegation' using errcode='42501';end if;
   update private.agency_authorisations set client_approved_by=v_user,client_approved_at=now(),can_offer=coalesce((p_details->>'canOffer')::boolean,false),updated_at=clock_timestamp() where id=p_id;
  elsif p_action='revoke' then
   if not (v_client_owner or coalesce(v_role in('owner','admin'),false) or v_staff) then raise exception 'Delegation management access required' using errcode='42501';end if;
   if length(coalesce(v_reason,''))<10 then raise exception 'Give a reason for revocation' using errcode='22023';end if;
   update private.agency_authorisations set status='revoked',feedback=v_reason,updated_at=clock_timestamp() where id=p_id;
  else
   if not v_staff or a.created_by=v_user or exists(select 1 from public.organisation_members where user_id=v_user and organisation_id in(a.agency_id,c.employer_id)) then raise exception 'Independent mandate review required' using errcode='42501';end if;
   if (p_details->>'version')::timestamptz is distinct from a.updated_at or a.status not in ('pending','needs_information') then raise exception 'Refresh this authorisation before reviewing it' using errcode='40001';end if;
   if length(coalesce(v_reason,''))<10 then raise exception 'A review reason is required' using errcode='22023';end if;
   if p_details->>'decision'='approve' then
    if not coalesce((p_details->>'identityChecked')::boolean,false) or not coalesce((p_details->>'authorityChecked')::boolean,false) or (c.employer_id is not null and a.client_approved_at is null) then raise exception 'Independent identity, authority and client approval checks are required' using errcode='22023';end if;
    if not o.is_verified or o.suspended_at is not null or o.removed_at is not null then raise exception 'Agency verification required' using errcode='42501';end if;
    q:=private.agency_quota(o.id);
    if (q->>'usedClients')::integer>=(q->>'clients')::integer then raise exception 'The agency active-client allowance is used' using errcode='23514';end if;
    update private.agency_authorisations set status='approved',reviewer_id=v_user,reviewed_at=now(),feedback=v_reason,can_offer=can_offer and coalesce((p_details->>'offerAuthorityChecked')::boolean,false),updated_at=clock_timestamp() where id=p_id;
   elsif p_details->>'decision' in ('reject','request_information') then
    update private.agency_authorisations set status=case when p_details->>'decision'='reject' then 'rejected' else 'needs_information' end,feedback=v_reason,reviewer_id=v_user,updated_at=clock_timestamp() where id=p_id;
   else raise exception 'Choose a review decision' using errcode='22023';end if;
  end if;
  insert into private.moderation_audit(actor_id,subject_type,subject_id,action,reason) values(v_user,'agency_authorisation',p_id,p_action,coalesce(v_reason,'Client owner explicitly approved the stated recruitment delegation.'));
  return jsonb_build_object('saved',true);
 end if;
 if o.kind<>'agency' or not o.is_verified or o.suspended_at is not null or o.removed_at is not null or v_role not in ('owner','admin') or v_role is null then raise exception 'Verified agency administration required' using errcode='42501';end if;
 if p_action='configure_job' then
  v_job:=(p_details->>'jobId')::uuid;
  perform 1 from public.jobs where id=v_job and organisation_id=o.id for update;
  if not found then raise exception 'Choose an agency vacancy' using errcode='42501';end if;
  if coalesce(p_details->>'mode','') not in ('internal','client') or coalesce(length(trim(p_details->>'leadName')),0) not between 2 and 180 then raise exception 'Choose a hiring mode and name the recruitment lead' using errcode='22023';end if;
  v_member:=(p_details->>'leadUserId')::uuid;
  if not private.agency_seat_allowed(o.id,v_member) or not exists(select 1 from public.organisation_members where organisation_id=o.id and user_id=v_member and role in ('owner','admin','recruiter')) then raise exception 'Choose an active recruiter within the seat allowance' using errcode='42501';end if;
  v_id:=case when p_details->>'mode'='client' then nullif(p_details->>'authorisationId','')::uuid else null end;
  if p_details->>'mode'='client' and not private.agency_authority_valid(v_id,o.id) then raise exception 'Choose an approved, current client authorisation' using errcode='42501';end if;
  if exists(select 1 from public.applications where job_id=v_job) and exists(select 1 from private.agency_job_engagements where job_id=v_job and authorisation_id is distinct from v_id) then raise exception 'This vacancy has applications. Close it and create a newly reviewed listing to change clients.' using errcode='23514';end if;
  update private.agency_job_engagements set authorisation_id=v_id,lead_user_id=v_member where job_id=v_job;
  insert into private.agency_job_assignments(job_id,user_id,assigned_by) values(v_job,v_member,v_user) on conflict(job_id,user_id) do update set revoked_at=null,assigned_by=v_user;
  update public.jobs set agency_hiring_mode=p_details->>'mode',recruitment_lead=trim(p_details->>'leadName'),status='draft',moderation_status='pending',moderation_updated_at=clock_timestamp(),publication_requested=coalesce((p_details->>'publish')::boolean,false) where id=v_job;
  return jsonb_build_object('saved',true);
 elsif p_action='client_create' then
  if length(trim(p_details->>'name')) not between 2 and 180 or length(trim(p_details->>'representativeName')) not between 2 and 180 or p_details->>'representativeEmail' !~ '^[^ @]+@[^ @]+[.][^ @]+$' then raise exception 'Client identity and representative contact are required' using errcode='22023';end if;
  if nullif(p_details->>'employerId','') is not null and not exists(select 1 from public.organisations where id=(p_details->>'employerId')::uuid and kind='employer' and is_verified and suspended_at is null and removed_at is null) then raise exception 'Choose a verified employer' using errcode='22023';end if;
  insert into private.agency_clients(agency_id,employer_id,name,public_label,disclosed,representative_name,representative_email,created_by)
   values(o.id,nullif(p_details->>'employerId','')::uuid,trim(p_details->>'name'),case when coalesce((p_details->>'disclosed')::boolean,false) then trim(p_details->>'publicLabel') else 'Confidential client' end,coalesce((p_details->>'disclosed')::boolean,false),p_details->>'representativeName',lower(p_details->>'representativeEmail'),v_user) returning id into v_id;
  return jsonb_build_object('id',v_id);
 elsif p_action='request_authorisation' then
  select * into c from private.agency_clients where id=p_id and agency_id=o.id;
  if not found or length(trim(p_details->>'evidence')) not between 30 and 6000 or (p_details->>'validUntil')::timestamptz<=greatest(now(),(p_details->>'validFrom')::timestamptz) then raise exception 'Client evidence and valid dates are required' using errcode='22023';end if;
  update private.agency_authorisations set status='revoked',updated_at=clock_timestamp() where client_id=c.id and status='approved' and valid_until<=now();
  insert into private.agency_authorisations(client_id,agency_id,evidence,valid_from,valid_until,can_offer,can_communicate_decisions,created_by)
   values(c.id,o.id,trim(p_details->>'evidence'),(p_details->>'validFrom')::timestamptz,(p_details->>'validUntil')::timestamptz,coalesce((p_details->>'canOffer')::boolean,false),coalesce((p_details->>'canCommunicateDecisions')::boolean,true),v_user) returning id into v_id;
  return jsonb_build_object('id',v_id);
 elsif p_action in ('assign','unassign') then
  v_job:=(p_details->>'jobId')::uuid;v_member:=(p_details->>'userId')::uuid;
  if not exists(select 1 from public.jobs where id=v_job and organisation_id=o.id) or not exists(select 1 from public.organisation_members where organisation_id=o.id and user_id=v_member and role in ('owner','admin','recruiter')) then raise exception 'Choose a current agency vacancy and team member' using errcode='42501';end if;
  if p_action='assign' then
   if not private.agency_seat_allowed(o.id,v_member) then raise exception 'The agency recruiter-seat allowance is used' using errcode='23514';end if;
   insert into private.agency_job_assignments(job_id,user_id,assigned_by) values(v_job,v_member,v_user) on conflict(job_id,user_id) do update set revoked_at=null,assigned_by=v_user,created_at=clock_timestamp();
  else
   update private.agency_job_assignments set revoked_at=now() where job_id=v_job and user_id=v_member;
   update public.jobs set status='closed',publication_requested=false where id=v_job and status='published' and exists(select 1 from private.agency_job_engagements where job_id=v_job and lead_user_id=v_member);
  end if;
  return jsonb_build_object('saved',true);
 end if;
 raise exception 'Unknown agency action' using errcode='22023';
end;$$;
revoke all on function private.manage_agency(text,uuid,uuid,jsonb) from public,anon;
grant execute on function private.manage_agency(text,uuid,uuid,jsonb) to authenticated;
create function public.manage_agency(p_action text,p_org uuid default null,p_id uuid default null,p_details jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$select private.manage_agency(p_action,p_org,p_id,p_details);$$;
revoke all on function public.manage_agency(text,uuid,uuid,jsonb) from public,anon;
grant execute on function public.manage_agency(text,uuid,uuid,jsonb) to authenticated;

-- Keep existing employer behaviour while narrowing every hiring entry point.
create or replace function private.business_team_tier(p_org uuid) returns text language sql stable security definer set search_path='' as $$
 select private.account_business_tier(a.billing_user_id) from private.business_plan_organisations a
 where a.organisation_id=p_org and exists(select 1 from public.organisations o where o.id=p_org and ((o.kind='agency')=(private.account_business_tier(a.billing_user_id) like 'agency_%')))
 and exists(select 1 from public.organisation_members m where m.organisation_id=p_org and m.user_id=a.billing_user_id and m.role='owner')
 and (select count(*) from private.business_plan_organisations b join public.organisations o on o.id=b.organisation_id
      where b.billing_user_id=a.billing_user_id and o.removed_at is null
      and exists(select 1 from public.organisation_members m where m.organisation_id=b.organisation_id and m.user_id=b.billing_user_id and m.role='owner')
      and (b.linked_at,b.organisation_id)<=(a.linked_at,a.organisation_id))
     <=private.business_plan_limit(private.account_business_tier(a.billing_user_id));
$$;
create or replace function private.business_team_enabled(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(private.business_team_tier(p_org) in ('growth','enterprise','agency_starter','agency_growth','agency_enterprise'),false) and exists(select 1 from public.organisations where id=p_org and is_verified and suspended_at is null and removed_at is null);
$$;
create or replace function private.open_application_internal(p_application_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a jsonb;p jsonb;
begin
 if not exists(select 1 from public.applications a join public.jobs j on j.id=a.job_id where a.id=p_application_id and private.can_access_hiring_job(j.id,'application')) then raise exception 'Hiring access unavailable' using errcode='42501';end if;
 a:=private.open_application_before_trust(p_application_id);
 select jsonb_build_object('first_name',p.first_name,'last_name',p.last_name,'full_name',p.full_name,'email',u.email,'social_links',p.social_links,'updated_at',p.updated_at) into p from public.profiles p join auth.users u on u.id=p.id where p.id=(a->>'candidate_id')::uuid;
 return a||jsonb_build_object('candidate_profile',p);
end;$$;
create or replace function private.list_job_applications_internal(p_job_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.jobs j where j.id=p_job_id and private.can_access_hiring_job(j.id,'application')) then raise exception 'Hiring access unavailable' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(s order by s.created_at desc),'[]') from(select a.id,a.job_id,a.status,a.created_at,a.withdrawn_at,case when a.withdrawn_at is null then coalesce(p.full_name,a.candidate_name_snapshot) else null end candidate_name from public.applications a left join public.profiles p on p.id=a.candidate_id where a.job_id=p_job_id order by a.created_at desc limit 1000)s);
end;$$;
create or replace function private.update_application_stage_internal(p_application_id uuid,p_status text,p_message text) returns uuid language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.applications a join public.jobs j on j.id=a.job_id where a.id=p_application_id and private.can_access_hiring_job(j.id,case when p_status='offer' then 'offer' when p_status='not_proceeding' then 'decision' else 'application' end)) then raise exception 'Hiring access unavailable' using errcode='42501'; end if;
  return private.update_application_stage_before_trust(p_application_id,p_status,p_message);
end;
$$;
create or replace function private.role_overview() returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in required' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'views',(select count(*) from private.job_view_events v where v.job_id=j.id),'applications',(select count(*) from public.applications a where a.job_id=j.id and a.withdrawn_at is null),'activity',(select coalesce(jsonb_agg(h),'[]') from (select x.action,x.created_at,x.details,u.email actor_email from private.job_activity x left join auth.users u on u.id=x.actor_id where x.job_id=j.id order by x.created_at desc limit 20) h))),'[]') from public.jobs j where private.can_access_hiring_job(j.id,'listing'));
end;$$;
create or replace function private.renew_listing(p_job uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.jobs%rowtype;old_expiry timestamptz;old_status text;
begin
 select * into j from public.jobs where id=p_job for update;
 if not found or not private.can_access_hiring_job(j.id,'listing') then raise exception 'Verified hiring access required' using errcode='42501';end if;
 if j.moderation_status<>'approved' then raise exception 'Resolve moderation feedback before renewing' using errcode='22023';end if;
 old_expiry:=j.expires_at;old_status:=j.status;
 update public.jobs set status='published',expires_at=clock_timestamp()+interval '40 days',published_at=coalesce(published_at,now()),publication_requested=false where id=p_job returning * into j;
 if old_status='published' and j.expires_at<=old_expiry then insert into private.job_activity(job_id,actor_id,action,details) values(p_job,auth.uid(),'renewed',jsonb_build_object('expiresAt',j.expires_at,'status',j.status));end if;
 return jsonb_build_object('id',j.id,'expiresAt',j.expires_at,'status',j.status);
end;$$;
create or replace function private.finalise_candidate_pool(p_job uuid,p_selected uuid[],p_reviewed uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid;current_ids uuid[];reviewed_ids uuid[];
begin
 select organisation_id into org from public.jobs where id=p_job for update;
 if not found or not private.can_access_hiring_job(p_job,'decision') then raise exception 'Verified hiring access required' using errcode='42501';end if;
 if p_reviewed is null or cardinality(p_reviewed)>1000 then raise exception 'Review the complete active candidate list before confirming the pool' using errcode='22023';end if;
 -- The job lock serialises new submissions; application locks serialise withdrawals.
 perform 1 from public.applications where job_id=p_job order by id for update;
 select coalesce(array_agg(id order by id),'{}'::uuid[]) into current_ids from public.applications where job_id=p_job and withdrawn_at is null;
 select coalesce(array_agg(distinct id order by id),'{}'::uuid[]) into reviewed_ids from unnest(p_reviewed) ids(id);
 if current_ids is distinct from reviewed_ids then raise exception 'The active candidate list has changed or is incomplete. Refresh and review it before confirming the pool.' using errcode='22023';end if;
 return private.finalise_candidate_pool_before_snapshot_check(p_job,p_selected);
end;$$;
create or replace function private.notify_application_activity() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.applications%rowtype; m record; v_email boolean; v_title text; p public.employer_notification_preferences%rowtype;
begin
 select * into a from public.applications where id=new.application_id;
 if new.event_type not in ('received','opened','employer_update','decision') or a.withdrawn_at is not null then return new; end if;
 select application_email_enabled into v_email from public.profiles where id=a.candidate_id;
 v_title:=case
 when new.event_type='received' then 'Application received'
 when new.event_type='opened' and a.advertiser_kind_snapshot='agency' then 'Application opened by recruitment agency' when new.event_type='opened' then 'Application opened'
 when new.message='This vacancy has closed. Your recorded application stage remains available; closure does not itself mean a rejection.' then 'Vacancy closed'
 when a.status='interview' then 'Interview selection update'
 when a.status='shortlisted' then 'Application shortlisted'
 when a.status='offer' then 'Application offer update'
 when a.status='not_proceeding' then 'Application decision'
 else 'Application updated' end;
 perform private.queue_account_notice(a.candidate_id,'application:'||new.id,v_title,a.job_title_snapshot||' · '||left(new.message,1500),'/applications',coalesce(v_email,true));
 if new.event_type='received' then
  for m in select om.user_id from public.organisation_members om join public.jobs j on j.organisation_id=om.organisation_id join public.organisations o on o.id=om.organisation_id where j.id=a.job_id and private.user_can_access_job(om.user_id,j.id,'application') and om.role in ('owner','admin','recruiter') and o.suspended_at is null loop
   select * into p from public.employer_notification_preferences where user_id=m.user_id;
   if coalesce(p.submissions,true) then perform private.queue_account_notice(m.user_id,'hiring-submission:'||a.job_id||':'||a.id,'New applications to review','A new application has arrived in your hiring workspace.','/account?tab=dashboard',coalesce(p.email_enabled,false)); end if;
  end loop;
 end if; return new;
end; $$;
create or replace function private.account_notice_email_allowed(p_user uuid,p_key text) returns boolean language sql stable security definer set search_path='' as $$
 select private.account_notice_preferences_allowed(p_user,p_key) and case
 when p_key like 'hiring-submission:%' or p_key like 'closing:%' or p_key like 'milestone:%' then exists(select 1 from public.jobs j where j.id::text=split_part(p_key,':',2) and private.user_can_access_job(p_user,j.id,'application'))
 when p_key like 'follow-up:%' then exists(select 1 from public.applications a where a.id::text=split_part(p_key,':',2) and private.user_can_access_job(p_user,a.job_id,'application'))
 when p_key like 'application:%' then exists(select 1 from public.application_events e join public.applications a on a.id=e.application_id join public.jobs j on j.id=a.job_id where e.id::text=split_part(p_key,':',2) and (j.advertiser_kind<>'agency' or j.agency_hiring_mode='internal' or exists(select 1 from private.agency_job_engagements x where x.job_id=j.id and private.agency_authority_valid(x.authorisation_id,j.organisation_id))))
 else true end;
$$;
create function private.agency_reserve_seat(p_org uuid,p_email text,p_accept boolean) returns void language plpgsql security definer set search_path='' as $$
declare b uuid;q jsonb;v_existing boolean;
begin
 if not exists(select 1 from public.organisations where id=p_org and kind='agency') then return;end if;
 b:=private.agency_billing_user(p_org);perform pg_advisory_xact_lock(hashtextextended('agency-capacity:'||coalesce(b,p_org)::text,0));q:=private.agency_quota(p_org);
 select exists(select 1 from private.business_plan_organisations x join public.organisation_members m using(organisation_id) join auth.users u on u.id=m.user_id where x.billing_user_id=b and lower(u.email)=p_email and m.role in ('owner','admin','recruiter')) into v_existing;
 if not v_existing and ((q->>'usedSeats')::integer>=(q->>'seats')::integer+case when p_accept then 1 else 0 end) then raise exception 'The agency recruiter-seat allowance is used. Pending invitations reserve seats.' using errcode='23514';end if;
end;$$;
revoke all on function private.agency_reserve_seat(uuid,text,boolean) from public,anon,authenticated;
create or replace function private.manage_business_team(p_action text,p_org uuid default null,p_email text default null,p_invite uuid default null,p_member uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid();v_email text;i private.business_invitations%rowtype;v_id uuid;v_target uuid;v_origin text;v_name text;
begin
 select lower(email) into v_email from auth.users where id=v_user and email_confirmed_at is not null;
 if v_email is null then raise exception 'A verified account is required' using errcode='42501';end if;
 if p_action='list' then
  return jsonb_build_object('invitations',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',o.name,'expiresAt',b.expires_at,'kind',o.kind)),'[]') from private.business_invitations b join public.organisations o on o.id=b.organisation_id where b.email=v_email and b.accepted_at is null and b.revoked_at is null and b.expires_at>now() and private.business_team_enabled(b.organisation_id)),
  'teams',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'enabled',private.business_team_enabled(o.id),'members',(select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'email',u.email,'role',m.role)),'[]') from public.organisation_members m join auth.users u on u.id=m.user_id where m.organisation_id=o.id),'pending',(select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'email',b.email,'expiresAt',b.expires_at)),'[]') from private.business_invitations b where b.organisation_id=o.id and b.accepted_at is null and b.revoked_at is null and b.expires_at>now()))),'[]') from public.organisations o join public.organisation_members m on m.organisation_id=o.id where m.user_id=v_user and m.role='owner'));
 end if;
 if p_action='accept' then
  select * into i from private.business_invitations where id=p_invite for update;
  if not found or i.email<>v_email or i.revoked_at is not null or i.expires_at<=now() or not private.business_team_enabled(i.organisation_id) then raise exception 'This invitation is no longer available for this account' using errcode='42501';end if;
  perform private.agency_reserve_seat(i.organisation_id,i.email,true);
  perform pg_advisory_xact_lock(hashtextextended('business-team:'||i.organisation_id::text,0));
  if not exists(select 1 from public.business_accounts where user_id=v_user) then raise exception 'Accept the business Terms before joining' using errcode='42501';end if;
  if i.accepted_at is not null then
   if i.accepted_by=v_user and exists(select 1 from public.organisation_members where organisation_id=i.organisation_id and user_id=v_user) then return jsonb_build_object('joined',true);end if;
   raise exception 'This invitation has already been used' using errcode='42501';
  end if;
  insert into public.organisation_members(organisation_id,user_id,role) values(i.organisation_id,v_user,'recruiter') on conflict do nothing;
  update private.business_invitations set accepted_at=now(),accepted_by=v_user where id=i.id;
  return jsonb_build_object('joined',true);
 end if;
 if not exists(select 1 from public.organisation_members where organisation_id=p_org and user_id=v_user and role='owner') then raise exception 'Only the business creator can manage its team' using errcode='42501';end if;
 if p_action='invite' then perform private.agency_reserve_seat(p_org,lower(trim(p_email)),false);end if;
 perform pg_advisory_xact_lock(hashtextextended('business-team:'||p_org::text,0));
 if p_action='revoke' then
  if p_member=v_user or exists(select 1 from public.organisation_members where organisation_id=p_org and user_id=p_member and role='owner') then raise exception 'The business creator cannot be revoked' using errcode='42501';end if;
  update private.business_invitations set revoked_at=now() where organisation_id=p_org and revoked_at is null and (id=p_invite or accepted_by=p_member);
  if p_member is not null then delete from public.organisation_members where organisation_id=p_org and user_id=p_member and role<>'owner';end if;
  return jsonb_build_object('revoked',true);
 end if;
 if p_action<>'invite' or not private.business_team_enabled(p_org) then raise exception 'Team invitations require Employer Growth or higher' using errcode='42501';end if;
 p_email:=lower(trim(p_email));
 if p_email is null or length(p_email)>254 or p_email !~ '^[^ @]+@[^ @]+[.][^ @]+$' or p_email=v_email then raise exception 'Enter another valid email address' using errcode='22023';end if;
 if exists(select 1 from public.organisation_members m join auth.users u on u.id=m.user_id where m.organisation_id=p_org and lower(u.email)=p_email) then raise exception 'This account is already a member' using errcode='22023';end if;
 if (select count(*) from private.business_invitations where organisation_id=p_org and created_at>now()-interval '1 day')>=30 then raise exception 'You can invite up to 30 accounts per day' using errcode='22023';end if;
 if exists(select 1 from private.business_invitations where organisation_id=p_org and email=p_email and accepted_at is null and revoked_at is null and expires_at>now()) then raise exception 'An invitation is already pending for this email' using errcode='22023';end if;
 insert into private.business_invitations(organisation_id,email,invited_by) values(p_org,p_email,v_user) returning id into v_id;
 select name into v_name from public.organisations where id=p_org;
 select id into v_target from auth.users where lower(email)=p_email and email_confirmed_at is not null limit 1;
 if v_target is not null then perform private.queue_account_notice(v_target,'business-invite:'||v_id,'Invitation to join '||left(v_name,170),'You have been invited to join the hiring team for '||v_name||'. Sign in with this email, open Team in your account, and accept within seven days.','/account',false);end if;
 select site_origin into v_origin from private.alert_settings limit 1;
 if v_origin is null then raise exception 'Invitation delivery is temporarily unavailable' using errcode='55000';end if;
 insert into private.alert_outbox(user_id,recipient,kind,event_key,snapshot,invitation_id) values(null,p_email,'invitation','business-invite:'||v_id,jsonb_build_object('title','Invitation to join '||left(v_name,170),'message','You have been invited to join the hiring team for '||v_name||'. Sign in or create an account with this email, open Team in your account, and accept within seven days.','path','/account?tab=team','siteOrigin',v_origin),v_id);
 return jsonb_build_object('invited',true);
end;$$;
create or replace function private.set_business_plan_organisations(p_organisations uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
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
 if exists(select 1 from public.organisations where id=any(p_organisations) and ((kind='agency') is distinct from (coalesce(private.account_business_tier(v_user),'starter') like 'agency_%'))) then raise exception 'Owned businesses must match the reviewed type of this billing plan. Request an account-type review before changing billing audience.' using errcode='42501';end if;
 delete from private.business_plan_organisations where billing_user_id=v_user and not(organisation_id=any(p_organisations));
 insert into private.business_plan_organisations(organisation_id,billing_user_id)
 select x,v_user from unnest(p_organisations) x where not exists(select 1 from private.business_plan_organisations a where a.organisation_id=x);
 if exists(select 1 from unnest(p_organisations) x join private.business_plan_organisations a on a.organisation_id=x where a.billing_user_id<>v_user) then
  raise exception 'This business is already linked to another billing owner' using errcode='42501';
 end if;
 return private.my_business_plan();
end;$$;

create function private.agency_membership_removed() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update private.agency_job_assignments set revoked_at=now() where user_id=old.user_id and job_id in(select id from public.jobs where organisation_id=old.organisation_id);
 update public.jobs set status='closed',publication_requested=false where organisation_id=old.organisation_id and status='published' and exists(select 1 from private.agency_job_engagements where job_id=public.jobs.id and lead_user_id=old.user_id);
 return old;
end;$$;
revoke all on function private.agency_membership_removed() from public,anon,authenticated;
create trigger agency_membership_removed after delete on public.organisation_members for each row execute function private.agency_membership_removed();

create function private.agency_pause_excess() returns trigger language plpgsql security definer set search_path='' as $$
declare r record;q jsonb;
begin
 for r in select o.id from public.organisations o join private.business_plan_organisations a on a.organisation_id=o.id join public.organisation_billing_accounts b on b.billing_user_id=a.billing_user_id and b.is_primary where b.organisation_id=new.organisation_id and o.kind='agency' loop
  q:=private.agency_quota(r.id);
  update public.jobs set status='closed',publication_requested=false where id in(
   select j.id from public.jobs j join private.business_plan_organisations a on a.organisation_id=j.organisation_id where a.billing_user_id=private.agency_billing_user(r.id) and j.status='published' and j.expires_at>now() order by j.published_at,j.id offset (q->>'vacancies')::integer
  ) or (organisation_id=r.id and status='published' and not private.agency_job_available(id));
 end loop;return new;
end;$$;
revoke all on function private.agency_pause_excess() from public,anon,authenticated;
create trigger agency_pause_excess after insert or update on public.business_subscriptions for each row execute function private.agency_pause_excess();
create or replace function private.require_job_review() returns trigger language plpgsql security invoker set search_path='' as $$
declare requested boolean;
begin
 if current_user='authenticated' and exists(select 1 from public.organisations where id=new.organisation_id and kind='agency') then
  requested:=new.publication_requested or new.status='published';
  if tg_op='INSERT' or (to_jsonb(new)-array['status','publication_requested','expires_at','updated_at','moderation_updated_at','published_at']) is distinct from (to_jsonb(old)-array['status','publication_requested','expires_at','updated_at','moderation_updated_at','published_at']) then
   new.status:='draft';new.moderation_status:='pending';new.publication_requested:=requested;new.moderation_updated_at:=clock_timestamp();
  elsif requested and new.moderation_status<>'approved' then new.status:='draft';new.publication_requested:=true;end if;
  return new;
 end if;
 if current_user='authenticated' then
  requested:=new.publication_requested or new.status='published';
  if tg_op='UPDATE' and old.moderation_status in ('quarantined','rejected') then
   new.status:='draft';new.published_at:=old.published_at;new.publication_requested:=requested;new.moderation_status:=old.moderation_status;return new;
  end if;
  if requested then
   if not private.is_active_hiring_team(new.organisation_id) then raise exception 'Verified hiring authority required' using errcode='42501';end if;
   new.status:='published';new.published_at:=coalesce(new.published_at,now());new.publication_requested:=false;new.moderation_status:='approved';new.moderation_updated_at:=clock_timestamp();
  else new.moderation_status:='approved'; if tg_op='UPDATE' then new.published_at:=old.published_at;end if;end if;
 end if;return new;
end;$$;
create function private.agency_can_create_job(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.organisations o where o.id=p_org and (o.kind<>'agency' or exists(select 1 from public.organisation_members m where m.organisation_id=o.id and m.user_id=auth.uid() and m.role in ('owner','admin'))));
$$;
revoke all on function private.agency_can_create_job(uuid) from public,anon;
grant execute on function private.agency_can_create_job(uuid) to authenticated;
create policy agency_job_create_scope on public.jobs as restrictive for insert to authenticated with check(private.agency_can_create_job(organisation_id));
commit;
