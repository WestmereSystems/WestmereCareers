-- Default launch visibility is a revocable preference, not a fabricated consent event.
-- Profile privacy hides listings without changing their status or expiry. Role opt-outs close roles.
begin;
-- Release guard: this migration must not open or run against an open marketplace.
do $release_guard$ begin
 perform 1 from private.launch_settings where singleton and not marketplace_open for update;
 if not found then raise exception 'Westmere must remain in pre-launch mode for this release';end if;
end $release_guard$;
alter table private.launch_profiles add column profile_publication_enabled boolean not null default true;
alter table private.launch_profiles add column hidden_at timestamptz;
alter table private.launch_jobs add column hidden_at timestamptz;

-- Preserve explicit owner withdrawals and staff holds from the former release controls.
update private.launch_profiles p set profile_publication_enabled=false
where (select a.action from private.moderation_audit a where a.subject_type='launch_profile' and a.subject_id=p.organisation_id and a.action in('consent','withdraw') order by a.created_at desc,(a.action='withdraw') desc,a.id desc limit 1)='withdraw';
update private.launch_profiles p set hidden_at=now()
where (select a.action from private.moderation_audit a where a.subject_type='launch_profile' and a.subject_id=p.organisation_id and a.action in('release','hide') order by a.created_at desc,(a.action='hide') desc,a.id desc limit 1)='hide';
update private.launch_jobs p set hidden_at=now()
where (select a.action from private.moderation_audit a where a.subject_type='launch_job' and a.subject_id=p.job_id and a.action in('release','hide') order by a.created_at desc,(a.action='hide') desc,a.id desc limit 1)='hide';

create or replace function private.launch_profile_public(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.launch_open() and exists(select 1 from public.organisations o left join private.launch_profiles p on p.organisation_id=o.id
 where o.id=p_org and coalesce(p.profile_publication_enabled,true) and p.hidden_at is null
 and o.is_verified and not o.is_test and o.suspended_at is null and o.removed_at is null
 and not exists(select 1 from private.production_fixtures f where f.kind='organisation' and f.id=o.id));
$$;
create or replace function private.launch_job_permission(p_job uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.jobs j join public.organisations o on o.id=j.organisation_id left join private.launch_jobs p on p.job_id=j.id
 where j.id=p_job and j.status<>'closed' and not coalesce(p.publication_opted_out,false)
 and not j.is_test and not o.is_test and o.removed_at is null
 and not exists(select 1 from private.production_fixtures f where (f.kind='job' and f.id=j.id) or (f.kind='organisation' and f.id=o.id)));
$$;
create or replace function private.launch_job_public(p_job uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.jobs j left join private.launch_jobs p on p.job_id=j.id
 where j.id=p_job and private.launch_job_permission(j.id) and p.hidden_at is null
 and j.status='published' and j.moderation_status='approved' and j.published_at<=now() and j.expires_at>now() and private.launch_profile_public(j.organisation_id));
$$;

-- Resume the normal publication/renewal workflow after launch. Explicit publishing can reopen a role
-- excluded from launch; it cannot remove a staff hold or override a private business profile.
create or replace function private.hold_launch_publication() returns trigger language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is not null and (new.publication_requested or (new.status='published' and (tg_op='INSERT' or old.status<>'published'))) then
  update private.launch_jobs set publication_opted_out=false where job_id=new.id;
 end if;
 if not private.launch_open() and new.status='published' then new.status:='draft';new.published_at:=null;end if;
 return new;
end;$$;
create or replace function private.invalidate_launch_consent() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_table_name='organisations' then
  if (to_jsonb(new)-array['is_verified','verified_at','suspended_at','removed_at']) is distinct from (to_jsonb(old)-array['is_verified','verified_at','suspended_at','removed_at']) then update private.launch_profiles set consented_at=null,released_at=null where organisation_id=new.id;end if;
 else
  if (new.status<>'published' and old.status='published') or (to_jsonb(new)-array['status','moderation_status','publication_requested','published_at','expires_at','moderation_updated_at','response_days','response_reports','no_response_reports','eligible_reports','response_snapshot_at','search_vector']) is distinct from (to_jsonb(old)-array['status','moderation_status','publication_requested','published_at','expires_at','moderation_updated_at','response_days','response_reports','no_response_reports','eligible_reports','response_snapshot_at','search_vector']) then update private.launch_jobs set consented_at=null,released_at=null where job_id=new.id;end if;
 end if;return new;
end;$$;

-- Convert previous business-wide and individual job opt-outs into ordinary closed roles.
insert into private.launch_jobs(job_id,publication_opted_out)
select j.id,true from public.jobs j join private.launch_profiles p on p.organisation_id=j.organisation_id where not p.jobs_publication_enabled
on conflict(job_id) do update set publication_opted_out=true;
update public.jobs j set status='closed',publication_requested=false
where j.status<>'closed' and exists(select 1 from private.launch_jobs p where p.job_id=j.id and p.publication_opted_out);
update private.launch_profiles set jobs_publication_enabled=true;

create or replace function private.manage_launch_content(p_kind text,p_id uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$
declare oid uuid;
begin
 perform private.require_launch_account();
 if p_kind='profile' then oid:=p_id;elsif p_kind='job' then select organisation_id into oid from public.jobs where id=p_id;else raise exception 'Choose an individual business profile or role' using errcode='22023';end if;
 perform 1 from public.organisations where id=oid and removed_at is null for update;
 if not found or not exists(select 1 from public.organisation_members where organisation_id=oid and user_id=auth.uid() and role='owner') then raise exception 'The business owner must change publication preferences' using errcode='42501';end if;
 if p_action not in('consent','withdraw') then raise exception 'Unknown action' using errcode='22023';end if;
 if p_kind='profile' then
  insert into private.launch_profiles(organisation_id,profile_publication_enabled,consented_at,consented_by) values(p_id,p_action='consent',case when p_action='consent' then now() end,auth.uid())
  on conflict(organisation_id) do update set profile_publication_enabled=excluded.profile_publication_enabled,consented_at=excluded.consented_at,consented_by=excluded.consented_by;
 else
  perform 1 from public.jobs where id=p_id and organisation_id=oid for update;
  if not found then raise exception 'Refresh the role before changing its launch choice' using errcode='40001';end if;
  if p_action='withdraw' then
   insert into private.launch_jobs(job_id,publication_opted_out,consented_by) values(p_id,true,auth.uid())
   on conflict(job_id) do update set publication_opted_out=true,consented_at=null,consented_by=excluded.consented_by,released_at=null,released_by=null;
   update public.jobs set status='closed',publication_requested=false where id=p_id;
  else
   -- Reopening uses exactly the same hiring, moderation, capacity and lifecycle checks as Roles.
   perform private.renew_listing(p_id);
   insert into private.launch_jobs(job_id,publication_opted_out,consented_at,consented_by) values(p_id,false,now(),auth.uid())
   on conflict(job_id) do update set publication_opted_out=false,consented_at=excluded.consented_at,consented_by=excluded.consented_by;
  end if;
 end if;
 insert into private.moderation_audit(actor_id,subject_type,subject_id,action,reason) values(auth.uid(),'launch_'||p_kind,p_id,p_action,'Business owner changed profile visibility or role launch inclusion.');
end;$$;

create or replace function private.my_launch_content() returns jsonb language plpgsql stable security definer set search_path='' as $$begin perform private.require_launch_account();return jsonb_build_object(
 'profiles',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'verified',o.is_verified,'test',o.is_test,'publicationAllowed',coalesce(p.profile_publication_enabled,true),'hiddenAt',p.hidden_at,'public',private.launch_profile_public(o.id),'owner',m.role='owner','consentedAt',p.consented_at,'releasedAt',p.released_at) order by o.name,o.id),'[]') from public.organisations o join public.organisation_members m on m.organisation_id=o.id and m.user_id=auth.uid() left join private.launch_profiles p on p.organisation_id=o.id where o.removed_at is null),
 'jobs',(select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'title',j.title,'organisationId',j.organisation_id,'organisationName',o.name,'review',j.moderation_status,'status',j.status,'test',j.is_test,'publicationAllowed',private.launch_job_permission(j.id),'publicationOptedOut',coalesce(p.publication_opted_out,false),'hiddenAt',p.hidden_at,'public',private.launch_job_public(j.id),'owner',m.role='owner','consentedAt',p.consented_at,'releasedAt',p.released_at) order by j.created_at,j.id),'[]') from public.jobs j join public.organisations o on o.id=j.organisation_id join public.organisation_members m on m.organisation_id=j.organisation_id and m.user_id=auth.uid() left join private.launch_jobs p on p.job_id=j.id where o.removed_at is null and (private.can_access_hiring_job(j.id,'listing') or (m.role='owner' and o.kind<>'agency'))));end;$$;

create or replace function private.admin_launch(p_action text,p_id uuid,p_kind text,p_reason text,p_open boolean,p_offset integer) returns jsonb language plpgsql security definer set search_path='' as $$declare r private.launch_requests%rowtype;v_job public.jobs%rowtype;begin
 perform private.require_launch_account();
 if private.my_staff_role() not in('admin','reviewer') or private.my_staff_role() is null then raise exception 'Reviewer access required' using errcode='42501';end if;
 if p_action='list' then return jsonb_build_object('marketplaceOpen',private.launch_open(),
 'requestCount',(select count(*) from private.launch_requests),'requests',(select coalesce(jsonb_agg(x order by x.created_at desc),'[]') from(select * from private.launch_requests order by created_at desc,id limit 100 offset greatest(0,least(p_offset,10000)))x),
 'profiles',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'description',o.description,'website',o.website,'careersEmail',o.careers_email,'avatarPath',o.avatar_path,'bannerPath',o.banner_path,'verified',o.is_verified,'test',o.is_test,'publicationAllowed',coalesce(p.profile_publication_enabled,true),'hiddenAt',p.hidden_at,'public',private.launch_profile_public(o.id),'consentedAt',p.consented_at,'releasedAt',p.released_at)),'[]') from public.organisations o left join private.launch_profiles p on p.organisation_id=o.id where o.removed_at is null),
 'jobs',(select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'title',j.title,'organisationId',j.organisation_id,'review',j.moderation_status,'status',j.status,'test',j.is_test,'organisationName',(select name from public.organisations where id=j.organisation_id),'publicationAllowed',private.launch_job_permission(j.id),'hiddenAt',p.hidden_at,'public',private.launch_job_public(j.id),'consentedAt',p.consented_at,'releasedAt',p.released_at)),'[]') from public.jobs j left join private.launch_jobs p on p.job_id=j.id where exists(select 1 from public.organisations o where o.id=j.organisation_id and o.removed_at is null)));
 end if;
 if length(trim(p_reason))<10 or length(p_reason)>2000 then raise exception 'Record a decision reason' using errcode='22023';end if;
 if p_action in('approve','decline','revoke') then
 select * into r from private.launch_requests where id=p_id for update;if not found then raise exception 'Request unavailable' using errcode='22023';end if;
 update private.launch_requests set status=case p_action when 'approve' then 'approved' when 'decline' then 'declined' else 'revoked' end,updated_at=now() where id=p_id;
 if p_action='approve' then insert into private.launch_access(email,kind,user_id,expires_at,approved_by) values(r.email,r.kind,(select id from auth.users where lower(email)=r.email and email_confirmed_at is not null),now()+interval '60 days',auth.uid()) on conflict(email) do update set kind=case when private.launch_access.kind='existing' then 'existing' else excluded.kind end,expires_at=case when private.launch_access.kind='existing' then private.launch_access.expires_at else excluded.expires_at end,revoked_at=null,approved_by=auth.uid();
 elsif p_action='revoke' then update private.launch_access set revoked_at=now() where email=r.email and kind<>'existing';end if;
 elsif p_action='mode' then
 if private.my_staff_role()<>'admin' then raise exception 'Administrator access required' using errcode='42501';end if;
 update private.launch_settings set marketplace_open=p_open,updated_at=now() where singleton;
 elsif p_action in('release','hide') then
 if p_action='release' and not private.launch_open() then raise exception 'Content remains private until the public marketplace opens' using errcode='22023';end if;
 if p_kind='profile' then
 perform 1 from public.organisations where id=p_id and is_verified and not is_test and suspended_at is null and removed_at is null for update;
 if not found then raise exception 'A real verified business is required' using errcode='22023';end if;
 if p_action='release' and not coalesce((select profile_publication_enabled from private.launch_profiles where organisation_id=p_id),true) then raise exception 'The business profile is private' using errcode='22023';end if;
 if exists(select 1 from private.production_fixtures where kind='organisation' and id=p_id) then raise exception 'Test content cannot be released' using errcode='22023';end if;
 insert into private.launch_profiles(organisation_id,hidden_at,released_at,released_by) values(p_id,case when p_action='hide' then now() end,case when p_action='release' then now() end,auth.uid()) on conflict(organisation_id) do update set hidden_at=excluded.hidden_at,released_at=excluded.released_at,released_by=excluded.released_by;
 elsif p_kind='job' then
 -- Match the owner preference lock order so an opt-out cannot race a release.
 perform 1 from public.organisations where id=(select organisation_id from public.jobs where id=p_id) for update;
 select * into v_job from public.jobs where id=p_id for update;
 if not found or v_job.is_test or v_job.status='closed' then raise exception 'Choose a current genuine vacancy' using errcode='22023';end if;
 if p_action='release' then
 if v_job.moderation_status<>'approved' or not private.launch_profile_public(v_job.organisation_id) or not private.launch_job_permission(p_id) then raise exception 'Review, owner permission and a public profile are required' using errcode='22023';end if;
 insert into private.launch_jobs(job_id,released_at,released_by,hidden_at) values(p_id,now(),auth.uid(),null) on conflict(job_id) do update set released_at=excluded.released_at,released_by=excluded.released_by,hidden_at=null;
 update public.jobs set status='published',published_at=now(),expires_at=now()+interval '30 days' where id=p_id;
 else insert into private.launch_jobs(job_id,hidden_at,released_by) values(p_id,now(),auth.uid()) on conflict(job_id) do update set hidden_at=excluded.hidden_at,released_at=null,released_by=excluded.released_by;end if;
 else raise exception 'Unknown content' using errcode='22023';end if;
 else raise exception 'Unknown action' using errcode='22023';end if;
 insert into private.moderation_audit(actor_id,subject_type,subject_id,action,reason) values(auth.uid(),'launch_'||coalesce(p_kind,'access'),coalesce(p_id,'00000000-0000-4000-8000-000000000001'::uuid),p_action,p_reason);
 return jsonb_build_object('saved',true);end;$$;

-- Opening through either administrator control publishes eligible reviewed roles in the same transaction.
-- Closed/opted-out/test/held roles are skipped, and one plan-limit failure does not prevent launch.
create function private.publish_default_launch_roles() returns trigger language plpgsql security definer set search_path='' as $$
declare listing record;listing_state public.jobs%rowtype;published_status text;
begin
 if old.marketplace_open or not new.marketplace_open then return new;end if;
 for listing in select j.id,j.organisation_id from public.jobs j join public.organisations o on o.id=j.organisation_id left join private.launch_jobs p on p.job_id=j.id
  where j.status='draft' and j.moderation_status='approved' and private.launch_job_permission(j.id) and p.hidden_at is null
  and o.is_verified and o.suspended_at is null and o.removed_at is null order by j.created_at,j.id
 loop
  begin
   -- Use the same business-then-role lock order as owner opt-outs, and recheck after waiting.
   -- A role closed or held while the launch queue was being built must never be restored here.
   perform 1 from public.organisations where id=listing.organisation_id and is_verified and suspended_at is null and removed_at is null for update;
   if not found then continue;end if;
   select * into listing_state from public.jobs where id=listing.id for update;
   if not found or listing_state.organisation_id<>listing.organisation_id or listing_state.status<>'draft' or listing_state.moderation_status<>'approved'
    or not private.launch_job_permission(listing.id) or exists(select 1 from private.launch_jobs where job_id=listing.id and hidden_at is not null) then continue;end if;
   update public.jobs set status='published',published_at=now(),expires_at=now()+interval '30 days',publication_requested=false where id=listing.id returning status into published_status;
   if published_status='published' then
    insert into private.launch_jobs(job_id,released_at,released_by) values(listing.id,now(),auth.uid()) on conflict(job_id) do update set released_at=excluded.released_at,released_by=excluded.released_by;
   end if;
  exception when check_violation or insufficient_privilege then
   insert into private.moderation_audit(actor_id,subject_type,subject_id,action,reason) values(auth.uid(),'launch_job',listing.id,'launch_deferred','Role remains private because a publication requirement was not met: '||sqlerrm);
  end;
 end loop;
 return new;
end;$$;
revoke all on function private.publish_default_launch_roles() from public,anon,authenticated;
create trigger publish_default_launch_roles after update of marketplace_open on private.launch_settings for each row execute function private.publish_default_launch_roles();

-- Attachment changes still require a fresh moderation decision before the updated listing is public.
create or replace function private.invalidate_launch_document() returns trigger language plpgsql security definer set search_path='' as $$
declare listing_id uuid;
begin
 listing_id:=case when tg_op='DELETE' then old.job_id else new.job_id end;
 update private.launch_jobs set consented_at=null,released_at=null where job_id=listing_id;
 update public.jobs set status=case when status='closed' then 'closed' else 'draft' end,moderation_status='pending',publication_requested=(status<>'closed') where id=listing_id;
 if tg_op='DELETE' then return old;end if;return new;
end;$$;

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
   jsonb_build_object('title','Westmere Careers is live across Australia','message','Westmere Careers has launched across Australia. Explore opportunities, prepare your next application or open your business workspace. Your private account details remain private. Verified business profiles and eligible reviewed vacancies are public by default. Businesses can change profile visibility or close individual roles in their account.','siteOrigin',s.site_origin,'unsubscribeUrl',s.site_origin||'/launch/unsubscribe?token='||p.token)
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

-- Service-role digest preparation and send-time validation must also respect profile privacy.
create or replace function private.job_matches_search(j public.jobs,s public.saved_searches) returns boolean language plpgsql stable security invoker set search_path='' as $$
declare v_location text:=trim(regexp_replace(lower(s.location),'[^a-z0-9 ]',' ','g')); v_city text; v_state text;
begin
  v_location:=regexp_replace(v_location,'\s+',' ','g'); v_city:=regexp_replace(v_location,' (vic|nsw|qld|sa|wa|tas|act|nt)$','');
  v_state:=substring(v_location from '(vic|nsw|qld|sa|wa|tas|act|nt)$');
  return private.launch_job_public(j.id) and j.status='published' and j.moderation_status='approved' and j.published_at<=now() and j.expires_at>now()
    and (s.keyword='' or j.search_vector @@ websearch_to_tsquery('english',s.keyword))
    and (s.distance is not null or s.location='' or (j.work_mode='Remote' and j.city='Anywhere in Australia') or
      (v_location in ('vic','nsw','qld','sa','wa','tas','act','nt') and lower(j.state)=v_location) or
      (v_location='anywhere in australia' and j.work_mode='Remote') or
      (v_location not in ('vic','nsw','qld','sa','wa','tas','act','nt','anywhere in australia') and lower(j.city) like '%'||v_city||'%' and (v_state is null or lower(j.state)=v_state)))
    and (s.distance is null or (j.work_mode='Remote' and j.city='Anywhere in Australia') or (j.latitude is not null and j.longitude is not null and 6371.0088*2*asin(sqrt(least(1.0,power(sin(radians(j.latitude-s.centre_lat)/2),2)+cos(radians(s.centre_lat))*cos(radians(j.latitude))*power(sin(radians(j.longitude-s.centre_lon)/2),2))))<=s.distance))
    and (s.listed_within is null or j.published_at>=now()-s.listed_within*interval '1 day')
    and (s.listed_from is null or j.published_at>=s.listed_from::timestamp at time zone 'UTC')
    and (s.listed_to is null or j.published_at<(s.listed_to+1)::timestamp at time zone 'UTC')
    and (cardinality(s.work_modes)=0 or j.work_mode=any(s.work_modes))
    and (cardinality(s.employment_types)=0 or j.employment_type=any(s.employment_types))
    and (s.min_salary is null or (j.salary_period='year' and j.salary_max>=s.min_salary))
    and (not s.direct_only or j.source='direct');
end;
$$;
create or replace function public.freeze_job_alert(p_id uuid,p_lease uuid,p_request jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare b private.alert_outbox%rowtype; v_valid integer; v_total integer;
begin
  select * into b from private.alert_outbox where id=p_id and lease_token=p_lease and status='leased' and lease_expires_at>now() for update;
  if not found then return null; end if;
  if not exists(select 1 from private.alert_settings where sending_enabled) then return null; end if;
  if not private.delivery_eligible(b) then
    update private.alert_outbox set status='canceled',error_code='UNSUBSCRIBED',lease_token=null,lease_expires_at=null where id=p_id; return null;
  end if;
  if b.kind='digest' then
    select count(*) into v_total from private.alert_job_deliveries where outbox_id=b.id;
    select count(*) into v_valid from private.alert_job_deliveries d join public.jobs j on j.id=d.job_id join public.organisations o on o.id=j.organisation_id
      where d.outbox_id=b.id and private.launch_job_public(j.id) and j.status='published' and j.moderation_status='approved' and j.expires_at>now() and o.is_verified and o.suspended_at is null;
    if v_valid<>v_total or v_total=0 then
      update private.alert_outbox set status='canceled',error_code='VACANCY_CHANGED',lease_token=null,lease_expires_at=null where id=p_id; return null;
    end if;
  end if;
  if b.provider_request is null then
    if p_request is null or jsonb_typeof(p_request)<>'object' or p_request->>'from' is distinct from 'Westmere Careers <hello@westmere.com.au>' or p_request->'to' is distinct from jsonb_build_array(b.recipient) then raise exception 'Invalid frozen email' using errcode='22023'; end if;
    update private.alert_outbox set provider_request=p_request where id=p_id; return p_request;
  end if;
  return b.provider_request;
end;
$$;
commit;
