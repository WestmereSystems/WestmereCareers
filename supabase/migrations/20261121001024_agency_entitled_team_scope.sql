begin;
create or replace function private.is_active_hiring_team(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.organisation_members m join public.organisations o on o.id=m.organisation_id where m.organisation_id=p_org and m.user_id=(select auth.uid()) and m.role in ('owner','admin','recruiter') and o.is_verified and o.suspended_at is null and o.removed_at is null and (m.role='owner' or (private.business_team_enabled(p_org) and (o.kind<>'agency' or private.agency_seat_allowed(p_org,m.user_id)))));
$$;
create function private.agency_membership_visible(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.organisations o where o.id=p_org and (o.kind<>'agency' or private.agency_seat_allowed(p_org,auth.uid())));
$$;
revoke all on function private.agency_membership_visible(uuid) from public,anon;
grant execute on function private.agency_membership_visible(uuid) to authenticated;
create policy agency_entitled_memberships on public.organisation_members as restrictive for select to authenticated using(role='owner' or private.agency_membership_visible(organisation_id));
create or replace function private.manage_agency(p_action text,p_org uuid default null,p_id uuid default null,p_details jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare v_user uuid:=auth.uid();v_role text;o public.organisations%rowtype;c private.agency_clients%rowtype;a private.agency_authorisations%rowtype;v_id uuid;q jsonb;v_billing uuid;v_client_owner boolean;v_staff boolean:=private.my_staff_role() is not null;v_job uuid;v_member uuid;v_reason text:=trim(p_details->>'reason');
begin
 if v_user is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_action='pilot' then
  if not v_staff or exists(select 1 from public.organisation_members where user_id=v_user and organisation_id=p_org) or length(v_reason)<10 then raise exception 'Independent pilot review and reason required' using errcode='42501';end if;
  update public.organisations set agency_pilot_enabled=coalesce((p_details->>'enabled')::boolean,false) where id=p_org and kind='agency' and is_verified;
  if not found then raise exception 'Choose a verified agency' using errcode='22023';end if;
  if coalesce((p_details->>'enabled')::boolean,false) then update private.agency_release set enabled=true where singleton;end if;
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
 if o.kind<>'agency' or not o.is_verified or o.suspended_at is not null or o.removed_at is not null or v_role not in ('owner','admin') or v_role is null or (v_role='admin' and not private.is_active_hiring_team(o.id)) then raise exception 'Verified agency administration required' using errcode='42501';end if;
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


commit;
