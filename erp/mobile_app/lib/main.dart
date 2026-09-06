import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
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
import 'notification_action.dart';

void main() => runApp(const AnviMitraApp());

class AnviMitraApp extends StatelessWidget {
  const AnviMitraApp({super.key});
  @override
  Widget build(BuildContext context) {
    final primary = Color(AppConfig.primaryColorValue | 0xFF000000);
    final secondary = Color(AppConfig.secondaryColorValue | 0xFF000000);
    return MaterialApp(
      title: AppConfig.appName,
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: primary, brightness: Brightness.light).copyWith(primary: primary, secondary: secondary),
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

  bool get _hasBundledLogo => AppConfig.schoolSlug == 'lsk-academy';

  Widget _fallbackLogo(double size) => CircleAvatar(
        radius: size / 2,
        backgroundColor: Theme.of(context).colorScheme.primaryContainer,
        child: Icon(Icons.school, size: size * .55),
      );

  Widget _brandLogo({double size = 84}) {
    if (AppConfig.logoUrl.isNotEmpty) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(size * .18),
        child: Image.network(AppConfig.logoUrl, width: size, height: size, fit: BoxFit.contain, errorBuilder: (_, __, ___) => _fallbackLogo(size)),
      );
    }
    if (_hasBundledLogo) {
      return ClipRRect(
        borderRadius: BorderRadius.circular(size * .18),
        child: SvgPicture.asset('branding/lsk-academy-logo.svg', width: size, height: size, fit: BoxFit.contain),
      );
    }
    return _fallbackLogo(size);
  }

  Future<void> submit() async {
    setState(() => busy = true);
    try {
      final response = await http.post(
        Uri.parse('${AppConfig.apiBaseUrl}/api/auth/login'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'schoolCode': school.text.trim(), 'login': login.text.trim(), 'password': password.text}),
      );
      final data = jsonDecode(response.body) as Map<String, dynamic>;
      if (response.statusCode < 200 || response.statusCode >= 300) throw Exception(data['error'] ?? 'Login failed');
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('accessToken', data['accessToken']);
      await prefs.setString('user', jsonEncode(data['user']));
      await PushNotifications.instance.initialize();
      if (mounted) {
        Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => HomePage(user: Map<String, dynamic>.from(data['user']))));
      }
    } catch (e) {
      if (mounted) setState(() => error = e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 430),
                child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                  Center(child: _brandLogo()),
                  const SizedBox(height: 12),
                  Text(AppConfig.appName, textAlign: TextAlign.center, style: const TextStyle(fontSize: 25, fontWeight: FontWeight.w800)),
                  const SizedBox(height: 6),
                  const Text('School Management App', textAlign: TextAlign.center),
                  const SizedBox(height: 28),
                  TextField(controller: school, decoration: const InputDecoration(labelText: 'School Code', border: OutlineInputBorder())),
                  const SizedBox(height: 12),
                  TextField(controller: login, decoration: const InputDecoration(labelText: 'Email / Phone', border: OutlineInputBorder())),
                  const SizedBox(height: 12),
                  TextField(controller: password, obscureText: true, decoration: const InputDecoration(labelText: 'Password', border: OutlineInputBorder())),
                  if (error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
                  const SizedBox(height: 18),
                  FilledButton(onPressed: busy ? null : submit, child: Padding(padding: const EdgeInsets.all(13), child: Text(busy ? 'Signing in…' : 'Sign in'))),
                ]),
              ),
            ),
          ),
        ),
      );
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
  final PushNotifications _push = PushNotifications.instance;

  @override
  void initState() {
    super.initState();
    _push.pendingAction.addListener(_onPendingNotification);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _openNotification(_push.consumePendingAction());
    });
    _check();
  }

  @override
  void dispose() {
    _push.pendingAction.removeListener(_onPendingNotification);
    super.dispose();
  }

  void _onPendingNotification() {
    final action = _push.consumePendingAction();
    if (action == null || !mounted) return;
    WidgetsBinding.instance.addPostFrameCallback((_) => _openNotification(action));
  }

  void _openNotification(Map<String, dynamic>? action) {
    if (!mounted || action == null) return;
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => NotificationActionPage(action: action)));
  }

  Future<void> _check() async {
    final latest = await UpdateChecker().check();
    if (!mounted || latest == null || (!latest.available && !latest.required)) return;
    setState(() => update = latest);
    if (latest.required) {
      WidgetsBinding.instance.addPostFrameCallback((_) => showDialog(context: context, barrierDismissible: false, builder: (_) => AlertDialog(
        title: const Text('Update Required'),
        content: Text('Please update to version ${latest.latestVersion ?? 'latest'} to continue.'),
        actions: [FilledButton(onPressed: () => UpdateLauncher.open(latest.updateUrl), child: const Text('Update Now'))],
      )));
    }
  }

  Widget _home(String role) {
    if (role == 'teacher') return const TeacherDashboard();
    if (role == 'admin' || role == 'principal' || role == 'super_admin') return AdminDashboard(role: role);
    if (role == 'student') return const StudentDashboard();
    if (role == 'driver') return const DriverDashboard();
    return LiveDashboard(role: role);
  }
  Widget _tab(String role) { if (index == 1) return const UpdatesPage(); if (index == 2) return _profile(); return _home(role); }
  Widget _profileLogo() {
    if (AppConfig.logoUrl.isNotEmpty) return ClipRRect(borderRadius: BorderRadius.circular(18), child: Image.network(AppConfig.logoUrl, width: 76, height: 76, fit: BoxFit.contain, errorBuilder: (_, __, ___) => _fallbackProfileLogo()));
    if (AppConfig.schoolSlug == 'lsk-academy') return ClipRRect(borderRadius: BorderRadius.circular(18), child: SvgPicture.asset('branding/lsk-academy-logo.svg', width: 76, height: 76, fit: BoxFit.contain));
    return _fallbackProfileLogo();
  }
  Widget _fallbackProfileLogo() => CircleAvatar(radius: 38, backgroundColor: Theme.of(context).colorScheme.primaryContainer, child: const Icon(Icons.school, size: 40));
  Widget _profile() => ListView(padding: const EdgeInsets.all(20), children: [
    Center(child: _profileLogo()), const SizedBox(height: 12), Center(child: Text(userName, style: const TextStyle(fontSize: 21, fontWeight: FontWeight.w800))), const SizedBox(height: 4),
    Center(child: Text('${widget.user['role'] ?? ''} • ${widget.user['schoolName'] ?? AppConfig.appName}')), const SizedBox(height: 20),
    Card(child: ListTile(leading: const Icon(Icons.school), title: const Text('School'), subtitle: Text('${widget.user['schoolName'] ?? AppConfig.appName}'))),
    Card(child: ListTile(leading: const Icon(Icons.account_tree), title: const Text('Branch'), subtitle: Text('${widget.user['branchName'] ?? 'Main Branch'}'))),
  ]);
  String get userName => '${widget.user['name'] ?? 'User'}';
  @override
  Widget build(BuildContext context) {
    final role = (widget.user['role'] ?? '').toString().toLowerCase();
    final schoolName = (widget.user['schoolName'] ?? AppConfig.appName).toString();
    return Scaffold(
      appBar: AppBar(title: Row(children: [
        if (AppConfig.logoUrl.isNotEmpty) Padding(padding: const EdgeInsets.only(right: 10), child: ClipRRect(borderRadius: BorderRadius.circular(8), child: Image.network(AppConfig.logoUrl, width: 34, height: 34, fit: BoxFit.contain, errorBuilder: (_, __, ___) => const Icon(Icons.school))))
        else if (AppConfig.schoolSlug == 'lsk-academy') Padding(padding: const EdgeInsets.only(right: 10), child: ClipRRect(borderRadius: BorderRadius.circular(8), child: SvgPicture.asset('branding/lsk-academy-logo.svg', width: 34, height: 34, fit: BoxFit.contain))),
        Expanded(child: Text(schoolName)),
      ]), actions: [IconButton(onPressed: _logout, icon: const Icon(Icons.logout))]),
      body: Column(children: [
        if (update != null && !update!.required) MaterialBanner(content: Text('New version ${update!.latestVersion ?? ''} available'), leading: const Icon(Icons.system_update), actions: [TextButton(onPressed: () => UpdateLauncher.open(update!.updateUrl), child: const Text('UPDATE'))]),
        Expanded(child: _tab(role)),
      ]),
      bottomNavigationBar: NavigationBar(selectedIndex: index, onDestinationSelected: (value) => setState(() => index = value), destinations: const [
        NavigationDestination(icon: Icon(Icons.dashboard_outlined), selectedIcon: Icon(Icons.dashboard), label: 'Home'),
        NavigationDestination(icon: Icon(Icons.notifications_outlined), selectedIcon: Icon(Icons.notifications), label: 'Updates'),
        NavigationDestination(icon: Icon(Icons.person_outline), selectedIcon: Icon(Icons.person), label: 'Profile'),
      ]),
    );
  }
  Future<void> _logout() async {
    final prefs = await SharedPreferences.getInstance(); await prefs.clear();
    if (mounted) Navigator.pushAndRemoveUntil(context, MaterialPageRoute(builder: (_) => const LoginPage()), (_) => false);
  }
}
