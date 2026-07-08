/// Temple Location Configuration
/// 
/// Defines the GPS coordinates and radius settings for the temple attendance system.
/// Update these values with the actual temple location coordinates.

class LocationConfig {
  // Temple GPS Coordinates
  // TODO: Update with actual temple coordinates
  static const double templeLatitude = 10.8505;  // Example: Kerala coordinates
  static const double templeLongitude = 76.2711;

  // Radius configurations (in meters)
  static const double checkInRadius = 100.0;  // Must be within 100m to check in/out
  static const double outsideRadius = 500.0;  // >500m is considered "outside zone"
  
  // Location update intervals (in seconds)
  static const int locationUpdateInterval = 30;  // Check location every 30 seconds
  static const int locationUpdateIntervalFast = 10;  // Fast updates when near boundary
  
  // Accuracy settings
  static const double desiredAccuracy = 10.0;  // Desired GPS accuracy in meters
  
  // Distance threshold for fast updates (in meters)
  static const double fastUpdateThreshold = 150.0;  // Start fast updates at 150m from boundary
  
  // Timeout settings
  static const Duration locationTimeout = Duration(seconds: 30);
  
  // Zone status
  static String getZoneStatus(double distanceInMeters) {
    if (distanceInMeters <= checkInRadius) {
      return 'Inside Zone';
    } else if (distanceInMeters <= outsideRadius) {
      return 'Near Zone';
    } else {
      return 'Outside Zone';
    }
  }
  
  static bool canCheckIn(double distanceInMeters) {
    return distanceInMeters <= checkInRadius;
  }
  
  static bool isOutsideZone(double distanceInMeters) {
    return distanceInMeters > outsideRadius;
  }
}
