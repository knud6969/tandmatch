-- Test 57 (features/leads/README.md 4.3 `message_images`, 5.5, 5.7, 10.12; platform 5.6 punkt 53): billeder i beskedtråden.
--  * authenticated kan hverken skrive i message_images eller kalde send_message_with_images().
--  * Patienten ser kun billeder i egne tråde; klinik Y ser intet af X's tråd; X ser intet efter withdrawn.
--  * send_message_with_images() (service role) afviser fremmed afsender, lukket tråd, for mange billeder, tom besked uden
--    billeder og patient uden gældende image_upload; klinikken kræver intet samtykke.
--  * Tilbagetrækning af image_upload sletter patientens beskedbilleder (ikke klinikkens) og returnerer stierne.
--  * Direkte indsættelse af en tom tekstbesked afvises stadig.
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.as_user(tt.id('pA'));
select public.send_leads(tt.id('S'), array[tt.cid('X'), tt.cid('Y'), tt.cid('Z')]);
select tt.as_user(tt.id('pB'));
select public.send_leads(tt.id('SB'), array[tt.cid('X')]);

select tt.as_postgres();
create function tt.imgs(p_names text[]) returns jsonb language sql immutable as $$
  select jsonb_agg(jsonb_build_object('id', tt.id(n), 'width', 64, 'height', 48, 'bytes', 1000)) from unnest(p_names) n
$$;
create function tt.send_imgs(p_user text, p_case text, p_clinic text, p_msg text, p_body text, p_imgs text[]) returns text
language sql as $$
  select format('select public.send_message_with_images(%L, %L, %L, %L, %L)',
                tt.id(p_user), tt.lead(p_case, p_clinic), tt.id(p_msg), p_body, tt.imgs(p_imgs))
$$;
grant execute on function tt.imgs(text[]), tt.send_imgs(text, text, text, text, text, text[]) to public;

-- authenticated har ingen skrivevej og kan ikke kalde funktionen
select tt.as_user(tt.id('pA'));
select tt.denied(tt.send_imgs('pA', 'S', 'X', 'mA0', 'hej', array['iA0']), 'patient kan ikke kalde send_message_with_images()', '42501');
select tt.denied(format('insert into public.message_images (message_id, lead_id, position, storage_path, width, height, bytes) values (%L, %L, 0, %L, 1, 1, 1)',
                        tt.id('mX'), tt.lead('S', 'X'), 'messages/x.jpg'), 'patient kan ikke indsætte billedrækker', '42501');
select tt.denied(format('insert into public.messages (lead_id, sender_id, body) values (%L, %L, %L)', tt.lead('S', 'X'), tt.id('pA'), '   '),
                 'direkte indsættelse af en tom tekstbesked afvises');
select tt.as_user(tt.id('uX'));
select tt.denied(tt.send_imgs('uX', 'S', 'X', 'mX0', 'hej', array['iX0']), 'klinik kan ikke kalde send_message_with_images()', '42501');

-- Service role: gyldige kald
select tt.as_service();
select tt.allowed(tt.send_imgs('pA', 'S', 'X', 'm1', '', array['i1', 'i2']), 'patient sender to billeder uden tekst til X');
select tt.allowed(tt.send_imgs('uX', 'S', 'X', 'm2', 'Her er et eksempel', array['i3']), 'klinik X sender et billede (intet samtykke krævet)');
select tt.allowed(tt.send_imgs('pA', 'S', 'Z', 'm3', 'Til Z', array['i4']), 'patient sender et billede til Z');
select tt.allowed(tt.send_imgs('pB', 'SB', 'X', 'm4', 'Fra B', array['i5']), 'patient B sender et billede til X');

select tt.as_postgres();
select tt.eq((select storage_path from public.message_images where id = tt.id('i1')), 'messages/' || tt.lead('S', 'X') || '/' || tt.id('i1') || '.jpg', 'stien er messages/{lead}/{id}.jpg');
select tt.eq((select body from public.messages where id = tt.id('m1')), '', 'tom tekst gemmes ved billeder');
select tt.eq((select sender_role::text from public.messages where id = tt.id('m1')), 'patient', 'afsenderrollen sættes af databasen');
select tt.eq((select sender_role::text from public.messages where id = tt.id('m2')), 'clinic', 'klinikkens rolle');
select tt.ok((select consent_id from public.message_images where id = tt.id('i1')) = tt.consent('pA', 'image_upload'), 'patientens billede peger på samtykket');
select tt.ok((select consent_id is null from public.message_images where id = tt.id('i3')), 'klinikkens billede har intet samtykke');
select tt.eq((select array_agg(position order by position) from public.message_images where message_id = tt.id('m1')), array[0, 1]::smallint[], 'rækkefølgen gemmes');
select tt.denied(format('update public.message_images set storage_path = %L where id = %L', 'messages/andet.jpg', tt.id('i1')), 'stien skal følge formatet (check)');

-- Service role: afviste kald
select tt.as_service();
select tt.denied(tt.send_imgs('uY', 'S', 'X', 'm5', 'Y i X', array['i6']), 'klinik Y kan ikke skrive i X''s tråd', 'NOT_FOUND');
select tt.denied(tt.send_imgs('pB', 'S', 'X', 'm5', 'B i A', array['i6']), 'patient B kan ikke skrive i A''s tråd', 'NOT_FOUND');
select tt.denied(tt.send_imgs('pA', 'S', 'X', 'm5', 'fire', array['i6', 'i7', 'i8', 'i9']), 'højst 3 billeder', 'IMAGE_LIMIT');
select tt.denied(tt.send_imgs('pA', 'S', 'X', 'm5', 'ingen', array[]::text[]), 'mindst ét billede', 'VALIDATION_ERROR');
select tt.denied(tt.send_imgs('pA', 'S', 'X', 'm5', repeat('x', 2001), array['i6']), 'teksten højst 2000 tegn', 'VALIDATION_ERROR');
select tt.denied(tt.send_imgs('pAnon', 'S', 'X', 'm5', 'anonym', array['i6']), 'anonym kan ikke sende', 'ACCOUNT_REQUIRED');

-- Patienten ser kun egne tråde
select tt.as_user(tt.id('pA'));
select tt.rows('select 1 from public.message_images', 4, 'pA ser sine fire billeder (X- og Z-tråden)');
select tt.rows(format('select 1 from public.message_images where lead_id = %L', tt.lead('SB', 'X')), 0, 'pA ser ikke B''s billeder');
select tt.denied('select consent_id from public.message_images', 'consent_id er ikke læsbar for authenticated', '42501');
select tt.affects(format('delete from public.message_images where id = %L', tt.id('i1')), 0, 'patient kan ikke slette rækker');
select tt.as_user(tt.id('pB'));
select tt.rows('select 1 from public.message_images', 1, 'pB ser kun sit eget billede');

-- Klinikker: ingen direkte SELECT; kun egne tråde via funktionen
select tt.as_user(tt.id('uX'));
select tt.rows('select 1 from public.message_images', 0, 'X har ingen SELECT på message_images');
select tt.eq((select count(*) from public.clinic_lead_message_images(tt.lead('S', 'X')))::int, 3, 'X ser trådens tre billeder');
select tt.eq((select count(*) from public.clinic_lead_message_images(tt.lead('SB', 'X')))::int, 1, 'X ser B''s billede i sin egen tråd');
select tt.eq((select count(*) from public.clinic_lead_message_images(tt.lead('S', 'Z')))::int, 0, 'X ser intet fra Z''s tråd');
select tt.as_user(tt.id('uY'));
select tt.eq((select count(*) from public.clinic_lead_message_images(tt.lead('S', 'X')))::int, 0, 'Y ser intet fra X''s tråd');
select tt.eq((select count(*) from public.clinic_lead_message_images(tt.lead('S', 'Y')))::int, 0, 'Y har ingen billeder i egen tråd');
select tt.as_user(tt.id('uZ'));
select tt.eq((select count(*) from public.clinic_lead_message_images(tt.lead('S', 'Z')))::int, 1, 'Z ser sit billede');

-- Withdrawn: Z ser intet og kan ikke sende; tråden er lukket for patienten
select tt.as_user(tt.id('pA'));
select public.withdraw_lead(tt.lead('S', 'Z'));
select tt.as_user(tt.id('uZ'));
select tt.eq((select count(*) from public.clinic_lead_message_images(tt.lead('S', 'Z')))::int, 0, 'Z ser ingen billeder efter withdrawn');
select tt.as_service();
select tt.denied(tt.send_imgs('uZ', 'S', 'Z', 'm6', 'efter', array['i10']), 'Z kan ikke sende efter withdrawn', 'NOT_FOUND');
select tt.denied(tt.send_imgs('pA', 'S', 'Z', 'm6', 'efter', array['i10']), 'tråden er lukket for patienten', 'THREAD_CLOSED');
select tt.as_user(tt.id('pA'));
select tt.rows(format('select 1 from public.message_images where lead_id = %L', tt.lead('S', 'Z')), 1, 'patienten ser stadig sit billede i den lukkede tråd');

-- Declined: lukket for begge
select tt.as_user(tt.id('uY'));
select public.clinic_decide_lead(tt.lead('S', 'Y'), 'decline', null, null, null, 'other');
select tt.as_service();
select tt.denied(tt.send_imgs('uY', 'S', 'Y', 'm7', 'efter', array['i11']), 'Y kan ikke sende efter afvisning', 'THREAD_CLOSED');

-- Patient uden gældende image_upload-samtykke
select tt.as_user(tt.id('pB'));
select tt.allowed(format('select public.withdraw_consent(%L)', tt.consent('pB', 'image_upload')), 'pB trækker billedsamtykket tilbage');
select tt.as_postgres();
select tt.eq((select count(*) from public.message_images where lead_id = tt.lead('SB', 'X'))::int, 0, 'pB''s beskedbilleder er slettet');
select tt.eq((select count(*) from public.messages where id = tt.id('m4'))::int, 1, 'beskedteksten bliver stående');
select tt.ok((select 'messages/' || tt.lead('SB', 'X') || '/' || tt.id('i5') || '.jpg' = any(pending_storage_paths)
                from public.consents where id = tt.consent('pB', 'image_upload')), 'stien kommer med i oprydningen');
select tt.as_service();
select tt.denied(tt.send_imgs('pB', 'SB', 'X', 'm8', 'uden samtykke', array['i12']), 'uden gældende samtykke afvises', 'CONSENT_REQUIRED');

-- pA trækker samtykket tilbage: kun patientens billeder slettes, klinikkens bliver
select tt.as_user(tt.id('pA'));
select tt.allowed(format('select public.withdraw_consent(%L)', tt.consent('pA', 'image_upload')), 'pA trækker billedsamtykket tilbage');
select tt.as_postgres();
select tt.eq((select count(*) from public.message_images where lead_id = tt.lead('S', 'X'))::int, 1, 'kun klinikkens billede er tilbage');
select tt.ok((select consent_id is null from public.message_images where id = tt.id('i3')), 'det tilbageværende er klinikkens');

-- Døgnloftet på 30 billeder pr. afsender
select tt.as_service();
select tt.allowed(tt.send_imgs('uX', 'S', 'X', 'q' || n, 'loft', array['qa' || n, 'qb' || n, 'qc' || n]), 'billede ' || n)
  from generate_series(1, 9) n;
select tt.denied(tt.send_imgs('uX', 'S', 'X', 'q10', 'loft', array['qa10', 'qb10', 'qc10']), 'det 31. billede på et døgn afvises', 'MESSAGE_IMAGE_LIMIT');

rollback;
