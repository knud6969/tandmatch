-- Test 71 (migration 20261113000200, clinics 6.7): danske helligdage er lukket som udgangspunkt. danish_holidays() giver de
-- rigtige datoer; en helligdag står som optaget hele dagen i public_busy_intervals() og kan hverken bookes eller foreslås;
-- en klinik med open_on_holidays kan bookes på dagen. Klinikken kan selv ændre open_on_holidays, men ikke en andens.
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.as_postgres();
-- Fixturerne har åbent på helligdage; X og Y sættes tilbage til udgangspunktet (lukket).
update public.clinics set open_on_holidays = false where id in (tt.cid('X'), tt.cid('Y'));
select tt.eq((select string_agg(to_char(day, 'MM-DD'), ',' order by day) from public.danish_holidays('2026-01-01', '2026-12-31')),
             '01-01,04-02,04-03,04-05,04-06,05-14,05-24,05-25,06-05,12-24,12-25,12-26,12-31', '2026: alle helligdage');
select tt.eq(public.easter_sunday(2027), '2027-03-28'::date, 'påskedag 2027');
select tt.eq(public.easter_sunday(2025), '2025-04-20'::date, 'påskedag 2025');

-- Den næste helligdag mindst 2 dage frem (inden for bookinghorisonten på 60 dage)
create temp table hd as
  select min(day) as day from public.danish_holidays(current_date + 2, current_date + 400) where day <= current_date + 59;
grant select on hd to public;

select tt.mk_case('pA', 'H1');
select tt.mk_lead('H1', 'X', 'accepted');
select tt.mk_case('pA', 'H2');
select tt.mk_lead('H2', 'Y', 'accepted');

-- Uden helligdag i horisonten (sjældent, fx sidst på sommeren) testes kun funktionerne ovenfor.
do $$
begin
  if (select day from hd) is null then
    raise notice 'Ingen helligdag inden for 60 dage; bookingdelen springes over.';
  end if;
end $$;

select tt.as_anon();
select tt.ok((select (select day from hd) is null) or exists (
  select 1 from public.public_busy_intervals(array[tt.cid('X')], now(), now() + interval '60 days') b
   where b.starts_at = ((select day from hd)::timestamp at time zone 'Europe/Copenhagen')
     and b.ends_at = (((select day from hd) + 1)::timestamp at time zone 'Europe/Copenhagen')),
  'helligdagen står som optaget hele dagen');

select tt.as_user(tt.id('pA'));
select case when (select day from hd) is not null then
  tt.denied(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('H1', 'X'), tt.svc('undersoegelse'),
                   ((select day from hd) + time '10:00') at time zone 'Europe/Copenhagen', 'Alma Test', '+45 12345678'),
            'en helligdag kan ikke bookes', 'SLOT_UNAVAILABLE') end;

-- Klinik Y har åbent på helligdage
select tt.as_user(tt.id('uY'));
update public.clinics set open_on_holidays = true where id = tt.cid('Y');
select tt.as_postgres();
select tt.eq((select open_on_holidays from public.clinics where id = tt.cid('Y')), true, 'klinikken kan selv slå åbent på helligdage til');
select tt.as_user(tt.id('uY'));
update public.clinics set open_on_holidays = true where id = tt.cid('X');
select tt.as_postgres();
select tt.eq((select open_on_holidays from public.clinics where id = tt.cid('X')), false, 'en anden klinik kan ikke ændre feltet');

select tt.as_user(tt.id('pA'));
select case when (select day from hd) is not null then
  tt.allowed(format('select public.book_slot(%L, %L, %L, %L, %L)', tt.lead('H2', 'Y'), tt.svc('undersoegelse'),
                    ((select day from hd) + time '10:00') at time zone 'Europe/Copenhagen', 'Alma Test', '+45 12345678'),
             'klinik med åbent på helligdage kan bookes') end;
select tt.as_anon();
select tt.ok(not exists (
  select 1 from public.public_busy_intervals(array[tt.cid('Y')], now(), now() + interval '60 days') b
   where b.ends_at - b.starts_at >= interval '23 hours'), 'ingen hele helligdage som optaget for Y');

rollback;
