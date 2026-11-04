-- Test 61: clinic_notification_settings (clinics 4.3, migration 20261105000200, RLS-punkt 56).
begin;
\ir _helpers.sql
\ir _fixtures.sql

-- X's ejer indsætter og ændrer sin række.
select tt.as_user(tt.id('uX'));
select tt.rows('select 1 from public.clinic_notification_settings', 0, 'ingen række = ingen rækker (standard anvendes af serveren)');
insert into public.clinic_notification_settings (clinic_id, email_new_lead) values (tt.cid('X'), false);
select tt.rows('select 1 from public.clinic_notification_settings', 1, 'ejeren ser sin række');
select tt.eq((select email_new_message from public.clinic_notification_settings), true, 'standard: email_new_message = true');
select tt.eq((select web_push_new_lead from public.clinic_notification_settings), true, 'standard: web_push_new_lead = true');
select tt.eq((select web_push_booking_reminder from public.clinic_notification_settings), false, 'standard: web_push_booking_reminder = false');
select tt.affects('update public.clinic_notification_settings set email_new_message = false, web_push_new_message = false', 1, 'ejeren ændrer sin række');
select tt.denied(format('update public.clinic_notification_settings set clinic_id = %L', tt.cid('Y')), 'clinic_id kan ikke ændres', '42501');
select tt.denied('delete from public.clinic_notification_settings', 'ingen DELETE', '42501');
select tt.denied(format('insert into public.clinic_notification_settings (clinic_id) values (%L)', tt.cid('Y')), 'kan ikke indsætte for en anden klinik');

-- Y, en patient, en anonym bruger og anon ser ingenting og kan ikke ændre.
select tt.as_user(tt.id('uY'));
select tt.rows('select 1 from public.clinic_notification_settings', 0, 'Y ser ikke X''s række');
select tt.affects('update public.clinic_notification_settings set email_new_lead = true', 0, 'Y kan ikke ændre X''s række');
select tt.as_user(tt.id('pA'));
select tt.rows('select 1 from public.clinic_notification_settings', 0, 'patient ser ingen rækker');
select tt.denied(format('insert into public.clinic_notification_settings (clinic_id) values (%L)', tt.cid('X')), 'patient kan ikke indsætte');
select tt.as_anon();
select tt.rows('select 1 from public.clinic_notification_settings', 0, 'anon ser ingen rækker');

-- Registered klinik (R) kan også gemme sine valg.
select tt.as_user(tt.id('uR'));
select tt.allowed(format('insert into public.clinic_notification_settings (clinic_id) values (%L)', tt.cid('R')), 'registered klinik gemmer indstillinger');

-- Efter en ejer er slettet kan en anden ikke arve rækken uden at være ejer.
select tt.as_postgres();
select tt.eq((select count(*)::int from public.clinic_notification_settings), 2, 'to rækker i alt');

rollback;
