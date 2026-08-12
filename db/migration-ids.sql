-- ============================================================
-- migration-ids.sql — run ONCE in Supabase SQL Editor.
--
-- WHY: the app creates item ids as short text strings, but these columns
-- were made `uuid` — so pushing mockups/designs to the cloud would fail
-- with "invalid input syntax for type uuid". This changes the item id
-- columns to plain text (any string welcome — also needed for importing
-- old MP Phase I data, whose ids are text too).
-- NOTE: stores.id stays uuid (those ids are made by the database itself).
-- ============================================================

alter table outputs  drop constraint if exists outputs_listing_id_fkey;

alter table mockups  alter column id drop default, alter column id type text using id::text;
alter table designs  alter column id drop default, alter column id type text using id::text;
alter table sets     alter column id drop default, alter column id type text using id::text;
alter table listings alter column id drop default, alter column id type text using id::text;
alter table outputs  alter column id drop default, alter column id type text using id::text,
                     alter column listing_id type text using listing_id::text;

alter table outputs  add constraint outputs_listing_id_fkey
  foreign key (listing_id) references listings(id) on delete cascade;
