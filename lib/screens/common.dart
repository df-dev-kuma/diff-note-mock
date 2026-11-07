import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../diff.dart';
import '../models.dart';

IconData kindIcon(InputKind k) => switch (k) {
      InputKind.voice => Icons.mic,
      InputKind.text => Icons.keyboard,
      InputKind.file => Icons.picture_as_pdf,
    };

String fmtTime(DateTime t) => DateFormat('M/d HH:mm').format(t);

/// 本文の簡易表示（## を見出しとして扱う）
class BodyView extends StatelessWidget {
  const BodyView(this.body, {super.key});
  final String body;

  @override
  Widget build(BuildContext context) {
    final t = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final l in body.split('\n'))
          if (l.startsWith('## '))
            Padding(
              padding: const EdgeInsets.only(top: 12, bottom: 4),
              child: Text(l.substring(3), style: t.titleSmall?.copyWith(fontWeight: FontWeight.bold)),
            )
          else if (l.trim().isNotEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Text(l.startsWith('- ') ? '・${l.substring(2)}' : l, style: t.bodyMedium),
            ),
      ],
    );
  }
}

/// 赤緑の行差分。same 行は前後 1 行だけ残して畳む
class DiffView extends StatelessWidget {
  const DiffView(this.lines, {super.key, this.context = 1});
  final List<DiffLine> lines;
  final int context;

  @override
  Widget build(BuildContext ctx) {
    final keep = List.filled(lines.length, false);
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].op != DiffOp.same) {
        for (var j = i - context; j <= i + context; j++) {
          if (j >= 0 && j < lines.length) keep[j] = true;
        }
      }
    }
    final rows = <Widget>[];
    var skipped = false;
    for (var i = 0; i < lines.length; i++) {
      if (!keep[i]) {
        if (!skipped) rows.add(const _Row(DiffLine(DiffOp.same, '⋯'), muted: true));
        skipped = true;
        continue;
      }
      skipped = false;
      rows.add(_Row(lines[i]));
    }
    if (lines.every((l) => l.op == DiffOp.same)) {
      return const Text('変更はありません');
    }
    return Container(
      decoration: BoxDecoration(
        border: Border.all(color: Colors.black12),
        borderRadius: BorderRadius.circular(8),
      ),
      clipBehavior: Clip.antiAlias,
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: rows),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row(this.line, {this.muted = false});
  final DiffLine line;
  final bool muted;

  @override
  Widget build(BuildContext context) {
    final (bg, mark, fg) = switch (line.op) {
      DiffOp.add => (const Color(0xFFE6F4EA), '+', const Color(0xFF1E6B34)),
      DiffOp.del => (const Color(0xFFFCE8E6), '−', const Color(0xFFA50E0E)),
      DiffOp.same => (Colors.transparent, ' ', muted ? Colors.black38 : Colors.black87),
    };
    return Container(
      color: bg,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
      child: Text('$mark  ${line.text}', style: TextStyle(color: fg, fontSize: 13, height: 1.5)),
    );
  }
}
