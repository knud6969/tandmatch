-- RLS-tests for tandlægens forespørgselsvisning (dentist_request_detail, dentist_request_images, storage).
-- Kører efter skelet, trin2, ai_limits, review2 og security_rls (bruger deres fixtures).
-- Tandlæge X = ...0111 (verificeret), Y = ...0112 (verificeret). A = ...0101 (patient).

create function pg_temp.as_user(p_uid uuid, p_anon boolean default false) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_uid, 'role', 'authenticated', 'is_anonymous', p_anon)::text, false);
  execute 'set role authenticated';
end $$;

create function pg_temp.as_db_owner() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', false);
  execute 'reset role';
end $$;

create function pg_temp.expect_error(p_sql text, p_label text, p_expect text) returns void
language plpgsql as $$
declare st text;
begin
  execute p_sql;
  raise exception 'FEJL: forventede blokering men fik ingen: %', p_label;
exception when others then
  get stacked diagnostics st = returned_sqlstate;
  if sqlerrm like 'FEJL:%' then raise; end if;
  if st <> p_expect then
    raise exception 'FEJL: % forventede SQLSTATE % men fik % (%)', p_label, p_expect, st, sqlerrm;
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
-- Sendt forespørgsel 1101 med modtager X. Usendt kladde 1102. Forespørgsel 1103 sendt til Y (ikke X).
insert into public.requests (id, patient_id, category, questions_version, postal_code, answers) values
  ('00000000-0000-4000-8000-000000001101', '00000000-0000-4000-8000-000000000101', 'blegning', 'v0-prototype', '2000', '{"start":"hurtigst","aendring":["farve"]}'),
  ('00000000-0000-4000-8000-000000001102', '00000000-0000-4000-8000-000000000101', 'blegning', 'v0-prototype', '2000', '{}'),
  ('00000000-0000-4000-8000-000000001103', '00000000-0000-4000-8000-000000000101', 'blegning', 'v0-prototype', '2000', '{}');

-- Samtykker: C1 aktiv (billede 1111 og 1103), C2 trukket tilbage (billede 1112).
insert into public.consents (id, patient_id, type, text_version, granted_while_anonymous) values
  ('00000000-0000-4000-8000-000000001201', '00000000-0000-4000-8000-000000000101', 'image_upload', 'image_upload@v0-prototype', false);
insert into public.request_images (id, request_id, patient_id, consent_id, storage_path, width, height, bytes) values
  ('00000000-0000-4000-8000-000000001111', '00000000-0000-4000-8000-000000001101', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001201',
   '00000000-0000-4000-8000-000000000101/00000000-0000-4000-8000-000000001101/00000000-0000-4000-8000-000000001111.jpg', 10, 10, 10),
  ('00000000-0000-4000-8000-000000001113', '00000000-0000-4000-8000-000000001102', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001201',
   '00000000-0000-4000-8000-000000000101/00000000-0000-4000-8000-000000001102/00000000-0000-4000-8000-000000001113.jpg', 10, 10, 10);
insert into public.consents (id, patient_id, type, text_version, granted_while_anonymous) values
  ('00000000-0000-4000-8000-000000001202', '00000000-0000-4000-8000-000000000101', 'image_upload', 'image_upload@v0-prototype', false);
insert into public.request_images (id, request_id, patient_id, consent_id, storage_path, width, height, bytes) values
  ('00000000-0000-4000-8000-000000001112', '00000000-0000-4000-8000-000000001101', '00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000001202',
   '00000000-0000-4000-8000-000000000101/00000000-0000-4000-8000-000000001101/00000000-0000-4000-8000-000000001112.jpg', 10, 10, 10);
update public.consents set withdrawn_at = now() where id = '00000000-0000-4000-8000-000000001202';
-- Storage-objekter svarende til billedrækkerne (uploadet af serveren).
insert into storage.objects (bucket_id, name) values
  ('request-images', '00000000-0000-4000-8000-000000000101/00000000-0000-4000-8000-000000001101/00000000-0000-4000-8000-000000001111.jpg'),
  ('request-images', '00000000-0000-4000-8000-000000000101/00000000-0000-4000-8000-000000001101/00000000-0000-4000-8000-000000001112.jpg'),
  ('request-images', '00000000-0000-4000-8000-000000000101/00000000-0000-4000-8000-000000001102/00000000-0000-4000-8000-000000001113.jpg');

-- Send 1101 til X, 1103 til Y. Godkend opsummering på 1101 (ikke på 1103).
select set_config('tm.transition', 'on', false);
update public.requests set status = 'sent', sent_at = now(), expires_at = now() + interval '14 days' where id in ('00000000-0000-4000-8000-000000001101', '00000000-0000-4000-8000-000000001103');
select set_config('tm.transition', '', false);
select set_config('tm.system', 'on', false);
update public.requests set summary_text = 'Godkendt tekst til X', summary_approved_at = now() where id = '00000000-0000-4000-8000-000000001101';
select set_config('tm.system', '', false);
insert into public.request_recipients (request_id, dentist_id, distance_km) values
  ('00000000-0000-4000-8000-000000001101', '00000000-0000-4000-8000-000000000111', 1.5),
  ('00000000-0000-4000-8000-000000001103', '00000000-0000-4000-8000-000000000112', 2.5);

-- ---------- 1. Tandlæge X ser kun egne sendte forespørgsler ----------
select pg_temp.as_user('00000000-0000-4000-8000-000000000111');
select pg_temp.expect_count($$select count(*) from public.dentist_request_detail('00000000-0000-4000-8000-000000001101')$$, 1, 'X ser sin sendte forespørgsel');
select pg_temp.expect_count($$select count(*) from public.dentist_request_detail('00000000-0000-4000-8000-000000001103')$$, 0, 'X kan ikke se forespørgsel sendt til Y');
select pg_temp.expect_count($$select count(*) from public.dentist_request_detail('00000000-0000-4000-8000-000000001102')$$, 0, 'X kan ikke se usendt kladde');
select pg_temp.expect_count($$select count(*) from public.dentist_request_detail('00000000-0000-4000-8000-000000001101') where summary_text = 'Godkendt tekst til X'$$, 1, 'godkendt opsummering vises til modtager');

-- ---------- 2. Billeder: kun aktivt samtykke, kun sendt forespørgsel ----------
select pg_temp.expect_count($$select count(*) from public.dentist_request_images('00000000-0000-4000-8000-000000001101')$$, 1, 'X ser kun billedet med aktivt samtykke (trukket billede skjult)');
select pg_temp.expect_count($$select count(*) from public.dentist_request_images('00000000-0000-4000-8000-000000001102')$$, 0, 'X ser ikke billeder på usendt kladde');
select pg_temp.expect_count($$select count(*) from public.dentist_request_images('00000000-0000-4000-8000-000000001103')$$, 0, 'X ser ikke billeder på forespørgsel sendt til Y');
select pg_temp.expect_count($$select public.is_shared_image_path('00000000-0000-4000-8000-000000000101/00000000-0000-4000-8000-000000001101/00000000-0000-4000-8000-000000001111.jpg')::int$$, 1, 'delt billede er læsbart i storage-policy');
select pg_temp.expect_count($$select count(*) from storage.objects where name = '00000000-0000-4000-8000-000000000101/00000000-0000-4000-8000-000000001101/00000000-0000-4000-8000-000000001112.jpg'$$, 0, 'X kan ikke hente trukket billede fra storage');
select pg_temp.expect_count($$select count(*) from storage.objects where name = '00000000-0000-4000-8000-000000000101/00000000-0000-4000-8000-000000001101/00000000-0000-4000-8000-000000001111.jpg'$$, 1, 'X kan hente delt billede fra storage');

-- ---------- 3. Tandlæge Y ser ikke X's forespørgsel eller billeder ----------
select pg_temp.as_user('00000000-0000-4000-8000-000000000112');
select pg_temp.expect_count($$select count(*) from public.dentist_request_detail('00000000-0000-4000-8000-000000001101')$$, 0, 'Y kan ikke se forespørgsel sendt til X');
select pg_temp.expect_count($$select count(*) from public.dentist_request_images('00000000-0000-4000-8000-000000001101')$$, 0, 'Y ser ikke billeder på X''s forespørgsel');
select pg_temp.expect_count($$select count(*) from storage.objects where name like '00000000-0000-4000-8000-000000000101/00000000-0000-4000-8000-000000001101/%'$$, 0, 'Y kan ikke hente storage-objekter for X''s forespørgsel');
select pg_temp.expect_count($$select count(*) from public.dentist_request_detail('00000000-0000-4000-8000-000000001103')$$, 1, 'Y ser sin egen forespørgsel');

-- ---------- 4. Tandlæger læser ikke requests direkte; detaljer har ingen patient_id ----------
select pg_temp.as_user('00000000-0000-4000-8000-000000000111');
select pg_temp.expect_count($$select count(*) from public.requests$$, 0, 'tandlæge kan ikke læse requests-tabellen');
select pg_temp.expect_count($$select count(*) from pg_proc p where p.proname in ('dentist_request_detail','dentist_request_images') and position('patient_id' in pg_get_function_result(p.oid)) = 0$$, 2, 'detalje-funktioner returnerer ikke patient_id');
select pg_temp.as_db_owner();

-- ---------- 5. Svar og recipient-status (reviewer runde 4) ----------
-- Uverificeret tandlæge U = ...0114 (signup-trigger opretter den som ikke verificeret).
select pg_temp.as_db_owner();
insert into auth.users (id, email, raw_user_meta_data, is_anonymous) values
  ('00000000-0000-4000-8000-000000000114', 'du4@example.test', '{"role":"dentist","full_name":"Test Tandlæge U4","authorization_id":"TST-1104"}', false);
insert into public.request_recipients (request_id, dentist_id, distance_km) values
  ('00000000-0000-4000-8000-000000001101', '00000000-0000-4000-8000-000000000114', 3.0);

-- Modtager X svarer på åben forespørgsel 1101 (sendt, udløber om 14 dage).
select pg_temp.as_user('00000000-0000-4000-8000-000000000111');
select pg_temp.expect_updated($$insert into public.responses (request_id, dentist_id, assessment, price_min, price_max) values ('00000000-0000-4000-8000-000000001101', '00000000-0000-4000-8000-000000000111', 'Test-vurdering', 1000, 2000)$$, 1, 'modtager X kan svare på åben forespørgsel');
select pg_temp.as_db_owner();
select pg_temp.expect_count($$select count(*) from public.request_recipients where request_id = '00000000-0000-4000-8000-000000001101' and dentist_id = '00000000-0000-4000-8000-000000000111' and status = 'responded'$$, 1, 'svar sætter modtagerstatus til responded');

-- Ikke-modtager Y kan ikke svare på X's forespørgsel. Uverificeret U kan hverken svare eller se noget.
select pg_temp.as_user('00000000-0000-4000-8000-000000000112');
select pg_temp.expect_error($$insert into public.responses (request_id, dentist_id, assessment, price_min, price_max) values ('00000000-0000-4000-8000-000000001101', '00000000-0000-4000-8000-000000000112', 'Ikke modtager', 1000, 2000)$$, 'ikke-modtager kan ikke svare', '42501');
select pg_temp.as_user('00000000-0000-4000-8000-000000000114');
select pg_temp.expect_count($$select count(*) from public.dentist_inbox(null)$$, 0, 'uverificeret tandlæge ser ingen indbakke');
select pg_temp.expect_count($$select count(*) from public.dentist_request_status('00000000-0000-4000-8000-000000001101')$$, 0, 'uverificeret tandlæge får ingen status');
select pg_temp.expect_count($$select count(*) from public.dentist_request_detail('00000000-0000-4000-8000-000000001101')$$, 0, 'uverificeret tandlæge ser ingen detaljer');
select pg_temp.expect_count($$select count(*) from public.dentist_request_images('00000000-0000-4000-8000-000000001101')$$, 0, 'uverificeret tandlæge ser ingen billeder');
select pg_temp.expect_count($$select count(*) from storage.objects where name like '00000000-0000-4000-8000-000000000101/00000000-0000-4000-8000-000000001101/%'$$, 0, 'uverificeret tandlæge henter ingen storage-objekter');
select pg_temp.expect_error($$insert into public.responses (request_id, dentist_id, assessment, price_min, price_max) values ('00000000-0000-4000-8000-000000001101', '00000000-0000-4000-8000-000000000114', 'Uverificeret', 1000, 2000)$$, 'uverificeret tandlæge kan ikke svare', '42501');

-- Tandlæge X kan ikke læse request_images direkte, heller ikke efter samtykke er trukket tilbage.
select pg_temp.as_user('00000000-0000-4000-8000-000000000111');
select pg_temp.expect_count($$select count(*) from public.request_images$$, 0, 'tandlæge kan ikke læse request_images direkte');
select pg_temp.expect_count($$select count(*) from public.request_images where request_id = '00000000-0000-4000-8000-000000001101'$$, 0, 'tandlæge kan ikke læse billedrækker på modtaget forespørgsel');
select pg_temp.as_db_owner();
update public.consents set withdrawn_at = now() where id = '00000000-0000-4000-8000-000000001201';
select pg_temp.as_user('00000000-0000-4000-8000-000000000111');
select pg_temp.expect_count($$select count(*) from public.request_images$$, 0, 'tandlæge kan stadig ikke læse request_images efter trukket samtykke');
select pg_temp.expect_count($$select count(*) from public.dentist_request_images('00000000-0000-4000-8000-000000001101')$$, 0, 'efter trukket samtykke: billede med trukket samtykke er væk fra dentist-funktionen');

-- Tilbagetrækning af svar: modtagerstatus går tilbage til new (ikke responded).
select pg_temp.expect_updated($$update public.responses set status = 'withdrawn' where request_id = '00000000-0000-4000-8000-000000001101' and dentist_id = '00000000-0000-4000-8000-000000000111'$$, 1, 'modtager X trækker sit svar tilbage');
select pg_temp.as_db_owner();
select pg_temp.expect_count($$select count(*) from public.request_recipients where request_id = '00000000-0000-4000-8000-000000001101' and dentist_id = '00000000-0000-4000-8000-000000000111' and status = 'new'$$, 1, 'tilbagetrukket svar sætter modtagerstatus til new');

select 'ALLE INBOX-DETALJE-TESTS PASSEDE' as resultat;
