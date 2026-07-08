import 'package:ntp/ntp.dart';
import 'dart:async';

/// Service for getting accurate server time using NTP
/// Prevents users from manipulating system clock to fake attendance times
class TimeService {
  static final TimeService _instance = TimeService._internal();
  factory TimeService() => _instance;
  TimeService._internal();

  Duration? _offset;
  DateTime? _lastSync;
  static const _syncInterval = Duration(hours: 1);
  static const _maxOffsetAllowed = Duration(minutes: 5);

  /// Get current accurate time (NTP-synced or system time as fallback)
  Future<DateTime> getCurrentTime() async {
    try {
      // Sync if needed (first time or after interval)
      if (_offset == null || 
          _lastSync == null || 
          DateTime.now().difference(_lastSync!) > _syncInterval) {
        await _syncWithNtp();
      }

      // If we have an offset, apply it to system time
      if (_offset != null) {
        return DateTime.now().add(_offset!);
      }
    } catch (e) {
      print('⚠️ NTP sync failed, using system time: $e');
    }

    // Fallback to system time
    return DateTime.now();
  }

  /// Synchronize with NTP servers
  Future<void> _syncWithNtp() async {
    try {
      print('🕐 Syncing time with NTP server...');
      
      // Get time from NTP server (Google's public NTP)
      final ntpTime = await NTP.now(
        lookUpAddress: 'time.google.com',
        timeout: const Duration(seconds: 5),
      );

      // Calculate offset between NTP time and system time
      final systemTime = DateTime.now();
      _offset = ntpTime.difference(systemTime);
      _lastSync = systemTime;
      
      print('✅ NTP sync successful');
      print('   NTP Time: $ntpTime');
      print('   System Time: $systemTime');
      print('   Offset: ${_offset!.inSeconds} seconds');

      // Warn if system clock is significantly different
      if (_offset!.abs() > _maxOffsetAllowed) {
        print('⚠️ WARNING: System clock is off by ${_offset!.inMinutes} minutes!');
      }
    } catch (e) {
      print('❌ NTP sync error: $e');
      // Keep existing offset if available, or null to use system time
    }
  }

  /// Force immediate NTP sync
  Future<bool> forceSync() async {
    try {
      await _syncWithNtp();
      return _offset != null;
    } catch (e) {
      print('Force sync failed: $e');
      return false;
    }
  }

  /// Check if time is synced
  bool get isSynced => _offset != null;

  /// Get the current offset in seconds
  int get offsetSeconds => _offset?.inSeconds ?? 0;

  /// Get sync status information
  Map<String, dynamic> getSyncStatus() {
    return {
      'is_synced': isSynced,
      'offset_seconds': offsetSeconds,
      'last_sync': _lastSync?.toIso8601String(),
      'next_sync': _lastSync != null
          ? _lastSync!.add(_syncInterval).toIso8601String()
          : null,
    };
  }

  /// Format time for display
  String formatTime(DateTime time) {
    return '${time.hour.toString().padLeft(2, '0')}:${time.minute.toString().padLeft(2, '0')}:${time.second.toString().padLeft(2, '0')}';
  }

  /// Format date for display
  String formatDate(DateTime date) {
    return '${date.year}-${date.month.toString().padLeft(2, '0')}-${date.day.toString().padLeft(2, '0')}';
  }

  /// Format datetime for backend API
  String formatDateTime(DateTime dateTime) {
    return '${formatDate(dateTime)} ${formatTime(dateTime)}';
  }
}
