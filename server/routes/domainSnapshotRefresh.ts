import type {Request, RequestHandler} from "express";

type DomainSnapshotRefreshDependencies = {
  getDatabaseRevision: () => Promise<number>;
  getStateRevision: () => number;
  reloadState: (request: Request) => Promise<void>;
};

/** Keep collection-backed snapshots aligned with SQL-backed list routes. */
export function createDomainSnapshotRefresh({getDatabaseRevision, getStateRevision, reloadState}: DomainSnapshotRefreshDependencies): RequestHandler {
  return (req, _res, next) => {
    void (async () => {
      const databaseRevision = await getDatabaseRevision();
      if (databaseRevision !== getStateRevision()) await reloadState(req);
      next();
    })().catch(next);
  };
}
