-- Transactional billing notices share the existing private, idempotent mail outbox.
alter table public.notifications drop constraint notifications_path_check;
alter table public.notifications add constraint notifications_path_check check(path in ('/applications','/employers/dashboard','/account','/employers/sample','/account?tab=dashboard','/account?tab=verification','/account?tab=admin','/account?tab=billing'));

create function private.queue_billing_notice(p_user uuid,p_key text,p_title text,p_message text) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.queue_account_notice(p_user,'billing:'||p_key,p_title,p_message,'/account?tab=billing',true);
end;$$;
revoke all on function private.queue_billing_notice(uuid,text,text,text) from public,anon,authenticated;

create or replace function private.account_notice_email_allowed(p_user uuid,p_key text) returns boolean language sql stable security definer set search_path='' as $$
 select case when p_key='welcome' or p_key like 'business-%' or p_key like 'billing:%' then true
 when p_key like 'hiring-submission:%' then exists(select 1 from public.employer_notification_preferences where user_id=p_user and email_enabled and submissions)
 when p_key like 'milestone:%' then exists(select 1 from public.employer_notification_preferences where user_id=p_user and email_enabled and milestones)
 when p_key like 'closing:%' then exists(select 1 from public.employer_notification_preferences where user_id=p_user and email_enabled and closing_reminders)
 when p_key like 'follow-up:%' then exists(select 1 from public.employer_notification_preferences where user_id=p_user and email_enabled and follow_up_reminders)
 else not exists(select 1 from public.profiles where id=p_user and not application_email_enabled) end;
$$;

create function private.notify_subscription_state() returns trigger language plpgsql security definer set search_path='' as $$
declare n jsonb:=to_jsonb(new);o jsonb;v_user uuid;v_title text;v_message text;v_label text;v_key text;v_state jsonb;
begin
 if tg_op='UPDATE' then o:=to_jsonb(old);end if;
 v_state:=jsonb_build_array(n->'stripe_subscription_id',n->'status',n->'price_id',n->'tier',n->'current_period_start',n->'current_period_end',n->'cancel_at_period_end');
 if o is not null and v_state=jsonb_build_array(o->'stripe_subscription_id',o->'status',o->'price_id',o->'tier',o->'current_period_start',o->'current_period_end',o->'cancel_at_period_end') then return new;end if;
 if n->>'stripe_subscription_id' is null then return new;end if;
 v_label:=case when tg_table_name='subscriptions' then 'Careers+' else 'Business' end;
 if n->>'status'='canceled' then v_title:=v_label||' subscription ended';v_message:='Your subscription has ended. Review your account and invoices in Billing.';
 elsif (n->>'cancel_at_period_end')::boolean then v_title:=v_label||' cancellation scheduled';v_message:='Your subscription will not renew. Access ends on '||coalesce(to_char((n->>'current_period_end')::timestamptz at time zone 'UTC','DD Mon YYYY HH24:MI "UTC"'),'the date shown in Billing')||'.';
 elsif n->>'status' in ('past_due','unpaid','incomplete','incomplete_expired','paused') then v_title:=v_label||' subscription needs attention';v_message:='Your subscription status is '||replace(n->>'status','_',' ')||'. Review the details in Billing.';
 elsif o is null or o->>'stripe_subscription_id' is distinct from n->>'stripe_subscription_id' or o->>'status' not in ('active','trialing') then v_title:=v_label||' subscription confirmed';v_message:='Your subscription is '||(n->>'status')||'. Your plan, next billing date and invoices are available in Billing.';
 elsif (o->>'cancel_at_period_end')::boolean then v_title:=v_label||' renewal resumed';v_message:='The scheduled cancellation has been removed. Your subscription will renew on the date shown in Billing.';
 elsif o->>'price_id' is distinct from n->>'price_id' or o->>'tier' is distinct from n->>'tier' then v_title:=v_label||' plan changed';v_message:='Your subscription plan has changed. Review its price, allowance and next invoice in Billing.';
 elsif o->>'current_period_start' is distinct from n->>'current_period_start' then v_title:=v_label||' subscription renewed';v_message:='A new subscription period has started. Your current plan and invoices are available in Billing.';
 else v_title:=v_label||' billing schedule updated';v_message:='Your subscription billing dates have changed. Review the current dates in Billing.';end if;
 -- A later return to a previous state is still a new action; no-op reconciliations above do not notify.
 v_key:='state:'||(n->>'stripe_subscription_id')||':'||md5(v_state::text)||':'||extract(epoch from clock_timestamp())::text;
 if tg_table_name='subscriptions' then perform private.queue_billing_notice((n->>'user_id')::uuid,v_key,v_title,v_message);
 else for v_user in select user_id from public.organisation_members where organisation_id=(n->>'organisation_id')::uuid and role='owner' loop
 perform private.queue_billing_notice(v_user,v_key,v_title,v_message);end loop;end if;
 return new;
end;$$;
revoke all on function private.notify_subscription_state() from public,anon,authenticated;
create trigger subscription_notices after insert or update on public.subscriptions for each row execute function private.notify_subscription_state();
create trigger business_subscription_notices after insert or update on public.business_subscriptions for each row execute function private.notify_subscription_state();

create function private.notify_test_access() returns trigger language plpgsql security definer set search_path='' as $$
declare v_actor text;
begin
 if new.target_id is null then return new;end if;
 select email into v_actor from auth.users where id=new.actor_id;
 perform private.queue_billing_notice(new.target_id,'test:'||new.id::text,
 case when new.action='revoke' then 'Test plan access ended' else 'Test plan access updated' end,
 'Test access'||case when new.tier is not null then ' for '||replace(new.tier,'_',' ') else '' end||' was '||case when new.action='revoke' then 'revoked' else 'assigned' end||' by '||coalesce(v_actor,'an authorised administrator')||'. This is test access, not a paid purchase. Review its dates in Billing.');
 return new;
end;$$;
revoke all on function private.notify_test_access() from public,anon,authenticated;
create trigger test_access_notices after insert on private.testing_audit for each row execute function private.notify_test_access();

-- Called only after signature verification and event capture. Never resolve an owner from Stripe metadata.
create function public.record_billing_notice(p_event text,p_customer text,p_title text,p_message text) returns void language plpgsql security definer set search_path='' as $$
declare v_user uuid;
begin
 if length(p_title)>200 or length(p_message)>2000 or not exists(select 1 from public.stripe_events where id=p_event and type in ('invoice.paid','invoice.payment_failed','charge.refunded','customer.updated','customer.subscription.updated','payment_method.attached','payment_method.detached','checkout.session.completed','checkout.session.async_payment_succeeded')) then raise exception 'Verified billing event required' using errcode='22023';end if;
 for v_user in select user_id from public.billing_customers where stripe_customer_id=p_customer
 union select m.user_id from public.organisation_billing_accounts b join public.organisation_members m on m.organisation_id=b.organisation_id and m.role='owner' where b.stripe_customer_id=p_customer loop
 perform private.queue_billing_notice(v_user,'event:'||p_event,p_title,p_message);end loop;
end;$$;
revoke all on function public.record_billing_notice(text,text,text,text) from public,anon,authenticated;
grant execute on function public.record_billing_notice(text,text,text,text) to service_role;
