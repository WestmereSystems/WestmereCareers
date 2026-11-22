begin;
-- Self-service founding registration replaces the separate invitation approval.
-- Verified email, business Terms, identity review and agency authority remain independent.
create or replace function private.launch_email_allowed(p_email text) returns boolean language sql stable security definer set search_path='' as $$
 select not exists(select 1 from private.launch_access a where a.email=lower(trim(p_email)) and a.revoked_at is not null);
$$;
create or replace function private.launch_account_allowed() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null and
 (private.my_staff_role() is not null or not exists(select 1 from private.launch_access a where a.revoked_at is not null and (a.user_id=u.id or (a.user_id is null and a.email=lower(u.email))))));
$$;
create or replace function private.require_launch_account() returns void language plpgsql stable security definer set search_path='' as $$begin
 if current_setting('role',true)='service_role' then return;end if;
 if not private.launch_account_allowed() then raise exception 'Verify your email to continue, or contact support about restricted access' using errcode='42501';end if;
end;$$;
create or replace function private.my_launch_access() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('allowed',private.launch_account_allowed(),'kind',(select b.kind from public.business_accounts b where b.user_id=auth.uid()),'expiresAt',null,'marketplaceOpen',private.launch_open(),'selfRegistration',true);
$$;
-- Founding preparation does not create a paid subscription or an AI entitlement.
create or replace function private.account_business_tier(p_user uuid) returns text language sql stable security definer set search_path='' as $$select coalesce(
 (select t.tier from private.test_entitlements t join auth.users u on u.id=t.user_id join private.test_account_allowlist l on l.email=lower(u.email) join public.business_accounts a on a.user_id=t.user_id where t.user_id=p_user and t.starts_at<=now() and t.expires_at>now() and u.email_confirmed_at is not null and t.tier<>'careers_plus' and case when t.tier like 'agency_%' then a.kind='agency' else a.kind='employer' end),
 (select s.tier from public.organisation_billing_accounts b join public.business_subscriptions s using(organisation_id) where b.billing_user_id=p_user and b.is_primary and s.status in('active','trialing') and s.current_period_start<=now() and s.current_period_end>now()),
 (select p.tier from public.employer_plans p join public.organisation_members m using(organisation_id) where m.user_id=p_user and m.role='owner' and p.starts_at<=now() and p.ends_at>now() order by private.business_plan_limit(p.tier) desc,p.starts_at desc limit 1),
 (select case when b.kind='agency' then 'agency_starter' else 'starter' end from auth.users u join public.business_accounts b on b.user_id=u.id where u.id=p_user and u.email_confirmed_at is not null and not private.launch_open() and not exists(select 1 from private.launch_access a where a.revoked_at is not null and (a.user_id=u.id or (a.user_id is null and a.email=lower(u.email)))))
 );$$;
-- Even individually released content is hidden while the global launch is closed.
create or replace function private.launch_profile_public(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$select private.launch_open() and exists(select 1 from private.launch_profiles p join public.organisations o on o.id=p.organisation_id where p.organisation_id=p_org and p.consented_at is not null and p.released_at is not null and not o.is_test and o.is_verified and o.suspended_at is null and o.removed_at is null);$$;
-- No publication clock starts and no individual release can bypass the global hold.
create or replace function private.admin_launch(p_action text,p_id uuid,p_kind text,p_reason text,p_open boolean,p_offset integer) returns jsonb language plpgsql security definer set search_path='' as $$declare r private.launch_requests%rowtype;v_job public.jobs%rowtype;begin
 perform private.require_launch_account();
 if private.my_staff_role() not in('admin','reviewer') or private.my_staff_role() is null then raise exception 'Reviewer access required' using errcode='42501';end if;
 if p_action='list' then return jsonb_build_object('marketplaceOpen',private.launch_open(),
 'requestCount',(select count(*) from private.launch_requests),'requests',(select coalesce(jsonb_agg(x order by x.created_at desc),'[]') from(select * from private.launch_requests order by created_at desc,id limit 100 offset greatest(0,least(p_offset,10000)))x),
 'profiles',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'description',o.description,'website',o.website,'careersEmail',o.careers_email,'avatarPath',o.avatar_path,'bannerPath',o.banner_path,'verified',o.is_verified,'test',o.is_test,'consentedAt',p.consented_at,'releasedAt',p.released_at)),'[]') from public.organisations o left join private.launch_profiles p on p.organisation_id=o.id where o.removed_at is null),
 'jobs',(select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'title',j.title,'organisationId',j.organisation_id,'review',j.moderation_status,'status',j.status,'test',j.is_test,'consentedAt',p.consented_at,'releasedAt',p.released_at)),'[]') from public.jobs j left join private.launch_jobs p on p.job_id=j.id where j.status<>'closed'));
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
 select * into v_job from public.jobs where id=p_id for update;
 if not found or v_job.is_test or v_job.status='closed' then raise exception 'Choose a current genuine vacancy' using errcode='22023';end if;
 if p_action='release' then
 if v_job.moderation_status<>'approved' or not private.launch_profile_public(v_job.organisation_id) or not exists(select 1 from private.launch_jobs where job_id=p_id and consented_at is not null) then raise exception 'Review, owner permission and a public profile are required' using errcode='22023';end if;
 update private.launch_jobs set released_at=now(),released_by=auth.uid() where job_id=p_id;
 update public.jobs set status='published',published_at=now(),expires_at=now()+interval '30 days' where id=p_id;
 else update private.launch_jobs set released_at=null,released_by=auth.uid() where job_id=p_id;end if;
 else raise exception 'Unknown content' using errcode='22023';end if;
 else raise exception 'Unknown action' using errcode='22023';end if;
 insert into private.moderation_audit(actor_id,subject_type,subject_id,action,reason) values(auth.uid(),'launch_'||coalesce(p_kind,'access'),coalesce(p_id,'00000000-0000-4000-8000-000000000001'::uuid),p_action,p_reason);
 return jsonb_build_object('saved',true);end;$$;
-- Function replacements retain the existing restricted EXECUTE grants.
commit;
