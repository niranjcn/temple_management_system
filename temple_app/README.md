# 🛕 Temple Attendance Manager

A beautiful Flutter mobile application for temple management that allows staff and volunteers to mark attendance, view reports, check profiles, and read notifications.

**✅ Now integrated with FastAPI backend at `192.168.18.224:8080`**

## 🚀 Quick Start

### Login Credentials
Use your **backend username and password** (not email):
- Username: Your backend admin username (e.g., `admin`)
- Password: Your backend password

### Testing
1. Ensure backend is running: `uvicorn main:app --host 0.0.0.0 --port 8080`
2. Mobile device on same WiFi as backend
3. Run app: `flutter run`
4. Login with backend credentials

**📚 See `docs/TESTING_GUIDE.md` for detailed testing procedures**

## ✨ Features

### 🔐 Authentication
- **Login with username** (matches backend implementation)
- Real backend authentication via FastAPI
- JWT token-based session management
- Secure token storage with SharedPreferences
- Automatic token injection for API calls

### 📍 Attendance Management
- Mark attendance with one tap (syncs to backend)
- Automatic check-in time recording
- Support for check-out marking
- Real-time sync with MongoDB database
- View recent attendance records from backend
- Distance checking ready (GPS implementation pending)

### 📊 Reports & Analytics
- Comprehensive attendance history from backend
- Statistics dashboard with real data:
  - Present days count
  - Absent days count
  - Attendance percentage
- Date range filtering
- Pagination support for large datasets
- Detailed records with check-in/out times (HH:MM format)

### 👤 Profile Management
- View personal information
- Display user role (Priest/Volunteer)
- Edit profile (UI ready)
- Secure logout functionality

### 🔔 Notifications
- Temple announcements and alerts
- Swipe to mark as read
- Unread notification badges
- Categorized by type (Announcement, Reminder, Alert)
- Time-based formatting (e.g., "2h ago")

## 🎨 Design Features

### Color Scheme
- **Primary**: Saffron (#FF9933) - Traditional temple color
- **Accent**: Gold (#FFD700) - Spiritual elegance
- **Background**: Warm off-white for light mode, dark gray for dark mode

### UI Components
- Rounded cards with subtle shadows
- Smooth animations on buttons and interactions
- Bottom navigation with 4 main sections
- Material Design 3 components
- Full dark mode support

## 🏗️ Project Structure

```
lib/
├── config/
│   └── theme.dart                 # App theme (light & dark)
├── models/
│   ├── user_model.dart           # User data model
│   ├── attendance_model.dart     # Attendance records model
│   └── notification_model.dart   # Notification data model
├── services/
│   ├── auth_service.dart         # Mock authentication service
│   ├── attendance_service.dart   # Mock attendance API
│   └── notification_service.dart # Mock notification service
├── screens/
│   ├── login_screen.dart         # Login interface
│   ├── home_screen.dart          # Main navigation container
│   ├── attendance_screen.dart    # Mark attendance & view recent
│   ├── report_screen.dart        # Attendance reports & analytics
│   ├── profile_screen.dart       # User profile management
│   └── notifications_screen.dart # Temple notifications
├── widgets/
│   ├── custom_button.dart        # Reusable button with animation
│   ├── info_card.dart            # Information display card
│   └── status_badge.dart         # Status indicator badge
└── main.dart                      # App entry point
```

## 🚀 Getting Started

### Prerequisites
- Flutter SDK (3.9.2 or higher)
- Dart SDK
- Android Studio / VS Code
- Android or iOS emulator / Physical device

### Installation

1. **Clone or navigate to the project**
   ```bash
   cd d:\temple_app
   ```

2. **Install dependencies**
   ```bash
   flutter pub get
   ```

3. **Run the app**
   ```bash
   flutter run
   ```

## 🔑 Demo Credentials

Use these credentials to login:

| Role | Email | Password |
|------|-------|----------|
| Priest | priest@temple.com | priest123 |
| Volunteer | volunteer@temple.com | volunteer123 |
| Administrator | admin@temple.com | admin123 |

## 📱 Screens Overview

### Login Screen
- Temple icon with saffron theme
- Email and password validation
- Loading animation during authentication
- Spiritual quote footer

### Attendance Screen (Home)
- Personalized greeting with user avatar
- Current date display
- Distance to temple card
- Mark Attendance button with loading state
- Recent attendance list with status badges

### Report Screen
- Four statistics cards at the top
- Filter chips for data filtering
- Scrollable attendance history
- Each record shows:
  - Date and day
  - Check-in and check-out times
  - Distance from temple
  - Sync status

### Profile Screen
- Circular profile photo
- User name and role badge
- Contact information cards
- Edit Profile button (UI ready)
- Logout with confirmation dialog

### Notifications Screen
- Swipeable notification cards
- Unread indicator dots
- Mark all as read option
- Time-based formatting
- Color-coded by type

## 🛠️ Technologies Used

- **Flutter**: UI framework
- **Material Design 3**: Design system
- **Dart**: Programming language
- **intl**: Date formatting
- **shared_preferences**: Local storage (dependency included)
- **flutter_slidable**: Swipeable list items

## 📦 Dependencies

```yaml
dependencies:
  flutter:
    sdk: flutter
  cupertino_icons: ^1.0.8
  intl: ^0.19.0
  shared_preferences: ^2.3.3
  flutter_slidable: ^3.1.1
```

## 🎯 Key Features Implementation

### Backend Integration ✅
**Now connected to FastAPI backend!**
- **ApiClient**: Generic HTTP client with token management
- **AuthService**: Real login/logout with JWT tokens
- **AttendanceService**: Real attendance marking and retrieval from MongoDB
- **Token Storage**: Secure storage using SharedPreferences
- **Error Handling**: Comprehensive exception handling for network errors

### API Endpoints
- `POST /api/auth/login` - User authentication
- `POST /api/auth/logout` - User logout
- `POST /api/attendance/mark` - Mark attendance (check-in/out)
- `GET /api/attendance/records` - Get attendance records
- `GET /api/attendance/dashboard` - Get statistics
- `GET /api/attendance/report` - Get attendance report

### Services Architecture
Singleton pattern services with backend integration:
- **AuthService**: Login, logout, profile management with real API
- **AttendanceService**: Mark attendance, fetch records from backend
- **NotificationService**: Fetch notifications (mock - not integrated yet)
- **ApiClient**: Centralized HTTP client with automatic token injection

### State Management
Simple `setState()` approach for easy understanding and maintenance.

### Navigation
Bottom navigation bar with 4 tabs using `IndexedStack` for state preservation.

### Theming
Centralized theme configuration supporting both light and dark modes with automatic system detection.

## 🌟 Best Practices

✅ Separation of concerns (models, services, screens, widgets)  
✅ Reusable widget components  
✅ Consistent naming conventions  
✅ Real backend integration with proper error handling  
✅ Responsive design  
✅ Token-based authentication  
✅ Loading states  
✅ User feedback (SnackBars)  
✅ Smooth animations  
✅ Secure credential storage  

## � Backend Configuration

### Backend URL
Currently configured to: `http://192.168.18.224:8080`

To change the backend URL, edit `lib/config/api_config.dart`:
```dart
static const String baseUrl = 'http://YOUR_BACKEND_IP:PORT';
```

### Network Requirements
- Ensure mobile device and backend are on the same network
- For Android Emulator, use `http://10.0.2.2:8080` for localhost
- For production, use HTTPS instead of HTTP

### Testing Backend Connection
1. Verify backend is running: Visit `http://192.168.18.224:8080/docs`
2. Test login endpoint in Swagger UI
3. Ensure CORS is configured on backend
4. Check firewall settings allow connections

**📚 See `docs/BACKEND_INTEGRATION.md` for detailed integration guide**

## 🔮 Future Enhancements

- Implement GPS location tracking for distance checking
- Add push notifications integration
- Multi-language support
- Biometric authentication
- Offline mode with local SQLite database
- Calendar view for attendance
- Export reports as PDF
- Photo upload for profile
- HTTPS/SSL certificate pinning
- Token refresh automation

## 📄 License

This project is created for demonstration purposes.

## 🙏 Spiritual Message

> "Service to humanity is service to God"

---

**Built with 💛 for temple management and community service**

