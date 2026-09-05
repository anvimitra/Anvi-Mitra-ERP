import 'package:flutter/material.dart';
import 'dashboard_service.dart';
import 'parent_transport_card.dart';

class LiveDashboard extends StatefulWidget {
  final String role;
  const LiveDashboard({super.key, required this.role});

  @override
  State<LiveDashboard> createState() => _LiveDashboardState();
}

class _LiveDashboardState extends State<LiveDashboard> {
  final service = DashboardService();
  Map<String, dynamic>? data;
  String? error;
  bool loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    if (mounted) setState(() => loading = true);
    try {
      final d = widget.role == 'parent'
          ? await service.parentOverview()
          : widget.role == 'parent_notifications'
              ? await service.notifications()
              : await service.students();
      if (mounted) {
        setState(() {
          data = d;
          error = null;
          loading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          error = e.toString();
          loading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return const Center(child: CircularProgressIndicator());
    }
    if (error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(error!),
            const SizedBox(height: 12),
            FilledButton(onPressed: _load, child: const Text('Retry')),
          ],
        ),
      );
    }

    final rawChildren = data?['students'] ?? data?['children'];
    final children = rawChildren is List ? rawChildren : const <dynamic>[];

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'My Children',
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
          ),
          const SizedBox(height: 12),
          ...children.asMap().entries.map((entry) {
            final childData = Map<String, dynamic>.from(entry.value as Map);
            final id = childData['id']?.toString();
            final fees = childData['fees'] is Map
                ? Map<String, dynamic>.from(childData['fees'] as Map)
                : <String, dynamic>{};
            final attendance = childData['attendance'] is Map
                ? Map<String, dynamic>.from(childData['attendance'] as Map)
                : <String, dynamic>{};

            return TweenAnimationBuilder<double>(
              tween: Tween(begin: 0, end: 1),
              duration: Duration(milliseconds: 350 + entry.key * 90),
              builder: (context, value, child) {
                return Transform.translate(
                  offset: Offset(0, 16.0 * (1.0 - value)),
                  child: Opacity(opacity: value, child: child),
                );
              },
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${childData['fullName'] ?? childData['name'] ?? 'Student'}',
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 10),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            'Fees ₹${fees['outstanding'] ?? childData['outstanding'] ?? 0}',
                          ),
                          Text(
                            'Attendance ${attendance['attendancePercent'] ?? 0}%',
                          ),
                        ],
                      ),
                      if (id != null && widget.role == 'parent')
                        ParentTransportCard(studentId: id),
                    ],
                  ),
                ),
              ),
            );
          }),
          if (children.isEmpty)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(20),
                child: Text('No linked children found.'),
              ),
            ),
        ],
      ),
    );
  }
}
