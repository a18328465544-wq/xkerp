import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {ErpPageActions, ErpPageContent, ErpPageContext, ErpPageFrame, ErpPageIdentity, ErpPageTabs, ErpPageToolbar, ErpPageTopbar} from "./ErpPageFrame";

test("ErpPageFrame provides a stable first-level region contract", () => {
  const markup = renderToStaticMarkup(
    <ErpPageFrame>
      <ErpPageTopbar>
        <ErpPageIdentity title="库存" subtitle="管理真实库存" />
        <ErpPageActions><button type="button">新增</button></ErpPageActions>
      </ErpPageTopbar>
      <ErpPageContext>上下文</ErpPageContext>
      <ErpPageToolbar>工具栏</ErpPageToolbar>
      <ErpPageContent>内容</ErpPageContent>
    </ErpPageFrame>,
  );
  assert.match(markup, /data-erp-component="page-frame"/);
  assert.match(markup, /data-erp-region="page-topbar"/);
  assert.match(markup, /data-erp-region="page-identity"/);
  assert.match(markup, /data-erp-region="page-actions"/);
  assert.match(markup, /data-erp-region="page-context"/);
  assert.match(markup, /data-erp-region="page-toolbar"/);
  assert.match(markup, /data-erp-region="page-content"/);
});

test("optional page regions do not reserve empty containers", () => {
  const markup = renderToStaticMarkup(<ErpPageFrame><ErpPageContext /><ErpPageToolbar /><ErpPageTabs>页签</ErpPageTabs></ErpPageFrame>);
  assert.doesNotMatch(markup, /data-erp-region="page-context"/);
  assert.doesNotMatch(markup, /data-erp-region="page-toolbar"/);
  assert.match(markup, /data-erp-region="page-tabs"/);
});

test("page architecture keeps one frame boundary and canonical QuickStatus API", () => {
  const frameSource = readFileSync(new URL("./ErpPageFrames.tsx", import.meta.url), "utf8");
  const quickStatusSource = readFileSync(new URL("./ErpQuickStatus.tsx", import.meta.url), "utf8");
  assert.match(frameSource, /import \{ErpPageFrame/);
  assert.match(frameSource, /ErpAnalyticsPageFrame[\s\S]*<ErpPageFrame/);
  assert.match(quickStatusSource, /tone\?: QuickStatusTone/);
  assert.match(quickStatusSource, /action\?: \(\) => void/);
  assert.doesNotMatch(quickStatusSource, /status\?: QuickStatusTone/);
  assert.doesNotMatch(quickStatusSource, /onClick\?: \(\) => void/);
});

test("formal dashboard pages use the canonical dashboard frame", () => {
  const dashboardSource = readFileSync(new URL("../../features/dashboard/pages/DashboardPage.tsx", import.meta.url), "utf8");
  const designSystemSource = readFileSync(new URL("../../features/design-system/pages/DesignSystemPage.tsx", import.meta.url), "utf8");

  for (const source of [dashboardSource, designSystemSource]) {
    assert.match(source, /ErpDashboardPageFrame/);
    assert.doesNotMatch(source, /DashboardShell/);
    assert.match(source, /ErpPageContent/);
  }
});

test("typical list pages keep filters in the toolbar and content in PageContent", () => {
  const inventorySource = readFileSync(new URL("../../features/inventory/pages/InventoryListPage.tsx", import.meta.url), "utf8");
  const financeSource = readFileSync(new URL("../../features/finance/pages/FinanceIncomePage.tsx", import.meta.url), "utf8");

  for (const source of [inventorySource, financeSource]) {
    const toolbarStart = source.indexOf("<ErpPageToolbar");
    const filterStart = source.indexOf("<ErpFilterBar");
    const contentStart = source.indexOf("<ErpPageContent");
    assert.ok(toolbarStart >= 0, "页面必须声明 ErpPageToolbar");
    assert.ok(filterStart > toolbarStart, "ErpFilterBar 必须出现在 ErpPageToolbar 之后");
    assert.ok(contentStart > toolbarStart, "业务主体必须出现在 ErpPageContent 之后");
  }
});

test("architecture guard protects structural regions and registered browser boundaries", () => {
  const guardSource = readFileSync(new URL("../../../scripts/check-architecture.mjs", import.meta.url), "utf8");
  assert.match(guardSource, /collectJsxElements/);
  assert.match(guardSource, /DashboardShell/);
  assert.match(guardSource, /rawHistoryFiles > 0/);
  assert.match(guardSource, /rawStorageFiles > 0/);
});
