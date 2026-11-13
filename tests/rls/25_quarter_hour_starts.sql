-- Test 25: book_slot() og klinikkens forslag (clinic_decide_lead()) afviser starttider, der ikke ligger på et helt kvarter (fx 10:07 eller 10:15:30).
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.mk_case('pA', 'Q_e1');
select tt.mk_case('pA', 'Q_e3');
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
-- Klinikkens forslag til en akuttid
select public.send_leads(tt.id('Q_e1'), array[tt.cid('X')], tt.svc('akut_konsultation'), 'Alma Test', '+45 12345678');
select public.send_leads(tt.id('Q_e3'), array[tt.cid('Y')], tt.svc('akut_konsultation'), 'Alma Test', '+45 12345678');
select tt.as_user(tt.id('uX'));
select tt.denied(format('select public.clinic_decide_lead(%L, %L, p_proposed_starts_at => %L)', tt.lead('Q_e1', 'X'), 'accept', tt.slot(3, 18, 7)),
                 'forslag 18:07 afvises', 'SLOT_UNAVAILABLE');
select tt.denied(format('select public.clinic_decide_lead(%L, %L, p_proposed_starts_at => %L)', tt.lead('Q_e1', 'X'), 'accept', tt.slot(3, 18, 15, 30)),
                 'forslag 18:15:30 afvises', 'SLOT_UNAVAILABLE');
select tt.as_postgres();
select tt.eq((select l.status::text from public.leads l where l.id = tt.lead('Q_e1', 'X')), 'sent', 'afviste forslag efterlod leadet ubesvaret');
select tt.eq((select count(*) from public.bookings where clinic_id in (select tt.cid(n.name) from tt.clinic_names n))::int, 0, 'ingen bookinger oprettet');

-- Hele kvarterer lykkes (kontrol)
select tt.as_user(tt.id('pA'));
select tt.allowed(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('Q_acc', 'X'), tt.svc('undersoegelse'), tt.slot(3, 10, 15), 'Alma Test', '+45 12345678'), 'book_slot 10:15 lykkes');
select tt.as_user(tt.id('uY'));
select tt.allowed(format('select public.clinic_decide_lead(%L, %L, p_proposed_starts_at => %L)', tt.lead('Q_e3', 'Y'), 'accept', tt.slot(3, 18, 45)), 'forslag 18:45 lykkes');

rollback;
