import 'package:flutter/material.dart';

import '../diff.dart';
import '../models.dart';
import '../services/fake_gemini.dart';
import '../services/fake_stt.dart';
import '../store.dart';
import 'common.dart';
import 'pdf_screen.dart';
import 'voice_capture.dart';

/// 対象 1 件の画面: 最新版・入力欄・履歴
class NoteScreen extends StatefulWidget {
  const NoteScreen({super.key, required this.store, required this.note});
  final NoteStore store;
  final Note note;

  @override
  State<NoteScreen> createState() => _NoteScreenState();
}

class _NoteScreenState extends State<NoteScreen> {
  final _stt = FakeSpeechToText();
  final _input = TextEditingController();
  late String _author = widget.note.authors.last;
  var _kind = InputKind.voice;
  var _busy = false;

  Note get note => widget.note;
  NoteStore get store => widget.store;

  Future<void> _propose() async {
    final utterance = _input.text.trim();
    if (utterance.isEmpty) return;
    setState(() => _busy = true);
    final p = await store.gemini.proposeEdit(note.body, utterance);
    if (!mounted) return;
    setState(() => _busy = false);
    final result = await showDialog<EditProposal>(
      context: context,
      builder: (_) => _ReviewDialog(before: note.body, proposal: p, utterance: utterance, author: _author),
    );
    if (result == null) return;
    store.commit(note,
        author: _author, message: result.message, body: result.newBody, inputKind: _kind, utterance: utterance);
    _input.clear();
  }

  Future<void> _addAuthor() async {
    final c = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('発言者を追加'),
        content: TextField(controller: c, autofocus: true, decoration: const InputDecoration(hintText: '例: 祖母 / 夜勤の高橋さん')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('キャンセル')),
          FilledButton(onPressed: () => Navigator.pop(ctx, c.text.trim()), child: const Text('追加')),
        ],
      ),
    );
    if (name == null || name.isEmpty) return;
    store.addAuthor(note, name);
    setState(() => _author = name);
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: store,
      builder: (context, _) => Scaffold(
        appBar: AppBar(
          title: Text(note.title),
          actions: [
            Padding(
              padding: const EdgeInsets.only(right: 12),
              child: FilledButton.tonalIcon(
                onPressed: () => Navigator.push(
                    context, MaterialPageRoute(builder: (_) => PdfScreen(note: note, gemini: store.gemini))),
                icon: const Icon(Icons.picture_as_pdf),
                label: const Text('PDF で出力'),
              ),
            ),
          ],
        ),
        body: LayoutBuilder(builder: (context, c) {
          final current = _currentPane();
          final history = _historyPane();
          if (c.maxWidth >= 900) {
            return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Expanded(flex: 3, child: current),
              const VerticalDivider(width: 1),
              Expanded(flex: 2, child: history),
            ]);
          }
          return DefaultTabController(
            length: 2,
            child: Column(children: [
              const TabBar(tabs: [Tab(text: '最新版'), Tab(text: '履歴')]),
              Expanded(child: TabBarView(children: [current, history])),
            ]),
          );
        }),
      ),
    );
  }

  Widget _currentPane() {
    final t = Theme.of(context).textTheme;
    return Column(children: [
      Expanded(
        child: ListView(padding: const EdgeInsets.all(20), children: [
          Row(children: [
            Icon(kindIcon(note.origin), size: 16, color: Colors.black54),
            const SizedBox(width: 6),
            Text(
              '最初の入力: ${note.origin.label}${note.sourceFileName != null ? '（${note.sourceFileName}）' : ''}'
              ' ・ 最新 ${note.head.id}',
              style: t.bodySmall?.copyWith(color: Colors.black54),
            ),
          ]),
          const SizedBox(height: 8),
          BodyView(note.body),
        ]),
      ),
      _composer(),
    ]);
  }

  Widget _composer() {
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: scheme.surfaceContainerLow,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Row(children: [
            const Text('だれの発言？', style: TextStyle(fontSize: 12, color: Colors.black54)),
            const SizedBox(width: 8),
            Expanded(
              child: Wrap(spacing: 6, children: [
                for (final a in note.authors)
                  ChoiceChip(label: Text(a), selected: a == _author, onSelected: (_) => setState(() => _author = a)),
                ActionChip(avatar: const Icon(Icons.person_add, size: 16), label: const Text('追加'), onPressed: _addAuthor),
              ]),
            ),
          ]),
          const SizedBox(height: 10),
          Row(children: [
            SegmentedButton<InputKind>(
              showSelectedIcon: false,
              segments: [
                for (final k in [InputKind.voice, InputKind.text])
                  ButtonSegment(value: k, icon: Icon(kindIcon(k)), label: Text(k.label)),
              ],
              selected: {_kind},
              onSelectionChanged: (s) => setState(() => _kind = s.first),
            ),
            const SizedBox(width: 12),
            if (_kind == InputKind.voice)
              Expanded(
                child: VoiceCapture(
                  transcribe: () => _stt.transcribe(note: note),
                  onTranscript: (t) => setState(() => _input.text = t),
                ),
              ),
          ]),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(
              child: TextField(
                controller: _input,
                onSubmitted: (_) => _propose(),
                decoration: InputDecoration(
                  isDense: true,
                  border: const OutlineInputBorder(),
                  hintText: _kind == InputKind.voice ? '文字起こしがここに入ります' : '例: 塩を小さじ1/2にしよう / 軍手はいらない',
                ),
              ),
            ),
            const SizedBox(width: 8),
            FilledButton.icon(
              onPressed: _busy ? null : _propose,
              icon: _busy
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.difference),
              label: Text(_busy ? '考え中…' : '差分を作る'),
            ),
          ]),
        ]),
      ),
    );
  }

  Widget _historyPane() {
    final commits = note.commits.reversed.toList();
    return ListView.separated(
      padding: const EdgeInsets.symmetric(vertical: 8),
      itemCount: commits.length + 1,
      separatorBuilder: (_, i) => i == 0 ? const SizedBox.shrink() : const Divider(height: 1, indent: 56),
      itemBuilder: (context, i) {
        if (i == 0) {
          return Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
            child: Text('変更の履歴（${note.commits.length}）', style: Theme.of(context).textTheme.titleSmall),
          );
        }
        final c = commits[i - 1];
        final parent = note.parentOf(c);
        final stat = diffStat(lineDiff(parent?.body ?? '', c.body));
        return ListTile(
          leading: CircleAvatar(radius: 16, child: Icon(kindIcon(c.inputKind), size: 16)),
          title: Text(c.message),
          subtitle: Text('${c.author} ・ ${fmtTime(c.at)} ・ ${c.id}${c == note.head ? '（最新）' : ''}'),
          trailing: Text('+${stat.add} −${stat.del}', style: const TextStyle(fontSize: 12, color: Colors.black54)),
          onTap: () => showDialog(
            context: context,
            builder: (_) => _CommitDialog(note: note, commit: c, onRestore: () => store.restore(note, c, _author), author: _author),
          ),
        );
      },
    );
  }
}

/// コミット前の確認: 承認 / 修正 / 破棄
class _ReviewDialog extends StatefulWidget {
  const _ReviewDialog({required this.before, required this.proposal, required this.utterance, required this.author});
  final String before;
  final EditProposal proposal;
  final String utterance;
  final String author;

  @override
  State<_ReviewDialog> createState() => _ReviewDialogState();
}

class _ReviewDialogState extends State<_ReviewDialog> {
  late final _body = TextEditingController(text: widget.proposal.newBody);
  late final _message = TextEditingController(text: widget.proposal.message);
  var _editing = false;

  @override
  Widget build(BuildContext context) {
    final diff = lineDiff(widget.before, _body.text);
    return AlertDialog(
      title: const Text('この変更を記録しますか？'),
      content: SizedBox(
        width: 560,
        child: SingleChildScrollView(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            Text('${widget.author}「${widget.utterance}」', style: const TextStyle(color: Colors.black54)),
            const SizedBox(height: 12),
            TextField(controller: _message, decoration: const InputDecoration(labelText: '変更のまとめ（Gemini の提案）')),
            const SizedBox(height: 16),
            if (_editing)
              TextField(
                controller: _body,
                minLines: 6,
                maxLines: 16,
                onChanged: (_) => setState(() {}),
                decoration: const InputDecoration(border: OutlineInputBorder(), labelText: '本文を直接修正'),
              ),
            if (_editing) const SizedBox(height: 12),
            DiffView(diff),
          ]),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('破棄')),
        TextButton(onPressed: () => setState(() => _editing = !_editing), child: Text(_editing ? '修正を閉じる' : '修正')),
        FilledButton(
          onPressed: diff.every((l) => l.op == DiffOp.same)
              ? null
              : () => Navigator.pop(context, EditProposal(newBody: _body.text, message: _message.text.trim())),
          child: const Text('承認して記録'),
        ),
      ],
    );
  }
}

/// 過去のコミットの詳細と「この版に戻す」
class _CommitDialog extends StatelessWidget {
  const _CommitDialog({required this.note, required this.commit, required this.onRestore, required this.author});
  final Note note;
  final Commit commit;
  final VoidCallback onRestore;
  final String author;

  @override
  Widget build(BuildContext context) {
    final parent = note.parentOf(commit);
    final isHead = commit == note.head;
    return AlertDialog(
      title: Text(commit.message),
      content: SizedBox(
        width: 560,
        child: SingleChildScrollView(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
            Text('${commit.author} ・ ${fmtTime(commit.at)} ・ ${commit.inputKind.label}入力 ・ ${commit.id}',
                style: const TextStyle(color: Colors.black54, fontSize: 13)),
            if (commit.utterance != null) ...[
              const SizedBox(height: 8),
              Text('「${commit.utterance}」'),
            ],
            const SizedBox(height: 16),
            if (parent != null) ...[
              const Text('この変更', style: TextStyle(fontWeight: FontWeight.bold)),
              const SizedBox(height: 6),
              DiffView(lineDiff(parent.body, commit.body)),
              const SizedBox(height: 16),
            ],
            const Text('この時点の内容', style: TextStyle(fontWeight: FontWeight.bold)),
            BodyView(commit.body),
          ]),
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('閉じる')),
        if (!isHead)
          FilledButton.tonal(
            onPressed: () {
              onRestore();
              Navigator.pop(context);
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('${commit.id} の版に戻しました（$author の変更として記録）')),
              );
            },
            child: const Text('この版に戻す'),
          ),
      ],
    );
  }
}
