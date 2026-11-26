begin;
-- Internal measurement records. No browser/PostgREST user role can read or write them.
-- The commercial identity is Westmere's owner business account, whose one billing
-- stream covers several company profiles. It is not each employee membership.
create table public.ads_measurement_settings (
 singleton boolean primary key default true check(singleton), installed_at timestamptz not null default clock_timestamp()
);
insert into public.ads_measurement_settings(singleton) values(true);
create table public.ads_employers (
 id uuid primary key default gen_random_uuid(), owner_user_id uuid unique references auth.users(id) on delete set null,
 registered_at timestamptz not null, context_id uuid,
 first_invoice_id text unique, first_paid_at timestamptz, first_value_minor bigint,
 history_checked_at timestamptz, last_scan_attempt_at timestamptz,
 scan_token uuid, scan_expires_at timestamptz, issue_code text,
 check(first_value_minor is null or first_value_minor>0)
);
create table public.ads_contexts (
 id uuid primary key default gen_random_uuid(), owner_user_id uuid references auth.users(id) on delete set null,
 measurement boolean not null default false, ad_user_data boolean not null default false, enhanced boolean not null default false,
 consent_version text not null, granted_at timestamptz, user_data_granted_at timestamptz, enhanced_granted_at timestamptz, withdrawn_at timestamptz,
 identifiers jsonb not null default '{}', identifiers_at timestamptz,
 email_hash text check(email_hash is null or email_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 expires_at timestamptz not null default clock_timestamp()+interval '90 days',
 check(not enhanced or (measurement and ad_user_data)), check(jsonb_typeof(identifiers)='object')
);
alter table public.ads_employers add foreign key(context_id) references public.ads_contexts(id) on delete set null;
create table public.ads_conversion_events (
 id uuid primary key default gen_random_uuid(), employer_id uuid not null references public.ads_employers(id),
 kind text not null check(kind in('registration','purchase')), transaction_id text not null unique default 'wm-'||gen_random_uuid()::text,
 invoice_id text unique, occurred_at timestamptz not null, value_minor bigint,
 currency text not null default 'AUD' check(currency='AUD'), context_id uuid references public.ads_contexts(id) on delete set null,
 status text not null default 'queued' check(status in('queued','tag_queued','submitted','processed','retry','permanent_failure','suppressed','configuration_hold','historical','review')),
 destination text, request_id text, delivery_payload jsonb, next_attempt_at timestamptz not null default clock_timestamp(),
 attempts integer not null default 0, error_code text, review_code text,
 created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
 unique(employer_id,kind), check(length(transaction_id)<=64),
 check((kind='registration' and value_minor=0 and invoice_id is null) or (kind='purchase' and invoice_id is not null and (value_minor is null or value_minor>0)))
);
create table public.ads_delivery_attempts (
 id bigint generated always as identity primary key, event_id uuid not null references public.ads_conversion_events(id),
 attempted_at timestamptz not null default clock_timestamp(), state text not null, code text, request_id text
);
create table public.ads_payment_reviews (
 invoice_id text primary key, employer_id uuid not null references public.ads_employers(id),
 reason text not null, refunded_minor bigint not null default 0,
 first_seen_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp()
);
create table public.ads_customer_identities (
 stripe_customer_id text primary key,employer_id uuid not null references public.ads_employers(id)
);
create table public.ads_business_identities (
 organisation_id uuid primary key references public.organisations(id) on delete restrict,employer_id uuid not null references public.ads_employers(id)
);
create table public.ads_context_rate (
 network text not null check(network ~ '^[a-f0-9]{64}$'),bucket bigint not null,requests integer not null default 1,
 primary key(network,bucket)
);
create index ads_employer_scan on public.ads_employers(last_scan_attempt_at nulls first);
create index ads_context_owner on public.ads_contexts(owner_user_id);
create index ads_context_expiry on public.ads_contexts(expires_at);
create index ads_employer_context on public.ads_employers(context_id);
create index ads_event_context on public.ads_conversion_events(context_id);
create index ads_event_delivery on public.ads_conversion_events(next_attempt_at) where kind='purchase' and status in('queued','retry','submitted','configuration_hold');
create index ads_attempt_event on public.ads_delivery_attempts(event_id,attempted_at);
create index ads_review_employer on public.ads_payment_reviews(employer_id);
create index ads_customer_employer on public.ads_customer_identities(employer_id);
create index ads_business_employer on public.ads_business_identities(employer_id);
do $$declare t text; begin
 foreach t in array array['ads_measurement_settings','ads_employers','ads_contexts','ads_conversion_events','ads_delivery_attempts','ads_payment_reviews','ads_customer_identities','ads_business_identities','ads_context_rate'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end;$$;
grant usage,select on sequence public.ads_delivery_attempts_id_seq to service_role;
create function public.ads_context_allowed(p_network text) returns boolean language plpgsql security invoker set search_path='' as $$
declare v_bucket bigint:=floor(extract(epoch from clock_timestamp())/600);v_count integer;begin
 if p_network !~ '^[a-f0-9]{64}$' then return false;end if;
 insert into public.ads_context_rate(network,bucket) values(p_network,v_bucket)
 on conflict(network,bucket) do update set requests=ads_context_rate.requests+1 returning requests into v_count;
 return v_count<=60;
end;$$;
revoke all on function public.ads_context_allowed(text) from public,anon,authenticated;grant execute on function public.ads_context_allowed(text) to service_role;

-- Replayable recovery of registration capture. Existing accounts are historical;
-- invitation-only/team accounts and designated internal/test accounts are excluded.
create function private.ads_eligible_owner(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users u join public.business_accounts b on b.user_id=u.id where u.id=p_user and u.email_confirmed_at is not null
 and not exists(select 1 from public.organisation_members m where m.user_id=u.id and m.created_at<=b.created_at)
 and not exists(select 1 from private.test_account_allowlist t where t.email=lower(u.email))
 and not exists(select 1 from private.staff_members s where s.user_id=u.id));
$$;
revoke all on function private.ads_eligible_owner(uuid) from public,anon,authenticated;
grant execute on function private.ads_eligible_owner(uuid) to service_role;
create function public.ads_seed_employers() returns void language plpgsql security invoker set search_path='' as $$
begin
 insert into public.ads_employers(owner_user_id,registered_at)
 select b.user_id,b.created_at from public.business_accounts b
 where b.kind='employer' and private.ads_eligible_owner(b.user_id)
 on conflict(owner_user_id) do nothing;
 insert into public.ads_conversion_events(employer_id,kind,occurred_at,value_minor,status)
 select e.id,'registration',e.registered_at,0,case when e.registered_at>=s.installed_at then 'queued' else 'historical' end
 from public.ads_employers e cross join public.ads_measurement_settings s
 on conflict(employer_id,kind) do nothing;
end;$$;
revoke all on function public.ads_seed_employers() from public,anon,authenticated;
grant execute on function public.ads_seed_employers() to service_role;
select public.ads_seed_employers();

create function private.ads_registration_completed() returns trigger language plpgsql security definer set search_path='' as $$
declare v_id uuid;begin
 if new.kind<>'employer' or not private.ads_eligible_owner(new.user_id) then return new;end if;
 insert into public.ads_employers(owner_user_id,registered_at) values(new.user_id,new.created_at)
 on conflict(owner_user_id) do update set owner_user_id=excluded.owner_user_id returning id into v_id;
 insert into public.ads_conversion_events(employer_id,kind,occurred_at,value_minor,status) values(v_id,'registration',new.created_at,0,case when new.created_at>=(select installed_at from public.ads_measurement_settings where singleton) then 'queued' else 'historical' end)
 on conflict(employer_id,kind) do nothing;
 return new;
exception when others then
 -- Optional measurement must never roll back successful business registration.
 -- ads_seed_employers recovers the original created_at on the scheduled pass.
 raise log 'ADS_REGISTRATION_CAPTURE_FAILED'; return new;
end;$$;
revoke all on function private.ads_registration_completed() from public,anon,authenticated;
create trigger ads_registration_completed after insert on public.business_accounts for each row execute function private.ads_registration_completed();

create function public.ads_claim_employers(p_limit integer default 10) returns setof public.ads_employers language sql security invoker set search_path='' as $$
 with chosen as (
  select id from public.ads_employers e where owner_user_id is not null and (scan_expires_at is null or scan_expires_at<clock_timestamp())
  and (exists(select 1 from public.organisation_billing_accounts b where b.billing_user_id=e.owner_user_id and b.livemode)
       or exists(select 1 from public.billing_customer_history h where h.user_id=e.owner_user_id and h.livemode))
  order by last_scan_attempt_at nulls first,id for update skip locked limit least(greatest(p_limit,1),25)
 ) update public.ads_employers e set scan_token=gen_random_uuid(),scan_expires_at=clock_timestamp()+interval '4 minutes',last_scan_attempt_at=clock_timestamp()
 from chosen c where e.id=c.id returning e.*;
$$;
revoke all on function public.ads_claim_employers(integer) from public,anon,authenticated;
grant execute on function public.ads_claim_employers(integer) to service_role;
create function public.ads_prioritise_customer(p_customer text) returns void language sql security invoker set search_path='' as $$
 update public.ads_employers e set last_scan_attempt_at=null where exists(select 1 from public.organisation_billing_accounts b where b.stripe_customer_id=p_customer and b.livemode and b.billing_user_id=e.owner_user_id);
$$;
revoke all on function public.ads_prioritise_customer(text) from public,anon,authenticated;grant execute on function public.ads_prioritise_customer(text) to service_role;

-- The full history scan, its first-payment claim and its outbox write commit together.
-- The lease fences delayed workers and serializes concurrent successful payments.
create function public.ads_complete_history(p_employer uuid,p_token uuid,p_first jsonb,p_issue text default null) returns void language plpgsql security invoker set search_path='' as $$
declare e public.ads_employers; v_invoice text; v_at timestamptz; v_value bigint; v_context uuid;begin
 select * into e from public.ads_employers where id=p_employer and scan_token=p_token and scan_expires_at>clock_timestamp() for update;
 if not found then raise exception 'Measurement lease expired' using errcode='40001';end if;
 if p_issue is not null then
  update public.ads_employers set issue_code=left(p_issue,100),scan_token=null,scan_expires_at=null where id=e.id;return;
 end if;
 if p_first is not null then
  v_invoice:=p_first->>'invoiceId';v_at:=(p_first->>'paidAt')::timestamptz;v_value:=(p_first->>'valueMinor')::bigint;
  if v_invoice !~ '^in_[A-Za-z0-9]+$' or v_at is null or v_at>clock_timestamp()+interval '5 minutes' or (v_value is not null and v_value<=0) then raise exception 'Invalid verified acquisition';end if;
  if e.first_invoice_id is not null and e.first_invoice_id<>v_invoice then
   update public.ads_employers set issue_code='FIRST_PAYMENT_CONFLICT',scan_token=null,scan_expires_at=null where id=e.id;
   update public.ads_conversion_events set review_code='FIRST_PAYMENT_CONFLICT',status=case when status='processed' then status else 'review' end where employer_id=e.id and kind='purchase';return;
  end if;
  if e.first_value_minor is not null and v_value is not null and e.first_value_minor<>v_value then
   update public.ads_employers set issue_code='FIRST_VALUE_CONFLICT',scan_token=null,scan_expires_at=null where id=e.id;
   update public.ads_conversion_events set review_code='FIRST_VALUE_CONFLICT',status=case when status='processed' then status else 'review' end where employer_id=e.id and kind='purchase';return;
  end if;
  update public.ads_employers set first_invoice_id=v_invoice,first_paid_at=v_at,first_value_minor=coalesce(first_value_minor,v_value) where id=e.id;
  select id into v_context from public.ads_contexts where owner_user_id=e.owner_user_id and measurement and ad_user_data and withdrawn_at is null
   and greatest(granted_at,user_data_granted_at)<=v_at and created_at<=v_at
   order by identifiers_at desc nulls last,created_at desc limit 1;
  insert into public.ads_conversion_events(employer_id,kind,invoice_id,occurred_at,value_minor,context_id,status,error_code)
  values(e.id,'purchase',v_invoice,v_at,v_value,v_context,case when v_value is null then 'review' else 'queued' end,p_first->>'issue')
  on conflict(employer_id,kind) do nothing;
  -- A held value can be resolved from the same verified invoice, never a renewal.
  update public.ads_conversion_events set value_minor=v_value,status='queued',error_code=null,updated_at=clock_timestamp()
  where employer_id=e.id and kind='purchase' and invoice_id=v_invoice and value_minor is null and v_value>0 and status='review' and review_code is null;
 end if;
 update public.ads_employers set history_checked_at=clock_timestamp(),issue_code=null,scan_token=null,scan_expires_at=null where id=e.id;
end;$$;
revoke all on function public.ads_complete_history(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.ads_complete_history(uuid,uuid,jsonb,text) to service_role;

-- Only trusted server code passes p_user after verifying the current Auth session.
create function public.ads_bind_context(p_context uuid,p_user uuid,p_email_hash text default null) returns uuid language plpgsql security invoker set search_path='' as $$
declare e public.ads_employers;c public.ads_contexts;begin
 select * into c from public.ads_contexts where id=p_context and expires_at>clock_timestamp() for update;
 if not found or (c.owner_user_id is not null and c.owner_user_id<>p_user) then return null;end if;
 select * into e from public.ads_employers where owner_user_id=p_user for update;
 if not found then return null;end if;
 update public.ads_contexts set owner_user_id=p_user,email_hash=case when measurement and ad_user_data and enhanced then p_email_hash else null end where id=c.id;
 if c.measurement and c.ad_user_data and c.withdrawn_at is null then
  update public.ads_employers set context_id=c.id where id=e.id and first_invoice_id is null;
  update public.ads_conversion_events set context_id=c.id where employer_id=e.id and kind='registration' and status='queued' and context_id is null and greatest(c.granted_at,c.user_data_granted_at)<=occurred_at;
 end if;
 return e.id;
end;$$;
revoke all on function public.ads_bind_context(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.ads_bind_context(uuid,uuid,text) to service_role;

create function public.ads_purge_expired() returns void language sql security invoker set search_path='' as $$
 update public.ads_contexts set identifiers='{}',email_hash=null,measurement=false,ad_user_data=false,enhanced=false where expires_at<=clock_timestamp();
 update public.ads_conversion_events set delivery_payload=null where occurred_at<clock_timestamp()-interval '90 days' and delivery_payload is not null;
 delete from public.ads_context_rate where bucket<floor(extract(epoch from clock_timestamp())/600)-144;
$$;
revoke all on function public.ads_purge_expired() from public,anon,authenticated;grant execute on function public.ads_purge_expired() to service_role;

-- One global worker lease protects dispatch and recovery after a crash. It is
-- independent of the billing lease and never affects payment/entitlement work.
create table public.ads_worker_lease(singleton boolean primary key default true check(singleton),token uuid not null,expires_at timestamptz not null);
alter table public.ads_worker_lease enable row level security;
revoke all on public.ads_worker_lease from public,anon,authenticated;grant all on public.ads_worker_lease to service_role;
create function public.ads_worker_lock(p_token uuid,p_release boolean default false) returns boolean language plpgsql security invoker set search_path='' as $$begin
 if p_release then delete from public.ads_worker_lease where singleton and token=p_token;return found;end if;
 insert into public.ads_worker_lease(singleton,token,expires_at) values(true,p_token,clock_timestamp()+interval '3 minutes')
 on conflict(singleton) do update set token=excluded.token,expires_at=excluded.expires_at where ads_worker_lease.expires_at<clock_timestamp();
 return found;
end;$$;
revoke all on function public.ads_worker_lock(uuid,boolean) from public,anon,authenticated;grant execute on function public.ads_worker_lock(uuid,boolean) to service_role;
commit;
