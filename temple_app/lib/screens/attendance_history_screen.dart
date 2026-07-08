import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../models/attendance_model.dart';
import '../services/attendance_service.dart';

class AttendanceHistoryScreen extends StatefulWidget {
  const AttendanceHistoryScreen({super.key});

  @override
  State<AttendanceHistoryScreen> createState() => _AttendanceHistoryScreenState();
}

class _AttendanceHistoryScreenState extends State<AttendanceHistoryScreen> {
  final AttendanceService _attendanceService = AttendanceService();
  
  List<Attendance> _records = [];
  bool _isLoading = true;
  DateTime _selectedMonth = DateTime.now();
  DateTime? _startDate;
  DateTime? _endDate;
  String _filterType = 'month'; // 'month' or 'range'
  
  // Statistics
  int _totalPresent = 0;
  int _totalAbsent = 0;
  double _totalOvertime = 0;
  double _totalOutside = 0;

  @override
  void initState() {
    super.initState();
    _loadAttendance();
  }

  Future<void> _loadAttendance() async {
    setState(() => _isLoading = true);

    try {
      List<Attendance> records;
      
      if (_filterType == 'month') {
        // Get records for selected month
        final startOfMonth = DateTime(_selectedMonth.year, _selectedMonth.month, 1);
        final endOfMonth = DateTime(_selectedMonth.year, _selectedMonth.month + 1, 0);
        records = await _attendanceService.getAttendancesByDateRange(
          startOfMonth,
          endOfMonth,
        );
      } else {
        // Get records for custom date range
        if (_startDate != null && _endDate != null) {
          records = await _attendanceService.getAttendancesByDateRange(
            _startDate!,
            _endDate!,
          );
        } else {
          records = [];
        }
      }

      // Calculate statistics
      _totalPresent = records.where((r) => r.isPresent).length;
      _totalAbsent = records.where((r) => !r.isPresent).length;
      _totalOvertime = records.fold(0.0, (sum, r) => sum + r.overtimeHours);
      _totalOutside = records.fold(0.0, (sum, r) => sum + r.outsideHours);

      setState(() {
        _records = records;
        _isLoading = false;
      });
    } catch (e) {
      print('Error loading attendance: $e');
      setState(() => _isLoading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed to load attendance records'),
            backgroundColor: Colors.red,
          ),
        );
      }
    }
  }

  void _previousMonth() {
    setState(() {
      _selectedMonth = DateTime(_selectedMonth.year, _selectedMonth.month - 1);
    });
    _loadAttendance();
  }

  void _nextMonth() {
    setState(() {
      _selectedMonth = DateTime(_selectedMonth.year, _selectedMonth.month + 1);
    });
    _loadAttendance();
  }

  Future<void> _selectDateRange() async {
    final DateTimeRange? picked = await showDateRangePicker(
      context: context,
      firstDate: DateTime(2020),
      lastDate: DateTime.now(),
      initialDateRange: _startDate != null && _endDate != null
          ? DateTimeRange(start: _startDate!, end: _endDate!)
          : null,
    );

    if (picked != null) {
      setState(() {
        _filterType = 'range';
        _startDate = picked.start;
        _endDate = picked.end;
      });
      _loadAttendance();
    }
  }

  void _resetToMonth() {
    setState(() {
      _filterType = 'month';
      _startDate = null;
      _endDate = null;
      _selectedMonth = DateTime.now();
    });
    _loadAttendance();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Attendance History'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: _loadAttendance,
            tooltip: 'Refresh',
          ),
        ],
      ),
      body: Column(
        children: [
          // Filter Section
          Container(
            padding: const EdgeInsets.all(16),
            color: Theme.of(context).colorScheme.surfaceVariant.withOpacity(0.3),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Filter Type Selector
                Row(
                  children: [
                    Expanded(
                      child: SegmentedButton<String>(
                        segments: const [
                          ButtonSegment(
                            value: 'month',
                            label: Text('Monthly'),
                            icon: Icon(Icons.calendar_month, size: 16),
                          ),
                          ButtonSegment(
                            value: 'range',
                            label: Text('Date Range'),
                            icon: Icon(Icons.date_range, size: 16),
                          ),
                        ],
                        selected: {_filterType},
                        onSelectionChanged: (Set<String> newSelection) {
                          if (newSelection.first == 'range') {
                            _selectDateRange();
                          } else {
                            _resetToMonth();
                          }
                        },
                      ),
                    ),
                  ],
                ),
                
                const SizedBox(height: 16),

                // Month Navigation or Date Range Display
                if (_filterType == 'month')
                  Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      IconButton(
                        icon: const Icon(Icons.chevron_left),
                        onPressed: _previousMonth,
                      ),
                      Text(
                        DateFormat('MMMM yyyy').format(_selectedMonth),
                        style: Theme.of(context).textTheme.titleLarge,
                      ),
                      IconButton(
                        icon: const Icon(Icons.chevron_right),
                        onPressed: _nextMonth,
                      ),
                    ],
                  )
                else if (_startDate != null && _endDate != null)
                  InkWell(
                    onTap: _selectDateRange,
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
                      decoration: BoxDecoration(
                        color: Theme.of(context).colorScheme.surface,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Theme.of(context).dividerColor),
                      ),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.date_range, size: 20),
                          const SizedBox(width: 8),
                          Text(
                            '${DateFormat('MMM dd').format(_startDate!)} - ${DateFormat('MMM dd, yyyy').format(_endDate!)}',
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          const SizedBox(width: 8),
                          const Icon(Icons.edit, size: 16),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),

          // Statistics Cards
          Container(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Expanded(
                  child: _StatCard(
                    label: 'Present',
                    value: '$_totalPresent',
                    icon: Icons.check_circle,
                    color: Colors.green,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _StatCard(
                    label: 'Absent',
                    value: '$_totalAbsent',
                    icon: Icons.cancel,
                    color: Colors.red,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _StatCard(
                    label: 'Overtime',
                    value: '${_totalOvertime.toStringAsFixed(1)}h',
                    icon: Icons.trending_up,
                    color: Colors.blue,
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: _StatCard(
                    label: 'Outside',
                    value: '${_totalOutside.toStringAsFixed(1)}h',
                    icon: Icons.location_on,
                    color: Colors.orange,
                  ),
                ),
              ],
            ),
          ),

          const Divider(height: 1),

          // Records List
          Expanded(
            child: _isLoading
                ? const Center(child: CircularProgressIndicator())
                : _records.isEmpty
                    ? Center(
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              Icons.event_busy,
                              size: 64,
                              color: Colors.grey[400],
                            ),
                            const SizedBox(height: 16),
                            Text(
                              'No attendance records found',
                              style: TextStyle(
                                fontSize: 16,
                                color: Colors.grey[600],
                              ),
                            ),
                          ],
                        ),
                      )
                    : ListView.builder(
                        padding: const EdgeInsets.all(16),
                        itemCount: _records.length,
                        itemBuilder: (context, index) {
                          final record = _records[index];
                          return _AttendanceCard(record: record);
                        },
                      ),
          ),
        ],
      ),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final IconData icon;
  final Color color;

  const _StatCard({
    required this.label,
    required this.value,
    required this.icon,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          children: [
            Icon(icon, color: color, size: 24),
            const SizedBox(height: 4),
            Text(
              value,
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.bold,
                color: color,
              ),
            ),
            Text(
              label,
              style: TextStyle(
                fontSize: 11,
                color: Colors.grey[600],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AttendanceCard extends StatelessWidget {
  final Attendance record;

  const _AttendanceCard({required this.record});

  @override
  Widget build(BuildContext context) {
    final isPresent = record.isPresent;
    final hasLocation = record.checkInLocation != null || record.checkOutLocation != null;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: isPresent ? Colors.green : Colors.red,
          width: 2,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      DateFormat('EEEE, MMM dd, yyyy').format(record.date),
                      style: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Icon(
                          isPresent ? Icons.check_circle : Icons.cancel,
                          size: 16,
                          color: isPresent ? Colors.green : Colors.red,
                        ),
                        const SizedBox(width: 4),
                        Text(
                          isPresent ? 'Present' : 'Absent',
                          style: TextStyle(
                            fontSize: 14,
                            color: isPresent ? Colors.green : Colors.red,
                            fontWeight: FontWeight.w500,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
                if (hasLocation)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: Colors.blue.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: const [
                        Icon(Icons.location_on, size: 14, color: Colors.blue),
                        SizedBox(width: 4),
                        Text(
                          'GPS',
                          style: TextStyle(fontSize: 12, color: Colors.blue),
                        ),
                      ],
                    ),
                  ),
              ],
            ),

            if (isPresent) ...[
              const Divider(height: 24),
              
              // Time Details
              Row(
                children: [
                  Expanded(
                    child: _TimeInfo(
                      icon: Icons.login,
                      label: 'Check In',
                      time: record.checkInTime ?? '--:--',
                      iconColor: Colors.green,
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: _TimeInfo(
                      icon: Icons.logout,
                      label: 'Check Out',
                      time: record.checkOutTime ?? '--:--',
                      iconColor: Colors.red,
                    ),
                  ),
                ],
              ),

              // Hours Info
              if (record.overtimeHours > 0 || record.outsideHours > 0) ...[
                const SizedBox(height: 12),
                Row(
                  children: [
                    if (record.overtimeHours > 0)
                      Expanded(
                        child: _HoursInfo(
                          icon: Icons.trending_up,
                          label: 'Overtime',
                          hours: record.overtimeHours,
                          color: Colors.blue,
                        ),
                      ),
                    if (record.overtimeHours > 0 && record.outsideHours > 0)
                      const SizedBox(width: 16),
                    if (record.outsideHours > 0)
                      Expanded(
                        child: _HoursInfo(
                          icon: Icons.location_on,
                          label: 'Outside',
                          hours: record.outsideHours,
                          color: Colors.orange,
                        ),
                      ),
                  ],
                ),
              ],
            ],

            // Sync Status
            if (record.status != AttendanceStatus.synced) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: Colors.orange.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(
                      record.status == AttendanceStatus.pending
                          ? Icons.cloud_upload
                          : Icons.sync_problem,
                      size: 14,
                      color: Colors.orange,
                    ),
                    const SizedBox(width: 4),
                    Text(
                      record.status == AttendanceStatus.pending
                          ? 'Pending sync'
                          : 'Sync failed',
                      style: const TextStyle(fontSize: 11, color: Colors.orange),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _TimeInfo extends StatelessWidget {
  final IconData icon;
  final String label;
  final String time;
  final Color iconColor;

  const _TimeInfo({
    required this.icon,
    required this.label,
    required this.time,
    required this.iconColor,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Icon(icon, size: 20, color: iconColor),
        const SizedBox(width: 8),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: TextStyle(
                fontSize: 12,
                color: Colors.grey[600],
              ),
            ),
            Text(
              time,
              style: const TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
              ),
            ),
          ],
        ),
      ],
    );
  }
}

class _HoursInfo extends StatelessWidget {
  final IconData icon;
  final String label;
  final double hours;
  final Color color;

  const _HoursInfo({
    required this.icon,
    required this.label,
    required this.hours,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(width: 8),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: TextStyle(
                  fontSize: 11,
                  color: color,
                ),
              ),
              Text(
                '${hours.toStringAsFixed(1)} hrs',
                style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: color,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
