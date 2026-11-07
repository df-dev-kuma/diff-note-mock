import 'dart:async';

import 'package:flutter/material.dart';

/// 録音ボタン。モックでは実際の録音はせず、停止すると [transcribe] の結果を返す。
class VoiceCapture extends StatefulWidget {
  const VoiceCapture({super.key, required this.transcribe, required this.onTranscript});
  final Future<String> Function() transcribe;
  final ValueChanged<String> onTranscript;

  @override
  State<VoiceCapture> createState() => _VoiceCaptureState();
}

enum _Phase { idle, recording, transcribing }

class _VoiceCaptureState extends State<VoiceCapture> {
  var _phase = _Phase.idle;
  var _secs = 0;
  Timer? _timer;

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _toggle() async {
    if (_phase == _Phase.idle) {
      setState(() {
        _phase = _Phase.recording;
        _secs = 0;
      });
      _timer = Timer.periodic(const Duration(seconds: 1), (_) => setState(() => _secs++));
    } else if (_phase == _Phase.recording) {
      _timer?.cancel();
      setState(() => _phase = _Phase.transcribing);
      final text = await widget.transcribe();
      if (!mounted) return;
      setState(() => _phase = _Phase.idle);
      widget.onTranscript(text);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final recording = _phase == _Phase.recording;
    return Row(children: [
      FilledButton.icon(
        style: FilledButton.styleFrom(backgroundColor: recording ? scheme.error : null),
        onPressed: _phase == _Phase.transcribing ? null : _toggle,
        icon: Icon(recording ? Icons.stop : Icons.mic),
        label: Text(recording ? '止める' : '話す'),
      ),
      const SizedBox(width: 12),
      Expanded(
        child: Text(
          switch (_phase) {
            _Phase.idle => 'ボタンを押して話してください（モック: 定型文が入ります）',
            _Phase.recording => '録音中… 0:${_secs.toString().padLeft(2, '0')}',
            _Phase.transcribing => 'Speech-to-Text で文字起こし中…',
          },
          style: TextStyle(color: recording ? scheme.error : Colors.black54, fontSize: 13),
        ),
      ),
    ]);
  }
}
