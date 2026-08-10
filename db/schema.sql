-- =====================================================================
-- MP 2.0 — PostgreSQL schema (Supabase)
-- NOTE: This has ALREADY been applied to the live database.
-- Kept in the repo as documentation + for setting up a fresh project.
-- Every statement uses IF NOT EXISTS, so re-running is always safe.
-- =====================================================================

create extension if not exists "pgcrypto";  -- provides gen_random_uuid()

-- STORES: the top-level container. One store = one Etsy shop.
-- user_id links the store to a Supabase Auth user (data isolation).
create table if not exists stores (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  user_id     uuid,                              -- owner (auth.users id)
  created_at  timestamptz not null default now()
);

-- MOCKUPS: blank product photos. boxes = print-areas drawn in the Box
-- Editor (JSON array of {name, tag, dnum, x, y, w, h, rot, pad}).
create table if not exists mockups (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  name        text not null,
  width       int,
  height      int,
  color_tag   text default 'light',          -- light | dark | mixed product
  image_url   text,                          -- Supabase Storage URL
  boxes       jsonb not null default '[]',
  set_ids     jsonb not null default '[]',   -- which sets this mockup is in
  created_at  timestamptz not null default now()
);

-- DESIGNS: artwork PNGs.
-- dnum = manual design number: 'single' or '1'..'8' (dark+light color
-- files of the same artwork share the same number).
create table if not exists designs (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  name        text not null,
  placement   text default 'front',
  variant     text default 'dark-design',    -- dark-design | light-design | universal
  dnum        text default 'single',
  image_url   text,
  created_at  timestamptz not null default now()
);

-- SETS: named groups of mockups (e.g. "Framed 24x36").
create table if not exists sets (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);

-- LISTINGS: a product listing = chosen designs + mockups + SEO result.
-- Generated photos (outputs) are NOT stored here — they stay in the
-- browser (large files); only the metadata syncs.
create table if not exists listings (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  name        text not null,
  category    text,
  keywords    text,
  design_ids  jsonb not null default '[]',
  mockup_ids  jsonb not null default '[]',
  seo         jsonb,                         -- {title, tags, description, alt, vision}
  tm          jsonb,                         -- trademark scan result (future)
  status      text default 'draft',
  created_at  timestamptz not null default now()
);

-- OUTPUTS: reserved for future cloud storage of generated photos.
create table if not exists outputs (
  id          uuid primary key default gen_random_uuid(),
  listing_id  uuid not null references listings(id) on delete cascade,
  name        text,
  image_url   text,
  alt         text,
  created_at  timestamptz not null default now()
);

-- Indexes: make per-store lookups fast (every query filters on these).
create index if not exists idx_stores_user   on stores(user_id);
create index if not exists idx_mockups_store  on mockups(store_id);
create index if not exists idx_designs_store  on designs(store_id);
create index if not exists idx_sets_store     on sets(store_id);
create index if not exists idx_listings_store on listings(store_id);
create index if not exists idx_outputs_listing on outputs(listing_id);
