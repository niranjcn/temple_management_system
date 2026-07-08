import 'package:flutter/material.dart';
import '../services/attendance_service.dart';
import '../models/attendance_model.dart';
import '../widgets/status_badge.dart';
import 'package:intl/intl.dart';

class ReportScreen extends StatefulWidget {
  const ReportScreen({Key? key}) : super(key: key);

  @override
  State<ReportScreen> createState() => _ReportScreenState();
}

class _ReportScreenState extends State<ReportScreen> {
  final _attendanceService = AttendanceService();
  
  List<Attendance> _attendances = [];
  Map<String, dynamic> _stats = {};
  bool _isLoading = true;
  String _selectedFilter = 'All';

  @override
  void initState() {
    super.initState();
    _loadData();
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);
    
    final attendances = await _attendanceService.getAllAttendances();
    final stats = await _attendanceService.getAttendanceStats();
    
    if (mounted) {
      setState(() {
        _attendances = attendances;
        _stats = stats;
        _isLoading = false;
      });
    }
  }

  List<Attendance> get _filteredAttendances {
    if (_selectedFilter == 'All') {
      return _attendances;
    } else if (_selectedFilter == 'This Month') {
      final now = DateTime.now();
      return _attendances.where((a) {
        return a.date.year == now.year && a.date.month == now.month;
      }).toList();
    } else if (_selectedFilter == 'Pending') {
      return _attendances.where((a) => a.status == AttendanceStatus.pending).toList();
    }
    return _attendances;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Reports'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadData,
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadData,
              child: SingleChildScrollView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Stats Cards
                    Row(
                      children: [
                        Expanded(
                          child: _StatCard(
                            title: 'This Month',
                            value: '${_stats['thisMonth'] ?? 0}',
                            icon: Icons.calendar_today,
                            color: theme.primaryColor,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: _StatCard(
                            title: 'Total',
                            value: '${_stats['total'] ?? 0}',
                            icon: Icons.event_available,
                            color: Colors.green,
                          ),
                        ),
                      ],
                    ),
                    
                    const SizedBox(height: 12),
                    
                    Row(
                      children: [
                        Expanded(
                          child: _StatCard(
                            title: 'Pending',
                            value: '${_stats['pending'] ?? 0}',
                            icon: Icons.sync,
                            color: Colors.orange,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: _StatCard(
                            title: 'Synced',
                            value: '${(_stats['total'] ?? 0) - (_stats['pending'] ?? 0)}',
                            icon: Icons.check_circle,
                            color: Colors.blue,
                          ),
                        ),
                      ],
                    ),
                    
                    const SizedBox(height: 24),
                    
                    // Filter Chips
                    SingleChildScrollView(
                      scrollDirection: Axis.horizontal,
                      child: Row(
                        children: [
                          _FilterChip(
                            label: 'All',
                            isSelected: _selectedFilter == 'All',
                            onSelected: () => setState(() => _selectedFilter = 'All'),
                          ),
                          const SizedBox(width: 8),
                          _FilterChip(
                            label: 'This Month',
                            isSelected: _selectedFilter == 'This Month',
                            onSelected: () => setState(() => _selectedFilter = 'This Month'),
                          ),
                          const SizedBox(width: 8),
                          _FilterChip(
                            label: 'Pending',
                            isSelected: _selectedFilter == 'Pending',
                            onSelected: () => setState(() => _selectedFilter = 'Pending'),
                          ),
                        ],
                      ),
                    ),
                    
                    const SizedBox(height: 16),
                    
                    // Attendance List Header
                    Text(
                      'Attendance History',
                      style: theme.textTheme.headlineSmall,
                    ),
                    
                    const SizedBox(height: 12),
                    
                    // Attendance List
                    if (_filteredAttendances.isEmpty)
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
                                'No records found',
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
                        itemCount: _filteredAttendances.length,
                        itemBuilder: (context, index) {
                          final attendance = _filteredAttendances[index];
                          return _AttendanceCard(attendance: attendance);
                        },
                      ),
                  ],
                ),
              ),
            ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String title;
  final String value;
  final IconData icon;
  final Color color;

  const _StatCard({
    required this.title,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Icon(icon, color: color, size: 32),
            const SizedBox(height: 8),
            Text(
              value,
              style: theme.textTheme.headlineMedium?.copyWith(
                color: color,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              title,
              style: theme.textTheme.bodySmall,
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final bool isSelected;
  final VoidCallback onSelected;

  const _FilterChip({
    required this.label,
    required this.isSelected,
    required this.onSelected,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    
    return FilterChip(
      label: Text(label),
      selected: isSelected,
      onSelected: (_) => onSelected(),
      selectedColor: theme.primaryColor.withOpacity(0.2),
      checkmarkColor: theme.primaryColor,
      labelStyle: TextStyle(
        color: isSelected ? theme.primaryColor : null,
        fontWeight: isSelected ? FontWeight.w600 : FontWeight.normal,
      ),
    );
  }
}

class _AttendanceCard extends StatelessWidget {
  final Attendance attendance;

  const _AttendanceCard({required this.attendance});

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

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    
    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  DateFormat('EEEE, MMM d, yyyy').format(attendance.date),
                  style: theme.textTheme.bodyLarge?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                StatusBadge(
                  text: attendance.statusText,
                  color: _getStatusColor(attendance.status),
                ),
              ],
            ),
            const SizedBox(height: 12),
            if (attendance.checkInTime != null)
              Row(
                children: [
                  Icon(
                    Icons.login,
                    size: 16,
                    color: theme.textTheme.bodyMedium?.color,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'Check-in: ${attendance.checkInTime}',
                    style: theme.textTheme.bodyMedium,
                  ),
                ],
              ),
            if (attendance.checkOutTime != null) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  Icon(
                    Icons.logout,
                    size: 16,
                    color: theme.textTheme.bodyMedium?.color,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'Check-out: ${attendance.checkOutTime}',
                    style: theme.textTheme.bodyMedium,
                  ),
                ],
              ),
            ],
            if (attendance.distance != null) ...[
              const SizedBox(height: 8),
              Row(
                children: [
                  Icon(
                    Icons.location_on,
                    size: 16,
                    color: theme.textTheme.bodyMedium?.color,
                  ),
                  const SizedBox(width: 8),
                  Text(
                    'Distance: ${attendance.distance!.toStringAsFixed(0)}m',
                    style: theme.textTheme.bodyMedium,
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
