import 'package:diff_note_mock/services/fake_gemini.dart';
import 'package:diff_note_mock/store.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  final g = FakeGemini();
  final store = NoteStore();
  String body(String t) => store.notes.firstWhere((n) => n.title.startsWith(t)).body;

  test('seed', () {
    expect(body('肉じゃが'), contains('- 塩 小さじ1/2'));
    expect(body('肉じゃが'), contains('- 砂糖 大さじ2（少なめ）'));
    expect(body('町内会'), contains('- 公民館前'));
    expect(body('Trattoria'), contains('カルボナーラ  1,300円'));
    expect(body('Trattoria'), isNot(contains('パンナコッタ')));
  });

  test('rules', () {
    final cases = {
      ('肉じゃが', '醤油を大さじ2にしよう'): '- 醤油 大さじ2',
      ('肉じゃが', 'しょうがを追加して'): '- しょうが',
      ('肉じゃが', '砂糖を少し増やそう'): '- 砂糖 大さじ2（多め）',
      ('Trattoria', 'ペペロンチーノを1100円にして'): 'ペペロンチーノ  1,100円',
      ('Trattoria', 'ジェラート 550円を追加して'): 'ジェラート  550円',
      ('町内会', 'トングを追加して'): '- トング',
      ('町内会', '日時を11月30日（日） 8:30〜10:00に変更'): '- 11月30日（日） 8:30〜10:00',
      ('町内会', '次回までに確認しておくこと'): '## メモ',
    };
    cases.forEach((k, want) {
      final p = g.proposeEditSync(body(k.$1), k.$2);
      expect(p.newBody, contains(want), reason: k.$2);
      // ignore: avoid_print
      print('${k.$2} => ${p.message}');
    });
    final rm = g.proposeEditSync(body('町内会'), '軍手はいらない');
    expect(rm.newBody, isNot(contains('軍手')));
    const h = '## 申し送り\n- 山田さん：朝食後に血圧の薬\n- 夜勤担当：佐藤さん';
    expect(g.proposeEditSync(h, '夜勤担当を高橋さんに変更').newBody, contains('- 夜勤担当：高橋さん'));
    expect(g.proposeEditSync(h, '田中さん：夕食は刻み食を追加して').newBody, contains('- 田中さん：夕食は刻み食'));
  });
}
