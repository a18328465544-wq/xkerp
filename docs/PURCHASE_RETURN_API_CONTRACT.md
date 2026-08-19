# Purchase Return API Contract

## List

V2 calls `GET /api/returns` with `type=进货退货`, plus the existing `keyword`, `status`, `page` and `pageSize` parameters. FastAPI enforces `return_purchase`, `return_orders` or `all`, then applies the return-type permission to every row.

The page consumes the nested paginated envelope through a DTO and adapter. It does not read the raw API response.

## Create

`POST /api/returns`

The request adapter emits the existing fields only:

- `type=进货退货`
- `relatedDocType=采购单`
- date and related purchase number
- exact source inventory ID
- original purchase amount
- settlement mode
- optional legacy refund account
- handler, reason, inventory action and remarks

The backend verifies purchase ownership, inventory status, original item price, duplicate active returns and settlement legality. V2 creates a `待处理` return and does not mutate inventory or finance locally.

## Complete

`POST /api/returns/:id/complete`

FastAPI applies the authoritative settlement order:

```text
unpaid payable
→ previously applied vendor credit
→ paid cash
```

It then updates the purchase invoice, supplier/customer balance, payment records, ledgers and inventory state. The confirmation dialog explicitly warns about these effects.

## Direct write-off

The UI preview mirrors the backend eligibility check, but the server remains authoritative. It is only eligible for a full purchase return with no vendor credit and exactly one matching purchase payment.

## Edit history fields

`PATCH /api/returns/:id`

V2 sends only the fields already accepted by the existing return update action:

```text
{ handler?: string, reason?: string, remarks?: string }
```

The page exposes this action only when the current session has `canEditHistory`. It does not alter the purchase amount, settlement mode, inventory action or completion status.

## Delete / reversal

`DELETE /api/returns/:id`

The page exposes this action only when the current session has `canDelete`. A completed purchase return is presented as “删除并冲销”; the existing backend remains responsible for restoring the linked purchase, inventory, payment, ledger and supplier state. A pending return is presented as “删除” and does not perform completion effects.

The list page export is a client-generated CSV of the currently loaded server page; it does not claim to export the complete dataset.
