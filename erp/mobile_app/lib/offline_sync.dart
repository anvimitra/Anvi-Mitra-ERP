import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'app_config.dart';

class OfflineSync {
  OfflineSync._();
  static final OfflineSync instance = OfflineSync._();

  static const _deviceKeyPref = 'syncDeviceKey';
  static const _cursorPref = 'syncCursor';
  static const _outboxPref = 'syncOutbox';

  Future<String> _deviceKey() async {
    final prefs = await SharedPreferences.getInstance();
    var key = prefs.getString(_deviceKeyPref);
    if (key == null || key.isEmpty) {
      key = 'android-${DateTime.now().microsecondsSinceEpoch}';
      await prefs.setString(_deviceKeyPref, key);
    }
    return key;
  }

  Future<List<Map<String, dynamic>>> _outbox() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_outboxPref);
    if (raw == null) return [];
    try {
      final list = jsonDecode(raw) as List<dynamic>;
      return list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> _saveOutbox(List<Map<String, dynamic>> items) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_outboxPref, jsonEncode(items));
  }

  Future<void> queueChange({
    required String entityType,
    String? entityId,
    required String operation,
    required Map<String, dynamic> payload,
  }) async {
    final items = await _outbox();
    items.add({
      'clientId': 'c-${DateTime.now().microsecondsSinceEpoch}',
      'entityType': entityType,
      'entityId': entityId,
      'operation': operation,
      'payload': payload,
    });
    await _saveOutbox(items);
  }

  Future<void> initialize() async {
    final access = (await SharedPreferences.getInstance()).getString('accessToken');
    if (access == null) return;
    final key = await _deviceKey();
    try {
      await _request('/api/sync/device', access, method: 'POST', body: {
        'deviceKey': key,
        'deviceName': 'Anvi Mitra Android App',
        'platform': 'android',
      });
      await syncNow();
    } catch (_) {
      // Offline mode: queued changes remain on the device.
    }
  }

  Future<bool> syncNow() async {
    final prefs = await SharedPreferences.getInstance();
    final access = prefs.getString('accessToken');
    if (access == null) return false;
    final key = await _deviceKey();
    try {
      final pending = await _outbox();
      if (pending.isNotEmpty) {
        final result = await _request('/api/sync/push', access, method: 'POST', body: {
          'deviceKey': key,
          'changes': pending,
        });
        final rejected = (result['rejected'] as List<dynamic>? ?? []);
        final conflicts = (result['conflicts'] as List<dynamic>? ?? []);
        if (rejected.isEmpty && conflicts.isEmpty) {
          await _saveOutbox([]);
        } else {
          final rejectedIds = rejected
              .map((e) => (e as Map)['clientId'])
              .whereType<String>()
              .toSet();
          final conflictIds = conflicts
              .map((e) => (e as Map)['clientId'])
              .whereType<String>()
              .toSet();
          await _saveOutbox(pending.where((e) {
            final id = e['clientId'];
            return rejectedIds.contains(id) || conflictIds.contains(id);
          }).toList());
        }
      }
      final cursor = prefs.getInt(_cursorPref) ?? 0;
      final pulled = await _request('/api/sync/pull?deviceKey=${Uri.encodeQueryComponent(key)}&cursor=$cursor&limit=100', access);
      final nextCursor = int.tryParse('${pulled['nextCursor'] ?? cursor}') ?? cursor;
      await prefs.setInt(_cursorPref, nextCursor);
      return true;
    } catch (_) {
      return false;
    }
  }

  Future<Map<String, dynamic>> _request(
    String path,
    String accessToken, {
    String method = 'GET',
    Map<String, dynamic>? body,
  }) async {
    final uri = Uri.parse('${AppConfig.apiBaseUrl}$path');
    final headers = {
      'Accept': 'application/json',
      'Authorization': 'Bearer $accessToken',
      if (body != null) 'Content-Type': 'application/json',
    };
    final response = method == 'POST'
        ? await http.post(uri, headers: headers, body: body == null ? null : jsonEncode(body))
        : await http.get(uri, headers: headers);
    final data = jsonDecode(response.body) as Map<String, dynamic>;
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(data['error'] ?? 'Sync request failed');
    }
    return data;
  }
}
