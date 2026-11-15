-- Trial usage is separate from paid billing-period usage. No CVs, raw IPs or outputs are stored here.
create table public.ai_trial_usage (
  id uuid primary key default gen_random_uuid(),
  principal text not null check (principal ~ '^[a-f0-9]{64}$'),
  tier text not null check (tier in ('guest','account')),
  abuse_key text not null check (abuse_key ~ '^[a-f0-9]{64}$'),
  user_id uuid references auth.users(id) on delete cascade,
  status text not null default 'reserved' check (status in ('reserved','completed','failed')),
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  check ((tier='guest' and user_id is null) or (tier='account' and user_id is not null))
);
create index ai_trial_principal on public.ai_trial_usage(principal,tier,status);
create index ai_trial_daily on public.ai_trial_usage(created_at,abuse_key);
create index ai_trial_user on public.ai_trial_usage(user_id);
alter table public.ai_trial_usage enable row level security;
revoke all on public.ai_trial_usage from public,anon,authenticated;
grant select,insert,update,delete on public.ai_trial_usage to service_role;

create function public.trial_ai_remaining(p_principal text,p_tier text) returns integer
language sql security invoker set search_path='' as $$
  select greatest(0,(case when p_tier='account' then 3 else 1 end)-count(*)::integer)
  from public.ai_trial_usage where principal=p_principal and tier=p_tier
  and (status='completed' or (status='reserved' and created_at>now()-interval '2 minutes'));
$$;
revoke all on function public.trial_ai_remaining(text,text) from public,anon,authenticated;
grant execute on function public.trial_ai_remaining(text,text) to service_role;

create function public.reserve_trial_ai_usage(p_principal text,p_tier text,p_abuse text,p_user uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare v_id uuid; v_used integer;
begin
  if p_principal !~ '^[a-f0-9]{64}$' or p_abuse !~ '^[a-f0-9]{64}$' or p_tier not in ('guest','account')
     or (p_tier='account' and p_user is null) or (p_tier='guest' and p_user is not null) then
    raise exception 'Invalid trial identity.' using errcode='22023';
  end if;
  -- A shared lock bounds total trial spend and prevents concurrent requests from overspending a trial.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('westmere-ai-trial',0));
  -- Anonymous quota identifiers expire with the one-year browser cookie. Failed attempts need only 30 days.
  delete from public.ai_trial_usage where (tier='guest' and created_at<now()-interval '365 days') or (status<>'completed' and created_at<now()-interval '30 days');
  if (select count(*) from public.ai_trial_usage where created_at>=date_trunc('day',now()))>=100 then
    raise exception 'Daily trial capacity reached.' using errcode='P0001';
  end if;
  if (select count(*) from public.ai_trial_usage where abuse_key=p_abuse and created_at>=now()-interval '1 day')>=5 then
    raise exception 'Daily preview request limit reached.' using errcode='P0001';
  end if;
  select public.trial_ai_remaining(p_principal,p_tier) into v_used;
  if v_used<=0 then raise exception 'Trial allowance used.' using errcode='P0001'; end if;
  insert into public.ai_trial_usage(principal,tier,abuse_key,user_id) values(p_principal,p_tier,p_abuse,p_user) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.reserve_trial_ai_usage(text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.reserve_trial_ai_usage(text,text,text,uuid) to service_role;

create function public.settle_trial_ai_usage(p_reservation uuid,p_success boolean) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
  update public.ai_trial_usage set status=case when p_success then 'completed' else 'failed' end,settled_at=now()
  where id=p_reservation and status='reserved' and (not p_success or created_at>now()-interval '2 minutes');
  return found;
end;
$$;
revoke all on function public.settle_trial_ai_usage(uuid,boolean) from public,anon,authenticated;
grant execute on function public.settle_trial_ai_usage(uuid,boolean) to service_role;
