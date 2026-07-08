import 'package:flutter/material.dart';
import '../services/attendance_service.dart';
import '../services/sync_service.dart';
import '../services/database_service.dart';
import '../services/auth_service.dart';
import '../models/attendance_model.dart';

class GpsAttendanceScreen extends StatefulWidget {
  const GpsAttendanceScreen({super.key});

  @override
  State<GpsAttendanceScreen> createState() => _GpsAttendanceScreenState();
}

class _GpsAttendanceScreenState extends State<GpsAttendanceScreen> {
  final AttendanceService _attendanceService = AttendanceService();
  final SyncService _syncService = SyncService();
  final DatabaseService _dbService = DatabaseService();
  final AuthService _authService = AuthService();

  bool _isLoading = false;
  Attendance? _todayAttendance;
  Map<String, dynamic> _syncStatus = {};

  @override
  void initState() {
    super.initState();
    _loadTodayAttendance();
    _loadSyncStatus();
  }

  Future<void> _loadTodayAttendance() async {
    final user = _authService.getCurrentUser();
    if (user == null) return;

    final attendance = await _dbService.getTodayAttendance(user.id);
    setState(() {
      _todayAttendance = attendance;
    });
  }

  Future<void> _loadSyncStatus() async {
    final status = await _syncService.getSyncStatus();
    setState(() {
      _syncStatus = status;
    });
  }

  Future<void> _handleAttendanceAction() async {
    setState(() => _isLoading = true);

    try {
      Map<String, dynamic> result;

      // Determine action based on current state
      if (_todayAttendance == null || _todayAttendance!.checkInTime == null) {
        // Check In
        result = await _attendanceService.markAttendance();
      } else if (_todayAttendance!.checkOutTime == null) {
        // Check Out
        result = await _attendanceService.markCheckOut();
      } else {
        // Already checked out
        result = {
          'success': false,
          'message': 'You have already checked out for today',
        };
      }

      if (mounted) {
        // Show result message
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(result['message'] ?? 'Action completed'),
            backgroundColor: result['success'] ? Colors.green : Colors.red,
            duration: const Duration(seconds: 4),
          ),
        );

        // Reload data if successful
        if (result['success']) {
          await _loadTodayAttendance();
          await _loadSyncStatus();
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Error: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  Future<void> _handleManualSync() async {
    setState(() => _isLoading = true);

    try {
      final result = await _syncService.manualSync();

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(result['message'] ?? 'Sync completed'),
            backgroundColor: result['success'] ? Colors.green : Colors.orange,
            duration: const Duration(seconds: 3),
          ),
        );

        await _loadSyncStatus();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Sync error: $e'),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => _isLoading = false);
      }
    }
  }

  String _getButtonText() {
    if (_todayAttendance == null || _todayAttendance!.checkInTime == null) {
      return 'Check In';
    } else if (_todayAttendance!.checkOutTime == null) {
      return 'Check Out';
    } else {
      return 'Already Checked Out';
    }
  }

  IconData _getButtonIcon() {
    if (_todayAttendance == null || _todayAttendance!.checkInTime == null) {
      return Icons.login;
    } else if (_todayAttendance!.checkOutTime == null) {
      return Icons.logout;
    } else {
      return Icons.check_circle;
    }
  }

  Color _getButtonColor() {
    if (_todayAttendance == null || _todayAttendance!.checkInTime == null) {
      return Colors.green;
    } else if (_todayAttendance!.checkOutTime == null) {
      return Colors.orange;
    } else {
      return Colors.grey;
    }
  }

  bool _isButtonEnabled() {
    return _todayAttendance == null || 
           _todayAttendance!.checkInTime == null || 
           _todayAttendance!.checkOutTime == null;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('GPS Attendance'),
        actions: [
          // Sync status indicator
          if (_syncStatus['pending_count'] != null && _syncStatus['pending_count'] > 0)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8.0),
              child: Center(
                child: Badge(
                  label: Text('${_syncStatus['pending_count']}'),
                  backgroundColor: Colors.orange,
                  child: IconButton(
                    icon: Icon(
                      _syncStatus['is_syncing'] == true 
                          ? Icons.sync 
                          : Icons.cloud_upload,
                    ),
                    onPressed: _isLoading ? null : _handleManualSync,
                    tooltip: 'Sync pending records',
                  ),
                ),
              ),
            ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          await _loadTodayAttendance();
          await _loadSyncStatus();
        },
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Today's Status Card
              Card(
                elevation: 4,
                child: Padding(
                  padding: const EdgeInsets.all(20.0),
                  child: Column(
                    children: [
                      Text(
                        'Today\'s Attendance',
                        style: Theme.of(context).textTheme.headlineSmall,
                      ),
                      const SizedBox(height: 20),
                      
                      if (_todayAttendance != null) ...[
                        _buildStatusRow(
                          'Check In',
                          _todayAttendance!.checkInTime ?? 'Not yet',
                          Icons.login,
                          _todayAttendance!.checkInTime != null ? Colors.green : Colors.grey,
                        ),
                        const SizedBox(height: 12),
                        _buildStatusRow(
                          'Check Out',
                          _todayAttendance!.checkOutTime ?? 'Not yet',
                          Icons.logout,
                          _todayAttendance!.checkOutTime != null ? Colors.orange : Colors.grey,
                        ),
                        if (_todayAttendance!.outsideHours > 0) ...[
                          const SizedBox(height: 12),
                          _buildStatusRow(
                            'Outside Hours',
                            '${_todayAttendance!.outsideHours.toStringAsFixed(2)} hrs',
                            Icons.access_time,
                            Colors.red,
                          ),
                        ],
                      ] else ...[
                        const Text(
                          'No attendance marked today',
                          style: TextStyle(
                            color: Colors.grey,
                            fontSize: 16,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 30),

              // Main Action Button
              SizedBox(
                height: 120,
                child: ElevatedButton(
                  onPressed: _isLoading || !_isButtonEnabled() 
                      ? null 
                      : _handleAttendanceAction,
                  style: ElevatedButton.styleFrom(
                    backgroundColor: _getButtonColor(),
                    foregroundColor: Colors.white,
                    disabledBackgroundColor: Colors.grey[300],
                    elevation: 8,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(16),
                    ),
                  ),
                  child: _isLoading
                      ? const CircularProgressIndicator(color: Colors.white)
                      : Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(_getButtonIcon(), size: 48),
                            const SizedBox(height: 12),
                            Text(
                              _getButtonText(),
                              style: const TextStyle(
                                fontSize: 24,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                          ],
                        ),
                ),
              ),

              const SizedBox(height: 30),

              // Sync Status Card
              Card(
                color: Colors.blue[50],
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(
                            _syncStatus['has_internet'] == true 
                                ? Icons.cloud_done 
                                : Icons.cloud_off,
                            color: _syncStatus['has_internet'] == true 
                                ? Colors.green 
                                : Colors.red,
                          ),
                          const SizedBox(width: 8),
                          Text(
                            _syncStatus['has_internet'] == true 
                                ? 'Connected' 
                                : 'Offline',
                            style: const TextStyle(
                              fontWeight: FontWeight.bold,
                              fontSize: 16,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 12),
                      Text('Pending sync: ${_syncStatus['pending_count'] ?? 0} record(s)'),
                      Text('Total records: ${_syncStatus['total_records'] ?? 0}'),
                      if (_syncStatus['is_syncing'] == true) ...[
                        const SizedBox(height: 8),
                        const LinearProgressIndicator(),
                        const SizedBox(height: 4),
                        const Text(
                          'Syncing...',
                          style: TextStyle(
                            fontStyle: FontStyle.italic,
                            color: Colors.grey,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 16),

              // Help Text
              Card(
                color: Colors.amber[50],
                child: const Padding(
                  padding: EdgeInsets.all(16.0),
                  child: Row(
                    children: [
                      Icon(Icons.info_outline, color: Colors.amber),
                      SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          'You must be within the temple premises to check in/out. Records will sync automatically when connected.',
                          style: TextStyle(fontSize: 13),
                        ),
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildStatusRow(String label, String value, IconData icon, Color color) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Row(
          children: [
            Icon(icon, color: color, size: 20),
            const SizedBox(width: 8),
            Text(
              label,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
        Text(
          value,
          style: TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.bold,
            color: color,
          ),
        ),
      ],
    );
  }
}
