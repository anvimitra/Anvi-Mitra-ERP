class AppVersion {
  static const String current = String.fromEnvironment('APP_VERSION', defaultValue: '0.1.0');

  static List<int> _parts(String value) => value
      .split('+').first
      .split('.')
      .map((x) => int.tryParse(x) ?? 0)
      .toList();

  static int compare(String a, String b) {
    final aa = _parts(a), bb = _parts(b);
    for (var i = 0; i < 3; i++) {
      final av = i < aa.length ? aa[i] : 0;
      final bv = i < bb.length ? bb[i] : 0;
      if (av != bv) return av.compareTo(bv);
    }
    return 0;
  }

  static bool isUpdateRequired(String? minimum) => minimum != null && minimum.isNotEmpty && compare(current, minimum) < 0;
  static bool isUpdateAvailable(String? latest) => latest != null && latest.isNotEmpty && compare(current, latest) < 0;
}
