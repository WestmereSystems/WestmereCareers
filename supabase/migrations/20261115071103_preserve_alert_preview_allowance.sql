-- Preserve the rolling preview allowance when a saved search is removed.
-- Additive only: no scheduler changes, bulk backfill or record deletion.
begin;
create table private.alert_preview_allowance (
  user_id uuid primary key references auth.users(id) on delete cascade,
  recent_requests timestamptz[] not null default '{}' check (cardinality(recent_requests)<=3)
);
alter table private.alert_preview_allowance enable row level security;
revoke all on private.alert_preview_allowance from public,anon,authenticated;
grant all on private.alert_preview_allowance to service_role;
create or replace function private.preview_search_alert(p_search uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.saved_searches%rowtype; v_email text; v_settings private.alert_settings%rowtype; v_id uuid; v_recent timestamptz[]; v_at timestamptz;
begin
  select * into s from public.saved_searches where id=p_search and user_id=(select auth.uid()) and alerts_enabled for update;
  if not found then raise exception 'Enable alerts for your saved search first' using errcode='42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('alert_preview:'||s.user_id::text,0));
  v_at:=clock_timestamp();
  -- Initialise lazily from retained requests; no bulk backfill or record deletion.
  insert into private.alert_preview_allowance(user_id,recent_requests)
    select s.user_id,coalesce(array_agg(created_at order by created_at),'{}'::timestamptz[]) from
      (select created_at from private.alert_outbox where user_id=s.user_id and kind='preview' and created_at>v_at-interval '1 day' order by created_at desc limit 3) retained
    on conflict(user_id) do nothing;
  select coalesce(array_agg(t order by t),'{}'::timestamptz[]) into v_recent
    from private.alert_preview_allowance a cross join lateral unnest(a.recent_requests) t
    where a.user_id=s.user_id and t>v_at-interval '1 day';
  if cardinality(v_recent)>=3 then raise exception 'Preview limit reached' using errcode='P0001'; end if;
  select * into v_settings from private.alert_settings where singleton and sending_enabled;
  if not found then raise exception 'Email delivery is being configured' using errcode='P0001'; end if;
  select email into v_email from auth.users where id=s.user_id and email_confirmed_at is not null;
  if v_email is null or exists(select 1 from private.alert_suppressions where user_id=s.user_id) then raise exception 'Email delivery unavailable' using errcode='P0001'; end if;
  insert into private.alert_outbox(search_id,user_id,recipient,kind,snapshot) values(s.id,s.user_id,v_email,'preview',
    jsonb_build_object('searchName',s.name,'jobs','[]'::jsonb,'siteOrigin',v_settings.site_origin,'unsubscribeUrl',v_settings.unsubscribe_origin||'?token='||s.unsubscribe_token::text)) returning id into v_id;
  update private.alert_preview_allowance set recent_requests=array_append(v_recent,v_at) where user_id=s.user_id;
  return v_id;
end;
$$;
commit;
