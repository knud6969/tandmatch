-- Test 70 (security M4; platform/README.md 4.3; migration 20261110000400):
--  * pending_storage_paths kan hverken læses eller skrives af anon, patient, klinik eller admin; kun service role.
--  * Når en række, der peger på en fil, slettes (direkte, via cascade, ved tilbagetrukket samtykke og ved kontosletning),
--    ligger stien i køen i samme transaktion. (bucket, path) er unik.
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.mk_admin();

-- Adgang
select tt.as_postgres();
insert into public.pending_storage_paths (bucket, path) values ('case-images', 'x/y.jpg');
select tt.as_user(tt.id('pA'));
select tt.rows('select 1 from public.pending_storage_paths', 0, 'patient ser ikke køen');
select tt.denied('insert into public.pending_storage_paths (bucket, path) values (''case-images'', ''a.jpg'')', 'patient kan ikke skrive i køen', '42501');
select tt.as_user(tt.id('uX'));
select tt.rows('select 1 from public.pending_storage_paths', 0, 'klinik ser ikke køen');
select tt.denied('delete from public.pending_storage_paths', 'klinik kan ikke slette fra køen', '42501');
select tt.as_user(tt.id('admin'));
select tt.rows('select 1 from public.pending_storage_paths', 0, 'admin ser ikke køen');
select tt.as_anon();
select tt.rows('select 1 from public.pending_storage_paths', 0, 'anon ser ikke køen');
select tt.as_service();
-- Kun testens egen sti, så rester i den lokale database ikke tæller med.
select tt.rows('select 1 from public.pending_storage_paths where path = ''x/y.jpg''', 1, 'service role ser køen');
select tt.allowed('delete from public.pending_storage_paths', 'service role kan tømme køen');
select tt.denied('insert into public.pending_storage_paths (bucket, path) values (''andet'', ''a.jpg'')', 'ukendt bucket afvises');

-- Triggere
select tt.as_postgres();
delete from public.pending_storage_paths;

-- 1) Sagsbillede slettet direkte
select tt.eq((select count(*) from public.case_images where case_id = tt.id('S'))::int, 1, 'S har ét billede');
select tt.as_postgres();
delete from public.case_images where case_id = tt.id('S');
select tt.eq((select count(*) from public.pending_storage_paths where bucket = 'case-images' and path = tt.id('S')::text || '/' || tt.id('img_S')::text || '.jpg')::int, 1, 'sagsbillede: stien er i køen');

-- 2) En hel sag (kladde) slettet: cascade
delete from public.cases where id = tt.id('SB');
select tt.eq((select count(*) from public.pending_storage_paths where bucket = 'case-images' and path = tt.id('SB')::text || '/' || tt.id('img_SB')::text || '.jpg')::int, 1, 'slettet sag: billedstien er i køen');

-- 3) Beskedbillede + tilbagetrukket samtykke
select tt.mk_case('pA', 'T1');
select tt.mk_lead('T1', 'X', 'sent');
insert into public.messages (id, lead_id, sender_id, body) values (tt.id('tm'), tt.lead('T1', 'X'), tt.id('pA'), 'Hej');
insert into public.message_images (id, message_id, lead_id, position, consent_id, storage_path, width, height, bytes)
values (tt.id('tmi'), tt.id('tm'), tt.lead('T1', 'X'), 0, tt.consent('pA', 'image_upload'),
        'messages/' || tt.lead('T1', 'X') || '/' || tt.id('tmi') || '.jpg', 1, 1, 1);
select tt.as_user(tt.id('pA'));
select public.withdraw_consent(tt.consent('pA', 'image_upload'));
select tt.as_postgres();
select tt.eq((select count(*) from public.pending_storage_paths where path = 'messages/' || tt.lead('T1', 'X') || '/' || tt.id('tmi') || '.jpg')::int, 1, 'tilbagetrukket samtykke: beskedbilledets sti er i køen');

-- 4) Kontosletning: cascade fra auth-brugeren (sag, beskedbillede)
select tt.mk_case('pB', 'T2', p_image => true);
select tt.mk_lead('T2', 'X', 'sent');
insert into public.messages (id, lead_id, sender_id, body) values (tt.id('tm2'), tt.lead('T2', 'X'), tt.id('pB'), 'Hej');
insert into public.message_images (id, message_id, lead_id, position, consent_id, storage_path, width, height, bytes)
values (tt.id('tmi2'), tt.id('tm2'), tt.lead('T2', 'X'), 0, tt.consent('pB', 'image_upload'),
        'messages/' || tt.lead('T2', 'X') || '/' || tt.id('tmi2') || '.jpg', 1, 1, 1);
delete from public.pending_storage_paths;
select set_config('tt.t2lead', tt.lead('T2', 'X')::text, true);
delete from auth.users where id = tt.id('pB');
select tt.eq((select count(*) from public.pending_storage_paths where path = tt.id('T2')::text || '/' || tt.id('img_T2')::text || '.jpg')::int, 1, 'kontosletning: sagsbilledets sti er i køen');
select tt.eq((select count(*) from public.pending_storage_paths where path = 'messages/' || current_setting('tt.t2lead') || '/' || tt.id('tmi2') || '.jpg')::int, 1, 'kontosletning: beskedbilledets sti er i køen');

-- 5) Portefølje og tandlæge (public-media)
delete from public.pending_storage_paths;
delete from public.portfolio_items where id = tt.id('pfX');
select tt.eq((select count(*) from public.pending_storage_paths where bucket = 'public-media' and path = 'placeholder/X.jpg')::int, 1, 'portefølje: stien er i køen');
update public.clinic_dentists set photo_path = 'clinics/' || tt.cid('X') || '/dentists/' || tt.id('dX') || '.jpg' where id = tt.id('dX');
delete from public.clinic_dentists where id = tt.id('dX') and not exists (select 1 from public.portfolio_items p where p.dentist_id = tt.id('dX'));
select tt.eq((select count(*) from public.pending_storage_paths where bucket = 'public-media' and path like '%/dentists/%')::int, 1, 'tandlæge: portrættets sti er i køen');

-- Unik (bucket, path)
select tt.denied('insert into public.pending_storage_paths (bucket, path) values (''public-media'', ''placeholder/X.jpg'')', '(bucket, path) er unik', '23505');

rollback;
