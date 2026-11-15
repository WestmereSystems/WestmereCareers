-- Hosted scheduling. PGlite/unit databases without provider extensions skip this block.
begin;
do $scheduler$
declare v_secret text;
begin
  if not exists(select 1 from pg_available_extensions where name='pg_cron') then return; end if;
  create extension if not exists pg_cron with schema pg_catalog;
  create extension if not exists pg_net with schema extensions;
  grant usage on schema cron to postgres;
  grant all privileges on all tables in schema cron to postgres;
  if not exists(select 1 from vault.secrets where name='westmere_alerts_cron_secret') then
    -- A dedicated 244-bit random dispatch credential, generated and kept inside the database.
    perform vault.create_secret(replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),'westmere_alerts_cron_secret','Westmere alerts-only dispatcher; never a database service key');
  end if;
  select decrypted_secret into strict v_secret from vault.decrypted_secrets where name='westmere_alerts_cron_secret';
  insert into private.alert_settings(singleton,site_origin,unsubscribe_origin,sending_enabled,dispatch_token_hash)
    values(true,'https://westmere-careers-git-codex-staging-order-ward.vercel.app','https://ldmwqupidlgrkkjjpcvn.supabase.co/functions/v1/westmere-alerts/unsubscribe',false,encode(sha256(convert_to(v_secret,'UTF8')),'hex'))
    on conflict(singleton) do update set dispatch_token_hash=excluded.dispatch_token_hash;
  execute $function$
    create function private.dispatch_job_alerts(p_dry_run boolean default false) returns bigint
    language plpgsql security definer set search_path='' as $body$
    declare v_request bigint;
    begin
      if not p_dry_run and not exists(select 1 from private.alert_settings where sending_enabled) then return null; end if;
      select net.http_post(
        url:='https://ldmwqupidlgrkkjjpcvn.supabase.co/functions/v1/westmere-alerts/dispatch',
        headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='westmere_alerts_cron_secret')),
        body:=jsonb_build_object('dryRun',p_dry_run),timeout_milliseconds:=30000) into v_request;
      return v_request;
    end;
    $body$;
  $function$;
  revoke all on function private.dispatch_job_alerts(boolean) from public,anon,authenticated;
  grant execute on function private.dispatch_job_alerts(boolean) to service_role;
  perform cron.schedule('westmere-job-alerts','*/5 * * * *','select private.dispatch_job_alerts(false);');
  perform cron.schedule('westmere-response-insights','17 * * * *','select public.refresh_response_insights();');
  -- Keep this project's scheduler history bounded; other projects are separate databases.
  perform cron.schedule('westmere-cron-history','41 3 * * *',
    $history$delete from cron.job_run_details where jobid in (select jobid from cron.job where jobname in ('westmere-job-alerts','westmere-response-insights','westmere-cron-history')) and end_time<now()-interval '14 days';$history$);
end;
$scheduler$;
commit;
