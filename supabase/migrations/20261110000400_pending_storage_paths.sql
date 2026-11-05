-- Kø til filer, der skal slettes, og opbevaring af beskedbilleder (security-runde 2026-11-05, M3 og M4;
-- platform/README.md 4.3 og 5.3, features/leads/README.md 10.12).
--  * pending_storage_paths: en fil må aldrig blive forældreløs, fordi rækken blev slettet før filen. Triggere på de tabeller,
--    der peger på filer (case_images, message_images, portfolio_items, clinic_dentists.photo_path), lægger stien i køen i
--    samme transaktion som rækken slettes, uanset årsag (sag, billede, kontosletning, tilbagetrukket samtykke, retention).
--    Serveren sletter filen og fjerner derefter posten; /api/cron/cleanup-storage tømmer det, der er tilbage.
--  * purge_inactive_message_images(): sletter beskedbilleder 12 måneder efter sidste aktivitet i tråden (seneste besked,
--    ellers leadets sent_at). Kun service role. Triggeren lægger stierne i køen.

create table public.pending_storage_paths (
  id uuid primary key default gen_random_uuid(),
  bucket text not null check (bucket in ('case-images', 'public-media')),
  path text not null check (char_length(path) between 1 and 400),
  is_prefix boolean not null default false,
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now(),
  unique (bucket, path)
);

create index pending_storage_paths_created_idx on public.pending_storage_paths (created_at);

alter table public.pending_storage_paths enable row level security;
revoke all on public.pending_storage_paths from anon, authenticated;
grant all on public.pending_storage_paths to service_role;

create function public.queue_storage_path_after_delete()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_bucket text := tg_argv[0];
  v_path text;
begin
  v_path := to_jsonb(old) ->> tg_argv[1];
  if v_path is not null then
    insert into public.pending_storage_paths (bucket, path) values (v_bucket, v_path)
    on conflict (bucket, path) do nothing;
  end if;
  return old;
end;
$$;

revoke all on function public.queue_storage_path_after_delete() from public, anon, authenticated;

create trigger case_images_queue_path after delete on public.case_images
  for each row execute function public.queue_storage_path_after_delete('case-images', 'storage_path');
create trigger message_images_queue_path after delete on public.message_images
  for each row execute function public.queue_storage_path_after_delete('case-images', 'storage_path');
create trigger portfolio_items_queue_path after delete on public.portfolio_items
  for each row execute function public.queue_storage_path_after_delete('public-media', 'image_path');
create trigger clinic_dentists_queue_path after delete on public.clinic_dentists
  for each row execute function public.queue_storage_path_after_delete('public-media', 'photo_path');

-- Opbevaring: beskedbilleder slettes p_months måneder (standard 12) efter sidste aktivitet i tråden.
create function public.purge_inactive_message_images(p_months integer default 12)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_months is null or p_months < 1 then
    raise exception 'INVALID_INPUT' using errcode = '22023';
  end if;
  with stale as (
    select l.id
      from public.leads l
     where exists (select 1 from public.message_images i where i.lead_id = l.id)
       and coalesce((select max(m.created_at) from public.messages m where m.lead_id = l.id), l.sent_at)
           < now() - make_interval(months => p_months)
  ), d as (
    delete from public.message_images i using stale where i.lead_id = stale.id returning 1
  )
  select count(*)::integer into v_count from d;
  return v_count;
end;
$$;

revoke all on function public.purge_inactive_message_images(integer) from public, anon, authenticated;
grant execute on function public.purge_inactive_message_images(integer) to service_role;
