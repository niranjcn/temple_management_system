import 'package:flutter/material.dart';
import '../config/api_config.dart';

/// Configuration screen for dual backend setup (Public + Admin APIs)
/// Only accessible to Super Admins (role_id == 0)
class DualBackendConfigScreen extends StatefulWidget {
  const DualBackendConfigScreen({super.key});

  @override
  State<DualBackendConfigScreen> createState() => _DualBackendConfigScreenState();
}

class _DualBackendConfigScreenState extends State<DualBackendConfigScreen> {
  final _formKey = GlobalKey<FormState>();
  
  // Public API fields (port 8080 - auth, bookings, events)
  final _publicIpController = TextEditingController();
  final _publicPortController = TextEditingController(text: '8080');
  
  // Admin API fields (port 8081 - attendance, location, admin ops)
  final _adminIpController = TextEditingController();
  final _adminPortController = TextEditingController(text: '8081');
  
  // App secret
  final _appSecretController = TextEditingController();
  
  bool _isLoading = false;
  bool _obscureSecret = true;
  bool _useSameIp = true; // Use same IP for both backends

  @override
  void initState() {
    super.initState();
    _loadCurrentConfig();
    
    // Link public IP changes to admin IP when using same IP
    _publicIpController.addListener(() {
      if (_useSameIp) {
        _adminIpController.text = _publicIpController.text;
      }
    });
  }

  @override
  void dispose() {
    _publicIpController.dispose();
    _publicPortController.dispose();
    _adminIpController.dispose();
    _adminPortController.dispose();
    _appSecretController.dispose();
    super.dispose();
  }

  Future<void> _loadCurrentConfig() async {
    setState(() => _isLoading = true);
    try {
      final publicUrl = await ApiConfig.getPublicUrl();
      final adminUrl = await ApiConfig.getAdminUrl();
      final secret = await ApiConfig.getAppSecret();
      
      // Parse Public URL
      final publicUri = Uri.tryParse(publicUrl);
      if (publicUri != null && publicUri.host.isNotEmpty) {
        _publicIpController.text = publicUri.host;
        _publicPortController.text = publicUri.hasPort ? publicUri.port.toString() : '8080';
      }
      
      // Parse Admin URL
      final adminUri = Uri.tryParse(adminUrl);
      if (adminUri != null && adminUri.host.isNotEmpty) {
        _adminIpController.text = adminUri.host;
        _adminPortController.text = adminUri.hasPort ? adminUri.port.toString() : '8081';
      }
      
      // Check if same IP is used
      setState(() {
        _useSameIp = _publicIpController.text == _adminIpController.text;
      });
      
      _appSecretController.text = secret;
    } catch (e) {
      _showSnackBar('Error loading configuration: $e', isError: true);
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _testConnections() async {
    final publicIp = _publicIpController.text.trim();
    final publicPort = _publicPortController.text.trim();
    final adminIp = _useSameIp ? publicIp : _adminIpController.text.trim();
    final adminPort = _adminPortController.text.trim();

    if (publicIp.isEmpty || publicPort.isEmpty) {
      _showSnackBar('Please enter Public API IP and port', isError: true);
      return;
    }

    setState(() => _isLoading = true);

    try {
      // Test Public API
      final publicProtocol = publicPort == '443' ? 'https' : 'http';
      final publicUrl = '$publicProtocol://$publicIp:$publicPort';
      final publicReachable = await ApiConfig.testConnection(publicUrl);

      // Test Admin API
      final adminProtocol = adminPort == '443' ? 'https' : 'http';
      final adminUrl = '$adminProtocol://$adminIp:$adminPort';
      final adminReachable = await ApiConfig.testConnection(adminUrl);

      if (publicReachable && adminReachable) {
        _showSnackBar('✓ Both backends are reachable!', isError: false);
      } else if (publicReachable) {
        _showSnackBar('⚠ Public API OK, but Admin API unreachable', isError: true);
      } else if (adminReachable) {
        _showSnackBar('⚠ Admin API OK, but Public API unreachable', isError: true);
      } else {
        _showSnackBar('✗ Neither backend is reachable', isError: true);
      }
    } catch (e) {
      _showSnackBar('Error testing connections: $e', isError: true);
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _saveConfiguration() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isLoading = true);

    try {
      // Build Public API URL
      final publicIp = _publicIpController.text.trim();
      final publicPort = _publicPortController.text.trim();
      final publicProtocol = publicPort == '443' ? 'https' : 'http';
      final publicUrl = '$publicProtocol://$publicIp:$publicPort';

      // Build Admin API URL
      final adminIp = _useSameIp ? publicIp : _adminIpController.text.trim();
      final adminPort = _adminPortController.text.trim();
      final adminProtocol = adminPort == '443' ? 'https' : 'http';
      final adminUrl = '$adminProtocol://$adminIp:$adminPort';

      // Save configuration
      await ApiConfig.savePublicUrl(publicUrl);
      await ApiConfig.saveAdminUrl(adminUrl);
      await ApiConfig.saveAppSecret(_appSecretController.text);

      _showSnackBar('✓ Configuration saved successfully!', isError: false);
      
      // Wait a moment then go back
      await Future.delayed(const Duration(seconds: 1));
      if (mounted) {
        Navigator.of(context).pop(true);
      }
    } catch (e) {
      _showSnackBar('Error saving configuration: $e', isError: true);
    } finally {
      setState(() => _isLoading = false);
    }
  }

  void _showSnackBar(String message, {required bool isError}) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? Colors.red : Colors.green,
        duration: Duration(seconds: isError ? 4 : 2),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Backend Configuration'),
        backgroundColor: Colors.deepOrange,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : SingleChildScrollView(
              padding: const EdgeInsets.all(16.0),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Info Banner
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.blue.shade50,
                        border: Border.all(color: Colors.blue),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Icon(Icons.info, color: Colors.blue),
                              SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  'Dual Backend Configuration',
                                  style: TextStyle(fontWeight: FontWeight.bold),
                                ),
                              ),
                            ],
                          ),
                          SizedBox(height: 8),
                          Text(
                            '• Public API (Port 8080): Authentication, Bookings, Events\n'
                            '• Admin API (Port 8081): Attendance, Location, Admin Operations',
                            style: TextStyle(fontSize: 12),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),

                    // Public API Configuration
                    const Text(
                      'Public API (Auth & Bookings)',
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          flex: 3,
                          child: TextFormField(
                            controller: _publicIpController,
                            decoration: const InputDecoration(
                              labelText: 'IP Address / Hostname',
                              hintText: '192.168.1.100',
                              border: OutlineInputBorder(),
                              prefixIcon: Icon(Icons.computer),
                            ),
                            validator: (value) {
                              if (value == null || value.trim().isEmpty) {
                                return 'Required';
                              }
                              return null;
                            },
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          flex: 1,
                          child: TextFormField(
                            controller: _publicPortController,
                            decoration: const InputDecoration(
                              labelText: 'Port',
                              hintText: '8080',
                              border: OutlineInputBorder(),
                            ),
                            keyboardType: TextInputType.number,
                            validator: (value) {
                              if (value == null || value.trim().isEmpty) {
                                return 'Required';
                              }
                              final port = int.tryParse(value);
                              if (port == null || port < 1 || port > 65535) {
                                return 'Invalid';
                              }
                              return null;
                            },
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 24),

                    // Same IP checkbox
                    CheckboxListTile(
                      title: const Text('Use same IP for Admin API'),
                      subtitle: const Text('Uncheck if backends are on different servers'),
                      value: _useSameIp,
                      onChanged: (value) {
                        setState(() {
                          _useSameIp = value ?? true;
                          if (_useSameIp) {
                            _adminIpController.text = _publicIpController.text;
                          }
                        });
                      },
                    ),
                    const SizedBox(height: 12),

                    // Admin API Configuration
                    const Text(
                      'Admin API (Attendance & Operations)',
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(
                          flex: 3,
                          child: TextFormField(
                            controller: _adminIpController,
                            enabled: !_useSameIp,
                            decoration: InputDecoration(
                              labelText: 'IP Address / Hostname',
                              hintText: '192.168.1.100',
                              border: const OutlineInputBorder(),
                              prefixIcon: const Icon(Icons.admin_panel_settings),
                              filled: _useSameIp,
                            ),
                            validator: (value) {
                              if (!_useSameIp && (value == null || value.trim().isEmpty)) {
                                return 'Required';
                              }
                              return null;
                            },
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          flex: 1,
                          child: TextFormField(
                            controller: _adminPortController,
                            decoration: const InputDecoration(
                              labelText: 'Port',
                              hintText: '8081',
                              border: OutlineInputBorder(),
                            ),
                            keyboardType: TextInputType.number,
                            validator: (value) {
                              if (value == null || value.trim().isEmpty) {
                                return 'Required';
                              }
                              final port = int.tryParse(value);
                              if (port == null || port < 1 || port > 65535) {
                                return 'Invalid';
                              }
                              return null;
                            },
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 24),

                    // App Secret
                    const Text(
                      'App Secret',
                      style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 12),
                    TextFormField(
                      controller: _appSecretController,
                      obscureText: _obscureSecret,
                      decoration: InputDecoration(
                        labelText: 'Mobile App Secret',
                        hintText: 'From backend .env MOBILE_APP_SECRET',
                        border: const OutlineInputBorder(),
                        prefixIcon: const Icon(Icons.vpn_key),
                        suffixIcon: IconButton(
                          icon: Icon(_obscureSecret ? Icons.visibility : Icons.visibility_off),
                          onPressed: () => setState(() => _obscureSecret = !_obscureSecret),
                        ),
                      ),
                      validator: (value) {
                        if (value == null || value.trim().isEmpty) {
                          return 'App secret is required';
                        }
                        return null;
                      },
                    ),
                    const SizedBox(height: 32),

                    // Test Connection Button
                    ElevatedButton.icon(
                      onPressed: _isLoading ? null : _testConnections,
                      icon: const Icon(Icons.wifi_tethering),
                      label: const Text('Test Both Connections'),
                      style: ElevatedButton.styleFrom(
                        padding: const EdgeInsets.all(16),
                        backgroundColor: Colors.blue,
                        foregroundColor: Colors.white,
                      ),
                    ),
                    const SizedBox(height: 12),

                    // Save Configuration Button
                    ElevatedButton.icon(
                      onPressed: _isLoading ? null : _saveConfiguration,
                      icon: const Icon(Icons.save),
                      label: const Text('Save Configuration'),
                      style: ElevatedButton.styleFrom(
                        padding: const EdgeInsets.all(16),
                        backgroundColor: Colors.green,
                        foregroundColor: Colors.white,
                      ),
                    ),
                  ],
                ),
              ),
            ),
    );
  }
}
