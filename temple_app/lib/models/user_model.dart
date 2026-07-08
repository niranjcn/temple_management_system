class User {
  final String id;
  final String name;
  final String email;
  final String username;
  final String role; // Priest, Volunteer, Super Admin, etc.
  final int? roleId; // Role ID: 0 = Super Admin, 1 = Admin, etc.
  final String? photoUrl;
  final String? phone; // Kept for backward compatibility
  final int? mobileNumber;
  final String? mobilePrefix;
  final String? dob; // Date of birth
  final List<String>? notificationPreference;
  final List<String>? notificationList;

  User({
    required this.id,
    required this.name,
    required this.email,
    required this.username,
    required this.role,
    this.roleId,
    this.photoUrl,
    this.phone,
    this.mobileNumber,
    this.mobilePrefix,
    this.dob,
    this.notificationPreference,
    this.notificationList,
  });
  
  /// Check if user is a Super Admin (role_id == 0)
  bool get isSuperAdmin => roleId == 0;
  
  /// Get formatted mobile number with prefix
  String? get formattedMobile {
    if (mobileNumber != null && mobilePrefix != null) {
      return '$mobilePrefix $mobileNumber';
    }
    return phone; // Fallback to phone if mobile not available
  }

  factory User.fromJson(Map<String, dynamic> json) {
    return User(
      id: json['id'] ?? json['_id'] ?? '',
      name: json['name'] ?? '',
      email: json['email'] ?? '',
      username: json['username'] ?? '',
      role: json['role'] ?? '',
      roleId: json['role_id'] ?? json['roleId'],
      photoUrl: json['photoUrl'] ?? json['photo_url'] ?? json['profile_picture'],
      phone: json['phone'],
      mobileNumber: json['mobile_number'],
      mobilePrefix: json['mobile_prefix'],
      dob: json['dob'],
      notificationPreference: json['notification_preference'] != null 
          ? List<String>.from(json['notification_preference']) 
          : null,
      notificationList: json['notification_list'] != null 
          ? List<String>.from(json['notification_list']) 
          : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'email': email,
      'username': username,
      'role': role,
      'role_id': roleId,
      'photoUrl': photoUrl,
      'phone': phone,
      'mobile_number': mobileNumber,
      'mobile_prefix': mobilePrefix,
      'dob': dob,
      'notification_preference': notificationPreference,
      'notification_list': notificationList,
    };
  }
}
