-- ============================================================
-- migration-etsy.sql — Etsy integration (run ONCE in Supabase SQL Editor)
--
-- One row per MP store that is connected to an Etsy shop.
-- The access/refresh tokens live ONLY here (server-side) — the browser
-- never sees them. "IF NOT EXISTS" everywhere so re-running is safe.
-- ============================================================

create table if not exists etsy_connections (
  store_id      uuid primary key references stores(id) on delete cascade,
  user_id       uuid not null,                -- owner (Supabase auth user id)
  etsy_user_id  text not null,                -- Etsy's numeric user id
  shop_id       text not null,                -- Etsy shop id (used in API calls)
  shop_name     text not null default '',     -- shown in the app ("connected: MyShop")
  access_token  text not null,                -- short-lived (1 hour)
  refresh_token text not null,                -- used to get fresh access tokens
  expires_at    timestamptz not null,         -- when access_token dies
  scopes        text not null default '',     -- which permissions this token has
  connected_at  timestamptz not null default now()
);

-- fast lookup of all connections belonging to one login account
create index if not exists idx_etsy_conn_user on etsy_connections(user_id);
