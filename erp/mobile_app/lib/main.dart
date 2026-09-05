import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'app_config.dart';
import 'live_dashboard.dart';
import 'teacher_dashboard.dart';
import 'admin_dashboard.dart';
import 'student_dashboard.dart';
import 'driver_dashboard.dart';
import 'updates_page.dart';
import 'update_checker.dart';
import 'update_launcher.dart';
import 'push_notifications.dart';

void main() => runApp(const AnviMitraApp());

class AnviMitraApp extends StatelessWidget {
  const AnviMitraApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: AppConfig.appName,
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorSchemeSeed: Colors.indigo,
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
  final school = TextEditingController();
  final login = TextEditingController();
  final password = TextEditingController();
  bool busy = false;
  String? error;

  Future<void> submit() async {
    setState(() => busy = true);
    try {
      final response = await http.post(
        Uri.parse('${AppConfig.apiBaseUrl}/api/auth/login'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({
          'schoolCode': school.text.trim(),
          'login': login.text.trim(),
          'password': password.text,
        }),
      );
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw Exception(data['error'] ?? 'Login failed');
      }

      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('accessToken', data['accessToken']);
      await prefs.setString('user', jsonEncode(data['user']));
      await PushNotifications().initialize();

      if (mounted) {
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(
            builder: (_) => HomePage(
              user: Map<String, dynamic>.from(data['user']),
            ),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        setState(() => error = e.toString().replaceFirst('Exception: ', ''));
      }
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 430),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Icon(Icons.school, size: 70),
                  const SizedBox(height: 12),
                  Text(
                    AppConfig.appName,
                    textAlign: TextAlign.center,
                    style: const TextStyle(
                      fontSize: 25,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'School Management App',
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 28),
                  TextField(
                    controller: school,
                    decoration: const InputDecoration(
                      labelText: 'School Code',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: login,
                    decoration: const InputDecoration(
                      labelText: 'Email / Phone',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: password,
                    obscureText: true,
                    decoration: const InputDecoration(
                      labelText: 'Password',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  if (error != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Text(
                        error!,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                    ),
                  const SizedBox(height: 18),
                  FilledButton(
                    onPressed: busy ? null : submit,
                    child: Padding(
                      padding: const EdgeInsets.all(13),
                      child: Text(busy ? 'Signing in…' : 'Sign in'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class HomePage extends StatefulWidget {
  final Map<String, dynamic> user;

  const HomePage({super.key, required this.user});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  AppUpdateInfo? update;
  int index = 0;

  @override
  void initState() {
    super.initState();
    _check();
  }

  Future<void> _check() async {
    final latest = await UpdateChecker().check();
    if (!mounted || latest == null || (!latest.available && !latest.required)) {
      return;
    }
    setState(() => update = latest);
    if (latest.required) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        showDialog(
          context: context,
          barrierDismissible: false,
          builder: (_) => AlertDialog(
            title: const Text('Update Required'),
            content: Text(
              'Please update to version ${latest.latestVersion ?? 'latest'} to continue.',
            ),
            actions: [
              FilledButton(
                onPressed: () => UpdateLauncher.open(latest.updateUrl),
                child: const Text('Update Now'),
              ),
            ],
          ),
        );
      });
    }
  }

  Widget _home(String role) {
    if (role == 'teacher') return const TeacherDashboard();
    if (role == 'admin' || role == 'principal' || role == 'super_admin') {
      return AdminDashboard(role: role);
    }
    if (role == 'student') return const StudentDashboard();
    if (role == 'driver') return const DriverDashboard();
    return LiveDashboard(role: role);
  }

  Widget _tab(String role) {
    if (index == 1) return const UpdatesPage();
    if (index == 2) return _profile();
    return _home(role);
  }

  Widget _profile() {
    return ListView(
      padding: const EdgeInsets.all(20),
      children: [
        const CircleAvatar(radius: 38, child: Icon(Icons.person, size: 40)),
        const SizedBox(height: 12),
        Center(
          child: Text(
            userName,
            style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w800),
          ),
        ),
        const SizedBox(height: 4),
        Center(
          child: Text(
            '${widget.user['role'] ?? ''} • ${widget.user['schoolName'] ?? AppConfig.appName}',
          ),
        ),
        const SizedBox(height: 20),
        Card(
          child: ListTile(
            leading: const Icon(Icons.school),
            title: const Text('School'),
            subtitle: Text('${widget.user['schoolName'] ?? AppConfig.appName}'),
          ),
        ),
        Card(
          child: ListTile(
            leading: const Icon(Icons.account_tree),
            title: const Text('Branch'),
            subtitle: Text('${widget.user['branchName'] ?? 'Main Branch'}'),
          ),
        ),
      ],
    );
  }

  String get userName => '${widget.user['name'] ?? 'User'}';

  @override
  Widget build(BuildContext context) {
    final role = (widget.user['role'] ?? '').toString().toLowerCase();
    final schoolName = (widget.user['schoolName'] ?? AppConfig.appName).toString();
    return Scaffold(
      appBar: AppBar(
        title: Text(schoolName),
        actions: [
          IconButton(onPressed: _logout, icon: const Icon(Icons.logout)),
        ],
      ),
      body: Column(
        children: [
          if (update != null && !update!.required)
            MaterialBanner(
              content: Text(
                'New version ${update!.latestVersion ?? ''} available',
              ),
              leading: const Icon(Icons.system_update),
              actions: [
                TextButton(
                  onPressed: () => UpdateLauncher.open(update!.updateUrl),
                  child: const Text('UPDATE'),
                ),
              ],
            ),
          Expanded(child: _tab(role)),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (value) => setState(() => index = value),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard),
            label: 'Home',
          ),
          NavigationDestination(
            icon: Icon(Icons.notifications_outlined),
            selectedIcon: Icon(Icons.notifications),
            label: 'Updates',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person),
            label: 'Profile',
          ),
        ],
      ),
    );
  }

  Future<void> _logout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.clear();
    if (mounted) {
      Navigator.pushAndRemoveUntil(
        context,
        MaterialPageRoute(builder: (_) => const LoginPage()),
        (_) => false,
      );
    }
  }
}
