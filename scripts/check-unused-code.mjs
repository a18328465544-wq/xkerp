import path from "node:path";
import fs from "node:fs";
import {fileURLToPath} from "node:url";
import {inspectUnusedCode, reviewUnusedExports} from "./unused-code-utils.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const result = inspectUnusedCode(root);
const allowlist = JSON.parse(fs.readFileSync(path.join(root, "scripts/unused-code-allowlist.json"), "utf8"));
const reviewed = reviewUnusedExports(result.unusedExports, allowlist.exports);
if (process.argv.includes("--report")) {
  console.log(JSON.stringify({...result, exportReview: reviewed}, null, 2));
} else {
  if (result.unusedModules.length) {
    console.error("未引用模块检查失败（运行入口、测试、维护脚本均不可达）：");
    result.unusedModules.forEach((file) => console.error(`- ${file}`));
    process.exitCode = 1;
  } else {
    console.log(`未引用模块检查通过：${result.files} 个代码文件已覆盖运行、测试和维护入口。`);
  }
  if (reviewed.unexpected.length) {
    console.error("未引用导出检查失败（先人工确认，不自动删除）：");
    reviewed.unexpected.forEach(({file, name, line}) => console.error(`- ${file}:${line} ${name}`));
    process.exitCode = 1;
  } else {
    console.log(`未引用导出检查通过：保留 ${reviewed.retained.length} 个已登记的共享账务契约例外。`);
  }
}
