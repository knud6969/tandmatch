-- Test 9: Anmeldelse afvises før ends_at + 24 timer, ved no_show, ved cancelled og ved anden anmeldelse af samme booking;
-- den tillades efter fristen, selv om complete_due_bookings() ikke har kørt. mark_booking_no_show afvises før starttid og
-- efter ends_at + 24 timer, men tillades lige efter sluttid.
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.mk_case('pA', 'R_ok');
select tt.mk_case('pA', 'R_young');
select tt.mk_case('pA', 'R_future');
select tt.mk_case('pA', 'R_noshow');
select tt.mk_case('pA', 'R_cancelled');
select tt.mk_case('pA', 'R_completed');
select tt.mk_case('pA', 'R_justended');
select tt.mk_booking(tt.mk_lead('R_ok', 'X', 'booked'), 'undersoegelse', now() - interval '26 hours', 'booked');
select tt.mk_booking(tt.mk_lead('R_young', 'X', 'booked'), 'undersoegelse', now() - interval '23 hours 30 minutes', 'booked');
select tt.mk_booking(tt.mk_lead('R_future', 'X', 'booked'), 'undersoegelse', now() + interval '3 days', 'booked');
select tt.mk_booking(tt.mk_lead('R_noshow', 'X', 'booked'), 'undersoegelse', now() - interval '4 days', 'no_show');
select tt.mk_booking(tt.mk_lead('R_cancelled', 'X', 'accepted'), 'undersoegelse', now() - interval '5 days', 'cancelled');
select tt.mk_booking(tt.mk_lead('R_completed', 'X', 'booked'), 'undersoegelse', now() - interval '6 days', 'completed');
select tt.mk_booking(tt.mk_lead('R_justended', 'X', 'booked'), 'undersoegelse', now() - interval '2 hours', 'booked');

-- complete_due_bookings() har ikke kørt: databasestatus er stadig booked
select tt.eq((select b.status::text from public.bookings b where b.lead_id = tt.lead('R_ok', 'X')), 'booked', 'opsætning: databasestatus er booked');
select tt.eq((select public.effective_booking_status(b.status, b.ends_at, b.hold_expires_at)::text from public.bookings b where b.lead_id = tt.lead('R_ok', 'X')), 'completed', 'opsætning: effektiv status er completed');

select tt.as_user(tt.id('pA'));
create function pg_temp.review_sql(p_case text) returns text language sql as $$
  select format('insert into public.reviews (booking_id, patient_id, stars, text, price_accuracy) values (%L, %L, 4, %L, %L)',
                tt.booking(tt.lead(p_case, 'X')), tt.id('pA'), 'Fin behandling og klar kommunikation om prisen.', 'as_quoted')
$$;
select tt.denied(pg_temp.review_sql('R_young'), 'anmeldelse før ends_at + 24 timer afvises');
select tt.denied(pg_temp.review_sql('R_future'), 'anmeldelse af kommende booking afvises');
select tt.denied(pg_temp.review_sql('R_noshow'), 'anmeldelse af no_show afvises');
select tt.denied(pg_temp.review_sql('R_cancelled'), 'anmeldelse af cancelled afvises');
select tt.denied(pg_temp.review_sql('R_justended'), 'anmeldelse lige efter sluttid afvises');
-- Efter fristen, uden at jobbet har kørt
select tt.allowed(pg_temp.review_sql('R_ok'), 'anmeldelse efter ends_at + 24 timer tillades (effektivt completed)');
select tt.allowed(pg_temp.review_sql('R_completed'), 'anmeldelse af completed tillades');
-- Anden anmeldelse af samme booking
select tt.denied(pg_temp.review_sql('R_ok'), 'anden anmeldelse af samme booking afvises');
-- Andens booking
select tt.as_user(tt.id('pB'));
select tt.denied(format('insert into public.reviews (booking_id, patient_id, stars, text, price_accuracy) values (%L, %L, 4, %L, %L)',
                        tt.booking(tt.lead('R_young', 'X')), tt.id('pB'), 'Fin behandling og klar kommunikation om prisen.', 'as_quoted'),
                 'anmeldelse af en andens booking afvises');
select tt.denied(format('insert into public.reviews (booking_id, patient_id, stars, text, price_accuracy) values (%L, %L, 4, %L, %L)',
                        tt.booking(tt.lead('R_completed', 'X')), tt.id('pB'), 'Fin behandling og klar kommunikation om prisen.', 'as_quoted'),
                 'anmeldelse af en andens gennemførte booking afvises');
select tt.rows('select 1 from public.bookings', 0, 'pB ser ikke pA''s bookinger');
select tt.as_postgres();
select tt.eq((select moderation_status::text from public.reviews where booking_id = (select id from public.bookings where lead_id = tt.lead('R_ok', 'X'))), 'pending', 'ny anmeldelse starter som pending');

-- mark_booking_no_show
select tt.as_user(tt.id('uX'));
select tt.denied(format('select public.mark_booking_no_show(%L)', tt.booking(tt.lead('R_future', 'X'))), 'no_show før starttid afvises', 'NO_SHOW_WINDOW_CLOSED');
select tt.denied(format('select public.mark_booking_no_show(%L)', tt.booking(tt.lead('R_ok', 'X'))), 'no_show efter ends_at + 24 timer afvises', 'NO_SHOW_WINDOW_CLOSED');
select tt.denied(format('select public.mark_booking_no_show(%L)', tt.booking(tt.lead('R_completed', 'X'))), 'no_show på completed afvises', 'NO_SHOW_WINDOW_CLOSED');
select tt.allowed(format('select public.mark_booking_no_show(%L)', tt.booking(tt.lead('R_justended', 'X'))), 'no_show lige efter sluttid tillades');
select tt.as_postgres();
select tt.eq((select b.status::text from public.bookings b where b.lead_id = tt.lead('R_justended', 'X')), 'no_show', 'booking er no_show');
-- Og en no_show kan ikke anmeldes bagefter
select tt.as_user(tt.id('pA'));
select tt.denied(pg_temp.review_sql('R_justended'), 'anmeldelse af ny no_show afvises');

rollback;
