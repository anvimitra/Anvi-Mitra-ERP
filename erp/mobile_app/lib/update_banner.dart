import 'package:flutter/material.dart';
import 'update_checker.dart';
import 'update_launcher.dart';

class UpdateBanner extends StatelessWidget {
  final AppUpdateInfo info;
  const UpdateBanner({super.key, required this.info});
  @override
  Widget build(BuildContext context) {
    if (!info.available && !info.required) return const SizedBox.shrink();
    final cs = Theme.of(context).colorScheme;
    return Card(
      margin: const EdgeInsets.only(bottom: 16),
      color: cs.primaryContainer,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(children: [
          Icon(info.required ? Icons.system_update : Icons.auto_awesome, color: cs.onPrimaryContainer),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(info.required ? 'Update required' : 'New version available', style: const TextStyle(fontWeight: FontWeight.w800)),
            Text('${info.latestVersion ?? 'Latest release'} is ready.', style: Theme.of(context).textTheme.bodySmall),
          ])),
          FilledButton(onPressed: () async {
            final ok = await UpdateLauncher.open(info.updateUrl);
            if (!ok && context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Update link is not configured yet.')));
          }, child: const Text('Update')),
        ]),
      ),
    );
  }
}
