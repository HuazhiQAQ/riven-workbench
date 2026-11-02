Attribute VB_Name = "Sheet7"
Attribute VB_Base = "0{00020820-0000-0000-C000-000000000046}"
Attribute VB_GlobalNameSpace = False
Attribute VB_Creatable = False
Attribute VB_PredeclaredId = True
Attribute VB_Exposed = True
Attribute VB_TemplateDerived = False
Attribute VB_Customizable = True
Attribute VB_Control = "CommandButton1, 3, 0, MSForms, CommandButton"
Attribute VB_Control = "CommandButton2, 4, 1, MSForms, CommandButton"
Attribute VB_Control = "CommandButton3, 5, 2, MSForms, CommandButton"
Attribute VB_Control = "CommandButton4, 6, 3, MSForms, CommandButton"
Attribute VB_Control = "CommandButton5, 7, 4, MSForms, CommandButton"

' ★ 模块级缓存（变体名字索引）：声明必须待在声明区，不能塞在过程中间，否则编译不过。
Private 名字表 As Object        ' 压空格(叫法) -> "武器行,命中列"
Private 本体表 As Object        ' 压空格(叫法) -> 武器行（只装「本体」那批）
Private 名字表列 As Long        ' 建表时用的是哪一列（= 参数!B28）。语言一换就得重建，
                               ' 否则「国际服名 == 国服名」那 482 把会命中错列（实测 Coda Tysis 会错）。













'==================================================================
' 「洗卡模拟器」工作表宏  v7（属性名 / 数值 分列版）
'
' 布局（行号为当前版本，改版式时只需改下面这几个地址函数）
'   ① 开紫卡区   A3:E3 标题，卡片 A4:E7，词条 9~12 行
'   ② 洗卡区     A16:E16 标题，卡片 A17:E20，词条 20~23 行
'   ③ 自选区     H3:M3 标题，输入 4~8 行，候选 I/K 11~15 行，词条 18~21 行
'   ④ 融合      洗卡区 A27:E27 起、自选区 H25:M25 起
'
' 每个词条槽 = 两个格：
'   属性名格 —— 带下拉（该武器类别可用的全部词条），也可以自己手打
'   数值格   —— 纯数字（不带 %），可以自己手填，用来还原手头真实的紫卡
'   锁定格   —— 下拉「不锁 / 锁定」（① 开紫卡区没有锁定列，开卡就是全新卡）
'
' 数值 = 数据表基准值 × 组合系数 × 倾向 × 浮动系数(0.9~1.1)
' 基准值：普通词条直接用；派系伤害先由倍率还原成百分数（1.45 -> 45）；
'         后坐力算完再翻符号（正面 -90 是降低、负面 +44 是增加）。
' 数值格里存的是「游戏里看到的那个数」，不是上面的内部值（见 游戏值 / 内部值）。
' 锁定的词条在「洗卡」时原样保留，且组合类型（2正/3正、带不带负）也会冻结。
'
' 融合规则：
'   1. 每张紫卡最多带 1 个融合词条（卡上已有 35~52 行的词条时拒绝融合）
'   2. 正+负 -> 产物是正面词条，进「正面材料」那个槽；另一个槽按自身正负补一条新词条
'      正+正 -> 同上，进第一个正面槽
'   3. 近战时「近战伤害/冰冻/毒素/电击/火焰/初始连击/额外连击数几率」永远只出正面（见 近战永正）
'   4. 融合表按「数据表行号」配对，不看名字写法（国服 / 国际服 名字不同也能配）
'   5. 产物数值 = 基准 × 组合系数 × 倾向 × 浮动（产物固定进正面槽，取增益系数），
'      和普通重滚（补充词条）完全同一套公式，产物自动锁定。
'      ★ 新规则：**浮动不再重新随机，而是继承两个材料里较高的那个**
'        （网页版 volOf() 同一口径）。
'        材料自己的浮动用 材料浮动() 反解，不用另外存隐藏缓存 —— 详见那里的注释。
'   7. ★ 词条池数组一律「1 基」：i = Int(Rnd() * pcnt) + 1，取值 1~pcnt。
'      写成 i = Int(Rnd() * pcnt) 会取到 0，pool(0) = 「运行错误 9：下标越界」。
'      同理 生成词条 里的 pool/npool 洗牌也是 j = Int(Rnd() * i) + 1。
'
'   6. 融合会「消耗」两个材料槽：产物进正面材料槽并自动锁定；
'      另一个材料槽若原本是「锁定」，会被自动清成「不锁」并重滚一条同正负的新词条
'
' 下拉同步：
'   * 融合下拉只列「词条名」，两个下拉互斥（各自排除对方已选的那条）
'   * 卡面一变（点按钮 or 手改词条名）就重刷下拉池，不会出现「选不上对不上」
'   * 换卡（开紫卡 / 洗卡 / 换武器）会清掉该区融合产物栏
'==================================================================

Const 抽取起 As Long = 2
Const 抽取止 As Long = 34
Const 融合起 As Long = 35
Const 融合止 As Long = 52
' ★ 概率不获得连击数：只可能以「负面」形态出现，永远不进正面池（见 是永负）
Const 概率不获得连击数行 As Long = 30

' ★ 两条「光看数字看不出来」的口径（网页版已同步，此处口径相同）
'   A. 派系伤害（数据 16/17/18/42/43/44 行）：数据表里存的 1.45 是**倍率**，
'      意思是「伤害变成 1.45 倍」，也就是加成 +45%。参与公式的必须是那个 +45，
'      不能拿 1.45 去乘系数（倾向 0.5 时会算成 1.45*0.5 = 0.72 倍，反倒减伤）。
'   B. 后坐力（数据 25 行）：全表唯一「方向相反」的一条 ——
'      正面槽是「后坐力降低」（游戏里显示 -90%，是增益），
'      负面槽是「后坐力增加」（游戏里显示 +44%，是减益）。
'
'   → 数值格一律存「游戏里看到的那个数」（派系存倍率、后坐力存负值），
'     公式里一律用「加成的百分数」，两边靠 游戏值() / 内部值() 互换。
Const 后坐力行 As Long = 25

'------------------------ 五个按钮 ------------------------
Private Sub CommandButton1_Click()
    On Error GoTo EH
        随机抽取
    Exit Sub
EH:
    MsgBox "「开紫卡」出错了（错误 " & Err.Number & "）：" & Err.Description, vbExclamation
End Sub

Private Sub CommandButton2_Click()
    On Error GoTo EH
        洗卡
    Exit Sub
EH:
    MsgBox "「洗卡」出错了（错误 " & Err.Number & "）：" & Err.Description, vbExclamation
End Sub

Private Sub CommandButton3_Click()
    On Error GoTo EH
        洗卡自选
    Exit Sub
EH:
    MsgBox "「洗卡(自选)」出错了（错误 " & Err.Number & "）：" & Err.Description, vbExclamation
End Sub

Private Sub CommandButton4_Click()
    On Error GoTo EH
        融合 2
    Exit Sub
EH:
    MsgBox "「融合」出错了（错误 " & Err.Number & "）：" & Err.Description, vbExclamation
End Sub

Private Sub CommandButton5_Click()
    On Error GoTo EH
        融合 3
    Exit Sub
EH:
    MsgBox "「融合(自选)」出错了（错误 " & Err.Number & "）：" & Err.Description, vbExclamation
End Sub

'------------------------ 开紫卡：随机武器 + 随机组合 ------------------------
Sub 随机抽取()
    Dim tWs As Worksheet, pWs As Worksheet
    Dim i As Long, lastRow As Long, wcol As Long, nameCol As Long, r As Long
    Dim wname As String, cat As String, key As String
    Dim disp As Double
    Dim scr As Boolean
    Dim pool(1 To 700) As Long, pcnt As Long, pi As Long

    Set tWs = Worksheets("倾向表")
    Set pWs = Worksheets("参数")

    nameCol = CLng(pWs.Range("B28").Value)
    If nameCol < 1 Or nameCol > 3 Then nameCol = 1
    wcol = 6 - nameCol

    lastRow = 0
    For i = 2 To 640
        If Len(CStr(tWs.Cells(i, 4).Value)) > 0 Then lastRow = i
    Next i
    If lastRow < 2 Then
        MsgBox "倾向表里没有武器数据，请先补全倾向表。"
        Exit Sub
    End If

    ' ★ 变体（I 列）：开紫卡**只开「本体」和「变体·无本体」**，跳过「变体·有本体」。
    '   2026-09-27：「随机卡紫卡只会开出来本体和变体无本体的武器……
    '   刨除掉一部分变体，让概率更贴近实际」。
    '   先把可开的行号收进池子（不是过滤后按下标算，否则概率会偏），再在池子里等概率抽。
    pcnt = 0
    For i = 2 To lastRow
        If 可开卡(i) Then
            pcnt = pcnt + 1
            pool(pcnt) = i
        End If
    Next i
    If pcnt = 0 Then
        MsgBox "倾向表 I 列「变体」把武器全排除了（一把可开的都没有），请检查该列。"
        Exit Sub
    End If

    清名字表

    Randomize
    scr = Application.ScreenUpdating
    Application.ScreenUpdating = False

    For i = 1 To 120
        pi = Int(Rnd() * pcnt) + 1
        Me.Range(卡片格(1)).Value = CStr(tWs.Cells(pool(pi), wcol).Value)
        DoEvents
    Next i
    pi = Int(Rnd() * pcnt) + 1
    r = pool(pi)
    wname = CStr(tWs.Cells(r, wcol).Value)
    cat = CStr(tWs.Cells(r, 7).Value)
    If IsNumeric(tWs.Cells(r, 6).Value) Then
        disp = CDbl(tWs.Cells(r, 6).Value)
    Else
        disp = CDbl(pWs.Range("B24").Value)
    End If

    key = ""
    For i = 33 To 37
        If CStr(pWs.Cells(i, 1).Value) = cat Then key = CStr(pWs.Cells(i, 2).Value)
    Next i

    Me.Range(卡片格(1)).Value = wname & "   |   倾向 " & Format(disp, "0.00") & "   |   " & cat
    Application.ScreenUpdating = scr

    ' 换了一张新紫卡：下半区之前的锁定自动清空
    清锁定 2

    生成词条 1, key, disp, False, cat
    镜像下区
    刷新词条池 2, key
    更新命名 2

    ' 新紫卡：两个融合区全部作废
    清融合区 2
    清融合区 3
End Sub

'------------------------ 洗卡：武器跟随上半区，只重滚词条 ------------------------
Sub 洗卡()
    Dim raw As String, wname As String
    Dim key As String, cat As String, disp As Double

    raw = CStr(Me.Range(卡片格(1)).Value)
    ' ★ 用 取武器名 直接抠名字：它内部只做 InStr/Left，不会碰到 Split 的空数组
    wname = 取武器名(raw)
    If Len(wname) = 0 Then
        MsgBox "上半区还没有武器。先点一次上面的「开紫卡」按钮抽一把，洗卡会跟着它走。"
        Exit Sub
    End If

    解析武器 wname, key, disp, cat
    If Len(key) = 0 Then
        MsgBox "识别不出武器「" & wname & "」的类别，请检查倾向表。"
        Exit Sub
    End If

    Randomize
    生成词条 2, key, disp, True, cat
    刷新词条池 2, key
    清融合区 2
    清名字表
    更新命名 2
End Sub

'------------------------ 自选武器洗卡 ------------------------
Sub 洗卡自选()
    Dim wname As String, key As String, cat As String
    Dim disp As Double, sel As String, prev As String

    刷新候选

    sel = 当前候选名
    sel = 净名(sel)
    If Len(sel) = 0 Then sel = Trim$(CStr(Me.Range(自选武器格).Value))
    If Len(sel) = 0 Then
        MsgBox "请在右侧「搜索名称」里输入关键字，再把「候选序号」填成想洗的那一个（见候选列表）。"
        Exit Sub
    End If
    wname = sel

    解析武器 wname, key, disp, cat
    If Len(key) = 0 Then
        MsgBox "识别不出武器「" & wname & "」的类别，请检查倾向表。"
        Exit Sub
    End If

    prev = 取武器名(CStr(Me.Range(洗卡对象格).Value))
    If StrComp(压空格(prev), 压空格(wname), vbTextCompare) <> 0 Then 清锁定 3

    Me.Range(洗卡对象格).Value = wname & "   |   倾向 " & Format(disp, "0.00") & "   |   " & cat

    Randomize
    生成词条 3, key, disp, True, cat
    刷新词条池 3, key
    清融合区 3
    清名字表
    更新命名 3
End Sub

'------------------------ 融合：选两个词条合成一个新词条 ------------------------
Sub 融合(ByVal blk As Long)
    Dim dWs As Worksheet, fWs As Worksheet, pWs As Worksheet
    Dim i As Long, j As Long, fr As Long, tmp As Long, fa As Long, fb As Long
    Dim s1 As String, s2 As String, nm1 As String, nm2 As String
    Dim r1 As Long, r2 As Long, prRow As Long
    Dim wname As String, key As String, cat As String
    Dim vcol As Long, nameCol As Long
    Dim disp As Double
    Dim na As String, nb As String, nc As String
    Dim prodCN As String
    Dim base As Double, vol As Double, vol2 As Double, lo As Double, hi As Double, v As Double
    Dim slot As Long, m1 As Long, m2 As Long, mp As Long, mo As Long
    Dim nPos As Long, nNeg As Long
    Dim coef As Double, comboRow As Long

    On Error GoTo EH

    Set dWs = Worksheets("数据")
    Set fWs = Worksheets("融合")
    Set pWs = Worksheets("参数")

    ' 1. 读两个下拉（值就是当前卡面上的词条名）
    s1 = Trim$(CStr(Me.Range(融选格(blk, 1)).Value))
    s2 = Trim$(CStr(Me.Range(融选格(blk, 2)).Value))
    If Len(s1) = 0 Or Len(s2) = 0 Then
        MsgBox "请先在「融合词条1」「融合词条2」两个下拉里各选一个要融合的词条。"
        Exit Sub
    End If
    nm1 = s1
    nm2 = s2
    If StrComp(nm1, nm2, vbTextCompare) = 0 Then
        MsgBox "两个下拉选了同一个词条，请选两个不同的词条。"
        Exit Sub
    End If

    ' 2. 武器与倾向：blk2 跟随上半区；blk3 跟随自选区（空则回退上半区）
    If blk = 3 Then
        wname = 取武器名(CStr(Me.Range(洗卡对象格).Value))
        If Len(wname) = 0 Then wname = 取武器名(CStr(Me.Range(卡片格(1)).Value))
    Else
        wname = 取武器名(CStr(Me.Range(卡片格(1)).Value))
    End If
    If Len(wname) = 0 Then
        MsgBox "该区还没有确定武器，请先点一次「开紫卡」或「洗卡(自选)」。"
        Exit Sub
    End If
    解析武器 wname, key, disp, cat
    If Len(key) = 0 Then
        MsgBox "识别不出武器「" & wname & "」的类别，请检查倾向表。"
        Exit Sub
    End If

    ' 3. 反查两个所选词条在数据表的行号
    r1 = 名字词条行(nm1)
    r2 = 名字词条行(nm2)
    If r1 = 0 Or r2 = 0 Then
        MsgBox "数据表里找不到词条：" & nm1 & " / " & nm2
        Exit Sub
    End If

    ' 4. 显示名列 与 本类武器的数据列
    nameCol = CLng(pWs.Range("B28").Value)
    If nameCol < 1 Or nameCol > 3 Then nameCol = 1
    vcol = 0
    For j = 7 To 11
        If CStr(dWs.Cells(1, j).Value) = key Then vcol = j
    Next j
    If vcol = 0 Then
        MsgBox "识别不出这类武器的数据列，请检查「参数」表 A33:A37 / B33:B37。"
        Exit Sub
    End If

    ' 5. 查融合表：按「数据表行号」配对
    prRow = 0
    For fr = 2 To 31
        na = Trim$(CStr(fWs.Cells(fr, 1).Value))
        nb = Trim$(CStr(fWs.Cells(fr, 2).Value))
        nc = Trim$(CStr(fWs.Cells(fr, 3).Value))
        If Len(na) > 0 And Len(nb) > 0 And Len(nc) > 0 Then
            fa = 名字词条行(na)
            fb = 名字词条行(nb)
            If (fa = r1 And fb = r2) Or (fa = r2 And fb = r1) Then
                tmp = 名字词条行(nc)
                If tmp > 0 Then
                    If IsNumeric(dWs.Cells(tmp, vcol).Value) Then
                        prRow = tmp
                        Exit For
                    End If
                End If
            End If
        End If
    Next fr
    If prRow = 0 Then
        MsgBox "融合表里没有这对组合（或者这类武器出不了对应的融合属性）：" & vbCrLf & _
               nm1 & "  +  " & nm2
        Exit Sub
    End If
    prodCN = Trim$(CStr(dWs.Cells(prRow, nameCol).Value))

    ' 6. 每张紫卡最多只能带一个融合词条
    For i = 1 To 4
        tmp = 单元格词条行(blk, i)
        If tmp >= 融合起 And tmp <= 融合止 Then
            MsgBox "这张卡上已经有一条融合词条「" & CStr(Me.Range(名格(blk, i)).Value) & "」了。" & vbCrLf & vbCrLf & _
                   "每张紫卡最多只能带一个融合词条。" & vbCrLf & _
                   "要重新融合，请先把那一格的锁定改成「不锁」，点一次「洗卡」把它洗掉，再重新选词条融合。"
            Exit Sub
        End If
    Next i

    ' 7. 找产物栏第一个空行（最多 6 条）
    slot = 0
    For i = 1 To 6
        If Len(Trim$(CStr(Me.Range(融产名格(blk, i)).Value))) = 0 Then
            slot = i
            Exit For
        End If
    Next i
    If slot = 0 Then
        MsgBox "产物栏已满（6条）。点「开紫卡」开新卡后会自动清空。"
        Exit Sub
    End If

    ' 8. 两个材料各在哪个槽
    m1 = 0
    m2 = 0
    For i = 1 To 4
        tmp = 单元格词条行(blk, i)
        If tmp = r1 Then m1 = i
        If tmp = r2 Then m2 = i
    Next i
    If m1 = 0 Or m2 = 0 Then
        MsgBox "所选词条已经不在当前卡面上了（可能刚洗过卡），请重新选择。"
        Exit Sub
    End If

    ' 9. 当前卡面的正负构型（第 4 格固定是负面词条）
    nPos = 0
    For i = 1 To 3
        If Len(Trim$(CStr(Me.Range(名格(blk, i)).Value))) > 0 Then nPos = i
    Next i
    nNeg = 0
    If Len(Trim$(CStr(Me.Range(名格(blk, 4)).Value))) > 0 Then nNeg = 1
    If nPos < 2 Then nPos = 2

    ' 10. 产物进「正面材料」那个槽
    If m1 = 4 Then
        mp = m2
        mo = m1
    Else
        mp = m1
        mo = m2
    End If

    Randomize

    ' ★ 写卡面期间关掉事件：不关的话每写一格都会触发 Worksheet_Change -> 刷新融合下拉，
    '   嵌套事件在 WPS 上偶发「外层宏静默中断」——产物写了、对面槽的锁也清了，但新词条没补上。
    Application.EnableEvents = False
    ' 11. 产物写进卡面并自动锁定
    lo = CDbl(pWs.Range("B4").Value)
    hi = CDbl(pWs.Range("B6").Value)
    If hi < lo Then hi = lo
    base = 基准内部(prRow, dWs, vcol)
    comboRow = 组合行(nPos, nNeg)
    coef = CDbl(pWs.Cells(comboRow, 2).Value)
    ' ★★ 新规则（浮动系数继承两个材料里较高的那个）：
    '     产物的浮动**不再重新随机**，取两个材料里较高的那个。
    '     旧写法是 vol = lo + Rnd() * (hi - lo)，产物数值和材料好坏完全无关，玩家没法「养」数值。
    vol = 材料浮动(blk, m1, r1, disp, comboRow, dWs, vcol, lo, hi)
    vol2 = 材料浮动(blk, m2, r2, disp, comboRow, dWs, vcol, lo, hi)
    If vol2 > vol Then vol = vol2
    ' ★ 融合只是把两个词条换成一个词条，数值按「基准 * 组合系数 * 倾向 * 浮动」
    '   算一遍，和普通重滚（补充词条）完全同一套公式 —— 唯一区别是浮动是继承来的。
    '   以前写成 base * disp * vol 是漏了 coef（2026-09-26 修正）：
    '   融合产物数值会整体偏小（少乘 0.99~1.2375 那一档）。
    '   产物写进的是正面槽（mp 永不为 4），所以取增益系数列（参数 B 列，即第 2 列）。
    v = base * coef * disp * vol
    写词条 blk, mp, prodCN, v, prRow
    If Len(锁格(blk, mp)) > 0 Then Me.Range(锁格(blk, mp)).Value = "锁定"

    ' 12. 另一个材料槽：这条材料被融合「消耗」掉了
    '     -> 先把它的锁定清掉（自动解锁），再重滚一条同正负的新词条
    If Len(锁格(blk, mo)) > 0 Then
        If Trim$(CStr(Me.Range(锁格(blk, mo)).Value)) = "锁定" Then
            Me.Range(锁格(blk, mo)).Value = "不锁"
        End If
    End If
    补充词条 blk, mo, key, disp, cat, nPos, nNeg

    ' 13. 产物栏再记一份
    Me.Range(融产名格(blk, slot)).Value = prodCN
    ' ★ 产物栏也存「游戏里看到的那个数」，和卡面同一口径
    With Me.Range(融产值格(blk, slot))
        If 是否派系行(prRow) Then
            .Value = CDbl(Format(游戏值(prRow, v), "0.0000"))
            .NumberFormat = """×""0.00;""×""0.00;""×""0.00"
        Else
            .Value = CDbl(Format(游戏值(prRow, v), "0.00"))
            .NumberFormat = "+0.00;-0.00;0.00"
        End If
    End With
    If Len(融产锁格(blk, slot)) > 0 Then Me.Range(融产锁格(blk, slot)).Value = "锁定"

    ' 14. 清空两个融合下拉，方便下一次选；并刷新互斥列表源
    Me.Range(融选格(blk, 1)).Value = ""
    Me.Range(融选格(blk, 2)).Value = ""
    刷新融合下拉 blk
    更新命名 blk

    Application.EnableEvents = True
    Exit Sub
EH:
    Application.EnableEvents = True
    MsgBox "「融合」出错了（错误 " & Err.Number & "）：" & Err.Description, vbExclamation
End Sub

'==================================================================
' 材料浮动()：反解某条词条自己带的「浮动系数」
'
' ★ 2026-09-30 新规则：融合产物的浮动**继承两个材料里较高的那个**，不再重新随机。
'   材料自己的浮动**反解**出来就行，不用另外存一份隐藏缓存：
'       值 = 基准 × 组合系数 × 倾向 × 浮动   =>   浮动 = 值 / (基准 × 组合系数 × 倾向)
'
'   为什么反解而不是存字段：
'     1. 玩家可以手填数值格去「还原手里的真紫卡」—— 那时根本不存在「当初摇出来的浮动」，
'        反解出来的正是这条词条隐含的浮动，这才是玩家想继承的那个数。
'     2. 反解永远和格子里躺着的数一致，不会出现「手改了值、缓存没跟着变」的脏数据
'        （那类 bug 极隐蔽：界面看着对，算出来差一截）。
'     3. 少一处要同步维护的隐藏区域（清卡 / 换武器 / 镜像下区 都不用管它）。
'
'   兜底：算不出来（空槽 / 这类武器没基准值 / 倾向为 0 / 手填了个离谱的数）
'        就退回中位浮动 (lo+hi)/2，并把结果夹回 [lo, hi] ——
'        浮动系数按定义就落在这个区间里，别让一个手滑的数把产物带飞。
'==================================================================
Private Function 材料浮动(ByVal blk As Long, ByVal idx As Long, ByVal drow As Long, _
                          ByVal disp As Double, ByVal comboRow As Long, _
                          ByVal dWs As Worksheet, ByVal vcol As Long, _
                          ByVal lo As Double, ByVal hi As Double) As Double
    Dim pWs As Worksheet
    Dim g As Double, base As Double, coef As Double, vol As Double

    Set pWs = Worksheets("参数")

    材料浮动 = (lo + hi) / 2                        ' 兜底：中位浮动
    If drow <= 0 Then Exit Function
    If disp = 0 Then Exit Function
    If Not IsNumeric(Me.Range(数值格(blk, idx)).Value) Then Exit Function

    ' 格子里存的是「游戏里看到的那个数」（派系是倍率、后坐力翻过符号），先还原成内部口径
    g = 内部值(drow, CDbl(Me.Range(数值格(blk, idx)).Value))
    base = 基准内部(drow, dWs, vcol)
    If base = 0 Then Exit Function

    ' 第 4 槽是负面槽，用减益系数（参数 C 列，本身是负的）；其余用增益系数（B 列）
    If idx = 4 Then
        coef = CDbl(pWs.Cells(comboRow, 3).Value)
    Else
        coef = CDbl(pWs.Cells(comboRow, 2).Value)
    End If
    If coef = 0 Then Exit Function

    vol = g / (base * coef * disp)
    If vol <> vol Then Exit Function                ' NaN 守卫（VBA 里 NaN <> NaN 为真）
    If vol < lo Then vol = lo
    If hi > lo Then
        If vol > hi Then vol = hi
    Else
        vol = lo
    End If
    材料浮动 = vol
End Function

' 在 blk 区 idx 槽补一条新随机词条
Private Function 补充词条(ByVal blk As Long, ByVal idx As Long, ByVal key As String, _
                          ByVal disp As Double, ByVal cat As String, _
                          ByVal nPos As Long, ByVal nNeg As Long) As Boolean
    Dim dWs As Worksheet, pWs As Worksheet
    Dim k As Long, i As Long, j As Long, pcnt As Long, dup As Long
    Dim nameCol As Long, vcol As Long
    Dim pool(1 To 60) As Long
    Dim comboRow As Long
    Dim base As Double, vol As Double, lo As Double, hi As Double, v As Double
    Dim coef As Double
    Dim isNeg As Boolean

    Set dWs = Worksheets("数据")
    Set pWs = Worksheets("参数")

    补充词条 = False
    nameCol = CLng(pWs.Range("B28").Value)
    If nameCol < 1 Or nameCol > 3 Then nameCol = 1
    vcol = 0
    For j = 7 To 11
        If CStr(dWs.Cells(1, j).Value) = key Then vcol = j
    Next j
    If vcol = 0 Then Exit Function

    isNeg = (idx = 4)

    comboRow = 组合行(nPos, nNeg)
    If isNeg Then
        coef = CDbl(pWs.Cells(comboRow, 3).Value)
    Else
        coef = CDbl(pWs.Cells(comboRow, 2).Value)
    End If

    pcnt = 0
    For k = 抽取起 To 抽取止
        If IsNumeric(dWs.Cells(k, vcol).Value) Then
            If Not 是永不正(k, cat) Then
                ' 正面槽：剔除「只能当负面出」的永负项；负面槽：剔除「永不出负面」的永正项
                If Not IIf(isNeg, 是永正(k, cat), 是永负(k, cat)) Then
                    dup = 0
                    For i = 1 To 4
                        If i <> idx Then
                            If 单元格词条行(blk, i) = k Then dup = 1
                        End If
                    Next i
                    If dup = 0 Then
                        pcnt = pcnt + 1
                        pool(pcnt) = k
                        If pcnt >= 60 Then Exit For
                    End If
                End If
            End If
        End If
    Next k
    If pcnt = 0 Then Exit Function

    ' ★ pool 是 Dim pool(1 To 60)，下标从 1 开始！
    '   旧代码写 i = Int(Rnd() * pcnt) 会取到 0，pool(0) 抛「运行错误 9：下标越界」，
    '   融合第 12 步（给被消耗的槽补新词条）就会半途中断：
    '   产物已写进卡面并锁定、对面那个槽的锁定已清成「不锁」，但新词条没补上。
    i = Int(Rnd() * pcnt) + 1          ' 1 ~ pcnt
    If i < 1 Then i = 1
    If i > pcnt Then i = pcnt
    k = pool(i)
    lo = CDbl(pWs.Range("B4").Value)
    hi = CDbl(pWs.Range("B6").Value)
    If hi < lo Then hi = lo
    base = 基准内部(k, dWs, vcol)
    vol = lo + Rnd() * (hi - lo)
    v = base * coef * disp * vol
    写词条 blk, idx, CStr(dWs.Cells(k, nameCol).Value), v, k
    补充词条 = True
End Function

' 近战上「永远只出正面」的词条（按数据表行号判断，与语言无关）
'==================================================================
' 词条池规则（改之前先看这几条）
'
' 数据表 2~34 行 = 可抽取词条；35~52 行 = 融合专属词条。
'   ★ 原「基础伤害」拆成 基础伤害(2，仅远程) / 近战伤害(3，仅近战)，
'     又新增「概率不获得连击数(30)」作为「额外连击数几率(29)」的负面形态，全表下移 2 行。
'
' A) 永正集 —— 这些词条**永远不出负面**（正槽照旧能出）：
'      近战：基础伤害(2) / 近战伤害(3) / 冰冻(9) / 毒素(10) / 电击(11) / 火焰(12)
'            / 初始连击(27) / 额外连击数几率(29)
'            ★ 穿透(20) 不在近战永正里，近战也能出负穿透
'      其他武器（步枪/霰弹/手枪/曲翼）：冰冻(9) / 毒素(10) / 电击(11) / 火焰(12) / 穿透(20)
'            ★ 基础伤害(2) 不在这一类里，非近战也能出负基础伤害
' B) 永不正集 —— 这些词条**永远不出**（正槽、负槽都不出）：
'      近战武器 + 数据表 35~52 行（全部 18 条融合专属词条）
'      ★ 非近战武器上，35~52 行**可以**出现在紫卡上，但只能是通过融合得到的正面词条
' C) 永正集（补充）—— 数据表 35~52 行融合专属词条，**任何类别下都只出正面**
'      （融合产物永远正面，洗卡也洗不出负面融合词条）
' C) 永负集 —— 这些词条**只能当负面出**（正槽永远不出，负槽照常出）：
'      概率不获得连击数(30)，基准值 104.85（正面形态 额外连击数几率(29) 是 58.77）
'      ★ 别和 B 搞混：B 是正负都不出，C 只是不出正面。
'
' 永正 / 永不正 / 永负 都按「数据表行号」判断，不按名字写法（换语言也不会失效）。
' 「计算器」sheet 的 N5(正槽)/O5/Q5(正槽)/P5(负面槽) 用同一套规则（见 layout_calc.py）。
'==================================================================

' ---- 永正：近战专属的那一档（基础伤害/冰冻/毒素/电击/火焰/初始连击）----
Private Function 近战永正(ByVal k As Long) As Boolean
    Select Case k
        Case 2, 3, 9, 10, 11, 12, 27, 29
            近战永正 = True
        Case Else
            近战永正 = False
    End Select
End Function

' ---- 非近战专属的永正档（冰冻/毒素/电击/火焰/穿透）----
Private Function 远程永正(ByVal k As Long) As Boolean
    Select Case k
        Case 9, 10, 11, 12, 20
            远程永正 = True
        Case Else
            远程永正 = False
    End Select
End Function

' ---- 该词条在该武器类别下是否「永不出负面」----
' ★ 融合专属词条(35~52) 只能通过融合获得，且**永远是正面词条**，
'   所以任何类别下都不可能以负面形态出现 —— 无条件算永正。
Private Function 是永正(ByVal k As Long, ByVal cat As String) As Boolean
    If k >= 融合起 And k <= 融合止 Then
        是永正 = True
    ElseIf cat = "近战" Or cat = "近战·天工造武" Then
        是永正 = 近战永正(k)
    Else
        是永正 = 远程永正(k)
    End If
End Function

' ---- 该词条在该武器类别下是否「永不出」（正负槽都不出）----
' 目前只有一条：近战武器不出 35~52 行的融合专属词条
Private Function 是永不正(ByVal k As Long, ByVal cat As String) As Boolean
    是永不正 = False
    If cat = "近战" Or cat = "近战·天工造武" Then
        If k >= 融合起 And k <= 融合止 Then 是永不正 = True
    End If
End Function

' ---- 该词条是否「只能当负面出」（正槽永远不出，负槽照常出）----
' ★ 与「永不正」不是一回事：永不正 = 正负都不出；永负 = 只出负面。
'   概率不获得连击数(30) 就是「额外连击数几率(29)」的负面形态，
'   基准值也跟正面形态不一样（58.77 vs 104.85），所以单独占一行。
Private Function 是永负(ByVal k As Long, ByVal cat As String) As Boolean
    是永负 = (k = 概率不获得连击数行)
End Function

'---------------- 数值口径：派系（倍率）与后坐力（方向相反） ----------------
' 派系伤害行（基准值存的是倍率 1.45，不是百分数）
Private Function 是否派系行(ByVal k As Long) As Boolean
    Select Case k
        Case 16, 17, 18, 42, 43, 44
            是否派系行 = True
        Case Else
            是否派系行 = False
    End Select
End Function

' 参与公式的基准值：派系行先把「倍率」还原成「加成的百分数」（1.45 -> 45），其余原样
Private Function 基准内部(ByVal k As Long, ByVal dWs As Worksheet, ByVal vcol As Long) As Double
    Dim b As Double
    b = CDbl(dWs.Cells(k, vcol).Value)
    If 是否派系行(k) Then b = (b - 1) * 100
    基准内部 = b
End Function

' 内部值（加成的百分数，正面槽为正）-> 游戏里看到的那个数
'   派系：+45 -> 1.45（倍率）；后坐力：+90 -> -90（降低）；其余原样
Private Function 游戏值(ByVal k As Long, ByVal v As Double) As Double
    If 是否派系行(k) Then
        游戏值 = 1 + v / 100
    ElseIf k = 后坐力行 Then
        游戏值 = -v
    Else
        游戏值 = v
    End If
End Function

' 游戏里看到的那个数 -> 内部值（上面那个的逆）
'   派系：1.45 -> +45；后坐力：-90 -> +90；其余原样
Private Function 内部值(ByVal k As Long, ByVal g As Double) As Double
    If 是否派系行(k) Then
        内部值 = (g - 1) * 100
    ElseIf k = 后坐力行 Then
        内部值 = -g
    Else
        内部值 = g
    End If
End Function

' 去掉半角 / 全角 / 不换行空格，用于跨表比对词条名
' ---- 只剥首尾的不可见空白，保留名字内部空格 ----
Private Function 净名(ByVal s As String) As String
    Dim c As String
    s = Trim$(s)
    Do While Len(s) > 0
        c = Right$(s, 1)
        If c = " " Or c = vbTab Or c = ChrW(160) Or c = ChrW(12288) Then
            s = Left$(s, Len(s) - 1)
        Else
            Exit Do
        End If
    Loop
    Do While Len(s) > 0
        c = Left$(s, 1)
        If c = " " Or c = vbTab Or c = ChrW(160) Or c = ChrW(12288) Then
            s = Mid$(s, 2)
        Else
            Exit Do
        End If
    Loop
    净名 = s
End Function

Private Function 压空格(ByVal s As String) As String
    s = Replace(s, " ", "")
    s = Replace(s, vbTab, "")
    s = Replace(s, vbCr, "")
    s = Replace(s, vbLf, "")
    s = Replace(s, ChrW(12288), "")   ' 全角空格
    s = Replace(s, ChrW(160), "")     ' 不换行空格
    压空格 = Trim$(s)
End Function

' 融合产物也能被手动锁定；锁定后洗卡必须原样保留，
' 所以洗卡时**不再**去动产物的锁定状态（只清产物栏本身）。

' 清空某个融合区：产物栏 6 条 + 两个下拉
Private Sub 清融合区(ByVal blk As Long)
    Dim i As Long
    For i = 1 To 6
        Me.Range(融产名格(blk, i)).Value = ""
        Me.Range(融产值格(blk, i)).Value = ""
        Me.Range(融产值格(blk, i)).NumberFormat = "+0.00;-0.00;0.00"
        If Len(融产锁格(blk, i)) > 0 Then Me.Range(融产锁格(blk, i)).Value = ""
    Next i
    For i = 1 To 2
        Me.Range(融选格(blk, i)).MergeArea.ClearContents
    Next i
    刷新融合下拉 blk
End Sub

' 按词条名（任意语言）反查数据表行号（找不到返回 0），比对时忽略空格
Private Function 名字词条行(ByVal nm As String) As Long
    Dim dWs As Worksheet
    Dim i As Long, c As Long
    Dim want As String

    Set dWs = Worksheets("数据")
    名字词条行 = 0
    nm = Trim$(nm)
    If Len(nm) = 0 Then Exit Function
    want = 压空格(nm)

    ' ★ 上限必须跟着数据表的**最后一行**走，写死数字会在加行后静默失效：
    '   数据表 50 -> 52 行时这里没跟着改，51/52 行（格挡角度 / 震地伤害）反查不到行号，
    '   近战 5 条融合配方里 4 条报「融合表里没有这对组合」。用常量，以后加行自动跟上。
    For i = 抽取起 To 融合止
        For c = 1 To 3
            If StrComp(压空格(CStr(dWs.Cells(i, c).Value)), want, vbTextCompare) = 0 Then
                名字词条行 = i
                Exit Function
            End If
        Next c
    Next i
End Function

'------------------------ 武器名 -> 数据列键 / 倾向 / 类别 ------------------------
Private Sub 解析武器(ByVal wname As String, ByRef key As String, _
                     ByRef disp As Double, ByRef cat As String)
    Dim tWs As Worksheet, pWs As Worksheet
    Dim i As Long, r As Long
    Dim nm As String

    Set tWs = Worksheets("倾向表")
    Set pWs = Worksheets("参数")

    key = ""
    cat = ""
    disp = CDbl(pWs.Range("B24").Value)
    wname = Trim$(wname)
    If Len(wname) = 0 Then Exit Sub

    r = 0
    For i = 2 To 1435
        nm = Trim$(CStr(tWs.Cells(i, 10).Value))
        If Len(nm) > 0 Then
            If StrComp(压空格(nm), 压空格(wname), vbTextCompare) = 0 Then
                r = i
                Exit For
            End If
        End If
    Next i
    If r = 0 Then Exit Sub

    If IsNumeric(tWs.Cells(r, 11).Value) Then disp = CDbl(tWs.Cells(r, 11).Value)
    cat = Trim$(CStr(tWs.Cells(r, 12).Value))

    For i = 33 To 37
        If CStr(pWs.Cells(i, 1).Value) = cat Then key = CStr(pWs.Cells(i, 2).Value)
    Next i
End Sub

'======================== 变体（倾向表 I 列）========================
' 2026-09-27：倾向表加了 I 列「变体」，取值 本体 / 变体·有本体 / 变体·无本体。
' 两条规则：
'   ① 开紫卡只开「本体」和「变体·无本体」—— 变体只是这张卡装上去数值不同，
'      刨掉「变体·有本体」让概率更贴近实际；
'   ② 紫卡命名按本体来 —— 圣装丧钟的卡叫「丧钟 XXXXX」，不叫「圣装丧钟 XXXXX」。
' 判断一律用 InStr 找「有本体」「无本体」两个词，不写含「·」的完整串，省得踩编码。

Private Function 是变体有本体(ByVal v As String) As Boolean
    是变体有本体 = (InStr(1, Trim$(v), "有本体", vbTextCompare) > 0)
End Function

' I 列没填的当「本体」，绝不能把整表抽干
Private Function 是本体行(ByVal v As String) As Boolean
    Dim t As String
    t = Trim$(v)
    If Len(t) = 0 Then
        是本体行 = True
    Else
        是本体行 = (InStr(1, t, "有本体", vbTextCompare) = 0 _
                And InStr(1, t, "无本体", vbTextCompare) = 0)
    End If
End Function

' 这一行能不能开出紫卡（I 列为空 / 本体 / 变体·无本体 -> 能）
Private Function 可开卡(ByVal k As Long) As Boolean
    可开卡 = Not 是变体有本体(CStr(Worksheets("倾向表").Cells(k, 9).Value))
End Function

' 名字索引：一次扫完 C/D/E，之后全是字典查（否则 218 把变体逐个扫 639 行会慢到不可用）。
' ★ 482 / 639 把武器的「国际服名」和「国服名」写的是同一个串，同一个串落在两列时
'   到底算命中哪一列会影响返回的是哪国中文名（实测只有 1 把会真的差：Coda Tysis）。
'   所以按当前**显示语言**那一列先建，跟「随机抽取」取武器名用的是同一列（wcol = 6 - B28）。
Private Sub 建名字表()
    Dim tWs As Worksheet
    Dim i As Long, j As Long, k As String, mc As Long
    Dim nameCol As Long, ord(1 To 3) As Long
    nameCol = CLng(Val(CStr(Worksheets("参数").Range("B28").Value)))
    If nameCol < 1 Or nameCol > 3 Then nameCol = 1
    ' ★ 缓存只在「同一语言」下复用；B28 一变（用语切换）立刻重建，
    '   不依赖调用方记得清 —— 否则会拿上一门语言建的索引去查这一门的名字。
    If Not 名字表 Is Nothing Then
        If 名字表列 = nameCol Then Exit Sub
        清名字表
    End If
    名字表列 = nameCol
    mc = 6 - nameCol
    ord(1) = mc
    j = 1
    For i = 3 To 5
        If i <> mc Then
            j = j + 1
            ord(j) = i
        End If
    Next i

    Set 名字表 = CreateObject("Scripting.Dictionary")
    Set 本体表 = CreateObject("Scripting.Dictionary")
    Set tWs = Worksheets("倾向表")
    For i = 2 To 640
        For j = 1 To 3
            k = 压空格(CStr(tWs.Cells(i, ord(j)).Value))
            If Len(k) > 0 Then
                If Not 名字表.Exists(k) Then 名字表.Add k, CStr(i) & "," & CStr(ord(j))
                If 是本体行(CStr(tWs.Cells(i, 9).Value)) Then
                    If Not 本体表.Exists(k) Then 本体表.Add k, i
                End If
            End If
        Next j
    Next i
End Sub

' 倾向表被改过就重建（每个入口动作前调一次）
Private Sub 清名字表()
    Set 名字表 = Nothing
    Set 本体表 = Nothing
End Sub

' 按任意叫法找武器行，回传命中的列号（3=英文 / 4=国际服 / 5=国服）
Private Function 武器行(ByVal nm As String, ByRef mc As Long) As Long
    Dim k As String, s As String, p As Long
    武器行 = 0
    mc = 3
    k = 压空格(nm)
    If Len(k) = 0 Then Exit Function
    建名字表
    If Not 名字表.Exists(k) Then Exit Function
    s = CStr(名字表(k))
    p = InStr(s, ",")
    武器行 = CLng(Left$(s, p - 1))
    mc = CLng(Mid$(s, p + 1))
End Function

' 变体关键词：跟网页版 export.py 同一套，取自「②变体关键词清单」。
' 踩过的坑都在里面：Prime 有时在名字中间（Garuda Prime Talons）；国服 Wraith 译名不统一
' （10 把「红莲XX」，但双子蝰蛇亡魂是「亡魂」在中间）；Ceti Lacera 的 Ceti 原文漏了，这里补上。
Private Function 变体词(ByVal col As Long, ByVal isPre As Boolean) As String
    If col = 3 Then
        If isPre Then
            变体词 = "Kuva|Tenet|Coda|Prisma|Dex|Mk1-|Vaykor|Rakta|Synoid|Telos|" _
                   & "Sancti|Secura|Mara|Broken|Mutalist|Ceti"
        Else
            变体词 = "Prime|Wraith|Vandal"
        End If
    ElseIf col = 4 Then
        ' 国际服：繁体 + 简体两套都收（这张表的 D 列两种写法都出现过）
        If isPre Then
            变体词 = "赤毒|信條|終幕|稜晶|靈敏|試用型-|勇氣|緋紅|樞議|終極|聖潔|保障|苦痛|破損|破碎|異融|聖裝|紅蓮|天倉" _
                   & "|信条|终幕|棱晶|灵敏|勇气|绯红|枢议|终极|圣洁|破损|异融|圣装|天仓"
        Else
            变体词 = "Prime|亡魂|破壞者|破坏者"
        End If
    Else
        If isPre Then
            变体词 = "赤毒|信条|终幕|棱晶|灵敏|试用型-|勇气|绯红|枢议|终极|" _
                   & "圣洁|保障|苦痛|破损|破碎|异融|圣装|红莲|天仓"
        Else
            变体词 = "Prime|亡魂|破坏者"
        End If
    End If
End Function

' 形态后缀（组合枪主/副手、分合剑重刃）—— 紫卡名不带形态
Private Function 形态词(ByVal i As Long) As String
    Select Case i
        Case 0: 形态词 = "(Primary)"
        Case 1: 形态词 = "(Secondary)"
        Case 2: 形态词 = "(Heavy Blade)"
        Case 3: 形态词 = "(Melee)"
        Case 4: 形态词 = "（主手）"
        Case 5: 形态词 = "(主手)"
        Case 6: 形态词 = "（副手）"
        Case 7: 形态词 = "(副手)"
        Case 8: 形态词 = "（近战）"
        Case 9: 形态词 = "(近战)"
        Case 10: 形态词 = "（近戰）"
        Case 11: 形态词 = "(近戰)"
        Case 12: 形态词 = "（重刃）"
        Case 13: 形态词 = "(重刃)"
    End Select
End Function

' 组合枪：主手那把的本体是「副手」那把（不是剥后缀能得到的）
Private Function 形态替代(ByVal f As String) As String
    Select Case f
        Case "(Primary)": 形态替代 = "(Secondary)"
        Case "(Secondary)": 形态替代 = "(Primary)"
        Case "（主手）": 形态替代 = "（副手）"
        Case "(主手)": 形态替代 = "(副手)"
        Case "（副手）": 形态替代 = "（主手）"
        Case "(副手)": 形态替代 = "(主手)"
    End Select
End Function

' 剥掉形态后缀（喂进来的 s 保持原样，用于显示）
' ★★ Replace 必须显式带 vbTextCompare：InStr 用文本比较时把全角「（」和半角「(」当成同一个字符
'    （「制胜者(主手)」能匹配「（主手）」），但 Replace 默认按二进制比对、一个字都删不掉，
'    结果后缀剥不干净又 Exit Function —— 半角括号那批武器（制胜者(主手)/制胜者(近战)）全中招。
Private Function 剥形态(ByVal s As String) As String
    Dim i As Long, f As String, t As String
    剥形态 = s
    For i = 0 To 13
        f = 形态词(i)
        If Len(f) > 0 Then
            If InStr(1, s, f, vbTextCompare) > 0 Then
                t = 净名(Replace(s, f, "", 1, -1, vbTextCompare))
                If Len(t) > 0 Then 剥形态 = t
                Exit Function
            End If
        End If
    Next i
End Function

' 去掉所有出现的变体词，返回 "|" 拼的候选（s 已压过空格）
Private Function 去变体词(ByVal s As String, ByVal col As Long) As String
    Dim out As String, t As String
    Dim i As Long, k As Variant
    out = ""
    For i = 0 To 1
        For Each k In Split(变体词(col, (i = 0)), "|")
            If Len(k) > 0 Then
            If InStr(1, s, k, vbTextCompare) > 0 Then
                t = Replace(s, k, "", 1, -1, vbTextCompare)
                If Len(t) > 0 Then out = out & t & "|"
                End If
            End If
        Next k
    Next i
    去变体词 = out
End Function

' 变体的候选本体名：去变体词 + 换形态 + 剥形态，三种都试
Private Function 变体候选(ByVal s As String, ByVal col As Long) As String
    Dim out As String, t As String, f As String, alt As String
    Dim i As Long
    out = 去变体词(s, col)
    For i = 0 To 13
        f = 压空格(形态词(i))
        If Len(f) > 0 Then
            If InStr(1, s, f, vbTextCompare) > 0 Then
                alt = 压空格(形态替代(形态词(i)))
                If Len(alt) > 0 Then
                    t = Replace(s, f, alt, 1, -1, vbTextCompare)
                    If Len(t) > 0 Then out = out & t & "|" & 去变体词(t, col)
                End If
                t = Replace(s, f, "", 1, -1, vbTextCompare)
                If Len(t) > 0 Then out = out & t & "|" & 去变体词(t, col)
            End If
        End If
    Next i
    变体候选 = out
End Function

' 候选里第一个能对上「本体」行的
Private Function 找本体行(ByVal cands As String) As Long
    Dim c As Variant
    找本体行 = 0
    If Len(cands) = 0 Then Exit Function
    建名字表
    For Each c In Split(cands, "|")
        If Len(c) > 0 Then
            If 本体表.Exists(c) Then
                找本体行 = CLng(本体表(c))
                Exit Function
            End If
        End If
    Next c
End Function

' 变体的紫卡该叫什么名字：圣装丧钟 -> 丧钟。本体 / 变体·无本体 -> 原样返回。
' 先按名字命中的那一列剥，剥不出来再跨到另外两列（国服译名不统一，得留后路）。
Private Function 本体名(ByVal nm As String) As String
    Dim tWs As Worksheet
    Dim r As Long, mc As Long, br As Long, k As Long, col As Long
    Dim s As String, bv As String
    本体名 = nm
    If Len(压空格(nm)) = 0 Then Exit Function
    Set tWs = Worksheets("倾向表")
    r = 武器行(nm, mc)
    If r = 0 Then Exit Function
    ' ★ 首选：倾向表 Q/R/S 列里**写死的本体名**（离线按「武器名字对照表」生成，
    '   不在这里靠关键词现场猜）。mc=5 国服 -> Q(17) / mc=4 国际服 -> R(18) / mc=3 EN -> S(19)。
    '   这三列空了（比如表里新加了武器）才回落到下面的剥离算法。
    bv = 净名(CStr(tWs.Cells(r, 22 - mc).Value))
    If Len(bv) > 0 Then
        本体名 = bv
        Exit Function
    End If
    ' ★ 本体 / 变体·无本体：命名按自己，但**同样要剥形态后缀**
    '   （组合枪本体叫「捕月（副手）」/「Catchmoon (Secondary)」，紫卡名应叫「捕月」/「Catchmoon」）
    If Not 是变体有本体(CStr(tWs.Cells(r, 9).Value)) Then
        本体名 = 剥形态(nm)
        Exit Function
    End If
    br = 0
    ' ★ 列顺序**固定** EN(3) -> 国际服(4) -> 国服(5)，跟网页版 export.py 的 _CFG 一致；
    '   不能「从命中的那一列开始」，否则国服那条路会先撞上「盗贼双枪」(Afuris)，
    '   而 export.py 按 EN 优先取到的是「盗贼」(Furis) —— Dex Furis 就这一把会对不上。
    For k = 1 To 3
        col = 2 + k
        s = 压空格(CStr(tWs.Cells(r, col).Value))
        If Len(s) > 0 Then
            br = 找本体行(变体候选(s, col))
            If br > 0 Then Exit For
        End If
    Next k
    If br > 0 Then
        本体名 = 剥形态(CStr(tWs.Cells(br, mc).Value))
        If Len(压空格(本体名)) = 0 Then 本体名 = nm
    Else
        本体名 = 剥形态(nm)
    End If
End Function

'------------------------ 生成词条 ------------------------
Private Sub 生成词条(ByVal blk As Long, ByVal key As String, ByVal disp As Double, _
                     ByVal useLock As Boolean, ByVal cat As String)
    Dim dWs As Worksheet, pWs As Worksheet
    Dim i As Long, j As Long, k As Long, tmp As Long
    Dim nameCol As Long, vcol As Long
    Dim pool(1 To 60) As Long, pcnt As Long, pi As Long, need As Long
    Dim npool(1 To 60) As Long, ncnt As Long, ni As Long, npi As Long, dup As Long
    Dim comboRow As Long, nPos As Long, nNeg As Long
    Dim gainC As Double, negC As Double
    Dim lo As Double, hi As Double, vol As Double, base As Double, v As Double
    Dim lk(1 To 4) As Boolean
    Dim anyLock As Boolean, used As Long

    Set dWs = Worksheets("数据")
    Set pWs = Worksheets("参数")

    nameCol = CLng(pWs.Range("B28").Value)
    If nameCol < 1 Or nameCol > 3 Then nameCol = 1

    lo = CDbl(pWs.Range("B4").Value)
    hi = CDbl(pWs.Range("B6").Value)
    If hi < lo Then hi = lo

    anyLock = False
    For i = 1 To 4
        lk(i) = False
        If useLock Then
            If Trim$(CStr(Me.Range(锁格(blk, i)).Value)) = "锁定" Then
                lk(i) = True
                anyLock = True
            End If
        End If
    Next i

    ' 有锁定就冻结当前组合类型；否则四选一（等概率）
    If anyLock Then
        nPos = 0
        nNeg = 0
        For i = 1 To 3
            If Len(Trim$(CStr(Me.Range(名格(blk, i)).Value))) > 0 Then nPos = i
        Next i
        If Len(Trim$(CStr(Me.Range(名格(blk, 4)).Value))) > 0 Then nNeg = 1
        If nPos < 2 Then nPos = 2
        comboRow = 组合行(nPos, nNeg)
    Else
        取组合 comboRow, nPos, nNeg
    End If
    gainC = CDbl(pWs.Cells(comboRow, 2).Value)
    negC = CDbl(pWs.Cells(comboRow, 3).Value)

    vcol = 0
    For j = 7 To 11
        If CStr(dWs.Cells(1, j).Value) = key Then vcol = j
    Next j

    pcnt = 0
    ncnt = 0
    If vcol > 0 Then
        For k = 抽取起 To 抽取止
            If IsNumeric(dWs.Cells(k, vcol).Value) Then
                If Not 是永不正(k, cat) Then
                    used = 0
                    For i = 1 To 4
                        If lk(i) Then
                            If 单元格词条行(blk, i) = k Then used = 1
                        End If
                    Next i
                    If used = 0 Then
                        ' 正面池：剔除「只能当负面出」的永负项（概率不获得连击数）
                        If Not 是永负(k, cat) Then
                            pcnt = pcnt + 1
                            pool(pcnt) = k
                            If pcnt >= 60 Then Exit For
                        End If
                        ' 负面池：剔除「永不出负面」的永正项
                        If Not 是永正(k, cat) Then
                            ncnt = ncnt + 1
                            npool(ncnt) = k
                            If ncnt >= 60 Then Exit For
                        End If
                    End If
                End If
            End If
        Next k
    End If

    need = 0
    For i = 1 To 3
        If (Not lk(i)) And i <= nPos Then need = need + 1
    Next i
    If (Not lk(4)) And nNeg = 1 Then need = need + 1

    If vcol = 0 Or pcnt < need Or (nNeg = 1 And (Not lk(4)) And ncnt = 0) Then
        If Not lk(1) Then
            清词条 blk, 1
            Me.Range(名格(blk, 1)).Value = "该类别可用词条不足，无法模拟。"
        End If
        For i = 2 To 4
            If Not lk(i) Then 清词条 blk, i
        Next i
        Exit Sub
    End If

    For i = pcnt To 2 Step -1
        j = Int(Rnd() * i) + 1
        tmp = pool(i): pool(i) = pool(j): pool(j) = tmp
    Next i
    For i = ncnt To 2 Step -1
        j = Int(Rnd() * i) + 1
        tmp = npool(i): npool(i) = npool(j): npool(j) = tmp
    Next i

    pi = 0
    For i = 1 To 3
        If lk(i) Then
            ' 锁定：保持不变
        ElseIf i <= nPos Then
            pi = pi + 1
            If pi > pcnt Then Exit For      ' ★ 守卫：正面池不够时不再越界
            base = 基准内部(pool(pi), dWs, vcol)
            vol = lo + Rnd() * (hi - lo)
            v = base * gainC * disp * vol
            写词条 blk, i, CStr(dWs.Cells(pool(pi), nameCol).Value), v, pool(pi)
        Else
            清词条 blk, i
        End If
    Next i

    If Not lk(4) Then
        If nNeg = 1 Then
            npi = 0
            For ni = 1 To ncnt
                dup = 0
                For i = 1 To pi
                    If pi <= pcnt Then
                        If pool(i) = npool(ni) Then dup = 1
                    End If
                Next i
                If dup = 0 Then
                    npi = ni
                    Exit For
                End If
            Next ni
            If npi = 0 Then npi = 1
            If npi > ncnt Then npi = ncnt    ' ★ 守卫：负面池不够时不越界
            base = 基准内部(npool(npi), dWs, vcol)
            vol = lo + Rnd() * (hi - lo)
            v = base * negC * disp * vol
            写词条 blk, 4, CStr(dWs.Cells(npool(npi), nameCol).Value), v, npool(npi)
        Else
            清词条 blk, 4
        End If
    End If
End Sub

'------------------------ 洗卡器默认镜像开卡器 ------------------------
Private Sub 镜像下区()
    Dim i As Long
    For i = 1 To 4
        Me.Range(名格(2, i)).Value = CStr(Me.Range(名格(1, i)).Value)
        Me.Range(数值格(2, i)).Value = Me.Range(数值格(1, i)).Value
    Next i
    刷新融合下拉 2
End Sub

'------------------------ 清空某个区的锁定开关 ------------------------
'------------------------ 紫卡命名匹配 ------------------------
' 取本区前 3 个正面词条，按「当前值 / 数据表基准值」从高到低排序（等价于按浮动系数排序，
' 因为同一张卡的 4 条词条共用同一个倾向和组合系数），再拼成紫卡名：
'   国服  ：武器名 核心1-核心2·核心3
'   国际服：武器名 前缀1-前缀2后缀3（只有 2 条正面时：武器名 前缀1-后缀2）
Private Function 命名格(ByVal blk As Long) As String
    If blk = 3 Then 命名格 = "H24" Else 命名格 = "A24"
End Function

Private Sub 更新命名(ByVal blk As Long)
    Dim dWs As Worksheet, cWs As Worksheet
    Dim i As Long, j As Long, n As Long, r As Long, vcol As Long, p As Long
    Dim wname As String, key As String, cat As String, disp As Double
    Dim raw As String, res As String
    Dim k1 As String, k2 As String, k3 As String
    Dim rw(1 To 3) As Long, rt(1 To 3) As Double, od(1 To 3) As Long
    Dim bs As Double, vv As Double, tmpL As Long
    Dim g As Boolean, ev As Boolean

    On Error GoTo EH
    If blk <> 2 And blk <> 3 Then Exit Sub

    Set dWs = Worksheets("数据")

    ' 1) 武器名（保留内部空格，不能用 压空格，否则 '嫣红 潘塔' 会变成 '嫣红潘塔'）
    If blk = 3 Then
        wname = 净名(CStr(Me.Range(自选武器格).Value))
        If Len(wname) = 0 Then
            raw = CStr(Me.Range(洗卡对象格).Value)
            p = InStr(raw, "|")
            If p > 0 Then wname = Trim$(Left$(raw, p - 1)) Else wname = Trim$(raw)
        End If
    Else
        raw = CStr(Me.Range(卡片格(2)).Value)
        p = InStr(raw, "|")
        If p > 0 Then wname = Trim$(Left$(raw, p - 1)) Else wname = Trim$(raw)
    End If

    If Len(wname) = 0 Then
        ev = Application.EnableEvents
        Application.EnableEvents = False
        Me.Range(命名格(blk)).Value = ""
        Application.EnableEvents = ev
        Exit Sub
    End If

    ' 2) 类别 -> 数据表基准值所在列
    解析武器 wname, key, disp, cat
    vcol = 0
    If Len(key) > 0 Then
        For j = 7 To 11
            If CStr(dWs.Cells(1, j).Value) = key Then vcol = j
        Next j
    End If

    ' 3) 收前 3 槽（正面词条），算 当前值 / 基准值
    n = 0
    If vcol > 0 Then
        For i = 1 To 3
            If Len(Trim$(CStr(Me.Range(名格(blk, i)).Value))) > 0 Then
                r = 单元格词条行(blk, i)
                If r > 0 Then
                    If IsNumeric(dWs.Cells(r, vcol).Value) Then
                        bs = 基准内部(r, dWs, vcol)
                        If bs > 0 Then
                            '   ★ 数值格存的是「游戏里看到的那个数」（派系是倍率、后坐力是负值），
                            '     算「当前值 / 基准值」之前要先还原成内部口径（加成的百分数）再比
                            vv = 内部值(r, CDbl(Val(CStr(Me.Range(数值格(blk, i)).Value))))
                            n = n + 1
                            rw(n) = r
                            rt(n) = vv / bs
                            od(n) = n
                        End If
                    End If
                End If
            End If
        Next i
    End If

    ' 4) 按占比从高到低排（最多 3 个，冒泡足够）
    For i = 1 To n - 1
        For j = i + 1 To n
            If rt(od(j)) > rt(od(i)) Then
                tmpL = od(i)
                od(i) = od(j)
                od(j) = tmpL
            End If
        Next j
    Next i

    ' 5) 语言：国服取核心词（D 列），其余取英文前缀（E 列）/ 后缀（F 列）
    g = False
    Set cWs = Worksheets("计算器")
    If StrComp(Trim$(CStr(cWs.Range("H1").Value)), "国服", vbTextCompare) = 0 Then g = True

    k1 = ""
    k2 = ""
    k3 = ""
    If n >= 1 Then
        If g Then k1 = CStr(dWs.Cells(rw(od(1)), 4).Value) Else k1 = CStr(dWs.Cells(rw(od(1)), 5).Value)
    End If
    If n >= 2 Then
        If g Then
            k2 = CStr(dWs.Cells(rw(od(2)), 4).Value)
        ElseIf n >= 3 Then
            k2 = CStr(dWs.Cells(rw(od(2)), 5).Value)
        Else
            k2 = CStr(dWs.Cells(rw(od(2)), 6).Value)
        End If
    End If
    If n >= 3 Then
        If g Then k3 = CStr(dWs.Cells(rw(od(3)), 4).Value) Else k3 = CStr(dWs.Cells(rw(od(3)), 6).Value)
    End If

    If n = 0 Then
        res = ""
    Else
        ' ★ 变体：紫卡名按**本体**来（圣装丧钟的卡叫「丧钟 XXXXX」）。
        '   数值仍然按变体自己的倾向算 —— 上面「解析武器」用的还是真名，只有拼名字换成本体名。
        res = 本体名(wname) & " " & k1
        If Len(k2) > 0 Then res = res & "-" & LCase$(k2)
        If Len(k3) > 0 Then
            If g Then res = res & "·"
            res = res & LCase$(k3)
        End If
    End If

    ev = Application.EnableEvents
    Application.EnableEvents = False
    Me.Range(命名格(blk)).Value = res
    Application.EnableEvents = ev
    Exit Sub

EH:
    Application.EnableEvents = True
End Sub

Private Sub 清锁定(ByVal blk As Long)
    Dim i As Long
    For i = 1 To 4
        If Len(锁格(blk, i)) > 0 Then Me.Range(锁格(blk, i)).Value = "不锁"
    Next i
End Sub

' 从 "武器名   |   倾向 x.xx   |   类别" 里取出武器名
Private Function 取武器名(ByVal s As String) As String
    Dim p As Long
    If Len(s) = 0 Then 取武器名 = "": Exit Function
    s = 压空格(s)
    p = InStr(s, "|")
    If p > 0 Then s = Left$(s, p - 1)
    取武器名 = s
End Function

'------------------------ 词条组合：四选一，概率均等 ------------------------
Private Sub 取组合(ByRef comboRow As Long, ByRef nPos As Long, ByRef nNeg As Long)
    Select Case Int(Rnd() * 4)
        Case 0
            comboRow = 10
            nPos = 2
            nNeg = 0
        Case 1
            comboRow = 11
            nPos = 2
            nNeg = 1
        Case 2
            comboRow = 12
            nPos = 3
            nNeg = 0
        Case Else
            comboRow = 13
            nPos = 3
            nNeg = 1
    End Select
End Sub

Private Function 组合行(ByVal nPos As Long, ByVal nNeg As Long) As Long
    If nPos >= 3 Then
        If nNeg = 1 Then 组合行 = 13 Else 组合行 = 12
    Else
        If nNeg = 1 Then 组合行 = 11 Else 组合行 = 10
    End If
End Function

'============================== 单元格地址 ==============================
' ---- 卡片（武器名文本所在格，合并区左上角）----
Private Function 卡片格(ByVal blk As Long) As String
    If blk = 2 Then 卡片格 = "A15" Else 卡片格 = "A4"
End Function

' ---- 属性名格（每槽一个，合并 2 列）----
Private Function 名格(ByVal blk As Long, ByVal idx As Long) As String
    If blk = 1 Then
        名格 = "B" & CStr(8 + idx)          ' B9  B10 B11 B12
    ElseIf blk = 3 Then
        名格 = "I" & CStr(17 + idx)         ' I18 I19 I20 I21
    Else
        名格 = "B" & CStr(19 + idx)         ' B20 B21 B22 B23
    End If
End Function

' ---- 数值格 ----
Private Function 数值格(ByVal blk As Long, ByVal idx As Long) As String
    If blk = 1 Then
        数值格 = "D" & CStr(8 + idx)        ' D9  D10 D11 D12
    ElseIf blk = 3 Then
        数值格 = "K" & CStr(17 + idx)       ' K18 K19 K20 K21
    Else
        数值格 = "D" & CStr(19 + idx)       ' D20 D21 D22 D23
    End If
End Function

' ---- 锁定开关格（① 开紫卡区没有锁定列，返回空串）----
Private Function 锁格(ByVal blk As Long, ByVal idx As Long) As String
    If blk = 1 Then
        锁格 = ""
    ElseIf blk = 3 Then
        锁格 = "L" & CStr(17 + idx)         ' L18 L19 L20 L21
    Else
        锁格 = "E" & CStr(19 + idx)         ' E20 E21 E22 E23
    End If
End Function

' ---- 融合下拉格 ----
Private Function 融选格(ByVal blk As Long, ByVal idx As Long) As String
    If blk = 3 Then
        If idx = 1 Then 融选格 = "I26" Else 融选格 = "I27"
    Else
        If idx = 1 Then 融选格 = "B26" Else 融选格 = "B27"
    End If
End Function

' ---- 融合下拉的列表源格（每格一份，互不干扰；藏在 O 列）----
' 直接把地址写死，但优先从下拉格的数据有效性公式里读，
' 这样以后删 / 插列也不会错位。
Private Function 融池格(ByVal blk As Long, ByVal slot As Long, ByVal idx As Long) As String
    Dim a As String, f As String, col As String
    Dim i As Long, r0 As Long, c As String

    a = 融选格(blk, slot)
    f = ""
    On Error Resume Next
    f = CStr(Me.Range(a).Validation.Formula1)
    On Error GoTo 0
    f = Replace(Replace(f, "$", ""), "=", "")
    If InStr(f, ":") > 0 Then f = Split(f, ":")(0)

    If Len(f) = 0 Then
        ' 兜底：老地址
        If blk = 3 Then r0 = 78 Else r0 = 68
        r0 = r0 + (slot - 1) * 4
        融池格 = "O" & CStr(r0 + idx - 1)
        Exit Function
    End If

    col = ""
    For i = 1 To Len(f)
        c = Mid$(f, i, 1)
        If c < "0" Or c > "9" Then col = col & c
    Next i
    r0 = Val(Mid$(f, Len(col) + 1))
    融池格 = col & CStr(r0 + idx - 1)
End Function

' ---- 产物栏 名 / 值 / 锁 ----
Private Function 融产名格(ByVal blk As Long, ByVal idx As Long) As String
    If blk = 3 Then
        融产名格 = "I" & CStr(29 + idx)
    Else
        融产名格 = "B" & CStr(29 + idx)
    End If
End Function

Private Function 融产值格(ByVal blk As Long, ByVal idx As Long) As String
    If blk = 3 Then
        融产值格 = "K" & CStr(29 + idx)
    Else
        融产值格 = "D" & CStr(29 + idx)
    End If
End Function

Private Function 融产锁格(ByVal blk As Long, ByVal idx As Long) As String
    If blk = 3 Then
        融产锁格 = "L" & CStr(29 + idx)
    Else
        融产锁格 = "E" & CStr(29 + idx)
    End If
End Function

' ---- 自选区：搜索输入 / 候选序号 / 已选武器 / 洗卡对象 ----
Private Function 搜索格() As String
    搜索格 = "I4"
End Function

Private Function 候选序号格() As String
    候选序号格 = "I5"
End Function

Private Function 自选武器格() As String
    自选武器格 = "I6"
End Function

Private Function 洗卡对象格() As String
    洗卡对象格 = "I8"
End Function

' 候选行号辅助（O88:O92，只给 I/J/K 11:15 用）
Private Function 候选辅助格(ByVal i As Long) As String
    候选辅助格 = "O" & CStr(87 + i)
End Function

' 候选表第 i 行（i = 1..5）的 名称 / 倾向 / 类别 格
Private Function 候选名格(ByVal i As Long) As String
    候选名格 = "I" & CStr(10 + i)
End Function

Private Function 候选倾向格(ByVal i As Long) As String
    候选倾向格 = "J" & CStr(10 + i)
End Function

Private Function 候选类别格(ByVal i As Long) As String
    候选类别格 = "K" & CStr(10 + i)
End Function

'============================== 读写 ==============================
' 写一条词条：属性名写名字格，数值写数值格（纯数字，不带 %）
' ★ v 是「加成的百分数」（内部口径）；k 是数据表行号（用来换算显示口径）。
'   写进格子的永远是「游戏里看到的那个数」：
'     派系 -> 倍率（+45 写成 1.45，格式 ×0.00）；后坐力 -> 翻符号（+90 写成 -90）。
'   派系多存两位小数：倍率只存 2 位等于百分数只到 0.5，来回换算会把数值磨掉一截。
Private Sub 写词条(ByVal blk As Long, ByVal idx As Long, ByVal nm As String, _
                   ByVal v As Double, Optional ByVal k As Long = 0)
    Dim gv As Double
    If k > 0 Then
        gv = 游戏值(k, v)
    Else
        gv = v
    End If
    With Me.Range(名格(blk, idx))
        .Value = nm
        .Font.ColorIndex = xlAutomatic
        .Font.Strikethrough = False
    End With
    With Me.Range(数值格(blk, idx))
        If k > 0 And 是否派系行(k) Then
            .Value = CDbl(Format(gv, "0.0000"))
            .NumberFormat = """×""0.00;""×""0.00;""×""0.00"
        Else
            .Value = CDbl(Format(gv, "0.00"))
            .NumberFormat = "+0.00;-0.00;0.00"
        End If
        .Font.ColorIndex = xlAutomatic
        .Font.Strikethrough = False
    End With
End Sub

Private Sub 清词条(ByVal blk As Long, ByVal idx As Long)
    Me.Range(名格(blk, idx)).MergeArea.ClearContents
    Me.Range(数值格(blk, idx)).MergeArea.ClearContents
    Me.Range(数值格(blk, idx)).NumberFormat = "+0.00;-0.00;0.00"
End Sub

' 从单元格的属性名反查词条在数据表的行号（找不到返回 0）
Private Function 单元格词条行(ByVal blk As Long, ByVal idx As Long) As Long
    单元格词条行 = 名字词条行(CStr(Me.Range(名格(blk, idx)).Value))
End Function

'============================== 下拉维护 ==============================
' 融合下拉：两个下拉各有一份列表源。
' 每个下拉的可选项 = 当前卡面 4 条词条名，去掉另一个下拉已选中的那条
Private Sub 刷新融合下拉(ByVal blk As Long)
    Dim s As Long, i As Long, oc As Long
    Dim other As String, nm As String
    Dim out(1 To 4) As String
    Dim mrg As Range, r0 As Long

    If blk = 1 Then Exit Sub

    For s = 1 To 2
        ' ★ 换列 / 另存之后下拉规则可能丢，这里顺手补回来（整块 MergeArea）
        If blk = 3 Then r0 = 78 Else r0 = 68
        r0 = r0 + (s - 1) * 4
        Set mrg = Me.Range(融选格(blk, s)).MergeArea
        On Error Resume Next
        If mrg.Validation.Type <> xlValidateList Then
            mrg.Validation.Delete
            mrg.Validation.Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, _
                 Operator:=xlBetween, Formula1:="=$O$" & CStr(r0) & ":$O$" & CStr(r0 + 3)
            mrg.Validation.IgnoreBlank = True
            mrg.Validation.InCellDropdown = True
            mrg.Validation.ShowError = False
        End If
        On Error GoTo 0

        If s = 1 Then
            other = Trim$(CStr(Me.Range(融选格(blk, 2)).Value))
        Else
            other = Trim$(CStr(Me.Range(融选格(blk, 1)).Value))
        End If

        oc = 0
        For i = 1 To 4
            nm = Trim$(CStr(Me.Range(名格(blk, i)).Value))
            If Len(nm) > 0 Then
                If Len(other) = 0 Then
                    If oc < 4 Then oc = oc + 1: out(oc) = nm
                ElseIf StrComp(nm, other, vbTextCompare) <> 0 Then
                    If oc < 4 Then oc = oc + 1: out(oc) = nm
                End If
            End If
        Next i

        For i = 1 To 4
            If i <= oc Then
                Me.Range(融池格(blk, s, i)).Value = out(i)
            Else
                Me.Range(融池格(blk, s, i)).Value = ""
            End If
        Next i
    Next s
End Sub

' 属性名下拉池：该武器类别在数据表 2~32 行里全部可用的词条名
Private Sub 刷新词条池(ByVal blk As Long, ByVal key As String)
    Dim dWs As Worksheet, pWs As Worksheet
    Dim k As Long, j As Long, n As Long, nN As Long, nameCol As Long, vcol As Long
    Dim baseCell As String, negCell As String, cat As String
    Dim k2 As String, d2 As Double

    If blk = 1 Then Exit Sub
    Set dWs = Worksheets("数据")
    Set pWs = Worksheets("参数")

    If blk = 3 Then
        baseCell = "O35"
        negCell = "Q35"
    Else
        baseCell = "O2"
        negCell = "Q2"
    End If

    nameCol = CLng(pWs.Range("B28").Value)
    If nameCol < 1 Or nameCol > 3 Then nameCol = 1

    k2 = ""
    d2 = 0
    cat = ""
    If blk = 3 Then
        解析武器 取武器名(CStr(Me.Range(洗卡对象格).Value)), k2, d2, cat
    Else
        解析武器 取武器名(CStr(Me.Range(卡片格(1)).Value)), k2, d2, cat
    End If

    vcol = 0
    For j = 7 To 11
        If CStr(dWs.Cells(1, j).Value) = key Then vcol = j
    Next j

    n = 0
    nN = 0
    If vcol > 0 Then
        For k = 抽取起 To 抽取止
            If IsNumeric(dWs.Cells(k, vcol).Value) Then
                ' 正面池：剔除「只能当负面出」的永负项
                If Not 是永负(k, cat) Then
                    n = n + 1
                    Me.Range(baseCell).Offset(n - 1, 0).Value = CStr(dWs.Cells(k, nameCol).Value)
                End If
                ' 负面池：只剔除「永正」项（永正只该出现在正面）
                If Not 是永正(k, cat) Then
                    nN = nN + 1
                    Me.Range(negCell).Offset(nN - 1, 0).Value = CStr(dWs.Cells(k, nameCol).Value)
                End If
            End If
        Next k
    End If
    For k = n + 1 To 31
        Me.Range(baseCell).Offset(k - 1, 0).Value = ""
    Next k
    For k = nN + 1 To 31
        Me.Range(negCell).Offset(k - 1, 0).Value = ""
    Next k

    ' ★ 卡面 4 个槽的下拉**整块重建**（自愈）：1~3 槽 -> 正面池，第 4 槽（负面槽）-> 负面池
    '   旧写法只改第 4 槽，而且把公式拼成了 "=$Q35$35" 这种缺冒号 / 缺结束行的坏地址，
    '   WPS 一点那个下拉就抛「运行错误 5：无效的过程调用或参数」。
    ' ★ 属性名格是**合并区**（B9:C9 / B23:C23 / I21:J21），必须整块 MergeArea 操作，
    '   只取左上角单格会拿不到 Validation（COM 会报「出现意外」）。
    Dim posF As String, negF As String
    posF = "=" & Me.Range(baseCell).Resize(31, 1).Address
    negF = "=" & Me.Range(negCell).Resize(31, 1).Address

    ' ① 开紫卡区 与 ② 洗卡区 共用同一份池（O2 / Q2），一起重建
    If blk = 2 Then
        刷新卡面下拉 1, posF, negF
        刷新卡面下拉 2, posF, negF
    ElseIf blk = 3 Then
        刷新卡面下拉 3, posF, negF
    End If
End Sub

' 给某个区 4 个属性名格重建下拉：第 1~3 槽用正面池，第 4 槽用负面池（已剔除永正项）
' 逐槽各建一条规则，避免「删一条共享规则把别的槽一起带走」
Private Sub 刷新卡面下拉(ByVal blk As Long, ByVal posF As String, ByVal negF As String)
    Dim i As Long
    Dim mrg As Range
    Dim f As String

    For i = 1 To 4
        If i = 4 Then f = negF Else f = posF
        Set mrg = Me.Range(名格(blk, i)).MergeArea
        On Error Resume Next
        mrg.Validation.Delete
        mrg.Validation.Add Type:=xlValidateList, AlertStyle:=xlValidAlertStop, _
             Operator:=xlBetween, Formula1:=f
        mrg.Validation.IgnoreBlank = True
        mrg.Validation.InCellDropdown = True
        mrg.Validation.ShowError = False
        On Error GoTo 0
    Next i
End Sub

'============================== 语言参数同步 ==============================
' ★ 计算器!H1「用语切换」是**唯一**的语言入口。
'   它一变，就把两个参数一起同步过去 —— 以前三个旋钮各管一段、要手改三处，
'   而且 参数!A29 的说明文字跟 语言命中() 的口径**是反的**（写「1国际服 / 2国服」，
'   实际是「1国服 / 2国际服」），照着说明填会把另一种语言的名字全滤掉，
'   典型症状：把 B29 填成 1（以为国际服）后，繁体名「迦楼罗之爪」一条都搜不出来。
'
'     H1=国服     -> B28=1（属性名列=国服）    B29=1（语言位 1=国服，M=2 简体）
'     H1=国际服   -> B28=2（属性名列=国际服）  B29=2（语言位 2=国际服，M=4 繁体）
'     H1=English  -> B28=3（属性名列=English） B29=0（语言位 0=English，M=1）
'
' ★ 2026-09-26 起：B28 / B29 本身已改成活公式（直接引用 计算器!$H$1），
'   这个 Sub 不再写参数，只负责语言变了以后把候选列表重刷一遍。
'
' ★ 必须是 Public：Worksheet_Change 内部调用不受可见性影响，但要能从外部
'   （验收脚本 / 以后加的按钮）直接 Run —— Private 过程 app.Run 找不到，
'   而且是**静默失败**，参数一个都不动，排查起来非常费劲。
Public Sub 同步语言参数()
    ' ★ 2026-09-26 改版：参数!B28 / B29 已经是**活公式**（直接跟 计算器!H1 走），
    '   这里绝对不能再往里写值 —— 写了就把公式冲掉，语言切换又会失灵。
    '   语言总开关是「计算器」表 H1（G1 标着「用语切换」），洗卡模拟器里没有这个控件。
    '   （更早的版本在这里写 B28/B29，是因为当时它们是手填死值；现在交给公式。）
    刷新候选
End Sub

'============================== 自选武器候选 ==============================
' 倾向表 M 列是「语言位掩码」：bit0(1)=English，bit1(2)=国服(简体)，bit2(4)=国际服(繁体)
' ★ 与 参数!B29 的对应：B29=0 -> English；B29=1 -> 国服；B29=2 -> 国际服。
'   （参数!A29 的说明文字「1国际服 / 2国服」是**写反的**，以这里为准；
'     该说明已在 2026-09-26 改成「0English / 1国服 / 2国际服」。）
Private Function 语言命中(ByVal lang As Long, ByVal m As Double) As Boolean
    Dim mm As Long
    mm = CLng(m) And 7
    ' ★★ 位含义跟着「倾向表 M 列」的表头来：1=英文名(C) / 2=国际服名(D) / 4=国服名(E)
    '   （M 的公式就是 COUNTIF(C)>0 ->1、COUNTIF(D)>0 ->2、COUNTIF(E)>0 ->4。）
    '   原来这里把 1/2 写反了：国服模式去挑 bit2（国际服名），国际服模式去挑 bit4（国服名）
    '   结果国服下搜「丧钟」跳出来「丧钟Prime」，与命名口径「国服名是圣装XXX、国际服名是XXX Prime」不符。
    If lang = 1 Then            ' 国服 -> bit4
        语言命中 = (mm >= 4)
    ElseIf lang = 2 Then        ' 国际服 -> bit2
        语言命中 = ((mm Mod 4) >= 2)
    Else                        ' English -> bit1
        语言命中 = ((mm Mod 2) = 1)
    End If
End Function

' 按「搜索名称」扫倾向表 J 列，取前 5 个命中写进候选表（I/J/K 11:15）
' 不用 FILTER，纯 VBA 扫描，改版式 / 换列都不会失效
Sub 刷新候选()
    Dim tWs As Worksheet, pWs As Worksheet
    Dim kw As String, lang As Long, nm As String, m As Double
    Dim r As Long, n As Long, i As Long, idx As Long
    Dim hit(1 To 5) As Long

    Set tWs = Worksheets("倾向表")
    Set pWs = Worksheets("参数")

    kw = Trim$(CStr(Me.Range(搜索格).Value))
    ' ★ 参数!B29 的合法取值只有 0/1/2（0=English / 1=国服 / 2=国际服，见 同步语言参数()）。
    '   原来写的是 `If lang < 1 Or lang > 3 Then lang = 1`：范围写错，而且默认值 1
    '   会把 English(0) 强改成国服 —— 英文名一条都搜不出来。
    lang = CLng(Val(CStr(pWs.Range("B29").Value)))
    If lang < 0 Or lang > 2 Then lang = 1

    n = 0
    If Len(kw) > 0 Then
        For r = 2 To 1435
            nm = CStr(tWs.Cells(r, 10).Value)          ' J = 任意叫法
            If Len(nm) > 0 Then
                If InStr(1, nm, kw, vbTextCompare) > 0 Then
                    If IsNumeric(tWs.Cells(r, 13).Value) Then
                        m = CDbl(tWs.Cells(r, 13).Value)
                    Else
                        m = 0
                    End If
                    If 语言命中(lang, m) Then
                        n = n + 1
                        hit(n) = r
                        If n >= 5 Then Exit For
                    End If
                End If
            End If
        Next r
    End If

    If n > 5 Then n = 5
    Application.EnableEvents = False
    For i = 1 To 5
        If i <= n Then
            Me.Range(候选辅助格(i)).Value = hit(i)
            Me.Range(候选名格(i)).Value = 净名(CStr(tWs.Cells(hit(i), 10).Value))
            Me.Range(候选倾向格(i)).Value = CDbl(Val(CStr(tWs.Cells(hit(i), 11).Value)))
            Me.Range(候选类别格(i)).Value = CStr(tWs.Cells(hit(i), 12).Value)
        Else
            Me.Range(候选辅助格(i)).Value = ""
            Me.Range(候选名格(i)).Value = ""
            Me.Range(候选倾向格(i)).Value = ""
            Me.Range(候选类别格(i)).Value = ""
        End If
    Next i

    ' 候选序号超出命中数就收回最后一个
    If n = 0 Then
        Me.Range(候选序号格).Value = ""
    Else
        idx = CLng(Val(CStr(Me.Range(候选序号格).Value)))
        If idx < 1 Then idx = 1
        If idx > n Then
            idx = n
            Me.Range(候选序号格).Value = idx
        End If
    End If
    Application.EnableEvents = True
    Me.Calculate
    更新命名 3
End Sub

' 当前选中候选的武器名（按候选序号，不依赖 I6 的公式，任何时候都能取到）
Private Function 当前候选名() As String
    Dim idx As Long
    idx = CLng(Val(CStr(Me.Range(候选序号格).Value)))
    If idx < 1 Then idx = 1
    If idx > 5 Then idx = 5
    当前候选名 = 净名(CStr(Me.Range(候选名格(idx)).Value))
End Function

'============================== 事件 ==============================
' 卡面 / 下拉一变就刷新对应的池子
Private Sub Worksheet_Change(ByVal Target As Range)
    Dim blk As Long, i As Long
    Dim rng As Range

    On Error Resume Next
    If Target.Cells.Count > 16 Then Exit Sub

    ' ★ 改了「用语切换」-> 先同步 参数!B28 / B29，再重刷候选与命名
    If Not Application.Intersect(Target, Me.Range("H1")) Is Nothing Then
        同步语言参数        ' 内部已含 刷新候选
        Exit Sub
    End If

    ' 改了搜索名称 / 候选序号 -> 重刷候选列表
    If Not Application.Intersect(Target, Me.Range(搜索格 & "," & 候选序号格)) Is Nothing Then
        刷新候选
        Exit Sub
    End If

    ' 融合下拉互相排斥
    For blk = 2 To 3
        Set rng = Me.Range(融选格(blk, 1) & "," & 融选格(blk, 2))
        If Not Application.Intersect(Target, rng) Is Nothing Then
            刷新融合下拉 blk
            Exit Sub
        End If
    Next blk

    ' 手动改了属性名 -> 重刷融合下拉（卡面变了）
    For blk = 2 To 3
        For i = 1 To 4
            Set rng = Me.Range(名格(blk, i))
            If Not Application.Intersect(Target, rng) Is Nothing Then
                刷新融合下拉 blk
                更新命名 blk
                Exit Sub
            End If
        Next i
    Next blk

    ' 手动改了数值 -> 紫卡命名要跟着变
    For blk = 2 To 3
        For i = 1 To 3
            Set rng = Me.Range(数值格(blk, i))
            If Not Application.Intersect(Target, rng) Is Nothing Then
                更新命名 blk
                Exit Sub
            End If
        Next i
    Next blk
End Sub

