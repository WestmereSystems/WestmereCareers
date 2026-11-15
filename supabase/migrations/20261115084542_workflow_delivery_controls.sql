begin;
create table private.document_upload_limits (
 user_id uuid primary key references auth.users(id) on delete cascade,
 attempt_times timestamptz[] not null default '{}',lease_token uuid,lease_expires_at timestamptz
);
alter table private.document_upload_limits enable row level security;
revoke all on private.document_upload_limits from public,anon,authenticated;grant all on private.document_upload_limits to service_role;
create function public.reserve_document_upload(p_user uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare v_times timestamptz[];v_lease uuid:=gen_random_uuid();v_expires timestamptz;
begin
 if not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null) then raise exception 'Verified account required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('document-upload:'||p_user::text,0));
 insert into private.document_upload_limits(user_id) values(p_user) on conflict do nothing;
 select lease_expires_at into v_expires from private.document_upload_limits where user_id=p_user;
 if v_expires>now() then raise exception 'An upload is already being processed' using errcode='P0001';end if;
 select coalesce(array_agg(t),'{}'::timestamptz[]) into v_times from private.document_upload_limits u cross join lateral unnest(u.attempt_times) t where u.user_id=p_user and t>now()-interval '1 day';
 if cardinality(v_times)>=60 then raise exception 'Daily upload limit reached' using errcode='P0001';end if;
 update private.document_upload_limits set attempt_times=array_append(v_times,now()),lease_token=v_lease,lease_expires_at=now()+interval '90 seconds' where user_id=p_user;
 return v_lease;
end; $$;
revoke all on function public.reserve_document_upload(uuid) from public,anon,authenticated;grant execute on function public.reserve_document_upload(uuid) to service_role;
create function public.release_document_upload(p_user uuid,p_lease uuid) returns void language sql security definer set search_path='' as $$
 update private.document_upload_limits set lease_token=null,lease_expires_at=null where user_id=p_user and lease_token=p_lease;
$$;
revoke all on function public.release_document_upload(uuid,uuid) from public,anon,authenticated;grant execute on function public.release_document_upload(uuid,uuid) to service_role;
create function private.request_sample_notification(p_application uuid,p_email boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.sample_applications%rowtype; v_key text; v_notice uuid; v_message text;
begin
 if not private.has_sample_workspace() then raise exception 'Invited verified account required' using errcode='42501';end if;
 select * into a from public.sample_applications where id=p_application and user_id=auth.uid();
 if not found then raise exception 'Sample application not found' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('sample-preview:'||auth.uid()::text,0));
 if p_email and (select count(*) from private.alert_outbox where user_id=auth.uid() and event_key like 'sample-preview:%' and created_at>now()-interval '1 day')>=3 then raise exception 'You can send up to three sample previews per day' using errcode='P0001';end if;
 v_key:='sample-preview:'||gen_random_uuid()::text;
 v_message:='Synthetic application stage: '||replace(a.status,'_',' ')||'. This is a requested preview; no real applicant has been contacted.';
 perform private.queue_account_notice(auth.uid(),v_key,'Sample application · '||replace(a.status,'_',' '),v_message,'/employers/sample',p_email);
 update private.alert_outbox set snapshot=jsonb_set(snapshot,'{message}',to_jsonb(v_message)) where user_id=auth.uid() and event_key=v_key;
 select id into v_notice from public.notifications where user_id=auth.uid() and event_key=v_key;
 return v_notice;
end; $$;
revoke all on function private.request_sample_notification(uuid,boolean) from public,anon;
grant execute on function private.request_sample_notification(uuid,boolean) to authenticated;
create function public.request_sample_notification(p_application uuid,p_email boolean default false) returns uuid language sql security invoker set search_path='' as $$ select private.request_sample_notification(p_application,p_email); $$;
revoke all on function public.request_sample_notification(uuid,boolean) from public,anon;
grant execute on function public.request_sample_notification(uuid,boolean) to authenticated;
create or replace function private.notify_application_activity() returns trigger language plpgsql security definer set search_path='' as $$
declare a public.applications%rowtype; m record; v_email boolean; v_title text;
begin
 select * into a from public.applications where id=new.application_id;
 if new.event_type not in ('received','opened','employer_update','decision') or a.withdrawn_at is not null then return new; end if;
 select application_email_enabled into v_email from public.profiles where id=a.candidate_id;
 v_title:=case
 when new.event_type='received' then 'Application received'
 when new.event_type='opened' then 'Application opened'
 when new.message='This vacancy has closed. Your recorded application stage remains available; closure does not itself mean a rejection.' then 'Vacancy closed'
 when a.status='interview' then 'Interview selection update'
 when a.status='shortlisted' then 'Application shortlisted'
 when a.status='offer' then 'Application offer update'
 when a.status='not_proceeding' then 'Application decision'
 else 'Application updated' end;
 perform private.queue_account_notice(a.candidate_id,'application:'||new.id,v_title,a.job_title_snapshot||' · '||left(new.message,1500),'/applications',coalesce(v_email,true));
 if new.event_type='received' then
  for m in select om.user_id from public.organisation_members om join public.jobs j on j.organisation_id=om.organisation_id join public.organisations o on o.id=om.organisation_id where j.id=a.job_id and om.role in ('owner','admin','recruiter') and o.suspended_at is null loop
   -- One unread card per role groups applications; employers receive no per-application email.
   insert into public.notifications(user_id,event_key,title,message,path) values(m.user_id,'hiring:'||a.job_id,'New applications to review',a.job_title_snapshot||' has new applications. Open your hiring workspace to review them.','/employers/dashboard')
   on conflict(user_id,event_key) do update set read_at=null,created_at=now(),message=excluded.message;
  end loop;
 end if;
 return new;
end; $$;

commit;
