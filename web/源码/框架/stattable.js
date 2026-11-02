  (function () {
    var Z = window.ZKDATA; if (!Z || !Z.stats) return;
    var WT = ['步枪', '霰弹', '手枪', '曲翼', '近战·天工造武'];
    var esc = ZKHTML.esc;
    var head = ['国服属性名', '国际服属性名', '英文属性名', '核心词', '英文前缀', '后缀', '步枪', '霰弹', '手枪', '曲翼', '近战·天工造武'];
    var html = '<thead><tr>' + head.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead><tbody>';
    Z.stats.forEach(function (s) {
      var v = s.v || [], isFac = ZKC.isFactionRow(s.row);
      function cell(i) {
        var val = v[i];
        if (val == null) return '<td>-</td>';
        if (isFac) return '<td>×' + val + '</td>';
        if (!ZKC.isPctRow(s.row)) return '<td>' + val + '</td>';
        return '<td>' + val + '%</td>';
      }
      html += '<tr>'
        + '<td>' + esc(s.cn) + '</td>'
        + '<td>' + esc(s.intl) + '</td>'
        + '<td>' + esc(s.en) + '</td>'
        + '<td>' + esc(s.core) + '</td>'
        + '<td>' + esc(s.pre) + '</td>'
        + '<td>' + esc(s.suf) + '</td>'
        + cell(0) + cell(1) + cell(2) + cell(3) + cell(4)
        + '</tr>';
    });
    html += '</tbody>';
    var t = document.getElementById('basvalTbl');
    if (t) t.innerHTML = html;
  })();
