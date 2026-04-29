-- Migration 042: add profile fields to la_firms
alter table public.la_firms
  add column if not exists phone         text,
  add column if not exists email         text,
  add column if not exists website       text,
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists city          text,
  add column if not exists state         text,
  add column if not exists zip           text,
  add column if not exists contact_name  text,
  add column if not exists contact_email text;
