-- Read-only recount of live erp_packs duplicates. No writes.
select
  (select count(*) from public.erp_packs) as packs_all,
  (select count(*) from public.erp_packs where archived_at is null) as packs_live,
  (select count(*) from (
     select 1 from public.erp_packs
     where archived_at is null
     group by name, unit, qty_base
     having count(*) > 1
  ) d) as duplicate_groups,
  (select coalesce(sum(cnt), 0) from (
     select count(*) as cnt from public.erp_packs
     where archived_at is null
     group by name, unit, qty_base
     having count(*) > 1
  ) s) as sum_group_sizes,
  (select coalesce(sum(cnt - 1), 0) from (
     select count(*) as cnt from public.erp_packs
     where archived_at is null
     group by name, unit, qty_base
     having count(*) > 1
  ) e) as extra;

select name, unit, qty_base, count(*) as n
from public.erp_packs
where archived_at is null
group by name, unit, qty_base
having count(*) > 1
order by name, unit, qty_base;
