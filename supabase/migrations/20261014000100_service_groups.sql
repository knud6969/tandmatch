-- 1.9.1 del 1: behandlingskatalog i to niveauer (architecture 4.3, bilag docs/behandlingskatalog.md).
-- Kategorier (service_groups) og services.group_id. De 14 eksisterende slugs bevares og placeres i kategorier;
-- resten af startkataloget indsættes. Bagefter vedligeholdes kataloget i databasen (admin/service role).

create table public.service_groups (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9_]{2,60}$'),
  name text not null check (char_length(name) between 1 and 80),
  description text not null check (char_length(description) between 1 and 500),
  sort_order smallint not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.service_groups enable row level security;

create policy service_groups_select_active on public.service_groups
  for select to anon, authenticated using (is_active);
create policy service_groups_select_admin on public.service_groups
  for select to authenticated using (public.is_admin());
-- Kun migration/admin skriver.
revoke insert, update, delete, truncate on public.service_groups from authenticated;
grant select on public.service_groups to anon;

alter table public.services add column group_id uuid null references public.service_groups (id);

insert into public.service_groups (slug, name, description, sort_order) values
  ('forebyggelse', 'Undersøgelse og forebyggelse', 'Almindelige eftersyn, rensning og behandlinger, der forebygger problemer.', 10),
  ('fyldninger', 'Fyldninger og reparationer', 'Behandling af huller og reparation af beskadigede tænder.', 20),
  ('rodbehandlinger', 'Rodbehandling', 'Behandling inde i tanden, når nerven er påvirket.', 30),
  ('kroner_broer', 'Kroner og broer', 'Faste erstatninger og overdækninger af tænder.', 40),
  ('implantater', 'Implantater', 'Erstatning af manglende tænder med en skrue i kæbeknoglen.', 50),
  ('proteser', 'Proteser', 'Aftagelige erstatninger for manglende tænder.', 60),
  ('tandkoed', 'Tandkød og paradentose', 'Undersøgelse og behandling af tandkød og tandkødslommer.', 70),
  ('kirurgi', 'Kirurgi og tandudtrækning', 'Fjernelse af tænder og mindre kirurgiske indgreb i munden.', 80),
  ('tandregulering', 'Tandregulering', 'Flytning af tænder med bøjle eller skinner og fastholdelse bagefter.', 90),
  ('kosmetisk', 'Kosmetisk tandbehandling', 'Behandlinger, der ændrer tændernes farve, form eller udseende.', 100),
  ('boern_unge', 'Børn og unge', 'Tandbehandling tilpasset børn og unge.', 110),
  ('bidskinner', 'Bidskinner og tænderskæren', 'Behandling ved tænderskæren, ømme kæber og problemer med bidet.', 120),
  ('tandlaegeangst', 'Tandlægeskræk og bedøvelse', 'Ekstra tid og hjælp til patienter, der er nervøse for tandlægebesøg.', 130),
  ('akut', 'Akut tandpleje', 'Hurtig hjælp ved smerter, skader og andre akutte problemer.', 140);

-- De 14 eksisterende behandlinger beholder slug og type; de får kategori, sortering, navn og beskrivelse fra bilaget.
update public.services s set group_id = g.id, sort_order = v.sort_order, name = v.name, description = v.description
  from (values
    ('undersoegelse', 'forebyggelse', 101, 'Undersøgelse', 'Tandlægen kigger på tænder og tandkød og taler med dig om dine ønsker og spørgsmål.'),
    ('tandrensning', 'forebyggelse', 102, 'Tandrensning', 'Fjernelse af belægninger og tandsten af tandlæge eller tandplejer.'),
    ('roentgen', 'forebyggelse', 103, 'Røntgenbilleder', 'Billeder af tænder og kæbe, som tandlægen bruger i sin undersøgelse.'),
    ('fyldning', 'fyldninger', 201, 'Fyldning', 'Tandlægen fylder et hul i en tand med fyldningsmateriale.'),
    ('rodbehandling', 'rodbehandlinger', 301, 'Rodbehandling', 'Behandling inde i en tand, hvor nerven er påvirket.'),
    ('krone', 'kroner_broer', 401, 'Krone', 'En tilpasset overdækning, der sættes på en tand.'),
    ('tandudtraekning', 'kirurgi', 801, 'Tandudtrækning', 'Tandlægen fjerner en tand.'),
    ('tandregulering_konsultation', 'tandregulering', 901, 'Samtale om tandregulering', 'En samtale om muligheder for at flytte tænder.'),
    ('retainer', 'tandregulering', 904, 'Retainer', 'En fast eller aftagelig tråd eller skinne, der holder tænderne på plads efter tandregulering.'),
    ('blegning', 'kosmetisk', 1001, 'Blegning', 'Behandling, der gør tænderne lysere.'),
    ('facing', 'kosmetisk', 1002, 'Facing', 'Tynde skaller, der sættes på forsiden af tænderne for at ændre deres udseende.'),
    ('diastema', 'kosmetisk', 1003, 'Lukning af mellemrum mellem fortænder', 'Behandling, hvor et mellemrum mellem to tænder lukkes.'),
    ('akut_konsultation', 'akut', 1401, 'Akut konsultation', 'En hurtig tid hos tandlægen, når der er brug for hjælp med det samme.'),
    ('akut_smertebehandling', 'akut', 1402, 'Akut hjælp ved smerter', 'En akut tid, hvor tandlægen tager sig af smerter.')
  ) as v(slug, group_slug, sort_order, name, description)
  join public.service_groups g on g.slug = v.group_slug
 where s.slug = v.slug;

insert into public.services (slug, group_id, name, description, category, default_duration_min, sort_order)
select v.slug, g.id, v.name, v.description, v.category::public.service_category, v.minutes, v.sort_order
  from (values
    ('fluorbehandling', 'forebyggelse', 'Fluorbehandling', 'Påføring af fluor på tænderne for at styrke emaljen.', 'general', 15::smallint, 104::smallint),
    ('fissurforsegling', 'forebyggelse', 'Fissurforsegling', 'En tynd belægning i furerne på kindtænderne, så belægninger har sværere ved at sætte sig.', 'general', 30::smallint, 105::smallint),
    ('stor_fyldning', 'fyldninger', 'Større fyldning', 'En fyldning, der dækker en større del af tanden eller flere flader.', 'general', 60::smallint, 202::smallint),
    ('udskiftning_fyldning', 'fyldninger', 'Udskiftning af fyldning', 'En ældre fyldning fjernes og erstattes af en ny.', 'general', 45::smallint, 203::smallint),
    ('reparation_knaekket_tand', 'fyldninger', 'Reparation af knækket tand', 'En afslået eller knækket tand bygges op igen med fyldningsmateriale.', 'general', 45::smallint, 204::smallint),
    ('rodbehandling_kindtand', 'rodbehandlinger', 'Rodbehandling af kindtand', 'Rodbehandling af en tand bagerst i munden, som har flere rodkanaler.', 'general', 120::smallint, 302::smallint),
    ('rodbehandling_genbehandling', 'rodbehandlinger', 'Genbehandling af rodfyldning', 'En tidligere rodbehandling åbnes og behandles igen.', 'general', 120::smallint, 303::smallint),
    ('opbygning_efter_rodbehandling', 'rodbehandlinger', 'Opbygning efter rodbehandling', 'Tanden bygges op igen, efter at rodbehandlingen er afsluttet.', 'general', 60::smallint, 304::smallint),
    ('bro', 'kroner_broer', 'Bro', 'En fast erstatning for en eller flere manglende tænder, som sidder fast på nabotænderne.', 'general', 90::smallint, 402::smallint),
    ('indlaeg', 'kroner_broer', 'Indlæg (inlay/onlay)', 'Et tilpasset fyldningsstykke, der fremstilles uden for munden og sættes fast i tanden.', 'general', 60::smallint, 403::smallint),
    ('midlertidig_krone', 'kroner_broer', 'Midlertidig krone', 'En krone, der beskytter tanden, mens den endelige krone bliver fremstillet.', 'general', 30::smallint, 404::smallint),
    ('implantat_samtale', 'implantater', 'Samtale om implantat', 'En samtale om muligheder og forløb ved et tandimplantat.', 'general', 45::smallint, 501::smallint),
    ('implantat', 'implantater', 'Tandimplantat', 'En skrue sættes i kæbeknoglen som rod for en ny tand.', 'general', 120::smallint, 502::smallint),
    ('krone_paa_implantat', 'implantater', 'Krone på implantat', 'En krone, der sættes fast på et implantat.', 'general', 60::smallint, 503::smallint),
    ('knogleopbygning', 'implantater', 'Knogleopbygning', 'Kæbeknoglen bygges op, så der er plads til et implantat.', 'general', 90::smallint, 504::smallint),
    ('helprotese', 'proteser', 'Helprotese', 'En aftagelig protese, der erstatter alle tænder i over- eller underkæben.', 'general', 60::smallint, 601::smallint),
    ('delprotese', 'proteser', 'Delprotese', 'En aftagelig protese, der erstatter nogle af tænderne.', 'general', 60::smallint, 602::smallint),
    ('protese_tilpasning', 'proteser', 'Tilpasning af protese', 'En eksisterende protese justeres, så den sidder bedre.', 'general', 30::smallint, 603::smallint),
    ('protese_reparation', 'proteser', 'Reparation af protese', 'En knækket eller beskadiget protese repareres.', 'general', 30::smallint, 604::smallint),
    ('tandkoedsundersoegelse', 'tandkoed', 'Undersøgelse af tandkød', 'Tandlægen måler tandkødslommerne og kigger på tandkødet.', 'general', 45::smallint, 701::smallint),
    ('dybderensning', 'tandkoed', 'Dybderensning', 'Rensning af tandkødslommer under tandkødskanten.', 'general', 60::smallint, 702::smallint),
    ('tandkoed_opfoelgning', 'tandkoed', 'Opfølgende tandkødsbehandling', 'Regelmæssig rensning og kontrol efter en tandkødsbehandling.', 'general', 45::smallint, 703::smallint),
    ('visdomstand', 'kirurgi', 'Fjernelse af visdomstand', 'En visdomstand fjernes.', 'general', 60::smallint, 802::smallint),
    ('kirurgisk_udtraekning', 'kirurgi', 'Kirurgisk tandudtrækning', 'En tand fjernes ved et mindre kirurgisk indgreb, fx hvis den sidder fast.', 'general', 75::smallint, 803::smallint),
    ('tandkoedskorrektion', 'kirurgi', 'Korrektion af tandkød', 'Tandkødets form eller højde justeres ved et mindre indgreb.', 'general', 60::smallint, 804::smallint),
    ('fast_bojle', 'tandregulering', 'Fast bøjle', 'En bøjle, der sidder fast på tænderne og flytter dem gradvist.', 'cosmetic', 60::smallint, 902::smallint),
    ('tandreguleringsskinner', 'tandregulering', 'Tandregulering med skinner', 'Gennemsigtige, aftagelige skinner, der flytter tænderne gradvist.', 'cosmetic', 45::smallint, 903::smallint),
    ('kosmetisk_opbygning', 'kosmetisk', 'Kosmetisk opbygning af tand', 'Tandens form ændres med tandfarvet materiale.', 'cosmetic', 60::smallint, 1004::smallint),
    ('boerneundersoegelse', 'boern_unge', 'Undersøgelse af børn', 'Et eftersyn af et barns tænder i et tempo, der passer til barnet.', 'general', 30::smallint, 1101::smallint),
    ('fyldning_maelketand', 'boern_unge', 'Fyldning i mælketand', 'Et hul i en mælketand fyldes.', 'general', 30::smallint, 1102::smallint),
    ('tilvaenning_tandlaege', 'boern_unge', 'Tilvænning til tandlægebesøg', 'Korte besøg, hvor barnet lærer klinikken og behandlingen at kende.', 'general', 30::smallint, 1103::smallint),
    ('bid_undersoegelse', 'bidskinner', 'Undersøgelse af bid og kæbeled', 'Tandlægen undersøger bidet, kæbeleddet og tyggemusklerne.', 'general', 45::smallint, 1201::smallint),
    ('bidskinne', 'bidskinner', 'Bidskinne', 'En tilpasset skinne, der bæres om natten og beskytter tænderne mod slid.', 'general', 45::smallint, 1202::smallint),
    ('bidskinne_justering', 'bidskinner', 'Justering af bidskinne', 'En eksisterende bidskinne tilpasses.', 'general', 20::smallint, 1203::smallint),
    ('angst_samtale', 'tandlaegeangst', 'Samtale om tandlægeskræk', 'En rolig samtale om, hvad der gør besøget svært, og hvordan behandlingen kan tilrettelægges.', 'general', 30::smallint, 1301::smallint),
    ('behandling_ekstra_tid', 'tandlaegeangst', 'Behandling med ekstra tid', 'En behandling med længere tid og pauser efter behov.', 'general', 60::smallint, 1302::smallint),
    ('beroligende_medicin', 'tandlaegeangst', 'Beroligende medicin', 'Behandling, hvor tandlægen bruger beroligende medicin som hjælp.', 'general', 60::smallint, 1303::smallint),
    ('akut_knaekket_tand', 'akut', 'Akut hjælp ved knækket tand', 'En akut tid, når en tand er knækket eller slået løs.', 'emergency', 45::smallint, 1403::smallint),
    ('akut_haevelse', 'akut', 'Akut hjælp ved hævelse', 'En akut tid ved hævelse i mund, kind eller kæbe.', 'emergency', 45::smallint, 1404::smallint)
  ) as v(slug, group_slug, name, description, category, minutes, sort_order)
  join public.service_groups g on g.slug = v.group_slug;

alter table public.services alter column group_id set not null;
create index services_group_idx on public.services (group_id, sort_order);

-- Typen 'emergency' hører præcis til kategorien 'akut' (architecture 4.3): akutlogik og akutfiltre bruger typen.
create function public.services_group_guard()
returns trigger
language plpgsql set search_path = ''
as $$
declare
  v_is_emergency_group boolean;
begin
  select g.slug = 'akut' into v_is_emergency_group from public.service_groups g where g.id = new.group_id;
  if (new.category = 'emergency') is distinct from coalesce(v_is_emergency_group, false) then
    raise exception 'SERVICE_CATEGORY_MISMATCH: typen emergency hører præcis til kategorien akut' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.services_group_guard() from public, anon, authenticated;

create trigger services_group_guard
  before insert or update of category, group_id on public.services
  for each row execute function public.services_group_guard();

-- Kontrol af de eksisterende rækker (triggeren kørte ikke for opdateringen af group_id ovenfor, fordi den blev
-- oprettet bagefter).
do $$
begin
  if exists (
    select 1 from public.services s join public.service_groups g on g.id = s.group_id
     where (s.category = 'emergency') <> (g.slug = 'akut')
  ) then
    raise exception 'Katalogets typer og kategorier stemmer ikke overens';
  end if;
end;
$$;
