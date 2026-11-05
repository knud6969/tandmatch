-- Test 69 (security M2 og M3; features/leads/README.md 4.3 og 10.12; migrationerne 20261110000300 og 20261110000400):
--  * send_message_with_images() afviser en klinikafsender uden bekræftet tekstversion (CONSENT_REQUIRED), også med tom version,
--    og gemmer version og tidspunkt, når klinikken har bekræftet. Patientens billeder gemmer ingen klinikbekræftelse.
--  * Check-constraintet kræver version og tidspunkt på en række uden patientsamtykke.
--  * En klinik kan ikke sende billeder, når indholdet er lukket (delingssamtykket trukket tilbage uden booket tid).
--  * purge_inactive_message_images() kan kun kaldes af service role og sletter beskedbilleder (patientens og klinikkens) i tråde
--    uden aktivitet i 12 måneder; tråde med nyere aktivitet og andre leads røres ikke; beskedteksten bliver stående; stierne
--    lægges i pending_storage_paths. Tilbagetrækning af image_upload sletter kun patientens billeder.
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.as_user(tt.id('pA'));
select public.send_leads(tt.id('S'), array[tt.cid('X'), tt.cid('Y')]);

select tt.as_postgres();
create function tt.imgs(p_names text[]) returns jsonb language sql immutable as $$
  select jsonb_agg(jsonb_build_object('id', tt.id(n), 'width', 64, 'height', 48, 'bytes', 1000)) from unnest(p_names) n
$$;
create function tt.send_imgs(p_user text, p_case text, p_clinic text, p_msg text, p_body text, p_imgs text[], p_ver text default null) returns text
language sql as $$
  select format('select public.send_message_with_images(%L, %L, %L, %L, %L, %L)',
                tt.id(p_user), tt.lead(p_case, p_clinic), tt.id(p_msg), p_body, tt.imgs(p_imgs), p_ver)
$$;
grant execute on function tt.imgs(text[]), tt.send_imgs(text, text, text, text, text, text[], text) to public;

-- M2: klinikken skal have bekræftet sin erklæring
select tt.as_service();
select tt.denied(tt.send_imgs('uX', 'S', 'X', 'c1', 'uden', array['ci1']), 'klinik uden bekræftelse afvises', 'CONSENT_REQUIRED');
select tt.denied(tt.send_imgs('uX', 'S', 'X', 'c1', 'tom', array['ci1'], '   '), 'klinik med tom version afvises', 'CONSENT_REQUIRED');
select tt.denied(tt.send_imgs('uX', 'S', 'X', 'c1', 'lang', array['ci1'], repeat('x', 81)), 'klinik med for lang version afvises', 'CONSENT_REQUIRED');
select tt.allowed(tt.send_imgs('uX', 'S', 'X', 'c2', 'Med bekræftelse', array['ci2'], 'clinic_message_images@v0-prototype'), 'klinik med bekræftelse sender');
select tt.allowed(tt.send_imgs('pA', 'S', 'X', 'c3', 'Patient', array['ci3']), 'patienten kræver ingen klinikbekræftelse');
select tt.as_postgres();
select tt.ok((select clinic_consent_text_version = 'clinic_message_images@v0-prototype' and clinic_consent_confirmed_at is not null
                from public.message_images where id = tt.id('ci2')), 'klinikkens version og tidspunkt gemmes');
select tt.ok((select clinic_consent_text_version is null and clinic_consent_confirmed_at is null and consent_id is not null
                from public.message_images where id = tt.id('ci3')), 'patientens billede peger på sit samtykke og har ingen klinikbekræftelse');
select tt.eq((select count(*) from public.messages where id = tt.id('c1'))::int, 0, 'afvist kald efterlader ingen besked');
select tt.denied(format('insert into public.message_images (message_id, lead_id, position, storage_path, width, height, bytes) values (%L, %L, 1, %L, 1, 1, 1)',
                        tt.id('c2'), tt.lead('S', 'X'), 'messages/' || tt.lead('S', 'X') || '/' || tt.id('ci9') || '.jpg'),
                 'en række uden patientsamtykke skal have klinikbekræftelse (check)');

-- Indholdet lukket: klinikken kan ikke sende
select tt.mk_case('pB', 'CL');
select tt.mk_lead('CL', 'X', 'accepted');
select tt.as_user(tt.id('pB'));
select public.withdraw_consent(tt.consent('pB', 'health_data_sharing'));
select tt.as_postgres();
alter table public.leads disable trigger leads_before_update;
update public.leads set status = 'accepted', withdrawn_at = null where id = tt.lead('CL', 'X');
alter table public.leads enable trigger leads_before_update;
select tt.as_service();
select tt.denied(tt.send_imgs('uX', 'CL', 'X', 'c4', 'lukket', array['ci4'], 'clinic_message_images@v0-prototype'), 'klinik kan ikke sende, når indholdet er lukket', 'THREAD_CLOSED');

-- M3: opbevaring
select tt.as_user(tt.id('pA'));
select tt.denied('select public.purge_inactive_message_images()', 'patient kan ikke kalde purge', '42501');
select tt.as_user(tt.id('uX'));
select tt.denied('select public.purge_inactive_message_images()', 'klinik kan ikke kalde purge', '42501');
select tt.as_anon();
select tt.denied('select public.purge_inactive_message_images()', 'anon kan ikke kalde purge', '42501');
select tt.as_service();
select tt.denied('select public.purge_inactive_message_images(0)', 'p_months skal være mindst 1', '22023');

-- To tråde: S/X (aktiv i dag) og en gammel tråd på en ny sag til Y, hvor sidste aktivitet er 13 måneder siden
select tt.as_postgres();
select tt.mk_case('pA', 'OLD');
select tt.mk_lead('OLD', 'Y', 'accepted');
select tt.mk_case('pA', 'NEWMSG');
select tt.mk_lead('NEWMSG', 'Y', 'accepted');
select tt.as_service();
select tt.allowed(tt.send_imgs('pA', 'OLD', 'Y', 'o1', 'Gammelt', array['oi1']), 'gammelt billede (patient)');
select tt.allowed(tt.send_imgs('uY', 'OLD', 'Y', 'o2', 'Gammelt svar', array['oi2'], 'clinic_message_images@v0-prototype'), 'gammelt billede (klinik)');
select tt.allowed(tt.send_imgs('pA', 'NEWMSG', 'Y', 'n1', 'Billede', array['ni1']), 'billede i tråd med ny tekst');
select tt.as_postgres();
alter table public.leads disable trigger leads_before_update;
update public.leads set sent_at = now() - interval '14 months' where id in (tt.lead('OLD', 'Y'), tt.lead('NEWMSG', 'Y'));
alter table public.leads enable trigger leads_before_update;
alter table public.messages disable trigger messages_before_update;
update public.messages set created_at = now() - interval '13 months' where id in (tt.id('o1'), tt.id('o2'), tt.id('n1'));
alter table public.messages enable trigger messages_before_update;
update public.message_images set created_at = now() - interval '13 months' where id in (tt.id('oi1'), tt.id('oi2'), tt.id('ni1'));
-- Tråden NEWMSG har en nyere tekstbesked: sidste aktivitet er for 2 måneder siden
insert into public.messages (id, lead_id, sender_id, body) values (tt.id('n2'), tt.lead('NEWMSG', 'Y'), tt.id('pA'), 'Nyere tekst');
alter table public.messages disable trigger messages_before_update;
update public.messages set created_at = now() - interval '2 months' where id = tt.id('n2');
alter table public.messages enable trigger messages_before_update;

delete from public.pending_storage_paths;
select tt.as_service();
select tt.eq((select public.purge_inactive_message_images()), 2, 'to billeder i den gamle tråd slettes (patientens og klinikkens)');
select tt.as_postgres();
select tt.eq((select count(*) from public.message_images where lead_id = tt.lead('OLD', 'Y'))::int, 0, 'gammel tråd uden billeder');
select tt.eq((select count(*) from public.messages where lead_id = tt.lead('OLD', 'Y'))::int, 2, 'beskedteksten bliver stående');
select tt.eq((select count(*) from public.message_images where lead_id = tt.lead('NEWMSG', 'Y'))::int, 1, 'tråd med nyere aktivitet røres ikke');
select tt.eq((select count(*) from public.message_images where lead_id = tt.lead('S', 'X'))::int, 2, 'aktiv tråd røres ikke');
select tt.eq((select count(*) from public.pending_storage_paths
               where bucket = 'case-images' and path in ('messages/' || tt.lead('OLD', 'Y') || '/' || tt.id('oi1') || '.jpg',
                                                          'messages/' || tt.lead('OLD', 'Y') || '/' || tt.id('oi2') || '.jpg'))::int, 2, 'stierne ligger i køen');
select tt.as_service();
select tt.eq((select public.purge_inactive_message_images()), 0, 'idempotent');
select tt.eq((select public.purge_inactive_message_images(1)), 1, 'med 1 måned er også tråden med tekst for 2 måneder siden for gammel');

-- Tilbagetrækning af image_upload: kun patientens billeder slettes, klinikkens bliver (afklaret i security M3)
select tt.as_user(tt.id('pA'));
select tt.allowed(format('select public.withdraw_consent(%L)', tt.consent('pA', 'image_upload')), 'pA trækker billedsamtykket tilbage');
select tt.as_postgres();
select tt.eq((select count(*) from public.message_images where lead_id = tt.lead('S', 'X') and consent_id is not null)::int, 0, 'patientens billeder er slettet');
select tt.eq((select count(*) from public.message_images where lead_id = tt.lead('S', 'X') and consent_id is null)::int, 1, 'klinikkens billede bevares');

rollback;
