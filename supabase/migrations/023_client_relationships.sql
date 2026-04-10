-- Migration 023: client_relationships table
-- Captures spousal and family links between primary clients for aggregated
-- reporting and pro-rata calculations. Not for beneficial ownership vehicles
-- (those use lead_investor_id on the clients table).

create table client_relationships (
  id                 uuid        primary key default gen_random_uuid(),
  client_id          uuid        not null references clients(id) on delete cascade,
  related_client_id  uuid        not null references clients(id) on delete cascade,
  relationship_type  text        not null check (relationship_type in ('spouse', 'family', 'other')),
  active             boolean     not null default true,
  notes              text,
  created_at         timestamptz not null default now(),

  constraint no_self_relationship check (client_id != related_client_id),
  constraint unique_relationship  unique (client_id, related_client_id)
);

create index client_relationships_client_id_idx         on client_relationships (client_id);
create index client_relationships_related_client_id_idx on client_relationships (related_client_id);

alter table client_relationships enable row level security;

create policy "authenticated full access"
  on client_relationships
  for all
  to authenticated
  using (true)
  with check (true);
