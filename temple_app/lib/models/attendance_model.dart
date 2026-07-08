enum AttendanceStatus {
  checkedIn,   // User has checked in, tracking location
  checkedOut,  // User has checked out for the day
  synced,      // Record synced to server
  pending,     // Pending sync to server
  failed,      // Sync failed
}

class LocationData {
  final double latitude;
  final double longitude;
  final DateTime timestamp;

  LocationData({
    required this.latitude,
    required this.longitude,
    required this.timestamp,
  });

  Map<String, dynamic> toJson() {
    return {
      'lat': latitude,
      'lon': longitude,
      'timestamp': timestamp.toIso8601String(),
    };
  }

  factory LocationData.fromJson(Map<String, dynamic> json) {
    return LocationData(
      latitude: (json['lat'] ?? 0.0).toDouble(),
      longitude: (json['lon'] ?? 0.0).toDouble(),
      timestamp: json['timestamp'] != null 
          ? DateTime.parse(json['timestamp']) 
          : DateTime.now(),
    );
  }
}

class Attendance {
  final String? id; // Optional for new records
  final String userId;
  final String username;
  final DateTime date;
  final bool isPresent;
  final String? checkInTime; // HH:MM format from backend
  final String? checkOutTime; // HH:MM format from backend
  final double overtimeHours;
  final double outsideHours; // Time spent outside work zone
  final AttendanceStatus status;
  final LocationData? checkInLocation;
  final LocationData? checkOutLocation;
  final double? distance; // Distance from temple in meters
  final String? notes;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final int? lastOutsideTimestamp; // Monotonic timestamp for outside tracking

  Attendance({
    this.id,
    required this.userId,
    required this.username,
    required this.date,
    required this.isPresent,
    this.checkInTime,
    this.checkOutTime,
    this.overtimeHours = 0.0,
    this.outsideHours = 0.0,
    required this.status,
    this.checkInLocation,
    this.checkOutLocation,
    this.distance,
    this.notes,
    this.createdAt,
    this.updatedAt,
    this.lastOutsideTimestamp,
  });

  // Parse backend response
  factory Attendance.fromJson(Map<String, dynamic> json) {
    LocationData? parseLocation(dynamic locJson) {
      if (locJson == null) return null;
      // Ensure the map is properly typed
      if (locJson is Map) {
        return LocationData.fromJson(Map<String, dynamic>.from(locJson));
      }
      return null;
    }

    return Attendance(
      id: json['_id'] ?? json['id'],
      userId: json['user_id'] ?? '',
      username: json['username'] ?? '',
      date: DateTime.parse(json['attendance_date']),
      isPresent: json['is_present'] ?? false,
      checkInTime: json['check_in_time'],
      checkOutTime: json['check_out_time'],
      overtimeHours: (json['overtime_hours'] ?? 0.0).toDouble(),
      outsideHours: (json['outside_hours'] ?? 0.0).toDouble(),
      status: AttendanceStatus.synced,
      checkInLocation: parseLocation(json['check_in_location']),
      checkOutLocation: parseLocation(json['check_out_location']),
      notes: json['notes'],
      createdAt: json['created_at'] != null ? DateTime.parse(json['created_at']) : null,
      updatedAt: json['updated_at'] != null ? DateTime.parse(json['updated_at']) : null,
    );
  }

  // Parse from local storage
  factory Attendance.fromLocalJson(Map<String, dynamic> json) {
    AttendanceStatus parseStatus(String? statusStr) {
      switch (statusStr) {
        case 'checkedIn': return AttendanceStatus.checkedIn;
        case 'checkedOut': return AttendanceStatus.checkedOut;
        case 'synced': return AttendanceStatus.synced;
        case 'pending': return AttendanceStatus.pending;
        case 'failed': return AttendanceStatus.failed;
        default: return AttendanceStatus.pending;
      }
    }

    LocationData? parseLocation(dynamic locJson) {
      if (locJson == null) return null;
      // Ensure the map is properly typed
      if (locJson is Map) {
        return LocationData.fromJson(Map<String, dynamic>.from(locJson));
      }
      return null;
    }

    return Attendance(
      id: json['id'],
      userId: json['user_id'] ?? '',
      username: json['username'] ?? '',
      date: DateTime.parse(json['date']),
      isPresent: json['is_present'] ?? false,
      checkInTime: json['check_in_time'],
      checkOutTime: json['check_out_time'],
      overtimeHours: (json['overtime_hours'] ?? 0.0).toDouble(),
      outsideHours: (json['outside_hours'] ?? 0.0).toDouble(),
      status: parseStatus(json['status']),
      checkInLocation: parseLocation(json['check_in_location']),
      checkOutLocation: parseLocation(json['check_out_location']),
      distance: json['distance']?.toDouble(),
      notes: json['notes'],
      createdAt: json['created_at'] != null ? DateTime.parse(json['created_at']) : null,
      updatedAt: json['updated_at'] != null ? DateTime.parse(json['updated_at']) : null,
      lastOutsideTimestamp: json['last_outside_timestamp'],
    );
  }

  // Convert to backend format for marking attendance
  Map<String, dynamic> toBackendJson() {
    return {
      'user_id': userId,
      'username': username,
      'attendance_date': '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}',
      'is_present': isPresent,
      if (checkInTime != null) 'check_in_time': checkInTime,
      if (checkOutTime != null) 'check_out_time': checkOutTime,
      'overtime_hours': overtimeHours,
      'outside_hours': outsideHours,
      if (checkInLocation != null) 'location': {
        'lat': checkInLocation!.latitude,
        'lon': checkInLocation!.longitude,
      },
      if (notes != null) 'notes': notes,
    };
  }

  // Convert to local JSON format
  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'user_id': userId,
      'username': username,
      'date': date.toIso8601String(),
      'is_present': isPresent,
      'check_in_time': checkInTime,
      'check_out_time': checkOutTime,
      'overtime_hours': overtimeHours,
      'outside_hours': outsideHours,
      'status': status.toString().split('.').last,
      if (checkInLocation != null) 'check_in_location': checkInLocation!.toJson(),
      if (checkOutLocation != null) 'check_out_location': checkOutLocation!.toJson(),
      'distance': distance,
      'notes': notes,
      if (createdAt != null) 'created_at': createdAt!.toIso8601String(),
      if (updatedAt != null) 'updated_at': updatedAt!.toIso8601String(),
      'last_outside_timestamp': lastOutsideTimestamp,
    };
  }

  String get statusText {
    switch (status) {
      case AttendanceStatus.checkedIn:
        return 'Checked In';
      case AttendanceStatus.checkedOut:
        return 'Checked Out';
      case AttendanceStatus.synced:
        return 'Synced';
      case AttendanceStatus.pending:
        return 'Pending';
      case AttendanceStatus.failed:
        return 'Failed';
    }
  }
  
  // Create a copy with updated fields
  Attendance copyWith({
    String? id,
    String? userId,
    String? username,
    DateTime? date,
    bool? isPresent,
    String? checkInTime,
    String? checkOutTime,
    double? overtimeHours,
    double? outsideHours,
    AttendanceStatus? status,
    LocationData? checkInLocation,
    LocationData? checkOutLocation,
    double? distance,
    String? notes,
    DateTime? createdAt,
    DateTime? updatedAt,
    int? lastOutsideTimestamp,
  }) {
    return Attendance(
      id: id ?? this.id,
      userId: userId ?? this.userId,
      username: username ?? this.username,
      date: date ?? this.date,
      isPresent: isPresent ?? this.isPresent,
      checkInTime: checkInTime ?? this.checkInTime,
      checkOutTime: checkOutTime ?? this.checkOutTime,
      overtimeHours: overtimeHours ?? this.overtimeHours,
      outsideHours: outsideHours ?? this.outsideHours,
      status: status ?? this.status,
      checkInLocation: checkInLocation ?? this.checkInLocation,
      checkOutLocation: checkOutLocation ?? this.checkOutLocation,
      distance: distance ?? this.distance,
      notes: notes ?? this.notes,
      createdAt: createdAt ?? this.createdAt,
      updatedAt: updatedAt ?? this.updatedAt,
      lastOutsideTimestamp: lastOutsideTimestamp ?? this.lastOutsideTimestamp,
    );
  }

  // Helper to get DateTime from time string
  DateTime? getCheckInDateTime() {
    if (checkInTime == null) return null;
    final parts = checkInTime!.split(':');
    if (parts.length != 2) return null;
    return DateTime(
      date.year,
      date.month,
      date.day,
      int.parse(parts[0]),
      int.parse(parts[1]),
    );
  }

  DateTime? getCheckOutDateTime() {
    if (checkOutTime == null) return null;
    final parts = checkOutTime!.split(':');
    if (parts.length != 2) return null;
    return DateTime(
      date.year,
      date.month,
      date.day,
      int.parse(parts[0]),
      int.parse(parts[1]),
    );
  }
}
