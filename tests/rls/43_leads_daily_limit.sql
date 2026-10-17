-- Test 43: døgnloftet for leads (architecture 7.6): højst 15 leads pr. patient på rullende 24 timer på tværs af sager og
-- status; ældre leads tæller ikke; en anden patient påvirkes ikke; loftet gælder også gennem send_leads().
begin;
\ir _helpers.sql
\ir _fixtures.sql

-- 14 sager med ét afvist lead hver hos X (afviste tæller med i døgnloftet), plus 1 mere = 15
do $$
declare i int;
begin
  for i in 1..15 loop
    perform tt.mk_case('pA', 'D' || i);
    perform tt.mk_lead('D' || i, 'X', 'declined');
  end loop;
end $$;
select tt.eq((select count(*) from public.leads l join public.cases c on c.id = l.case_id where c.patient_id = tt.id('pA'))::int, 15, 'opsætning: 15 leads på tværs af sager');

-- Det 16. lead afvises, både direkte og via send_leads() (S er pA's sag uden leads)
select tt.denied(format('insert into public.leads (case_id, clinic_id) values (%L, %L)', tt.id('S'), tt.cid('Y')),
                 '16. lead på 24 timer afvises (trigger)', 'LEAD_DAILY_LIMIT');
select tt.as_user(tt.id('pA'));
select tt.denied(format('select public.send_leads(%L, array[%L]::uuid[])', tt.id('S'), tt.cid('Y')),
                 '16. lead på 24 timer afvises (send_leads)', 'LEAD_DAILY_LIMIT');
select tt.as_postgres();
select tt.eq((select count(*) from public.leads l where l.case_id = tt.id('S'))::int, 0, 'afvisningen efterlod intet lead');

-- En anden patient har sit eget loft
select tt.as_user(tt.id('pB'));
select tt.eq(public.send_leads(tt.id('SB'), array[tt.cid('Y')])::int, 1, 'pB kan stadig sende');

-- Leads ældre end 24 timer tæller ikke: ryk ét af pA's leads tilbage i tiden
select tt.as_postgres();
alter table public.leads disable trigger leads_before_update;
update public.leads set sent_at = now() - interval '25 hours' where case_id = tt.id('D1');
alter table public.leads enable trigger leads_before_update;
select tt.as_user(tt.id('pA'));
select tt.eq(public.send_leads(tt.id('S'), array[tt.cid('Y')])::int, 1, 'et lead ældre end 24 timer tæller ikke, så der er plads igen');
select tt.denied(format('select public.send_leads(%L, array[%L]::uuid[])', tt.id('S'), tt.cid('Z')),
                 'loftet er nået igen', 'LEAD_DAILY_LIMIT');

rollback;
