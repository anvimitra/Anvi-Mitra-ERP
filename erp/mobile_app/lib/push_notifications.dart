import 'dart:convert';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'app_config.dart';

@pragma('vm:entry-point')
Future<void> firebaseBackgroundHandler(RemoteMessage message) async {}

class PushNotifications {
  final FirebaseMessaging messaging = FirebaseMessaging.instance;
  Map<String,dynamic>? pendingAction;
  Future<void> initialize() async {
    FirebaseMessaging.onBackgroundMessage(firebaseBackgroundHandler);
    await messaging.setAutoInitEnabled(true);
    final settings=await messaging.requestPermission(alert:true,badge:true,sound:true,provisional:false);
    if(settings.authorizationStatus==AuthorizationStatus.denied)return;
    final token=await messaging.getToken();
    if(token!=null)await registerToken(token);
    messaging.onTokenRefresh.listen(registerToken);
    FirebaseMessaging.onMessage.listen(_handleForeground);
    FirebaseMessaging.onMessageOpenedApp.listen(_handleOpened);
    final initial=await messaging.getInitialMessage();
    if(initial!=null)_handleOpened(initial);
  }
  void _handleForeground(RemoteMessage message){pendingAction=_actionFrom(message);}
  void _handleOpened(RemoteMessage message){pendingAction=_actionFrom(message);}
  Map<String,dynamic> _actionFrom(RemoteMessage message){
    final data=<String,dynamic>{}; data.addAll(message.data);
    return {'event':(data['event']??data['type']??'notifications').toString(),'studentId':data['studentId'],'invoiceId':data['invoiceId'],'receiptNo':data['receiptNo'],'data':data};
  }
  Map<String,dynamic>? consumePendingAction(){final action=pendingAction;pendingAction=null;return action;}
  Future<void> registerToken(String token) async {
    final p=await SharedPreferences.getInstance(); final access=p.getString('accessToken'); if(access==null)return;
    final r=await http.post(Uri.parse('${AppConfig.apiBaseUrl}/api/notifications/device-token'),headers:{'Authorization':'Bearer $access','Content-Type':'application/json'},body:jsonEncode({'token':token,'platform':'android'}));
    if(r.statusCode<200||r.statusCode>=300)throw Exception('Device token registration failed');
  }
}