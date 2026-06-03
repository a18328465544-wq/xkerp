export const APP_VERSION = "1.2.0";
export const DISPLAY_APP_VERSION = `V${APP_VERSION}`;
export const VERSION_NOTICE_STORAGE_KEY = "gpu_seen_app_version";

export const VERSION_UPDATE_NOTES = [
  "新增账号登录，默认老板、销售、质检、财务账号可按角色进入系统。",
  "权限管理补齐账号管理，可新增账号、停用账号、修改密码、调整角色和单账号权限。",
  "菜单入口现在会按账号有效权限展示，旧权限菜单ID会自动迁移到新版菜单。",
  "新增扫码出入库工作台，支持按库存ID或SN批量入库、出库、移库。",
  "进货明细字段文案调整为“拆修/带盒”，更贴合实际验货记录。",
  "结算账户、CRM、单据编辑等模块已进入当前版本。"
];

export function getVersionNoticeState(seenVersion: string | null | undefined) {
  return {
    version: APP_VERSION,
    shouldShow: seenVersion !== APP_VERSION
  };
}
