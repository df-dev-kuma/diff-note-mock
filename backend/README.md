# backend（TypeScript）

新人・学生バイトが受けた指示の**食い違い**を見つけるバックエンドです。Gemini を呼ぶ #1〜#10 を実装しています。

## セットアップ

```sh
cd backend
npm install
cp .env.example .env   # GEMINI_API_KEY に Google AI Studio のキーを入れる
npm run check          # キー・モデル・生成・埋め込みの疎通確認
```

- 検証: `GEMINI_PROVIDER=aistudio` ＋ `GEMINI_API_KEY`（Google AI Studio）
- 本番: `GEMINI_PROVIDER=vertex` ＋ `GOOGLE_CLOUD_API_KEY`（GCP。Vertex AI と Speech-to-Text を許可したキー）
- Speech-to-Text（#6 の文字起こし）は GCP のキーが必要です。AI Studio のキーでは、文字起こし済みのテキストを渡して #6 の後半だけ試せます
- `.env` はコミットしないでください（`.gitignore` 済み）

## 試し方

| コマンド | 内容 |
|---|---|
| `npm run check` | 疎通確認。使えるモデル一覧も表示する |
| `npm run scenario` | 架空の定食屋バイトのメモ 4 件 → 食い違い検出 → 確認先の提案 → 答えの反映、を通しで実行 |
| `npm run scenario -- --embed` | 上と同じ。話題が少なくても埋め込みで絞り込む（#10 を試す） |
| `npm run eval:classify` | #3 の正答率（25 件の正解つきケース）と混同行列 |
| `npm run try -- text "店長に塩は小さじ1/2でいいって言われた"` | 1 件だけ試す。`file <パス>`（#5）、`transcript "<文>"`（#6 後半）、`voice <音声>`（#6、GCP キー必須）も可 |
| `npm start` | API サーバー（http://localhost:8787） |
| `npm test` | Gemini を呼ばずにパイプラインのつなぎを確認 |

モデルは `.env` の `GEMINI_MODEL` で変えられます。`GEMINI_MODEL=xxx npm run eval:classify` でモデルごとの正答率を比べられます。

## AI を呼ぶ箇所

| # | 内容 | ファイル |
|---|---|---|
| 1 | テキスト指示の抽出 | `src/ai/extract.ts` |
| 2 | 同じ話題のまとめ | `src/ai/topic.ts` |
| 3 | 食い違いの分類（矛盾 / 条件違い / 更新 / 補足 / 同じ） | `src/ai/classify.ts` |
| 4 | 確認先の提案＋質問文 | `src/ai/suggest.ts` |
| 5 | 写真・PDF の読み取り | `src/ai/extract.ts` |
| 6 | 音声メモ（Speech-to-Text → #1） | `src/ai/voice.ts` |
| 7 | 出力形式の選択（不要かも） | `src/ai/output.ts` |
| 8 | 答えの反映 | `src/ai/resolve.ts` |
| 9 | 人の特定（名前・役職の対応づけ） | `src/ai/person.ts` |
| 10 | 話題の候補の絞り込み（埋め込み） | `src/ai/topic.ts` |

流れは `src/pipeline.ts`：メモ → #1/#5/#6 → #9 → #10 → #2 → #3 →（矛盾なら）#4。答えを記録すると #8。

- #9 は名前・別名が完全一致すれば AI を呼びません
- #10 は話題数が `TOPIC_FULL_SCAN_LIMIT`（既定 30）以下なら AI を呼ばず全件を #2 に渡します
- #3 で「更新」と判定すると古い指示を自動で無効にします。「矛盾」のときだけ #4 を呼びます

## API

すべて JSON。レスポンスは `{ result, ai }`（`ai` はその呼び出しで使った AI の記録）。

| メソッド | パス | body |
|---|---|---|
| GET | `/health` | |
| GET | `/state` | |
| POST | `/reset` | |
| POST | `/persons` | `{ name, role?, aliases? }` |
| PATCH | `/persons/:id` | `{ role?, name? }`（#9 の推定役職を確定） |
| POST | `/memos/text` | `{ text, date? }` |
| POST | `/memos/file` | `{ data(base64), mimeType, name?, date? }` |
| POST | `/memos/voice` | `{ audio?: { data(base64), encoding?, sampleRateHertz? }, transcript?, date? }` |
| POST | `/conflicts/:id/answer` | `{ text, answeredBy?, date? }` |
| POST | `/output-format` | `{ topicId? }` |

データは `data/state.json` に保存されます（コミットされません）。
