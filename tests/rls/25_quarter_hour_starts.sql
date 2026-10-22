-- Test 25: book_slot() og send_leads() afviser starttider, der ikke ligger på et helt kvarter (fx 10:07 eller 10:15:30).
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.mk_case('pA', 'Q_e1');
select tt.mk_case('pA', 'Q_e2');
select tt.mk_case('pA', 'Q_e3');
select tt.mk_case('pA', 'Q_e4');
select tt.mk_case('pA', 'Q_acc');
select tt.mk_lead('Q_acc', 'X', 'accepted');

select tt.as_user(tt.id('pA'));
-- book_slot
select tt.denied(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('Q_acc', 'X'), tt.svc('undersoegelse'), tt.slot(3, 10, 7), 'Alma Test', '+45 12345678'),
                 'book_slot afviser 10:07', 'SLOT_UNAVAILABLE');
select tt.denied(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('Q_acc', 'X'), tt.svc('undersoegelse'), tt.slot(3, 10, 15, 30), 'Alma Test', '+45 12345678'),
                 'book_slot afviser 10:15:30', 'SLOT_UNAVAILABLE');
select tt.denied(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('Q_acc', 'X'), tt.svc('undersoegelse'), tt.slot(3, 10, 14), 'Alma Test', '+45 12345678'),
                 'book_slot afviser 10:14', 'SLOT_UNAVAILABLE');
select tt.denied(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('Q_acc', 'X'), tt.svc('undersoegelse'), tt.slot(3, 10, 0, 1), 'Alma Test', '+45 12345678'),
                 'book_slot afviser 10:00:01', 'SLOT_UNAVAILABLE');
-- send_leads (akut)
select tt.denied(format('select public.send_leads(%L, array[%L]::uuid[], %L, %L, %L, %L)', tt.id('Q_e1'), tt.cid('X'), tt.svc('akut_konsultation'), tt.slot(3, 18, 7), 'Alma Test', '+45 12345678'),
                 'send_leads afviser akuttid 18:07', 'SLOT_UNAVAILABLE');
select tt.denied(format('select public.send_leads(%L, array[%L]::uuid[], %L, %L, %L, %L)', tt.id('Q_e2'), tt.cid('X'), tt.svc('akut_konsultation'), tt.slot(3, 18, 15, 30), 'Alma Test', '+45 12345678'),
                 'send_leads afviser akuttid 18:15:30', 'SLOT_UNAVAILABLE');
select tt.as_postgres();
select tt.eq((select count(*) from public.leads where case_id in (tt.id('Q_e1'), tt.id('Q_e2')))::int, 0, 'afviste send_leads efterlod ingen leads');
select tt.eq((select count(*) from public.bookings where clinic_id in (select tt.cid(n.name) from tt.clinic_names n))::int, 0, 'ingen bookinger oprettet');

-- Hele kvarterer lykkes (kontrol)
select tt.as_user(tt.id('pA'));
select tt.allowed(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('Q_acc', 'X'), tt.svc('undersoegelse'), tt.slot(3, 10, 15), 'Alma Test', '+45 12345678'), 'book_slot 10:15 lykkes');
select tt.allowed(format('select public.send_leads(%L, array[%L]::uuid[], %L, %L, %L, %L)', tt.id('Q_e3'), tt.cid('Y'), tt.svc('akut_konsultation'), tt.slot(3, 18, 45), 'Alma Test', '+45 12345678'), 'send_leads 18:45 lykkes');
select tt.allowed(format('select public.send_leads(%L, array[%L]::uuid[], %L, %L, %L, %L)', tt.id('Q_e4'), tt.cid('Z'), tt.svc('akut_konsultation'), tt.slot(3, 18, 0), 'Alma Test', '+45 12345678'), 'send_leads 18:00 lykkes');

rollback;
