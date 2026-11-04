-- Push-tokens (identity 4.3 `push_tokens`, platform 5.4 og 14, besluttet 2026-11-04).
-- Patientens enheder til push i appen. RLS: patienten kan læse og slette egne rækker; ingen INSERT/UPDATE for klientroller.
-- Rækker skrives kun af register_push_token(), som kræver en permanent patient, et gyldigt Expo-token og en gyldig platform.
-- Mønstret skal være det samme som PUSH_TOKEN_PATTERN i lib/identity/constants/push-tokens.ts.

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null unique,
  platform text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint push_tokens_token_format check (token ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,200}\]$'),
  constraint push_tokens_platform_check check (platform in ('ios', 'android'))
);

create index push_tokens_user_idx on public.push_tokens (user_id, last_seen_at desc);

alter table public.push_tokens enable row level security;

create policy push_tokens_select_own on public.push_tokens
  for select to authenticated using (user_id = (select auth.uid()));
create policy push_tokens_delete_own on public.push_tokens
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.push_tokens from anon, authenticated;
grant select, delete on public.push_tokens to authenticated;

-- register_push_token(): registrerer (eller genregistrerer) enhedens token for den kaldende patient.
create function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_max constant integer := 5; -- MAX_PUSH_TOKENS_PER_USER (lib/identity/constants/push-tokens.ts)
begin
  if v_uid is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  if not public.is_permanent_user()
     or not exists (select 1 from public.profiles p where p.id = v_uid and p.role = 'patient') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_token is null or p_token !~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,200}\]$'
     or p_platform is null or p_platform not in ('ios', 'android') then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;

  -- Samme telefon, ny konto: tokenet flyttes til den nye bruger.
  delete from public.push_tokens where token = p_token and user_id <> v_uid;

  -- clock_timestamp() (ikke now()), så rækkernes rækkefølge også er entydig inden for én transaktion.
  insert into public.push_tokens (user_id, token, platform, created_at, last_seen_at)
  values (v_uid, p_token, p_platform, clock_timestamp(), clock_timestamp())
  on conflict (token) do update set platform = excluded.platform, last_seen_at = clock_timestamp();

  -- Højst v_max enheder pr. patient: de ældste (efter last_seen_at) slettes.
  delete from public.push_tokens t
   where t.user_id = v_uid
     and t.id in (
       select o.id from public.push_tokens o
        where o.user_id = v_uid
        order by o.last_seen_at desc, o.created_at desc, o.id
        offset v_max
     );
end;
$$;

revoke all on function public.register_push_token(text, text) from public, anon;
grant execute on function public.register_push_token(text, text) to authenticated;
