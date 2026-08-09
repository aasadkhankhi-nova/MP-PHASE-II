-- MP Phase II — PostgreSQL schema (Supabase)
-- Run in Supabase: SQL Editor -> New query -> paste -> Run

create extension if not exists "pgcrypto";

-- Each Etsy shop = one isolated workspace
create table if not exists stores (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists mockups (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  name        text not null,
  width       int,
  height      int,
  color_tag   text default 'light',          -- light | dark | mixed
  image_url   text,                          -- object storage path
  boxes       jsonb not null default '[]',   -- print-area boxes (front/side/top quads, dnum, tag)
  set_ids     jsonb not null default '[]',
  created_at  timestamptz not null default now()
);

create table if not exists designs (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  name        text not null,
  placement   text default 'front',
  variant     text default 'dark-design',    -- dark-design | light-design | universal
  dnum        text default 'single',         -- single | 1..8
  image_url   text,
  created_at  timestamptz not null default now()
);

create table if not exists sets (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists listings (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  name        text not null,
  category    text,
  keywords    text,
  design_ids  jsonb not null default '[]',
  mockup_ids  jsonb not null default '[]',
  seo         jsonb,                         -- title/tags/description/alt/vision/personalization
  tm          jsonb,                         -- trademark scan result
  status      text default 'draft',
  created_at  timestamptz not null default now()
);

create table if not exists outputs (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references listings(id) on delete cascade,
  name        text,
  image_url   text,
  alt         text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_mockups_store  on mockups(store_id);
create index if not exists idx_designs_store  on designs(store_id);
create index if not exists idx_sets_store     on sets(store_id);
create index if not exists idx_listings_store on listings(store_id);
create index if not exists idx_outputs_listing on outputs(listing_id);
