import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app_config.dart';
import 'offline_sync.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const AnviMitraApp());
}

class AnviMitraApp extends StatelessWidget {
  const AnviMitraApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: AppConfig.appName,
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF4F46E5)),
        useMaterial3: true,
      ),
      home: const LoginPage(),
    );
  }
}

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _school = TextEditingController(text: AppConfig.schoolCode);
  final _login = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _school.dispose();
    _login.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _loginNow() async {
    setState(() { _busy = true; _error = null; });
    try {
      final prefs = await SharedPreferences.getInstance();
      // The HTTP login is intentionally kept in this first scaffold simple.
      // Once the API is reachable, the token is stored and the same offline
      // sync service can continue working across connectivity changes.
      if (_school.text.trim().isEmpty || _login.text.trim().isEmpty || _password.text.isEmpty) {
        throw Exception('School code, login and password are required');
      }
      final token = prefs.getString('demo_access_token');
      if (token == null || token.isEmpty) {
        // This keeps the app usable as a UI scaffold without inventing a real
        // authentication token. Production login will call /api/auth/login.
        throw Exception('Connect the app to the ERP API to sign in');
      }
      await OfflineSyncService.instance.initialize(accessToken: token);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const HomePage()));
    } catch (e) {
      if (mounted) setState(() => _error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 430),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Icon(Icons.school_rounded, size: 58),
                    const SizedBox(height: 14),
                    Text(AppConfig.appName, textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
                    const SizedBox(height: 6),
                    const Text('One app for school staff, parents, students and drivers', textAlign: TextAlign.center),
                    const SizedBox(height: 24),
                    TextField(controller: _school, decoration: const InputDecoration(labelText: 'School Code', border: OutlineInputBorder())),
                    const SizedBox(height: 12),
                    TextField(controller: _login, decoration: const InputDecoration(labelText: 'Email / Phone', border: OutlineInputBorder())),
                    const SizedBox(height: 12),
                    TextField(controller: _password, obscureText: true, decoration: const InputDecoration(labelText: 'Password', border: OutlineInputBorder())),
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                    ],
                    const SizedBox(height: 18),
                    FilledButton(onPressed: _busy ? null : _loginNow, child: Text(_busy ? 'Signing in…' : 'Sign in')),
                    const SizedBox(height: 10),
                    Text('API: ${AppConfig.apiBaseUrl}', textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  int _pending = 0;
  String _status = 'Ready';

  Future<void> _sync() async {
    setState(() => _status = 'Syncing…');
    try {
      await OfflineSyncService.instance.syncNow();
      _pending = await OfflineSyncService.instance.pendingCount();
      if (mounted) setState(() => _status = 'Synced successfully');
    } catch (e) {
      if (mounted) setState(() => _status = 'Offline / sync pending');
    }
  }

  @override
  void initState() {
    super.initState();
    _refreshPending();
  }

  Future<void> _refreshPending() async {
    final count = await OfflineSyncService.instance.pendingCount();
    if (mounted) setState(() => _pending = count);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(AppConfig.appName)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(child: ListTile(leading: const Icon(Icons.cloud_done), title: const Text('ERP connection'), subtitle: Text(_status), trailing: IconButton(onPressed: _sync, icon: const Icon(Icons.sync)))),
          Card(child: ListTile(leading: const Icon(Icons.cloud_off), title: const Text('Offline outbox'), subtitle: Text('$_pending pending change(s)'))),
          const SizedBox(height: 8),
          const _ModuleCard(icon: Icons.people, title: 'Students & Enrollments', text: 'Student profiles, admissions and class enrollment.'),
          const _ModuleCard(icon: Icons.fact_check, title: 'Attendance', text: 'Role-aware attendance and class records.'),
          const _ModuleCard(icon: Icons.edit_note, title: 'Exams & Marks', text: 'Teachers can edit only their permitted class/subject records.'),
          const _ModuleCard(icon: Icons.receipt_long, title: 'Fees', text: 'Fee invoices, payments and outstanding records.'),
          const _ModuleCard(icon: Icons.notifications_active, title: 'Notifications', text: 'School updates remain available with offline cache support.'),
        ],
      ),
    );
  }
}

class _ModuleCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String text;
  const _ModuleCard({required this.icon, required this.title, required this.text});

  @override
  Widget build(BuildContext context) => Card(child: ListTile(leading: Icon(icon), title: Text(title, style: const TextStyle(fontWeight: FontWeight.w700)), subtitle: Text(text)));
}
