enum DiffOp { same, add, del }

class DiffLine {
  const DiffLine(this.op, this.text);
  final DiffOp op;
  final String text;
}

/// 行単位の LCS diff。
List<DiffLine> lineDiff(String before, String after) {
  final a = before.isEmpty ? <String>[] : before.split('\n');
  final b = after.isEmpty ? <String>[] : after.split('\n');
  final n = a.length, m = b.length;
  final dp = List.generate(n + 1, (_) => List.filled(m + 1, 0));
  for (var i = n - 1; i >= 0; i--) {
    for (var j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] == b[j]
          ? dp[i + 1][j + 1] + 1
          : (dp[i + 1][j] >= dp[i][j + 1] ? dp[i + 1][j] : dp[i][j + 1]);
    }
  }
  final out = <DiffLine>[];
  var i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] == b[j]) {
      out.add(DiffLine(DiffOp.same, a[i]));
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.add(DiffLine(DiffOp.del, a[i++]));
    } else {
      out.add(DiffLine(DiffOp.add, b[j++]));
    }
  }
  while (i < n) {
    out.add(DiffLine(DiffOp.del, a[i++]));
  }
  while (j < m) {
    out.add(DiffLine(DiffOp.add, b[j++]));
  }
  return out;
}

({int add, int del}) diffStat(List<DiffLine> d) => (
      add: d.where((l) => l.op == DiffOp.add).length,
      del: d.where((l) => l.op == DiffOp.del).length,
    );
