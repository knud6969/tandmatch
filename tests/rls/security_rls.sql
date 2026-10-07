-- Sikkerhedstests (security-gennemgang). Kører efter skelet, trin2, ai_limits og review2 (bruger deres fixtures).

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

create function pg_temp.as_service() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', false);
  execute 'set role service_role';
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

-- Patient A = ...0101, tandlæge X = ...0111 (modtager af 201), B = ...0102.
-- ---------- 1. Billeder skrives kun af serveren ----------
select pg_temp.as_user('00000000-0000-4000-8000-000000000101');
select pg_temp.expect_error($$insert into public.request_images (id, request_id, patient_id, consent_id, storage_path, width, height, bytes) values ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000101', (select id from public.consents where patient_id = '00000000-0000-4000-8000-000000000101' and type = 'image_upload' limit 1), '00000000-0000-4000-8000-000000000202/00000000-0000-4000-8000-0000000000f1.jpg', 1, 1, 1)$$, 'patient kan ikke indsætte billedrække direkte', '42501');
select pg_temp.expect_error($$update public.request_images set ai_description = 'Injiceret', ai_quality = 'ok' where request_id = '00000000-0000-4000-8000-000000000202'$$, 'patient kan ikke skrive ai_description/ai_quality', '42501');
select pg_temp.expect_error($$insert into storage.objects (bucket_id, name) values ('request-images', '00000000-0000-4000-8000-000000000202/00000000-0000-4000-8000-0000000000f2.jpg')$$, 'patient kan ikke uploade storage-objekt direkte', '42501');
select pg_temp.expect_error($$delete from public.request_images where request_id = '00000000-0000-4000-8000-000000000202'$$, 'patient kan ikke slette billedrækker direkte', '42501');

-- ---------- 2. Tandlæger ser ikke requests-rækken (ai_summary, patient_id) ----------
select pg_temp.as_user('00000000-0000-4000-8000-000000000111');
select pg_temp.expect_count($$select count(*) from public.requests$$, 0, 'tandlæge kan ikke læse requests-tabellen direkte');
select pg_temp.expect_count($$select count(*) from (select ai_summary from public.requests where id = '00000000-0000-4000-8000-000000000201') x$$, 0, 'tandlæge kan ikke læse ai_summary (RLS: ingen rækker)');
select pg_temp.expect_count($$select count(*) from (select patient_id from public.requests where id = '00000000-0000-4000-8000-000000000201') x$$, 0, 'tandlæge kan ikke læse patient_id (RLS: ingen rækker)');
select pg_temp.expect_count($$select count(*) from public.dentist_inbox(null) where request_id = '00000000-0000-4000-8000-000000000201'$$, 1, 'tandlæge ser sin indbakke via dentist_inbox');
select pg_temp.expect_count($$select count(*) from public.dentist_inbox(null) where request_id = '00000000-0000-4000-8000-000000000202'$$, 0, 'tandlæge ser ikke kladder via dentist_inbox');
select pg_temp.expect_count($$select count(*) from public.dentist_inbox(null) where request_id = '00000000-0000-4000-8000-000000000201' and summary_text is not null$$, 1, 'godkendt opsummering vises for modtager');
select pg_temp.as_db_owner();
select pg_temp.expect_count($$select count(*) from pg_proc p where p.proname = 'dentist_inbox' and position('patient_id' in pg_get_function_result(p.oid)) = 0 and position('ai_summary' in pg_get_function_result(p.oid)) = 0$$, 1, 'dentist_inbox returnerer hverken patient_id eller ai_summary');
-- Uden godkendelse vises ingen opsummering til tandlægen.
select set_config('tm.system', 'on', false);
update public.requests set summary_approved_at = null where id = '00000000-0000-4000-8000-000000000201';
select set_config('tm.system', '', false);
select pg_temp.as_user('00000000-0000-4000-8000-000000000111');
select pg_temp.expect_count($$select count(*) from public.dentist_inbox(null) where request_id = '00000000-0000-4000-8000-000000000201' and summary_text is null$$, 1, 'ikke-godkendt opsummering vises ikke for tandlæge');
select pg_temp.as_db_owner();
select set_config('tm.system', 'on', false);
update public.requests set summary_approved_at = now() where id = '00000000-0000-4000-8000-000000000201';
select set_config('tm.system', '', false);

-- ---------- 3. Rate limit pr. nøgle (kun service role) ----------
select pg_temp.as_service();
select pg_temp.expect_count($$select public.consume_rate_limit('test:ip-1', 2)::int$$, 1, 'rate limit: forsøg 1 af 2');
select pg_temp.expect_count($$select public.consume_rate_limit('test:ip-1', 2)::int$$, 1, 'rate limit: forsøg 2 af 2');
select pg_temp.expect_count($$select public.consume_rate_limit('test:ip-1', 2)::int$$, 0, 'rate limit: forsøg 3 afvises');
select pg_temp.expect_count($$select public.consume_rate_limit('test:ip-2', 2)::int$$, 1, 'rate limit er pr. nøgle (anden IP uberørt)');
select pg_temp.as_user('00000000-0000-4000-8000-000000000101');
select pg_temp.expect_error($$select public.consume_rate_limit('test:ip-3', 10)$$, 'patient kan ikke kalde rate limit', '42501');
select pg_temp.as_anon_role();
select pg_temp.expect_error($$select public.consume_rate_limit('test:ip-3', 10)$$, 'anon kan ikke kalde rate limit', '42501');
select pg_temp.expect_error($$select public.is_admin()$$, 'anon kan ikke kalde is_admin', '42501');
select pg_temp.expect_error($$select public.has_active_consent('ai_processing')$$, 'anon kan ikke kalde has_active_consent', '42501');
select pg_temp.expect_error($$select public.auth_role()$$, 'anon kan ikke kalde auth_role', '42501');
select pg_temp.expect_error($$select public.ai_limit('anon_daily_ai_calls')$$, 'anon kan ikke læse ai_limit', '42501');

-- ---------- 4. Samtykker: serveren sætter tidspunkt, kun kendte versioner ----------
select pg_temp.as_user('00000000-0000-4000-8000-000000000101');
select pg_temp.expect_error($$insert into public.consents (patient_id, type, text_version, granted_while_anonymous) values ('00000000-0000-4000-8000-000000000101', 'image_upload', 'image_upload@falsk-version', false)$$, 'ukendt samtykke-version afvises', '42501');
select pg_temp.expect_updated($$insert into public.consents (patient_id, type, text_version, granted_while_anonymous, granted_at) values ('00000000-0000-4000-8000-000000000101', 'image_upload', 'image_upload@v0-prototype', false, now() + interval '5 years')$$, 1, 'klient kan ikke sætte fremtidig granted_at');
select pg_temp.expect_count($$select count(*) from public.consents where patient_id = '00000000-0000-4000-8000-000000000101' and type = 'image_upload' and granted_at > now() + interval '1 minute'$$, 0, 'ingen samtykke-række har fremtidig granted_at');
select pg_temp.expect_count($$select public.has_active_consent('image_upload')::int$$, 1, 'nyeste image_upload er aktivt');
select pg_temp.as_db_owner();
update public.consents set withdrawn_at = now() where patient_id = '00000000-0000-4000-8000-000000000101' and type = 'image_upload' and created_at = (select max(created_at) from public.consents where patient_id = '00000000-0000-4000-8000-000000000101' and type = 'image_upload');
select pg_temp.as_user('00000000-0000-4000-8000-000000000101');
select pg_temp.expect_count($$select public.has_active_consent('image_upload')::int$$, 0, 'seneste trukket tilbage er ikke aktivt');

-- ---------- 5. Triggeren på request_images gælder også serverens skrivninger ----------
select pg_temp.as_db_owner();
-- Nyt aktivt billedsamtykke for A (det forrige blev trukket tilbage i sektion 4).
insert into public.consents (patient_id, type, text_version, granted_while_anonymous) values ('00000000-0000-4000-8000-000000000101', 'image_upload', 'image_upload@v1-ai-disclosure', false);
insert into public.requests (id, patient_id, category, questions_version) values
  ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000101', 'diastema', 'v0-prototype');
select pg_temp.expect_error($$insert into public.request_images (id, request_id, patient_id, consent_id, storage_path, width, height, bytes) values ('00000000-0000-4000-8000-0000000009a1', '00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000101', (select id from public.consents where patient_id = '00000000-0000-4000-8000-000000000102' and type = 'image_upload' limit 1), '00000000-0000-4000-8000-000000000901/00000000-0000-4000-8000-0000000009a1.jpg', 1, 1, 1)$$, 'billede med anden patients samtykke afvises (server)', '42501');
select pg_temp.expect_error($$insert into public.request_images (id, request_id, patient_id, consent_id, storage_path, width, height, bytes) values ('00000000-0000-4000-8000-0000000009a2', '00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000101', (select id from public.consents where patient_id = '00000000-0000-4000-8000-000000000101' and type = 'image_upload' order by created_at desc limit 1), '00000000-0000-4000-8000-000000000901/forkert.jpg', 1, 1, 1)$$, 'billede med ugyldig sti afvises (server)', '22023');
select pg_temp.expect_error($$insert into public.request_images (id, request_id, patient_id, consent_id, storage_path, width, height, bytes) values ('00000000-0000-4000-8000-0000000009a3', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101', (select id from public.consents where patient_id = '00000000-0000-4000-8000-000000000101' and type = 'image_upload' order by created_at desc limit 1), '00000000-0000-4000-8000-000000000201/00000000-0000-4000-8000-0000000009a3.jpg', 1, 1, 1)$$, 'billede på sendt forespørgsel afvises (server)', '42501');
insert into public.request_images (id, request_id, patient_id, consent_id, storage_path, width, height, bytes)
select ('00000000-0000-4000-8000-0000000009' || lpad(g::text, 2, '0'))::uuid, '00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000101',
       (select id from public.consents where patient_id = '00000000-0000-4000-8000-000000000101' and type = 'image_upload' order by created_at desc limit 1),
       '00000000-0000-4000-8000-000000000901/' || ('00000000-0000-4000-8000-0000000009' || lpad(g::text, 2, '0')) || '.jpg', 10, 10, 10
  from generate_series(10, 14) g;
select pg_temp.expect_error($$insert into public.request_images (id, request_id, patient_id, consent_id, storage_path, width, height, bytes) values ('00000000-0000-4000-8000-0000000009a9', '00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000101', (select id from public.consents where patient_id = '00000000-0000-4000-8000-000000000101' and type = 'image_upload' order by created_at desc limit 1), '00000000-0000-4000-8000-000000000901/00000000-0000-4000-8000-0000000009a9.jpg', 1, 1, 1)$$, 'sjette billede afvises (IMAGE_LIMIT)', 'P0001');

select 'ALLE SIKKERHEDSTESTS PASSEDE' as resultat;
