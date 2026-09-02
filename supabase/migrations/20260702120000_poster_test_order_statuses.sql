-- Extend poster_test_orders status workflow for merchant panel (Phase 2).

alter table public.poster_test_orders
  drop constraint if exists poster_test_orders_status_check;

update public.poster_test_orders
set status = 'preparing'
where status = 'confirmed';

alter table public.poster_test_orders
  add constraint poster_test_orders_status_check
  check (status in ('pending', 'preparing', 'ready', 'completed', 'cancelled'));

create index if not exists poster_test_orders_status_created_idx
  on public.poster_test_orders (status, created_at desc);
