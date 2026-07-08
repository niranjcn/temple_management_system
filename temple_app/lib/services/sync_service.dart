import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'database_service.dart';
import '../models/attendance_model.dart';
import 'api_client.dart';
import '../config/api_config.dart';

/// Service for syncing offline attendance records to MongoDB
/// Uses existing attendance endpoints to upload pending records
class SyncService {
  static final SyncService _instance = SyncService._internal();
  factory SyncService() => _instance;
  SyncService._internal();

  final DatabaseService _dbService = DatabaseService();
  final ApiClient _apiClient = ApiClient();
  final Connectivity _connectivity = Connectivity();

  bool _isSyncing = false;
  StreamSubscription<List<ConnectivityResult>>? _connectivitySubscription;
  Timer? _periodicSyncTimer;

  /// Initialize sync service and start listening to connectivity changes
  Future<void> initialize() async {
    // Listen to connectivity changes
    _connectivitySubscription = _connectivity.onConnectivityChanged.listen((results) {
      // Check if any connection is available (not none)
      if (results.any((result) => result != ConnectivityResult.none)) {
        // Connected to internet, trigger sync
        syncPendingRecords();
      }
    });

    // Start periodic sync every 5 minutes
    _periodicSyncTimer = Timer.periodic(
      const Duration(minutes: 5),
      (_) => syncPendingRecords(),
    );

    print('SyncService initialized');
  }

  /// Check if device has internet connectivity
  Future<bool> hasConnectivity() async {
    try {
      final connectivityResults = await _connectivity.checkConnectivity();
      return connectivityResults.any((result) => result != ConnectivityResult.none);
    } catch (e) {
      print('Error checking connectivity: $e');
      return false;
    }
  }

  /// Sync all pending attendance records to server
  Future<Map<String, dynamic>> syncPendingRecords() async {
    if (_isSyncing) {
      return {
        'success': false,
        'message': 'Sync already in progress',
        'synced': 0,
        'failed': 0,
      };
    }

    // Check connectivity
    if (!await hasConnectivity()) {
      return {
        'success': false,
        'message': 'No internet connection',
        'synced': 0,
        'failed': 0,
      };
    }

    _isSyncing = true;
    int syncedCount = 0;
    int failedCount = 0;

    try {
      // Get all pending records from sync queue
      final pendingRecords = await _dbService.getSyncQueue();

      if (pendingRecords.isEmpty) {
        print('No pending records to sync');
        return {
          'success': true,
          'message': 'No pending records',
          'synced': 0,
          'failed': 0,
        };
      }

      print('Syncing ${pendingRecords.length} pending records...');

      // Sync each record
      for (var attendance in pendingRecords) {
        try {
          // Upload to server using existing attendance endpoint
          final success = await _uploadAttendanceToServer(attendance);

          if (success) {
            // Mark as synced in local database
            final updatedAttendance = attendance.copyWith(
              status: AttendanceStatus.synced,
            );
            await _dbService.updateAttendance(updatedAttendance);

            // Remove from sync queue
            final key = '${attendance.userId}_${attendance.date.year}-${attendance.date.month.toString().padLeft(2, '0')}-${attendance.date.day.toString().padLeft(2, '0')}';
            await _dbService.removeFromSyncQueue(key);

            syncedCount++;
            print('✅ Synced attendance for ${attendance.date}');
          } else {
            failedCount++;
            
            // Mark as failed
            final updatedAttendance = attendance.copyWith(
              status: AttendanceStatus.failed,
            );
            await _dbService.updateAttendance(updatedAttendance);
          }
        } catch (e) {
          print('❌ Error syncing record: $e');
          failedCount++;

          // Mark as failed
          final updatedAttendance = attendance.copyWith(
            status: AttendanceStatus.failed,
          );
          await _dbService.updateAttendance(updatedAttendance);
        }

        // Small delay between requests to avoid overwhelming server
        await Future.delayed(const Duration(milliseconds: 500));
      }

      final message = syncedCount > 0
          ? '✅ Synced $syncedCount record(s) successfully${failedCount > 0 ? ', $failedCount failed' : ''}'
          : '❌ Failed to sync $failedCount record(s)';

      return {
        'success': syncedCount > 0,
        'message': message,
        'synced': syncedCount,
        'failed': failedCount,
      };
    } catch (e) {
      print('Error in syncPendingRecords: $e');
      return {
        'success': false,
        'message': 'Sync error: $e',
        'synced': syncedCount,
        'failed': failedCount,
      };
    } finally {
      _isSyncing = false;
    }
  }

  /// Upload a single attendance record to server
  Future<bool> _uploadAttendanceToServer(Attendance attendance) async {
    try {
      // Prepare attendance data for backend
      final attendanceData = <String, dynamic>{
        'user_id': attendance.userId,
        'username': attendance.username,
        'attendance_date': '${attendance.date.year}-${attendance.date.month.toString().padLeft(2, '0')}-${attendance.date.day.toString().padLeft(2, '0')}',
        'is_present': attendance.isPresent,
        'overtime_hours': attendance.overtimeHours,
        'outside_hours': attendance.outsideHours,
      };

      // Add check-in time if available
      if (attendance.checkInTime != null) {
        attendanceData['check_in_time'] = attendance.checkInTime!;
      }

      // Add check-out time if available
      if (attendance.checkOutTime != null) {
        attendanceData['check_out_time'] = attendance.checkOutTime!;
      }

      // Add check-in location if available
      if (attendance.checkInLocation != null) {
        attendanceData['check_in_location'] = <String, dynamic>{
          'lat': attendance.checkInLocation!.latitude,
          'lon': attendance.checkInLocation!.longitude,
        };
      }

      // Add check-out location if available
      if (attendance.checkOutLocation != null) {
        attendanceData['check_out_location'] = <String, dynamic>{
          'lat': attendance.checkOutLocation!.latitude,
          'lon': attendance.checkOutLocation!.longitude,
        };
      }

      // Call backend API (POST to mark attendance endpoint)
      final response = await _apiClient.post(
        ApiConfig.markAttendanceEndpoint,
        body: attendanceData,
      );

      print('✅ Successfully uploaded attendance to server: ${response['id']}');
      return true;
    } on UnauthorizedException catch (e) {
      print('❌ Unauthorized - token might be invalid: $e');
      return false;
    } catch (e) {
      print('❌ Failed to upload attendance: $e');
      return false;
    }
  }

  /// Force sync a specific attendance record
  Future<bool> syncSingleRecord(Attendance attendance) async {
    if (!await hasConnectivity()) {
      return false;
    }

    try {
      final success = await _uploadAttendanceToServer(attendance);

      if (success) {
        // Update local record
        final updatedAttendance = attendance.copyWith(
          status: AttendanceStatus.synced,
        );
        await _dbService.updateAttendance(updatedAttendance);

        // Remove from sync queue
        final key = '${attendance.userId}_${attendance.date.year}-${attendance.date.month.toString().padLeft(2, '0')}-${attendance.date.day.toString().padLeft(2, '0')}';
        await _dbService.removeFromSyncQueue(key);
      }

      return success;
    } catch (e) {
      print('Error syncing single record: $e');
      return false;
    }
  }

  /// Get sync status
  Future<Map<String, dynamic>> getSyncStatus() async {
    final hasInternet = await hasConnectivity();
    final pendingCount = _dbService.getSyncQueueCount();
    final stats = await _dbService.getStatistics();

    return {
      'has_internet': hasInternet,
      'is_syncing': _isSyncing,
      'pending_count': pendingCount,
      'total_records': stats['total_records'],
    };
  }

  /// Cancel periodic sync and cleanup
  void dispose() {
    _connectivitySubscription?.cancel();
    _periodicSyncTimer?.cancel();
    print('SyncService disposed');
  }

  /// Manually trigger sync (exposed for UI button)
  Future<Map<String, dynamic>> manualSync() async {
    if (_isSyncing) {
      return {
        'success': false,
        'message': 'Sync already in progress',
      };
    }

    return await syncPendingRecords();
  }

  /// Check if currently syncing
  bool get isSyncing => _isSyncing;
}
