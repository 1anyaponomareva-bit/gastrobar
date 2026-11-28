-- Owner: "Show in Orders" starts unchecked for everyone; they enable items manually.
-- Renames concept from Accountable Item to Show in Orders (UI only; column remains staff_listed).

comment on column public.erp_products.staff_listed is
  'Show in Orders / Показывать в Orders / Hiện trong Orders. Default false. When true (and not hidden/archived), product appears in Orders.';

update public.erp_products
set staff_listed = false
where coalesce(staff_listed, false) = true;
