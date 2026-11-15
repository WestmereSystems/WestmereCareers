-- Saving an edit as a draft withdraws it from the publication queue.
begin;
create or replace function private.require_job_review() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if tg_op='UPDATE' and current_user='authenticated' and new.status is distinct from old.status then new.moderation_updated_at:=clock_timestamp(); end if;
  if current_user='authenticated' and (tg_op='INSERT' or
    row(new.title,new.location,new.city,new.state,new.category,new.work_mode,new.employment_type,new.salary_min,new.salary_max,new.salary_period,new.super_included,new.description,new.responsibilities,new.requirements,new.skills,new.external_url,new.expires_at)
      is distinct from row(old.title,old.location,old.city,old.state,old.category,old.work_mode,old.employment_type,old.salary_min,old.salary_max,old.salary_period,old.super_included,old.description,old.responsibilities,old.requirements,old.skills,old.external_url,old.expires_at)
    or (new.status='published' and old.status<>'published') or (new.publication_requested and not old.publication_requested)) then
    new.publication_requested:=new.publication_requested or new.status='published';
    new.status:='draft'; new.published_at:=null; new.moderation_status:='pending'; new.moderation_updated_at:=now();
  end if;
  return new;
end;
$$;
commit;
