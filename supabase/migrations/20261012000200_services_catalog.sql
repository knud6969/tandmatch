-- Del 3: ydelseskatalog med startindhold (architecture 4.3 services). Indholdet er en pladsholder [ÅBEN].
-- Beskrivelserne er neutrale forklaringer: ingen priser, ingen vurderinger.

create table public.services (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9_]{2,60}$'),
  name text not null check (char_length(name) between 1 and 80),
  description text not null check (char_length(description) between 1 and 500),
  category public.service_category not null,
  default_duration_min smallint not null check (default_duration_min between 5 and 480),
  sort_order smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.services enable row level security;

create policy services_select_active on public.services
  for select to anon, authenticated using (is_active);
create policy services_select_admin on public.services
  for select to authenticated using (public.is_admin());
-- Kun migration/admin skriver.
revoke insert, update, delete, truncate on public.services from authenticated;
grant select on public.services to anon;

insert into public.services (slug, name, description, category, default_duration_min, sort_order) values
  ('undersoegelse', 'Undersøgelse', 'Tandlægen kigger på tænder og tandkød og taler med dig om dine ønsker og spørgsmål.', 'general', 30, 10),
  ('tandrensning', 'Tandrensning', 'Fjernelse af belægninger og tandsten af tandlæge eller tandplejer.', 'general', 45, 20),
  ('fyldning', 'Fyldning', 'Tandlægen fylder et hul i en tand med fyldningsmateriale.', 'general', 45, 30),
  ('roentgen', 'Røntgenbilleder', 'Billeder af tænder og kæbe, som tandlægen bruger i sin undersøgelse.', 'general', 15, 40),
  ('rodbehandling', 'Rodbehandling', 'Behandling inde i en tand, hvor nerven er påvirket.', 'general', 90, 50),
  ('krone', 'Krone', 'En tilpasset overdækning, der sættes på en tand.', 'general', 60, 60),
  ('tandudtraekning', 'Tandudtrækning', 'Tandlægen fjerner en tand.', 'general', 45, 70),
  ('blegning', 'Blegning', 'Behandling, der gør tænderne lysere.', 'cosmetic', 60, 110),
  ('facing', 'Facing', 'Tynde skaller, der sættes på forsiden af tænderne for at ændre deres udseende.', 'cosmetic', 90, 120),
  ('diastema', 'Lukning af mellemrum mellem fortænder', 'Behandling, hvor et mellemrum mellem to tænder lukkes.', 'cosmetic', 60, 130),
  ('retainer', 'Retainer', 'En fast eller aftagelig tråd eller skinne, der holder tænderne på plads efter tandregulering.', 'cosmetic', 30, 140),
  ('tandregulering_konsultation', 'Samtale om tandregulering', 'En samtale om muligheder for at flytte tænder.', 'cosmetic', 45, 150),
  ('akut_konsultation', 'Akut konsultation', 'En hurtig tid hos tandlægen, når der er brug for hjælp med det samme.', 'emergency', 30, 210),
  ('akut_smertebehandling', 'Akut hjælp ved smerter', 'En akut tid, hvor tandlægen tager sig af smerter.', 'emergency', 45, 220);
