-- M4: every store is owned by a user (Supabase Auth user)
alter table stores add column if not exists user_id uuid;
create index if not exists idx_stores_user on stores(user_id);
