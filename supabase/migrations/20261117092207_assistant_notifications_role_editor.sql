-- Clearing the bell menu preserves the complete, owner-scoped notification history.
alter table public.notifications add column dismissed_at timestamptz;
grant update(dismissed_at) on public.notifications to authenticated;
create index notifications_menu on public.notifications(user_id,created_at desc,id desc) where dismissed_at is null;
create function private.resurface_updated_notice() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.created_at is distinct from old.created_at or new.title is distinct from old.title or new.message is distinct from old.message then new.dismissed_at:=null;end if;
 return new;
end;$$;
revoke all on function private.resurface_updated_notice() from public,anon,authenticated;
create trigger resurface_updated_notice before update on public.notifications for each row execute function private.resurface_updated_notice();

-- A missing salary is different from a zero salary. Either provide the whole range or neither end.
alter table public.jobs alter column salary_min drop not null, alter column salary_max drop not null;
alter table public.jobs add constraint jobs_salary_pair check ((salary_min is null) = (salary_max is null));
alter table public.jobs add column content_labels jsonb not null default '{}'::jsonb
 check (jsonb_typeof(content_labels)='object' and pg_column_size(content_labels)<=2000);
grant insert(content_labels),update(content_labels) on public.jobs to authenticated;

-- No prompts, CVs or generated answers are stored here. The server binds attempts to a hashed identity.
create table private.assistant_attempts(
 id uuid primary key,
 principal text not null check(principal ~ '^[a-f0-9]{64}$'),
 reservation_id uuid unique,
 paid boolean not null default false,
 status text not null check(status in ('pending','cancelled','completed')),
 created_at timestamptz not null default now()
);
create index assistant_attempt_identity on private.assistant_attempts(principal,created_at);
create index assistant_attempt_expiry on private.assistant_attempts(created_at);
alter table private.assistant_attempts enable row level security;
revoke all on private.assistant_attempts from public,anon,authenticated;
grant all on private.assistant_attempts to service_role;

create function public.register_assistant_attempt(p_attempt uuid,p_principal text,p_reservation uuid,p_paid boolean,p_user uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
declare a private.assistant_attempts%rowtype;
begin
 if p_principal !~ '^[a-f0-9]{64}$' or p_reservation is null then raise exception 'Invalid attempt' using errcode='22023';end if;
 if p_paid then
  if p_user is null or not exists(select 1 from public.ai_usage where id=p_reservation and user_id=p_user and status='reserved') then raise exception 'Invalid reservation' using errcode='42501';end if;
 elsif not exists(select 1 from public.ai_trial_usage where id=p_reservation and principal=p_principal and user_id is not distinct from p_user and status='reserved') then raise exception 'Invalid reservation' using errcode='42501';end if;
 delete from private.assistant_attempts where created_at<now()-interval '30 days';
 insert into private.assistant_attempts(id,principal,reservation_id,paid,status) values(p_attempt,p_principal,p_reservation,p_paid,'pending') on conflict(id) do nothing;
 select * into a from private.assistant_attempts where id=p_attempt for update;
 if a.principal<>p_principal or (a.reservation_id is not null and a.reservation_id<>p_reservation) then raise exception 'Attempt already used' using errcode='42501';end if;
 -- A Stop action may arrive before generation finishes reserving its allowance.
 if a.status='cancelled' then return false;end if;
 if a.status<>'pending' then raise exception 'Attempt already completed' using errcode='22023';end if;
 update private.assistant_attempts set reservation_id=p_reservation,paid=p_paid where id=p_attempt;
 return true;
end;$$;

create function public.cancel_assistant_attempt(p_attempt uuid,p_principal text) returns text
language plpgsql security invoker set search_path='' as $$
declare a private.assistant_attempts%rowtype;
begin
 if p_principal !~ '^[a-f0-9]{64}$' then raise exception 'Invalid identity' using errcode='22023';end if;
 if (select count(*) from private.assistant_attempts where principal=p_principal and created_at>now()-interval '1 hour')>=100 then raise exception 'Too many requests' using errcode='54000';end if;
 insert into private.assistant_attempts(id,principal,status) values(p_attempt,p_principal,'cancelled') on conflict(id) do nothing;
 select * into a from private.assistant_attempts where id=p_attempt for update;
 if a.principal<>p_principal then raise exception 'Attempt unavailable' using errcode='42501';end if;
 if a.status='completed' then return 'completed';end if;
 if a.paid then update public.ai_usage set status='failed',settled_at=now() where id=a.reservation_id and status='reserved';
 else update public.ai_trial_usage set status='failed',settled_at=now() where id=a.reservation_id and status='reserved';end if;
 update private.assistant_attempts set status='cancelled' where id=p_attempt;
 return 'cancelled';
end;$$;

create function public.assistant_attempt_active(p_attempt uuid,p_principal text) returns boolean
language sql security invoker set search_path='' as $$select exists(select 1 from private.assistant_attempts where id=p_attempt and principal=p_principal and status='pending');$$;

create function public.complete_assistant_attempt(p_attempt uuid,p_principal text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare a private.assistant_attempts%rowtype;done boolean;
begin
 select * into a from private.assistant_attempts where id=p_attempt and principal=p_principal for update;
 if not found or a.status<>'pending' then return false;end if;
 if a.paid then
  update public.ai_usage set status='completed',settled_at=now() where id=a.reservation_id and status='reserved' and created_at>now()-interval '15 minutes';done:=found;
 else done:=public.settle_trial_ai_usage(a.reservation_id,true);end if;
 if done then update private.assistant_attempts set status='completed' where id=p_attempt;end if;
 return done;
end;$$;
revoke all on function public.register_assistant_attempt(uuid,text,uuid,boolean,uuid),public.cancel_assistant_attempt(uuid,text),public.assistant_attempt_active(uuid,text),public.complete_assistant_attempt(uuid,text) from public,anon,authenticated;
grant execute on function public.register_assistant_attempt(uuid,text,uuid,boolean,uuid),public.cancel_assistant_attempt(uuid,text),public.assistant_attempt_active(uuid,text),public.complete_assistant_attempt(uuid,text) to service_role;

