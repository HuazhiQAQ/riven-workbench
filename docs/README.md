# Warframe 紫卡计算器 6.0 —— 过程工具包

这个包里是**维护这张表全过程用到的思路和脚本**，不是成品表本身。
数据表与 VBA 的改动套路、网页版的构建与验收、踩过的坑，都归档在这里。

> **文档分工**：本文件 = **当前状态与运行办法**（交付件 / 约束 / 怎么跑）；
> `CHANGELOG.md` = **项目事实清单**（数值口径 / 结构参数 / 校验规则 / 环境变量）；
> `04_踩坑总表.md` = **踩过的坑**（按功能分区，含已知边界）。
> 细节一律翻 `04`，避免两份文档各说各话。

## 交付件

| 项 | 值 |
|---|---|
| xlsm | `tools/riven-source-6.0.xlsm` |
| 网页版·主力（完全离线） | `web/产物/20261103紫卡模拟器V11.html`（约 15 MB，单文件） |
| 识别流程讲解 | `web/产物/识别流程原理讲解_鳄神案例.html`（18 步，图文自包含） |
| Sheet7 src | `源码快照/Sheet7_当前源码_UTF8.vba`（UTF-8 + CRLF，可直接 inject） |

> 网页版交付件是单文件 HTML，可单独发给任何人，无需附带其它资源。
> 唯一稳定的判据是**源码 / 公式内容**，不是文件大小；重抽源码用 `riven-toolbox.py dump`（依赖外部模块 `xlsm-vba-inject`，位置见下文）。

---

## 注意事项（动手前必读）

1. **同一个行为可能有好几个入口，改先全局搜。**
   「紫卡命名」就有 3 个：Sheet7 的 `命名格(2)=A24`、`命名格(3)=H24`，以及**计算器 B24 的 LET 公式**。
   只改其中前两处，实际使用中仍会看到未改的部分。
2. **有对照表 / 权威数据就查表，别自己推规则。**
   命名规则必须查表，不能自行推断；本体名剥离规则见 `CHANGELOG.md` 的「命名」一节。
3. **`参数!B28/B29/B30` 是活公式，任何脚本都不许往这三格写值**（写了就把公式冲掉）。
4. **改完必须真机跑一遍并离线拆 zip 验 XML** —— COM 读到的值 ≠ 落盘的值。
5. **验收脚本的 `SRC` 必须指向部署文件**，指向临时中间产物会跑出「全绿但没验到真文件」的假绿。
6. **语言位掩码：1=英文(C) / 2=国际服(D) / 4=国服(E)**（`M>=4`=国服、`MOD(M,4)>=2`=国际服）。
   掩码写反的坑见 `04_踩坑总表.md` 的 J 节与 L 节。
7. **不往界面上加说明文案** —— ④ 区清单说明段与 ① 区左栏面板均不展示说明文案。
8. **中文能被逐字折行，而 `nowrap` 的徽章/数字不能被收缩 → 宽度一紧，挤压全落在中文名上。**
   中文武器名的 min-content 只有一个字宽，收缩 100% 落在名字上就会被压成竖排。
   凡是「中文名 + 右侧 nowrap 徽章/数字」的横排布局，都要：名字 `white-space:nowrap`
   （保一行）+ 容器 `flex-wrap:wrap` + 把徽章们包成**一个整体**一起换行。
   别只在窄屏加断点——`flex:1 1 auto` 让名字吸收剩余宽度，宽/窄两副面孔一套就够。
   详见 `web/README.md`「搜索候选行」一节。

---

## 先看哪份

| 文件 | 什么时候看 |
|---|---|
| **`04_踩坑总表.md`** | ★ 出问题先翻这个（按功能分区 + 三条约束 + 已知边界） |
| **`CHANGELOG.md`** | ★ 项目事实清单：数值口径 / 结构参数 / 校验规则 / 环境变量 |
| **`02_数据更新传播清单.md`** | ★ 要加词条 / 改基准值 / 加武器时，**先看这个** |
| **`03_表结构速查.md`** | 写脚本时查单元格坐标、行号区间 |
| **`01_整体思路与方法论.md`** | 这套活儿到底怎么干——第一次接手必读 |
| **`05_输入框规则汇总.md`** | 输入框校验与提示规则 |
| **`web/README.md`** | 网页版：版块结构、变体规则、构建与回归、手机排版 |
| `web/design.md` | 网页版设计决策（美术令牌 / 手机断点 / 数值口径 / 撤销栈） |

> VBA 注入的 mechanics 依赖外部模块 `xlsm-vba-inject`（含 `dump_raw/inject/validate_package/run_in_wps`），
> 本包不留副本。位置由环境变量 `ZK_SKILL_SCRIPTS` 指定；不设则依次探测
> 包内 `_deps/xlsm-vba-inject/scripts` → 本机 `.workbuddy/skills/xlsm-vba-inject/scripts`。
> 两者都没有时，只有 `dump` / `inject` 不可用，其余命令不受影响。

---

## 目录结构

```
紫卡6.0_工具包/
├── README.md                         ← 你在这里（含注意事项）
├── CHANGELOG.md                      ← 项目事实清单（数值口径 / 结构参数 / 校验规则）
├── 01_整体思路与方法论.md
├── 02_数据更新传播清单.md
├── 03_表结构速查.md
├── 04_踩坑总表.md                    ★ 按**功能分区**，含已知边界
├── 05_输入框规则汇总.md
├── web/
│   ├── README.md                     ★ 网页版：功能 / 实现原理 / 构建 / 回归
│   ├── design.md                     设计决策（美术令牌 / 手机断点 / 数值口径 / 撤销栈）
│   ├── 源码/                         ★★ 网页版唯一源码（按用途分层）
│   │   ├── 公共/                      zkc.js（倾向 / 名称匹配 / 词条键）/ 公共函数
│   │   ├── 数据/                      zkdata.js（武器库 637 把）/ zkprice.js / zkpricedb.js / names.json
│   │   ├── 引擎/                      收益引擎 + 武器库（riven-engine.js / weapon-db.js / zkasm.js / riven-router.js / stances.js / zkmods.js / zkarcs.js）
│   │   ├── 框架/                      template.html / style.css / app.js / theme.js / stattable.js / weptable.js / pricetable.js / priceref.js / modpanel.js …
│   │   ├── 识别/                      ocr.js / ocr_onnx.js / preprocess.js / polar*.js / models/
│   │   ├── 资源/                      卡面底图等静态资源
│   │   └── 填表/                      WM 填表（wm-fill-core.js / 词库 / _wmdict.py）
│   ├── 构建/                          build.py embed-ort.py squeeze_src.py strip_html.py export.py gen-basedata.py gen_names.py pricedb_slim.py pricedb_fixcombos.py _audit_js.py
│   ├── 数据/                          构建期源（data.json / basedata.json）
│   ├── 产物/                          ★ 交付的 HTML（单文件）
│   ├── dist/                          英文名分发版（riven-workbench-web.html）
│   ├── 调试/                          无头 Chrome 回归探针（run_all.cjs 总入口 / cdp.cjs / _probe_*.cjs / lang_e2e.cjs）
│   └── 测试/                          WM 填表回归测试件与卡图
└── tools/
    ├── riven-source-6.0.xlsm
    ├── 20260927武器倾向表_变体清单.xlsx
    ├── 紫卡工具箱.py / 融合数值验证.py
    └── 源码快照/                      VBA 源码与校验脚本
```

> **★ 所有脚本「不写死工作目录」** —— 整个包拷到任何机器上都能直接跑：
> 输入（xlsm / HTML）默认按「脚本自己旁边 → 上一级 → 上两级」自动找，也可以**当命令行参数显式传**；
> 输出（`data.json` / 成品 HTML / `shot/` / `out/`）一律落在脚本自己旁边。
> `tools/源码快照/` 里的 `patch_*` / `verify_*` / `smoke_final.py` 是一次性脚本，默认路径指向的临时目录多半已不存在，**留档用，跑必须显式传参数**。

---

## riven-toolbox.py（一个文件，11 个子命令）

```
PY=python                      # 跑 COM 的命令需要装了 pywin32 的解释器
X="tools/riven-source-6.0.xlsm"

$PY riven-toolbox.py info                    看当前配置/锚点（行区间、永正集、测试武器）
$PY riven-toolbox.py map      $X             数据表 行号 -> 三语言名
$PY riven-toolbox.py map      $X --out m.json
$PY riven-toolbox.py weapons  $X             倾向表结构 / 各类别测试武器
$PY riven-toolbox.py weapons  $X --rows 6    看倾向表前 6 行（★ 演示 J 列错位）
$PY riven-toolbox.py cache    $X             ★ 查「文件里的缓存」对不对
$PY riven-toolbox.py cache    $X -v          连列表内容一起打出来
$PY riven-toolbox.py hardcode 源码快照/Sheet7_当前源码_UTF8.vba   ★ 扫写死的循环上限
$PY riven-toolbox.py spill    $X             查动态数组溢出区外的残值

$PY riven-toolbox.py dump     $X Sheet7 s7.vba        抽源码（cp936 原始字节）
$PY riven-toolbox.py inject   $X Sheet7 s7u.vba out.xlsm   写回（源码须 UTF-8）
$PY riven-toolbox.py produce  $X out.xlsm    让 WPS 真保存一次（刷新缓存）
$PY riven-toolbox.py roll     $X out.xlsm -n 60       5 类别 × 60 次洗卡抽样
$PY riven-toolbox.py fusion   $X out.xlsm    融合配方 10 条逐条实测
$PY 融合数值验证.py            $X 24          ★ 融合产物数值是不是「基准×组合系数×倾向×浮动」
```

**★ `融合数值验证.py` 是口径护栏，改过融合或组合系数就跑一遍。**
判据：算 `比值 = 产物值 / (基准 × 倾向)` —— 旧公式落在 `[0.9, 1.1]`、新公式落在 `[coef*0.9, coef*1.1]`；
取 **2正1负（coef=1.2375）** 或 **3正0负（coef=0.75）** 时两区间**不重叠**，
所以报告里「旧公式说不通」的条数 > 0 才说明真的用了新公式。必须走**按钮路径**（`app.Run` 会静默吞错）。

**纯离线**（map / weapons / cache / hardcode / spill）任意 Python 3 都能跑；
**要动 Excel** 的（dump / inject / produce / roll / fusion）必须用上面那个 `PY`，
它装了 pywin32，`envs/default` 没有。

### 改配置只看文件开头

行区间、永正集、测试武器、融合用例都写在文件顶部，加行/改规则时改那里，
全文件自动跟上：

```python
抽取起, 抽取止 = 2, 34
融合起, 融合止 = 35, 52
末行 = 52
永负行 = 30                      # 概率不获得连击数
近战永正 = {2, 3, 9, 10, 11, 12, 27, 29}
远程永正 = {9, 10, 11, 12, 20}
测试武器 = {'近战':'愤怒', '手枪':'赤毒努寇微波枪', ...}
融合用例 = [('愤怒','重击效率','额外连击数几率','重击伤害'), ...]
```

---

## 标准五步流程（改这张表的固定套路）

```
① 备份          6.0_备份_<用途>_<MMDDHHMM>.xlsm
② dump 当前版本   riven-toolbox.py dump   $X Sheet7 s7.vba      ← 必须取磁盘最新版
③ 改源码/改公式   改 s7.vba（或离线改 sheetN.xml）
                  → riven-toolbox.py inject $X Sheet7 s7.vba out.xlsm
④ 真机验证        riven-toolbox.py roll / fusion  （走按钮路径跑宏 + 抽样统计）
⑤ 真保存 + 验缓存  riven-toolbox.py produce  →  cache 离线拆 zip 核对 → 才部署
```

**第 ⑤ 步最容易漏**。详见 `01_整体思路与方法论.md`。

---

## 参数表三个「活公式」（别再手填）

`参数!B28/B29/B30` 全部直接引用 `计算器` 表的活公式，宏禁用、事件掉链子都不会错：

| 格 | 含义 | 公式（简写） | 回落 |
|---|---|---|---|
| `参数!B28` | 属性名列（1国服/2国际服/3English） | `IF(计算器!$H$1="国服",1,IF(...="国际服",2,IF(...="English",3,2)))` | 2 |
| `参数!B29` | 倾向表语言位（0EN/1国服/2国际服） | `IF(计算器!$H$1="国服",1,IF(...="国际服",2,IF(...="English",0,2)))` | 2 |
| `参数!B30` | 武器类型键 → 决定取 `数据!G:K` 哪一列 | `命中武器(B5) → 倾向表L类别 → 参数!A33:B37 映射` | `参数!B37`（近战·天工造武） |

两条约束：

1. **`B30` 绝不能为空** —— 26 个格子引用它（`B6`、`D17:I20`、`N5/Q5` 溢出区），
   空了整个计算器含词条下拉源会**全白**。所以必须有回落值。
2. **既然是公式，就绝不能再有代码往这三格写值** —— 写 `B28/B29` 的 VBA 已撤掉；
   验收脚本里 `par.Range('B30').Value = '步枪'` 那种写法也会驱动 `计算器!B4/C4`。

**验证武器类型是否工作**：`计算器!B4` 输入 `托里德` → `C4=1`
→ `B5=托里德`、`B6=步枪`、`B7=1.3`，且 `D17` 取的是**步枪列**的值
（近战列 205.03，步枪列 164.52；「近战伤害」在步枪列会显示「无此词条」）。

---

## 环境

| 项 | 值 |
|---|---|
| Python（跑 COM 脚本） | 任意装了 `pywin32` / `oletools` / `olefile` 的解释器<br>缺任一个会在 `import pythoncom` 处直接挂 |
| Python（纯离线分析） | 任意，只要 `zipfile` + `re` |
| 源码编码 | 磁盘里是 **cp936**；`inject.py` 读的源码文件必须是 **UTF-8**<br>（流程：dump 出来 → `decode('cp936')` → 存 UTF-8 → 改 → inject 写回 cp936） |
| 离线改公式 | 直接改 `xl/worksheets/sheetN.xml`，**必须保留 `cm="1"` + `t="array" ref="..."`** |

> 所有脚本**不写死任何工作目录**，输入/输出路径都是命令行参数；
> 缺省输出落在脚本同级的 `out/`。

---

## 表结构口径（存盘时类别 = 近战·天工造武）

| 项 | 值 |
|---|---|
| 倾向表 | 武器行 **2..638**，共 637 把 |
| 倾向表 J 索引 | 行 **2..1429**，1428 条，与 C/D/E 去重名**差集为 0（完整）**<br>（末行 1429；VBA `End(xlUp)` 动态末行） |
| 计算器 正面 N/O/Q | 各 **35 条**（含融合 14），混永负无 |
| 计算器 负面 P | **15 条**，混永正无、混融合无 |
| 洗卡模拟器 下拉池 | ②正面 24 / ②负面 19 / ③正面 23 / ③负面 17（池容量 31，余量 ≥7） |

> ★ VBA 扫倾向表 D 列 / J 列的上限 `tWs.Cells(tWs.Rows.Count, col).End(xlUp).Row` 是**动态末行**，
> 不要再改回写死数字（写死会漏掉末行武器）。

---

## 网页版（`web/`）

单文件、**完全离线**（ONNX 运行时 gzip+base64 内嵌），数据全内联在 `window.ZKDATA`，
不请求任何外部资源。**识别只有一条路径**：本地 ONNX（内嵌运行时 + 内嵌模型），
`recognize()` 不接受引擎参数，失败即报原因。
**★ 全部细节看 `web/README.md`（功能 / 实现原理 / 构建回归 / 手机排版 / 样式坑），这里只留摘要。**

- **7 个版块**：`#ranges` 倾向数值区间表 → `#calc` 分析识别计算器 → `#open` 开卡洗卡融合模拟器
  → `#dmg` 紫卡收益计算器 → `#choose` 洗卡左右建议器 → `#price` 紫卡价值表 → `#about` 口径与词汇。
  版块顺序由 `源码/框架/app.js` 的 `FN_SECS` 定义，调整顺序改那里。
- **名字只有一张表**：`源码/数据/names.json`；词条只写键（`ZN` / `SE` / `ZKC.statMap`），
  武器名匹配走 `ZKC.matchWeapons`、词条名匹配走 `ZKC.matchStat`。
- **`#calc` 的市场行情参考**：识别完一张卡，综合评级下面给「快出手 / 正常挂 / 耐心等」三档价，
  跟着武器 / 词条 / 数值实时重算，并按当前服（国际服 / 国服）在自己的挂单池里比价。
  引擎 `源码/框架/priceref.js` 与 `紫卡工具包/tools/riven_price.py::estimate()` **逐行对应**，
  改任一边都要用 `tools/check_priceref_parity.py` 抽 400 条对拍。
- **构建（三步，缺一不可）**：在 `web/` 下跑

  ```
  python 构建/squeeze_src.py --apply                                             # ① 清注释
  OCR_VER=v6 GZ_MODELS=1 python 构建/build.py 产物/20261103紫卡模拟器V11.html      # ② 组装源码
  python 构建/embed-ort.py --src 产物/20261103紫卡模拟器V11.html \
                          --out 产物/20261103紫卡模拟器V11.html --strip         # ③ 内嵌 ORT + 去注释
  ```

  - **`--strip` 是交付形态**：去掉全部注释但**保留行数**（`构建/strip_html.py`），报错行号能对回源码。
  - `embed-ort.py` 内嵌的 ONNX 运行时优先读本地 `运行时/`；该目录已从仓库省略（约 14 MB 二进制缓存），
    重建时加 `--force-download` 从 CDN 拉取（需联网）。交付 HTML 本身已内嵌 ONNX，断网可用。
  - `export.py`（从 xlsm 导出 `数据/*.json`）只在数据源变了时才需要先跑。
  - `build.py` 不带路径参数时默认写 `web/dist/riven-workbench-web.html`。
- **配色**：正面 = 绿、负面 = 红（`--pos*` / `--neg*` 全局一对）
- **两条看数字看不出的口径**：派系（行 16-18/42-44）1.45 是**倍率**，参与公式的是 +45；
  后坐力（行 25）**方向相反**，正面＝降低（负）、负面＝增加（正）。详见 `04_踩坑总表.md` Ⅰ 节
- **变体（开卡池 419/637）**：开卡池 = 本体 + 变体·无本体（419/637）；紫卡命名按**本体名**
- **双卡对比**：`#open` 下面有两块「洗卡前 / 当前」双卡对比 + 「撤销 [Ctrl + Z]」，
  两块由 `data-cmp` 各自声明盯哪张卡（①=`2`，②=`1,4`），**各盯各的、不串台**。
  左卡取**撤销栈顶**，改的是哪个卡面块由 `blkChanged()` 比出来。卡面排版抽成 `rcardHtml()`，与计算器右框共用一份
- **洗卡次数 / 辣椒总消耗**：对比块块头右侧竖排两行。状态 `rerolls` / `kuva` 存在卡上、
  **随快照进撤销栈**；`rollCost()` 判据＝**有没有锁住非融合行**（锁基础 7000、其余含只锁融合 3500，**按「洗」那一瞬定价**）；
  开紫卡 / `#open` 换武器清零。详见 `web/README.md` 同名小节
- 手机排版**不能用 jsdom 验**（没有排版引擎），用 `调试/fetch/mobile_shot.py`
