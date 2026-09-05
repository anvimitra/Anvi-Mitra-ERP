import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'app_config.dart';

class DashboardService {
  Future<Map<String,dynamic>> _get(String path) async {
    final p=await SharedPreferences.getInstance();
    final token=p.getString('accessToken');
    final r=await http.get(Uri.parse('${AppConfig.apiBaseUrl}$path'),headers:{'Authorization':'Bearer $token','Accept':'application/json'});
    final data=jsonDecode(r.body.isEmpty?'{}':r.body) as Map<String,dynamic>;
    if(r.statusCode<200||r.statusCode>=300) throw Exception(data['error']??'Unable to load data');
    return data;
  }
  Future<Map<String,dynamic>> parentOverview()=>_get('/api/portal/me/overview');
  Future<Map<String,dynamic>> notifications()=>_get('/api/notifications/me?limit=20');
  Future<Map<String,dynamic>> students()=>_get('/api/portal/me/students');
}
