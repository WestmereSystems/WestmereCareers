begin;
-- An OAuth identity must first be authenticated so the application can learn
-- its verified email. This does not admit it to Westmere: the existing account
-- gate continues to reject it until the trusted PKCE business callback prepares
-- its email admission. Direct email/password applicant signup remains blocked.
create or replace function public.before_user_created(event jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if coalesce(event->'user'->>'email','')<>'' then
  if private.launch_email_allowed(event->'user'->>'email') then return '{}'::jsonb;end if;
  -- app_metadata is supplied by Supabase Auth, unlike editable user_metadata.
  if event->'user'->'app_metadata'->>'provider' in('google','azure') then return '{}'::jsonb;end if;
 end if;
 return jsonb_build_object('error',jsonb_build_object('http_code',403,'message','Applicant registration opens when Westmere Careers launches. Employers and agencies must begin with business registration.'));
end;$$;
-- CREATE OR REPLACE retains the Auth-only execution permissions.
commit;
