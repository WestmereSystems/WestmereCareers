begin;

-- Privileged Auth metadata designates billing testers; ordinary account/profile
-- changes cannot opt an account into test billing. This grants no staff role,
-- sample-workspace access, verification or publication permission.
create function private.is_billing_test_account(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.is_sandbox_owner(p_user) or exists(
  select 1 from auth.users u
  join private.test_account_allowlist a on a.email=lower(u.email)
  where u.id=p_user and u.email_confirmed_at is not null
  and coalesce(to_jsonb(u)->'raw_app_meta_data','{}'::jsonb)
      @> '{"westmere_billing_test":true}'::jsonb
 );
$$;
revoke all on function private.is_billing_test_account(uuid) from public,anon,authenticated;
grant execute on function private.is_billing_test_account(uuid) to service_role;

-- Keep manual test-tier assignment and sample workspaces restricted to their
-- existing operators. Only payment-backed sandbox entitlement checks expand.
do $$declare v text; f text; needle text; replacement text;begin
 for f,needle,replacement in select * from(values
  ('private.account_business_tier(uuid)',
   '(b.livemode or private.is_sandbox_owner(p_user))',
   '(b.livemode or private.is_billing_test_account(p_user))'),
  ('private.my_enterprise_careers_access()',
   '(b.livemode or private.is_sandbox_owner(auth.uid()))',
   '(b.livemode or private.is_billing_test_account(auth.uid()))'),
  ('private.personal_subscription_current(uuid)',
   '(s.livemode or private.is_sandbox_owner(p_user))',
   '(s.livemode or private.is_billing_test_account(p_user))'),
  ('public.archive_individual_test_billing(uuid,uuid)',
   'or private.is_sandbox_owner(p_user) then',
   'or private.is_billing_test_account(p_user) then')
 ) rules(name,old_text,new_text) loop
  select pg_get_functiondef(f::regprocedure) into v;
  if position(needle in v)=0 then raise exception 'Unexpected billing definition: %',f;end if;
  execute replace(v,needle,replacement);
 end loop;
end;$$;

-- Durable in-app notices remain accessible after the company itself is hidden.
-- Email is deliberately off: removal logging does not enqueue any email.
create function private.queue_business_removal_notice(p_org uuid) returns void
language plpgsql security definer set search_path='' as $$
declare o public.organisations%rowtype; recipient record; event_key text;begin
 select * into o from public.organisations where id=p_org and removed_at is not null;
 if not found then return;end if;
 event_key:='business-removed:'||o.id::text||':'||to_char(o.removed_at at time zone 'UTC','YYYYMMDDHH24MISS.US');
 for recipient in
  select user_id from public.organisation_members where organisation_id=o.id
  union select user_id from private.staff_members where enabled and role='admin'
 loop
  perform private.queue_account_notice(recipient.user_id,event_key,
   'Business removed: '||left(o.name,170),
   o.name||' was removed from Westmere on '||to_char(o.removed_at at time zone 'Australia/Melbourne','DD Mon YYYY, HH24:MI')||' (Melbourne time). Its company profile and vacancies are hidden, and the team no longer has hiring access. Application, statistics and audit records are retained under the Privacy Policy. This does not delete your account or cancel a Stripe subscription.',
   '/account',false);
 end loop;
end;$$;
revoke all on function private.queue_business_removal_notice(uuid) from public,anon,authenticated;
grant execute on function private.queue_business_removal_notice(uuid) to service_role;

create function private.notify_business_removed() returns trigger
language plpgsql security definer set search_path='' as $$begin
 perform private.queue_business_removal_notice(new.id);return new;
end;$$;
revoke all on function private.notify_business_removed() from public,anon,authenticated;
create trigger business_removed_notice after update of removed_at on public.organisations
for each row when(old.removed_at is null and new.removed_at is not null)
execute function private.notify_business_removed();

-- A retried successful removal must preserve its original time and avoid
-- duplicate audit/notification entries. Owner and name checks still apply.
do $$declare v text; needle text;begin
 select pg_get_functiondef('private.remove_company(uuid,text)'::regprocedure) into v;
 needle:='if p_name is distinct from o.name then raise exception ''Enter the exact business name to confirm removal'' using errcode=''22023'';end if;';
 if position(needle in v)=0 then raise exception 'Unexpected company-removal definition';end if;
 execute replace(v,needle,needle||E'\n if o.removed_at is not null then return;end if;');
end;$$;

commit;
