-- Original documents are private immutable copies, separate from a candidate's editable CV library.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('application-documents','application-documents',false,4194304,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document']) on conflict(id) do nothing;
create table public.application_documents(
 id uuid primary key default gen_random_uuid(),application_id uuid not null references public.applications(id) on delete cascade,
 filename text not null,storage_path text not null unique,media_type text not null,bytes integer not null check(bytes between 1 and 4194304),created_at timestamptz not null default now()
);
create index application_documents_application on public.application_documents(application_id);
alter table public.application_documents enable row level security;
revoke all on public.application_documents from public,anon,authenticated;
grant all on public.application_documents to service_role;
-- The server-only RPC makes the application and attachment reference one transaction.
create function public.submit_application_material(p_id uuid,p_candidate uuid,p_job uuid,p_cv text,p_letter text,p_answers jsonb,p_document jsonb default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare a public.applications%rowtype;
begin
 if length(trim(p_cv)) not between 50 and 40000 or length(p_letter)>15000 then raise exception 'Check the CV and cover letter length' using errcode='22023';end if;
 insert into public.applications(id,job_id,candidate_id,cv_text_snapshot,cover_letter,answers) values(p_id,p_job,p_candidate,p_cv,p_letter,p_answers) returning * into a;
 if p_document is not null then
  insert into public.application_documents(application_id,filename,storage_path,media_type,bytes) values(a.id,p_document->>'filename',p_document->>'path',p_document->>'mediaType',(p_document->>'bytes')::integer);
 end if;
 return jsonb_build_object('id',a.id,'created_at',a.created_at,'status',a.status);
end;$$;
revoke all on function public.submit_application_material(uuid,uuid,uuid,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.submit_application_material(uuid,uuid,uuid,text,text,jsonb,jsonb) to service_role;
