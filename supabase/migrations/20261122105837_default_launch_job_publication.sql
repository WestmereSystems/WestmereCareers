-- Default job publication is a revocable platform preference, not a fabricated owner consent event.
-- No launch switch, fixture flag, moderation state or existing release is enabled by this migration.
begin;
alter table private.launch_profiles add column jobs_publication_enabled boolean not null default true;
alter table private.launch_jobs add column publication_opted_out boolean not null default false;
-- Preserve prior explicit withdrawals, including withdrawals followed by content edits.
update private.launch_jobs j set publication_opted_out=true
where (select a.action from private.moderation_audit a where a.subject_type='launch_job' and a.subject_id=j.job_id and a.action in('consent','withdraw') order by a.created_at desc,(a.action='withdraw') desc,a.id desc limit 1)='withdraw';

create function private.launch_job_permission(p_job uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.jobs j join public.organisations o on o.id=j.organisation_id
 left join private.launch_profiles b on b.organisation_id=o.id left join private.launch_jobs p on p.job_id=j.id
 where j.id=p_job and coalesce(b.jobs_publication_enabled,true) and not coalesce(p.publication_opted_out,false)
 and not j.is_test and not o.is_test and o.removed_at is null
 and not exists(select 1 from private.production_fixtures f where (f.kind='job' and f.id=j.id) or (f.kind='organisation' and f.id=o.id)));
$$;
revoke all on function private.launch_job_permission(uuid) from public,anon,authenticated;

create or replace function private.launch_job_public(p_job uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.launch_jobs p join public.jobs j on j.id=p.job_id
 where p.job_id=p_job and private.launch_job_permission(p_job) and p.released_at is not null
 and not j.is_test and j.status='published' and j.moderation_status='approved' and j.published_at<=now() and j.expires_at>now() and private.launch_profile_public(j.organisation_id));
$$;
create or replace function private.hold_launch_publication() returns trigger language plpgsql security definer set search_path='' as $$begin
 -- Trusted database maintenance can prepare rows, but public RLS still requires a release record.
 if current_setting('role',true)='none' then return new;end if;
 if new.status='published' and not exists(select 1 from private.launch_jobs r where r.job_id=new.id and r.released_at is not null and private.launch_job_permission(new.id)) then new.status:='draft';new.published_at:=null;end if;return new;
end;$$;

create or replace function private.manage_launch_content(p_kind text,p_id uuid,p_action text) returns void language plpgsql security definer set search_path='' as $$declare oid uuid;staff record;begin
 perform private.require_launch_account();
 if p_kind in('profile','business_jobs') then oid:=p_id;elsif p_kind='job' then select organisation_id into oid from public.jobs where id=p_id;else raise exception 'Unknown content' using errcode='22023';end if;
 perform 1 from public.organisations where id=oid for update;
 if not exists(select 1 from public.organisation_members where organisation_id=oid and user_id=auth.uid() and role='owner') then raise exception 'The business owner must approve publication' using errcode='42501';end if;
 if p_action not in('consent','withdraw') then raise exception 'Unknown action' using errcode='22023';end if;
 if p_kind='business_jobs' then
 insert into private.launch_profiles(organisation_id,jobs_publication_enabled) values(p_id,p_action='consent') on conflict(organisation_id) do update set jobs_publication_enabled=excluded.jobs_publication_enabled;
 -- Changing the business preference invalidates earlier releases. Enabling never restores an old public release.
 update private.launch_jobs r set released_at=null,released_by=null where exists(select 1 from public.jobs j where j.id=r.job_id and j.organisation_id=oid);
 elsif p_kind='profile' then insert into private.launch_profiles(organisation_id,consented_at,consented_by) values(p_id,case when p_action='consent' then now() end,auth.uid()) on conflict(organisation_id) do update set consented_at=excluded.consented_at,consented_by=excluded.consented_by,released_at=null,released_by=null;
 else
 perform 1 from public.jobs where id=p_id and organisation_id=oid for update;
 if not found then raise exception 'Refresh the business listing before changing publication' using errcode='40001';end if;
 if p_action='consent' and not coalesce((select jobs_publication_enabled from private.launch_profiles where organisation_id=oid),true) then raise exception 'Enable job publication for this business in Launch preparation first' using errcode='22023';end if;
 insert into private.launch_jobs(job_id,consented_at,consented_by,publication_opted_out) values(p_id,case when p_action='consent' then now() end,auth.uid(),p_action='withdraw') on conflict(job_id) do update set consented_at=excluded.consented_at,consented_by=excluded.consented_by,publication_opted_out=excluded.publication_opted_out,released_at=null,released_by=null;
 end if;
 if p_action='consent' and p_kind<>'business_jobs' then for staff in select user_id from private.staff_members where enabled loop perform private.queue_account_notice(staff.user_id,'launch-ready:'||p_id||':'||clock_timestamp(),'Content approved for launch review','A business owner approved a '||p_kind||' for public release. Review it in the founding launch controls.','/account?tab=admin',false);end loop;end if;
 insert into private.moderation_audit(actor_id,subject_type,subject_id,action,reason) values(auth.uid(),'launch_'||p_kind,p_id,p_action,'Business owner updated the launch publication preference or individual permission.');end;$$;

create or replace function private.my_launch_content() returns jsonb language plpgsql stable security definer set search_path='' as $$begin perform private.require_launch_account();return jsonb_build_object(
 'profiles',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'verified',o.is_verified,'test',o.is_test,'jobsPublicationEnabled',coalesce(p.jobs_publication_enabled,true),'owner',m.role='owner','consentedAt',p.consented_at,'releasedAt',p.released_at)),'[]') from public.organisations o join public.organisation_members m on m.organisation_id=o.id and m.user_id=auth.uid() left join private.launch_profiles p on p.organisation_id=o.id where o.removed_at is null),
 'jobs',(select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'title',j.title,'organisationId',j.organisation_id,'review',j.moderation_status,'status',j.status,'test',j.is_test,'publicationAllowed',private.launch_job_permission(j.id),'publicationOptedOut',coalesce(p.publication_opted_out,false),'owner',m.role='owner','consentedAt',p.consented_at,'releasedAt',p.released_at)),'[]') from public.jobs j join public.organisation_members m on m.organisation_id=j.organisation_id and m.user_id=auth.uid() left join private.launch_jobs p on p.job_id=j.id where private.can_access_hiring_job(j.id,'listing') or (m.role='owner' and (select kind from public.organisations where id=m.organisation_id)<>'agency')));end;$$;

create or replace function private.admin_launch(p_action text,p_id uuid,p_kind text,p_reason text,p_open boolean,p_offset integer) returns jsonb language plpgsql security definer set search_path='' as $$declare r private.launch_requests%rowtype;v_job public.jobs%rowtype;begin
 perform private.require_launch_account();
 if private.my_staff_role() not in('admin','reviewer') or private.my_staff_role() is null then raise exception 'Reviewer access required' using errcode='42501';end if;
 if p_action='list' then return jsonb_build_object('marketplaceOpen',private.launch_open(),
 'requestCount',(select count(*) from private.launch_requests),'requests',(select coalesce(jsonb_agg(x order by x.created_at desc),'[]') from(select * from private.launch_requests order by created_at desc,id limit 100 offset greatest(0,least(p_offset,10000)))x),
 'profiles',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'description',o.description,'website',o.website,'careersEmail',o.careers_email,'avatarPath',o.avatar_path,'bannerPath',o.banner_path,'verified',o.is_verified,'test',o.is_test,'consentedAt',p.consented_at,'releasedAt',p.released_at)),'[]') from public.organisations o left join private.launch_profiles p on p.organisation_id=o.id where o.removed_at is null),
 'jobs',(select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'title',j.title,'organisationId',j.organisation_id,'review',j.moderation_status,'status',j.status,'test',j.is_test,'publicationAllowed',private.launch_job_permission(j.id),'consentedAt',p.consented_at,'releasedAt',p.released_at)),'[]') from public.jobs j left join private.launch_jobs p on p.job_id=j.id where j.status<>'closed'));
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
 if p_action='release' and not exists(select 1 from private.launch_profiles where organisation_id=p_id and consented_at is not null) then raise exception 'Owner publication permission is required' using errcode='22023';end if;
 update private.launch_profiles set released_at=case when p_action='release' then now() end,released_by=auth.uid() where organisation_id=p_id;
 elsif p_kind='job' then
 -- Match the owner preference lock order so an opt-out cannot race a release.
 perform 1 from public.organisations where id=(select organisation_id from public.jobs where id=p_id) for update;
 select * into v_job from public.jobs where id=p_id for update;
 if not found or v_job.is_test or v_job.status='closed' then raise exception 'Choose a current genuine vacancy' using errcode='22023';end if;
 if p_action='release' then
 if v_job.moderation_status<>'approved' or not private.launch_profile_public(v_job.organisation_id) or not private.launch_job_permission(p_id) then raise exception 'Review, owner permission and a public profile are required' using errcode='22023';end if;
 insert into private.launch_jobs(job_id,released_at,released_by) values(p_id,now(),auth.uid()) on conflict(job_id) do update set released_at=excluded.released_at,released_by=excluded.released_by;
 update public.jobs set status='published',published_at=now(),expires_at=now()+interval '30 days' where id=p_id;
 else update private.launch_jobs set released_at=null,released_by=auth.uid() where job_id=p_id;end if;
 else raise exception 'Unknown content' using errcode='22023';end if;
 else raise exception 'Unknown action' using errcode='22023';end if;
 insert into private.moderation_audit(actor_id,subject_type,subject_id,action,reason) values(auth.uid(),'launch_'||coalesce(p_kind,'access'),coalesce(p_id,'00000000-0000-4000-8000-000000000001'::uuid),p_action,p_reason);
 return jsonb_build_object('saved',true);end;$$;
commit;
