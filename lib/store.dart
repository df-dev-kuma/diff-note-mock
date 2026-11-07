import 'package:flutter/foundation.dart';

import 'models.dart';
import 'services/fake_gemini.dart';

/// メモリ上のストア。本番ではバックエンド（Go を検討中）が担う。
class NoteStore extends ChangeNotifier {
  NoteStore() {
    _seed();
  }

  final gemini = FakeGemini();
  final List<Note> notes = [];

  Note create({
    required String title,
    required InputKind origin,
    required String author,
    required String body,
    String? utterance,
    String? sourceFileName,
  }) {
    final note = Note(
      title: title,
      origin: origin,
      authors: [author],
      sourceFileName: sourceFileName,
    );
    note.commits.add(Commit(
      author: author,
      message: 'initial commit',
      body: body,
      inputKind: origin,
      utterance: utterance,
    ));
    notes.insert(0, note);
    notifyListeners();
    return note;
  }

  void commit(Note note, {
    required String author,
    required String message,
    required String body,
    required InputKind inputKind,
    String? utterance,
  }) {
    if (!note.authors.contains(author)) note.authors.add(author);
    note.commits.add(Commit(
      parentId: note.head.id,
      author: author,
      message: message,
      body: body,
      inputKind: inputKind,
      utterance: utterance,
    ));
    notifyListeners();
  }

  /// 過去版の内容を新しいコミットとして復元する（git revert / checkout の折衷）
  void restore(Note note, Commit target, String author) {
    commit(
      note,
      author: author,
      message: '${target.id} の版に戻す',
      body: target.body,
      inputKind: InputKind.text,
    );
  }

  void addAuthor(Note note, String name) {
    if (name.isEmpty || note.authors.contains(name)) return;
    note.authors.add(name);
    notifyListeners();
  }

  // --- サンプルデータ（分野をまたいで 3 件） ---

  void _seed() {
    final now = DateTime.now();
    Note seed(String title, InputKind origin, List<String> authors, String body,
        List<(String author, InputKind kind, String utterance)> edits,
        {String? file}) {
      final n = Note(title: title, origin: origin, authors: [...authors], sourceFileName: file);
      var t = now.subtract(Duration(days: edits.length + 3));
      n.commits.add(Commit(
          author: authors.first, message: 'initial commit', body: body, inputKind: origin, at: t));
      for (final (a, k, u) in edits) {
        t = t.add(const Duration(days: 1, hours: 3));
        final p = gemini.proposeEditSync(n.body, u);
        n.commits.add(Commit(
            parentId: n.head.id,
            author: a,
            message: p.message,
            body: p.newBody,
            inputKind: k,
            utterance: u,
            at: t));
      }
      return n;
    }

    notes.addAll([
      seed(
        '肉じゃが（母のレシピ）',
        InputKind.text,
        ['母', '自分'],
        '''## 材料（4人分）
- 牛肉 200g
- じゃがいも 3個
- 玉ねぎ 1個
- 醤油 大さじ3
- 砂糖 大さじ2
- 塩 小さじ1
## 作り方
1. 材料を一口大に切る
2. 牛肉を炒め、野菜を加える
3. 調味料を入れて20分煮る''',
        [
          ('自分', InputKind.voice, '塩を小さじ1/2にしよう'),
          ('母', InputKind.text, '砂糖を少し減らす'),
        ],
      ),
      seed(
        '町内会 清掃活動のお知らせ',
        InputKind.voice,
        ['会長', '副会長'],
        '''## 日時
- 11月23日（日） 8:30〜10:00
## 集合場所
- 中央公園 入口
## 持ち物
- 軍手
- ゴミ袋
## 連絡先
- 会長（3丁目）''',
        [
          ('副会長', InputKind.voice, '集合場所を公民館前に変更'),
        ],
      ),
      seed(
        'Trattoria Luce ディナーメニュー',
        InputKind.file,
        ['店長', 'シェフ'],
        FakeGemini.sampleMenuBody,
        [
          ('シェフ', InputKind.voice, 'カルボナーラを1300円にして'),
          ('店長', InputKind.text, 'パンナコッタはやめる'),
        ],
        file: 'luce_dinner_menu.pdf',
      ),
    ]);
  }
}
