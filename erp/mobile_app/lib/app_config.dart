class AppConfig {
  static const apiBaseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://localhost:4000');
  static const appName = String.fromEnvironment('APP_NAME', defaultValue: 'Anvi Mitra School App');
  static const schoolCode = String.fromEnvironment('SCHOOL_CODE', defaultValue: 'LSK');
}
