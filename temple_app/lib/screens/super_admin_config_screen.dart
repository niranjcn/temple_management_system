import 'package:flutter/material.dart';
import '../config/api_config.dart';

class SuperAdminConfigScreen extends StatefulWidget {
  const SuperAdminConfigScreen({super.key});

  @override
  State<SuperAdminConfigScreen> createState() => _SuperAdminConfigScreenState();
}

class _SuperAdminConfigScreenState extends State<SuperAdminConfigScreen> {
  final _formKey = GlobalKey<FormState>();
  final _publicIpController = TextEditingController();
  final _publicPortController = TextEditingController();
  final _adminIpController = TextEditingController();
  final _adminPortController = TextEditingController();
  final _appSecretController = TextEditingController();
  
  bool _isLoading = false;
  bool _obscureSecret = true;
  bool _useManualPublicPort = false;
  bool _useManualAdminPort = false;
  String? _detectedPublicUrl;
  String? _detectedAdminUrl;

  @override
  void initState() {
    super.initState();
    _loadCurrentConfig();
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
      
      // Parse Public URL to separate IP and port
      final publicUri = Uri.tryParse(publicUrl);
      if (publicUri != null && publicUri.host.isNotEmpty) {
        _publicIpController.text = publicUri.host;
        if (publicUri.hasPort) {
          _publicPortController.text = publicUri.port.toString();
          _useManualPublicPort = true;
        } else {
          _publicPortController.text = '8080'; // Default public port
        }
      }
      
      // Parse Admin URL to separate IP and port
      final adminUri = Uri.tryParse(adminUrl);
      if (adminUri != null && adminUri.host.isNotEmpty) {
        _adminIpController.text = adminUri.host;
        if (adminUri.hasPort) {
          _adminPortController.text = adminUri.port.toString();
          _useManualAdminPort = true;
        } else {
          _adminPortController.text = '8081'; // Default admin port
        }
      } else {
        // If admin URL not configured, copy from public IP with different port
        _adminIpController.text = _publicIpController.text;
        _adminPortController.text = '8081';
      }
      
      _appSecretController.text = secret;
    } catch (e) {
      _showSnackBar('Error loading configuration: $e', isError: true);
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _testConnection() async {
    final input = _backendUrlController.text.trim();
    if (input.isEmpty) {
      _showSnackBar('Please enter an IP address or URL', isError: true);
      return;
    }

    setState(() {
      _isTestingConnection = true;
      _detectedUrl = null;
    });

    try {
      String? detectedUrl;
      
      // If user specified a port manually, use it directly
      if (_useManualPort && _portController.text.trim().isNotEmpty) {
        final port = _portController.text.trim();
        final protocol = port == '443' ? 'https' : 'http';
        final testUrl = '$protocol://$input:$port';
        
        final isReachable = await ApiConfig.testConnection(testUrl);
        if (isReachable) {
          detectedUrl = testUrl;
        }
      } else {
        // Auto-detect port
        detectedUrl = await ApiConfig.autoDetectPort(input);
      }
      
      setState(() {
        _detectedUrl = detectedUrl;
        _isTestingConnection = false;
      });

      if (detectedUrl != null) {
        // Update the fields with detected/validated URL
        final uri = Uri.parse(detectedUrl);
        _backendUrlController.text = uri.host;
        if (uri.hasPort) {
          _portController.text = uri.port.toString();
        }
        _showSnackBar('✓ Backend reachable at: $detectedUrl', isError: false);
      } else {
        _showSnackBar('✗ Could not reach backend', isError: true);
      }
    } catch (e) {
      setState(() => _isTestingConnection = false);
      _showSnackBar('Error testing connection: $e', isError: true);
    }
  }

  Future<void> _saveConfiguration() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _isLoading = true);

    try {
      // Build URL from IP and port
      String finalUrl;
      final host = _backendUrlController.text.trim();
      
      if (_useManualPort && _portController.text.trim().isNotEmpty) {
        final port = _portController.text.trim();
        final protocol = port == '443' ? 'https' : 'http';
        finalUrl = '$protocol://$host:$port';
      } else if (_detectedUrl != null) {
        finalUrl = _detectedUrl!;
      } else {
        // Default to common port
        finalUrl = 'http://$host:8080';
      }
      
      await ApiConfig.saveBaseUrl(finalUrl);
      await ApiConfig.saveAppSecret(_appSecretController.text);

      _showSnackBar('✓ Configuration saved successfully!', isError: false);
      
      // Wait a moment then go back
      await Future.delayed(const Duration(seconds: 1));
      if (mounted) {
        Navigator.of(context).pop(true); // Return true to indicate success
      }
    } catch (e) {
      _showSnackBar('Error saving configuration: $e', isError: true);
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _clearConfiguration() async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Clear Configuration?'),
        content: const Text(
          'This will remove all saved backend settings. '
          'You will need to reconfigure before using the app.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Clear'),
          ),
        ],
      ),
    );

    if (confirm == true) {
      try {
        await ApiConfig.clearConfiguration();
        _backendUrlController.clear();
        _appSecretController.clear();
        _showSnackBar('Configuration cleared', isError: false);
      } catch (e) {
        _showSnackBar('Error clearing configuration: $e', isError: true);
      }
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
        actions: [
          IconButton(
            icon: const Icon(Icons.delete_outline),
            onPressed: _clearConfiguration,
            tooltip: 'Clear Configuration',
          ),
        ],
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
                    // Warning Banner
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.amber.shade100,
                        border: Border.all(color: Colors.orange),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: const Row(
                        children: [
                          Icon(Icons.warning, color: Colors.orange),
                          SizedBox(width: 8),
                          Expanded(
                            child: Text(
                              'Super Admin Only - Changing these settings may break the app connection',
                              style: TextStyle(fontWeight: FontWeight.bold),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 24),

                    // Backend URL Section
                    const Text(
                      'Backend URL',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Enter IP address (e.g., 192.168.1.100) or full URL. '
                      'Leave port blank for auto-detection.',
                      style: TextStyle(color: Colors.grey),
                    ),
                    const SizedBox(height: 12),
                    
                    Row(
                      children: [
                        Expanded(
                          flex: 3,
                          child: TextFormField(
                            controller: _backendUrlController,
                            decoration: const InputDecoration(
                              labelText: 'IP Address or Hostname',
                              hintText: '192.168.1.100',
                              border: OutlineInputBorder(),
                              prefixIcon: Icon(Icons.dns),
                            ),
                            validator: (value) {
                              if (value == null || value.trim().isEmpty) {
                                return 'Required';
                              }
                              return null;
                            },
                            keyboardType: TextInputType.url,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          flex: 1,
                          child: TextFormField(
                            controller: _portController,
                            decoration: const InputDecoration(
                              labelText: 'Port',
                              hintText: '8080',
                              border: OutlineInputBorder(),
                              prefixIcon: Icon(Icons.settings_ethernet),
                            ),
                            keyboardType: TextInputType.number,
                            onChanged: (value) {
                              setState(() {
                                _useManualPort = value.trim().isNotEmpty;
                              });
                            },
                            validator: (value) {
                              if (value != null && value.trim().isNotEmpty) {
                                final port = int.tryParse(value.trim());
                                if (port == null || port < 1 || port > 65535) {
                                  return 'Invalid port';
                                }
                              }
                              return null;
                            },
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    
                    Row(
                      children: [
                        Icon(Icons.info_outline, size: 16, color: Colors.grey[600]),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            _useManualPort && _portController.text.trim().isNotEmpty
                                ? 'Using port: ${_portController.text}'
                                : 'Port will be auto-detected (80, 443, 8080, etc.)',
                            style: TextStyle(
                              fontSize: 12,
                              color: Colors.grey[600],
                              fontStyle: FontStyle.italic,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    
                    // Test Connection Button
                    ElevatedButton.icon(
                      onPressed: _isTestingConnection ? null : _testConnection,
                      icon: const Icon(Icons.wifi_find),
                      label: Text(_isTestingConnection 
                          ? 'Testing Connection...' 
                          : (_useManualPort && _portController.text.trim().isNotEmpty
                              ? 'Test Connection (Port ${_portController.text})'
                              : 'Test Connection & Auto-detect Port')),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.blue,
                        foregroundColor: Colors.white,
                      ),
                    ),
                    
                    if (_detectedUrl != null) ...[
                      const SizedBox(height: 8),
                      Container(
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: Colors.green.shade50,
                          border: Border.all(color: Colors.green),
                          borderRadius: BorderRadius.circular(8),
                        ),
                        child: Row(
                          children: [
                            const Icon(Icons.check_circle, color: Colors.green),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                'Backend reachable at: $_detectedUrl',
                                style: const TextStyle(color: Colors.green),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                    
                    const SizedBox(height: 32),

                    // App Secret Section
                    const Text(
                      'Mobile App Secret',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Must match MOBILE_APP_SECRET in backend .env file',
                      style: TextStyle(color: Colors.grey),
                    ),
                    const SizedBox(height: 12),
                    
                    TextFormField(
                      controller: _appSecretController,
                      decoration: InputDecoration(
                        labelText: 'App Secret Key',
                        hintText: 'Enter secret from backend .env',
                        border: const OutlineInputBorder(),
                        prefixIcon: const Icon(Icons.key),
                        suffixIcon: IconButton(
                          icon: Icon(_obscureSecret 
                              ? Icons.visibility 
                              : Icons.visibility_off),
                          onPressed: () {
                            setState(() {
                              _obscureSecret = !_obscureSecret;
                            });
                          },
                        ),
                      ),
                      obscureText: _obscureSecret,
                      validator: (value) {
                        if (value == null || value.trim().isEmpty) {
                          return 'App secret is required';
                        }
                        if (value.trim().length < 20) {
                          return 'Secret seems too short (min 20 characters)';
                        }
                        return null;
                      },
                    ),
                    
                    const SizedBox(height: 32),

                    // Save Button
                    ElevatedButton.icon(
                      onPressed: _isLoading ? null : _saveConfiguration,
                      icon: const Icon(Icons.save),
                      label: Text(_isLoading ? 'Saving...' : 'Save Configuration'),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.green,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.all(16),
                      ),
                    ),
                    
                    const SizedBox(height: 16),

                    // Help Text
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.blue.shade50,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Icon(Icons.info, color: Colors.blue.shade700),
                              const SizedBox(width: 8),
                              Text(
                                'How to use:',
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  color: Colors.blue.shade700,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 8),
                          const Text(
                            '1. Enter your backend IP address or URL\n'
                            '2. Tap "Test Connection" to auto-detect the port\n'
                            '3. Enter the app secret from backend .env file\n'
                            '4. Tap "Save Configuration" to apply changes',
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
    );
  }
}
