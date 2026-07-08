class NotificationModel {
  final String id;
  final String title;
  final String description;
  final DateTime dateTime;
  final bool isRead;
  final String type; // announcement, reminder, alert

  NotificationModel({
    required this.id,
    required this.title,
    required this.description,
    required this.dateTime,
    this.isRead = false,
    required this.type,
  });

  factory NotificationModel.fromJson(Map<String, dynamic> json) {
    return NotificationModel(
      id: json['id'],
      title: json['title'],
      description: json['description'],
      dateTime: DateTime.parse(json['dateTime']),
      isRead: json['isRead'] ?? false,
      type: json['type'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'title': title,
      'description': description,
      'dateTime': dateTime.toIso8601String(),
      'isRead': isRead,
      'type': type,
    };
  }

  NotificationModel copyWith({bool? isRead}) {
    return NotificationModel(
      id: id,
      title: title,
      description: description,
      dateTime: dateTime,
      isRead: isRead ?? this.isRead,
      type: type,
    );
  }
}
