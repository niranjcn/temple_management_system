import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:geolocator/geolocator.dart';
import 'package:permission_handler/permission_handler.dart';
import 'api_client.dart';

/// Location configuration from server
class LocationConfig {
  final String id;
  final String name;
  final double latitude;
  final double longitude;
  final double checkInRadius;
  final double outsideRadius;
  final String? address;
  final String? notes;
  final DateTime updatedAt;

  LocationConfig({
    required this.id,
    required this.name,
    required this.latitude,
    required this.longitude,
    required this.checkInRadius,
    required this.outsideRadius,
    this.address,
    this.notes,
    required this.updatedAt,
  });

  factory LocationConfig.fromJson(Map<String, dynamic> json) {
    return LocationConfig(
      id: json['id'] ?? '',
      name: json['name'] ?? '',
      latitude: (json['latitude'] ?? 0.0).toDouble(),
      longitude: (json['longitude'] ?? 0.0).toDouble(),
      checkInRadius: (json['check_in_radius'] ?? 100.0).toDouble(),
      outsideRadius: (json['outside_radius'] ?? 500.0).toDouble(),
      address: json['address'],
      notes: json['notes'],
      updatedAt: json['updated_at'] != null 
          ? DateTime.parse(json['updated_at']) 
          : DateTime.now(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'latitude': latitude,
      'longitude': longitude,
      'check_in_radius': checkInRadius,
      'outside_radius': outsideRadius,
      'address': address,
      'notes': notes,
      'updated_at': updatedAt.toIso8601String(),
    };
  }

  /// Get zone status based on distance
  String getZoneStatus(double distanceInMeters) {
    if (distanceInMeters <= checkInRadius) {
      return 'Inside Zone';
    } else if (distanceInMeters <= outsideRadius) {
      return 'Near Zone';
    } else {
      return 'Outside Zone';
    }
  }

  /// Check if user can check in/out
  bool canCheckInOut(double distanceInMeters) {
    return distanceInMeters <= checkInRadius;
  }

  /// Check if user is outside work zone
  bool isOutsideZone(double distanceInMeters) {
    return distanceInMeters > outsideRadius;
  }
}

/// Service for managing location configuration and GPS validation
class LocationService {
  static final LocationService _instance = LocationService._internal();
  factory LocationService() => _instance;
  LocationService._internal();

  final ApiClient _apiClient = ApiClient();
  static const String _locationConfigKey = 'location_config';
  static const String _lastFetchKey = 'location_config_last_fetch';

  LocationConfig? _cachedConfig;

  /// Fetch location configuration from server and store locally
  Future<LocationConfig?> fetchLocationConfig({bool forceRefresh = false}) async {
    try {
      // Check if we have a recent cached version (less than 1 hour old)
      if (!forceRefresh && _cachedConfig != null) {
        final prefs = await SharedPreferences.getInstance();
        final lastFetch = prefs.getString(_lastFetchKey);
        if (lastFetch != null) {
          final lastFetchTime = DateTime.parse(lastFetch);
          if (DateTime.now().difference(lastFetchTime).inHours < 1) {
            return _cachedConfig;
          }
        }
      }

      // Fetch from server
      final response = await _apiClient.get('/api/location/config');
      final config = LocationConfig.fromJson(response);

      // Store locally for offline access
      await _saveConfigLocally(config);
      _cachedConfig = config;

      return config;
    } catch (e) {
      print('Failed to fetch location config from server: $e');
      // Return cached/stored config if available
      return await getStoredLocationConfig();
    }
  }

  /// Save location config to local storage
  Future<void> _saveConfigLocally(LocationConfig config) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_locationConfigKey, jsonEncode(config.toJson()));
      await prefs.setString(_lastFetchKey, DateTime.now().toIso8601String());
    } catch (e) {
      print('Failed to save location config locally: $e');
    }
  }

  /// Get stored location configuration (for offline use)
  Future<LocationConfig?> getStoredLocationConfig() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final configJson = prefs.getString(_locationConfigKey);
      
      if (configJson != null) {
        final config = LocationConfig.fromJson(jsonDecode(configJson));
        _cachedConfig = config;
        return config;
      }
      
      return null;
    } catch (e) {
      print('Failed to get stored location config: $e');
      return null;
    }
  }

  /// Get current location configuration (from cache, storage, or server)
  Future<LocationConfig?> getLocationConfig() async {
    // Return cached if available
    if (_cachedConfig != null) {
      return _cachedConfig;
    }

    // Try to get from storage
    final stored = await getStoredLocationConfig();
    if (stored != null) {
      return stored;
    }

    // Fetch from server
    return await fetchLocationConfig();
  }

  /// Request location permissions
  Future<bool> requestLocationPermission() async {
    try {
      var status = await Permission.location.status;
      
      if (status.isDenied) {
        status = await Permission.location.request();
      }

      if (status.isPermanentlyDenied) {
        // User denied permission permanently, open app settings
        await openAppSettings();
        return false;
      }

      return status.isGranted;
    } catch (e) {
      print('Failed to request location permission: $e');
      return false;
    }
  }

  /// Check if location services are enabled
  Future<bool> isLocationServiceEnabled() async {
    return await Geolocator.isLocationServiceEnabled();
  }

  /// Get current GPS position
  Future<Position?> getCurrentPosition() async {
    try {
      // Check if location service is enabled
      if (!await isLocationServiceEnabled()) {
        throw Exception('Location services are disabled. Please enable them in settings.');
      }

      // Check permission
      if (!await requestLocationPermission()) {
        throw Exception('Location permission denied');
      }

      // Get current position
      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: const Duration(seconds: 30),
      );

      return position;
    } catch (e) {
      print('Failed to get current position: $e');
      return null;
    }
  }

  /// Calculate distance from temple/work location
  Future<Map<String, dynamic>> getDistanceFromWorkLocation() async {
    try {
      // Get location config
      final config = await getLocationConfig();
      if (config == null) {
        return {
          'success': false,
          'message': 'Location configuration not available. Please ensure admin has set up temple location in the web interface.',
          'distance': 0.0,
        };
      }

      // Get current position
      final position = await getCurrentPosition();
      if (position == null) {
        return {
          'success': false,
          'message': 'Unable to get GPS location. Please check location services.',
          'distance': 0.0,
        };
      }

      // Calculate distance in meters
      final distanceInMeters = Geolocator.distanceBetween(
        position.latitude,
        position.longitude,
        config.latitude,
        config.longitude,
      );

      return {
        'success': true,
        'distance': distanceInMeters,
        'latitude': position.latitude,
        'longitude': position.longitude,
        'accuracy': position.accuracy,
        'zoneStatus': config.getZoneStatus(distanceInMeters),
        'canCheckInOut': config.canCheckInOut(distanceInMeters),
        'isOutsideZone': config.isOutsideZone(distanceInMeters),
      };
    } catch (e) {
      print('Failed to get distance from work location: $e');
      return {
        'success': false,
        'message': 'Failed to calculate distance: ${e.toString()}',
        'distance': 0.0,
      };
    }
  }

  /// Validate if user is within check-in radius
  Future<Map<String, dynamic>> validateCheckInLocation() async {
    final result = await getDistanceFromWorkLocation();
    
    if (!result['success']) {
      return result;
    }

    final canCheckInOut = result['canCheckInOut'] as bool;
    final distance = result['distance'] as double;

    if (!canCheckInOut) {
      return {
        'success': false,
        'message': 'You are ${distance.toInt()}m away. Please come within check-in radius.',
        'distance': distance,
      };
    }

    return {
      'success': true,
      'message': 'Location validated successfully',
      'distance': distance,
      'latitude': result['latitude'],
      'longitude': result['longitude'],
    };
  }

  /// Clear cached configuration (force refresh on next fetch)
  void clearCache() {
    _cachedConfig = null;
  }

  /// Format distance for display
  String formatDistance(double distanceInMeters) {
    if (distanceInMeters < 1000) {
      return '${distanceInMeters.toInt()}m';
    } else {
      return '${(distanceInMeters / 1000).toStringAsFixed(2)}km';
    }
  }
}
