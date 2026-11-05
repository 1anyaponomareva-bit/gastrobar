-- After erp_pack_exact_duplicates migration. Read-only.
select
  (select count(*) from public.erp_packs where archived_at is null) as packs_live,
  (select count(*) from public.erp_packs where archived_at is not null) as packs_archived,
  (select count(*) from public.erp_pack_merge_map where rolled_back_at is null) as mapped,
  (select count(*) from public.erp_pack_merge_skip) as skipped,
  (select count(*) from (
     select 1 from public.erp_packs
     where archived_at is null
     group by name, unit, qty_base
     having count(*) > 1
  ) d) as live_duplicate_groups,
  (select count(*) from public.erp_product_packs k
     left join public.erp_packs p on p.id = k.pack_id
     where k.archived_at is null and p.id is null) as broken_links,
  (select coalesce(sum(qty_left), 0) from public.erp_lots) as stock_qty,
  (select coalesce(sum(qty_left * unit_cost), 0) from public.erp_lots) as stock_value;
