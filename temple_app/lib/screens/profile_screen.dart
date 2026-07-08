import 'package:flutter/material.dart';
import '../services/auth_service.dart';
import '../widgets/custom_button.dart';
import 'dual_backend_config_screen.dart';
import 'login_screen.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({Key? key}) : super(key: key);

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _authService = AuthService();
  bool _isRefreshing = false;

  @override
  void initState() {
    super.initState();
    _refreshProfile();
  }

  Future<void> _refreshProfile() async {
    setState(() => _isRefreshing = true);
    try {
      await _authService.fetchCompleteProfile();
      if (mounted) {
        setState(() {});
      }
    } catch (e) {
      print('Error refreshing profile: $e');
    } finally {
      if (mounted) {
        setState(() => _isRefreshing = false);
      }
    }
  }

  Future<void> _handleLogout() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Logout'),
        content: const Text('Are you sure you want to logout?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Logout'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      await _authService.logout();
      
      if (!mounted) return;
      
      Navigator.of(context).pushAndRemoveUntil(
        MaterialPageRoute(builder: (context) => const LoginScreen()),
        (route) => false,
      );
    }
  }

  /// Handle long press on profile photo - Super Admin secret gesture
  void _onProfilePhotoLongPress() {
    final user = _authService.getCurrentUser();
    if (user == null || !user.isSuperAdmin) {
      // Not a super admin, show a subtle hint
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('This feature is only for Super Admins'),
          duration: Duration(seconds: 2),
        ),
      );
      return;
    }

    // User is a Super Admin, navigate to configuration screen
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => const DualBackendConfigScreen(),
      ),
    );
  }

  /// Navigate to configuration screen (for Super Admin menu option)
  void _navigateToConfiguration() {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => const DualBackendConfigScreen(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final user = _authService.getCurrentUser();

    if (user == null) {
      return const Scaffold(
        body: Center(child: Text('User not found')),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Profile'),
        actions: [
          if (_isRefreshing)
            const Padding(
              padding: EdgeInsets.all(16.0),
              child: SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
              ),
            )
          else
            IconButton(
              icon: const Icon(Icons.refresh),
              onPressed: _refreshProfile,
              tooltip: 'Refresh Profile',
            ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            const SizedBox(height: 20),
            
            // Profile Photo with Long Press Gesture (Secret for Super Admin)
            GestureDetector(
              onLongPress: _onProfilePhotoLongPress,
              child: Hero(
                tag: 'profile_photo',
                child: Container(
                  width: 120,
                  height: 120,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: theme.primaryColor.withOpacity(0.1),
                    border: Border.all(
                      color: theme.primaryColor,
                      width: 3,
                    ),
                  ),
                  child: user.photoUrl != null && user.photoUrl!.isNotEmpty
                      ? ClipOval(
                          child: Image.network(
                            user.photoUrl!,
                            fit: BoxFit.cover,
                            loadingBuilder: (context, child, loadingProgress) {
                              if (loadingProgress == null) return child;
                              return Center(
                                child: CircularProgressIndicator(
                                  value: loadingProgress.expectedTotalBytes != null
                                      ? loadingProgress.cumulativeBytesLoaded /
                                          loadingProgress.expectedTotalBytes!
                                      : null,
                                ),
                              );
                            },
                            errorBuilder: (context, error, stackTrace) {
                              return Icon(
                                Icons.person,
                                size: 60,
                                color: theme.primaryColor,
                              );
                            },
                          ),
                        )
                      : Icon(
                          Icons.person,
                          size: 60,
                          color: theme.primaryColor,
                        ),
                ),
              ),
            ),
            
            const SizedBox(height: 24),
            
            // Name
            Text(
              user.name,
              style: theme.textTheme.headlineMedium,
              textAlign: TextAlign.center,
            ),
            
            const SizedBox(height: 8),
            
            // Role Badge
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              decoration: BoxDecoration(
                color: theme.primaryColor.withOpacity(0.1),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: theme.primaryColor.withOpacity(0.3),
                ),
              ),
              child: Text(
                user.role,
                style: TextStyle(
                  color: theme.primaryColor,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            
            const SizedBox(height: 32),
            
            // Information Cards
            _InfoCard(
              icon: Icons.person_outline,
              title: 'Username',
              value: user.username,
            ),
            
            const SizedBox(height: 12),
            
            _InfoCard(
              icon: Icons.email_outlined,
              title: 'Email',
              value: user.email,
            ),
            
            const SizedBox(height: 12),
            
            if (user.formattedMobile != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _InfoCard(
                  icon: Icons.phone_outlined,
                  title: 'Mobile Number',
                  value: user.formattedMobile!,
                ),
              ),
            
            if (user.dob != null && user.dob!.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _InfoCard(
                  icon: Icons.cake_outlined,
                  title: 'Date of Birth',
                  value: user.dob!,
                ),
              ),
            
            if (user.notificationPreference != null && user.notificationPreference!.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _InfoCard(
                  icon: Icons.notifications_outlined,
                  title: 'Notification Preferences',
                  value: user.notificationPreference!.join(', '),
                ),
              ),
            
            if (user.notificationList != null && user.notificationList!.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: _InfoCard(
                  icon: Icons.list_alt,
                  title: 'Notification List',
                  value: user.notificationList!.join(', '),
                ),
              ),
            
            const SizedBox(height: 32),
            
            // Action Buttons
            // Super Admin Configuration Button (only visible for Super Admins)
            if (user.isSuperAdmin) ...[
              CustomButton(
                text: 'Backend Configuration',
                onPressed: _navigateToConfiguration,
                icon: Icons.settings,
                backgroundColor: Colors.deepOrange,
                textColor: Colors.white,
              ),
              const SizedBox(height: 12),
            ],
            
            CustomButton(
              text: 'Logout',
              onPressed: _handleLogout,
              icon: Icons.logout,
              backgroundColor: Colors.red,
              textColor: Colors.white,
            ),
            
            const SizedBox(height: 32),
            
            // Footer
            Text(
              '🙏 Serving with devotion 🙏',
              style: theme.textTheme.bodyMedium?.copyWith(
                fontStyle: FontStyle.italic,
                color: theme.primaryColor,
              ),
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String value;

  const _InfoCard({
    required this.icon,
    required this.title,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: theme.primaryColor.withOpacity(0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(
                icon,
                color: theme.primaryColor,
                size: 24,
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: theme.textTheme.bodySmall,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    value,
                    style: theme.textTheme.bodyLarge?.copyWith(
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
