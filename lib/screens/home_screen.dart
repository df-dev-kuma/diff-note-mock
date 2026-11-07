import 'package:flutter/material.dart';

import '../store.dart';
import 'common.dart';
import 'new_note_screen.dart';
import 'note_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key, required this.store});
  final NoteStore store;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('DiffNote（仮）')),
      floatingActionButton: FloatingActionButton.extended(
        icon: const Icon(Icons.add),
        label: const Text('新しく記録する'),
        onPressed: () async {
          final note = await Navigator.push(
            context,
            MaterialPageRoute(builder: (_) => NewNoteScreen(store: store)),
          );
          if (note != null && context.mounted) {
            Navigator.push(context, MaterialPageRoute(builder: (_) => NoteScreen(store: store, note: note)));
          }
        },
      ),
      body: ListenableBuilder(
        listenable: store,
        builder: (context, _) => Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 720),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 96),
              children: [
                Text('ちょっとした変更を、言葉のまま履歴に残す',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.black54)),
                const SizedBox(height: 12),
                for (final n in store.notes)
                  Card(
                    child: ListTile(
                      leading: CircleAvatar(child: Icon(kindIcon(n.origin))),
                      title: Text(n.title),
                      subtitle: Text(
                          '${n.commits.length} 件の変更 ・ 最新: ${n.head.message}（${n.head.author}、${fmtTime(n.head.at)}）'),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => Navigator.push(
                          context, MaterialPageRoute(builder: (_) => NoteScreen(store: store, note: n))),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
