-- Test 51 (arbejdsplan 7.12a, architecture 5.6 punkt 52, 4.3, migration 20261028000500): pensionerede samtykkeversioner.
-- Hver type har præcis én gældende tekstversion; v0-delingssamtykket kan ikke gives med patientens JWT; en patient med
-- v0 som seneste samtykke afvises af send_leads() og send_emergency_lead(); tilbagetrækning gælder hele typen.
begin;
\ir _helpers.sql
\ir _fixtures.sql

select tt.as_postgres();
select tt.eq((select count(*) from (select type from public.consent_text_versions where retired_at is null group by type having count(*) <> 1) x)::int, 0, 'hver type har præcis én gældende version');
select tt.eq((select count(distinct type) from public.consent_text_versions where retired_at is null)::int, 3, 'alle tre typer har en gældende version');
select tt.ok((select retired_at is not null from public.consent_text_versions where text_version = 'health_data_sharing@v0-prototype'), 'v0-delingssamtykket er pensioneret');

-- v0 kan ikke gives med patientens egen JWT
select tt.as_user(tt.id('pC'));
select tt.denied(format('insert into public.consents (patient_id, type, text_version, granted_while_anonymous) values (%L, %L, %L, false)',
                        tt.id('pC'), 'health_data_sharing', 'health_data_sharing@v0-prototype'), 'v0 kan ikke gives af patienten', '42501');
select tt.ok(not public.is_allowed_consent_text('health_data_sharing', 'health_data_sharing@v0-prototype'), 'is_allowed_consent_text afviser v0');
select tt.ok(public.is_allowed_consent_text('health_data_sharing', 'health_data_sharing@v1-klinikker'), 'is_allowed_consent_text tillader v1');

-- Patient med v0 som seneste samtykke (fixture indsat som service role)
select tt.as_postgres();
insert into public.consents (patient_id, type, text_version, granted_while_anonymous)
values (tt.id('pC'), 'health_data_sharing', 'health_data_sharing@v0-prototype', false);
select tt.mk_case('pC', 'R1');
select tt.as_user(tt.id('pC'));
select tt.ok(not public.has_active_consent('health_data_sharing'), 'v0 er ikke et gældende samtykke');
select tt.denied(format('select public.send_leads(%L, array[%L]::uuid[])', tt.id('R1'), tt.cid('X')), 'send_leads afviser v0', 'CONSENT_REQUIRED');
select tt.denied(format('select * from public.send_emergency_lead(%L, %L, %L, %L, %L, %L, null)', tt.cid('Z'), tt.svc('akut_konsultation'), tt.slot(3, 18),
                        'Jeg har slemme smerter i en kindtand.', 'Alma Test', '+45 12345678'), 'send_emergency_lead afviser v0', 'CONSENT_REQUIRED');
-- Et v0-samtykke kan stadig trækkes tilbage
select tt.allowed(format('select public.withdraw_consent(%L)', tt.consent('pC', 'health_data_sharing')), 'v0 kan trækkes tilbage');
-- Efter v1 kan der sendes
select tt.allowed(format('insert into public.consents (patient_id, type, text_version, granted_while_anonymous) values (%L, %L, %L, false)',
                         tt.id('pC'), 'health_data_sharing', 'health_data_sharing@v1-klinikker'), 'v1 kan gives');
select tt.ok(public.has_active_consent('health_data_sharing'), 'v1 er gældende');
select tt.allowed(format('select public.send_leads(%L, array[%L]::uuid[])', tt.id('R1'), tt.cid('X')), 'send_leads lykkes efter v1');

-- Samlet tilbagetrækning: v0 og v1 aktive, tilbagetrækning af v1 rydder begge
select tt.as_postgres();
select tt.mk_case('pA', 'R2');
select tt.mk_lead('R2', 'Y', 'sent');
insert into public.consents (patient_id, type, text_version, granted_while_anonymous)
values (tt.id('pA'), 'health_data_sharing', 'health_data_sharing@v0-prototype', false);
update public.consents set created_at = created_at - interval '1 hour'
 where patient_id = tt.id('pA') and type = 'health_data_sharing' and text_version = 'health_data_sharing@v0-prototype';
select tt.as_user(tt.id('pA'));
select tt.eq((select w.withdrawn_leads from public.withdraw_consent(
  (select id from public.consents where patient_id = tt.id('pA') and type = 'health_data_sharing' and text_version = 'health_data_sharing@v1-klinikker' limit 1)) w),
  1, 'leadet trækkes tilbage');
select tt.ok(not public.has_active_consent('health_data_sharing'), 'bagefter er intet delingssamtykke aktivt');
select tt.as_postgres();
select tt.eq((select count(*) from public.consents where patient_id = tt.id('pA') and type = 'health_data_sharing' and withdrawn_at is null)::int, 0, 'begge versioner er trukket tilbage');
select tt.eq((select status::text from public.leads where id = tt.lead('R2', 'Y')), 'withdrawn', 'leadet er withdrawn');

rollback;
