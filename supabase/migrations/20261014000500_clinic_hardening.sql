-- 1.9.1 del 5: kolonne-grants på tandlæger (security M1), website-check (L1) og lofter i databasen (L4)
-- (architecture 5.1 regel 12, 7.6).

-- M1: authenticated skriver kun tandlægens redigerbare felter. photo_path/photo_updated_at skrives af serveren med
-- service role efter upload (2.3 d). (clinic_id kan sættes ved insert; RLS kræver, at det er ejerens egen klinik.)
revoke insert, update on public.clinic_dentists from authenticated;
grant insert (clinic_id, full_name, title, bio, sort_order) on public.clinic_dentists to authenticated;
grant update (full_name, title, bio, sort_order) on public.clinic_dentists to authenticated;
-- portfolio_items.image_path og clinics.logo_path/logo_updated_at er allerede udenfor kolonne-grants (insert/delete
-- er revoket på portfolio_items; update er begrænset til caption og service_id / clinics-listen i 000300).

-- L1: klinikkens website skal være et http(s)-link (samme regel som API'et). Eksisterende ugyldige værdier ryddes.
update public.clinics set website = null where website is not null and website !~* '^https?://';
alter table public.clinics add constraint clinics_website_http check (website is null or website ~* '^https?://');

-- L4: lofterne også i databasen (samme tal som lib/constants/clinics.ts), så de ikke kan omgås med brugerens JWT.
create function public.clinic_row_limit_guard()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_limit integer := tg_argv[0]::integer;
  v_code text := tg_argv[1];
  v_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(tg_table_name || ':' || new.clinic_id::text, 0));
  execute format('select count(*) from public.%I where clinic_id = $1', tg_table_name) into v_count using new.clinic_id;
  if v_count >= v_limit then
    raise exception '%', v_code using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.clinic_row_limit_guard() from public, anon, authenticated;

create trigger clinic_dentists_limit before insert on public.clinic_dentists
  for each row execute function public.clinic_row_limit_guard(30, 'DENTIST_LIMIT');
create trigger portfolio_items_limit before insert on public.portfolio_items
  for each row execute function public.clinic_row_limit_guard(60, 'PORTFOLIO_LIMIT');
create trigger clinic_opening_hours_limit before insert on public.clinic_opening_hours
  for each row execute function public.clinic_row_limit_guard(42, 'OPENING_HOURS_LIMIT');
create trigger clinic_time_blocks_limit before insert on public.clinic_time_blocks
  for each row execute function public.clinic_row_limit_guard(200, 'TIME_BLOCK_LIMIT');
create trigger clinic_prices_limit before insert on public.clinic_prices
  for each row execute function public.clinic_row_limit_guard(100, 'PRICE_LIMIT');
