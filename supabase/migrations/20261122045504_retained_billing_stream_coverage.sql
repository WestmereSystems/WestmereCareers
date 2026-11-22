begin;
-- Read only the current billing stream when filling coverage; historical mappings remain intact.
create or replace function private.fill_business_plan(p_user uuid) returns void language plpgsql security definer set search_path='' as $$
declare v_room integer; r record;
begin
 perform pg_advisory_xact_lock(hashtextextended('business-plan:'||p_user::text,0));
 select greatest(0,private.business_plan_limit(private.account_business_tier(p_user))-count(*))::integer into v_room
 from private.business_plan_organisations a join public.organisations o on o.id=a.organisation_id
 where a.billing_user_id=p_user and o.removed_at is null;
 for r in select m.organisation_id from public.organisation_members m join public.organisations o on o.id=m.organisation_id
 left join public.organisation_billing_accounts b on b.organisation_id=o.id and b.is_primary
 where m.user_id=p_user and m.role='owner' and o.removed_at is null
 and not exists(select 1 from private.business_plan_organisations a where a.organisation_id=o.id)
 order by coalesce(b.is_primary,false) desc,(b.organisation_id is not null) desc,o.created_at,o.id limit v_room
 loop
  insert into private.business_plan_organisations(organisation_id,billing_user_id) values(r.organisation_id,p_user);
 end loop;
end;$$;
revoke all on function private.fill_business_plan(uuid) from public,anon,authenticated;
-- Recheck the primary mapping inside the billing lease, including delayed webhook workers.
create or replace function public.apply_business_subscription(p_org uuid,p_customer text,p_subscription text,p_price text,p_tier text,p_status text,p_start timestamptz,p_end timestamptz,p_cancel boolean,p_user uuid,p_token uuid) returns void language plpgsql security invoker set search_path='' as $$
begin
 perform 1 from private.billing_leases where user_id=p_user and token=p_token and expires_at>clock_timestamp() for update;
 if not found then raise exception 'A current billing lease is required' using errcode='42501';end if;
 if not exists(select 1 from public.organisation_billing_accounts where organisation_id=p_org and stripe_customer_id=p_customer and billing_user_id=p_user and is_primary) then raise exception 'Unknown business billing mapping' using errcode='42501';end if;
 insert into public.business_subscriptions(organisation_id,stripe_customer_id,stripe_subscription_id,price_id,tier,status,current_period_start,current_period_end,cancel_at_period_end,updated_at) values(p_org,p_customer,p_subscription,p_price,p_tier,p_status,p_start,p_end,p_cancel,now())
 on conflict(organisation_id) do update set stripe_customer_id=excluded.stripe_customer_id,stripe_subscription_id=excluded.stripe_subscription_id,price_id=excluded.price_id,tier=excluded.tier,status=excluded.status,current_period_start=excluded.current_period_start,current_period_end=excluded.current_period_end,cancel_at_period_end=excluded.cancel_at_period_end,updated_at=now();
end;$$;
revoke all on function public.apply_business_subscription(uuid,text,text,text,text,text,timestamptz,timestamptz,boolean,uuid,uuid) from public,anon,authenticated;grant execute on function public.apply_business_subscription(uuid,text,text,text,text,text,timestamptz,timestamptz,boolean,uuid,uuid) to service_role;
commit;
