import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../models.dart';
import '../services/fake_stt.dart';
import '../store.dart';
import 'common.dart';
import 'voice_capture.dart';

/// initial commit を作る画面。音声 / テキスト / ファイルの 3 通り。
class NewNoteScreen extends StatefulWidget {
  const NewNoteScreen({super.key, required this.store});
  final NoteStore store;

  @override
  State<NewNoteScreen> createState() => _NewNoteScreenState();
}

class _NewNoteScreenState extends State<NewNoteScreen> {
  final _stt = FakeSpeechToText();
  final _title = TextEditingController();
  final _author = TextEditingController(text: '自分');
  final _text = TextEditingController();
  var _kind = InputKind.text;
  String? _fileName;
  String? _structured;
  var _busy = false;

  bool get _ready =>
      _title.text.trim().isNotEmpty &&
      switch (_kind) {
        InputKind.file => _fileName != null,
        _ => _text.text.trim().isNotEmpty,
      };

  Future<void> _pickFile() async {
    final f = await FilePicker.pickFile(type: FileType.custom, allowedExtensions: ['pdf']);
    if (f != null) setState(() => _fileName = f.name);
  }

  Future<void> _structure() async {
    setState(() => _busy = true);
    final g = widget.store.gemini;
    final body = switch (_kind) {
      InputKind.text => await g.structureText(_text.text),
      InputKind.voice => await g.structureTranscript(_text.text),
      InputKind.file => await g.extractFromPdf(_fileName!),
    };
    setState(() {
      _structured = body;
      _busy = false;
    });
  }

  void _create() {
    final note = widget.store.create(
      title: _title.text.trim(),
      origin: _kind,
      author: _author.text.trim().isEmpty ? '自分' : _author.text.trim(),
      body: _structured!,
      utterance: _kind == InputKind.file ? null : _text.text.trim(),
      sourceFileName: _fileName,
    );
    Navigator.pop(context, note);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('新しく記録する')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 720),
          child: ListView(padding: const EdgeInsets.all(16), children: [
            TextField(
              controller: _title,
              decoration: const InputDecoration(labelText: '何についての記録？', hintText: '例: 祖母の煮物 / 来週の申し送り / 店のメニュー'),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 12),
            TextField(controller: _author, decoration: const InputDecoration(labelText: 'あなたの名前')),
            const SizedBox(height: 20),
            SegmentedButton<InputKind>(
              segments: [
                for (final k in InputKind.values)
                  ButtonSegment(value: k, icon: Icon(kindIcon(k)), label: Text(k.label)),
              ],
              selected: {_kind},
              onSelectionChanged: (s) => setState(() {
                _kind = s.first;
                _structured = null;
              }),
            ),
            const SizedBox(height: 16),
            ..._inputArea(),
            const SizedBox(height: 16),
            if (_structured == null)
              FilledButton.icon(
                onPressed: _ready && !_busy ? _structure : null,
                icon: _busy
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.auto_awesome),
                label: Text(_busy ? 'Gemini で整理中…' : 'Gemini で整理する'),
              )
            else ...[
              Text('整理した結果（これが最初の版になります）', style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 8),
              Card(child: Padding(padding: const EdgeInsets.all(16), child: BodyView(_structured!))),
              const SizedBox(height: 12),
              Row(children: [
                TextButton(onPressed: () => setState(() => _structured = null), child: const Text('やり直す')),
                const Spacer(),
                FilledButton(onPressed: _create, child: const Text('この内容で記録を始める')),
              ]),
            ],
          ]),
        ),
      ),
    );
  }

  List<Widget> _inputArea() => switch (_kind) {
        InputKind.text => [
            TextField(
              controller: _text,
              minLines: 6,
              maxLines: 14,
              onChanged: (_) => setState(() => _structured = null),
              decoration: const InputDecoration(
                border: OutlineInputBorder(),
                hintText: '思いつくまま書いてください。\n例: ## 材料\n- 鶏もも 300g\n- 醤油 大さじ2',
              ),
            ),
          ],
        InputKind.voice => [
            VoiceCapture(
              transcribe: () => _stt.transcribe(),
              onTranscript: (t) => setState(() {
                _text.text = t;
                _structured = null;
              }),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _text,
              minLines: 3,
              maxLines: 8,
              onChanged: (_) => setState(() => _structured = null),
              decoration: const InputDecoration(border: OutlineInputBorder(), labelText: '文字起こし（手直しできます）'),
            ),
          ],
        InputKind.file => [
            Wrap(spacing: 8, runSpacing: 8, children: [
              OutlinedButton.icon(onPressed: _pickFile, icon: const Icon(Icons.upload_file), label: const Text('PDF を選ぶ')),
              OutlinedButton.icon(
                onPressed: () => setState(() {
                  _fileName = 'luce_dinner_menu.pdf';
                  if (_title.text.isEmpty) _title.text = 'Trattoria Luce ランチメニュー';
                  _structured = null;
                }),
                icon: const Icon(Icons.restaurant_menu),
                label: const Text('サンプルのメニュー表を使う'),
              ),
            ]),
            const SizedBox(height: 8),
            Text(
              _fileName == null
                  ? 'モックでは、どの PDF を選んでもサンプルのメニュー表として読み取ります'
                  : '選択中: $_fileName',
              style: const TextStyle(color: Colors.black54, fontSize: 13),
            ),
          ],
      };
}
