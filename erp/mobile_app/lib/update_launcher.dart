import 'package:flutter/foundation.dart';
import 'package:url_launcher/url_launcher.dart';

class UpdateLauncher {
  static Future<bool> open(String? url) async {
    if (url == null || url.trim().isEmpty) return false;
    final uri = Uri.tryParse(url.trim());
    if (uri == null || !uri.hasScheme) return false;
    return launchUrl(uri, mode: kIsWeb ? LaunchMode.platformDefault : LaunchMode.externalApplication);
  }
}
