-- RLS- og funktionstests for standard-sporet, besøg, anmeldelser og prisnøjagtighed (byggetrin 5).
-- Kører efter alle tidligere suiter. Patient A = ...0101, B = ...0102, anon C = ...0103, tandlæger X = ...0111, Y = ...0112, Z = ...0113.

create function pg_temp.as_user(p_uid uuid, p_anon boolean default false) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'is_anonymous', p_anon)::text, false);
  execute 'set role authenticated';
end $$;

create function pg_temp.as_anon_role() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', false);
  execute 'set role anon';
end $$;

create function pg_temp.as_db_owner() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', false);
  execute 'reset role';
end $$;

create function pg_temp.expect_error(p_sql text, p_label text, p_state text) returns void
language plpgsql as $$
declare st text;
begin
  execute p_sql;
  raise exception 'FEJL: forventede blokering men fik ingen: %', p_label;
exception when others then
  get stacked diagnostics st = returned_sqlstate;
  if sqlerrm like 'FEJL:%' then raise; end if;
  if st <> p_state then
    raise exception 'FEJL: % forventede SQLSTATE % men fik % (%)', p_label, p_state, st, sqlerrm;
  end if;
  raise notice 'OK (blokeret, %): % -> %', st, p_label, sqlerrm;
end $$;

create function pg_temp.expect_count(p_sql text, p_expected bigint, p_label text) returns void
language plpgsql as $$
declare n bigint;
begin
  execute p_sql into n;
  if n is distinct from p_expected then
    raise exception 'FEJL: % forventede %, fik %', p_label, p_expected, n;
  end if;
  raise notice 'OK: % (%)', p_label, n;
end $$;

create function pg_temp.expect_updated(p_sql text, p_expected int, p_label text) returns void
language plpgsql as $$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  if n <> p_expected then
    raise exception 'FEJL: % forventede % rækker, fik %', p_label, p_expected, n;
  end if;
  raise notice 'OK: % (% rækker)', p_label, n;
end $$;

-- ---------- Fixtures (som ejer) ----------
select pg_temp.as_db_owner();
-- Priser for X's klinik (K1).
insert into public.clinic_prices (clinic_id, service, price_min, price_max, note) values
  ('00000000-0000-4000-8000-000000000301', 'undersoegelse', 500, 800, 'Test-pris');
-- Besøg: V1 A/X verificeret. V2 A/Y IKKE verificeret. V3 B/X verificeret. V4 A/Z verificeret (til 3-anmeldelser test).
insert into public.visits (id, patient_id, dentist_id, visited_on, verified_at) values
  ('00000000-0000-4000-8000-000000001501', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000111', '2026-09-01', now()),
  ('00000000-0000-4000-8000-000000001502', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000112', '2026-09-02', null),
  ('00000000-0000-4000-8000-000000001503', '00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-000000000111', '2026-09-03', now()),
  ('00000000-0000-4000-8000-000000001504', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000113', '2026-09-04', now()),
  ('00000000-0000-4000-8000-000000001505', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000112', '2026-09-05', now()),
  ('00000000-0000-4000-8000-000000001506', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000111', '2026-09-06', now());

create temp table ids (name text primary key, id uuid);
grant select on ids to anon, authenticated;
-- ---------- 1. Offentlig tandlægeliste (anon) ----------
select pg_temp.as_anon_role();
select pg_temp.expect_count($$select count(*) from public.public_dentists('2000') where dentist_id = '00000000-0000-4000-8000-000000000111'$$, 1, 'anon ser verificeret tandlæge X via public_dentists');
select pg_temp.expect_count($$select count(*) from public.public_dentists('2000') where dentist_id = '00000000-0000-4000-8000-000000000114'$$, 0, 'anon ser ikke uverificeret tandlæge U');
select pg_temp.expect_count($$select count(*) from public.public_dentists('2000') where dentist_id = '00000000-0000-4000-8000-000000000111' and distance_km is not null$$, 1, 'afstand udregnes fra patientens postnummer');
select pg_temp.expect_error($$select count(*) from public.dentists$$, 'anon kan ikke læse dentists direkte', '42501');
select pg_temp.expect_error($$select count(*) from public.reviews$$, 'anon kan ikke læse reviews direkte', '42501');
select pg_temp.expect_error($$select count(*) from public.visits$$, 'anon kan ikke læse besøg', '42501');
select pg_temp.expect_count($$select count(*) from public.clinic_prices where clinic_id = '00000000-0000-4000-8000-000000000301'$$, 1, 'anon ser priser (offentlige)');

-- ---------- 2. Patient: besøg og anmeldelser ----------
select pg_temp.as_user('00000000-0000-4000-8000-000000000101');
select pg_temp.expect_count($$select count(*) from public.visits$$, 5, 'patient ser egne besøg (ikke B''s)');
select pg_temp.expect_error($$insert into public.reviews (visit_id, patient_id, stars, text, price_accuracy) values ('00000000-0000-4000-8000-000000001502', '00000000-0000-4000-8000-000000000101', 4, 'Gode tandlæger og fin behandling her.', 'as_quoted')$$, 'patient kan ikke anmelde uden verificeret besøg', '42501');
select pg_temp.as_user('00000000-0000-4000-8000-000000000102');
select pg_temp.expect_error($$insert into public.reviews (visit_id, patient_id, stars, text, price_accuracy) values ('00000000-0000-4000-8000-000000001501', '00000000-0000-4000-8000-000000000102', 4, 'Gode tandlæger og fin behandling her.', 'as_quoted')$$, 'kun ejer kan anmelde sit besøg (B på A''s besøg)', '42501');
select pg_temp.as_user('00000000-0000-4000-8000-000000000101');
select pg_temp.expect_error($$insert into public.reviews (visit_id, patient_id, stars, text, price_accuracy) values ('00000000-0000-4000-8000-000000001501', '00000000-0000-4000-8000-000000000101', 6, 'For mange stjerner her til testen.', 'as_quoted')$$, 'stjerner uden for 1-5 afvises', '23514');
select pg_temp.expect_error($$insert into public.reviews (visit_id, patient_id, stars, text, price_accuracy) values ('00000000-0000-4000-8000-000000001501', '00000000-0000-4000-8000-000000000101', 4, 'Kort.', 'as_quoted')$$, 'for kort tekst afvises', '23514');
select pg_temp.expect_updated($$insert into public.reviews (visit_id, patient_id, stars, text, price_accuracy, moderation_status) values ('00000000-0000-4000-8000-000000001501', '00000000-0000-4000-8000-000000000101', 5, 'Rigtig god behandling og venlig betjening.', 'as_quoted', 'approved')$$, 1, 'patient indsender anmeldelse (status tvinges til pending)');
select pg_temp.expect_error($$insert into public.reviews (visit_id, patient_id, stars, text, price_accuracy) values ('00000000-0000-4000-8000-000000001501', '00000000-0000-4000-8000-000000000101', 4, 'Anden anmeldelse af samme besøg.', 'as_quoted')$$, 'én anmeldelse pr. besøg', '23505');
select pg_temp.expect_count($$select count(*) from public.reviews where visit_id = '00000000-0000-4000-8000-000000001501' and moderation_status = 'pending'$$, 1, 'patient ser egen anmeldelse som pending');
select pg_temp.expect_updated($$update public.reviews set moderation_status = 'approved' where visit_id = '00000000-0000-4000-8000-000000001501'$$, 0, 'patient kan ikke godkende egen anmeldelse');
select pg_temp.expect_updated($$update public.reviews set stars = 1 where visit_id = '00000000-0000-4000-8000-000000001501'$$, 0, 'patient kan ikke ændre anmeldelse efter indsendelse');
select pg_temp.as_anon_role();
select pg_temp.expect_count($$select count(*) from public.public_reviews('00000000-0000-4000-8000-000000000111')$$, 0, 'pending anmeldelse vises ikke offentligt');

-- ---------- 3. Tandlæge: kan ikke anmelde, kan kun svare på godkendt anmeldelse af sig selv ----------
select pg_temp.as_user('00000000-0000-4000-8000-000000000111');
select pg_temp.expect_error($$insert into public.reviews (visit_id, patient_id, stars, text, price_accuracy) values ('00000000-0000-4000-8000-000000001503', '00000000-0000-4000-8000-000000000102', 4, 'Tandlæge forsøger at anmelde.', 'as_quoted')$$, 'tandlæge kan ikke anmelde', '42501');
select pg_temp.as_db_owner();
insert into ids select 'r1501', id from public.reviews where visit_id = '00000000-0000-4000-8000-000000001501';
select pg_temp.as_user('00000000-0000-4000-8000-000000000111');
select pg_temp.expect_error($$insert into public.review_replies (review_id, dentist_id, text) values ((select id from ids where name = 'r1501'), '00000000-0000-4000-8000-000000000111', 'Svar på pending')$$, 'tandlæge kan ikke svare på pending anmeldelse', '42501');

-- Admin/moderation (owner) godkender anmeldelsen.
select pg_temp.as_db_owner();
select set_config('tm.system', 'on', false);
update public.reviews set moderation_status = 'approved', moderated_at = now() where visit_id = '00000000-0000-4000-8000-000000001501';
select set_config('tm.system', '', false);
select pg_temp.expect_count($$select count(*) from public.public_reviews('00000000-0000-4000-8000-000000000111')$$, 1, 'godkendt anmeldelse vises offentligt');
select pg_temp.expect_count($$select count(*) from public.public_reviews('00000000-0000-4000-8000-000000000111') where text is not null and review_id is not null$$, 1, 'offentlig anmeldelse har ingen patient-id (kun offentlige felter)');
select pg_temp.expect_count($$select count(*) from pg_proc p where p.proname = 'public_reviews' and position('patient' in pg_get_function_result(p.oid)) = 0$$, 1, 'public_reviews returnerer ingen patient-felter');

select pg_temp.as_user('00000000-0000-4000-8000-000000000112');
select pg_temp.expect_error($$insert into public.review_replies (review_id, dentist_id, text) values ((select id from ids where name = 'r1501'), '00000000-0000-4000-8000-000000000112', 'Y svarer på X')$$, 'tandlæge Y kan ikke svare på X''s anmeldelse', '42501');
select pg_temp.as_user('00000000-0000-4000-8000-000000000111');
select pg_temp.as_db_owner();
select set_config('tm.system', 'on', false);
update public.reviews set moderation_status = 'approved' where visit_id = '00000000-0000-4000-8000-000000001501';
select set_config('tm.system', '', false);
select pg_temp.as_user('00000000-0000-4000-8000-000000000111');
select pg_temp.expect_updated($$insert into public.review_replies (review_id, dentist_id, text) values ((select id from ids where name = 'r1501'), '00000000-0000-4000-8000-000000000111', 'Tak for din anmeldelse.')$$, 1, 'anmeldt tandlæge svarer (pending)');
select pg_temp.as_anon_role();
select pg_temp.expect_count($$select count(*) from public.public_reviews('00000000-0000-4000-8000-000000000111') where reply_text is not null$$, 0, 'pending svar vises ikke offentligt');

-- ---------- 4. Prisnøjagtighed (kun fra 3 godkendte) ----------
select pg_temp.as_db_owner();
insert into public.reviews (visit_id, dentist_id, patient_id, stars, text, price_accuracy, moderation_status) values
  ('00000000-0000-4000-8000-000000001503', '00000000-0000-4000-8000-000000000111', '00000000-0000-4000-8000-000000000102', 4, 'B fik god behandling hos X, og prisen holdt.', 'as_quoted', 'approved'),
  ('00000000-0000-4000-8000-000000001506', '00000000-0000-4000-8000-000000000111', '00000000-0000-4000-8000-000000000101', 3, 'Prisen steg lidt, men ellers fin behandling.', 'slightly_higher', 'approved');
select set_config('tm.system', 'on', false);
update public.reviews set moderation_status = 'approved' where visit_id in ('00000000-0000-4000-8000-000000001503', '00000000-0000-4000-8000-000000001506');
select set_config('tm.system', '', false);
select pg_temp.as_anon_role();
select pg_temp.expect_count($$select review_count::bigint from public.public_dentist_review_stats('00000000-0000-4000-8000-000000000111')$$, 3, 'X har 3 godkendte anmeldelser');
select pg_temp.expect_count($$select price_accuracy_pct::bigint from public.public_dentist_review_stats('00000000-0000-4000-8000-000000000111')$$, 83, 'prisnøjagtighed: round(100*(2 ja + 0,5*1 lidt højere)/3) = 83');
select pg_temp.expect_count($$select count(*) from public.public_dentist_review_stats('00000000-0000-4000-8000-000000000112') where price_accuracy_pct is null$$, 1, 'Y har under 3 godkendte, så prisnøjagtighed er null');
select pg_temp.expect_count($$select count(*) from public.public_dentist_review_stats('00000000-0000-4000-8000-000000000111') where avg_stars = 4.0$$, 1, 'gennemsnitlige stjerner med én decimal (4,0 for 5,4,3... nej: 5,4,3 -> 4,0)');

select pg_temp.as_db_owner();
-- ---------- 5. Egne anmeldelser: tandlæge og patient ser kun egne (10.9) ----------
select pg_temp.as_db_owner();
insert into public.reviews (visit_id, dentist_id, patient_id, stars, text, price_accuracy) values
  ('00000000-0000-4000-8000-000000001505', '00000000-0000-4000-8000-000000000112', '00000000-0000-4000-8000-000000000101', 2, 'Y-anmeldelse til test af egne anmeldelser.', 'much_higher');
insert into ids select 'r1505', id from public.reviews where visit_id = '00000000-0000-4000-8000-000000001505' on conflict do nothing;
insert into ids select 'r1503', id from public.reviews where visit_id = '00000000-0000-4000-8000-000000001503' on conflict do nothing;
insert into ids select 'r1506', id from public.reviews where visit_id = '00000000-0000-4000-8000-000000001506' on conflict do nothing;

-- Tandlæge X ser kun egne anmeldelser (ikke Y's).
select pg_temp.as_user('00000000-0000-4000-8000-000000000111');
select pg_temp.expect_count($$select count(*) from public.dentist_reviews() where review_id = (select id from ids where name = 'r1505')$$, 0, 'tandlæge X ser ikke Y''s anmeldelse');
select pg_temp.expect_count($$select count(*) from public.dentist_reviews() where review_id = (select id from ids where name = 'r1503')$$, 1, 'tandlæge X ser sin egen anmeldelse (inkl. pending/approved)');
select pg_temp.expect_count($$select count(*) from public.reviews$$, 0, 'tandlæge kan ikke læse reviews-tabellen direkte');

-- Tandlæge Y ser kun sin egen.
select pg_temp.as_user('00000000-0000-4000-8000-000000000112');
select pg_temp.expect_count($$select count(*) from public.dentist_reviews() where review_id = (select id from ids where name = 'r1503')$$, 0, 'tandlæge Y ser ikke X''s anmeldelse');
select pg_temp.expect_count($$select count(*) from public.dentist_reviews() where review_id = (select id from ids where name = 'r1505')$$, 1, 'tandlæge Y ser sin egen anmeldelse');

-- Patient A ser ikke B's anmeldelse. Patient B ser ikke A's.
select pg_temp.as_user('00000000-0000-4000-8000-000000000101');
select pg_temp.expect_count($$select count(*) from public.reviews where id = (select id from ids where name = 'r1503')$$, 0, 'patient A ser ikke B''s anmeldelse');
select pg_temp.expect_count($$select count(*) from public.reviews where id in ((select id from ids where name = 'r1506'), (select id from ids where name = 'r1505'))$$, 2, 'patient A ser sine egne anmeldelser');
select pg_temp.expect_count($$select count(*) from public.dentist_reviews()$$, 0, 'patient kan ikke bruge tandlægeflade');
select pg_temp.as_user('00000000-0000-4000-8000-000000000102');
select pg_temp.expect_count($$select count(*) from public.reviews where id = (select id from ids where name = 'r1506')$$, 0, 'patient B ser ikke A''s anmeldelse');
select pg_temp.expect_count($$select count(*) from public.reviews where id = (select id from ids where name = 'r1503')$$, 1, 'patient B ser sin egen anmeldelse');

select pg_temp.as_db_owner();
-- ---------- 6. Hærdning: under 3 godkendte = null, verificeret/aktiv, afviste skjules (reviewer trin 5) ----------
select pg_temp.as_db_owner();
select set_config('tm.system', 'on', false);
update public.reviews set moderation_status = 'approved' where visit_id = '00000000-0000-4000-8000-000000001505';
select set_config('tm.system', '', false);
select pg_temp.as_anon_role();
select pg_temp.expect_count($$select count(*) from public.public_dentist_review_stats('00000000-0000-4000-8000-000000000112') where review_count = 1 and price_accuracy_pct is null and n_as_quoted is null and n_slightly_higher is null and n_much_higher is null$$, 1, 'under 3 godkendte: prisnøjagtighed og fordeling er null');
select pg_temp.expect_count($$select count(*) from public.public_dentist_review_stats_many(array['00000000-0000-4000-8000-000000000111'::uuid, '00000000-0000-4000-8000-000000000112'::uuid])$$, 2, 'batch-statistik returnerer én række pr. tandlæge');
select pg_temp.expect_count($$select count(*) from public.public_dentist_review_stats_many(array['00000000-0000-4000-8000-000000000111'::uuid]) where price_accuracy_pct = 83 and n_as_quoted = 2$$, 1, 'batch: 3 godkendte giver prisnøjagtighed og fordeling');

-- Inaktiv tandlæge: ingen offentlige anmeldelser eller statistik.
select pg_temp.as_db_owner();
update public.dentists set is_active = false where id = '00000000-0000-4000-8000-000000000112';
select pg_temp.as_anon_role();
select pg_temp.expect_count($$select count(*) from public.public_reviews('00000000-0000-4000-8000-000000000112')$$, 0, 'inaktiv tandlæge: ingen offentlige anmeldelser');
select pg_temp.expect_count($$select count(*) from public.public_dentist_review_stats('00000000-0000-4000-8000-000000000112') where review_count = 0$$, 1, 'inaktiv tandlæge: statistik er tom');
select pg_temp.as_db_owner();
update public.dentists set is_active = true where id = '00000000-0000-4000-8000-000000000112';

-- Afvist anmeldelse: tandlægen ser den ikke, patienten gør.
insert into public.visits (id, patient_id, dentist_id, visited_on, verified_at) values
  ('00000000-0000-4000-8000-000000001508', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000111', '2026-09-08', now());
insert into public.reviews (id, visit_id, dentist_id, patient_id, stars, text, price_accuracy) values
  ('00000000-0000-4000-8000-000000001508', '00000000-0000-4000-8000-000000001508', '00000000-0000-4000-8000-000000000111', '00000000-0000-4000-8000-000000000101', 1, 'Afvist anmeldelse med tekst til test.', 'much_higher');
select set_config('tm.system', 'on', false);
update public.reviews set moderation_status = 'rejected', rejection_reason = 'Test' where id = '00000000-0000-4000-8000-000000001508';
select set_config('tm.system', '', false);
select pg_temp.as_user('00000000-0000-4000-8000-000000000111');
select pg_temp.expect_count($$select count(*) from public.dentist_reviews() where review_id = '00000000-0000-4000-8000-000000001508'$$, 0, 'tandlæge ser ikke afvist anmeldelse');
select pg_temp.expect_count($$select count(*) from public.dentist_reviews() where moderation_status = 'rejected'$$, 0, 'tandlæge ser ingen afviste anmeldelser');
select pg_temp.as_user('00000000-0000-4000-8000-000000000101');
select pg_temp.expect_count($$select count(*) from public.reviews where id = '00000000-0000-4000-8000-000000001508' and moderation_status = 'rejected'$$, 1, 'patient ser sin afviste anmeldelse med status');

-- Afvist svar: tandlægen ser ikke teksten, kun at der ikke er svar.
select pg_temp.as_db_owner();
insert into public.review_replies (review_id, dentist_id, text) values
  ((select id from ids where name = 'r1503'), '00000000-0000-4000-8000-000000000111', 'Svar der afvises.');
select set_config('tm.system', 'on', false);
update public.review_replies set moderation_status = 'rejected', rejection_reason = 'Test' where review_id = (select id from ids where name = 'r1503');
select set_config('tm.system', '', false);
select pg_temp.as_user('00000000-0000-4000-8000-000000000111');
select pg_temp.expect_count($$select count(*) from public.dentist_reviews() where review_id = (select id from ids where name = 'r1503') and reply_status is null and reply_text is null$$, 1, 'afvist svar vises ikke for tandlægen (replyStatus none)');
select pg_temp.as_db_owner();

-- ---------- 7. Tandlæge kan ikke læse patient_id fra visits (security-gennemgang) ----------
select pg_temp.as_user('00000000-0000-4000-8000-000000000111');
select pg_temp.expect_count($$select count(*) from public.visits$$, 0, 'tandlæge kan ikke læse visits-tabellen direkte (inkl. patient_id)');
select pg_temp.expect_count($$select count(*) from public.dentist_visits() where visit_id = '00000000-0000-4000-8000-000000001501'$$, 1, 'tandlæge ser eget besøg via dentist_visits() (uden patient_id)');
select pg_temp.expect_count($$select count(*) from pg_proc p where p.proname = 'dentist_visits' and position('patient' in pg_get_function_result(p.oid)) = 0$$, 1, 'dentist_visits() returnerer ikke patient-felter');
select pg_temp.as_user('00000000-0000-4000-8000-000000000112');
select pg_temp.expect_count($$select count(*) from public.dentist_visits() where visit_id = '00000000-0000-4000-8000-000000001501'$$, 0, 'tandlæge Y ser ikke X''s besøg');
select pg_temp.as_user('00000000-0000-4000-8000-000000000101');
select pg_temp.expect_count($$select count(*) from public.visits where id = '00000000-0000-4000-8000-000000001501' and patient_id = '00000000-0000-4000-8000-000000000101'$$, 1, 'patienten ser stadig eget besøg med patient_id');
select pg_temp.as_db_owner();

select 'ALLE REVIEWS-TESTS PASSEDE' as resultat;
