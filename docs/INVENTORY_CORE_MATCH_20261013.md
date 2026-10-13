# 当前库存核心 ID 核对（2026-10-13）

## 范围与结果

从已登录生产库存页面只读核对「当前库存」，无搜索、分类、风险或已售出筛选。逐页读取 187 条记录，再逐页核对正式「型号」列与商品名称；计算使用当前 `productCoreIdentity` 的相同完整型号规则。

- 109 件：名称及型号无冲突、分类为显卡，可确定 27 个核心 ID。
- 29 条：简称、缺少前缀、专业型号覆盖不足或分类异常，列在待确认清单。
- 49 条：正常的 CPU、内存、主板、整机等，不纳入本次 GPU 核心基础价。

这是此次页面读取时的库存核对清单，不是数据库一致性快照。核对时页头旧摘要为 183 件，刷新后的分页结果为 187 条；以下计数以完整读取的 187 条为准。包含待检测库存，不等于可售数量或已配置有效报价的数量。

没有修改生产库存、商品分类、名称、型号、价格、SN 或历史单据；没有批量写入/回填核心 ID。报价模块继续通过同一共享规则动态关联真实商品，只有明确确认后的报价保存核心 ID。页面列设置已恢复。

## 可匹配清单

| 完整核心型号 | 核心 ID | 库存件数 |
|---|---|---:|
| GTX1060 | GPU-NVIDIA-GTX1060 | 1 |
| GTX1070 | GPU-NVIDIA-GTX1070 | 1 |
| GTX1080 | GPU-NVIDIA-GTX1080 | 1 |
| RTX3060 | GPU-NVIDIA-RTX3060 | 1 |
| RTX3070 | GPU-NVIDIA-RTX3070 | 1 |
| RTX3090 | GPU-NVIDIA-RTX3090 | 13 |
| RTX3090TI | GPU-NVIDIA-RTX3090TI | 6 |
| RTX4060 | GPU-NVIDIA-RTX4060 | 1 |
| RTX4060TI | GPU-NVIDIA-RTX4060TI | 1 |
| RTX4070 | GPU-NVIDIA-RTX4070 | 1 |
| RTX4070SUPER | GPU-NVIDIA-RTX4070SUPER | 1 |
| RTX4070TI | GPU-NVIDIA-RTX4070TI | 1 |
| RTX4070TISUPER | GPU-NVIDIA-RTX4070TISUPER | 1 |
| RTX4080 | GPU-NVIDIA-RTX4080 | 15 |
| RTX4080SUPER | GPU-NVIDIA-RTX4080SUPER | 8 |
| RTX4090 | GPU-NVIDIA-RTX4090 | 4 |
| RTX4090D | GPU-NVIDIA-RTX4090D | 4 |
| RTX5060TI | GPU-NVIDIA-RTX5060TI | 6 |
| RTX5070 | GPU-NVIDIA-RTX5070 | 1 |
| RTX5070TI | GPU-NVIDIA-RTX5070TI | 2 |
| RTX5080 | GPU-NVIDIA-RTX5080 | 4 |
| RTX5090 | GPU-NVIDIA-RTX5090 | 26 |
| RTX5090D | GPU-NVIDIA-RTX5090D | 3 |
| RTX5090DV2 | GPU-NVIDIA-RTX5090DV2 | 2 |
| RTXA4000 | GPU-NVIDIA-RTXA4000 | 1 |
| RX590 | GPU-AMD-RX590 | 1 |
| RX6700XT | GPU-AMD-RX6700XT | 2 |

## 待确认清单

| 商品/正式型号 | 当前分类 | 数量 | 未自动匹配的原因 |
|---|---|---:|---|
| 影驰 RTX4080S 金属大师 / RTX4080S | 显卡 | 3 | 简称 S，当前严格规则不自动扩为 SUPER，也不匹配 RTX4080 |
| 影驰 GTX1660S 骁将 / GTX1660S | 显卡 | 1 | 简称 S，当前严格规则不自动扩为 SUPER |
| 索泰 5060TI 星辰 / 5060TI | 显卡 | 1 | 名称与正式型号均缺 RTX 前缀 |
| 铭瑄 4070TISUPER 瑷珈 / 4070TISUPER | 显卡 | 1 | 名称与正式型号均缺 RTX 前缀 |
| 蓝宝石 VEGA56 超白金 / VEGA56 | 显卡 | 1 | 尚未定义该系列的稳定核心 ID，不改成 RX560 等相似型号 |
| 讯景 R9 390 黑狼 / R9 390 | 显卡 | 1 | 尚未定义该旧系列的稳定核心 ID，不误识别为 RTX3090 |
| NVIDIA RTX A5000 Ampere / RTX A5000 | 其他配件 | 2 | 具有明确 GPU 型号，但分类不一致；候选 GPU-NVIDIA-RTXA5000，需先确认分类 |
| 丽台 RTX A5000 专业卡 / RTX A5000 | 其他配件 | 1 | 同上 |
| 丽台 RTX A4000 专业卡 / RTX A4000 | 其他配件 | 5 | 具有明确 GPU 型号，但分类不一致；候选 GPU-NVIDIA-RTXA4000，需先确认分类 |
| 丽台 RTX 4000 Ada 专业卡 / RTX 4000 Ada | 其他配件 | 4 | 分类及专业代际名称需要确认，不能丢失 Ada 后缀或混入 RTXA4000 |
| NVIDIA RTX PRO 6000 Blackwell Server Edition / RTX PRO 6000 Blackwell | 其他配件 | 1 | 分类及专业核心完整定义需要确认，不按 RTX6000 或 RTX5090 套价 |
| NVIDIA RTX PRO 2000 Blackwell Workstation Edition / RTX PRO 2000 Blackwell | 其他配件 | 1 | 分类及专业核心完整定义需要确认 |
| Intel i5-14600KF 散片 / i5-14600KF | 显卡 | 4 | CPU 错放显卡分类，不生成 GPU ID |
| 威刚 DDR5 5200 龙耀内存 / 16GB DDR5 5200 | 显卡 | 1 | 内存错放显卡分类，不生成 GPU ID |
| 铭瑄 Z790M D5 WIFI 主板 / Z790M D5 WIFI | 显卡 | 1 | 主板错放显卡分类，不生成 GPU ID |
| 华硕 ROG 龙鳞 ACE 无线三模 / ROG | 显卡 | 1 | 外设错放显卡分类，不生成 GPU ID |

前缀、分类和专业型号的修正应作为单独数据清理动作确认。不得只为提高匹配率猜测前缀、改写原记录或放宽成模糊包含搜索。组装拆卸仍是业务操作，不是品类。

## 本次报价来源简化

- 新增、更新和批量粘贴无需填写来源，前端表单移除该输入，前后端仍保留长度/类型边界及旧来源读取。
- 新粘贴格式：`核心型号,回收价,销售价,有效期至,说明`，后三项按既有空值规则处理；至少填写一侧价格。
- 历史带来源的 CSV/Excel 格式兼容读取，缺来源不伪造“人工询价”或“门店录入”。
- 重复提交时省略来源与空来源视为同一个新增命令，避免重复入账式新增报价；价格不同或真实来源不同仍冲突。更新省略来源保留旧值，显式空值才清除。
- 本地实现，不是上线或生产数据迁移。
