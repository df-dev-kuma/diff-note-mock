import '../models.dart';

/// Google Cloud Speech-to-Text のダミー実装。
///
/// 本番ではマイク音声を送って文字起こしを受け取る。モックでは録音を止めると
/// 対象の内容に合いそうな定型文を順番に返す（受け取った後で手直しもできる）。
class FakeSpeechToText {
  static const _latency = Duration(milliseconds: 900);
  final Map<String, int> _cursor = {};

  static const _initial = [
    '申し送りです。山田さんは朝食後に血圧の薬。鈴木さんは入浴を午後に変更。夜勤は佐藤さんが担当です。',
  ];

  static const _byKind = {
    'recipe': ['醤油を大さじ2にしよう', 'しょうがを追加して', '砂糖を少し増やそう'],
    'menu': ['ペペロンチーノを1100円にして', 'ジェラート 550円を追加して', 'カプレーゼはやめる'],
    'notice': ['トングを追加して', '軍手はいらない', '日時を11月30日（日） 8:30〜10:00に変更'],
    'handover': ['夜勤担当を高橋さんに変更', '田中さん：夕食は刻み食を追加して'],
    'other': ['次回までに確認しておくこと'],
  };

  Future<String> transcribe({Note? note}) async {
    await Future.delayed(_latency);
    final key = note == null ? 'initial' : _kindOf(note.body);
    final list = note == null ? _initial : _byKind[key]!;
    final i = _cursor[key] ?? 0;
    _cursor[key] = i + 1;
    return list[i % list.length];
  }

  String _kindOf(String body) {
    if (RegExp(r'[\d,]+円').hasMatch(body)) return 'menu';
    if (RegExp('材料|小さじ|大さじ').hasMatch(body)) return 'recipe';
    if (RegExp('日時|持ち物|集合').hasMatch(body)) return 'notice';
    if (RegExp('申し送り|担当').hasMatch(body)) return 'handover';
    return 'other';
  }
}
