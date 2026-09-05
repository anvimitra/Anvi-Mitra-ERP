import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'app_config.dart';
import 'app_version.dart';

class AppUpdateInfo {
  final String? latestVersion;
  final String? minimumVersion;
  final bool forceUpdate;
  final String? androidUrl;
  final String? iosUrl;
  final String? releaseNotesUrl;
  AppUpdateInfo({this.latestVersion,this.minimumVersion,this.forceUpdate=false,this.androidUrl,this.iosUrl,this.releaseNotesUrl});
  bool get available => AppVersion.isUpdateAvailable(latestVersion);
  bool get required => forceUpdate || AppVersion.isUpdateRequired(minimumVersion);
  String? get updateUrl => androidUrl ?? iosUrl;
}

class UpdateChecker {
  Future<AppUpdateInfo?> check() async {
    try {
      final r=await http.get(Uri.parse('${AppConfig.apiBaseUrl}/api/mobile/config'),headers:{'Accept':'application/json'});
      if(r.statusCode<200||r.statusCode>=300)return null;
      final root=jsonDecode(r.body) as Map<String,dynamic>;
      final a=Map<String,dynamic>.from(root['app']??{});
      return AppUpdateInfo(latestVersion:a['latestAppVersion']?.toString(),minimumVersion:a['minAppVersion']?.toString(),forceUpdate:a['forceUpdate']==true,androidUrl:a['androidUpdateUrl']?.toString(),iosUrl:a['iosUpdateUrl']?.toString(),releaseNotesUrl:a['releaseNotesUrl']?.toString());
    } catch(_){ return null; }
  }
}

class UpdateDialog extends StatelessWidget {
  final AppUpdateInfo info;
  const UpdateDialog({super.key,required this.info});
  @override Widget build(BuildContext context)=>AlertDialog(title:Text(info.required?'Update Required':'Update Available'),content:Text('Current version: ${AppVersion.current}\nLatest version: ${info.latestVersion??'new version'}\n\nPlease update the app to continue with the latest features and fixes.'),actions:[if(!info.required)TextButton(onPressed:()=>Navigator.pop(context),child:const Text('Later')),FilledButton(onPressed:()=>Navigator.pop(context),child:const Text('Continue'))]);
}
