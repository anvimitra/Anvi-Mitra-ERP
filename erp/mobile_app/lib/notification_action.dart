import 'package:flutter/material.dart';

class NotificationActionPage extends StatelessWidget {
  final Map<String, dynamic> action;
  const NotificationActionPage({super.key, required this.action});

  @override
  Widget build(BuildContext context) {
    final event = '${action['event'] ?? 'notifications'}';
    final data = action['data'] is Map
        ? Map<String, dynamic>.from(action['data'] as Map)
        : <String, dynamic>{};
    return Scaffold(
      appBar: AppBar(title: const Text('Notification')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Icon(_icon(event), size: 42),
                const SizedBox(height: 14),
                Text(_title(event), style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
                const SizedBox(height: 8),
                Text(_message(data)),
              ]),
            ),
          ),
          if (action['studentId'] != null) _row('Student ID', '${action['studentId']}'),
          if (action['invoiceId'] != null) _row('Invoice ID', '${action['invoiceId']}'),
          if (action['receiptNo'] != null) _row('Receipt No.', '${action['receiptNo']}'),
        ],
      ),
    );
  }

  Widget _row(String label, String value) => Card(child: ListTile(title: Text(label), subtitle: Text(value)));

  String _title(String event) {
    switch (event) {
      case 'fee_payment': return 'Fee Payment';
      case 'fee_invoice': return 'Fee Invoice';
      case 'attendance': return 'Attendance Update';
      default: return 'School Update';
    }
  }

  String _message(Map<String, dynamic> data) {
    final message = data['message'];
    if (message != null && '$message'.trim().isNotEmpty) return '$message';
    return 'You have a new update from your school.';
  }

  IconData _icon(String event) {
    switch (event) {
      case 'fee_payment':
      case 'fee_invoice': return Icons.receipt_long;
      case 'attendance': return Icons.fact_check;
      default: return Icons.notifications_active;
    }
  }
}
