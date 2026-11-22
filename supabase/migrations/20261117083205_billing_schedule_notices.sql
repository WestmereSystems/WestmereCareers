-- Scheduled plan changes and payment-method edits use the same verified-event boundary.
create or replace function public.record_billing_notice(p_event text,p_customer text,p_title text,p_message text) returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid;
begin
 if length(p_title)>200 or length(p_message)>2000 or not exists(select 1 from public.stripe_events where id=p_event and type in ('invoice.paid','invoice.payment_failed','charge.refunded','customer.updated','customer.subscription.updated','payment_method.attached','payment_method.detached','payment_method.updated','payment_method.automatically_updated','checkout.session.completed','checkout.session.async_payment_succeeded','subscription_schedule.created','subscription_schedule.updated','subscription_schedule.released','subscription_schedule.canceled','subscription_schedule.aborted','subscription_schedule.completed')) then raise exception 'Verified billing event required' using errcode='22023';end if;
 for v_user in select user_id from public.billing_customers where stripe_customer_id=p_customer
 union select m.user_id from public.organisation_billing_accounts b join public.organisation_members m on m.organisation_id=b.organisation_id and m.role='owner' where b.stripe_customer_id=p_customer loop
 perform private.queue_billing_notice(v_user,'event:'||p_event,p_title,p_message);end loop;
end;$$;
revoke all on function public.record_billing_notice(text,text,text,text) from public,anon,authenticated;
grant execute on function public.record_billing_notice(text,text,text,text) to service_role;
