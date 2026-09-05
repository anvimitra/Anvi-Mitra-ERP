import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

const apiBaseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://localhost:4000');

class ApiClient {
  String? token;
  ApiClient({this.token});

  Future<Map<String, dynamic>> post(String path, Map<String, dynamic> body) async {
    final r = await http.post(Uri.parse('$apiBaseUrl$path'), headers: {'Content-Type': 'application/json'}, body: jsonEncode(body));
    final data = jsonDecode(r.body.isEmpty ? '{}' : r.body) as Map<String, dynamic>;
    if (r.statusCode < 200 || r.statusCode >= 300) throw Exception(data['error'] ?? 'Request failed');
    return data;
  }

  Future<Map<String, dynamic>> get(String path) async {
    final headers = <String, String>{'Accept': 'application/json'};
    if (token != null) headers['Authorization'] = 'Bearer $token';
    final r = await http.get(Uri.parse('$apiBaseUrl$path'), headers: headers);
    final data = jsonDecode(r.body.isEmpty ? '{}' : r.body) as Map<String, dynamic>;
    if (r.statusCode < 200 || r.statusCode >= 300) throw Exception(data['error'] ?? 'Request failed');
    return data;
  }
}

void main() => runApp(const AnviMitraApp());

class AnviMitraApp extends StatelessWidget {
  const AnviMitraApp({super.key});
  @override
  Widget build(BuildContext context) => MaterialApp(title: 'Anvi Mitra School App', debugShowCheckedModeBanner: false, theme: ThemeData(colorSchemeSeed: Colors.indigo, useMaterial3: true), home: const LoginPage());
}

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});
  @override State<LoginPage> createState() => _LoginPageState();
}
class _LoginPageState extends State<LoginPage> {
  final school = TextEditingController(), login = TextEditingController(), password = TextEditingController();
  bool busy = false; String? error;
  Future<void> submit() async {
    setState(() {busy=true; error=null;});
    try {
      final d = await ApiClient().post('/api/auth/login', {'schoolCode': school.text.trim(), 'login': login.text.trim(), 'password': password.text});
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('accessToken', d['accessToken']);
      await prefs.setString('user', jsonEncode(d['user']));
      if (!mounted) return;
      Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => HomePage(user: Map<String,dynamic>.from(d['user']))));
    } catch(e) { setState(() => error=e.toString().replaceFirst('Exception: ', '')); }
    finally { if(mounted) setState(()=>busy=false); }
  }
  @override Widget build(BuildContext context) => Scaffold(body: SafeArea(child: Center(child: SingleChildScrollView(padding: const EdgeInsets.all(24), child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 430), child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [const Icon(Icons.school, size: 64), const SizedBox(height: 12), Text('Anvi Mitra School App', style: Theme.of(context).textTheme.headlineSmall, textAlign: TextAlign.center), const SizedBox(height: 6), const Text('One app for Principal • Teacher • Parent • Student • Driver', textAlign: TextAlign.center), const SizedBox(height: 28), TextField(controller: school, decoration: const InputDecoration(labelText:'School Code', border: OutlineInputBorder())), const SizedBox(height:12), TextField(controller: login, decoration: const InputDecoration(labelText:'Email / Phone', border: OutlineInputBorder())), const SizedBox(height:12), TextField(controller: password, obscureText:true, decoration: const InputDecoration(labelText:'Password', border: OutlineInputBorder())), if(error!=null) Padding(padding: const EdgeInsets.only(top:12), child: Text(error!, style: TextStyle(color: Theme.of(context).colorScheme.error))), const SizedBox(height:18), FilledButton(onPressed: busy ? null : submit, child: Padding(padding: const EdgeInsets.all(12), child: Text(busy ? 'Signing in…' : 'Sign in')))]))))));
}

class HomePage extends StatelessWidget {
  final Map<String,dynamic> user;
  const HomePage({super.key, required this.user});
  List<Map<String,String>> modules(String role) {
    const admin=[('Students','Manage student profiles and enrollments'),('Attendance','School attendance and reports'),('Fees','Fees, invoices and collections'),('Exams','FA1, FA2, FA3, Half Yearly and Yearly'),('Reports','School reports and analytics')];
    const teacher=[('Attendance','Mark class attendance'),('Homework','Create and review homework'),('Timetable','View teaching timetable'),('Exams','Enter and review marks'),('Students','View assigned students')];
    const parent=[('My Children','Children linked to your account'),('Attendance','View child attendance'),('Homework','Latest homework'),('Fees','Fee balance and receipts'),('Results','Published exam results'),('Notifications','School updates')];
    const student=[('Attendance','Your attendance'),('Homework','Assigned homework'),('Timetable','Class timetable'),('Results','Published results'),('Notifications','School updates')];
    const driver=[('Trips','Today’s transport trips'),('Route','Assigned route and stops'),('Updates','Transport notices')];
    switch(role){case 'teacher':return teacher.map((x)=>{'title':x.$1,'desc':x.$2}).toList();case 'parent':return parent.map((x)=>{'title':x.$1,'desc':x.$2}).toList();case 'student':return student.map((x)=>{'title':x.$1,'desc':x.$2}).toList();case 'driver':return driver.map((x)=>{'title':x.$1,'desc':x.$2}).toList();default:return admin.map((x)=>{'title':x.$1,'desc':x.$2}).toList();}
  }
  @override Widget build(BuildContext context){ final role=(user['role']??'').toString().toLowerCase(); final items=modules(role); return Scaffold(appBar:AppBar(title:Text(user['schoolName']??'Anvi Mitra School'),actions:[IconButton(icon:const Icon(Icons.logout),onPressed:()async{final p=await SharedPreferences.getInstance();await p.clear();if(context.mounted)Navigator.of(context).pushAndRemoveUntil(MaterialPageRoute(builder:(_)=>const LoginPage()),(_)=>false);})]),body:ListView(padding:const EdgeInsets.all(16),children:[Card(child:Padding(padding:const EdgeInsets.all(18),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[Text('Welcome',style:Theme.of(context).textTheme.labelLarge),Text(role.replaceAll('_',' ').toUpperCase(),style:Theme.of(context).textTheme.headlineSmall),const SizedBox(height:6),Text('School: ${user['schoolName']??'—'}'),Text('Branch: ${user['branchId']??'School level'}')])),const SizedBox(height:12),GridView.builder(shrinkWrap:true,physics:const NeverScrollableScrollPhysics(),gridDelegate:const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount:2,crossAxisSpacing:12,mainAxisSpacing:12,childAspectRatio:1.15),itemCount:items.length,itemBuilder:(context,i){final m=items[i];return Card(child:InkWell(onTap:(){ScaffoldMessenger.of(context).showSnackBar(SnackBar(content:Text('${m['title']} module connected to ERP API next.')));},child:Padding(padding:const EdgeInsets.all(14),child:Column(crossAxisAlignment:CrossAxisAlignment.start,children:[const Icon(Icons.dashboard_customize),const Spacer(),Text(m['title']!,style:Theme.of(context).textTheme.titleMedium),const SizedBox(height:4),Text(m['desc']!,style:Theme.of(context).textTheme.bodySmall)]))));})]) ); }
}
