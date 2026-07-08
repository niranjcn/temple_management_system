import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import '../models/user_model.dart';
import '../config/api_config.dart';
import 'api_client.dart';

class AuthService {
  static final AuthService _instance = AuthService._internal();
  factory AuthService() => _instance;
  AuthService._internal();

  final ApiClient _apiClient = ApiClient();
  User? _currentUser;

  /// Decode JWT token to extract user information
  Map<String, dynamic>? _decodeJwt(String token) {
    try {
      final parts = token.split('.');
      if (parts.length != 3) return null;
      
      final payload = parts[1];
      final normalized = base64Url.normalize(payload);
      final decoded = utf8.decode(base64Url.decode(normalized));
      return json.decode(decoded);
    } catch (e) {
      print('Error decoding JWT: $e');
      return null;
    }
  }

  Future<Map<String, dynamic>> login(String username, String password) async {
    try {
      // Call backend login API
      final response = await _apiClient.post(
        ApiConfig.loginEndpoint,
        body: {
          'username': username,
          'password': password,
        },
        requiresAuth: false,
      );

      // Extract tokens from response
      final accessToken = response['access_token'];
      final refreshToken = response['refresh_token'];
      
      // Decode JWT to get user information
      final tokenData = _decodeJwt(accessToken);
      if (tokenData == null) {
        return {
          'success': false,
          'message': 'Failed to decode authentication token',
        };
      }
      
      // Save tokens
      await _apiClient.saveTokens(accessToken, refreshToken);

      // Fetch complete profile from server
      try {
        final profileData = await _apiClient.get('/api/profile/me');
        _currentUser = User.fromJson(profileData);
        
        // Save complete user data to shared preferences
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('userProfile', json.encode(_currentUser!.toJson()));
      } catch (e) {
        print('Error fetching profile: $e');
        // Fallback to JWT data if profile fetch fails
        _currentUser = User(
          id: tokenData['user_id'] ?? username,
          name: tokenData['sub'] ?? username,
          email: '$username@temple.com',
          username: username,
          role: tokenData['role'] ?? 'Priest',
          roleId: tokenData['role_id'],
        );
        
        // Save basic user data
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('userId', _currentUser!.id);
        await prefs.setString('userName', _currentUser!.name);
        await prefs.setString('userEmail', _currentUser!.email);
        await prefs.setString('userRole', _currentUser!.role);
        if (_currentUser!.roleId != null) {
          await prefs.setInt('userRoleId', _currentUser!.roleId!);
        }
      }

      return {
        'success': true,
        'message': 'Login successful',
        'user': _currentUser,
      };
    } on UnauthorizedException {
      return {
        'success': false,
        'message': 'Invalid username or password',
      };
    } catch (e) {
      print('Login error: $e');
      return {
        'success': false,
        'message': 'Connection error. Please check your network.',
      };
    }
  }
  
  /// Fetch complete user profile from server
  /// This should be called periodically to keep profile data fresh
  Future<User?> fetchCompleteProfile() async {
    try {
      final profileData = await _apiClient.get('/api/profile/me');
      _currentUser = User.fromJson(profileData);
      
      // Save to shared preferences
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('userProfile', json.encode(_currentUser!.toJson()));
      
      return _currentUser;
    } catch (e) {
      print('Error fetching profile: $e');
      return null;
    }
  }

  /// Logout the current user
  /// This is the ONLY way to clear authentication tokens on mobile.
  /// Tokens persist for 6+ months and are not automatically cleared.
  /// User must explicitly logout to end their session.
  Future<void> logout() async {
    try {
      // Call backend logout endpoint to revoke tokens on server
      await _apiClient.post(ApiConfig.logoutEndpoint);
    } catch (e) {
      print('Logout error: $e');
    } finally {
      // Clear tokens and user data from local storage
      // This is the ONLY place where tokens are removed
      await _apiClient.clearTokens();
      _currentUser = null;
      
      // Clear user data from shared preferences
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove('userId');
      await prefs.remove('userName');
      await prefs.remove('userEmail');
      await prefs.remove('userRole');
      await prefs.remove('userRoleId');
      await prefs.remove('userProfile');
      await prefs.remove('userPhotoUrl');
      await prefs.remove('userPhone');
    }
  }

  User? getCurrentUser() {
    return _currentUser;
  }

  bool isLoggedIn() {
    return _currentUser != null && _apiClient.hasToken;
  }

  Future<void> loadUserFromPreferences() async {
    final prefs = await SharedPreferences.getInstance();
    
    // Try to load complete profile first
    final userProfileJson = prefs.getString('userProfile');
    if (userProfileJson != null) {
      try {
        final profileData = json.decode(userProfileJson);
        _currentUser = User.fromJson(profileData);
        await _apiClient.loadTokens();
        return;
      } catch (e) {
        print('Error loading user profile: $e');
      }
    }
    
    // Fallback to old format for backward compatibility
    final userId = prefs.getString('userId');
    if (userId != null) {
      _currentUser = User(
        id: userId,
        name: prefs.getString('userName') ?? '',
        email: prefs.getString('userEmail') ?? '',
        username: prefs.getString('userName') ?? '',
        role: prefs.getString('userRole') ?? 'Priest',
        roleId: prefs.getInt('userRoleId'),
        photoUrl: prefs.getString('userPhotoUrl'),
        phone: prefs.getString('userPhone'),
      );
      
      // Load tokens
      await _apiClient.loadTokens();
    }
  }

  /// Restore user session from saved data
  Future<bool> restoreSession() async {
    try {
      await loadUserFromPreferences();
      return _currentUser != null && _apiClient.hasToken;
    } catch (e) {
      print('Error restoring session: $e');
      return false;
    }
  }

  Future<Map<String, dynamic>> updateProfile(User updatedUser) async {
    try {
      // Update local user object
      _currentUser = updatedUser;
      
      // Save to shared preferences
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString('userId', updatedUser.id);
      await prefs.setString('userName', updatedUser.name);
      await prefs.setString('userEmail', updatedUser.email);
      await prefs.setString('userRole', updatedUser.role);
      if (updatedUser.phone != null && updatedUser.phone!.isNotEmpty) {
        await prefs.setString('userPhone', updatedUser.phone!);
      }
      
      return {
        'success': true,
        'message': 'Profile updated successfully',
        'user': _currentUser,
      };
    } catch (e) {
      return {
        'success': false,
        'message': 'Failed to update profile',
      };
    }
  }
}
