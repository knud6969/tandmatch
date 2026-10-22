-- Test 44 (arbejdsplan 5.2, security L6, architecture 4.3 `messages`, 12.3 punkt 30): afsenderrollen.
--  * sender_role sættes af databasen ud fra afsenderen; en patient kan ikke indsætte som 'clinic' og omvendt, og ingen kan
--    ændre rollen bagefter.
--  * Sletning af en klinikkonto bevarer klinikkens beskeder i patientens tråd (sender_id null, sender_role 'clinic'), og
--    patienten kan stadig markere dem som læst.
--  * Klinik Y ser intet af klinik X's tråd (direkte og via funktionerne) og kan ikke skrive i den.
--  * Tråden er lukket ved declined og withdrawn; clinic_leads() tæller kun patientens ulæste beskeder.
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.as_user(tt.id('pA'));
select public.send_leads(tt.id('S'), array[tt.cid('X'), tt.cid('Y'), tt.cid('Z')]);

-- Rollen sættes af databasen
select tt.allowed(format('insert into public.messages (id, lead_id, sender_id, body) values (%L, %L, %L, %L)', tt.id('m1'), tt.lead('S', 'X'), tt.id('pA'), 'Patient til X'), 'patient skriver uden rolle');
select tt.as_postgres();
select tt.eq((select sender_role::text from public.messages where id = tt.id('m1')), 'patient', 'patientens besked får rollen patient');

select tt.as_user(tt.id('uX'));
select tt.allowed(format('insert into public.messages (id, lead_id, sender_id, body) values (%L, %L, %L, %L)', tt.id('m2'), tt.lead('S', 'X'), tt.id('uX'), 'X til patient'), 'klinik skriver uden rolle');
select tt.allowed(format('insert into public.messages (id, lead_id, sender_id, sender_role, body) values (%L, %L, %L, %L, %L)', tt.id('m3'), tt.lead('S', 'X'), tt.id('uX'), 'clinic', 'X med korrekt rolle'), 'klinik må angive sin egen rolle');
select tt.as_postgres();
select tt.eq((select sender_role::text from public.messages where id = tt.id('m2')), 'clinic', 'klinikkens besked får rollen clinic');

-- Forfalskning afvises
select tt.as_user(tt.id('pA'));
select tt.denied(format('insert into public.messages (lead_id, sender_id, sender_role, body) values (%L, %L, %L, %L)', tt.lead('S', 'X'), tt.id('pA'), 'clinic', 'Patient udgiver sig for klinikken'),
                 'patient kan ikke indsætte med sender_role = clinic', 'SENDER_ROLE_MISMATCH');
select tt.as_user(tt.id('uX'));
select tt.denied(format('insert into public.messages (lead_id, sender_id, sender_role, body) values (%L, %L, %L, %L)', tt.lead('S', 'X'), tt.id('uX'), 'patient', 'Klinik udgiver sig for patienten'),
                 'klinik kan ikke indsætte med sender_role = patient', 'SENDER_ROLE_MISMATCH');
-- ... og rollen kan ikke ændres bagefter
select tt.as_user(tt.id('pA'));
select tt.denied(format('update public.messages set sender_role = %L where id = %L', 'patient', tt.id('m2')), 'patient kan ikke ændre sender_role', '42501');
select tt.as_postgres();
select tt.denied(format('update public.messages set sender_role = %L where id = %L', 'clinic', tt.id('m1')), 'heller ikke som ejer af tabellen (trigger)', '42501');
select tt.denied(format('update public.messages set sender_id = %L where id = %L', tt.id('uY'), tt.id('m1')), 'afsenderen kan ikke skiftes ud', '42501');
select tt.denied(format('insert into public.messages (lead_id, sender_id, body) values (%L, null, %L)', tt.lead('S', 'X'), 'Uden afsender'), 'nye beskeder skal have en afsender');

-- Klinik Y ser intet af X's tråd og kan ikke skrive i den
select tt.as_user(tt.id('uY'));
select tt.rows('select 1 from public.messages', 0, 'Y har ingen SELECT på messages');
select tt.rows('select 1 from public.leads where id = ' || quote_literal(tt.lead('S', 'X')), 0, 'Y kan ikke læse X''s lead direkte');
select tt.eq((select count(*) from public.clinic_lead_messages(tt.lead('S', 'X')))::int, 0, 'Y får ingen beskeder via clinic_lead_messages()');
select tt.eq((select count(*) from public.clinic_lead_detail(tt.lead('S', 'X')))::int, 0, 'Y får intet fra clinic_lead_detail()');
select tt.eq((select count(*) from public.clinic_lead_images(tt.lead('S', 'X')))::int, 0, 'Y får ingen billeder fra clinic_lead_images()');
select tt.eq((select count(*) from public.clinic_leads() where lead_id = tt.lead('S', 'X'))::int, 0, 'X''s lead er ikke på Y''s liste');
select tt.denied(format('insert into public.messages (lead_id, sender_id, body) values (%L, %L, %L)', tt.lead('S', 'X'), tt.id('uY'), 'Y i X''s tråd'), 'Y kan ikke skrive i X''s tråd');
select public.clinic_mark_messages_read(tt.lead('S', 'X'));
select tt.as_postgres();
select tt.eq((select count(*) from public.messages where lead_id = tt.lead('S', 'X') and read_at is not null)::int, 0, 'Y kunne ikke markere som læst');

-- X: from_me og ulæste kun fra patienten
select tt.as_user(tt.id('uX'));
select tt.eq((select count(*) from public.clinic_lead_messages(tt.lead('S', 'X')) m where m.from_me)::int, 2, 'X: to egne beskeder (m2, m3)');
select tt.eq((select count(*) from public.clinic_lead_messages(tt.lead('S', 'X')) m where not m.from_me)::int, 1, 'X: én besked fra patienten');
select tt.eq((select unread_messages from public.clinic_leads() where lead_id = tt.lead('S', 'X')), 1, 'X: kun patientens besked er ulæst');
select public.clinic_mark_messages_read(tt.lead('S', 'X'));
select tt.eq((select unread_messages from public.clinic_leads() where lead_id = tt.lead('S', 'X')), 0, 'X: ingen ulæste efter markering');

-- Lukket tråd: declined og withdrawn
select tt.as_user(tt.id('uY'));
select public.clinic_decide_lead(tt.lead('S', 'Y'), 'decline', null, null, null, 'other');
select tt.as_user(tt.id('uY'));
select tt.denied(format('insert into public.messages (lead_id, sender_id, body) values (%L, %L, %L)', tt.lead('S', 'Y'), tt.id('uY'), 'efter afvisning'), 'tråden er lukket for klinikken ved declined');
select tt.as_user(tt.id('pA'));
select tt.denied(format('insert into public.messages (lead_id, sender_id, body) values (%L, %L, %L)', tt.lead('S', 'Y'), tt.id('pA'), 'efter afvisning'), 'tråden er lukket for patienten ved declined');
select public.withdraw_lead(tt.lead('S', 'Z'));
select tt.denied(format('insert into public.messages (lead_id, sender_id, body) values (%L, %L, %L)', tt.lead('S', 'Z'), tt.id('pA'), 'efter tilbagetrækning'), 'tråden er lukket for patienten ved withdrawn');
select tt.as_user(tt.id('uZ'));
select tt.denied(format('insert into public.messages (lead_id, sender_id, body) values (%L, %L, %L)', tt.lead('S', 'Z'), tt.id('uZ'), 'efter tilbagetrækning'), 'tråden er lukket for klinikken ved withdrawn');

-- Klinikkontoen slettes: klinikkens beskeder bevares uden afsender
select tt.as_postgres();
select tt.eq((select count(*) from public.messages where lead_id = tt.lead('S', 'X') and sender_role = 'clinic')::int, 2, 'før sletning: to klinikbeskeder');
delete from auth.users where id = tt.id('uX');
select tt.eq((select count(*) from public.messages where lead_id = tt.lead('S', 'X'))::int, 3, 'efter sletning: hele tråden består');
select tt.eq((select count(*) from public.messages where lead_id = tt.lead('S', 'X') and sender_role = 'clinic' and sender_id is null)::int, 2,
             'klinikkens beskeder har sender_role clinic og sender_id null');
select tt.eq((select count(*) from public.messages where lead_id = tt.lead('S', 'X') and sender_role = 'patient' and sender_id = tt.id('pA'))::int, 1,
             'patientens besked er uændret');

-- Patienten ser stadig tråden og kan markere klinikkens beskeder (uden afsender) som læst
select tt.as_user(tt.id('pA'));
select tt.rows(format('select 1 from public.messages where lead_id = %L', tt.lead('S', 'X')), 3, 'patienten ser hele tråden efter klinikkens sletning');
select tt.affects(format('update public.messages set read_at = now() where lead_id = %L and sender_role = %L and read_at is null', tt.lead('S', 'X'), 'clinic'), 2,
                  'patienten kan markere beskeder uden afsender som læst');
select tt.affects(format('update public.messages set read_at = now() where lead_id = %L and sender_role = %L', tt.lead('S', 'X'), 'patient'), 0,
                  'patienten kan ikke markere egne som læst');
-- Leadet er lukket med clinic_left, så tråden er lukket for nye beskeder
select tt.denied(format('insert into public.messages (lead_id, sender_id, body) values (%L, %L, %L)', tt.lead('S', 'X'), tt.id('pA'), 'Efter klinikkens sletning'), 'tråden er lukket efter clinic_left');

rollback;
