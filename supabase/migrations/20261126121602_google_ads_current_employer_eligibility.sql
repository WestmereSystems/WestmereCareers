begin;

-- Durable acquisition identities survive account changes. Permission to bind
-- matching data or send a new conversion must still reflect the current account.
create or replace function private.ads_eligible_owner(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from auth.users u join public.business_accounts b on b.user_id=u.id
  where u.id=p_user and u.email_confirmed_at is not null and b.kind='employer'
  and not exists(select 1 from public.organisation_members m where m.user_id=u.id and m.created_at<=b.created_at)
  and not exists(select 1 from private.test_account_allowlist t where t.email=lower(u.email))
  and not exists(select 1 from private.staff_members s where s.user_id=u.id)
  and not private.is_billing_test_account(u.id)
 );
$$;

create function public.ads_delivery_eligible(p_employer uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.ads_employers e where e.id=p_employer and private.ads_eligible_owner(e.owner_user_id));
$$;
revoke all on function public.ads_delivery_eligible(uuid) from public,anon,authenticated;
grant execute on function public.ads_delivery_eligible(uuid) to service_role;

create or replace function public.ads_bind_context(p_context uuid,p_user uuid,p_email_hash text default null) returns uuid
language plpgsql security invoker set search_path='' as $$
declare e public.ads_employers;c public.ads_contexts;begin
 if not private.ads_eligible_owner(p_user) then return null;end if;
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

commit;
