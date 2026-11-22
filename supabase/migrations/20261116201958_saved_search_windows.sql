-- Saved searches and email digests use the same radius and listing-date filters as browsing.
alter table public.saved_searches add column distance integer check(distance in (5,10,25,50,100,250)),add column centre_lat double precision,add column centre_lon double precision,add column listed_within integer check(listed_within in (1,3,7,14,30,40)),add column listed_from date,add column listed_to date;
grant select(distance,centre_lat,centre_lon,listed_within,listed_from,listed_to) on public.saved_searches to authenticated;
create or replace function private.save_search(p_id uuid,p_name text,p_filters jsonb,p_alerts boolean,p_frequency text,p_consent boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_id uuid; v_old public.saved_searches%rowtype; v_keyword text; v_location text; v_work text[]; v_types text[]; v_salary numeric; v_direct boolean; v_reset boolean;v_distance integer;v_lat double precision;v_lon double precision;v_within integer;v_from date;v_to date;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if p_name is null or char_length(trim(p_name)) not between 2 and 100 or p_frequency is null or p_frequency not in ('daily','weekly') or p_alerts is null or p_filters is null or jsonb_typeof(p_filters)<>'object'
    or (p_filters-array['keyword','location','workMode','employmentType','minSalary','directOnly','distance','centreLat','centreLon','listedWithin','listedFrom','listedTo'])<>'{}'::jsonb then raise exception 'Invalid saved search' using errcode='22023'; end if;
  v_keyword:=coalesce(p_filters->>'keyword',''); v_location:=coalesce(p_filters->>'location','');
  if char_length(v_keyword)>120 or char_length(v_location)>120 or
    (p_filters ? 'workMode' and jsonb_typeof(p_filters->'workMode')<>'array') or
    (p_filters ? 'employmentType' and jsonb_typeof(p_filters->'employmentType')<>'array') then raise exception 'Invalid search filters' using errcode='22023'; end if;
  select coalesce(array_agg(distinct x),'{}') into v_work from jsonb_array_elements_text(coalesce(p_filters->'workMode','[]')) x;
  select coalesce(array_agg(distinct x),'{}') into v_types from jsonb_array_elements_text(coalesce(p_filters->'employmentType','[]')) x;
  if not(v_work <@ array['On-site','Hybrid','Remote']::text[]) or not(v_types <@ array['Full time','Part time','Contract','Casual']::text[]) then raise exception 'Invalid filters' using errcode='22023'; end if;
  if p_filters->>'minSalary' is not null then
    if jsonb_typeof(p_filters->'minSalary')<>'number' then raise exception 'Invalid salary' using errcode='22023'; end if;
    v_salary:=(p_filters->>'minSalary')::numeric;
    if v_salary<0 or v_salary>1000000 then raise exception 'Invalid salary' using errcode='22023'; end if;
  end if;
  if p_filters ? 'directOnly' and jsonb_typeof(p_filters->'directOnly')<>'boolean' then raise exception 'Invalid filter' using errcode='22023'; end if;
  v_direct:=coalesce((p_filters->>'directOnly')::boolean,false);
  v_distance:=(p_filters->>'distance')::integer;v_lat:=(p_filters->>'centreLat')::double precision;v_lon:=(p_filters->>'centreLon')::double precision;
  v_within:=(p_filters->>'listedWithin')::integer;v_from:=(p_filters->>'listedFrom')::date;v_to:=(p_filters->>'listedTo')::date;
  if (v_distance is not null and (v_distance not in (5,10,25,50,100,250) or v_lat is null or v_lon is null or v_lat not between -90 and 90 or v_lon not between -180 and 180)) or (v_within is not null and v_within not in (1,3,7,14,30,40)) or v_from>v_to then raise exception 'Invalid distance or listing dates' using errcode='22023';end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saved_search:'||v_user::text,0));
  if p_id is not null then
    select * into v_old from public.saved_searches where id=p_id and user_id=v_user for update;
    if not found then raise exception 'Search access denied' using errcode='42501'; end if;
  elsif (select count(*) from public.saved_searches where user_id=v_user)>=20 then raise exception 'Saved search limit reached' using errcode='P0001'; end if;
  v_reset:=p_id is null or not v_old.alerts_enabled or row(v_keyword,v_location,v_work,v_types,v_salary,v_direct,v_distance,v_lat,v_lon,v_within,v_from,v_to) is distinct from row(v_old.keyword,v_old.location,v_old.work_modes,v_old.employment_types,v_old.min_salary,v_old.direct_only,v_old.distance,v_old.centre_lat,v_old.centre_lon,v_old.listed_within,v_old.listed_from,v_old.listed_to);
  if p_alerts and ((v_reset and not coalesce(p_consent,false)) or not exists(select 1 from auth.users where id=v_user and email is not null and email_confirmed_at is not null)) then
    raise exception 'Confirm alerts for your verified account email' using errcode='22023'; end if;
  if p_alerts and exists(select 1 from private.alert_suppressions where user_id=v_user) then raise exception 'Email alerts are suppressed; contact support' using errcode='P0001'; end if;
  if p_id is null then
    insert into public.saved_searches(user_id,name,keyword,location,work_modes,employment_types,min_salary,direct_only,distance,centre_lat,centre_lon,listed_within,listed_from,listed_to,alerts_enabled,frequency,consent_at,next_run_at)
      values(v_user,trim(p_name),v_keyword,v_location,v_work,v_types,v_salary,v_direct,v_distance,v_lat,v_lon,v_within,v_from,v_to,p_alerts,p_frequency,case when p_alerts then now() end,
        case when p_alerts then now()+case p_frequency when 'daily' then interval '1 day' else interval '7 days' end end) returning id into v_id;
  else
    update public.saved_searches set name=trim(p_name),keyword=v_keyword,location=v_location,work_modes=v_work,employment_types=v_types,min_salary=v_salary,direct_only=v_direct,distance=v_distance,centre_lat=v_lat,centre_lon=v_lon,listed_within=v_within,listed_from=v_from,listed_to=v_to,
      alerts_enabled=p_alerts,frequency=p_frequency,consent_at=case when not p_alerts then null when v_reset then now() else consent_at end,
      next_run_at=case when not p_alerts then null when v_reset or frequency<>p_frequency then now()+case p_frequency when 'daily' then interval '1 day' else interval '7 days' end else next_run_at end,
      updated_at=now() where id=p_id returning id into v_id;
    update private.alert_outbox set status='canceled',error_code='PREFERENCES_CHANGED',lease_token=null,lease_expires_at=null
      where search_id=p_id and status in ('queued','leased') and (not p_alerts or v_reset);
  end if;
  return v_id;
end;
$$;

create or replace function private.job_matches_search(j public.jobs,s public.saved_searches) returns boolean language plpgsql stable security invoker set search_path='' as $$
declare v_location text:=trim(regexp_replace(lower(s.location),'[^a-z0-9 ]',' ','g')); v_city text; v_state text;
begin
  v_location:=regexp_replace(v_location,'\s+',' ','g'); v_city:=regexp_replace(v_location,' (vic|nsw|qld|sa|wa|tas|act|nt)$','');
  v_state:=substring(v_location from '(vic|nsw|qld|sa|wa|tas|act|nt)$');
  return j.status='published' and j.moderation_status='approved' and j.published_at<=now() and j.expires_at>now()
    and (s.keyword='' or j.search_vector @@ websearch_to_tsquery('english',s.keyword))
    and (s.distance is not null or s.location='' or (j.work_mode='Remote' and j.city='Anywhere in Australia') or
      (v_location in ('vic','nsw','qld','sa','wa','tas','act','nt') and lower(j.state)=v_location) or
      (v_location='anywhere in australia' and j.work_mode='Remote') or
      (v_location not in ('vic','nsw','qld','sa','wa','tas','act','nt','anywhere in australia') and lower(j.city) like '%'||v_city||'%' and (v_state is null or lower(j.state)=v_state)))
    and (s.distance is null or (j.work_mode='Remote' and j.city='Anywhere in Australia') or (j.latitude is not null and j.longitude is not null and 6371.0088*2*asin(sqrt(least(1.0,power(sin(radians(j.latitude-s.centre_lat)/2),2)+cos(radians(s.centre_lat))*cos(radians(j.latitude))*power(sin(radians(j.longitude-s.centre_lon)/2),2))))<=s.distance))
    and (s.listed_within is null or j.published_at>=now()-s.listed_within*interval '1 day')
    and (s.listed_from is null or j.published_at>=s.listed_from::timestamp at time zone 'UTC')
    and (s.listed_to is null or j.published_at<(s.listed_to+1)::timestamp at time zone 'UTC')
    and (cardinality(s.work_modes)=0 or j.work_mode=any(s.work_modes))
    and (cardinality(s.employment_types)=0 or j.employment_type=any(s.employment_types))
    and (s.min_salary is null or (j.salary_period='year' and j.salary_max>=s.min_salary))
    and (not s.direct_only or j.source='direct');
end;
$$;
