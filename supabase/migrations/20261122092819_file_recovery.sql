begin;
create table private.file_recovery_state (
 singleton boolean primary key default true check(singleton), lease uuid, lease_until timestamptz,
 started_at timestamptz, completed_at timestamptz, verified_at timestamptz,
 files integer, bytes bigint, last_error text
);
insert into private.file_recovery_state(singleton) values(true);
create table private.file_recovery_events (
 id bigint generated always as identity primary key, created_at timestamptz not null default now(),
 actor_id uuid, action text not null, detail jsonb not null default '{}'
);
alter table private.file_recovery_state enable row level security;
alter table private.file_recovery_events enable row level security;
revoke all on private.file_recovery_state,private.file_recovery_events from public,anon,authenticated;
grant all on private.file_recovery_state,private.file_recovery_events to service_role;
grant usage,select on sequence private.file_recovery_events_id_seq to service_role;

create function public.file_recovery_inventory() returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;begin
 if (select count(*) from storage.objects where bucket_id in('candidate-documents','application-documents','employer-assets') and archived_at is null and not coalesce(is_delete_marker,false))>5000 then raise exception 'Recovery inventory capacity exceeded';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'bucket',bucket_id,'path',name,'updatedAt',updated_at,'mime',coalesce(metadata->>'mimetype','application/octet-stream'),'bytes',case when metadata->>'size' ~ '^[0-9]+$' then (metadata->>'size')::bigint else 0 end) order by bucket_id,name),'[]') into result
 from storage.objects where bucket_id in('candidate-documents','application-documents','employer-assets') and archived_at is null and not coalesce(is_delete_marker,false) and name !~ '^__recovery_verify__/';
 return result;
end;$$;
create function public.file_recovery_control(p_action text,p_token uuid default null,p_actor uuid default null,p_detail jsonb default '{}') returns jsonb language plpgsql security invoker set search_path='' as $$
declare t uuid;begin
 if p_action='status' then return (select to_jsonb(s)-array['lease','lease_until'] from private.file_recovery_state s where singleton);end if;
 if p_action='acquire' then
  t:=gen_random_uuid();update private.file_recovery_state set lease=t,lease_until=clock_timestamp()+interval '6 minutes',started_at=clock_timestamp(),last_error=null where singleton and (lease_until is null or lease_until<=clock_timestamp());
  if not found then return null;end if;return to_jsonb(t);
 end if;
 if p_action in('complete','fail') then
  update private.file_recovery_state set lease=null,lease_until=null,
   completed_at=case when p_action='complete' then clock_timestamp() else completed_at end,
   verified_at=case when p_action='complete' and p_detail->>'verified'='true' then clock_timestamp() else verified_at end,
   files=case when p_action='complete' then (p_detail->>'files')::integer else files end,
   bytes=case when p_action='complete' then (p_detail->>'bytes')::bigint else bytes end,
   last_error=case when p_action='fail' then 'BACKUP_INCOMPLETE' else null end
   where singleton and lease=p_token;
  if not found then raise exception 'Recovery lease expired' using errcode='42501';end if;
 elsif p_action not in('restore','verify') then raise exception 'Unknown recovery action' using errcode='22023';end if;
 insert into private.file_recovery_events(actor_id,action,detail) values(p_actor,p_action,p_detail);
 return '{}'::jsonb;
end;$$;
create function public.file_recovery_restore_allowed(p_bucket text,p_path text) returns boolean language plpgsql stable security invoker set search_path='' as $$
begin
 if p_bucket='candidate-documents' then return exists(select 1 from public.candidate_cvs where storage_path=p_path);
 elsif p_bucket='application-documents' then return exists(select 1 from public.application_documents where storage_path=p_path);
 elsif p_bucket='employer-assets' then return exists(select 1 from public.organisations where removed_at is null and (avatar_path=p_path or banner_path=p_path)) or exists(select 1 from public.listing_documents where storage_path=p_path);
 end if;return false;
end;$$;
revoke all on function public.file_recovery_inventory(),public.file_recovery_control(text,uuid,uuid,jsonb),public.file_recovery_restore_allowed(text,text) from public,anon,authenticated;
grant execute on function public.file_recovery_inventory(),public.file_recovery_control(text,uuid,uuid,jsonb),public.file_recovery_restore_allowed(text,text) to service_role;
commit;
