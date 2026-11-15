begin;
create index profiles_active_cv on public.profiles(active_cv_id) where active_cv_id is not null;
create index listing_documents_uploader on public.listing_documents(uploaded_by);
create index saved_jobs_job on public.saved_jobs(job_id);
create index sample_jobs_user on public.sample_jobs(user_id,created_at desc);
create index sample_applications_job on public.sample_applications(job_id);
create index sample_applications_user on public.sample_applications(user_id,created_at desc);
commit;
