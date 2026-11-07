import 'dart:math';

/// 入力形態。initial commit の入力形態が出力 PDF のデザインを左右する。
enum InputKind {
  voice('音声'),
  text('テキスト'),
  file('ファイル');

  const InputKind(this.label);
  final String label;
}

/// 1 つのコミット。本文のスナップショットを丸ごと持つ（モックなので単純化）。
class Commit {
  Commit({
    required this.author,
    required this.message,
    required this.body,
    required this.inputKind,
    this.utterance,
    this.parentId,
    DateTime? at,
  })  : id = _shortHash(),
        at = at ?? DateTime.now();

  final String id;
  final String? parentId;
  final String author;

  /// Gemini が要約したコミットメッセージ
  final String message;

  /// 元の発言（音声なら文字起こし結果）
  final String? utterance;
  final String body;
  final InputKind inputKind;
  final DateTime at;

  static final _rand = Random();
  static String _shortHash() =>
      List.generate(7, (_) => _rand.nextInt(16).toRadixString(16)).join();
}

/// 差分を管理する対象（git のリポジトリ相当）。例: 肉じゃがレシピ、回覧板のお知らせ。
class Note {
  Note({
    required this.title,
    required this.origin,
    required this.authors,
    this.sourceFileName,
  });

  final String title;

  /// initial commit の入力形態
  final InputKind origin;
  final String? sourceFileName;
  final List<String> authors;
  final List<Commit> commits = [];

  Commit get head => commits.last;
  String get body => head.body;

  Commit? parentOf(Commit c) {
    if (c.parentId == null) return null;
    return commits.firstWhere((x) => x.id == c.parentId);
  }
}

/// 出力 PDF のテンプレート
enum DocTemplate {
  menu('メニュー表（元ファイルのデザイン）'),
  recipe('レシピカード'),
  notice('お知らせ・掲示物'),
  handover('申し送り・連絡メモ'),
  note('シンプルなノート');

  const DocTemplate(this.label);
  final String label;
}
