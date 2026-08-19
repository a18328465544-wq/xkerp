# Customer Directory API Contract

## Current read path

`GET /api/state?mode=full` is the only existing read path that preserves the `customers` menu permission model used by the customer archive page. The frontend endpoint immediately projects `data.customers` into `CustomerDirectorySnapshot`; pages and components never receive the raw state response.

Filtering, sorting and pagination are explicitly performed on the loaded customer collection. The UI does not describe these operations as server-side.

## Current command paths

| Capability | Endpoint | Existing permission |
| --- | --- | --- |
| Create customer | `POST /api/customers` | `customers` |
| Edit customer | `PATCH /api/gpu_erp/crm/customer/:id` | `crm` |
| Delete customer | `DELETE /api/customers/:id` | `customers` plus delete permission |

The request adapter preserves existing S-level/core-customer and R-level/risk-reason semantics. Server validation remains authoritative.

## Permission projection

- Page access and create use the existing `customers` menu.
- Edit is exposed only when the existing `crm` menu is available because the current patch endpoint requires it.
- Delete additionally requires the existing delete permission.
- `totalProfit` is removed by the adapter when `showProfit` is false.
