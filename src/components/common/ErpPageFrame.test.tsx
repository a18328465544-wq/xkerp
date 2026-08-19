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
