# Down Migration Strategy (Issue #2)

Because this is the initial foundational schema migration, rollback is handled via a full drop/recreate strategy in non-production environments and forward-fix migrations in shared/prod-like environments.

## Recommended rollback approach

1. **Local/dev reset (preferred for early MVP)**
   - Reset DB and re-apply migrations from scratch.
   - Ensures clean state with no partial rollback drift.

2. **Shared/staging/prod-like environments**
   - Do **not** run destructive down migration automatically.
   - Use a forward corrective migration for any schema defects.

## Optional manual destructive rollback script

If a destructive rollback is explicitly approved:

```sql
BEGIN;
DROP TABLE IF EXISTS public.settlements CASCADE;
DROP TABLE IF EXISTS public.audit_events CASCADE;
DROP TABLE IF EXISTS public.participant_totals CASCADE;
DROP TABLE IF EXISTS public.split_rules CASCADE;
DROP TABLE IF EXISTS public.item_allocations CASCADE;
DROP TABLE IF EXISTS public.bill_items CASCADE;
DROP TABLE IF EXISTS public.bill_participants CASCADE;
DROP TABLE IF EXISTS public.bills CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
COMMIT;
```

This strategy satisfies Issue #2 acceptance by documenting a rollback/down path while avoiding unsafe automatic down migrations.
