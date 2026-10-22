-- Test 49 (arbejdsplan 7.1, security kompromis 23, architecture 5.3 og 5.6, migration 20261028000100):
--  * is_valid_phone() afviser tegnsuppe og under 8 cifre og accepterer 8 cifre og dansk format med landekode.
--  * patients.phone, clinics.phone og bookings.contact_phone afviser ugyldige numre direkte i databasen.
--  * book_slot() afviser et nummer under 8 cifre med INVALID_CONTACT og accepterer 8 cifre.
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.eq(public.is_valid_phone('((((((')::text, 'false', '(((((( er ugyldigt');
select tt.eq(public.is_valid_phone('123 45')::text, 'false', '123 45 er ugyldigt');
select tt.eq(public.is_valid_phone('1234567')::text, 'false', '7 cifre er ugyldigt');
select tt.eq(public.is_valid_phone('12345678')::text, 'true', '8 cifre er gyldigt');
select tt.eq(public.is_valid_phone('+45 12 34 56 78')::text, 'true', '+45 12 34 56 78 er gyldigt');
select tt.eq(public.is_valid_phone('12345678abc')::text, 'false', 'bogstaver er ugyldige');
select tt.eq(public.is_valid_phone(null)::text, 'false', 'null er ikke et gyldigt nummer');

-- Patienten ændrer sin egen telefon direkte
select tt.as_user(tt.id('pA'));
select tt.denied(format('update public.patients set phone = %L where id = %L', '((((((', tt.id('pA')), 'patients.phone: tegnsuppe afvises', 'patients_phone_check');
select tt.denied(format('update public.patients set phone = %L where id = %L', '1234567', tt.id('pA')), 'patients.phone: 7 cifre afvises', 'patients_phone_check');
select tt.allowed(format('update public.patients set phone = %L where id = %L', '12345678', tt.id('pA')), 'patients.phone: 8 cifre accepteres');
select tt.allowed(format('update public.patients set phone = %L where id = %L', '+45 12 34 56 78', tt.id('pA')), 'patients.phone: +45-format accepteres');
select tt.allowed(format('update public.patients set phone = null where id = %L', tt.id('pA')), 'patients.phone kan nulstilles');

-- Klinikkens telefon (direkte, som ejeren; ellers som postgres)
select tt.as_postgres();
select tt.denied(format('update public.clinics set phone = %L where id = %L', '1234567', tt.cid('X')), 'clinics.phone: 7 cifre afvises', 'clinics_phone_check');
select tt.denied(format('update public.clinics set phone = %L where id = %L', '((((((', tt.cid('X')), 'clinics.phone: tegnsuppe afvises', 'clinics_phone_check');
select tt.allowed(format('update public.clinics set phone = %L where id = %L', '+45 12 34 56 78', tt.cid('X')), 'clinics.phone: gyldigt nummer accepteres');

-- bookings.contact_phone direkte
select tt.mk_case('pA', 'L_a');
select tt.mk_lead('L_a', 'X', 'accepted');
select tt.denied(format($f$insert into public.bookings (lead_id, clinic_id, patient_id, service_id, starts_at, ends_at, status, contact_name, contact_phone, contact_email)
  values (%L, %L, %L, %L, %L, %L, 'booked', 'Alma Test', '1234567', 'a@test.invalid')$f$,
  tt.lead('L_a', 'X'), tt.cid('X'), tt.id('pA'), tt.svc('undersoegelse'), tt.slot(3, 10), tt.slot(3, 10) + interval '30 minutes'),
  'bookings.contact_phone: 7 cifre afvises', 'bookings_contact_phone_check');

-- book_slot()
select tt.as_user(tt.id('pA'));
select tt.denied(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('L_a', 'X'), tt.svc('undersoegelse'), tt.slot(3, 10), 'Alma Test', '1234567'),
                 'book_slot: 7 cifre afvises', 'INVALID_CONTACT');
select tt.denied(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('L_a', 'X'), tt.svc('undersoegelse'), tt.slot(3, 10), 'Alma Test', '(((((((('),
                 'book_slot: tegnsuppe afvises', 'INVALID_CONTACT');
select tt.allowed(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('L_a', 'X'), tt.svc('undersoegelse'), tt.slot(3, 10), 'Alma Test', '12345678'),
                  'book_slot: 8 cifre accepteres');
select tt.as_postgres();
select tt.eq((select phone from public.patients where id = tt.id('pA')), '12345678', 'patientens telefon gemmes som forslag');

rollback;
