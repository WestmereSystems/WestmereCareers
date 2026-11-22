begin;
-- Invitation bookkeeping must not introduce an Auth-account deletion restriction.
alter table private.business_invitations drop constraint business_invitations_invited_by_fkey;
alter table private.business_invitations add constraint business_invitations_invited_by_fkey foreign key(invited_by) references auth.users(id) on delete cascade;
alter table private.business_invitations drop constraint business_invitations_accepted_by_fkey;
alter table private.business_invitations add constraint business_invitations_accepted_by_fkey foreign key(accepted_by) references auth.users(id) on delete set null;
commit;
