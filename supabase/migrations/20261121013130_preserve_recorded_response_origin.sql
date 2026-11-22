-- Preserve the recorded origin of submitted applications if a listing later changes its application method.
begin;
create or replace function private.submit_response_report_internal(p_application_id uuid,p_organisation_id uuid,p_job_reference text,p_application_date timestamptz,p_response_received boolean,p_response_date timestamptz) returns uuid language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();j public.jobs%rowtype;a public.applications%rowtype;v_title text;v_date timestamptz;v_response timestamptz;v_corroborated boolean;v_id uuid;
begin
 if u is null then raise exception 'Sign in required' using errcode='42501';end if;
 if p_response_received is null then raise exception 'Choose a response option' using errcode='22023';end if;
 if p_application_id is not null then
  select * into a from public.applications where id=p_application_id and candidate_id=u;
  if not found then raise exception 'Application access denied' using errcode='42501';end if;
  select * into j from public.jobs where id=a.job_id;
 else
  select * into j from public.jobs where id::text=p_job_reference and organisation_id=p_organisation_id and published_at>=now()-interval '6 months' and published_at<=now();
  if not found then raise exception 'Select a role published in the last six months' using errcode='22023';end if;
  if j.source='direct' then
   select * into a from public.applications where job_id=j.id and candidate_id=u order by created_at desc limit 1;
   if not found then raise exception 'Your recorded application is required' using errcode='42501';end if;
  end if;
 end if;
 v_date:=case when a.id is not null then a.created_at else p_application_date end;
 if v_date is null or v_date>now() or (p_response_received and (p_response_date is null or p_response_date<v_date or p_response_date>now())) or (not p_response_received and p_response_date is not null) then raise exception 'Check the application and response dates' using errcode='22023';end if;
 v_title:=lower(regexp_replace(trim(j.title),'\s+',' ','g'));
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('response_report:'||u::text,0));
 if exists(select 1 from public.response_reports r left join public.applications old_a on old_a.id=r.application_id left join public.jobs old_j on old_j.id=old_a.job_id where r.candidate_id=u and r.organisation_id=j.organisation_id and (r.review_title_key=v_title or lower(regexp_replace(trim(r.job_reference),'\s+',' ','g'))=v_title or lower(regexp_replace(trim(old_j.title),'\s+',' ','g'))=v_title)) then raise exception 'You have already reviewed this job title' using errcode='23505';end if;
 if (select count(*) from public.response_reports where candidate_id=u and created_at>now()-interval '7 days')>=100 then raise exception 'Report limit reached' using errcode='P0001';end if;
 if a.id is not null then
  select min(occurred_at) into v_response from public.application_events where application_id=a.id and meaningful_response;
  v_corroborated:=case when p_response_received then v_response is not null and (p_response_date at time zone 'Australia/Melbourne')::date=(v_response at time zone 'Australia/Melbourne')::date else v_response is null end;
 end if;
 insert into public.response_reports(candidate_id,application_id,organisation_id,job_reference,application_date,response_date,response_received,evidence_source,review_job_id,review_title_key,corroborated,moderation_status)
 values(u,a.id,j.organisation_id,j.title,v_date,p_response_date,p_response_received,case when a.id is not null then 'direct_application' else 'external_application' end,j.id,v_title,v_corroborated,case when v_corroborated then 'accepted' else 'pending' end) returning id into v_id;
 return v_id;
end;$$;

create or replace function private.response_cohort(p_org uuid,p_as_of timestamptz) returns table(candidate_id uuid,application_date timestamptz,response_date timestamptz,evidence_source text) language sql stable security definer set search_path='' as $$
 with evidence as (
 select a.candidate_id,a.created_at as application_date,(select min(e.occurred_at) from public.application_events e where e.application_id=a.id and e.meaningful_response and e.occurred_at<=p_as_of) as response_date,'direct_application'::text as evidence_source
 from public.applications a join public.jobs j on j.id=a.job_id where j.organisation_id=p_org and a.withdrawn_at is null
 union all
 select r.candidate_id,r.application_date,r.response_date,'external_application' from public.response_reports r where r.organisation_id=p_org and r.evidence_source='external_application' and r.moderation_status='accepted' and r.confirmed_at<=p_as_of and (r.response_received or r.confirmed_at>=p_as_of-interval '30 days')
 ) select e.* from evidence e where e.application_date>=((((p_as_of at time zone 'Australia/Melbourne')::date-interval '6 months')::date)::timestamp at time zone 'Australia/Melbourne') and e.application_date<((((p_as_of at time zone 'Australia/Melbourne')::date-interval '3 months')::date)::timestamp at time zone 'Australia/Melbourne')
 and not exists(select 1 from public.organisation_members m where m.organisation_id=p_org and m.user_id=e.candidate_id);
$$;
commit;
