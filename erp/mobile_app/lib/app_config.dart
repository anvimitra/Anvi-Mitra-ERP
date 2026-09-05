class AppConfig {
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:4000',
  );

  static const String appName = String.fromEnvironment(
    'APP_NAME',
    defaultValue: 'Anvi Mitra School App',
  );

  static const String schoolSlug = String.fromEnvironment(
    'SCHOOL_SLUG',
    defaultValue: 'lsk-academy',
  );

  static const String logoUrl = String.fromEnvironment(
    'LOGO_URL',
    defaultValue: '',
  );

  static const String primaryColor = String.fromEnvironment(
    'PRIMARY_COLOR',
    defaultValue: '4F46E5',
  );

  static const String secondaryColor = String.fromEnvironment(
    'SECONDARY_COLOR',
    defaultValue: '0F172A',
  );

  static int _hexColor(String value, int fallback) {
    final normalized = value.replaceFirst('#', '').trim();
    final parsed = int.tryParse(normalized, radix: 16);
    if (parsed == null || normalized.length != 6) return fallback;
    return parsed;
  }

  static int get primaryColorValue => _hexColor(primaryColor, 0xFF4F46E5);
  static int get secondaryColorValue => _hexColor(secondaryColor, 0xFF0F172A);
}
