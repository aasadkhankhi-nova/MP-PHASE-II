-- M4: har store kisi user ki milkiyat hai (Supabase Auth user)
alter table stores add column if not exists user_id uuid;
create index if not exists idx_stores_user on stores(user_id);
