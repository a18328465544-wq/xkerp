import type {Express, Request, RequestHandler} from "express";
import {parseHttpDto, paymentInCreateDto, paymentInUpdateDto, paymentOutCreateDto, paymentOutUpdateDto} from "../httpDto.ts";
import {saveStateRecords} from "../db.ts";
import {runStateCommand, type StateCommandTransactionHook} from "../stateCommand.ts";
import {compactStateMerge, stateDeleteRecords, stateMergeRecords, statePatchResponse, type StateDeletePatch, type StateMergePatch} from "../statePatch.ts";
import type {AccountTransferRecord, PaymentInRecord, PaymentOutRecord} from "../../src/types.ts";
import type {AppState, createStoreActions} from "../store.ts";

type FinancePaymentRequest = Request & {
  authUser?: {displayName?: string; username?: string};
};

type IdempotencyContext = {
  request: {
    tenantId: string;
    route: string;
    key: string;
    requestHash: string;
  };
  replay?: {statusCode: number; response: unknown};
};

type FinancePaymentDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  requireDeletePermission: RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  getState: () => AppState;
  actions: (req: Request) => ReturnType<typeof createStoreActions>;
  claimMutationIdempotency: (req: FinancePaymentRequest) => Promise<IdempotencyContext | null>;
  releaseMutationIdempotency: (context: IdempotencyContext | null) => Promise<void>;
  transactionHookWithIdempotency: <T>(context: IdempotencyContext | null, statusCode: number) => StateCommandTransactionHook<T> | undefined;
  persistEntityImages: (req: FinancePaymentRequest, entityType: string, entityId: string, relationRole: string) => Promise<string[] | undefined>;
  paymentInMerge: (record: PaymentInRecord) => StateMergePatch;
  paymentOutMerge: (record: PaymentOutRecord) => StateMergePatch;
  accountTransferMerge: (record: AccountTransferRecord) => StateMergePatch;
};

function recordsByIds<T extends {id: string}>(items: T[], ids: Iterable<string | undefined>) {
  const idSet = new Set(Array.from(ids).filter(Boolean));
  if (!idSet.size) return [];
  return items.filter((item) => idSet.has(item.id));
}

function withoutImagePayload(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const clean = {...(body as Record<string, unknown>)};
  delete clean.images;
  delete clean.imageUrls;
  return clean;
}

function okMerge(data: unknown, stateMerge: StateMergePatch, stateDelete: StateDeletePatch = {}) {
  return statePatchResponse(data, stateMerge, stateDelete);
}

/**
 * Payment and account-transfer mutations share one route boundary. The domain
 * merge functions remain injected from the composition root until the store
 * extraction introduces dedicated finance services.
 */
export function registerFinancePaymentRoutes(app: Express, dependencies: FinancePaymentDependencies) {
  app.post(
    "/api/gpu_erp/finance/payment-in/create",
    dependencies.requireMenu("payment_in"),
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as FinancePaymentRequest;
      const idempotency = await dependencies.claimMutationIdempotency(authRequest);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(idempotency.replay.response);
        return;
      }
      try {
        const command = parseHttpDto(paymentInCreateDto, withoutImagePayload(req.body));
        const {data: created, stateMerge} = await runStateCommand(
          () => dependencies.actions(authRequest).createPaymentIn(command),
          dependencies.paymentInMerge,
          async (record) => {
            const urls = await dependencies.persistEntityImages(authRequest, "payment_in", record.id, "payment-evidence");
            if (urls) record.images = urls;
          },
          dependencies.transactionHookWithIdempotency(idempotency, 201),
        );
        res.status(201).json(okMerge(created, stateMerge));
      } catch (error) {
        await dependencies.releaseMutationIdempotency(idempotency);
        throw error;
      }
    }),
  );

  app.put(
    "/api/gpu_erp/finance/payment-in/:id",
    dependencies.requireMenu("payment_in"),
    dependencies.asyncRoute(async (req, res) => {
      const command = parseHttpDto(paymentInUpdateDto, withoutImagePayload(req.body));
      const {data: updated, stateMerge} = await runStateCommand(
        () => dependencies.actions(req).updatePaymentIn(req.params.id!, command),
        dependencies.paymentInMerge,
        async (record) => {
          const urls = await dependencies.persistEntityImages(req as FinancePaymentRequest, "payment_in", record.id, "payment-evidence");
          if (urls) record.images = urls;
        },
      );
      res.json(okMerge(updated, stateMerge));
    }),
  );

  app.delete(
    "/api/gpu_erp/finance/payment-in/:id",
    dependencies.requireMenu("payment_in"),
    dependencies.requireDeletePermission,
    dependencies.asyncRoute(async (req, res) => {
      const state = dependencies.getState();
      const existing = state.paymentInRecords.find((item) => item.id === req.params.id!);
      const deleted = dependencies.actions(req).deletePaymentIn(req.params.id!);
      const relatedDocNos = new Set([existing?.id, existing?.relatedDocNo, deleted?.id, deleted?.relatedDocNo].filter(Boolean));
      const stateMerge = compactStateMerge({
        settlementAccounts: recordsByIds(state.settlementAccounts, [existing?.accountId, deleted?.accountId]),
        salesInvoices: state.salesInvoices.filter((item) => relatedDocNos.has(item.id) || relatedDocNos.has(item.invoiceNo)),
        customers: state.customers.filter((item) => item.id === existing?.customerId || item.id === deleted?.customerId),
        logs: state.logs.slice(0, 1),
      });
      const stateDelete = {
        paymentInRecords: deleted?.id ? [deleted.id] : [],
        settlementLedger: [existing?.settlementLedgerId, deleted?.settlementLedgerId].filter(Boolean) as string[],
        financeLedger: [existing?.financeLedgerId, deleted?.financeLedgerId].filter(Boolean) as string[],
      };
      await saveStateRecords([...stateMergeRecords(stateMerge), ...stateDeleteRecords(stateDelete)]);
      res.status(deleted ? 200 : 404).json(okMerge(deleted, stateMerge, stateDelete));
    }),
  );

  app.post(
    "/api/gpu_erp/finance/payment-out/create",
    dependencies.requireMenu("payment_out"),
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as FinancePaymentRequest;
      const idempotency = await dependencies.claimMutationIdempotency(authRequest);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(idempotency.replay.response);
        return;
      }
      try {
        const command = parseHttpDto(paymentOutCreateDto, withoutImagePayload(req.body));
        const {data: created, stateMerge} = await runStateCommand(
          () => dependencies.actions(authRequest).createPaymentOut(command),
          dependencies.paymentOutMerge,
          async (record) => {
            const urls = await dependencies.persistEntityImages(authRequest, "payment_out", record.id, "payment-evidence");
            if (urls) record.images = urls;
          },
          dependencies.transactionHookWithIdempotency(idempotency, 201),
        );
        res.status(201).json(okMerge(created, stateMerge));
      } catch (error) {
        await dependencies.releaseMutationIdempotency(idempotency);
        throw error;
      }
    }),
  );

  app.put(
    "/api/gpu_erp/finance/payment-out/:id",
    dependencies.requireMenu("payment_out"),
    dependencies.asyncRoute(async (req, res) => {
      const command = parseHttpDto(paymentOutUpdateDto, withoutImagePayload(req.body));
      const {data: updated, stateMerge} = await runStateCommand(
        () => dependencies.actions(req).updatePaymentOut(req.params.id!, command),
        dependencies.paymentOutMerge,
        async (record) => {
          const urls = await dependencies.persistEntityImages(req as FinancePaymentRequest, "payment_out", record.id, "payment-evidence");
          if (urls) record.images = urls;
        },
      );
      res.json(okMerge(updated, stateMerge));
    }),
  );

  app.delete(
    "/api/gpu_erp/finance/payment-out/:id",
    dependencies.requireMenu("payment_out"),
    dependencies.requireDeletePermission,
    dependencies.asyncRoute(async (req, res) => {
      const state = dependencies.getState();
      const existing = state.paymentOutRecords.find((item) => item.id === req.params.id!);
      const deleted = dependencies.actions(req).deletePaymentOut(req.params.id!);
      const relatedDocNos = new Set([existing?.id, existing?.relatedDocNo, deleted?.id, deleted?.relatedDocNo].filter(Boolean));
      const stateMerge = compactStateMerge({
        settlementAccounts: recordsByIds(state.settlementAccounts, [existing?.accountId, deleted?.accountId]),
        purchaseInvoices: state.purchaseInvoices.filter((item) => relatedDocNos.has(item.id) || relatedDocNos.has(item.invoiceNo)),
        vendors: state.vendors.filter((item) => item.id === existing?.supplierId || item.id === deleted?.supplierId),
        customers: state.customers.filter((item) => item.id === existing?.customerId || item.id === deleted?.customerId),
        logs: state.logs.slice(0, 1),
      });
      const stateDelete = {
        paymentOutRecords: deleted?.id ? [deleted.id] : [],
        settlementLedger: [existing?.settlementLedgerId, deleted?.settlementLedgerId].filter(Boolean) as string[],
        financeLedger: [existing?.financeLedgerId, deleted?.financeLedgerId].filter(Boolean) as string[],
      };
      await saveStateRecords([...stateMergeRecords(stateMerge), ...stateDeleteRecords(stateDelete)]);
      res.status(deleted ? 200 : 404).json(okMerge(deleted, stateMerge, stateDelete));
    }),
  );

  app.post(
    "/api/gpu_erp/finance/account-transfer/create",
    dependencies.requireMenu("account_transfer"),
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as FinancePaymentRequest;
      const idempotency = await dependencies.claimMutationIdempotency(authRequest);
      if (idempotency?.replay) {
        res.status(idempotency.replay.statusCode).json(idempotency.replay.response);
        return;
      }
      try {
        const {data: created, stateMerge} = await runStateCommand(
          () => dependencies.actions(authRequest).createAccountTransfer(req.body),
          dependencies.accountTransferMerge,
          undefined,
          dependencies.transactionHookWithIdempotency(idempotency, 201),
        );
        res.status(201).json(okMerge(created, stateMerge));
      } catch (error) {
        await dependencies.releaseMutationIdempotency(idempotency);
        throw error;
      }
    }),
  );

  app.put(
    "/api/gpu_erp/finance/account-transfer/:id",
    dependencies.requireMenu("account_transfer"),
    dependencies.asyncRoute(async (req, res) => {
      const {data: updated, stateMerge} = await runStateCommand(
        () => dependencies.actions(req).updateAccountTransfer(req.params.id!, req.body),
        dependencies.accountTransferMerge,
      );
      res.json(okMerge(updated, stateMerge));
    }),
  );

  app.delete(
    "/api/gpu_erp/finance/account-transfer/:id",
    dependencies.requireMenu("account_transfer"),
    dependencies.requireDeletePermission,
    dependencies.asyncRoute(async (req, res) => {
      const state = dependencies.getState();
      const existing = state.accountTransfers.find((item) => item.id === req.params.id!);
      const settlementLedgerIds = state.settlementLedger.filter((item) => item.relatedDocNo === req.params.id!).map((item) => item.id);
      const financeLedgerIds = state.financeLedger.filter((item) => item.relatedId === req.params.id!).map((item) => item.id);
      const deleted = dependencies.actions(req).deleteAccountTransfer(req.params.id!);
      const stateMerge = compactStateMerge({
        settlementAccounts: recordsByIds(state.settlementAccounts, [existing?.fromAccountId, existing?.toAccountId, deleted?.fromAccountId, deleted?.toAccountId]),
        logs: state.logs.slice(0, 1),
      });
      const stateDelete = {
        accountTransfers: deleted?.id ? [deleted.id] : [],
        settlementLedger: settlementLedgerIds,
        financeLedger: financeLedgerIds,
      };
      await saveStateRecords([...stateMergeRecords(stateMerge), ...stateDeleteRecords(stateDelete)]);
      res.status(deleted ? 200 : 404).json(okMerge(deleted, stateMerge, stateDelete));
    }),
  );
}
