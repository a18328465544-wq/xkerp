import type {Express, Request, RequestHandler} from "express";
import {runStateCommand} from "../stateCommand.ts";
import {compactStateMerge, statePatchResponse, type StateMergePatch} from "../statePatch.ts";
import type {AppState, createStoreActions} from "../store.ts";
import {GPU_SN_BRANDS, listGpuSnRules, parseGpuSnDate} from "../gpuSnDate.ts";
import type {GpuSnBrandId} from "../../src/types/gpuSn.ts";
import {ValidationError} from "../errors.ts";
import type {AuthenticatedRequest} from "../httpAuth.ts";
import type {SystemUserAccount} from "../../src/types.ts";
import {publicStateMergeForUser} from "../publicState.ts";

type GpuSnRouteDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  requireAnyMenu: (menuIds: string[]) => RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  getState: () => AppState;
  actions: (req: Request) => ReturnType<typeof createStoreActions>;
};

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }

export function gpuFactoryDateMerge(state: AppState, inventoryId: string): StateMergePatch {
  return compactStateMerge({inventory: state.inventory.filter((item) => item.id === inventoryId), logs: state.logs.slice(0, 1)});
}

export function registerGpuSnDateRoutes(app: Express, dependencies: GpuSnRouteDependencies) {
  app.get("/api/gpu-sn/rules", dependencies.requireAnyMenu(["inventory", "purchase_add", "purchase_list", "inspections", "sales_add", "sales_outbound", "aftersales"]), (_req, res) => {
    res.json({data: listGpuSnRules()});
  });

  app.post("/api/gpu-sn/parse", dependencies.requireAnyMenu(["inventory", "purchase_add", "purchase_list", "inspections", "sales_add", "sales_outbound", "aftersales"]), dependencies.asyncRoute(async (req, res) => {
    const brandId = text(req.body?.brandId);
    const sn = text(req.body?.sn);
    const productModel = text(req.body?.productModel) || undefined;
    if (!GPU_SN_BRANDS.some((item) => item.id === brandId)) throw new ValidationError("请选择支持的显卡品牌");
    if (!sn) throw new ValidationError("请输入 SN 序列号");
    res.json({data: parseGpuSnDate({brandId: brandId as GpuSnBrandId, sn, productModel})});
  }));

  app.post("/api/gpu-sn/estimate/save", dependencies.requireMenu("inventory"), dependencies.asyncRoute(async (req, res) => {
    const inventoryId = text(req.body?.inventoryId);
    if (!inventoryId) throw new ValidationError("缺少库存档案编号");
    const existing = dependencies.getState().inventory.find((item) => item.id === inventoryId);
    if (!existing) throw new ValidationError("库存档案不存在");
    if (existing.gpuFactoryDateEstimate) {
      res.json({data: {saved: false, estimate: existing.gpuFactoryDateEstimate}});
      return;
    }
    const {data, stateMerge} = await runStateCommand(
      () => dependencies.actions(req).saveGpuFactoryDateEstimate(inventoryId),
      () => gpuFactoryDateMerge(dependencies.getState(), inventoryId),
    );
    const user = (req as AuthenticatedRequest<SystemUserAccount>).authUser;
    res.json(statePatchResponse(data, publicStateMergeForUser(dependencies.getState(), stateMerge, user)));
  }));
}
