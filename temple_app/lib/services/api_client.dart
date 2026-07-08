import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config/api_config.dart';

class ApiClient {
  static final ApiClient _instance = ApiClient._internal();
  factory ApiClient() => _instance;
  ApiClient._internal();

  String? _accessToken;
  String? _refreshToken;

  // Token management
  // Tokens are stored persistently using SharedPreferences and will remain
  // indefinitely (6+ months for mobile apps) until manually cleared via logout.
  // This allows local and mobile users to stay logged in for extended periods.
  
  /// Save authentication tokens to persistent storage (SharedPreferences)
  /// These tokens will persist across app restarts and only be removed on manual logout
  Future<void> saveTokens(String accessToken, String refreshToken) async {
    _accessToken = accessToken;
    _refreshToken = refreshToken;
    
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('access_token', accessToken);
    await prefs.setString('refresh_token', refreshToken);
  }

  /// Load authentication tokens from persistent storage
  /// This is called on app startup to restore the user session
  Future<void> loadTokens() async {
    final prefs = await SharedPreferences.getInstance();
    _accessToken = prefs.getString('access_token');
    _refreshToken = prefs.getString('refresh_token');
  }

  /// Clear authentication tokens from memory and persistent storage
  /// This is ONLY called during manual logout - tokens persist indefinitely otherwise
  Future<void> clearTokens() async {
    _accessToken = null;
    _refreshToken = null;
    
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('access_token');
    await prefs.remove('refresh_token');
  }

  String? get accessToken => _accessToken;
  String? get refreshToken => _refreshToken;
  bool get hasToken => _accessToken != null;

  // Generic GET request
  Future<Map<String, dynamic>> get(
    String endpoint, {
    Map<String, String>? queryParams,
    bool requiresAuth = true,
  }) async {
    try {
      if (requiresAuth && _accessToken == null) {
        await loadTokens();
      }

      final fullUrl = await ApiConfig.getFullUrl(endpoint);
      var uri = Uri.parse(fullUrl);
      if (queryParams != null) {
        uri = uri.replace(queryParameters: queryParams);
      }

      final response = await http.get(
        uri,
        headers: await ApiConfig.getHeaders(
          token: requiresAuth ? _accessToken : null,
        ),
      );

      return _handleResponse(response);
    } catch (e) {
      throw ApiException('GET request failed: $e');
    }
  }

  // Generic POST request
  Future<Map<String, dynamic>> post(
    String endpoint, {
    Map<String, dynamic>? body,
    bool requiresAuth = true,
    bool retryOn401 = true,
  }) async {
    try {
      if (requiresAuth && _accessToken == null) {
        await loadTokens();
      }

      final fullUrl = await ApiConfig.getFullUrl(endpoint);
      final response = await http.post(
        Uri.parse(fullUrl),
        headers: await ApiConfig.getHeaders(
          token: requiresAuth ? _accessToken : null,
        ),
        body: body != null ? jsonEncode(body) : null,
      );

      try {
        return _handleResponse(response);
      } on UnauthorizedException {
        // If we get 401 and haven't retried yet, try to refresh token
        if (retryOn401 && requiresAuth && _refreshToken != null) {
          print('Got 401, attempting to refresh token...');
          try {
            await refreshAccessToken();
            // Retry the request with new token
            return await post(endpoint, body: body, requiresAuth: requiresAuth, retryOn401: false);
          } catch (e) {
            print('Token refresh failed: $e');
            rethrow;
          }
        }
        rethrow;
      }
    } catch (e) {
      if (e is UnauthorizedException) rethrow;
      throw ApiException('POST request failed: $e');
    }
  }

  // Generic PUT request
  Future<Map<String, dynamic>> put(
    String endpoint, {
    Map<String, dynamic>? body,
    bool requiresAuth = true,
  }) async {
    try {
      if (requiresAuth && _accessToken == null) {
        await loadTokens();
      }

      final fullUrl = await ApiConfig.getFullUrl(endpoint);
      final response = await http.put(
        Uri.parse(fullUrl),
        headers: await ApiConfig.getHeaders(
          token: requiresAuth ? _accessToken : null,
        ),
        body: body != null ? jsonEncode(body) : null,
      );

      return _handleResponse(response);
    } catch (e) {
      throw ApiException('PUT request failed: $e');
    }
  }

  // Generic DELETE request
  Future<Map<String, dynamic>> delete(
    String endpoint, {
    bool requiresAuth = true,
  }) async {
    try {
      if (requiresAuth && _accessToken == null) {
        await loadTokens();
      }

      final fullUrl = await ApiConfig.getFullUrl(endpoint);
      final response = await http.delete(
        Uri.parse(fullUrl),
        headers: await ApiConfig.getHeaders(
          token: requiresAuth ? _accessToken : null,
        ),
      );

      return _handleResponse(response);
    } catch (e) {
      throw ApiException('DELETE request failed: $e');
    }
  }

  // Handle response
  Map<String, dynamic> _handleResponse(http.Response response) {
    if (response.statusCode >= 200 && response.statusCode < 300) {
      if (response.body.isEmpty) {
        return {'success': true};
      }
      // jsonDecode returns dynamic, which could be Map<dynamic, dynamic>
      // Explicitly cast to Map<String, dynamic>
      final decoded = jsonDecode(response.body);
      if (decoded is Map) {
        return Map<String, dynamic>.from(decoded);
      }
      return {'data': decoded};
    } else if (response.statusCode == 401) {
      throw UnauthorizedException('Unauthorized: ${response.body}');
    } else if (response.statusCode == 404) {
      throw NotFoundException('Not found: ${response.body}');
    } else {
      throw ApiException(
        'Request failed with status ${response.statusCode}: ${response.body}',
      );
    }
  }

  // Refresh access token
  Future<void> refreshAccessToken() async {
    if (_refreshToken == null) {
      throw UnauthorizedException('No refresh token available');
    }

    try {
      final response = await post(
        ApiConfig.refreshTokenEndpoint,
        body: {'refresh_token': _refreshToken},
        requiresAuth: false,
      );

      final newAccessToken = response['access_token'];
      final newRefreshToken = response['refresh_token'];
      
      await saveTokens(newAccessToken, newRefreshToken);
    } catch (e) {
      await clearTokens();
      throw UnauthorizedException('Failed to refresh token: $e');
    }
  }
}

// Custom exceptions
class ApiException implements Exception {
  final String message;
  ApiException(this.message);

  @override
  String toString() => message;
}

class UnauthorizedException extends ApiException {
  UnauthorizedException(String message) : super(message);
}

class NotFoundException extends ApiException {
  NotFoundException(String message) : super(message);
}
