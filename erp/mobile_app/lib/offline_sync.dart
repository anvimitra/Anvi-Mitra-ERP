import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'app_config.dart';

/// Offline-first cache/outbox for the unified school app.
/// PostgreSQL remains the source of truth. Local data can be queued while
/// offline and is synchronized automatically when the network is available.
class OfflineSyncService {
  OfflineSyncService._();
  static final OfflineSyncService instance = OfflineSyncService._();

  static const _deviceKeyPref = 'erp_sync_device_key';
  static const _cursorPref = 'erp_sync_cursor';
  static const _outboxPref = 'erp_sync_outbox';
  static const _conflictsPref = 'erp_sync_conflicts';
  static const _cachePrefix = 'erp_sync_cache_';

  SharedPreferences? _prefs;
  String? _accessToken;
  Timer? _autoSyncTimer;
  bool _syncing = false;

  Future<void> initialize({required String accessToken}) async {
    _prefs ??= await SharedPreferences.getInstance();
    _accessToken = accessToken;
    await _ensureDevice().catchError((_) {});
    _autoSyncTimer?.cancel();
    _autoSyncTimer = Timer.periodic(const Duration(minutes: 1), (_) {
      syncNow().catchError((_) {});
    });
  }

  void dispose() {
    _autoSyncTimer?.cancel();
    _autoSyncTimer = null;
  }

  Future<String> _deviceKey() async {
    final prefs = _prefs ??= await SharedPreferences.getInstance();
    final existing = prefs.getString(_deviceKeyPref);
    if (existing != null && existing.isNotEmpty) return existing;
    final value = '${DateTime.now().microsecondsSinceEpoch}-${identityHashCode(this)}';
    await prefs.setString(_deviceKeyPref, value);
    return value;
  }

  Future<Map<String, dynamic>> _request(String path, {String method = 'GET', Map<String, dynamic>? body}) async {
    final token = _accessToken;
    if (token == null || token.isEmpty) throw StateError('Offline sync is not initialized');
    final uri = Uri.parse('${AppConfig.apiBaseUrl}$path');
    final response = await (method == 'POST'
        ? http.post(uri, headers: {'Authorization': 'Bearer $token', 'Content-Type': 'application/json'}, body: jsonEncode(body ?? {}))
        : http.get(uri, headers: {'Authorization': 'Bearer $token'}));
    final data = jsonDecode(response.body.isEmpty ? '{}' : response.body);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(data is Map && data['error'] != null ? data['error'] : 'Sync request failed (${response.statusCode})');
    }
    return Map<String, dynamic>.from(data as Map);
  }

  Future<void> _ensureDevice() async {
    final key = await _deviceKey();
    final platform = defaultTargetPlatform.toString().split('.').last;
    await _request('/api/sync/device', method: 'POST', body: {
      'deviceKey': key,
      'deviceName': platform,
      'platform': platform,
    });
  }

  Future<List<Map<String, dynamic>>> _outbox() async {
    final prefs = _prefs ??= await SharedPreferences.getInstance();
    final raw = prefs.getString(_outboxPref);
    if (raw == null || raw.isEmpty) return [];
    final decoded = jsonDecode(raw);
    if (decoded is! List) return [];
    return decoded.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<void> _saveOutbox(List<Map<String, dynamic>> items) async {
    final prefs = _prefs ??= await SharedPreferences.getInstance();
    await prefs.setString(_outboxPref, jsonEncode(items));
  }

  Future<List<Map<String, dynamic>>> _conflicts() async {
    final prefs = _prefs ??= await SharedPreferences.getInstance();
    final raw = prefs.getString(_conflictsPref);
    if (raw == null || raw.isEmpty) return [];
    final decoded = jsonDecode(raw);
    if (decoded is! List) return [];
    return decoded.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<void> _saveConflicts(List<Map<String, dynamic>> items) async {
    final prefs = _prefs ??= await SharedPreferences.getInstance();
    await prefs.setString(_conflictsPref, jsonEncode(items));
  }

  Future<void> queueChange({
    required String entityType,
    required String operation,
    String? entityId,
    Map<String, dynamic> payload = const {},
  }) async {
    if (!{'create', 'update', 'delete'}.contains(operation)) {
      throw ArgumentError('operation must be create, update or delete');
    }
    final items = await _outbox();
    final clientId = '${DateTime.now().microsecondsSinceEpoch}-${items.length}';
    final prefs = _prefs ??= await SharedPreferences.getInstance();
    final cursor = prefs.getInt(_cursorPref) ?? 0;
    items.add({'clientId': clientId,'entityType': entityType,'entityId': entityId,'operation': operation,'payload': payload,'baseCursor': cursor,'queuedAt': DateTime.now().toIso8601String()});
    await _saveOutbox(items);
  }

  Future<int> pendingCount() async => (await _outbox()).length;
  Future<int> conflictCount() async => (await _conflicts()).length;
  Future<List<Map<String, dynamic>>> pendingConflicts() => _conflicts();

  Future<void> syncNow() async {
    if (_syncing) return;
    if (_accessToken == null || _accessToken!.isEmpty) return;
    _syncing = true;
    try {
      await _ensureDevice();
      await _pushOutbox();
      await _pullChanges();
    } finally {
      _syncing = false;
    }
  }

  Future<void> _pushOutbox() async {
    final items = await _outbox();
    if (items.isEmpty) return;
    final key = await _deviceKey();
    final result = await _request('/api/sync/push', method: 'POST', body: {'deviceKey': key,'changes': items.take(200).toList()});
    final accepted = (result['accepted'] as List? ?? const []).map((e) => Map<String, dynamic>.from(e as Map)).map((e) => e['clientId']?.toString()).whereType<String>().toSet();
    final conflicts = (result['conflicts'] as List? ?? const []).map((e) => Map<String, dynamic>.from(e as Map)).toList();
    final conflictIds = conflicts.map((e) => e['clientId']?.toString()).whereType<String>().toSet();
    if (conflicts.isNotEmpty) {
      final saved = await _conflicts();
      for (final conflict in conflicts) {
        final clientId = conflict['clientId']?.toString();
        final original = items.cast<Map<String, dynamic>?>().firstWhere((e) => e?['clientId']?.toString() == clientId, orElse: () => null);
        saved.add({...conflict, 'localChange': original, 'detectedAt': DateTime.now().toIso8601String()});
      }
      await _saveConflicts(saved);
    }
    final remaining = items.where((e) {
      final id = e['clientId']?.toString();
      return id == null || (!accepted.contains(id) && !conflictIds.contains(id));
    }).toList();
    await _saveOutbox(remaining);
  }

  Future<void> _pullChanges() async {
    final prefs = _prefs ??= await SharedPreferences.getInstance();
    final cursor = prefs.getInt(_cursorPref) ?? 0;
    final key = await _deviceKey();
    final result = await _request('/api/sync/changes?deviceKey=${Uri.encodeQueryComponent(key)}&cursor=$cursor&limit=200');
    final changes = (result['changes'] as List? ?? const []).map((e) => Map<String, dynamic>.from(e as Map)).toList();
    for (final change in changes) {
      final type = change['entity_type'] ?? change['entityType'];
      final id = change['entity_id'] ?? change['entityId'];
      if (type == null || id == null) continue;
      final operation = change['operation']?.toString();
      final keyName = '$_cachePrefix$type:$id';
      if (operation == 'delete') { await prefs.remove(keyName); } else { await prefs.setString(keyName, jsonEncode(change['payload'] ?? {})); }
    }
    final next = int.tryParse('${result['cursor'] ?? cursor}') ?? cursor;
    if (next >= cursor) await prefs.setInt(_cursorPref, next);
  }

  Future<Map<String, dynamic>?> readCached(String entityType, String entityId) async {
    final prefs = _prefs ??= await SharedPreferences.getInstance();
    final raw = prefs.getString('$_cachePrefix$entityType:$entityId');
    if (raw == null) return null;
    return Map<String, dynamic>.from(jsonDecode(raw) as Map);
  }

  Future<void> clearLocalSyncData() async {
    final prefs = _prefs ??= await SharedPreferences.getInstance();
    await prefs.remove(_outboxPref); await prefs.remove(_cursorPref); await prefs.remove(_conflictsPref);
    for (final key in prefs.getKeys().where((k) => k.startsWith(_cachePrefix)).toList()) { await prefs.remove(key); }
  }
}
