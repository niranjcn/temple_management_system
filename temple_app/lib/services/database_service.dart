import 'package:hive_flutter/hive_flutter.dart';
import '../models/attendance_model.dart';

/// Local database service using Hive for offline storage
/// Manages attendance records, sync queue, and tracking state
class DatabaseService {
  static final DatabaseService _instance = DatabaseService._internal();
  factory DatabaseService() => _instance;
  DatabaseService._internal();

  // Box names
  static const String attendanceBoxName = 'attendance_records';
  static const String syncQueueBoxName = 'sync_queue';
  static const String trackingStateBoxName = 'tracking_state';
  static const String settingsBoxName = 'app_settings';

  // Box instances
  Box<Map>? _attendanceBox;
  Box<Map>? _syncQueueBox;
  Box<Map>? _trackingStateBox;
  Box<dynamic>? _settingsBox;

  bool _isInitialized = false;

  /// Initialize Hive and open boxes
  Future<void> initialize() async {
    if (_isInitialized) return;

    await Hive.initFlutter();
    
    _attendanceBox = await Hive.openBox<Map>(attendanceBoxName);
    _syncQueueBox = await Hive.openBox<Map>(syncQueueBoxName);
    _trackingStateBox = await Hive.openBox<Map>(trackingStateBoxName);
    _settingsBox = await Hive.openBox(settingsBoxName);

    _isInitialized = true;
  }

  void _ensureInitialized() {
    if (!_isInitialized) {
      throw Exception('DatabaseService not initialized. Call initialize() first.');
    }
  }

  // ========== Attendance Records ==========

  /// Save attendance record locally
  Future<void> saveAttendance(Attendance attendance) async {
    _ensureInitialized();
    final key = _generateAttendanceKey(attendance.userId, attendance.date);
    final data = Map<String, dynamic>.from(attendance.toJson());
    await _attendanceBox!.put(key, data);
  }

  /// Get attendance record for a specific date
  Future<Attendance?> getAttendanceForDate(String userId, DateTime date) async {
    _ensureInitialized();
    final key = _generateAttendanceKey(userId, date);
    final data = _attendanceBox!.get(key);
    if (data == null) return null;
    return Attendance.fromLocalJson(Map<String, dynamic>.from(data));
  }

  /// Get today's attendance record
  Future<Attendance?> getTodayAttendance(String userId) async {
    return await getAttendanceForDate(userId, DateTime.now());
  }

  /// Get all attendance records for a user
  Future<List<Attendance>> getAllAttendances(String userId) async {
    _ensureInitialized();
    final records = <Attendance>[];
    
    for (var key in _attendanceBox!.keys) {
      final keyStr = key.toString();
      if (keyStr.startsWith(userId)) {
        final data = _attendanceBox!.get(key);
        if (data != null) {
          records.add(Attendance.fromLocalJson(Map<String, dynamic>.from(data)));
        }
      }
    }
    
    // Sort by date descending
    records.sort((a, b) => b.date.compareTo(a.date));
    return records;
  }

  /// Delete attendance record
  Future<void> deleteAttendance(String userId, DateTime date) async {
    _ensureInitialized();
    final key = _generateAttendanceKey(userId, date);
    await _attendanceBox!.delete(key);
  }

  /// Update attendance record
  Future<void> updateAttendance(Attendance attendance) async {
    await saveAttendance(attendance);
  }

  String _generateAttendanceKey(String userId, DateTime date) {
    final dateStr = '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
    return '${userId}_$dateStr';
  }

  // ========== Sync Queue ==========

  /// Add record to sync queue
  Future<void> addToSyncQueue(Attendance attendance) async {
    _ensureInitialized();
    final key = DateTime.now().millisecondsSinceEpoch.toString();
    final data = Map<String, dynamic>.from(attendance.toJson());
    await _syncQueueBox!.put(key, data);
  }

  /// Get all pending sync records
  Future<List<Attendance>> getSyncQueue() async {
    _ensureInitialized();
    final records = <Attendance>[];
    
    for (var key in _syncQueueBox!.keys) {
      final data = _syncQueueBox!.get(key);
      if (data != null) {
        records.add(Attendance.fromLocalJson(Map<String, dynamic>.from(data)));
      }
    }
    
    return records;
  }

  /// Remove record from sync queue
  Future<void> removeFromSyncQueue(String timestamp) async {
    _ensureInitialized();
    await _syncQueueBox!.delete(timestamp);
  }

  /// Clear entire sync queue
  Future<void> clearSyncQueue() async {
    _ensureInitialized();
    await _syncQueueBox!.clear();
  }

  /// Get sync queue count
  int getSyncQueueCount() {
    _ensureInitialized();
    return _syncQueueBox!.length;
  }

  // ========== Tracking State ==========

  /// Save tracking state (used for calculating outside hours)
  Future<void> saveTrackingState({
    required String userId,
    required bool isTracking,
    required bool isOutside,
    int? lastOutsideTimestamp,
    double? outsideHours,
    DateTime? lastLocationUpdate,
    double? lastLatitude,
    double? lastLongitude,
  }) async {
    _ensureInitialized();
    final state = {
      'user_id': userId,
      'is_tracking': isTracking,
      'is_outside': isOutside,
      'last_outside_timestamp': lastOutsideTimestamp,
      'outside_hours': outsideHours,
      'last_location_update': lastLocationUpdate?.toIso8601String(),
      'last_latitude': lastLatitude,
      'last_longitude': lastLongitude,
      'updated_at': DateTime.now().toIso8601String(),
    };
    await _trackingStateBox!.put(userId, state);
  }

  /// Get tracking state
  Future<Map<String, dynamic>?> getTrackingState(String userId) async {
    _ensureInitialized();
    final data = _trackingStateBox!.get(userId);
    if (data == null) return null;
    return Map<String, dynamic>.from(data);
  }

  /// Clear tracking state
  Future<void> clearTrackingState(String userId) async {
    _ensureInitialized();
    await _trackingStateBox!.delete(userId);
  }

  // ========== Settings ==========

  /// Save a setting
  Future<void> saveSetting(String key, dynamic value) async {
    _ensureInitialized();
    await _settingsBox!.put(key, value);
  }

  /// Get a setting
  dynamic getSetting(String key, {dynamic defaultValue}) {
    _ensureInitialized();
    return _settingsBox!.get(key, defaultValue: defaultValue);
  }

  /// Delete a setting
  Future<void> deleteSetting(String key) async {
    _ensureInitialized();
    await _settingsBox!.delete(key);
  }

  // ========== Utility ==========

  /// Clear all data (use with caution)
  Future<void> clearAll() async {
    _ensureInitialized();
    await _attendanceBox!.clear();
    await _syncQueueBox!.clear();
    await _trackingStateBox!.clear();
    await _settingsBox!.clear();
  }

  /// Close all boxes
  Future<void> close() async {
    await _attendanceBox?.close();
    await _syncQueueBox?.close();
    await _trackingStateBox?.close();
    await _settingsBox?.close();
    _isInitialized = false;
  }

  /// Get database statistics
  Future<Map<String, int>> getStatistics() async {
    _ensureInitialized();
    return {
      'total_records': _attendanceBox!.length,
      'pending_sync': _syncQueueBox!.length,
      'tracking_states': _trackingStateBox!.length,
    };
  }
}
