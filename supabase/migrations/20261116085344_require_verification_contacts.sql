-- Reject omitted contacts on direct RPC calls as well as validated application requests.
begin;
create or replace function private.submit_business_verification(p_request_id uuid,p_name text,p_abn text,p_website text,p_contact_role text,p_evidence text,p_linkedin text,p_hr_email text,p_hr_phone text,p_contact_source text,p_contact_permission boolean)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
 if auth.uid() is null or p_linkedin is null or p_hr_email is null or p_hr_phone is null or p_contact_source is null or not coalesce(p_contact_permission,false) or p_linkedin !~ '^https://([a-z]+[.])?linkedin[.]com/' or p_hr_email !~ '^[^ @]+@[^ @]+[.][^ @]+$' or length(p_hr_phone) not between 6 and 40 or p_contact_source !~ '^https://[^ /]+' then raise exception 'Public verification contacts and permission are required' using errcode='22023'; end if;
 v_id:=private.submit_employer_verification(p_name,p_abn,p_website,p_contact_role,p_evidence,p_request_id);
 update public.employer_verification_requests set linkedin_url=left(p_linkedin,500),hr_email=left(p_hr_email,254),hr_phone=p_hr_phone,contact_source=left(p_contact_source,500),contact_permission_at=now() where id=v_id and applicant_id=auth.uid();
 return v_id;
end; $$;
commit;
