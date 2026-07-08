import '../models/notification_model.dart';

class NotificationService {
  static final NotificationService _instance = NotificationService._internal();
  factory NotificationService() => _instance;
  NotificationService._internal();

  final List<NotificationModel> _mockNotifications = [
    NotificationModel(
      id: '1',
      title: 'Temple Opening Hours Updated',
      description: 'The temple will now open at 5:00 AM instead of 6:00 AM for morning prayers. Please adjust your schedule accordingly.',
      dateTime: DateTime.now().subtract(const Duration(hours: 2)),
      type: 'announcement',
    ),
    NotificationModel(
      id: '2',
      title: 'Upcoming Festival Preparations',
      description: 'Diwali celebrations begin next week. All volunteers are requested to attend the preparation meeting on Saturday at 10:00 AM.',
      dateTime: DateTime.now().subtract(const Duration(hours: 5)),
      type: 'announcement',
    ),
    NotificationModel(
      id: '3',
      title: 'Monthly Attendance Review',
      description: 'Your attendance record for this month is excellent. Keep up the good work!',
      dateTime: DateTime.now().subtract(const Duration(days: 1)),
      type: 'reminder',
      isRead: true,
    ),
    NotificationModel(
      id: '4',
      title: 'Maintenance Work Scheduled',
      description: 'The main hall will be under maintenance on Sunday from 2:00 PM to 5:00 PM. Please plan your activities accordingly.',
      dateTime: DateTime.now().subtract(const Duration(days: 2)),
      type: 'alert',
      isRead: true,
    ),
    NotificationModel(
      id: '5',
      title: 'New Priest Joining',
      description: 'We are pleased to welcome Pandit Sharma to our temple. He will be conducting evening prayers from next Monday.',
      dateTime: DateTime.now().subtract(const Duration(days: 3)),
      type: 'announcement',
      isRead: true,
    ),
    NotificationModel(
      id: '6',
      title: 'Donation Drive Success',
      description: 'Thank you to all volunteers and devotees. We have successfully raised ₹50,000 for the community kitchen project!',
      dateTime: DateTime.now().subtract(const Duration(days: 4)),
      type: 'announcement',
      isRead: true,
    ),
    NotificationModel(
      id: '7',
      title: 'Special Prayer Session',
      description: 'A special prayer session will be held on the occasion of Guru Purnima. All are welcome to join.',
      dateTime: DateTime.now().subtract(const Duration(days: 5)),
      type: 'reminder',
      isRead: true,
    ),
    NotificationModel(
      id: '8',
      title: 'Volunteer Training Program',
      description: 'A training program for new volunteers will be conducted next month. Interested members can register at the temple office.',
      dateTime: DateTime.now().subtract(const Duration(days: 7)),
      type: 'announcement',
      isRead: true,
    ),
  ];

  Future<List<NotificationModel>> getAllNotifications() async {
    await Future.delayed(const Duration(milliseconds: 500));
    return List.from(_mockNotifications);
  }

  Future<List<NotificationModel>> getUnreadNotifications() async {
    await Future.delayed(const Duration(milliseconds: 300));
    return _mockNotifications.where((n) => !n.isRead).toList();
  }

  Future<Map<String, dynamic>> markAsRead(String notificationId) async {
    await Future.delayed(const Duration(milliseconds: 200));
    
    final index = _mockNotifications.indexWhere((n) => n.id == notificationId);
    if (index != -1) {
      _mockNotifications[index] = _mockNotifications[index].copyWith(isRead: true);
      return {
        'success': true,
        'message': 'Notification marked as read',
      };
    }
    
    return {
      'success': false,
      'message': 'Notification not found',
    };
  }

  Future<Map<String, dynamic>> markAllAsRead() async {
    await Future.delayed(const Duration(milliseconds: 500));
    
    for (int i = 0; i < _mockNotifications.length; i++) {
      _mockNotifications[i] = _mockNotifications[i].copyWith(isRead: true);
    }
    
    return {
      'success': true,
      'message': 'All notifications marked as read',
    };
  }

  int getUnreadCount() {
    return _mockNotifications.where((n) => !n.isRead).length;
  }
}
