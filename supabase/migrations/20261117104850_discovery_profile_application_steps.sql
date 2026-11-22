-- All consented aggregate counts are visible to the authorised organisation,
-- including single recognised-keyword events. Raw query text is never recorded.
create or replace function public.read_discovery_by_region(p_org uuid,p_days integer,p_region text default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare d date:=(now() at time zone 'Australia/Melbourne')::date-(least(greatest(p_days,1),365)-1); result jsonb;
begin
 if p_region is not null and p_region not in ('ACT','NSW','NT','QLD','SA','TAS','VIC','WA','OTHER','UNKNOWN') then raise exception 'Invalid region';end if;
 with activity as (select * from private.discovery_daily where organisation_id=p_org and day>=d),
 scoped as (select * from activity where p_region is null or region=p_region),
 kr as (select keyword,region,sum(events)::integer count from scoped where kind='search' and keyword<>'' group by keyword,region),
 top_regions as (select *,row_number() over(partition by keyword order by count desc,region) as position from kr)
 select jsonb_build_object(
 'totals',coalesce((select jsonb_agg(x) from(select kind,sum(events)::integer count from scoped group by kind)x),'[]'::jsonb),
 'regions',coalesce((select jsonb_agg(x order by x.region) from(select region,sum(events)::integer count,coalesce(sum(events) filter(where kind='search'),0)::integer searches,coalesce(sum(events) filter(where kind='listing'),0)::integer listing,coalesce(sum(events) filter(where kind='profile'),0)::integer profile from activity group by region)x),'[]'::jsonb),
 'keywords',coalesce((select jsonb_agg(x order by x.count desc,x.keyword) from(select k.keyword,sum(k.count)::integer count,t.region as "topRegion",t.count as "topRegionCount" from kr k join top_regions t on t.keyword=k.keyword and t.position=1 group by k.keyword,t.region,t.count)x),'[]'::jsonb),
 'keywordRegions',coalesce((select jsonb_agg(kr order by count desc,keyword,region) from kr),'[]'::jsonb),
 'selectedRegion',p_region) into result;
 return result;
end;$$;
revoke all on function public.read_discovery_by_region(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.read_discovery_by_region(uuid,integer,text) to service_role;

-- Existing rows retain their display name; explicit parts support future edits.
alter table public.profiles add column first_name text not null default '' check(length(first_name)<=120),add column last_name text not null default '' check(length(last_name)<=120),add column social_links jsonb not null default '{}' check(jsonb_typeof(social_links)='object' and pg_column_size(social_links)<=3000);
update public.profiles set first_name=split_part(trim(coalesce(full_name,'')),' ',1),last_name=case when position(' ' in trim(coalesce(full_name,'')))>0 then substring(trim(full_name) from position(' ' in trim(full_name))+1) else '' end;
grant insert(first_name,last_name,social_links),update(first_name,last_name,social_links) on public.profiles to authenticated;

-- Application uploads are private until an atomic submission claims them.
create table public.application_uploads(
 id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
 filename text not null,storage_path text not null unique,media_type text not null,bytes integer not null check(bytes between 1 and 4194304),
 kind text not null check(kind in ('cover_letter','supporting','certification','licence','right_to_work')),
 extracted_text text not null default '',created_at timestamptz not null default now()
);
create index application_upload_owner on public.application_uploads(user_id,created_at);
alter table public.application_uploads enable row level security;
revoke all on public.application_uploads from public,anon,authenticated;
grant all on public.application_uploads to service_role;
alter table public.application_documents add column kind text not null default 'cv' check(kind in ('cv','cover_letter','supporting','certification','licence','right_to_work'));

-- Dynamic identity is disclosed only through an authorised intentional application
-- open. Submitted CVs, letters, declarations and documents remain immutable.
create or replace function private.open_application_internal(p_application_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a jsonb;p jsonb;
begin
 if not exists(select 1 from public.applications a join public.jobs j on j.id=a.job_id where a.id=p_application_id and private.is_active_hiring_team(j.organisation_id)) then raise exception 'Hiring access unavailable' using errcode='42501';end if;
 a:=private.open_application_before_trust(p_application_id);
 select jsonb_build_object('first_name',p.first_name,'last_name',p.last_name,'full_name',p.full_name,'email',u.email,'social_links',p.social_links,'updated_at',p.updated_at) into p from public.profiles p join auth.users u on u.id=p.id where p.id=(a->>'candidate_id')::uuid;
 return a||jsonb_build_object('candidate_profile',p);
end;$$;
revoke all on function private.open_application_internal(uuid) from public,anon;
grant execute on function private.open_application_internal(uuid) to authenticated;
create or replace function private.list_job_applications_internal(p_job_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.jobs j where j.id=p_job_id and private.is_active_hiring_team(j.organisation_id)) then raise exception 'Hiring access unavailable' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(s order by s.created_at desc),'[]') from(select a.id,a.job_id,a.status,a.created_at,a.withdrawn_at,case when a.withdrawn_at is null then coalesce(p.full_name,a.candidate_name_snapshot) else null end candidate_name from public.applications a left join public.profiles p on p.id=a.candidate_id where a.job_id=p_job_id order by a.created_at desc limit 1000)s);
end;$$;

create function public.submit_application_bundle(p_id uuid,p_candidate uuid,p_job uuid,p_cv text,p_letter text,p_answers jsonb,p_document jsonb,p_uploads uuid[]) returns jsonb language plpgsql security invoker set search_path='' as $$
declare a jsonb;u public.application_uploads%rowtype;claimed integer:=0;
begin
 if cardinality(p_uploads)>8 or cardinality(p_uploads)<>(select count(distinct x) from unnest(p_uploads)x) then raise exception 'Choose up to eight different documents' using errcode='22023';end if;
 if (select count(*) from public.application_uploads where id=any(p_uploads) and user_id=p_candidate and kind='cover_letter')>1 then raise exception 'Choose one cover letter' using errcode='22023';end if;
 select coalesce((select extracted_text from public.application_uploads where id=any(p_uploads) and user_id=p_candidate and kind='cover_letter'),p_letter) into p_letter;
 a:=public.submit_application_material(p_id,p_candidate,p_job,p_cv,p_letter,p_answers,p_document);
 for u in select * from public.application_uploads where id=any(p_uploads) and user_id=p_candidate for update loop
  if u.created_at<now()-interval '24 hours' then raise exception 'Upload expired; upload it again' using errcode='22023';end if;
  insert into public.application_documents(application_id,filename,storage_path,media_type,bytes,kind) values(p_id,u.filename,u.storage_path,u.media_type,u.bytes,u.kind);
  delete from public.application_uploads where id=u.id;claimed:=claimed+1;
 end loop;
 if claimed<>cardinality(p_uploads) then raise exception 'An attachment is unavailable' using errcode='22023';end if;
 return a;
end;$$;
revoke all on function public.submit_application_bundle(uuid,uuid,uuid,text,text,jsonb,jsonb,uuid[]) from public,anon,authenticated;
grant execute on function public.submit_application_bundle(uuid,uuid,uuid,text,text,jsonb,jsonb,uuid[]) to service_role;
create function public.remove_application_upload(p_id uuid,p_user uuid) returns text language plpgsql security invoker set search_path='' as $$
declare p text;
begin
 select storage_path into p from public.application_uploads where id=p_id and user_id=p_user for update;
 if not found then raise exception 'Attachment unavailable' using errcode='42501';end if;
 delete from public.application_uploads where id=p_id and user_id=p_user;return p;
end;$$;
revoke all on function public.remove_application_upload(uuid,uuid) from public,anon,authenticated;
grant execute on function public.remove_application_upload(uuid,uuid) to service_role;
create function private.clear_deleted_base_cv() returns trigger language plpgsql security invoker set search_path='' as $$
begin update public.profiles set active_cv_id=null,cv_text='',updated_at=now() where id=old.user_id and active_cv_id=old.id;return old;end;$$;
revoke all on function private.clear_deleted_base_cv() from public,anon,authenticated;
create trigger clear_deleted_base_cv before delete on public.candidate_cvs for each row execute function private.clear_deleted_base_cv();

-- Storage deletion is retried by the existing authenticated maintenance worker.
create table public.document_cleanup(storage_path text primary key,created_at timestamptz not null default now());
alter table public.document_cleanup enable row level security;
revoke all on public.document_cleanup from public,anon,authenticated;
grant all on public.document_cleanup to service_role;
create or replace function public.remove_application_upload(p_id uuid,p_user uuid) returns text language plpgsql security invoker set search_path='' as $$
declare p text;
begin
 select storage_path into p from public.application_uploads where id=p_id and user_id=p_user for update;
 if not found then raise exception 'Attachment unavailable' using errcode='42501';end if;
 insert into public.document_cleanup(storage_path) values(p) on conflict do nothing;
 delete from public.application_uploads where id=p_id and user_id=p_user;return p;
end;$$;
create function public.expire_application_uploads() returns setof public.document_cleanup language plpgsql security invoker set search_path='' as $$
declare u public.application_uploads%rowtype;
begin
 for u in select * from public.application_uploads where created_at<now()-interval '24 hours' order by created_at limit 50 for update skip locked loop
  insert into public.document_cleanup(storage_path) values(u.storage_path) on conflict do nothing;
  delete from public.application_uploads where id=u.id;
 end loop;
 return query select * from public.document_cleanup order by created_at limit 50;
end;$$;
revoke all on function public.expire_application_uploads() from public,anon,authenticated;
grant execute on function public.expire_application_uploads() to service_role;
alter table public.jobs add column is_test boolean not null default false;
alter table public.organisations add column is_test boolean not null default false;

create or replace function public.read_discovery(p_org uuid,p_days integer) returns jsonb language sql security invoker set search_path='' as $$select public.read_discovery_by_region(p_org,p_days,null);$$;
revoke all on function public.read_discovery(uuid,integer) from public,anon,authenticated;
grant execute on function public.read_discovery(uuid,integer) to service_role;
-- Keep OAuth/onboarding display names and explicitly edited name parts in sync.
create function private.sync_profile_name() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' and (new.first_name is distinct from old.first_name or new.last_name is distinct from old.last_name) then
  new.full_name:=trim(concat_ws(' ',nullif(trim(new.first_name),''),nullif(trim(new.last_name),'')));
 elsif (tg_op='INSERT' and new.first_name='' and coalesce(new.full_name,'')<>'') or (tg_op='UPDATE' and new.full_name is distinct from old.full_name) then
  new.first_name:=split_part(trim(coalesce(new.full_name,'')),' ',1);
  new.last_name:=case when position(' ' in trim(coalesce(new.full_name,'')))>0 then substring(trim(new.full_name) from position(' ' in trim(new.full_name))+1) else '' end;
 elsif tg_op='INSERT' and new.first_name<>'' then new.full_name:=trim(concat_ws(' ',new.first_name,nullif(new.last_name,'')));
 end if;return new;
end;$$;
revoke all on function private.sync_profile_name() from public,anon,authenticated;
create trigger sync_profile_name before insert or update of full_name,first_name,last_name on public.profiles for each row execute function private.sync_profile_name();
