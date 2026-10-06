-- RLS- og triggertests for trin 2 (forespørgsler, modtagere, AI-chat, billeder, storage, afsendelse).
-- Kører efter 00_supabase_auth_stub.sql, alle migrationer og skelet_rls.sql. Alle personer er fiktive.
-- Fejler scriptet, er mindst én sikkerhedsregel brudt.

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
  if n <> p_expected then
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

-- ---------- Fixtures (som ejer, uden RLS) ----------
select pg_temp.as_db_owner();

insert into auth.users (id, email, raw_user_meta_data, is_anonymous) values
  ('00000000-0000-4000-8000-000000000101', 'pa2@example.test', '{"role":"patient","first_name":"Test A2"}', false),
  ('00000000-0000-4000-8000-000000000102', 'pb2@example.test', '{"role":"patient","first_name":"Test B2"}', false),
  ('00000000-0000-4000-8000-000000000103', null, '{}', true),
  ('00000000-0000-4000-8000-000000000111', 'dx2@example.test', '{"role":"dentist","full_name":"Test Tandlæge X2","authorization_id":"TST-1101"}', false),
  ('00000000-0000-4000-8000-000000000112', 'dy2@example.test', '{"role":"dentist","full_name":"Test Tandlæge Y2","authorization_id":"TST-1102"}', false),
  ('00000000-0000-4000-8000-000000000113', 'dz2@example.test', '{"role":"dentist","full_name":"Test Tandlæge Z2","authorization_id":"TST-1103"}', false);

insert into public.postal_codes (postal_code, city, lat, lng) values
  ('2000', 'Testby Nord', 55.676, 12.531),
  ('2100', 'Testby Øst', 55.705, 12.570);

insert into public.clinics (id, name, address, postal_code, city, created_by) values
  ('00000000-0000-4000-8000-000000000301', 'Test Klinik K1', 'Testvej 10', '2000', 'Testby Nord', '00000000-0000-4000-8000-000000000111'),
  ('00000000-0000-4000-8000-000000000302', 'Test Klinik K2', 'Testvej 20', '2100', 'Testby Øst', '00000000-0000-4000-8000-000000000112'),
  ('00000000-0000-4000-8000-000000000303', 'Test Klinik K3', 'Testvej 30', '2000', 'Testby Nord', '00000000-0000-4000-8000-000000000113');

alter table public.dentists disable trigger dentists_guard;
update public.dentists set is_verified = true, clinic_id = '00000000-0000-4000-8000-000000000301',
  accepts_cosmetic = true, cosmetic_categories = '{diastema,blegning}' where id = '00000000-0000-4000-8000-000000000111';
update public.dentists set is_verified = true, clinic_id = '00000000-0000-4000-8000-000000000302',
  accepts_cosmetic = true, cosmetic_categories = '{blegning}' where id = '00000000-0000-4000-8000-000000000112';
-- Z: verificeret, men tager ikke kosmetiske sager -> må aldrig matches.
update public.dentists set is_verified = true, clinic_id = '00000000-0000-4000-8000-000000000303',
  accepts_cosmetic = false where id = '00000000-0000-4000-8000-000000000113';

alter table public.dentists enable trigger dentists_guard;

insert into public.consents (patient_id, type, text_version, granted_while_anonymous) values
  ('00000000-0000-4000-8000-000000000103', 'ai_processing', 'ai_processing@v0-prototype', true),
  ('00000000-0000-4000-8000-000000000103', 'image_upload', 'image_upload@v0-prototype', true),
  ('00000000-0000-4000-8000-000000000101', 'ai_processing', 'ai_processing@v0-prototype', false),
  ('00000000-0000-4000-8000-000000000101', 'image_upload', 'image_upload@v0-prototype', false);

-- Forespørgsler (kladder) indsættes som ejer for at have kendte id'er.
insert into public.requests (id, patient_id, category, questions_version) values
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', 'blegning', 'v0-prototype'),
  ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000101', 'diastema', 'v0-prototype'),
  ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000103', 'blegning', 'v0-prototype');

-- ---------- 1. Forespørgsler: ejerskab og kladde-regler ----------
select pg_temp.as_user('00000000-0000-4000-8000-000000000101');
select pg_temp.expect_count($$select count(*) from public.requests$$, 2, 'Patient A ser sine to kladder');
select pg_temp.expect_count($$select count(*) from public.requests where id = '00000000-0000-4000-8000-000000000203'$$, 0, 'Patient A ser ikke anonym C''s kladde');
select pg_temp.expect_error($$insert into public.requests (patient_id, category, questions_version, status, sent_at, expires_at) values ('00000000-0000-4000-8000-000000000101', 'facings', 'v0-prototype', 'sent', now(), now())$$, 'patient kan ikke oprette forespørgsel direkte som sendt', '42501');
select pg_temp.expect_error($$insert into public.requests (patient_id, category, questions_version) values ('00000000-0000-4000-8000-000000000102', 'facings', 'v0-prototype')$$, 'patient kan ikke oprette forespørgsel på andens vegne', '42501');
select pg_temp.expect_updated($$update public.requests set category = 'blegning' where id = '00000000-0000-4000-8000-000000000201'$$, 1, 'patient kan redigere egen kladde');
select pg_temp.expect_error($$update public.requests set status = 'sent', sent_at = now(), expires_at = now() where id = '00000000-0000-4000-8000-000000000201'$$, 'patient kan ikke sætte status direkte', '42501');
select pg_temp.expect_updated($$update public.requests set answers = '{"x":"y"}' where id = '00000000-0000-4000-8000-000000000203'$$, 0, 'patient kan ikke redigere anden patients forespørgsel');
select pg_temp.expect_error($$insert into public.request_recipients (request_id, dentist_id, distance_km) values ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000111', 1)$$, 'patient kan ikke indsætte modtagere', '42501');

-- Anonym C: én kladde, og ingen adgang til andres.
select pg_temp.as_user('00000000-0000-4000-8000-000000000103', true);
select pg_temp.expect_count($$select count(*) from public.requests$$, 1, 'Anonym C ser kun egen kladde');
select pg_temp.expect_error($$insert into public.requests (patient_id, category, questions_version) values ('00000000-0000-4000-8000-000000000103', 'diastema', 'v0-prototype')$$, 'anonym: højst én kladde (ANON_DRAFT_LIMIT)', 'P0001');
select pg_temp.expect_error($$select public.send_request('00000000-0000-4000-8000-000000000203')$$, 'anonym kan ikke sende forespørgsel', '42501');

-- ---------- 2. Afsendelse og matching ----------
-- A: godkend opsummering og postnummer, og giv health_data_sharing (kun med konto).
select pg_temp.as_user('00000000-0000-4000-8000-000000000101');
select pg_temp.expect_error($$select public.send_request('00000000-0000-4000-8000-000000000201')$$, 'send uden godkendt opsummering afvises', 'P0001');
select pg_temp.expect_updated($$update public.requests set postal_code = '2000' where id = '00000000-0000-4000-8000-000000000201'$$, 1, 'patient skriver opsummering og postnummer på egen kladde');
select pg_temp.expect_count($$select (public.approve_summary('00000000-0000-4000-8000-000000000201', 'Test-opsummering') is not null)::int$$, 1, 'patient godkender opsummering via approve_summary');
select pg_temp.expect_updated($$update public.requests set answers = '{"x":"y"}' where id = '00000000-0000-4000-8000-000000000201'$$, 1, 'patient ændrer indhold på kladde');
select pg_temp.expect_count($$select count(*) from public.requests where id = '00000000-0000-4000-8000-000000000201' and summary_approved_at is null$$, 1, 'ændring af indhold nulstiller godkendelse');
select pg_temp.expect_count($$select (public.approve_summary('00000000-0000-4000-8000-000000000201', 'Test-opsummering 2') is not null)::int$$, 1, 'ny godkendelse efter ændring');
select pg_temp.expect_error($$select public.send_request('00000000-0000-4000-8000-000000000201')$$, 'send uden health_data_sharing afvises', '42501');
select pg_temp.expect_updated($$insert into public.consents (patient_id, type, text_version, granted_while_anonymous) values ('00000000-0000-4000-8000-000000000101', 'health_data_sharing', 'health_data_sharing@v0-prototype', false)$$, 1, 'patient giver health_data_sharing');
select pg_temp.expect_count($$select public.send_request('00000000-0000-4000-8000-000000000201')$$, 2, 'send matcher X og Y (Z tager ikke kosmetik)');
select pg_temp.expect_count($$select count(*) from public.requests where id = '00000000-0000-4000-8000-000000000201' and status = 'sent' and sharing_consent_id is not null$$, 1, 'forespørgsel er sendt med samtykke-reference');
select pg_temp.expect_error($$select public.send_request('00000000-0000-4000-8000-000000000201')$$, 'dobbelt afsendelse afvises', 'P0001');
select pg_temp.expect_updated($$update public.requests set category = 'facings' where id = '00000000-0000-4000-8000-000000000201'$$, 0, 'sendt forespørgsel kan ikke redigeres (RLS: 0 rækker)');
select pg_temp.expect_count($$select count(*) from public.request_recipients where request_id = '00000000-0000-4000-8000-000000000201'$$, 2, 'patient ser modtagere på egen forespørgsel');

-- ---------- 3. Tandlæger ----------
select pg_temp.as_user('00000000-0000-4000-8000-000000000111');
select pg_temp.expect_count($$select count(*) from public.dentist_inbox(null) where request_id = '00000000-0000-4000-8000-000000000201'$$, 1, 'modtager X ser forespørgslen via dentist_inbox');
select pg_temp.expect_count($$select count(*) from public.requests where id = '00000000-0000-4000-8000-000000000201'$$, 0, 'modtager X kan ikke læse requests-rækken direkte');
select pg_temp.expect_count($$select count(*) from public.requests where id = '00000000-0000-4000-8000-000000000202'$$, 0, 'X ser ikke A''s kladde');
select pg_temp.expect_count($$select count(*) from public.request_recipients$$, 1, 'X ser kun egen modtagerrække');
select pg_temp.expect_count($$select count(*) from public.request_recipients where dentist_id = '00000000-0000-4000-8000-000000000112'$$, 0, 'X ser ikke Y''s modtagerrække');
select pg_temp.expect_updated($$update public.requests set category = 'blegning' where id = '00000000-0000-4000-8000-000000000201'$$, 0, 'tandlæge kan ikke redigere forespørgsel');
select pg_temp.expect_error($$insert into public.request_recipients (request_id, dentist_id, distance_km) values ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000111', 0)$$, 'tandlæge kan ikke selv tilføje sig som modtager', '42501');
select pg_temp.expect_error($$insert into public.requests (patient_id, category, questions_version) values ('00000000-0000-4000-8000-000000000111', 'facings', 'v0-prototype')$$, 'tandlæge kan ikke oprette forespørgsel', '42501');

select pg_temp.as_user('00000000-0000-4000-8000-000000000112');
select pg_temp.expect_count($$select count(*) from public.dentist_inbox(null) where request_id = '00000000-0000-4000-8000-000000000201'$$, 1, 'modtager Y ser forespørgslen via dentist_inbox');
select pg_temp.expect_count($$select count(*) from public.request_recipients where dentist_id = '00000000-0000-4000-8000-000000000111'$$, 0, 'Y ser ikke X''s modtagerrække');

select pg_temp.as_user('00000000-0000-4000-8000-000000000113');
select pg_temp.expect_count($$select count(*) from public.requests where id = '00000000-0000-4000-8000-000000000201'$$, 0, 'ikke-matchet Z ser ikke forespørgslen');
select pg_temp.expect_count($$select count(*) from public.request_recipients$$, 0, 'ikke-matchet Z ser ingen modtagerrækker');

-- Anonym C's kladde er usynlig for alle tandlæger.
select pg_temp.as_user('00000000-0000-4000-8000-000000000111');
select pg_temp.expect_count($$select count(*) from public.requests where id = '00000000-0000-4000-8000-000000000203'$$, 0, 'tandlæge ser ikke anonym kladde');

-- ---------- 4. AI-chat ----------
select pg_temp.as_user('00000000-0000-4000-8000-000000000103', true);
select pg_temp.expect_updated($$insert into public.ai_conversations (request_id, patient_id, ai_consent_id) values ('00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000103', (select id from public.consents where patient_id = '00000000-0000-4000-8000-000000000103' and type = 'ai_processing'))$$, 1, 'anonym opretter samtale med aktivt ai_processing');
select pg_temp.expect_updated($$insert into public.ai_messages (conversation_id, patient_id, role, content) values ((select id from public.ai_conversations where request_id = '00000000-0000-4000-8000-000000000203'), '00000000-0000-4000-8000-000000000103', 'user', 'Test-besked')$$, 1, 'anonym skriver patientbesked');
select pg_temp.expect_count($$select user_message_count from public.ai_conversations where request_id = '00000000-0000-4000-8000-000000000203'$$, 1, 'trigger tæller patientbesked');
select pg_temp.expect_error($$insert into public.ai_messages (conversation_id, patient_id, role, content) values ((select id from public.ai_conversations where request_id = '00000000-0000-4000-8000-000000000201'), '00000000-0000-4000-8000-000000000103', 'user', 'Ikke mit')$$, 'anonym kan ikke skrive i anden patients samtale', '42501');
select pg_temp.expect_count($$select count(*) from public.ai_conversations$$, 1, 'anonym ser kun egen samtale');
select pg_temp.expect_count($$select count(*) from public.ai_messages$$, 1, 'anonym ser kun egne chatbeskeder');
select pg_temp.expect_updated($$update public.ai_conversations set user_message_count = 0 where request_id = '00000000-0000-4000-8000-000000000203'$$, 0, 'patient kan ikke nulstille tæller (ingen UPDATE-policy)');
select pg_temp.expect_error($$select public.send_request('00000000-0000-4000-8000-000000000203')$$, 'anonym kan ikke sende (ACCOUNT_REQUIRED)', '42501');
select pg_temp.expect_error($$select public.try_consume_anonymous_ai_call()$$, 'anonym klient kan ikke kalde det fælles AI-loft direkte', '42501');
select pg_temp.expect_count($$select count(*) from public.ai_usage_daily$$, 0, 'ai_usage_daily er ikke læsbar for patienter');

-- Patient A opretter samtale for sin sendte forespørgsel: samtalen skal lukkes ved afsendelse (sket ovenfor).
select pg_temp.as_user('00000000-0000-4000-8000-000000000101');
select pg_temp.expect_count($$select count(*) from public.ai_conversations where request_id = '00000000-0000-4000-8000-000000000201'$$, 0, 'A har ingen samtale på forespørgslen før send (ingen læk fra X)');
select pg_temp.expect_error($$insert into public.ai_conversations (request_id, patient_id, ai_consent_id) values ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', (select id from public.consents where patient_id = '00000000-0000-4000-8000-000000000101' and type = 'ai_processing'))$$, 'samtale kan ikke oprettes på sendt forespørgsel', '42501');

select pg_temp.as_user('00000000-0000-4000-8000-000000000111');
select pg_temp.expect_count($$select count(*) from public.ai_conversations$$, 0, 'tandlæge ser aldrig AI-samtaler');
select pg_temp.expect_count($$select count(*) from public.ai_messages$$, 0, 'tandlæge ser aldrig AI-beskeder');

-- ---------- 5. Billeder og storage ----------
-- Anonym C: giver image_upload lige før upload (samtykke findes fra fixtures) og uploader til egen kladde.
select pg_temp.as_user('00000000-0000-4000-8000-000000000103', true);
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) values ('request-images', '00000000-0000-4000-8000-000000000103/00000000-0000-4000-8000-000000000203/00000000-0000-4000-8000-0000000000c1.jpg')$$, 'anonym uploader til egen mappe med samtykke', '42501');
select pg_temp.expect_error($$insert into public.request_images (id, request_id, patient_id, consent_id, storage_path, width, height, bytes) values ('00000000-0000-4000-8000-0000000000c1', '00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000103', (select id from public.consents where patient_id = '00000000-0000-4000-8000-000000000103' and type = 'image_upload'), '00000000-0000-4000-8000-000000000103/00000000-0000-4000-8000-000000000203/00000000-0000-4000-8000-0000000000c1.jpg', 800, 600, 12345)$$, 'anonym indsætter billedrække med samtykke', '42501');
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) values ('request-images', '00000000-0000-4000-8000-000000000101/00000000-0000-4000-8000-000000000201/x.jpg')$$, 'anonym kan ikke uploade til anden patients mappe', '42501');
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) values ('request-images', '00000000-0000-4000-8000-000000000103/00000000-0000-4000-8000-000000000201/x.jpg')$$, 'anonym kan ikke uploade til anden forespørgsel', '42501');
select pg_temp.expect_error($$insert into public.request_images (id, request_id, patient_id, consent_id, storage_path, width, height, bytes) values ('00000000-0000-4000-8000-0000000000c2', '00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000103', (select id from public.consents where patient_id = '00000000-0000-4000-8000-000000000101' and type = 'image_upload'), '00000000-0000-4000-8000-000000000103/00000000-0000-4000-8000-000000000203/00000000-0000-4000-8000-0000000000c2.jpg', 1, 1, 1)$$, 'billedrække med andens samtykke afvises', '42501');
select pg_temp.expect_error($$insert into public.request_images (id, request_id, patient_id, consent_id, storage_path, width, height, bytes) values ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000103', (select id from public.consents where patient_id = '00000000-0000-4000-8000-000000000103' and type = 'image_upload'), 'forkert/sti.jpg', 1, 1, 1)$$, 'billedrække med ugyldig sti afvises', '42501');

-- Grænse: højst 5 billeder pr. forespørgsel (c1 er den første).
select pg_temp.as_db_owner();
insert into public.request_images (id, request_id, patient_id, consent_id, storage_path, width, height, bytes)
select ('00000000-0000-4000-8000-0000000000' || lpad(g::text, 2, '0'))::uuid, '00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000103',
       (select id from public.consents where patient_id = '00000000-0000-4000-8000-000000000103' and type = 'image_upload'),
       '00000000-0000-4000-8000-000000000103/00000000-0000-4000-8000-000000000203/' || ('00000000-0000-4000-8000-0000000000' || lpad(g::text, 2, '0')) || '.jpg', 10, 10, 10
  from generate_series(2, 5) g;
select pg_temp.as_user('00000000-0000-4000-8000-000000000103', true);
select pg_temp.expect_error($$insert into public.request_images (id, request_id, patient_id, consent_id, storage_path, width, height, bytes) values ('00000000-0000-4000-8000-0000000000c9', '00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000103', (select id from public.consents where patient_id = '00000000-0000-4000-8000-000000000103' and type = 'image_upload'), '00000000-0000-4000-8000-000000000103/00000000-0000-4000-8000-000000000203/00000000-0000-4000-8000-0000000000c9.jpg', 10, 10, 10)$$, 'sjette billede afvises (IMAGE_LIMIT)', '42501');
select pg_temp.expect_count($$select count(*) from public.request_images$$, 4, 'anonym ser sine fire fixture-billeder (patientens direkte upload er afvist)');

-- A uploader til sin sendte forespørgsel (201) og en kladde (202).
select pg_temp.as_user('00000000-0000-4000-8000-000000000101');
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) values ('request-images', '00000000-0000-4000-8000-000000000101/00000000-0000-4000-8000-000000000201/00000000-0000-4000-8000-0000000000a1.jpg')$$, 'A kan ikke uploade til sendt forespørgsel', '42501');
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) values ('request-images', '00000000-0000-4000-8000-000000000101/00000000-0000-4000-8000-000000000202/00000000-0000-4000-8000-0000000000a2.jpg')$$, 'A uploader til kladde', '42501');
select pg_temp.expect_error($$insert into public.request_images (id, request_id, patient_id, consent_id, storage_path, width, height, bytes) values ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000101', (select id from public.consents where patient_id = '00000000-0000-4000-8000-000000000101' and type = 'image_upload'), '00000000-0000-4000-8000-000000000101/00000000-0000-4000-8000-000000000202/00000000-0000-4000-8000-0000000000a2.jpg', 10, 10, 10)$$, 'A indsætter billede på kladde', '42501');

-- Tandlæge X ser billeder og storage-objekter for sendt forespørgsel A, men ikke kladdens.
select pg_temp.as_user('00000000-0000-4000-8000-000000000111');
select pg_temp.expect_count($$select count(*) from public.request_images where request_id = '00000000-0000-4000-8000-000000000202'$$, 0, 'X ser ikke billeder på A''s kladde');
select pg_temp.expect_count($$select count(*) from storage.objects where name like '00000000-0000-4000-8000-000000000101/00000000-0000-4000-8000-000000000202/%'$$, 0, 'X ser ikke kladdens storage-objekter');
select pg_temp.expect_count($$select count(*) from storage.objects where name like '00000000-0000-4000-8000-000000000101/00000000-0000-4000-8000-000000000201/%'$$, 0, 'X ser ingen storage-objekter på sendt forespørgsel før upload');
select pg_temp.as_db_owner();
insert into storage.objects (bucket_id, name) values ('request-images', '00000000-0000-4000-8000-000000000101/00000000-0000-4000-8000-000000000201/00000000-0000-4000-8000-0000000000a3.jpg');
-- Fixture: billede på en allerede sendt forespørgsel. Triggeren kræver kladde, så den slås fra for denne ene fixture.
alter table public.request_images disable trigger request_images_before_insert;
insert into public.request_images (id, request_id, patient_id, consent_id, storage_path, width, height, bytes) values ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', (select id from public.consents where patient_id = '00000000-0000-4000-8000-000000000101' and type = 'image_upload'), '00000000-0000-4000-8000-000000000101/00000000-0000-4000-8000-000000000201/00000000-0000-4000-8000-0000000000a3.jpg', 10, 10, 10);
alter table public.request_images enable trigger request_images_before_insert;
select pg_temp.as_user('00000000-0000-4000-8000-000000000111');
select pg_temp.expect_count($$select count(*) from public.request_images where request_id = '00000000-0000-4000-8000-000000000201'$$, 0, 'modtager X læser ikke billedrækker direkte (kun dentist_request_images)');
select pg_temp.expect_count($$select count(*) from storage.objects where name like '00000000-0000-4000-8000-000000000101/00000000-0000-4000-8000-000000000201/%'$$, 1, 'modtager X ser storage-objekt på sendt forespørgsel');
select pg_temp.as_user('00000000-0000-4000-8000-000000000113');
select pg_temp.expect_count($$select count(*) from public.request_images$$, 0, 'ikke-matchet Z ser ingen billeder');
select pg_temp.expect_count($$select count(*) from storage.objects where bucket_id = 'request-images'$$, 0, 'ikke-matchet Z ser ingen storage-objekter');

-- Anonym C ser ikke A's billeder; A kan ikke slette C's.
select pg_temp.as_user('00000000-0000-4000-8000-000000000103', true);
select pg_temp.expect_count($$select count(*) from public.request_images where patient_id = '00000000-0000-4000-8000-000000000101'$$, 0, 'anonym ser ikke A''s billeder');
select pg_temp.expect_count($$select count(*) from storage.objects where name like '00000000-0000-4000-8000-000000000101/%'$$, 0, 'anonym ser ikke A''s storage-objekter');
select pg_temp.expect_count($$with d as (delete from storage.objects where name like '00000000-0000-4000-8000-000000000101/%' returning 1) select count(*) from d$$, 0, 'anonym kan ikke slette A''s filer');

-- Tilbagetrukket image_upload giver ingen nye uploads.
select pg_temp.as_db_owner();
update public.consents set withdrawn_at = now() where patient_id = '00000000-0000-4000-8000-000000000103' and type = 'image_upload';
select pg_temp.as_user('00000000-0000-4000-8000-000000000103', true);
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) values ('request-images', '00000000-0000-4000-8000-000000000103/00000000-0000-4000-8000-000000000203/00000000-0000-4000-8000-0000000000d1.jpg')$$, 'upload uden aktivt image_upload afvises', '42501');

-- ---------- 6. Anonym AI-samtale: lukning ved 30 og tilbagetrukket ai_processing ----------
select pg_temp.as_db_owner();
insert into public.ai_messages (conversation_id, patient_id, role, content)
select c.id, '00000000-0000-4000-8000-000000000103', 'user', 'Besked ' || g
  from public.ai_conversations c, generate_series(2, 30) g
 where c.request_id = '00000000-0000-4000-8000-000000000203';
select pg_temp.expect_count($$select user_message_count::bigint from public.ai_conversations where request_id = '00000000-0000-4000-8000-000000000203'$$, 30, 'samtale tæller 30 patientbeskeder');
select pg_temp.expect_count($$select count(*) from public.ai_conversations where request_id = '00000000-0000-4000-8000-000000000203' and status = 'closed'$$, 1, 'samtale lukkes ved 30');

-- Samtykke trukket tilbage: ingen flere beskeder.
select pg_temp.as_db_owner();
update public.consents set withdrawn_at = now() where patient_id = '00000000-0000-4000-8000-000000000103' and type = 'ai_processing';
select pg_temp.as_user('00000000-0000-4000-8000-000000000103', true);
select pg_temp.expect_error($$insert into public.ai_messages (conversation_id, patient_id, role, content) select id, '00000000-0000-4000-8000-000000000103', 'user', 'Efter tilbagetrækning' from public.ai_conversations where request_id = '00000000-0000-4000-8000-000000000203'$$, 'besked uden aktivt ai_processing afvises', '42501');

select pg_temp.as_db_owner();
select 'ALLE TRIN 2 RLS-TESTS PASSEDE' as resultat;
