import type {Express, Request, RequestHandler} from "express";
import type {AuthenticatedRequest} from "../httpAuth.ts";
import type {createStoreActions} from "../store.ts";
import type {SystemUserAccount} from "../../src/types.ts";
import {DEFAULT_STORE_ID, DEFAULT_TENANT_ID} from "../commercialConstants.ts";

type UserManagementRequest = AuthenticatedRequest<SystemUserAccount>;

type UserManagementDependencies = {
  requireBoss: RequestHandler;
  requireMenu: (menuId: string) => RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  actions: (req: Request) => ReturnType<typeof createStoreActions>;
  assertSeatAvailable: (tenantId: string, userId: string, storeId: string) => Promise<unknown>;
  persistUserWithMembership: (req: UserManagementRequest, user: SystemUserAccount) => Promise<SystemUserAccount>;
  revokeUserSessions?: (userId: string, tenantId: string) => Promise<unknown>;
  sendApiError: (req: UserManagementRequest, res: Parameters<RequestHandler>[1], status: number, code: string, message: string) => void;
  ok: (data?: unknown) => unknown;
};

/** User lifecycle operations are isolated from the app composition root and keep boss/seat checks together. */
export function registerUserManagementRoutes(app: Express, dependencies: UserManagementDependencies) {
  const permissionBoundary = [dependencies.requireBoss, dependencies.requireMenu("permissions")];

  app.get(
    "/api/users",
    ...permissionBoundary,
    (req, res) => {
      const authRequest = req as UserManagementRequest;
      res.json(dependencies.ok(dependencies.actions(authRequest).listUsers()));
    },
  );

  app.post(
    "/api/users",
    ...permissionBoundary,
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as UserManagementRequest;
      const created = dependencies.actions(authRequest).createUser(req.body);
      if (created.enabled) await dependencies.assertSeatAvailable(created.tenantId || DEFAULT_TENANT_ID, created.id, created.storeId || DEFAULT_STORE_ID);
      const persisted = await dependencies.persistUserWithMembership(authRequest, created);
      res.status(201).json(dependencies.ok(persisted));
    }),
  );

  app.put(
    "/api/users/:id",
    ...permissionBoundary,
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as UserManagementRequest;
      const updated = dependencies.actions(authRequest).updateUser(req.params.id!, req.body);
      if (updated.enabled) await dependencies.assertSeatAvailable(updated.tenantId || DEFAULT_TENANT_ID, updated.id, updated.storeId || DEFAULT_STORE_ID);
      const persisted = await dependencies.persistUserWithMembership(authRequest, updated);
      res.json(dependencies.ok(persisted));
    }),
  );

  app.post(
    "/api/users/:id/deactivate",
    ...permissionBoundary,
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as UserManagementRequest;
      if (req.params.id === authRequest.authUser?.id) {
        dependencies.sendApiError(authRequest, res, 400, "SELF_DEACTIVATION", "不能停用当前登录账号");
        return;
      }
      const updated = dependencies.actions(authRequest).updateUser(req.params.id!, {enabled: false});
      const persisted = await dependencies.persistUserWithMembership(authRequest, updated);
      await dependencies.revokeUserSessions?.(updated.id, updated.tenantId || DEFAULT_TENANT_ID);
      res.json(dependencies.ok(persisted));
    }),
  );

  app.post(
    "/api/users/:id/reactivate",
    ...permissionBoundary,
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as UserManagementRequest;
      const updated = dependencies.actions(authRequest).updateUser(req.params.id!, {enabled: true});
      await dependencies.assertSeatAvailable(updated.tenantId || DEFAULT_TENANT_ID, updated.id, updated.storeId || DEFAULT_STORE_ID);
      const persisted = await dependencies.persistUserWithMembership(authRequest, updated);
      res.json(dependencies.ok(persisted));
    }),
  );

  app.post(
    "/api/users/:id/reset-password",
    ...permissionBoundary,
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as UserManagementRequest;
      const password = typeof req.body?.password === "string" ? req.body.password.trim() : "";
      if (password.length < 12 || password.length > 1024) {
        dependencies.sendApiError(authRequest, res, 400, "INVALID_PASSWORD", "新密码至少 12 位且不能超过 1024 位");
        return;
      }
      const updated = dependencies.actions(authRequest).updateUser(req.params.id!, {password});
      const persisted = await dependencies.persistUserWithMembership(authRequest, updated);
      await dependencies.revokeUserSessions?.(updated.id, updated.tenantId || DEFAULT_TENANT_ID);
      res.json(dependencies.ok(persisted));
    }),
  );
}
