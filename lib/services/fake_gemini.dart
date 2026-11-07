import 'package:intl/intl.dart';

import '../models.dart';

/// Gemini（Vertex AI）が返す想定の編集提案
class EditProposal {
  const EditProposal({required this.newBody, required this.message});
  final String newBody;
  final String message;
}

/// Vertex AI 上の Gemini のダミー実装。
///
/// 本番では「現在の本文＋発言」をプロンプトに渡し、新しい本文とコミットメッセージを
/// JSON で返してもらう想定。モックでは日本語の言い回しをいくつかの規則で解釈する。
class FakeGemini {
  static const _latency = Duration(milliseconds: 700);
  static final _yen = NumberFormat('#,###', 'ja');

  Future<EditProposal> proposeEdit(String body, String utterance) async {
    await Future.delayed(_latency);
    return proposeEditSync(body, utterance);
  }

  /// シード用に同期版も公開している
  EditProposal proposeEditSync(String body, String utterance) {
    final u = utterance.trim().replaceAll(RegExp(r'[。！!？?\s]+$'), '');
    final lines = body.split('\n');

    // 「X を Y に変更」
    final change = RegExp(
            r'^(.+?)(?:を|は)(.+?)に(?:して|する|しよう|変更|変える|変えて|なった|します|お願い)')
        .firstMatch(u);
    if (change != null) {
      final r = _change(lines, change[1]!.trim(), change[2]!.trim());
      if (r != null) return r;
    }

    // 「X を減らす / 増やす」
    final adjust = RegExp(r'^(.+?)を(?:少し|ちょっと|ひとつまみ)?(減らす|減らそう|減らして|少なめ|増やす|増やそう|増やして|多め)')
        .firstMatch(u);
    if (adjust != null) {
      final more = adjust[2]!.contains('増') || adjust[2]!.contains('多');
      final r = _annotate(lines, adjust[1]!.trim(), more ? '（多め）' : '（少なめ）');
      if (r != null) return r;
    }

    // 「X を追加」
    final add = RegExp(r'^(.+?)を(?:追加|足して|足す|入れて|入れる|加えて|加える)').firstMatch(u);
    if (add != null) return _add(lines, add[1]!.trim());

    // 「X はやめる / 削除」
    final remove = RegExp(r'^(.+?)(?:を|は)(?:なくす|なくして|削除|抜く|抜いて|消して|やめる|やめて|いらない|なし|中止)')
        .firstMatch(u);
    if (remove != null) {
      final r = _remove(lines, remove[1]!.trim());
      if (r != null) return r;
    }

    // 解釈できなければメモとして残す
    return _memo(lines, utterance.trim());
  }

  // --- 各操作 ---

  EditProposal? _change(List<String> lines, String key, String value) {
    final idx = _find(lines, key);
    if (idx == null) return null;
    var i = idx;
    // 見出しにヒットしたら、その直下の行を丸ごと書き換える
    final heading = lines[i].startsWith('## ') && i + 1 < lines.length;
    if (heading) i++;
    final before = lines[i];
    final after = heading
        ? (before.startsWith('- ') ? '- $value' : value)
        : _replaceValue(before, value);
    if (heading) {
      final out = [...lines]..[i] = after;
      return EditProposal(
        newBody: out.join('\n'),
        message: '${lines[idx].substring(3)}: ${_strip(before)} → $value',
      );
    }
    final out = [...lines]..[i] = after;
    return EditProposal(
      newBody: out.join('\n'),
      message: '${_label(before)}: ${_value(before)} → ${_value(after)}',
    );
  }

  String _replaceValue(String line, String value) {
    final price = RegExp(r'^(.*?)\s+([\d,]+円)$').firstMatch(line);
    final num = RegExp(r'^[\d,]+円?$');
    if (price != null && num.hasMatch(value)) {
      final n = int.parse(value.replaceAll(RegExp(r'[,円]'), ''));
      return '${price[1]}  ${_yen.format(n)}円';
    }
    final colon = RegExp(r'^(.*?[：:])\s*(.+)$').firstMatch(line);
    if (colon != null) return '${colon[1]}$value';
    final item = RegExp(r'^(- )(\S+)\s+(.+)$').firstMatch(line);
    if (item != null) return '${item[1]}${item[2]} $value';
    if (line.startsWith('- ')) return '- $value';
    return value;
  }

  EditProposal? _annotate(List<String> lines, String key, String note) {
    final i = _find(lines, key);
    if (i == null) return null;
    final base = lines[i].replaceAll(RegExp(r'（(多め|少なめ)）$'), '');
    final out = [...lines]..[i] = '$base$note';
    return EditProposal(
      newBody: out.join('\n'),
      message: '${_label(lines[i])}を${note.replaceAll(RegExp('[（）]'), '')}に',
    );
  }

  EditProposal _add(List<String> lines, String item) {
    final out = [...lines];
    final isPriced = RegExp(r'^(.*?)\s+([\d,]+円)$').firstMatch(item);
    String newLine;
    int at;
    if (isPriced != null) {
      newLine = '${isPriced[1]!.trim()}  ${isPriced[2]}';
      at = out.lastIndexWhere((l) => RegExp(r'[\d,]+円$').hasMatch(l)) + 1;
    } else {
      newLine = '- $item';
      // 「持ち物」「材料」などリストらしい見出しの末尾に入れる
      final h = out.indexWhere((l) =>
          l.startsWith('## ') && RegExp('持ち物|材料|買う|リスト|申し送り|必要').hasMatch(l));
      if (h >= 0) {
        at = h + 1;
        while (at < out.length && out[at].startsWith('- ')) {
          at++;
        }
      } else {
        at = out.lastIndexWhere((l) => l.startsWith('- ')) + 1;
      }
    }
    if (at <= 0) at = out.length;
    out.insert(at, newLine);
    return EditProposal(newBody: out.join('\n'), message: '「${_label(newLine)}」を追加');
  }

  EditProposal? _remove(List<String> lines, String key) {
    final i = _find(lines, key, skipHeadings: true);
    if (i == null) return null;
    final out = [...lines]..removeAt(i);
    return EditProposal(newBody: out.join('\n'), message: '「${_label(lines[i])}」を削除');
  }

  EditProposal _memo(List<String> lines, String utterance) {
    final out = [...lines];
    if (!out.contains('## メモ')) out.addAll(['', '## メモ']);
    out.add('- $utterance');
    return EditProposal(newBody: out.join('\n'), message: 'メモを追加');
  }

  int? _find(List<String> lines, String key, {bool skipHeadings = false}) {
    final candidates = {key, key.split('の').first, key.replaceAll(RegExp(r'\s'), '')};
    for (final k in candidates) {
      if (k.isEmpty) continue;
      for (var i = 0; i < lines.length; i++) {
        if (skipHeadings && lines[i].startsWith('## ')) continue;
        if (lines[i].contains(k)) return i;
      }
    }
    return null;
  }

  String _strip(String line) => line.replaceFirst(RegExp(r'^(## |- |\d+\. )'), '');

  String _label(String line) {
    final s = line.replaceFirst(RegExp(r'^(## |- |\d+\. )'), '');
    final price = RegExp(r'^(.*?)\s+[\d,]+円$').firstMatch(s);
    if (price != null) return price[1]!;
    final colon = RegExp(r'^(.*?)[：:]').firstMatch(s);
    if (colon != null) return colon[1]!;
    final item = RegExp(r'^(\S+)\s+').firstMatch(s);
    return item?[1] ?? s;
  }

  String _value(String line) {
    final s = line.replaceFirst(RegExp(r'^(## |- |\d+\. )'), '');
    final price = RegExp(r'([\d,]+円)$').firstMatch(s);
    if (price != null) return price[1]!;
    final colon = RegExp(r'[：:]\s*(.+)$').firstMatch(s);
    if (colon != null) return colon[1]!;
    final item = RegExp(r'^\S+\s+(.+)$').firstMatch(s);
    return item?[1] ?? s;
  }

  // --- initial commit 用 ---

  /// テキスト入力を本文に整える（本番では Gemini が見出しや箇条書きに構造化する）
  Future<String> structureText(String raw) async {
    await Future.delayed(_latency);
    final t = raw.trim();
    if (t.contains('\n')) return t;
    return t
        .split(RegExp('[。\n]'))
        .map((s) => s.trim())
        .where((s) => s.isNotEmpty)
        .map((s) => '- $s')
        .join('\n');
  }

  /// 文字起こし結果を本文に整える
  Future<String> structureTranscript(String transcript) async {
    await Future.delayed(_latency);
    final canned = _cannedStructure[transcript.trim()];
    if (canned != null) return canned;
    return structureText(transcript);
  }

  /// PDF から本文を抽出する（モックでは常にサンプルのメニュー表を返す）
  Future<String> extractFromPdf(String fileName) async {
    await Future.delayed(_latency);
    return sampleMenuBody;
  }

  /// 内容から出力 PDF のテンプレートを選ぶ（本番では Gemini に判断させる）
  ({DocTemplate template, String reason}) chooseTemplate(Note note) {
    final b = note.body;
    if (note.origin == InputKind.file) {
      return (
        template: DocTemplate.menu,
        reason: '元ファイル（${note.sourceFileName ?? 'PDF'}）のデザインに合わせました（モックでは固定テンプレート）',
      );
    }
    if (RegExp('材料|作り方|小さじ|大さじ').hasMatch(b)) {
      return (template: DocTemplate.recipe, reason: '材料と分量の記述があるため、レシピカードにしました');
    }
    if (RegExp('お知らせ|日時|集合|持ち物|場所').hasMatch(b)) {
      return (template: DocTemplate.notice, reason: '日時・場所・持ち物の記述があるため、掲示物の体裁にしました');
    }
    if (RegExp('申し送り|担当|さん[：:]').hasMatch(b)) {
      return (template: DocTemplate.handover, reason: '人ごとの連絡事項が並んでいるため、申し送りメモにしました');
    }
    return (template: DocTemplate.note, reason: '特定の形式が読み取れないため、シンプルなノートにしました');
  }

  static const sampleMenuBody = '''## 前菜
カプレーゼ  980円
生ハムとメロン  1,200円
## パスタ
カルボナーラ  1,200円
ペペロンチーノ  1,000円
ボロネーゼ  1,300円
## ドルチェ
ティラミス  650円
パンナコッタ  600円''';

  static const _cannedStructure = {
    '申し送りです。山田さんは朝食後に血圧の薬。鈴木さんは入浴を午後に変更。夜勤は佐藤さんが担当です。': '''## 申し送り
- 山田さん：朝食後に血圧の薬
- 鈴木さん：入浴は午後
- 夜勤担当：佐藤さん''',
  };
}
