-- Test 48 (arbejdsplan 6.7a, security trin 6 M1, architecture 7.6, migration 20261027000100):
--  * book_slot() afviser den 6. booking på samme lead med BOOKING_LIMIT; alle statusser tæller (aflyst, udeblevet, gennemført).
--  * Loftet er pr. lead: et andet lead hos samme klinik og en anden patients lead berøres ikke.
--  * Booking og aflysning (cancel_booking) tæller også; afviste kald efterlader ingen ny booking.
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.mk_case('pA', 'L_a');
select tt.mk_case('pA', 'L_b');
select tt.mk_lead('L_a', 'X', 'accepted');
select tt.mk_lead('L_b', 'X', 'accepted');
-- 3 gamle bookinger på L_a: aflyst, udeblevet og gennemført (alle tæller)
select tt.mk_booking(tt.lead('L_a', 'X'), 'undersoegelse', now() - interval '10 days', 'cancelled');
select tt.mk_booking(tt.lead('L_a', 'X'), 'undersoegelse', now() - interval '9 days', 'no_show');
select tt.mk_booking(tt.lead('L_a', 'X'), 'undersoegelse', now() - interval '8 days', 'completed');

select tt.as_user(tt.id('pA'));
-- 4. booking lykkes, aflyses, og 5. lykkes
select tt.allowed(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('L_a', 'X'), tt.svc('undersoegelse'), tt.slot(3, 10), 'Alma Test', '+45 12345678'),
                  '4. booking på leadet lykkes');
select public.cancel_booking((select b.id from public.bookings b where b.lead_id = tt.lead('L_a', 'X') and b.status = 'booked'));
select tt.allowed(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('L_a', 'X'), tt.svc('undersoegelse'), tt.slot(3, 11), 'Alma Test', '+45 12345678'),
                  '5. booking på leadet lykkes');
select public.cancel_booking((select b.id from public.bookings b where b.lead_id = tt.lead('L_a', 'X') and b.status = 'booked'));
select tt.eq((select status::text from public.leads where id = tt.lead('L_a', 'X')), 'accepted', 'leadet er accepteret igen efter aflysning');

-- 6. booking afvises, uanset om tiden er ledig
select tt.denied(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('L_a', 'X'), tt.svc('undersoegelse'), tt.slot(3, 12), 'Alma Test', '+45 12345678'),
                 'den 6. booking på samme lead afvises', 'BOOKING_LIMIT');
select tt.denied(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('L_a', 'X'), tt.svc('undersoegelse'), tt.slot(4, 12), 'Alma Test', '+45 12345678'),
                 'også med en anden tid', 'BOOKING_LIMIT');
select tt.as_postgres();
select tt.eq((select count(*) from public.bookings where lead_id = tt.lead('L_a', 'X'))::int, 5, 'præcis 5 bookinger på leadet');
select tt.eq((select count(*) from public.bookings where lead_id = tt.lead('L_a', 'X') and status = 'booked')::int, 0, 'ingen aktiv booking oprettet af de afviste kald');

-- Et andet lead (anden sag, samme klinik) er upåvirket
select tt.as_user(tt.id('pA'));
select tt.allowed(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('L_b', 'X'), tt.svc('undersoegelse'), tt.slot(3, 13), 'Alma Test', '+45 12345678'),
                  'et andet lead hos samme klinik kan stadig bookes');
-- Og en anden patients lead
select tt.as_postgres();
select tt.mk_lead('SB', 'X', 'accepted');
select tt.as_user(tt.id('pB'));
select tt.allowed(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('SB', 'X'), tt.svc('undersoegelse'), tt.slot(3, 15), 'Bo Test', '+45 87654321'),
                  'en anden patients lead er upåvirket');

-- Bookinger aflyst af klinikken tæller ikke (migration 20261028000100): 5 klinik-aflysninger, og patienten kan stadig booke
select tt.as_postgres();
select tt.mk_case('pB', 'L_c');
select tt.mk_lead('L_c', 'X', 'accepted');
select tt.mk_booking(tt.lead('L_c', 'X'), 'undersoegelse', now() - interval '20 days', 'cancelled');
select tt.mk_booking(tt.lead('L_c', 'X'), 'undersoegelse', now() - interval '19 days', 'cancelled');
select tt.mk_booking(tt.lead('L_c', 'X'), 'undersoegelse', now() - interval '18 days', 'cancelled');
select tt.mk_booking(tt.lead('L_c', 'X'), 'undersoegelse', now() - interval '17 days', 'cancelled');
select tt.mk_booking(tt.lead('L_c', 'X'), 'undersoegelse', now() - interval '16 days', 'cancelled');
update public.bookings set cancelled_by = 'clinic' where lead_id = tt.lead('L_c', 'X');
select tt.as_user(tt.id('pB'));
select tt.allowed(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('L_c', 'X'), tt.svc('undersoegelse'), tt.slot(5, 10), 'Bo Test', '+45 87654321'),
                  'efter fem klinik-aflysninger kan patienten booke igen');
-- ... men fem patient-aflysninger giver BOOKING_LIMIT
select tt.as_postgres();
select tt.mk_case('pB', 'L_d');
select tt.mk_lead('L_d', 'X', 'accepted');
select tt.mk_booking(tt.lead('L_d', 'X'), 'undersoegelse', now() - interval '20 days', 'cancelled');
select tt.mk_booking(tt.lead('L_d', 'X'), 'undersoegelse', now() - interval '19 days', 'cancelled');
select tt.mk_booking(tt.lead('L_d', 'X'), 'undersoegelse', now() - interval '18 days', 'cancelled');
select tt.mk_booking(tt.lead('L_d', 'X'), 'undersoegelse', now() - interval '17 days', 'cancelled');
select tt.mk_booking(tt.lead('L_d', 'X'), 'undersoegelse', now() - interval '16 days', 'cancelled');
select tt.as_user(tt.id('pB'));
select tt.denied(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('L_d', 'X'), tt.svc('undersoegelse'), tt.slot(5, 12), 'Bo Test', '+45 87654321'),
                 'efter fem patient-aflysninger afvises', 'BOOKING_LIMIT');

-- Tilladelserne er uændrede
select tt.as_anon();
select tt.denied(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('L_a', 'X'), tt.svc('undersoegelse'), tt.slot(3, 12), 'Alma Test', '+45 12345678'),
                 'anonyme kan ikke kalde book_slot', '42501');
select tt.as_user(tt.id('uX'));
select tt.denied(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('L_a', 'X'), tt.svc('undersoegelse'), tt.slot(3, 12), 'Alma Test', '+45 12345678'),
                 'klinikken kan ikke booke på et lead', 'NOT_FOUND');

rollback;
