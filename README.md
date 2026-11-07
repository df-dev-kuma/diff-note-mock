# DiffNote（仮）モック

物事の「途中過程の差分」を、話した言葉・書いた言葉のまま git のように履歴管理するツールのモックです。
レシピの「塩をちょっと減らそう」、お知らせの「集合場所を変更」のような、ささいな変更を記録します。

デモ: https://df-dev-kuma.github.io/diff-note-mock/

## できること（モック）

- 音声 / テキスト / ファイル（PDF）で最初の版を作る
- 発言から差分を作り、確認（承認 / 修正 / 破棄）してから記録する
- 発言者・入力形態つきの履歴、過去の版へ戻す
- 最新版を PDF 出力。デザインは最初の入力や内容に合わせて変わる

## ダミーにしている部分

- 文字起こし（本番: Google Cloud Speech-to-Text）は定型文を返す
- Gemini（本番: Vertex AI 経由）は簡単な規則で発言を解釈する
- PDF の読み取りは常にサンプルのメニュー表を返す
- データはメモリ上のみ（リロードで消える）

## 開発

```sh
flutter pub get
flutter run -d chrome
flutter test
```

`main` に push すると GitHub Actions でビルドされ、GitHub Pages に公開されます。
