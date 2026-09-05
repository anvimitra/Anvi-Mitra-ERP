import 'package:flutter/material.dart';
import 'dashboard_service.dart';

class AdminDashboard extends StatefulWidget {
  final String role;
  const AdminDashboard({super.key, required this.role});

  @override
  State<AdminDashboard> createState() => _AdminDashboardState();
}

class _AdminDashboardState extends State<AdminDashboard> {
  final service = DashboardService();
  bool loading = true;
  String? error;
  Map<String, dynamic> data = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final d = await service.adminOverview();
      if (mounted) {
        setState(() {
          data = d;
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
      return Center(child: Text(error!));
    }

    final stats = data['stats'] is Map
        ? Map<String, dynamic>.from(data['stats'] as Map)
        : data;

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            '${widget.role.replaceAll('_', ' ')} Dashboard',
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                ),
          ),
          const SizedBox(height: 14),
          _grid(context, stats),
          const SizedBox(height: 18),
          const Card(
            child: ListTile(
              leading: Icon(Icons.insights),
              title: Text('School Analytics'),
              subtitle: Text(
                'Live attendance, fees, academics and operations overview',
              ),
              trailing: Icon(Icons.chevron_right),
            ),
          ),
        ],
      ),
    );
  }

  Widget _grid(BuildContext context, Map<String, dynamic> stats) {
    final items = [
      ['Students', stats['studentCount'] ?? stats['students'] ?? 0, Icons.groups],
      ['Teachers', stats['teacherCount'] ?? stats['teachers'] ?? 0, Icons.person],
      ['Attendance', stats['attendancePercent'] ?? stats['attendance'] ?? 0, Icons.fact_check],
      ['Outstanding', stats['outstanding'] ?? 0, Icons.account_balance_wallet],
    ];

    return GridView.builder(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: items.length,
      gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
        maxCrossAxisExtent: 190,
        crossAxisSpacing: 10,
        mainAxisSpacing: 10,
        childAspectRatio: 1.5,
      ),
      itemBuilder: (context, index) {
        return TweenAnimationBuilder<double>(
          tween: Tween(begin: 0, end: 1),
          duration: Duration(milliseconds: 300 + index * 100),
          builder: (context, value, child) {
            return Transform.scale(
              scale: 0.94 + 0.06 * value,
              child: Opacity(opacity: value, child: child),
            );
          },
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(items[index][2] as IconData),
                  const SizedBox(height: 6),
                  Text(
                    '${items[index][1]}',
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                  ),
                  Text(items[index][0] as String),
                ],
              ),
            ),
          ),
        );
      },
    );
  }
}
