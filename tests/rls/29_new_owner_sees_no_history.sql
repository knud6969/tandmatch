-- Test 29 (security 0.7, H2, M1, M2): En ny ejer af en klinik arver ikke den tidligere ejers historik. Klinikken ser kun
-- leads sendt efter clinics.owner_since og de bookinger og anmeldelser, der hører til dem. Leads, beskeder og
-- bookingændringer kræver desuden en verificeret klinik.
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.mk_case('pA', 'H_old');
select tt.mk_case('pA', 'H_new');
select tt.mk_lead('H_old', 'A1', 'booked');
select tt.mk_booking(tt.lead('H_old', 'A1'), 'undersoegelse', tt.slot(4, 10), 'booked');
select tt.mk_case('pA', 'H_done');
select tt.mk_booking(tt.mk_lead('H_done', 'A1', 'booked'), 'undersoegelse', now() - interval '5 days', 'completed');
-- Anmeldelse af den afholdte booking
select tt.as_user(tt.id('pA'));
insert into public.reviews (booking_id, patient_id, stars, text, price_accuracy)
values (tt.booking(tt.lead('H_done', 'A1')), tt.id('pA'), 4, 'Fin behandling, og prisen passede fint.', 'as_quoted');
insert into public.messages (lead_id, sender_id, body) values (tt.lead('H_old', 'A1'), tt.id('pA'), 'Gammel tråd');

-- Moderér anmeldelsen (godkendt) så den kan ses af klinikken
select tt.as_postgres();
update public.reviews set moderation_status = 'approved';
select set_config('tt.review_id', (select id::text from public.reviews limit 1), true);

-- Den gamle ejer ser alt
select tt.as_user(tt.id('uA1'));
select tt.rows('select 1 from public.clinic_leads()', 2, 'den gamle ejer ser sine to leads');
select tt.rows($$select 1 from public.clinic_bookings(now() - interval '30 days', now() + interval '30 days')$$, 2, 'den gamle ejer ser sine bookinger');
select tt.rows('select 1 from public.clinic_reviews()', 1, 'den gamle ejer ser anmeldelsen');

-- Ejerskifte: kontoen slettes og en ny opretter sig med samme CVR; admin verificerer klinikken
select tt.as_postgres();
select tt.ok((select owner_since is not null from public.clinics where id = tt.cid('A1')), 'owner_since er sat for den gamle ejer');
delete from auth.users where id = tt.id('uA1');
select tt.eq((select owner_since from public.clinics where id = tt.cid('A1')), null::timestamptz, 'owner_since er null uden ejer');
-- (leads/anmeldelser flyttes 2 dage tilbage i tiden for at simulere, at de er ældre end overtagelsen)
alter table public.leads disable trigger leads_before_update;
update public.leads set sent_at = now() - interval '2 days' where clinic_id = tt.cid('A1');
alter table public.leads enable trigger leads_before_update;
insert into auth.users (id, email, is_anonymous, raw_user_meta_data) values
  (tt.id('uNew'), 'ny-ejer@test.invalid', false,
   jsonb_build_object('role', 'clinic', 'cvr', (select cvr from tt.clinic_names where name = 'A1'),
                      'clinic_name', 'Overtaget klinik', 'address', 'Testvej 9', 'postal_code', '2100', 'city', 'København Ø'));
select tt.ok((select owner_since is not null and owner_since >= now() - interval '1 minute' from public.clinics where id = tt.cid('A1')), 'owner_since sættes ved overtagelse');
select tt.eq((select owner_id from public.clinics where id = tt.cid('A1')), tt.id('uNew'), 'klinikken er overtaget');
select public.admin_set_clinic_status(tt.cid('A1'), 'verified');

-- Et nyt lead efter overtagelsen
select tt.mk_lead('H_new', 'A1', 'sent');

select tt.as_user(tt.id('uNew'));
select tt.eq((select count(*) from public.clinic_leads())::int, 1, 'den nye ejer ser kun det nye lead');
select tt.rows('select 1 from public.leads', 0, 'den nye ejer har ingen direkte læsning af leads');
select tt.ok(public.clinic_lead_status(tt.lead('H_old', 'A1')) is null, 'den nye ejer ser ikke det gamle lead');
select tt.rows(format('select 1 from public.clinic_lead_detail(%L)', tt.lead('H_old', 'A1')), 0, 'clinic_lead_detail: intet for gammelt lead');
select tt.rows(format('select 1 from public.clinic_lead_images(%L)', tt.lead('H_old', 'A1')), 0, 'clinic_lead_images: intet for gammelt lead');
select tt.rows(format('select 1 from public.clinic_lead_messages(%L)', tt.lead('H_old', 'A1')), 0, 'clinic_lead_messages: intet for gammelt lead');
select tt.rows($$select 1 from public.clinic_bookings(now() - interval '30 days', now() + interval '30 days')$$, 0, 'den nye ejer ser ingen gamle bookinger');
select tt.rows('select 1 from public.clinic_reviews()', 0, 'den nye ejer ser ikke den gamle anmeldelse');
select tt.ok(not public.is_lead_participant(tt.lead('H_old', 'A1')), 'den nye ejer er ikke deltager i den gamle tråd');
select tt.ok(public.is_lead_participant(tt.lead('H_new', 'A1')), 'den nye ejer er deltager i det nye lead');
select tt.denied(format('select public.clinic_decide_lead(%L, %L)', tt.lead('H_old', 'A1'), 'accept'), 'kan ikke beslutte gammelt lead', 'P0002');
select tt.denied(format('select public.cancel_booking(%L)', tt.booking(tt.lead('H_old', 'A1'))), 'kan ikke aflyse gammel booking', 'P0002');
select tt.denied(format('select public.mark_booking_no_show(%L)', tt.booking(tt.lead('H_done', 'A1'))), 'kan ikke markere gammel booking som udeblevet', 'P0002');
select tt.denied(format('insert into public.review_replies (review_id, text) values (%L, %L)',
                        current_setting('tt.review_id'), 'Svar fra ny ejer'),
                 'kan ikke svare på gammel anmeldelse');
select tt.allowed(format('select public.clinic_decide_lead(%L, %L)', tt.lead('H_new', 'A1'), 'accept'), 'kan beslutte det nye lead');

-- M1: en ikke-verificeret klinik ser ingen leads i tabellen
select tt.as_postgres();
select public.admin_set_clinic_status(tt.cid('A1'), 'registered');
select tt.as_user(tt.id('uNew'));
select tt.rows('select 1 from public.leads', 0, 'M1: registered klinik ser ingen leads i tabellen');
select tt.rows('select 1 from public.clinic_leads()', 0, 'M1: registered klinik får tom clinic_leads()');
select tt.as_postgres();
select public.admin_set_clinic_status(tt.cid('A1'), 'verified');

-- M2: aflysning og udeblivelse kræver verificeret klinik
select tt.mk_case('pB', 'M_can');
select tt.mk_case('pB', 'M_ns');
select tt.mk_lead('M_can', 'A2', 'booked');
select tt.mk_lead('M_ns', 'A2', 'booked');
select tt.mk_booking(tt.lead('M_can', 'A2'), 'undersoegelse', tt.slot(6, 10), 'booked');
select tt.mk_booking(tt.lead('M_ns', 'A2'), 'undersoegelse', now() - interval '3 hours', 'booked');
select public.admin_set_clinic_status(tt.cid('A2'), 'registered');
select tt.as_user(tt.id('uA2'));
select tt.denied(format('select public.cancel_booking(%L)', tt.booking(tt.lead('M_can', 'A2'))), 'M2: registered klinik kan ikke aflyse', 'P0002');
select tt.denied(format('select public.mark_booking_no_show(%L)', tt.booking(tt.lead('M_ns', 'A2'))), 'M2: registered klinik kan ikke markere udeblevet', 'P0002');
select tt.as_postgres();
select public.admin_set_clinic_status(tt.cid('A2'), 'verified');
select tt.as_user(tt.id('uA2'));
select tt.allowed(format('select public.cancel_booking(%L)', tt.booking(tt.lead('M_can', 'A2'))), 'M2: verificeret klinik kan aflyse');
select tt.allowed(format('select public.mark_booking_no_show(%L)', tt.booking(tt.lead('M_ns', 'A2'))), 'M2: verificeret klinik kan markere udeblevet');

rollback;
