# Customer Directory API Gaps

| Gap | Current V2 behavior | Recommended backend follow-up |
| --- | --- | --- |
| No customer-directory read endpoint scoped to the `customers` menu | Reads the existing full state once, immediately discards unrelated collections, and performs honest client-side filtering/paging | Add a permission-trimmed SQL list endpoint with search, filters, sorting, pagination and aggregate summary |
| Full state may expose customer records independently of menu-specific collection trimming | The route is gated by the session-derived `customers` permission and the adapter removes unrelated state, but frontend hiding is not a security boundary | Enforce collection-level permission trimming in the state endpoint or replace it with the scoped list endpoint |
| Create and edit use different permission families | Create follows `customers`; edit is hidden without `crm` because the only update endpoint requires `crm` | Provide one customer archive command contract with explicit create/update permissions |
| CSV import has no transactional bulk command | This slice offers safe export only; it does not loop many create requests and claim atomic import | Add validated bulk preview/import with row-level errors and transaction semantics |
| Legacy create does not guarantee normalized CRM dual-write | V2 uses the existing V1-compatible create endpoint and refreshes customer state | Align customer creation with normalized CRM account synchronization without changing the public business contract |
