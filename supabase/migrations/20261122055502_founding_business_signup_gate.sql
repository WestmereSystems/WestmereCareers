begin;
-- Only the server can prepare a short-lived business registration. User metadata
-- and OAuth profile claims never decide whether a new identity may be created.
create table private.launch_business_signup (
 email text primary key check(email=lower(trim(email)) and length(email)<=254),
 kind text not null check(kind in('employer','agency')),
 expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
alter table private.launch_business_signup enable row level security;
revoke all on private.launch_business_signup from public,anon,authenticated;
grant all on private.launch_business_signup to service_role;

create or replace function private.launch_email_allowed(p_email text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u join private.staff_members s on s.user_id=u.id
   where lower(u.email)=lower(trim(p_email)) and u.email_confirmed_at is not null and s.enabled)
 or (not exists(select 1 from private.launch_access a where a.email=lower(trim(p_email)) and a.revoked_at is not null)
 and (private.launch_open()
   or exists(select 1 from auth.users u where lower(u.email)=lower(trim(p_email)) and u.created_at<(select existing_before from private.launch_settings where singleton))
   or exists(select 1 from auth.users u join public.business_accounts b on b.user_id=u.id where lower(u.email)=lower(trim(p_email)))
   or exists(select 1 from auth.users u join public.organisation_members m on m.user_id=u.id where lower(u.email)=lower(trim(p_email)))
   or exists(select 1 from private.test_account_allowlist t where t.email=lower(trim(p_email)))
   or exists(select 1 from private.launch_access a where a.email=lower(trim(p_email)) and a.revoked_at is null and (a.expires_at is null or a.expires_at>now()) and (a.user_id is null or exists(select 1 from auth.users u where u.id=a.user_id and lower(u.email)=a.email)))
   or exists(select 1 from private.business_invitations i where i.email=lower(trim(p_email)) and i.revoked_at is null and i.accepted_at is null and i.expires_at>now() and private.business_team_enabled(i.organisation_id))
   or exists(select 1 from private.launch_business_signup b where b.email=lower(trim(p_email)) and b.expires_at>now())
 ));
$$;

create function private.prepare_business_signup(p_email text,p_kind text,p_network text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if current_setting('role',true)<>'service_role' then raise exception 'Server access required' using errcode='42501';end if;
 p_email:=lower(trim(p_email));
 if p_kind not in('employer','agency') or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' or p_network !~ '^[a-f0-9]{64}$' then raise exception 'Choose a valid business registration' using errcode='22023';end if;
 -- Do not place the protected staff identity behind public registration pacing.
 if exists(select 1 from auth.users u join private.staff_members s on s.user_id=u.id where lower(u.email)=p_email and u.email_confirmed_at is not null and s.enabled) then return;end if;
 if exists(select 1 from private.launch_access a where a.revoked_at is not null and (a.email=p_email or a.user_id in(select id from auth.users where lower(email)=p_email))) then raise exception 'This account is restricted' using errcode='42501';end if;
 if exists(select 1 from auth.users u where lower(u.email)=p_email and (u.created_at<(select existing_before from private.launch_settings where singleton) or exists(select 1 from public.business_accounts b where b.user_id=u.id) or exists(select 1 from public.organisation_members m where m.user_id=u.id))) then return;end if;
 insert into private.launch_rate_limits(network,window_at,hits) values('business-signup:'||p_network,date_trunc('hour',now()),1)
 on conflict(network,window_at) do update set hits=private.launch_rate_limits.hits+1 where private.launch_rate_limits.hits<6;
 if not found then raise exception 'Business registration pacing limit reached' using errcode='P0001';end if;
 insert into private.launch_business_signup(email,kind,expires_at) values(p_email,p_kind,now()+interval '15 minutes')
 on conflict(email) do update set kind=excluded.kind,expires_at=excluded.expires_at;
end;$$;
revoke all on function private.prepare_business_signup(text,text,text) from public,anon,authenticated;
grant execute on function private.prepare_business_signup(text,text,text) to service_role;
create function public.prepare_business_signup(p_email text,p_kind text,p_network text)
returns void language sql security invoker set search_path='' as $$select private.prepare_business_signup(p_email,p_kind,p_network);$$;
revoke all on function public.prepare_business_signup(text,text,text) from public,anon,authenticated;
grant execute on function public.prepare_business_signup(text,text,text) to service_role;

create or replace function private.launch_account_allowed()
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null and
 (private.my_staff_role() is not null or (private.launch_email_allowed(u.email) and not exists(
 select 1 from private.launch_access a where a.revoked_at is not null and (a.user_id=u.id or (a.user_id is null and a.email=lower(u.email)))
 ))));
$$;
create or replace function private.my_launch_access()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('allowed',private.launch_account_allowed(),
 'kind',coalesce((select b.kind from public.business_accounts b where b.user_id=auth.uid()),
 (select s.kind from private.launch_business_signup s join auth.users u on lower(u.email)=s.email where u.id=auth.uid() and s.expires_at>now())),
 'expiresAt',null,'marketplaceOpen',private.launch_open(),'selfRegistration',true);
$$;

-- Supabase Auth runs this before OTP, password or OAuth can insert a new user.
-- It returns no user data and has no Data API caller permissions.
create function public.before_user_created(event jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if coalesce(event->'user'->>'email','')<>'' and private.launch_email_allowed(event->'user'->>'email') then return '{}'::jsonb;end if;
 return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','Applicant registration opens when Westmere Careers launches. Employers and agencies must begin with business registration.'));
end;$$;
revoke all on function public.before_user_created(jsonb) from public,anon,authenticated,service_role;
do $$begin
 if exists(select 1 from pg_roles where rolname='supabase_auth_admin') then
  grant usage on schema public,private to supabase_auth_admin;
  grant execute on function private.launch_email_allowed(text),public.before_user_created(jsonb) to supabase_auth_admin;
 end if;
end;$$;
commit;
