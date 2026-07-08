import 'package:flutter/material.dart';
import 'dual_backend_config_screen.dart';
import 'login_screen.dart';

/// Initial setup wizard shown on first app launch
/// Redirects to DualBackendConfigScreen for configuration
class InitialSetupScreen extends StatelessWidget {
  const InitialSetupScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              // App Icon/Logo
              Container(
                width: 120,
                height: 120,
                decoration: BoxDecoration(
                  color: Colors.deepOrange.withOpacity(0.1),
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.temple_hindu,
                  size: 60,
                  color: Colors.deepOrange,
                ),
              ),
              const SizedBox(height: 32),
              
              const Text(
                'Welcome to Temple Attendance',
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.bold,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              
              const Text(
                'First, we need to configure your backend server connection.',
                style: TextStyle(fontSize: 16),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 48),
              
              ElevatedButton.icon(
                onPressed: () async {
                  // Navigate to configuration screen
                  final result = await Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (context) => const DualBackendConfigScreen(),
                    ),
                  );
                  
                  // If configuration was successful, navigate to login
                  if (result == true && context.mounted) {
                    Navigator.of(context).pushReplacement(
                      MaterialPageRoute(
                        builder: (context) => const LoginScreen(),
                      ),
                    );
                  }
                },
                icon: const Icon(Icons.settings),
                label: const Text('Configure Backend'),
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 32,
                    vertical: 16,
                  ),
                  textStyle: const TextStyle(fontSize: 16),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
