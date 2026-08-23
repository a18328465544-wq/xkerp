import {adaptFinanceDashboardDataset} from "../adapters/finance.adapter";
import {apiRequest} from "../client";
import type {FinanceDashboardResponseDto} from "../dto/finance.dto";
import type {FinanceDashboardAccess} from "@/src/types/finance";

export const financeApi = {
  async dashboard(access: FinanceDashboardAccess, signal?: AbortSignal) {return adaptFinanceDashboardDataset(await apiRequest<FinanceDashboardResponseDto>("/api/finance/dashboard", {signal}), access);},
};
