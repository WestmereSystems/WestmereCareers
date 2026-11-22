-- All staff see shared activity with the original actor; ownership of an action never moves.
create function private.admin_activity(p_before timestamptz default null,p_before_id uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if private.my_staff_role() is null then raise exception 'Staff access required' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(r order by r.created_at desc,r.id desc),'[]') from (
  select e.*,u.email actor_email,t.email target_email from (
   select id,actor_id,target_id,'testing'::text category,action,tier,reason,created_at from private.testing_audit
   union all
   select id,actor_id,subject_id,'moderation',action,null,reason,created_at from private.moderation_audit
  ) e left join auth.users u on u.id=e.actor_id left join auth.users t on t.id=e.target_id
  where p_before is null or (e.created_at,e.id)<(p_before,coalesce(p_before_id,'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
  order by e.created_at desc,e.id desc limit 100
 ) r);
end;$$;
revoke all on function private.admin_activity(timestamptz,uuid) from public,anon;grant execute on function private.admin_activity(timestamptz,uuid) to authenticated;
create function public.admin_activity(p_before timestamptz default null,p_before_id uuid default null) returns jsonb language sql security invoker set search_path='' as $$select private.admin_activity(p_before,p_before_id);$$;
revoke all on function public.admin_activity(timestamptz,uuid) from public,anon;grant execute on function public.admin_activity(timestamptz,uuid) to authenticated;

create function private.test_account_details(p_email text) returns jsonb language plpgsql security definer set search_path='' as $$
declare target uuid;kind text;
begin
 if not private.can_manage_testing() then raise exception 'Testing operator access required' using errcode='42501';end if;
 select id into target from auth.users where lower(email)=lower(trim(p_email)) and email_confirmed_at is not null;
 if target is null then raise exception 'The account must sign up and verify its email first' using errcode='22023';end if;
 select b.kind into kind from public.business_accounts b where b.user_id=target;
 if kind is null and exists(select 1 from public.organisation_members where user_id=target) then kind:='employer';end if;
 return jsonb_build_object('audience',coalesce(kind,'individual'),'verified',exists(select 1 from public.organisation_members m join public.organisations o on o.id=m.organisation_id where m.user_id=target and m.role='owner' and o.is_verified and o.suspended_at is null and o.removed_at is null));
end;$$;
revoke all on function private.test_account_details(text) from public,anon;grant execute on function private.test_account_details(text) to authenticated;
create function public.test_account_details(p_email text) returns jsonb language sql security invoker set search_path='' as $$select private.test_account_details(p_email);$$;
revoke all on function public.test_account_details(text) from public,anon;grant execute on function public.test_account_details(text) to authenticated;

create or replace function private.manage_test_entitlement(p_email text,p_tier text,p_days integer,p_reason text,p_designate boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_user uuid;
begin
 if not private.can_manage_testing() then raise exception 'Testing operator access required' using errcode='42501';end if;
 if p_reason is null or length(trim(p_reason)) not between 10 and 1000 or p_days not between 1 and 30 then raise exception 'Choose a reason and a test duration up to 30 days' using errcode='22023';end if;
 if p_designate then
   if not exists(select 1 from auth.users where lower(email)=lower(trim(p_email)) and email_confirmed_at is not null) then raise exception 'A verified dedicated test account is required';end if;
   insert into private.test_account_allowlist(email) values(lower(trim(p_email))) on conflict do nothing;
 end if;
 if not exists(select 1 from private.test_account_allowlist where email=lower(trim(p_email))) then raise exception 'Only designated test accounts can receive test access' using errcode='42501';end if;
 select id into v_user from auth.users where lower(email)=lower(trim(p_email)) and email_confirmed_at is not null;
 if v_user is null then raise exception 'The designated account must sign up and verify its email first' using errcode='22023';end if;
 if p_tier is null then delete from private.test_entitlements where user_id=v_user;
 else
  if p_tier not in ('careers_plus','starter','growth','enterprise','agency_starter','agency_growth','agency_enterprise') then raise exception 'Unknown test tier' using errcode='22023';end if;
  if p_tier='careers_plus' and (exists(select 1 from public.business_accounts where user_id=v_user) or exists(select 1 from public.organisation_members where user_id=v_user)) then raise exception 'Careers+ requires a personal account' using errcode='22023';end if;
  if p_tier<>'careers_plus' and not exists(select 1 from public.business_accounts where user_id=v_user and case when p_tier like 'agency_%' then kind='agency' else kind='employer' end) then raise exception 'Complete the matching business account type first' using errcode='22023';end if;
  if p_tier<>'careers_plus' and not exists(select 1 from public.organisation_members m join public.organisations o on o.id=m.organisation_id where m.user_id=v_user and m.role='owner' and o.is_verified and o.suspended_at is null and o.removed_at is null) then raise exception 'Verify the business before assigning a business test tier' using errcode='22023';end if;
  insert into private.test_entitlements(user_id,tier,starts_at,expires_at,actor_id,reason) values(v_user,p_tier,now(),now()+make_interval(days=>p_days),auth.uid(),trim(p_reason)) on conflict(user_id) do update set tier=excluded.tier,starts_at=excluded.starts_at,expires_at=excluded.expires_at,actor_id=excluded.actor_id,reason=excluded.reason;
 end if;
 insert into private.testing_audit(actor_id,target_id,tier,action,reason) values(auth.uid(),v_user,p_tier,case when p_tier is null then 'revoke' else 'assign' end,trim(p_reason));
 return jsonb_build_object('email',lower(trim(p_email)),'tier',p_tier,'testingOnly',true);
end;$$;
