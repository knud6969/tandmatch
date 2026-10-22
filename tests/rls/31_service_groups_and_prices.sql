-- Test 31: katalog med kategorier og prisreglen (1.9.1). Typen emergency hører præcis til kategorien akut; en pris kræver
-- en valgt kategori; fravalg sletter priserne; clinic_service_groups er kun synlig for ejeren; udskiftning er atomar.
begin;
\ir _helpers.sql
\ir _fixtures.sql

create function tt.grp(p_slug text) returns uuid language sql stable as $$ select id from public.service_groups where slug = p_slug $$;
grant execute on function tt.grp(text) to public;

-- Kataloget: 14 kategorier, alle behandlinger har en kategori, og typerne passer
select tt.eq((select count(*) from public.service_groups)::int, 14, '14 kategorier');
select tt.ok((select count(*) from public.services) >= 53, 'startkataloget er indsat');
select tt.eq((select count(*) from public.services where group_id is null)::int, 0, 'alle behandlinger har en kategori');
select tt.eq((select group_id from public.services where slug = 'undersoegelse'), tt.grp('forebyggelse'), 'undersoegelse ligger i forebyggelse');
select tt.eq((select count(*) from public.services s join public.service_groups g on g.id = s.group_id
               where (s.category = 'emergency') <> (g.slug = 'akut'))::int, 0, 'emergency = kategorien akut');
select tt.denied(format('insert into public.services (slug, group_id, name, description, category, default_duration_min) values (%L, %L, %L, %L, %L, 30)',
                        'test_akut_forkert', tt.grp('fyldninger'), 'X', 'X', 'emergency'),
                 'emergency uden for akut afvises', 'SERVICE_CATEGORY_MISMATCH');
select tt.denied(format('insert into public.services (slug, group_id, name, description, category, default_duration_min) values (%L, %L, %L, %L, %L, 30)',
                        'test_generel_i_akut', tt.grp('akut'), 'X', 'X', 'general'),
                 'ikke-emergency i akut afvises', 'SERVICE_CATEGORY_MISMATCH');

-- Katalog skrives ikke af klinikker
select tt.as_user(tt.id('uA1'));
select tt.denied('update public.service_groups set name = ''x''', 'klinik kan ikke ændre kategorier', '42501');
select tt.denied('insert into public.clinic_service_groups (clinic_id, group_id) values (' || quote_literal(tt.cid('A1')) || ', ' || quote_literal(tt.grp('kosmetisk')) || ')',
                 'klinik kan ikke skrive clinic_service_groups direkte', '42501');

-- Pris uden valgt kategori afvises (blegning er i kosmetisk, som A1 ikke har valgt)
select tt.denied(format('insert into public.clinic_prices (clinic_id, service_id, price_min, price_max, duration_min) values (%L, %L, 1000, 2000, 60)',
                        tt.cid('A1'), tt.svc('blegning')), 'pris uden valgt kategori', 'SERVICE_GROUP_NOT_SELECTED');
select tt.denied(format('select public.replace_clinic_prices(%L::jsonb)',
                        jsonb_build_array(jsonb_build_object('serviceId', tt.svc('blegning'), 'priceMin', 1000, 'priceMax', 2000, 'durationMin', 60))),
                 'replace_clinic_prices uden valgt kategori', 'SERVICE_GROUP_NOT_SELECTED');
-- ...og intet er ændret (atomar): A1 har stadig sine 2 fixturepriser
select tt.eq((select count(*) from public.clinic_prices where clinic_id = tt.cid('A1'))::int, 2, 'afvist udskiftning efterlader prislisten uændret');

-- Vælg kosmetisk og forebyggelse; derefter kan blegning prissættes
select tt.eq((select cardinality(public.set_clinic_service_groups(array[tt.grp('forebyggelse'), tt.grp('kosmetisk')]))), 2, 'to kategorier valgt');
select tt.eq((select count(*) from public.clinic_service_groups)::int, 2, 'ejeren ser sine valgte kategorier');
select tt.eq((select count(*) from public.clinic_prices where clinic_id = tt.cid('A1'))::int, 1, 'fravalg af akut slettede akutprisen');
select tt.eq(public.replace_clinic_prices(jsonb_build_array(
               jsonb_build_object('serviceId', tt.svc('blegning'), 'priceMin', 1000, 'priceMax', 2000, 'durationMin', 60),
               jsonb_build_object('serviceId', tt.svc('undersoegelse'), 'priceMin', 400, 'priceMax', 600, 'durationMin', 30, 'note', 'Inkl. røntgen'))),
             2, 'prisliste erstattet');
select tt.eq((select count(*) from public.clinic_prices where clinic_id = tt.cid('A1'))::int, 2, 'to priser efter udskiftning');
-- Ugyldigt input afvises og ruller tilbage
select tt.denied(format('select public.replace_clinic_prices(%L::jsonb)',
                        jsonb_build_array(jsonb_build_object('serviceId', tt.svc('blegning'), 'priceMin', 3000, 'priceMax', 2000, 'durationMin', 60))),
                 'pris max under min afvises', 'INVALID_INPUT');
select tt.denied(format('select public.replace_clinic_prices(%L::jsonb)',
                        jsonb_build_array(jsonb_build_object('serviceId', tt.svc('blegning'), 'priceMin', 1, 'priceMax', 2, 'durationMin', 60),
                                          jsonb_build_object('serviceId', tt.svc('blegning'), 'priceMin', 1, 'priceMax', 2, 'durationMin', 60))),
                 'dublet afvises', 'INVALID_INPUT');
select tt.eq((select count(*) from public.clinic_prices where clinic_id = tt.cid('A1'))::int, 2, 'afvist udskiftning efterlader listen');
select tt.eq(public.replace_clinic_prices('[]'::jsonb), 0, 'tom liste sletter alle priser');
select tt.eq((select count(*) from public.clinic_prices where clinic_id = tt.cid('A1'))::int, 0, 'ingen priser');

-- Andre klinikker ser ikke A1's valg
select tt.as_user(tt.id('uA2'));
select tt.eq((select count(*) from public.clinic_service_groups where clinic_id = tt.cid('A1'))::int, 0, 'A2 ser ikke A1''s valgte kategorier');
select tt.eq((select count(*) from public.clinic_service_groups)::int, 2, 'A2 ser kun sine egne (fixtures)');
select tt.as_anon();
select tt.rows('select 1 from public.clinic_service_groups', 0, 'anon ser ingen valgte kategorier');
select tt.as_user(tt.id('pA'));
select tt.denied(format('select public.set_clinic_service_groups(array[%L]::uuid[])', tt.grp('akut')), 'patient kan ikke vælge kategorier', 'NOT_FOUND');

-- Anonym session kan ikke
select tt.as_user(tt.id('uA2'), true);
select tt.denied(format('select public.set_clinic_service_groups(array[%L]::uuid[])', tt.grp('akut')), 'ikke-permanent bruger afvises', 'UNAUTHENTICATED');

-- Åbningstider: atomar udskiftning og overlap ruller tilbage
select tt.as_user(tt.id('uA3'));
select tt.eq((select count(*) from public.clinic_opening_hours where clinic_id = tt.cid('A3'))::int, 14, 'forudsætning: 14 vinduer');
select tt.denied(format('select public.replace_opening_hours(%L::jsonb)',
                        jsonb_build_array(jsonb_build_object('weekday', 1, 'opensAt', '08:00', 'closesAt', '12:00', 'isEmergency', false),
                                          jsonb_build_object('weekday', 1, 'opensAt', '11:00', 'closesAt', '15:00', 'isEmergency', false))),
                 'overlap afvises', 'OPENING_HOURS_OVERLAP');
select tt.eq((select count(*) from public.clinic_opening_hours where clinic_id = tt.cid('A3'))::int, 14, 'overlap ruller hele udskiftningen tilbage');
select tt.eq(public.replace_opening_hours(jsonb_build_array(jsonb_build_object('weekday', 2, 'opensAt', '09:00', 'closesAt', '16:00', 'isEmergency', false))), 1, 'ét vindue');
select tt.eq((select count(*) from public.clinic_opening_hours where clinic_id = tt.cid('A3'))::int, 1, 'udskiftet');

rollback;
