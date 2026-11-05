-- Speed: indexes for the screens' lookups and one query for a product's delivery history.
-- No data changes.

-- Delivery history of a product, "is this product used" checks.
create index if not exists erp_document_lines_product_idx on public.erp_document_lines (product_id);
-- Document lists: newest first, optionally by type.
create index if not exists erp_documents_created_idx on public.erp_documents (created_at desc);
create index if not exists erp_documents_type_created_idx on public.erp_documents (doc_type, created_at desc);
-- "Is this product used in recipes / dishes" checks.
create index if not exists erp_recipe_lines_product_idx on public.erp_recipe_lines (product_id);
create index if not exists erp_dish_lines_product_idx on public.erp_dish_lines (product_id);

-- Latest posted deliveries and opening balances of one product (was three round trips).
create or replace function public.erp_product_receipts(p_product uuid, p_limit integer default 20)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(r order by r.doc_date desc, r.doc_no desc), '[]'::jsonb)
  from (
    select d.id as document_id, d.doc_no, d.doc_type, d.warehouse_id, d.supplier_id,
           to_char(d.doc_date, 'YYYY-MM-DD') as doc_date,
           l.qty, l.unit_cost, l.cost_amount
    from public.erp_document_lines l
    join public.erp_documents d on d.id = l.document_id
    where l.product_id = p_product and d.status = 'posted' and d.doc_type in ('receipt', 'opening')
    order by d.doc_date desc, d.doc_no desc
    limit greatest(1, least(coalesce(p_limit, 20), 200))
  ) r;
$$;

revoke all on function public.erp_product_receipts(uuid, integer) from public, anon, authenticated;
grant execute on function public.erp_product_receipts(uuid, integer) to service_role;
