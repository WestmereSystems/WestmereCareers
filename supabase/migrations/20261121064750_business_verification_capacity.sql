-- Pending reviews reserve a business slot. Invited memberships do not consume
-- the recipient's own subscription allowance; removed businesses release it.
create function private.business_registration_capacity(p_user uuid) returns jsonb
language sql volatile security invoker set search_path='' as $$
 with plan as (select private.account_business_tier(p_user) tier), counts as (
   select (select count(*) from public.organisation_members m join public.organisations o on o.id=m.organisation_id
     where m.user_id=p_user and m.role='owner' and o.removed_at is null)::integer owned,
   (select count(*) from public.employer_verification_requests v where v.applicant_id=p_user and v.status in('pending','needs_information'))::integer pending
 ) select jsonb_build_object('tier',plan.tier,'limit',private.business_plan_limit(plan.tier),
   'owned',counts.owned,'pending',counts.pending,'used',counts.owned+counts.pending,
   'remaining',greatest(0,private.business_plan_limit(plan.tier)-counts.owned-counts.pending),
   'canSubmit',counts.owned+counts.pending<private.business_plan_limit(plan.tier)) from plan cross join counts;
$$;
revoke all on function private.business_registration_capacity(uuid) from public,anon,authenticated;

create function private.my_business_registration_capacity() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in to view business capacity' using errcode='42501';end if;
 return private.business_registration_capacity(auth.uid());
end;$$;
revoke all on function private.my_business_registration_capacity() from public,anon;
grant execute on function private.my_business_registration_capacity() to authenticated;
create function public.my_business_registration_capacity() returns jsonb
language sql stable security invoker set search_path='' as $$select private.my_business_registration_capacity();$$;
revoke all on function public.my_business_registration_capacity() from public,anon;
grant execute on function public.my_business_registration_capacity() to authenticated;

create function private.enforce_business_review_capacity() returns trigger
language plpgsql security definer set search_path='' as $$
declare capacity jsonb;
begin
 if new.status not in('pending','needs_information') then return new;end if;
 -- A response to an existing review keeps its reserved slot, even after a downgrade.
 if tg_op='UPDATE' and old.applicant_id=new.applicant_id and old.status in('pending','needs_information') then return new;end if;
 perform pg_advisory_xact_lock(hashtextextended('business-review-capacity:'||new.applicant_id::text,0));
 capacity:=private.business_registration_capacity(new.applicant_id);
 if not (capacity->>'canSubmit')::boolean then
   raise exception 'Your subscription business capacity is full. Pending reviews also reserve a slot. Review your plan before submitting another business.' using errcode='23514';
 end if;
 return new;
end;$$;
revoke all on function private.enforce_business_review_capacity() from public,anon,authenticated;
create trigger enforce_business_review_capacity before insert or update of status,applicant_id
on public.employer_verification_requests for each row execute function private.enforce_business_review_capacity();
