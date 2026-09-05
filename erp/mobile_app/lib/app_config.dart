class AppConfig {
  static const String apiBaseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://localhost:4000');
  static const String appName = String.fromEnvironment('APP_NAME', defaultValue: 'Anvi Mitra School App');
}
