/**
 * DiffNote ラボ: #1〜#10 をブラウザから試す検証画面。
 * Gemini はブラウザから直接、各自の Google AI Studio の API キーで呼ぶ（サーバーなし）。
 */
import { config, setConfig } from '../src/config.ts';
import { generateJson, traces } from '../src/gemini.ts';
import { Pipeline, type IngestResult } from '../src/pipeline.ts';
import { Store, type State } from '../src/store.ts';
import type { Conflict, Instruction } from '../src/types.ts';

// ---------- 保存 ----------

const KEY_STATE = 'diffnote-lab-state';
const KEY_SETTINGS = 'diffnote-lab-settings';

function load<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}
function persist(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* プライベートウィンドウなどでは保存しない */
  }
}

interface Settings {
  apiKey: string;
  model: string;
}
const MODELS = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'];
const settings: Settings = { apiKey: '', model: MODELS[0], ...load<Settings>(KEY_SETTINGS) };
setConfig({ provider: 'aistudio', geminiApiKey: settings.apiKey, model: settings.model });

const store = new Store(load<State>(KEY_STATE), (s) => persist(KEY_STATE, s));
const pipeline = new Pipeline(store);

// ---------- 画面の状態 ----------

let busy = '';
let error = '';
let notice = '';
let last: (IngestResult & { transcript?: string }) | null = null;
let tab: 'text' | 'file' | 'voice' = 'text';
let draft = '';
let draftDate = new Date().toISOString().slice(0, 10);
let file: File | null = null;

// ---------- 小さな DOM ヘルパー ----------

type Child = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, unknown> = {},
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false || v === null) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'value') (el as HTMLInputElement).value = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children.flat()) if (c) el.append(c);
  return el;
}
const $ = (id: string) => document.getElementById(id)!;
function mount(id: string, ...children: (Child | Child[])[]) {
  $(id).replaceChildren(...(children.flat().filter(Boolean) as (Node | string)[]));
}

// ---------- 実行の共通処理 ----------

async function run(label: string, fn: () => Promise<void>) {
  if (busy) return;
  if (!config.geminiApiKey) {
    error = '先に API キーを保存してください';
    render();
    return;
  }
  busy = label;
  error = '';
  notice = '';
  render();
  try {
    await fn();
  } catch (e) {
    error = friendly(e);
  } finally {
    busy = '';
    render();
  }
}

function friendly(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/API key not valid|API_KEY_INVALID/i.test(msg)) return 'API キーが正しくないようです。Google AI Studio で発行したキーか確認してください。';
  if (/上限に達しました/.test(msg)) return msg;
  if (/429|RESOURCE_EXHAUSTED/.test(msg)) return `回数の上限に達しました。少し待つか、別のモデルを選んでください。\n${msg.slice(0, 300)}`;
  if (/503|UNAVAILABLE/.test(msg)) return 'Gemini が混雑しています。少し待ってからもう一度試してください。';
  if (/not found|NOT_FOUND/.test(msg)) return `モデル「${config.model}」が使えないようです。別のモデルを選んでください。`;
  return msg;
}

const sourceLabel = { oral: '口頭', manual: 'マニュアル', unknown: '不明' } as const;
const kindLabel = {
  contradiction: '矛盾',
  conditional: '条件違い',
  update: '更新',
  supplement: '補足',
  same: '同じ',
} as const;

// ---------- 設定 ----------

function renderSettings() {
  const key = h('input', { type: 'password', value: settings.apiKey, placeholder: 'AIza...', autocomplete: 'off', id: 'apikey' });
  const custom = !MODELS.includes(settings.model);
  const model = h(
    'select',
    { id: 'model' },
    ...MODELS.map((m) => h('option', { value: m, selected: m === settings.model }, m)),
    h('option', { value: '__custom', selected: custom }, 'その他（入力）'),
  );
  const customInput = h('input', { value: custom ? settings.model : '', placeholder: 'モデル名', id: 'model-custom' });
  customInput.style.display = custom ? '' : 'none';
  model.addEventListener('change', () => (customInput.style.display = model.value === '__custom' ? '' : 'none'));

  const save = () => {
    settings.apiKey = key.value.trim();
    settings.model = model.value === '__custom' ? customInput.value.trim() || MODELS[0] : model.value;
    persist(KEY_SETTINGS, settings);
    setConfig({ geminiApiKey: settings.apiKey, model: settings.model });
    notice = '保存しました';
    error = '';
    render();
  };

  mount(
    'settings',
    h('h2', {}, '1. API キーとモデル'),
    h('div', { class: 'notice' },
      '自分の Google AI Studio の API キーを使います（',
      h('a', { href: 'https://aistudio.google.com/apikey', target: '_blank', rel: 'noopener' }, 'ここで発行'),
      '）。キーはこのブラウザにだけ保存され、Gemini 以外には送られません。無料枠では入力内容が Google の改善に使われることがあるので、',
      h('b', {}, '実在の人名や職場の情報は入れないでください'),
      '。'),
    h('div', { class: 'row' },
      h('div', {}, h('label', { for: 'apikey' }, 'API キー'), key),
      h('div', {}, h('label', { for: 'model' }, 'モデル'), model, customInput),
    ),
    h('div', { class: 'row', style: 'margin-top:10px' },
      h('button', { class: 'shrink primary', onclick: save }, '保存'),
      h('button', {
        class: 'shrink', disabled: !!busy,
        onclick: () => run('接続確認', async () => {
          const r = await generateJson<{ ok: boolean }>({
            step: '接続確認', system: 'JSON で答えてください。', prompt: 'ok を true にしてください。',
            schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
          });
          notice = r.ok ? `接続できました（${config.model}）` : '応答が想定と違いました';
        }),
      }, '接続確認'),
      h('span', { class: 'shrink muted' }, settings.apiKey ? `保存済み: …${settings.apiKey.slice(-4)}` : '未保存'),
    ),
    busy && h('p', { class: 'muted' }, `実行中: ${busy}…（混雑時は数十秒かかります）`),
    notice && h('p', { class: 'ok' }, notice),
    error && h('div', { class: 'err' }, error),
  );
}

// ---------- 入力 ----------

const SAMPLES = [
  { label: '初日（佐藤さん）', date: '2026-11-03', text: '初日。佐藤さんに教わったこと。味噌汁の塩は小さじ1。ご飯の大盛りは250gまで。洗った皿は右の棚に戻す。' },
  { label: '2日目（店長）', date: '2026-11-05', text: '店長に、味噌汁の塩は小さじ1/2でいいって言われた。あと土日は混むからご飯の大盛りは受けないって。' },
  { label: '3日目（音声・鈴木さん）', date: '2026-11-07', voice: true, text: '今日は鈴木さんと一緒だった。お客さんにしょっぱいって言われたことがあるから味付けは薄めにしてって。あとお皿は左の棚って言ってた気がする' },
  { label: '貼り紙', date: '2026-11-08', text: 'バックヤードの貼り紙: 11月10日から、ランチのご飯おかわりは1回まで無料。' },
];

function renderInput() {
  const text = h('textarea', {
    id: 'memo', value: draft,
    placeholder: tab === 'voice' ? '音声の文字起こし結果（Speech-to-Text は GCP のキーが必要なため、ここでは文字起こし済みの文を入れます）' : '例: 店長に、味噌汁の塩は小さじ1/2でいいって言われた',
    oninput: (e: Event) => (draft = (e.target as HTMLTextAreaElement).value),
  });
  const date = h('input', { type: 'date', value: draftDate, id: 'memo-date', onchange: (e: Event) => (draftDate = (e.target as HTMLInputElement).value) });
  const fileInput = h('input', {
    type: 'file', accept: 'image/*,application/pdf', id: 'memo-file',
    onchange: (e: Event) => (file = (e.target as HTMLInputElement).files?.[0] ?? null),
  });

  const tabBtn = (t: typeof tab, label: string) =>
    h('button', { class: 'small', 'aria-pressed': String(tab === t), onclick: () => ((tab = t), render()) }, label);

  const submit = () =>
    run('メモの記録', async () => {
      if (tab === 'file') {
        if (!file) throw new Error('ファイルを選んでください');
        const data = await toBase64(file);
        last = await pipeline.ingestFile({ data, mimeType: file.type || 'application/octet-stream', name: file.name }, draftDate);
      } else {
        if (!draft.trim()) throw new Error('メモを入力してください');
        last = tab === 'voice'
          ? await pipeline.ingestVoice({ transcript: draft.trim() }, draftDate)
          : await pipeline.ingestText(draft.trim(), draftDate);
        draft = '';
      }
      const open = last.conflicts.filter((c) => c.status === 'open').length;
      notice = `${last.instructions.length} 件の指示を記録しました${open ? `。食い違いが ${open} 件あります` : ''}`;
    });

  mount(
    'input',
    h('h2', {}, '2. メモを記録する'),
    h('div', { class: 'tabs' },
      tabBtn('text', 'テキスト（#1）'),
      tabBtn('file', '写真・PDF（#5）'),
      tabBtn('voice', '音声メモ（#6）'),
    ),
    tab === 'file'
      ? h('div', {}, h('label', { for: 'memo-file' }, '手書きメモの写真、マニュアル、貼り紙など'), fileInput)
      : h('div', {}, h('label', { for: 'memo' }, tab === 'voice' ? '文字起こし済みのテキスト' : 'メモ'), text),
    h('div', { class: 'row', style: 'margin-top:8px' },
      h('div', {}, h('label', { for: 'memo-date' }, 'メモの日付（「昨日」などはこの日が基準）'), date),
      h('button', { class: 'shrink primary', disabled: !!busy, onclick: submit }, '記録する'),
    ),
    tab !== 'file' && h('div', {},
      h('label', {}, 'サンプル（架空の定食屋バイト。上から順に入れると食い違いが出ます）'),
      h('div', { class: 'chips' },
        ...SAMPLES.map((s) =>
          h('button', {
            class: 'small',
            onclick: () => {
              draft = s.text;
              draftDate = s.date;
              tab = s.voice ? 'voice' : 'text';
              render();
            },
          }, s.label)),
      ),
    ),
  );
}

function toBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}

// ---------- 直近の結果 ----------

function instRow(i: Instruction) {
  return h('tr', {},
    h('td', {}, store.topic(i.topicId)?.name ?? ''),
    h('td', {}, `${i.target}: `, h('b', {}, i.value)),
    h('td', {}, i.condition ?? '—'),
    h('td', {}, store.label(i.personId, i.speakerMention)),
    h('td', {}, `${sourceLabel[i.source]} / ${i.date}`),
  );
}

function renderResult() {
  if (!last) {
    mount('result', h('h2', {}, '3. 読み取った結果'), h('p', { class: 'muted' }, 'メモを記録すると、取り出した指示と食い違いがここに出ます。'));
    return;
  }
  mount(
    'result',
    h('h2', {}, '3. 読み取った結果'),
    last.transcript && h('p', { class: 'muted' }, `文字起こし: ${last.transcript}`),
    h('div', { class: 'scroll' },
      h('table', {},
        h('thead', {}, h('tr', {}, ...['話題（#2）', '指示（#1）', '条件', '言った人（#9）', '出どころ / 日付'].map((t) => h('th', {}, t)))),
        h('tbody', {}, ...last.instructions.map(instRow)),
      ),
    ),
    last.instructions.length === 0 && h('p', { class: 'muted' }, '指示は見つかりませんでした。'),
    last.conflicts.length > 0 && h('h3', {}, '過去の指示との比較（#3）'),
    ...last.conflicts.map((c) => conflictCard(c, false)),
  );
}

// ---------- 食い違い ----------

function conflictCard(c: Conflict, withAnswer: boolean) {
  const a = store.instruction(c.a);
  const b = store.instruction(c.b);
  const who = (i: Instruction) => `${store.label(i.personId, i.speakerMention)}、${i.date}${i.condition ? `、${i.condition}` : ''}`;
  const answer = h('textarea', { placeholder: '例: 店長に聞いたら、11月から減塩にしたから小さじ1/2で合ってるって', style: 'min-height:64px' });
  const answeredBy = h('select', {},
    ...store.state.persons.map((p) => h('option', { value: p.name, selected: p.id === c.suggestion?.askPersonId }, p.name)),
    h('option', { value: '' }, 'その他'));

  return h('div', { class: `card ${c.status === 'open' ? 'open' : ''}` },
    h('div', {},
      h('span', { class: `badge b-${c.status === 'resolved' ? 'resolved' : c.kind}` }, c.status === 'resolved' ? '解決済み' : kindLabel[c.kind]),
      h('b', {}, store.topic(c.topicId)?.name ?? ''),
    ),
    h('div', { class: 'pair' },
      h('b', {}, 'A'), h('span', { class: a.status === 'active' ? '' : 'strike' }, `${a.value}（${who(a)}）`),
      h('b', {}, 'B'), h('span', { class: b.status === 'active' ? '' : 'strike' }, `${b.value}（${who(b)}）`),
    ),
    h('div', { class: 'muted' }, c.reason),
    c.suggestion && h('div', {},
      h('h3', {}, `聞く相手（#4）: ${c.suggestion.askName}`),
      h('div', { class: 'muted' }, c.suggestion.reason),
      h('div', { class: 'question' }, c.suggestion.question),
      h('button', {
        class: 'small',
        onclick: () => navigator.clipboard?.writeText(c.suggestion!.question).then(() => ((notice = '質問文をコピーしました'), render())),
      }, '質問文をコピー'),
    ),
    c.resolution && h('p', { class: 'ok' }, `結論（#8）: ${c.resolution.note}`),
    withAnswer && c.status === 'open' && h('div', {},
      h('h3', {}, '確認した答えを記録（#8）'),
      answer,
      h('div', { class: 'row', style: 'margin-top:6px' },
        h('div', {}, h('label', {}, '答えてくれた人'), answeredBy),
        h('button', {
          class: 'shrink primary', disabled: !!busy,
          onclick: () => run('答えの反映', async () => {
            if (!answer.value.trim()) throw new Error('答えを入力してください');
            const r = await pipeline.answer(c.id, answer.value.trim(), answeredBy.value || undefined, draftDate);
            notice = r.status === 'resolved' ? `解決しました: ${r.resolution?.note}` : `結論が読み取れませんでした: ${r.resolution?.note}`;
          }),
        }, '記録する'),
      ),
    ),
  );
}

function renderConflicts() {
  const open = store.state.conflicts.filter((c) => c.status === 'open');
  const others = store.state.conflicts.filter((c) => c.status !== 'open');
  mount(
    'conflicts',
    h('h2', {}, `確認が必要な食い違い（${open.length}）`),
    open.length === 0 && h('p', { class: 'muted' }, 'いまはありません。'),
    ...open.map((c) => conflictCard(c, true)),
    others.length > 0 && h('details', {},
      h('summary', {}, `確認不要・解決済み（${others.length}）`),
      ...others.map((c) => conflictCard(c, false)),
    ),
  );
}

// ---------- 話題ごとの今の正解 ----------

function renderTopics() {
  const summary = pipeline.summary();
  mount(
    'topics',
    h('h2', {}, '話題ごとの今の正解'),
    summary.length === 0 && h('p', { class: 'muted' }, 'まだありません。'),
    ...summary.map((t) =>
      h('div', { class: 'topic' },
        h('b', {}, t.topic),
        t.openConflicts.length > 0 && h('span', { class: 'badge b-contradiction', style: 'margin-left:6px' }, `未解決 ${t.openConflicts.length}`),
        ...t.current.map((c) => h('div', { class: 'muted' }, `・${c.text}${c.condition ? `（${c.condition}）` : ''} ／ ${c.by}`)),
      )),
    summary.length > 0 && h('button', {
      class: 'small', style: 'margin-top:8px', disabled: !!busy,
      onclick: () => run('出力形式の判定', async () => {
        const f = await pipeline.outputFormat();
        notice = `出力形式（#7）: ${f.format} ／ ${f.reason}`;
      }),
    }, '出力形式を判定（#7）'),
  );
}

// ---------- 人 ----------

function renderPeople() {
  const name = h('input', { placeholder: '名前（例: 田中）' });
  const role = h('input', { placeholder: '役職（例: 店長）' });
  mount(
    'people',
    h('h2', {}, '職場の人'),
    h('p', { class: 'muted' }, '役職は #4（誰に聞くか）の判断材料です。メモに出てきた新しい人は #9 が役職を推定します。'),
    h('div', { class: 'scroll' },
      h('table', {},
        h('tbody', {}, ...store.state.persons.map((p) => {
          const r = h('input', { value: p.role ?? '', style: 'padding:3px 8px' });
          return h('tr', {},
            h('td', {}, p.name, p.aliases.length ? h('div', { class: 'muted' }, `別名: ${p.aliases.join('、')}`) : null),
            h('td', {}, r, !p.roleConfirmed && h('div', { class: 'muted' }, '推定（未確認）')),
            h('td', {}, h('button', {
              class: 'small',
              onclick: () => {
                p.role = r.value.trim() || null;
                p.roleConfirmed = true;
                store.save();
                render();
              },
            }, '確定')),
          );
        })),
      ),
    ),
    h('div', { class: 'row', style: 'margin-top:8px' },
      name, role,
      h('button', {
        class: 'shrink',
        onclick: () => {
          if (!name.value.trim()) return;
          store.addPerson(name.value.trim(), role.value.trim() || null);
          store.save();
          render();
        },
      }, '追加'),
    ),
    store.state.persons.length === 0 && h('button', {
      class: 'small', style: 'margin-top:8px',
      onclick: () => {
        store.addPerson('田中', '店長', ['店長']);
        store.addPerson('佐藤', '社員');
        store.save();
        render();
      },
    }, 'サンプルの人を登録（田中 店長 / 佐藤 社員）'),
  );
}

// ---------- AI の記録 ----------

function renderLog() {
  const recent = traces.slice(-40).reverse();
  mount(
    'log',
    h('h2', {}, 'AI 呼び出しの記録'),
    h('div', { class: 'log' },
      recent.length === 0 ? 'まだありません' : recent.map((t) => h('div', {}, `${t.step}  ${t.ms}ms  ${t.model}`)),
    ),
    h('div', { class: 'row', style: 'margin-top:10px' },
      h('button', {
        class: 'shrink small',
        onclick: () => {
          const blob = new Blob([JSON.stringify(store.state, null, 2)], { type: 'application/json' });
          const a = h('a', { href: URL.createObjectURL(blob), download: 'diffnote-lab.json' });
          a.click();
        },
      }, 'データを JSON で保存'),
      h('button', {
        class: 'shrink small',
        onclick: () => {
          if (!confirm('記録したメモ・人・食い違いをすべて消します。よいですか？')) return;
          store.reset();
          last = null;
          render();
        },
      }, 'データを消す'),
    ),
  );
}

function render() {
  renderSettings();
  renderInput();
  renderResult();
  renderConflicts();
  renderTopics();
  renderPeople();
  renderLog();
}

render();
