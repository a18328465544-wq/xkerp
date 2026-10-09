import type {FinanceAccountItem, FinanceAccountSummaryView} from "@/src/types/finance-account";

export function summarizeFinanceAccounts(accounts: FinanceAccountItem[]): FinanceAccountSummaryView {
  return accounts.reduce<FinanceAccountSummaryView>((summary, account) => {
    summary.bookBalance += account.balance;
    summary.availableBalance += account.availableBalance;
    summary.frozenAmount += account.frozenAmount;
    if (account.enabled) summary.enabledCount += 1;
    else summary.disabledCount += 1;
    if (account.actualBalance !== undefined) summary.reconciledCount += 1;
    if (account.difference !== undefined && Math.abs(account.difference) > 0.009) {
      summary.differenceCount += 1;
      summary.differenceAmount += account.difference;
    }
    return summary;
  }, {bookBalance: 0, availableBalance: 0, frozenAmount: 0, enabledCount: 0, disabledCount: 0, reconciledCount: 0, differenceCount: 0, differenceAmount: 0});
}

export type FinanceAccountStatusKey = "all" | "normal" | "pending" | "abnormal" | "frozen" | "disabled";

export function financeAccountStatusKey(account: FinanceAccountItem): Exclude<FinanceAccountStatusKey, "all"> {
  if (!account.enabled) return "disabled";
  if (account.difference !== undefined && Math.abs(account.difference) > 0.009) return "abnormal";
  if (account.frozenAmount > 0) return "frozen";
  if (account.actualBalance === undefined) return "pending";
  return "normal";
}

export function countFinanceAccountStatuses(accounts: FinanceAccountItem[]) {
  const counts: Record<Exclude<FinanceAccountStatusKey, "all">, number> = {
    normal: 0,
    pending: 0,
    abnormal: 0,
    frozen: 0,
    disabled: 0,
  };
  for (const account of accounts) counts[financeAccountStatusKey(account)] += 1;
  return counts;
}
