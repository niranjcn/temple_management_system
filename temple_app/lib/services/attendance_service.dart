import 'package:intl/intl.dart';
import '../models/attendance_model.dart';
import '../config/api_config.dart';
import 'api_client.dart';
import 'auth_service.dart';
import 'location_service.dart';
import 'database_service.dart';
import 'sync_service.dart';

class AttendanceService {
  static final AttendanceService _instance = AttendanceService._internal();
  factory AttendanceService() => _instance;
  
  AttendanceService._internal();

  final ApiClient _apiClient = ApiClient();
  final AuthService _authService = AuthService();
  final LocationService _locationService = LocationService();
  final DatabaseService _dbService = DatabaseService();
  final SyncService _syncService = SyncService();

  // Get distance to temple using GPS
  Future<Map<String, dynamic>> getDistanceToTemple() async {
    return await _locationService.getDistanceFromWorkLocation();
  }

  // Mark attendance for today (Check In)
  Future<Map<String, dynamic>> markAttendance() async {
    try {
      final user = _authService.getCurrentUser();
      if (user == null) {
        return {
          'success': false,
          'message': 'User not logged in',
        };
      }

      // Validate GPS location
      final locationValidation = await _locationService.validateCheckInLocation();
      if (!locationValidation['success']) {
        return locationValidation;
      }

      final now = DateTime.now();
      final timeFormat = DateFormat('HH:mm');
      
      // Create attendance record with GPS location
      final attendanceData = {
        'user_id': user.id,
        'username': user.username,
        'attendance_date': DateFormat('yyyy-MM-dd').format(now),
        'is_present': true,
        'check_in_time': timeFormat.format(now),
        'overtime_hours': 0.0,
        'outside_hours': 0.0,
        'check_in_location': {
          'lat': locationValidation['latitude'],
          'lon': locationValidation['longitude'],
        },
      };

      Attendance? attendance;

      // Try to call backend API if connected
      if (await _syncService.hasConnectivity()) {
        try {
          final response = await _apiClient.post(
            ApiConfig.markAttendanceEndpoint,
            body: attendanceData,
          );

          // Create Attendance object from response and mark as synced
          attendance = Attendance.fromJson(response).copyWith(
            status: AttendanceStatus.synced,
          );

          // Save to local database
          await _dbService.saveAttendance(attendance);

          return {
            'success': true,
            'message': '✅ Check-in successful! Distance: ${_locationService.formatDistance(locationValidation['distance'])}',
            'attendance': attendance,
          };
        } catch (e) {
          print('API call failed, saving offline: $e');
          // Fall through to offline storage
        }
      }

      // Save offline if no connectivity or API failed
      attendance = Attendance(
        id: DateTime.now().millisecondsSinceEpoch.toString(),
        userId: user.id,
        username: user.username,
        date: now,
        isPresent: true,
        checkInTime: timeFormat.format(now),
        overtimeHours: 0.0,
        outsideHours: 0.0,
        status: AttendanceStatus.pending,
        checkInLocation: LocationData(
          latitude: locationValidation['latitude'],
          longitude: locationValidation['longitude'],
          timestamp: now,
        ),
      );

      // Save to local database
      await _dbService.saveAttendance(attendance);

      // Add to sync queue
      await _dbService.addToSyncQueue(attendance);

      return {
        'success': true,
        'message': '✅ Check-in saved offline. Will sync when connected. Distance: ${_locationService.formatDistance(locationValidation['distance'])}',
        'attendance': attendance,
      };
    } on UnauthorizedException {
      return {
        'success': false,
        'message': 'Unauthorized. Please login again.',
      };
    } catch (e) {
      print('Mark attendance error: $e');
      return {
        'success': false,
        'message': 'Failed to mark attendance. Please try again.',
      };
    }
  }

  // Mark check-out
  Future<Map<String, dynamic>> markCheckOut() async {
    try {
      final user = _authService.getCurrentUser();
      if (user == null) {
        return {
          'success': false,
          'message': 'User not logged in',
        };
      }

      // Get today's attendance to update it
      final todayAttendance = await _dbService.getTodayAttendance(user.id);
      if (todayAttendance == null || todayAttendance.checkInTime == null) {
        return {
          'success': false,
          'message': 'You must check in first before checking out!',
        };
      }

      if (todayAttendance.checkOutTime != null) {
        return {
          'success': false,
          'message': 'You have already checked out for today.',
        };
      }

      // Validate GPS location (must be within check-in radius to check out)
      final locationValidation = await _locationService.validateCheckInLocation();
      if (!locationValidation['success']) {
        return {
          'success': false,
          'message': 'You must be within the work location to check out. ${locationValidation['message']}',
        };
      }

      final now = DateTime.now();
      final timeFormat = DateFormat('HH:mm');
      
      // Update attendance record with check-out time and location
      final attendanceData = {
        'user_id': user.id,
        'username': user.username,
        'attendance_date': DateFormat('yyyy-MM-dd').format(todayAttendance.date),
        'is_present': true,
        'check_in_time': todayAttendance.checkInTime, // Keep existing check-in
        'check_out_time': timeFormat.format(now),
        'overtime_hours': 0.0,
        'outside_hours': 0.0, // Will be calculated by background service
        'check_in_location': todayAttendance.checkInLocation != null ? {
          'lat': todayAttendance.checkInLocation!.latitude,
          'lon': todayAttendance.checkInLocation!.longitude,
        } : null,
        'check_out_location': {
          'lat': locationValidation['latitude'],
          'lon': locationValidation['longitude'],
        },
      };

      // Update local attendance object
      final updatedAttendance = todayAttendance.copyWith(
        checkOutTime: timeFormat.format(now),
        checkOutLocation: LocationData(
          latitude: locationValidation['latitude'],
          longitude: locationValidation['longitude'],
          timestamp: now,
        ),
        status: AttendanceStatus.pending, // Will be synced
      );

      // Try to call backend API if connected
      if (await _syncService.hasConnectivity()) {
        try {
          final response = await _apiClient.post(
            ApiConfig.markAttendanceEndpoint,
            body: attendanceData,
          );

          // Update with synced status
          final syncedAttendance = Attendance.fromJson(response).copyWith(
            status: AttendanceStatus.synced,
          );

          // Save to local database
          await _dbService.saveAttendance(syncedAttendance);

          return {
            'success': true,
            'message': '✅ Check-out successful! Distance: ${_locationService.formatDistance(locationValidation['distance'])}',
            'attendance': syncedAttendance,
          };
        } catch (e) {
          print('API call failed, saving offline: $e');
          // Fall through to offline storage
        }
      }

      // Save offline if no connectivity or API failed
      await _dbService.saveAttendance(updatedAttendance);
      
      // Add to sync queue (will update on server when connected)
      await _dbService.addToSyncQueue(updatedAttendance);

      return {
        'success': true,
        'message': '✅ Check-out saved offline. Will sync when connected. Distance: ${_locationService.formatDistance(locationValidation['distance'])}',
        'attendance': updatedAttendance,
      };
    } on UnauthorizedException {
      return {
        'success': false,
        'message': 'Unauthorized. Please login again.',
      };
    } catch (e) {
      print('Mark check-out error: $e');
      return {
        'success': false,
        'message': 'Failed to mark check-out. Please try again.',
      };
    }
  }

  // Get attendance records with pagination
  Future<List<Attendance>> getAttendanceRecords({
    int page = 1,
    int pageSize = 20,
    String? startDate,
    String? endDate,
  }) async {
    try {
      final queryParams = <String, String>{
        'page': page.toString(),
        'page_size': pageSize.toString(),
      };

      if (startDate != null) {
        queryParams['start_date'] = startDate;
      }
      if (endDate != null) {
        queryParams['end_date'] = endDate;
      }

      final response = await _apiClient.get(
        ApiConfig.attendanceRecordsEndpoint,
        queryParams: queryParams,
      );

      // Parse the records array
      final recordsList = response['records'] as List;
      return recordsList
          .map((json) => Attendance.fromJson(json as Map<String, dynamic>))
          .toList();
    } catch (e) {
      print('Get attendance records error: $e');
      return [];
    }
  }

  // Get recent attendances (last 5 by default)
  Future<List<Attendance>> getRecentAttendances({int limit = 5}) async {
    return await getAttendanceRecords(page: 1, pageSize: limit);
  }

  // Get all attendances
  Future<List<Attendance>> getAllAttendances() async {
    return await getAttendanceRecords(page: 1, pageSize: 100);
  }

  // Get attendances by date range
  Future<List<Attendance>> getAttendancesByDateRange(
    DateTime startDate,
    DateTime endDate,
  ) async {
    final startDateStr = DateFormat('yyyy-MM-dd').format(startDate);
    final endDateStr = DateFormat('yyyy-MM-dd').format(endDate);
    
    return await getAttendanceRecords(
      startDate: startDateStr,
      endDate: endDateStr,
      pageSize: 100,
    );
  }

  // Get attendance dashboard statistics
  Future<Map<String, dynamic>> getAttendanceStats() async {
    try {
      final response = await _apiClient.get(
        ApiConfig.attendanceDashboardEndpoint,
      );

      return {
        'thisMonth': response['total_present'] ?? 0,
        'total': response['total_days'] ?? 0,
        'pending': 0, // Backend doesn't have pending concept
        'presentDays': response['total_present'] ?? 0,
        'absentDays': response['total_absent'] ?? 0,
        'attendancePercentage': response['attendance_percentage'] ?? 0.0,
      };
    } catch (e) {
      print('Get attendance stats error: $e');
      return {
        'thisMonth': 0,
        'total': 0,
        'pending': 0,
        'presentDays': 0,
        'absentDays': 0,
        'attendancePercentage': 0.0,
      };
    }
  }

  // Get attendance report
  Future<Map<String, dynamic>> getAttendanceReport({
    required DateTime startDate,
    required DateTime endDate,
  }) async {
    try {
      final queryParams = {
        'start_date': DateFormat('yyyy-MM-dd').format(startDate),
        'end_date': DateFormat('yyyy-MM-dd').format(endDate),
      };

      final response = await _apiClient.get(
        ApiConfig.attendanceReportEndpoint,
        queryParams: queryParams,
      );

      return response;
    } catch (e) {
      print('Get attendance report error: $e');
      return {};
    }
  }
}
