import 'package:flutter/material.dart';
import 'package:printing/printing.dart';

import '../models.dart';
import '../pdf_export.dart';
import '../services/fake_gemini.dart';

/// 最新版を PDF でプレビュー・保存する。デザインは Gemini（ダミー）が内容から選ぶ。
class PdfScreen extends StatelessWidget {
  const PdfScreen({super.key, required this.note, required this.gemini});
  final Note note;
  final FakeGemini gemini;

  @override
  Widget build(BuildContext context) {
    final choice = gemini.chooseTemplate(note);
    return Scaffold(
      appBar: AppBar(title: Text('${note.title}（最新版）')),
      body: Column(children: [
        Material(
          color: Theme.of(context).colorScheme.secondaryContainer,
          child: ListTile(
            leading: const Icon(Icons.auto_awesome),
            title: Text('デザイン: ${choice.template.label}'),
            subtitle: Text(choice.reason),
          ),
        ),
        Expanded(
          child: PdfPreview(
            build: (format) => buildPdf(note, choice.template, format),
            pdfFileName: '${note.title}.pdf',
            canChangeOrientation: false,
            canDebug: false,
          ),
        ),
      ]),
    );
  }
}
