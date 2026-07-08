import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

class ApiConfig {
  // Secure storage instance for sensitive configuration
  static const _storage = FlutterSecureStorage();
  
  // Storage keys
  static const String _publicUrlKey = 'public_backend_url';
  static const String _adminUrlKey = 'admin_backend_url';
  static const String _appSecretKey = 'app_secret';
  
  // Default fallback values (only used if nothing is configured)
  static const String _defaultPublicUrl = 'http://localhost:8080';
  static const String _defaultAdminUrl = 'http://localhost:8081';
  static const String _defaultSecret = '';
  
  // Common ports to try when auto-detecting
  static const List<int> _commonPorts = [80, 443, 8080, 8081, 8000, 5000, 3000];
  
  // Endpoint-to-backend mapping
  // Public API endpoints (8080)
  static const Set<String> _publicApiEndpoints = {
    '/api/auth/login',
    '/api/auth/logout',
    '/api/auth/refresh-token',
    '/api/auth/register',
    '/api/auth/verify-token',
    '/api/rituals',
    '/api/events',
    '/api/bookings',
    '/api/gallery',
    '/api/gallery-layout',
    '/api/gallery-home-preview',
    '/api/slideshow',
    '/api/featured-event',
    '/api/events-section',
    '/api/calendar',
    '/api/committee',  // GET only on public
  };
  
  // Admin API endpoints (8081)
  // Everything not in public endpoints goes to admin API
  
  /// Get the configured Public API backend URL
  /// Returns stored URL or default if not configured
  static Future<String> getPublicUrl() async {
    try {
      final url = await _storage.read(key: _publicUrlKey);
      return url ?? _defaultPublicUrl;
    } catch (e) {
      print('Error reading public backend URL: $e');
      return _defaultPublicUrl;
    }
  }
  
  /// Get the configured Admin API backend URL
  /// Returns stored URL or default if not configured
  static Future<String> getAdminUrl() async {
    try {
      final url = await _storage.read(key: _adminUrlKey);
      return url ?? _defaultAdminUrl;
    } catch (e) {
      print('Error reading admin backend URL: $e');
      return _defaultAdminUrl;
    }
  }
  
  /// Backward compatibility: Get base URL (defaults to public URL)
  static Future<String> getBaseUrl() async {
    return await getPublicUrl();
  }
  
  /// Get the configured app secret
  /// Returns stored secret or default if not configured
  static Future<String> getAppSecret() async {
    try {
      final secret = await _storage.read(key: _appSecretKey);
      return secret ?? _defaultSecret;
    } catch (e) {
      print('Error reading app secret: $e');
      return _defaultSecret;
    }
  }
  
  /// Save Public API backend URL to secure storage
  static Future<void> savePublicUrl(String url) async {
    try {
      // Clean up the URL (remove trailing slashes)
      final cleanUrl = url.trim().replaceAll(RegExp(r'/+$'), '');
      await _storage.write(key: _publicUrlKey, value: cleanUrl);
      print('✓ Public API URL saved: $cleanUrl');
    } catch (e) {
      print('Error saving public API URL: $e');
      rethrow;
    }
  }
  
  /// Save Admin API backend URL to secure storage
  static Future<void> saveAdminUrl(String url) async {
    try {
      // Clean up the URL (remove trailing slashes)
      final cleanUrl = url.trim().replaceAll(RegExp(r'/+$'), '');
      await _storage.write(key: _adminUrlKey, value: cleanUrl);
      print('✓ Admin API URL saved: $cleanUrl');
    } catch (e) {
      print('Error saving admin API URL: $e');
      rethrow;
    }
  }
  
  /// Backward compatibility: Save backend URL (saves to both public and admin)
  static Future<void> saveBaseUrl(String url) async {
    // For backward compatibility, save to public URL
    await savePublicUrl(url);
  }
  
  /// Save app secret to secure storage
  static Future<void> saveAppSecret(String secret) async {
    try {
      await _storage.write(key: _appSecretKey, value: secret.trim());
      print('✓ App secret saved');
    } catch (e) {
      print('Error saving app secret: $e');
      rethrow;
    }
  }
  
  /// Check if configuration exists
  static Future<bool> isConfigured() async {
    try {
      final publicUrl = await _storage.read(key: _publicUrlKey);
      final adminUrl = await _storage.read(key: _adminUrlKey);
      final secret = await _storage.read(key: _appSecretKey);
      
      // At minimum, we need public URL and secret
      return publicUrl != null && publicUrl.isNotEmpty && 
             secret != null && secret.isNotEmpty;
    } catch (e) {
      print('Error checking configuration: $e');
      return false;
    }
  }
  
  /// Clear all configuration (for Super Admin reset)
  static Future<void> clearConfiguration() async {
    try {
      await _storage.delete(key: _publicUrlKey);
      await _storage.delete(key: _adminUrlKey);
      await _storage.delete(key: _appSecretKey);
      print('✓ Configuration cleared');
    } catch (e) {
      print('Error clearing configuration: $e');
      rethrow;
    }
  }
  
  /// Auto-detect port for a given IP address
  /// Tests common ports and returns the first working URL
  /// If user provides full URL with port, that is used directly
  static Future<String?> autoDetectPort(String ipOrUrl) async {
    final input = ipOrUrl.trim();
    
    // Check if user already provided a full URL with protocol
    if (input.startsWith('http://') || input.startsWith('https://')) {
      // Check if it has a port already
      final uri = Uri.tryParse(input);
      if (uri != null && uri.hasPort) {
        // User provided full URL with port, use it directly
        final isReachable = await testConnection(input);
        return isReachable ? input : null;
      }
      // Has protocol but no port, try common ports
      final baseUrl = input;
      return await _tryCommonPorts(baseUrl);
    }
    
    // No protocol provided, assume it's just IP/hostname
    // Try HTTP first (most common for local development)
    String? result = await _tryCommonPorts('http://$input');
    if (result != null) return result;
    
    // Try HTTPS as fallback
    result = await _tryCommonPorts('https://$input');
    return result;
  }
  
  /// Try common ports on a base URL
  static Future<String?> _tryCommonPorts(String baseUrl) async {
    for (final port in _commonPorts) {
      final testUrl = '$baseUrl:$port';
      print('Testing: $testUrl');
      
      final isReachable = await testConnection(testUrl);
      if (isReachable) {
        print('✓ Found working backend at: $testUrl');
        return testUrl;
      }
    }
    return null;
  }
  
  /// Test if a backend URL is reachable
  static Future<bool> testConnection(String url) async {
    try {
      final testUrl = '$url/api';  // Test a common endpoint
      final response = await http.get(
        Uri.parse(testUrl),
      ).timeout(const Duration(seconds: 2));
      
      // Consider it reachable if we get any response (even 404)
      return response.statusCode < 500;
    } catch (e) {
      return false;
    }
  }
  
  // API endpoints (same as before)
  static const String loginEndpoint = '/api/auth/login';
  static const String logoutEndpoint = '/api/auth/logout';
  static const String verifyTokenEndpoint = '/api/auth/verify-token';
  static const String refreshTokenEndpoint = '/api/auth/refresh-token';
  
  // Attendance endpoints
  static const String markAttendanceEndpoint = '/api/attendance/mark';
  static const String attendanceRecordsEndpoint = '/api/attendance/records';
  static const String attendanceDashboardEndpoint = '/api/attendance/dashboard';
  static const String attendanceReportEndpoint = '/api/attendance/report';
  
  /// Get headers with dynamically loaded secret
  /// This is now async because we need to read from secure storage
  static Future<Map<String, String>> getHeaders({String? token}) async {
    final appSecret = await getAppSecret();
    
    final headers = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      // Mobile verification header - required by backend
      'X-Mobile-Auth': appSecret,
      // Note: We intentionally don't set Origin header
      // Mobile apps don't need it and it may cause CORS issues
    };
    
    if (token != null) {
      headers['Authorization'] = 'Bearer $token';
    }
    
    return headers;
  }
  
  /// Get full URL for an endpoint
  /// Automatically routes to Public API or Admin API based on endpoint
  static Future<String> getFullUrl(String endpoint) async {
    // Check if this endpoint belongs to Public API
    bool isPublicEndpoint = false;
    
    for (final publicEndpoint in _publicApiEndpoints) {
      if (endpoint.startsWith(publicEndpoint)) {
        isPublicEndpoint = true;
        break;
      }
    }
    
    // Route to appropriate backend
    if (isPublicEndpoint) {
      final publicUrl = await getPublicUrl();
      print('📍 Routing to Public API: $publicUrl$endpoint');
      return '$publicUrl$endpoint';
    } else {
      final adminUrl = await getAdminUrl();
      print('📍 Routing to Admin API: $adminUrl$endpoint');
      return '$adminUrl$endpoint';
    }
  }
}

