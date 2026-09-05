import 'dart:convert';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'app_config.dart';

class PushNotifications {
  final FirebaseMessaging messaging = FirebaseMessaging.instance;

  Future<void> initialize() async {
    final settings = await messaging.requestPermission(alert:true,badge:true,sound:true);
    if(settings.authorizationStatus==AuthorizationStatus.denied)return;
    final token = await messaging.getToken();
    if(token!=null)await registerToken(token);
    FirebaseMessaging.onMessage.listen((message){});
    FirebaseMessaging.onMessageOpenedApp.listen((message){});
  }

  Future<void> registerToken(String token) async {
    final p=await SharedPreferences.getInstance();
    final access=p.getString('accessToken');
    if(access==null)return;
    await http.post(Uri.parse('${AppConfig.apiBaseUrl}/api/notifications/device-token'),headers:{'Authorization':'Bearer $access','Content-Type':'application/json'},body:jsonEncode({'token':token,'platform':'android'}));
  }
}
