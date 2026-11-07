import 'dart:typed_data';

import 'package:intl/intl.dart';
import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import 'models.dart';

/// 本文を見出し付きのセクションに分ける
class Section {
  Section(this.heading);
  final String? heading;
  final List<String> lines = [];
}

List<Section> parseSections(String body) {
  final out = <Section>[Section(null)];
  for (final raw in body.split('\n')) {
    final l = raw.trimRight();
    if (l.startsWith('## ')) {
      out.add(Section(l.substring(3)));
    } else if (l.trim().isNotEmpty) {
      out.last.lines.add(l);
    }
  }
  return out.where((s) => s.heading != null || s.lines.isNotEmpty).toList();
}

String _plain(String l) => l.replaceFirst(RegExp(r'^(- |\d+\. )'), '');

/// 最新版だけを、テンプレートに応じたデザインで PDF にする
///
/// [fonts] は sans / sansBold / serif / serifBold の順。省略時は Google Fonts から取得する。
Future<Uint8List> buildPdf(Note note, DocTemplate template, PdfPageFormat format,
    {List<pw.Font>? fonts}) async {
  final fs = fonts ??
      await Future.wait([
        PdfGoogleFonts.notoSansJPRegular(),
        PdfGoogleFonts.notoSansJPBold(),
        PdfGoogleFonts.notoSerifJPRegular(),
        PdfGoogleFonts.notoSerifJPBold(),
      ]);
  final f = _Fonts(fs[0], fs[1], fs[2], fs[3]);

  final doc = pw.Document(title: note.title, author: note.head.author);
  final sections = parseSections(note.body);
  final updated = DateFormat('yyyy年M月d日').format(note.head.at);

  final page = switch (template) {
    DocTemplate.menu => _menu(note, sections, f, format),
    DocTemplate.recipe => _recipe(note, sections, f, format, updated),
    DocTemplate.notice => _notice(note, sections, f, format, updated),
    DocTemplate.handover => _handover(note, sections, f, format, updated),
    DocTemplate.note => _note(note, sections, f, format, updated),
  };
  doc.addPage(page);
  return doc.save();
}

class _Fonts {
  _Fonts(this.sans, this.sansBold, this.serif, this.serifBold);
  final pw.Font sans, sansBold, serif, serifBold;
}

// ---------- メニュー表（元 PDF のデザインを模した固定テンプレート） ----------

pw.Page _menu(Note note, List<Section> sections, _Fonts f, PdfPageFormat format) {
  const bg = PdfColor.fromInt(0xFF1F2B24);
  const gold = PdfColor.fromInt(0xFFC9A96E);
  const cream = PdfColor.fromInt(0xFFF3EBDD);
  final name = note.title.replaceAll(RegExp(r'\s*(ディナー|ランチ)?メニュー$'), '');
  final label = note.title.contains('ランチ') ? 'LUNCH' : note.title.contains('ディナー') ? 'DINNER' : 'MENU';

  return pw.Page(
    pageFormat: format,
    margin: pw.EdgeInsets.zero,
    theme: pw.ThemeData.withFont(base: f.serif, bold: f.serifBold),
    build: (_) => pw.Container(
      color: bg,
      padding: const pw.EdgeInsets.all(28),
      child: pw.Container(
        decoration: pw.BoxDecoration(border: pw.Border.all(color: gold, width: 1)),
        padding: const pw.EdgeInsets.symmetric(horizontal: 48, vertical: 40),
        child: pw.Column(children: [
          pw.Text('— $label —', style: pw.TextStyle(color: gold, fontSize: 10, letterSpacing: 4)),
          pw.SizedBox(height: 10),
          pw.Text(name, style: pw.TextStyle(color: cream, fontSize: 30, fontWeight: pw.FontWeight.bold)),
          pw.SizedBox(height: 6),
          pw.Container(width: 60, height: 1, color: gold),
          pw.SizedBox(height: 28),
          for (final s in sections) ...[
            if (s.heading != null)
              pw.Padding(
                padding: const pw.EdgeInsets.only(bottom: 10, top: 6),
                child: pw.Text(s.heading!, style: pw.TextStyle(color: gold, fontSize: 15, letterSpacing: 6)),
              ),
            for (final l in s.lines) _menuItem(l, cream, gold),
            pw.SizedBox(height: 18),
          ],
          pw.Spacer(),
          pw.Text('表示価格は税込です', style: pw.TextStyle(color: gold, fontSize: 8)),
        ]),
      ),
    ),
  );
}

pw.Widget _menuItem(String line, PdfColor text, PdfColor accent) {
  final m = RegExp(r'^(.*?)\s+([\d,]+円)$').firstMatch(_plain(line));
  final name = m?[1] ?? _plain(line);
  final price = m?[2] ?? '';
  return pw.Padding(
    padding: const pw.EdgeInsets.symmetric(vertical: 4),
    child: pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.end, children: [
      pw.Text(name, style: pw.TextStyle(color: text, fontSize: 12)),
      pw.Expanded(
        child: pw.Padding(
          padding: const pw.EdgeInsets.symmetric(horizontal: 6),
          child: pw.Text('·' * 80, maxLines: 1, overflow: pw.TextOverflow.clip,
              style: pw.TextStyle(color: accent, fontSize: 9)),
        ),
      ),
      pw.Text(price, style: pw.TextStyle(color: text, fontSize: 12)),
    ]),
  );
}

// ---------- レシピカード ----------

pw.Page _recipe(Note note, List<Section> sections, _Fonts f, PdfPageFormat format, String updated) {
  const paper = PdfColor.fromInt(0xFFFFF8EE);
  const accent = PdfColor.fromInt(0xFFC0583A);
  const ink = PdfColor.fromInt(0xFF3B2F2A);
  return pw.Page(
    pageFormat: format,
    margin: pw.EdgeInsets.zero,
    theme: pw.ThemeData.withFont(base: f.sans, bold: f.sansBold),
    build: (_) => pw.Container(
      color: paper,
      padding: const pw.EdgeInsets.all(44),
      child: pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
        pw.Text('RECIPE', style: pw.TextStyle(color: accent, fontSize: 10, letterSpacing: 3)),
        pw.Text(note.title, style: pw.TextStyle(color: ink, fontSize: 24, fontWeight: pw.FontWeight.bold)),
        pw.SizedBox(height: 4),
        pw.Text('最終更新 $updated ・ ${note.authors.join('、')}', style: const pw.TextStyle(color: PdfColors.grey700, fontSize: 9)),
        pw.Divider(color: accent, thickness: 2),
        pw.SizedBox(height: 10),
        for (final s in sections) ...[
          if (s.heading != null)
            pw.Container(
              margin: const pw.EdgeInsets.only(top: 10, bottom: 8),
              padding: const pw.EdgeInsets.symmetric(horizontal: 10, vertical: 3),
              decoration: const pw.BoxDecoration(color: accent, borderRadius: pw.BorderRadius.all(pw.Radius.circular(10))),
              child: pw.Text(s.heading!, style: pw.TextStyle(color: PdfColors.white, fontSize: 11, fontWeight: pw.FontWeight.bold)),
            ),
          for (final (i, l) in s.lines.indexed) _recipeLine(l, i, ink, accent),
        ],
      ]),
    ),
  );
}

pw.Widget _recipeLine(String l, int i, PdfColor ink, PdfColor accent) {
  final step = RegExp(r'^(\d+)\. (.+)$').firstMatch(l);
  if (step != null) {
    return pw.Padding(
      padding: const pw.EdgeInsets.symmetric(vertical: 4),
      child: pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
        pw.Container(
          width: 18, height: 18, alignment: pw.Alignment.center,
          decoration: pw.BoxDecoration(shape: pw.BoxShape.circle, border: pw.Border.all(color: accent)),
          child: pw.Text(step[1]!, style: pw.TextStyle(color: accent, fontSize: 9)),
        ),
        pw.SizedBox(width: 8),
        pw.Expanded(child: pw.Text(step[2]!, style: pw.TextStyle(color: ink, fontSize: 11))),
      ]),
    );
  }
  final item = RegExp(r'^(\S+)\s+(.+)$').firstMatch(_plain(l));
  return pw.Container(
    padding: const pw.EdgeInsets.symmetric(vertical: 5, horizontal: 4),
    decoration: const pw.BoxDecoration(border: pw.Border(bottom: pw.BorderSide(color: PdfColors.grey300, width: 0.5))),
    child: pw.Row(children: [
      pw.Expanded(child: pw.Text(item?[1] ?? _plain(l), style: pw.TextStyle(color: ink, fontSize: 11))),
      pw.Text(item?[2] ?? '', style: pw.TextStyle(color: ink, fontSize: 11)),
    ]),
  );
}

// ---------- お知らせ・掲示物 ----------

pw.Page _notice(Note note, List<Section> sections, _Fonts f, PdfPageFormat format, String updated) {
  const accent = PdfColor.fromInt(0xFF2F5D8A);
  return pw.Page(
    pageFormat: format,
    margin: const pw.EdgeInsets.all(48),
    theme: pw.ThemeData.withFont(base: f.sans, bold: f.sansBold),
    build: (_) => pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.stretch, children: [
      pw.Align(alignment: pw.Alignment.centerRight, child: pw.Text(updated, style: const pw.TextStyle(fontSize: 10))),
      pw.SizedBox(height: 20),
      pw.Container(
        padding: const pw.EdgeInsets.symmetric(vertical: 14),
        decoration: const pw.BoxDecoration(border: pw.Border(top: pw.BorderSide(color: accent, width: 3), bottom: pw.BorderSide(color: accent, width: 3))),
        child: pw.Text(note.title, textAlign: pw.TextAlign.center, style: pw.TextStyle(fontSize: 24, fontWeight: pw.FontWeight.bold)),
      ),
      pw.SizedBox(height: 30),
      pw.Table(
        border: pw.TableBorder.all(color: PdfColors.grey600, width: 0.6),
        columnWidths: const {0: pw.FixedColumnWidth(110), 1: pw.FlexColumnWidth()},
        children: [
          for (final s in sections)
            pw.TableRow(children: [
              pw.Container(
                color: const PdfColor.fromInt(0xFFE6EEF6),
                padding: const pw.EdgeInsets.all(10),
                child: pw.Text(s.heading ?? '', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 12)),
              ),
              pw.Padding(
                padding: const pw.EdgeInsets.all(10),
                child: pw.Text(s.lines.map(_plain).join('\n'), style: const pw.TextStyle(fontSize: 12, lineSpacing: 4)),
              ),
            ]),
        ],
      ),
      pw.Spacer(),
      pw.Text('作成: ${note.authors.join('、')}', textAlign: pw.TextAlign.right, style: const pw.TextStyle(fontSize: 10)),
    ]),
  );
}

// ---------- 申し送り・連絡メモ ----------

pw.Page _handover(Note note, List<Section> sections, _Fonts f, PdfPageFormat format, String updated) {
  const accent = PdfColor.fromInt(0xFF3D7A5A);
  return pw.Page(
    pageFormat: format,
    margin: const pw.EdgeInsets.all(40),
    theme: pw.ThemeData.withFont(base: f.sans, bold: f.sansBold),
    build: (_) => pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
      pw.Row(children: [
        pw.Expanded(child: pw.Text(note.title, style: pw.TextStyle(fontSize: 20, fontWeight: pw.FontWeight.bold))),
        pw.Text('$updated 時点', style: const pw.TextStyle(fontSize: 10, color: PdfColors.grey700)),
      ]),
      pw.SizedBox(height: 4),
      pw.Text('話した内容から作成 ・ 記録者: ${note.authors.join('、')}', style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey700)),
      pw.SizedBox(height: 16),
      for (final s in sections) ...[
        if (s.heading != null)
          pw.Text(s.heading!, style: pw.TextStyle(color: accent, fontSize: 12, fontWeight: pw.FontWeight.bold)),
        pw.SizedBox(height: 6),
        for (final l in s.lines) _handoverRow(l, accent),
        pw.SizedBox(height: 12),
      ],
    ]),
  );
}

pw.Widget _handoverRow(String l, PdfColor accent) {
  final m = RegExp(r'^(.*?)[：:]\s*(.+)$').firstMatch(_plain(l));
  return pw.Container(
    margin: const pw.EdgeInsets.only(bottom: 6),
    padding: const pw.EdgeInsets.all(10),
    decoration: pw.BoxDecoration(
      color: const PdfColor.fromInt(0xFFF1F7F3),
      border: pw.Border(left: pw.BorderSide(color: accent, width: 3)),
    ),
    child: pw.Row(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
      pw.SizedBox(width: 90, child: pw.Text(m?[1] ?? '', style: pw.TextStyle(fontWeight: pw.FontWeight.bold, fontSize: 11))),
      pw.Expanded(child: pw.Text(m?[2] ?? _plain(l), style: const pw.TextStyle(fontSize: 11))),
    ]),
  );
}

// ---------- シンプルなノート ----------

pw.Page _note(Note note, List<Section> sections, _Fonts f, PdfPageFormat format, String updated) {
  return pw.Page(
    pageFormat: format,
    margin: const pw.EdgeInsets.all(48),
    theme: pw.ThemeData.withFont(base: f.sans, bold: f.sansBold),
    build: (_) => pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
      pw.Text(note.title, style: pw.TextStyle(fontSize: 20, fontWeight: pw.FontWeight.bold)),
      pw.Text(updated, style: const pw.TextStyle(fontSize: 9, color: PdfColors.grey700)),
      pw.Divider(),
      for (final s in sections) ...[
        if (s.heading != null)
          pw.Padding(
            padding: const pw.EdgeInsets.only(top: 8, bottom: 4),
            child: pw.Text(s.heading!, style: pw.TextStyle(fontSize: 13, fontWeight: pw.FontWeight.bold)),
          ),
        for (final l in s.lines)
          pw.Container(
            padding: const pw.EdgeInsets.symmetric(vertical: 5),
            decoration: const pw.BoxDecoration(border: pw.Border(bottom: pw.BorderSide(color: PdfColors.blue100, width: 0.5))),
            child: pw.Text(l.startsWith('- ') ? '・${_plain(l)}' : l, style: const pw.TextStyle(fontSize: 11)),
          ),
      ],
    ]),
  );
}
