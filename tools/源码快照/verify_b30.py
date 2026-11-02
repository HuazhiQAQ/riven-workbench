# -*- coding: utf-8 -*-
"""
验收：参数!B30 武器类型键 自动识别
① 离线拆 zip，看 sheet xml 里 B30 的 <f> 是否真落盘（COM 读对 != 文件里对）
② 真机 COM：改 计算器!B4 搜索词 -> 断言 B5 / B30 / B6 / B7 与 D17 数值跟着变
"""
import sys, io, os, zipfile, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import win32com.client as wc


def _find_xlsm():
    """不写死文件名：产物名带日期，随版本变化。按「旁边 → 上两级」找最新的
       *紫卡模拟器*.xlsm（排除备份 / 缓存 / Excel 锁文件）。"""
    here = os.path.dirname(os.path.abspath(__file__))
    cands = []
    for d in (here, os.path.dirname(here), os.path.dirname(os.path.dirname(here)), os.getcwd()):
        try:
            cands += [os.path.join(d, f) for f in os.listdir(d)
                      if f.endswith('.xlsm') and '紫卡模拟器' in f
                      and '备份' not in f and not f.startswith('~$') and not f.startswith('_')]
        except OSError:
            pass
    return max(cands, key=os.path.getmtime) if cands else None


PATH = sys.argv[1] if len(sys.argv) > 1 else _find_xlsm()
ok = 0
bad = 0


def chk(name, cond, extra=""):
    global ok, bad
    if cond:
        ok += 1
        print(f"  [OK]   {name} {extra}")
    else:
        bad += 1
        print(f"  [FAIL] {name} {extra}")


# ---------------- ① 离线 XML ----------------
print("=== ① 离线拆包：参数!B30 ===")
z = zipfile.ZipFile(PATH)
wbxml = z.read("xl/workbook.xml").decode("utf-8")
names = re.findall(r'<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"', wbxml)
rels = z.read("xl/_rels/workbook.xml.rels").decode("utf-8")
rid2t = dict(re.findall(r'Id="([^"]+)"[^>]*Target="([^"]+)"', rels))
target = None
for nm, rid in names:
    if nm == "\u53c2\u6570":
        target = rid2t.get(rid)
if target and not target.startswith("xl/"):
    target = "xl/" + target.lstrip("/")
print("  参数 sheet ->", target)
xml = z.read(target).decode("utf-8")
m = re.search(r'<c r="B30"[^>]*>(.*?)</c>', xml, re.S)
if m:
    body = m.group(1)
    fm = re.search(r'<f>(.*?)</f>', body, re.S)
    print("  B30 <f> =", fm.group(1) if fm else "(无)")
    chk("B30 是公式不是死值", fm is not None)
    chk("公式包含 倾向表!L 列查类别", fm is not None and "\u503e\u5411\u8868" in fm.group(1))
    chk("公式包含 计算器!$B$5 驱动", fm is not None and "B$5" in fm.group(1))
    chk("公式含回落 参数!$B$37", fm is not None and "B$37" in fm.group(1))
else:
    chk("找到 B30 单元格", False)
z.close()

# ---------------- ② 真机 ----------------
print()
print("=== ② 真机：改搜索词走一遍 ===")
# 不使用 gencache.EnsureDispatch：WPS 的类型库在本机生成不出完整模块
# （AttributeError: ... has no attribute 'CLSIDToClassMap'），走后期绑定。
app = wc.DispatchEx("Excel.Application")
app.Visible = False
app.DisplayAlerts = False
wb = app.Workbooks.Open(PATH)

try:
    c = wb.Worksheets("\u8ba1\u7b97\u5668")
    p = wb.Worksheets("\u53c2\u6570")

    orig_b4 = c.Range("B4").Value
    orig_c4 = c.Range("C4").Value
    print(f"  初始 B4={orig_b4!r} C4={orig_c4!r}")

    # --- 用例 1：托里德（步枪 / 倾向 1.3）---
    c.Range("B4").Value = "\u6258\u91cc\u5fb7"
    c.Range("C4").Value = 1
    app.CalculateFull()
    b5 = c.Range("B5").Value
    g5 = c.Range("G5").Value
    b30 = p.Range("B30").Value
    b6 = c.Range("B6").Value
    b7 = c.Range("B7").Value
    print(f"  托里德: B5={b5!r} G5={g5!r} B30={b30!r} B6={b6!r} B7={b7!r}")
    chk("命中武器 = 托里德", b5 == "\u6258\u91cc\u5fb7", f"({b5!r})")
    chk("联想表类别列 G5 = 步枪", g5 == "\u6b65\u67aa", f"({g5!r})")
    chk("参数!B30 = 步枪", b30 == "\u6b65\u67aa", f"({b30!r})")
    chk("B6 不再显示近战", b6 is not None and "\u8fd1\u6218" not in str(b6), f"({b6!r})")
    chk("倾向 = 1.3", abs(float(b7) - 1.3) < 1e-6, f"({b7!r})")
    d17_1 = c.Range("D17").Value
    d18_1 = c.Range("D18").Value
    print(f"    步枪列 D17={d17_1!r}  D18={d18_1!r}")
    chk("近战伤害 在步枪列 -> 无此词条", str(d18_1) == "\u65e0\u6b64\u8bcd\u6761", f"({d18_1!r})")

    # --- 用例 2：执法者（近战 / 1.35）---
    c.Range("B4").Value = "\u6267\u6cd5\u8005"
    c.Range("C4").Value = 2
    app.CalculateFull()
    b30b = p.Range("B30").Value
    b6b = c.Range("B6").Value
    print(f"  执法者: B5={c.Range('B5').Value!r} B30={b30b!r} B6={b6b!r}")
    chk("切回近战武器 -> B30 = 近战·天工造武", b30b == "\u8fd1\u6218\u00b7\u5929\u5de5\u9020\u6b66", f"({b30b!r})")
    chk("B6 回到近战系列名", b6b is not None and "\u8fd1\u6218" in str(b6b), f"({b6b!r})")
    d17_2 = c.Range("D17").Value
    chk("不同类别 -> D17 数值不同", d17_1 != d17_2, f"(步枪 {d17_1} vs 近战 {d17_2})")

    # --- 用例 3：清空搜索 -> 回落，不允许变空（26 格依赖）---
    c.Range("B4").Value = ""
    c.Range("C4").Value = 1
    app.CalculateFull()
    b30c = p.Range("B30").Value
    print(f"  清空: B5={c.Range('B5').Value!r} B30={b30c!r}")
    chk("无武器时 B30 回落非空", b30c is not None and str(b30c) != "", f"({b30c!r})")
    chk("回落值 == 参数!B37", str(b30c) == str(p.Range("B37").Value), f"({b30c!r})")

    # --- 用例 4：霰弹 / 手枪 / 曲翼 各来一次 ---
    for kw, want in [("\u8d64\u6bd2", None), ("\u5f2f\u5200", None)]:
        c.Range("B4").Value = kw
        c.Range("C4").Value = 1
        app.CalculateFull()
        v5 = c.Range("B5").Value
        v30 = p.Range("B30").Value
        vg = c.Range("G5").Value
        print(f"  {kw}: B5={v5!r} G5={vg!r} B30={v30!r}")
        if vg:
            chk(f"{kw} -> B30 跟 G5 类别一致", str(v30) != "" and vg is not None)

    # 还原
    c.Range("B4").Value = orig_b4
    c.Range("C4").Value = orig_c4
    app.CalculateFull()
finally:
    wb.Close(False)
    app.Quit()

print()
print(f"结果：{ok} 通过 / {bad} 失败")
sys.exit(1 if bad else 0)

# 归档留档脚本：一次性执行。
# 复用时把 xlsm 路径当命令行参数传入；OUT 默认写脚本自己旁边的 out/ 。