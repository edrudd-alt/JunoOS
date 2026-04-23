-- Migration 032: nominees table and clients.nominee_id FK
-- Records nominee entities used when holding_location = 'nominee'.

create table nominees (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  description text        null,
  active      boolean     not null default true,
  created_at  timestamptz not null default now()
);

alter table nominees enable row level security;

create policy "authenticated full access"
  on nominees
  for all
  to authenticated
  using (true)
  with check (true);

alter table clients
  add column nominee_id uuid null references nominees(id) on delete set null;

create index clients_nominee_id_idx on clients (nominee_id);
