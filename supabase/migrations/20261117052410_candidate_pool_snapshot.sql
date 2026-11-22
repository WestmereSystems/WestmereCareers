-- A pool confirmation must refer to exactly the active applications the employer reviewed.
-- New submissions or withdrawals between review and confirmation require a fresh review.
drop function public.finalise_candidate_pool(uuid,uuid[]);
alter function private.finalise_candidate_pool(uuid,uuid[]) rename to finalise_candidate_pool_before_snapshot_check;
revoke all on function private.finalise_candidate_pool_before_snapshot_check(uuid,uuid[]) from public,anon,authenticated;
create function private.finalise_candidate_pool(p_job uuid,p_selected uuid[],p_reviewed uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare org uuid;current_ids uuid[];reviewed_ids uuid[];
begin
 select organisation_id into org from public.jobs where id=p_job for update;
 if not found or not private.is_active_hiring_team(org) then raise exception 'Verified hiring access required' using errcode='42501';end if;
 if p_reviewed is null or cardinality(p_reviewed)>1000 then raise exception 'Review the complete active candidate list before confirming the pool' using errcode='22023';end if;
 -- The job lock serialises new submissions; application locks serialise withdrawals.
 perform 1 from public.applications where job_id=p_job order by id for update;
 select coalesce(array_agg(id order by id),'{}'::uuid[]) into current_ids from public.applications where job_id=p_job and withdrawn_at is null;
 select coalesce(array_agg(distinct id order by id),'{}'::uuid[]) into reviewed_ids from unnest(p_reviewed) ids(id);
 if current_ids is distinct from reviewed_ids then raise exception 'The active candidate list has changed or is incomplete. Refresh and review it before confirming the pool.' using errcode='22023';end if;
 return private.finalise_candidate_pool_before_snapshot_check(p_job,p_selected);
end;$$;
revoke all on function private.finalise_candidate_pool(uuid,uuid[],uuid[]) from public,anon;grant execute on function private.finalise_candidate_pool(uuid,uuid[],uuid[]) to authenticated;
create function public.finalise_candidate_pool(p_job uuid,p_selected uuid[],p_reviewed uuid[]) returns jsonb language sql security invoker set search_path='' as $$select private.finalise_candidate_pool(p_job,p_selected,p_reviewed);$$;
revoke all on function public.finalise_candidate_pool(uuid,uuid[],uuid[]) from public,anon;grant execute on function public.finalise_candidate_pool(uuid,uuid[],uuid[]) to authenticated;
