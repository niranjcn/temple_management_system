import 'package:flutter/material.dart';
import '../services/auth_service.dart';
import '../services/attendance_service.dart';
import '../models/attendance_model.dart';
import '../widgets/custom_button.dart';
import '../widgets/info_card.dart';
import '../widgets/status_badge.dart';
import 'package:intl/intl.dart';

class AttendanceScreen extends StatefulWidget {
  const AttendanceScreen({Key? key}) : super(key: key);

  @override
  State<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends State<AttendanceScreen> {
  final _attendanceService = AttendanceService();
  final _authService = AuthService();
  
  double _distanceToTemple = 0;
  List<Attendance> _recentAttendances = [];
  bool _isLoadingDistance = true;
  bool _isMarkingAttendance = false;

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    await Future.wait([
      _loadDistance(),
      _loadRecentAttendances(),
    ]);
  }

  Future<void> _loadDistance() async {
    setState(() => _isLoadingDistance = true);
    final result = await _attendanceService.getDistanceToTemple();
    if (mounted) {
      setState(() {
        _distanceToTemple = result['distance'] ?? 0.0;
        _isLoadingDistance = false;
      });
    }
  }

  Future<void> _loadRecentAttendances() async {
    final attendances = await _attendanceService.getRecentAttendances();
    if (mounted) {
      setState(() => _recentAttendances = attendances);
    }
  }

  Future<void> _markAttendance() async {
    setState(() => _isMarkingAttendance = true);
    
    final result = await _attendanceService.markAttendance();
    
    setState(() => _isMarkingAttendance = false);
    
    if (!mounted) return;
    
    // Show result message
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(result['message']),
        backgroundColor: result['success'] ? Colors.green : Colors.orange,
        duration: const Duration(seconds: 3),
      ),
    );
    
    // Reload data
    if (result['success']) {
      await _loadRecentAttendances();
      await _loadDistance();
    }
  }

  String _formatDistance(double distance) {
    if (distance < 1000) {
      return '${distance.toStringAsFixed(0)}m';
    } else {
      return '${(distance / 1000).toStringAsFixed(2)}km';
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final user = _authService.getCurrentUser();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Attendance'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadData,
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _loadData,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Greeting Card
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      CircleAvatar(
                        radius: 30,
                        backgroundColor: theme.primaryColor.withOpacity(0.1),
                        child: Text(
                          user?.name.substring(0, 1).toUpperCase() ?? 'U',
                          style: TextStyle(
                            fontSize: 24,
                            fontWeight: FontWeight.bold,
                            color: theme.primaryColor,
                          ),
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'Namaste, ${user?.name.split(' ').first ?? 'User'}!',
                              style: theme.textTheme.headlineSmall,
                            ),
                            const SizedBox(height: 4),
                            Text(
                              DateFormat('EEEE, MMMM d, y').format(DateTime.now()),
                              style: theme.textTheme.bodyMedium,
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              
              const SizedBox(height: 20),
              
              // Distance Card
              InfoCard(
                title: 'Distance to Temple',
                value: _isLoadingDistance
                    ? 'Loading...'
                    : _formatDistance(_distanceToTemple),
                icon: Icons.location_on,
                iconColor: theme.primaryColor,
                onTap: _loadDistance,
              ),
              
              const SizedBox(height: 20),
              
              // Mark Attendance Button
              CustomButton(
                text: 'Mark Attendance',
                onPressed: _markAttendance,
                isLoading: _isMarkingAttendance,
                icon: Icons.check_circle_outline,
              ),
              
              const SizedBox(height: 32),
              
              // Recent Attendances Header
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Recent Attendances',
                    style: theme.textTheme.headlineSmall,
                  ),
                  TextButton(
                    onPressed: () {
                      // This would navigate to report screen
                      // Using the bottom navigation instead
                    },
                    child: const Text('View All'),
                  ),
                ],
              ),
              
              const SizedBox(height: 12),
              
              // Recent Attendances List
              if (_recentAttendances.isEmpty)
                Center(
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Column(
                      children: [
                        Icon(
                          Icons.event_busy,
                          size: 64,
                          color: Colors.grey.shade400,
                        ),
                        const SizedBox(height: 16),
                        Text(
                          'No attendance records yet',
                          style: theme.textTheme.bodyLarge?.copyWith(
                            color: Colors.grey,
                          ),
                        ),
                      ],
                    ),
                  ),
                )
              else
                ListView.builder(
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  itemCount: _recentAttendances.length,
                  itemBuilder: (context, index) {
                    final attendance = _recentAttendances[index];
                    return _AttendanceListItem(attendance: attendance);
                  },
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AttendanceListItem extends StatelessWidget {
  final Attendance attendance;

  const _AttendanceListItem({required this.attendance});

  Color _getStatusColor(AttendanceStatus status) {
    switch (status) {
      case AttendanceStatus.checkedIn:
        return Colors.blue;
      case AttendanceStatus.checkedOut:
        return Colors.teal;
      case AttendanceStatus.synced:
        return Colors.green;
      case AttendanceStatus.pending:
        return Colors.orange;
      case AttendanceStatus.failed:
        return Colors.red;
    }
  }

  IconData _getStatusIcon(AttendanceStatus status) {
    switch (status) {
      case AttendanceStatus.checkedIn:
        return Icons.login;
      case AttendanceStatus.checkedOut:
        return Icons.logout;
      case AttendanceStatus.synced:
        return Icons.check_circle;
      case AttendanceStatus.pending:
        return Icons.sync;
      case AttendanceStatus.failed:
        return Icons.error;
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: ListTile(
        leading: Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: _getStatusColor(attendance.status).withOpacity(0.1),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(
            _getStatusIcon(attendance.status),
            color: _getStatusColor(attendance.status),
          ),
        ),
        title: Text(
          DateFormat('MMM d, yyyy').format(attendance.date),
          style: theme.textTheme.bodyLarge?.copyWith(
            fontWeight: FontWeight.w600,
          ),
        ),
        subtitle: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: 4),
            if (attendance.checkInTime != null)
              Text(
                'Check-in: ${attendance.checkInTime}',
              ),
            if (attendance.checkOutTime != null)
              Text(
                'Check-out: ${attendance.checkOutTime}',
              ),
          ],
        ),
        trailing: StatusBadge(
          text: attendance.statusText,
          color: _getStatusColor(attendance.status),
        ),
      ),
    );
  }
}
