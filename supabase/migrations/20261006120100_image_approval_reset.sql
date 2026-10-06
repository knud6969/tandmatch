-- Billedændringer nulstiller godkendelsen af opsummeringen (architecture 9.3, punkt 6).
-- Gælder insert og delete på request_images. Kun kladder berøres, og sendte forespørgsler er uændrede.
-- AFTER-trigger: ved kaskade-sletning af forespørgslen findes rækken ikke længere, og opdateringen rammer 0 rækker.

create or replace function public.request_images_reset_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  update public.requests
     set summary_approved_at = null
   where id = case when tg_op = 'DELETE' then old.request_id else new.request_id end
     and status = 'draft'
     and summary_approved_at is not null;
  return null;
end;
$fn$;

revoke all on function public.request_images_reset_approval() from public, anon, authenticated;

create trigger request_images_reset_approval
  after insert or delete on public.request_images
  for each row execute function public.request_images_reset_approval();
