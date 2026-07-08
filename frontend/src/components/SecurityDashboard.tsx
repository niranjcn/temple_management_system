import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Shield, 
  AlertTriangle, 
  Users, 
  Activity, 
  Clock,
  MapPin,
  Smartphone,
  RefreshCw
} from 'lucide-react';
import api from '@/api/api';

interface SecuritySummary {
  total_events: number;
  failed_login_attempts: number;
  successful_logins: number;
  token_refreshes: number;
  suspicious_activities: number;
  unique_ips: number;
  active_sessions: number;
  time_range_hours: number;
}

interface SecurityEvent {
  _id: string;
  event_type: string;
  timestamp: string;
  ip_address?: string;
  user_agent?: string;
  user_id?: string;
  mobile_number?: string;
  details: Record<string, any>;
}

interface SuspiciousIP {
  ip_address: string;
  failed_attempts: number;
  last_attempt: string;
  event_types: string[];
}

interface ActiveSession {
  _id: string;
  user_id: string;
  ip_address: string;
  user_agent: string;
  device_fingerprint?: Record<string, any>;
  location?: Record<string, number>;
  created_at: string;
  last_activity: string;
  expires_at: string;
}

const SecurityDashboard: React.FC = () => {
  const [summary, setSummary] = useState<SecuritySummary | null>(null);
  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [suspiciousIPs, setSuspiciousIPs] = useState<SuspiciousIP[]>([]);
  const [activeSessions, setActiveSessions] = useState<ActiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState(24);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [summaryRes, eventsRes, suspiciousRes, sessionsRes] = await Promise.all([
        api.get(`/admin/security/summary?hours=${timeRange}`),
        api.get(`/admin/security/events?hours=${timeRange}&limit=50`),
        api.get(`/admin/security/suspicious-ips?hours=${timeRange}`),
        api.get(`/admin/security/active-sessions`)
      ]);

      console.log('Security dashboard API responses:', { summaryRes, eventsRes, suspiciousRes, sessionsRes });

      setSummary(summaryRes.data || null);
      setEvents(Array.isArray(eventsRes.data) ? eventsRes.data : []);
      setSuspiciousIPs(Array.isArray(suspiciousRes.data) ? suspiciousRes.data : []);
      setActiveSessions(Array.isArray(sessionsRes.data) ? sessionsRes.data : []);
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load security data');
      console.error('Security dashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCleanup = async () => {
    try {
      const result = await api.post('/admin/security/cleanup?days_to_keep=90');
      alert(`Cleanup completed: ${JSON.stringify(result)}`);
      await loadData();
    } catch (err: any) {
      alert(`Cleanup failed: ${err.response?.data?.detail || err.message}`);
    }
  };

  const revokeUserTokens = async (userId: string) => {
    try {
      const result = await api.post(`/admin/security/revoke-user-tokens/${userId}`, null, {
        params: { reason: 'admin_security_action' }
      });
      alert(`Tokens revoked: ${result.data.message || 'Success'}`);
      await loadData();
    } catch (err: any) {
      alert(`Token revocation failed: ${err.response?.data?.detail || err.message}`);
    }
  };

  useEffect(() => {
    loadData();
  }, [timeRange]);

  const getEventTypeColor = (eventType: string): string => {
    const colors: Record<string, string> = {
      'login_success': 'bg-green-100 text-green-800',
      'login_failed': 'bg-red-100 text-red-800',
      'otp_verification_failed': 'bg-red-100 text-red-800',
      'authentication_failed': 'bg-red-100 text-red-800',
      'token_refreshed': 'bg-blue-100 text-blue-800',
      'suspicious_activity_detected': 'bg-orange-100 text-orange-800',
      'rate_limit_exceeded': 'bg-purple-100 text-purple-800',
      'logout': 'bg-gray-100 text-gray-800'
    };
    return colors[eventType] || 'bg-gray-100 text-gray-800';
  };

  const formatTimestamp = (timestamp: string): string => {
    return new Date(timestamp).toLocaleString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <Alert className="bg-red-50 border-red-200">
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription className="text-red-800">
          {error}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Shield className="h-8 w-8 text-blue-600" />
          Security Dashboard
        </h1>
        <div className="flex gap-2">
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(Number(e.target.value))}
            className="px-3 py-2 border rounded-md"
          >
            <option value={1}>Last 1 hour</option>
            <option value={24}>Last 24 hours</option>
            <option value={168}>Last 7 days</option>
            <option value={720}>Last 30 days</option>
          </select>
          <Button onClick={loadData} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Events</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.total_events}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Failed Logins</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">
                {summary.failed_login_attempts}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Sessions</CardTitle>
              <Users className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                {summary.active_sessions}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Unique IPs</CardTitle>
              <MapPin className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{summary.unique_ips}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs for Different Views */}
      <Tabs defaultValue="events" className="space-y-4">
        <TabsList>
          <TabsTrigger value="events">Recent Events</TabsTrigger>
          <TabsTrigger value="suspicious">Suspicious IPs</TabsTrigger>
          <TabsTrigger value="sessions">Active Sessions</TabsTrigger>
          <TabsTrigger value="admin">Admin Actions</TabsTrigger>
        </TabsList>

        {/* Recent Events */}
        <TabsContent value="events">
          <Card>
            <CardHeader>
              <CardTitle>Recent Security Events</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Array.isArray(events) && events.length > 0 ? (
                  events.map((event) => (
                    <div
                      key={event._id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center space-x-3">
                        <Badge className={getEventTypeColor(event.event_type)}>
                          {event.event_type}
                        </Badge>
                        <div>
                          <p className="text-sm font-medium">
                            {event.ip_address} • {formatTimestamp(event.timestamp)}
                          </p>
                          {event.user_id && (
                            <p className="text-xs text-gray-500">User: {event.user_id}</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        {event.details.endpoint && (
                          <p className="text-xs text-gray-500">{event.details.endpoint}</p>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-center py-4">No events found</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Suspicious IPs */}
        <TabsContent value="suspicious">
          <Card>
            <CardHeader>
              <CardTitle>Suspicious IP Addresses</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Array.isArray(suspiciousIPs) && suspiciousIPs.length > 0 ? (
                  suspiciousIPs.map((ip) => (
                    <div
                      key={ip.ip_address}
                      className="flex items-center justify-between p-3 border rounded-lg bg-red-50 border-red-200"
                    >
                      <div>
                        <p className="font-medium text-red-800">{ip.ip_address}</p>
                        <p className="text-sm text-red-600">
                          {ip.failed_attempts} failed attempts
                        </p>
                        <p className="text-xs text-red-500">
                          Last: {formatTimestamp(ip.last_attempt)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {Array.isArray(ip.event_types) && ip.event_types.map((type) => (
                          <Badge key={type} variant="destructive" className="text-xs">
                            {type}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-center py-4">No suspicious IPs detected</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Active Sessions */}
        <TabsContent value="sessions">
          <Card>
            <CardHeader>
              <CardTitle>Active User Sessions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Array.isArray(activeSessions) && activeSessions.length > 0 ? (
                  activeSessions.map((session) => (
                  <div
                    key={session._id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center space-x-3">
                      <Smartphone className="h-4 w-4 text-blue-500" />
                      <div>
                        <p className="text-sm font-medium">User: {session.user_id}</p>
                        <p className="text-xs text-gray-500">
                          {session.ip_address} • Started: {formatTimestamp(session.created_at)}
                        </p>
                        <p className="text-xs text-gray-500">
                          Last Active: {formatTimestamp(session.last_activity)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {session.device_fingerprint && (
                        <Badge variant="outline" className="text-xs">
                          Device Verified
                        </Badge>
                      )}
                      {session.location && (
                        <Badge variant="outline" className="text-xs">
                          Location
                        </Badge>
                      )}
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => revokeUserTokens(session.user_id)}
                      >
                        Revoke
                      </Button>
                    </div>
                    </div>
                  ))
                ) : (
                  <p className="text-gray-500 text-center py-4">No active sessions</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Admin Actions */}
        <TabsContent value="admin">
          <Card>
            <CardHeader>
              <CardTitle>Administrative Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 border rounded-lg">
                  <h3 className="font-medium mb-2">Database Cleanup</h3>
                  <p className="text-sm text-gray-600 mb-3">
                    Remove old security events, expired tokens, and inactive sessions
                  </p>
                  <Button onClick={handleCleanup} variant="outline">
                    Run Cleanup (Keep 90 days)
                  </Button>
                </div>
                
                <div className="p-4 border rounded-lg">
                  <h3 className="font-medium mb-2">Enhanced Security Status</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>✅ Device Fingerprinting: Enabled</div>
                    <div>✅ Client IP Binding: Enabled</div>
                    <div>✅ Token Rotation: Enabled</div>
                    <div>✅ Geolocation Validation: Enabled</div>
                    <div>✅ Rate Limiting: Active</div>
                    <div>✅ Security Event Logging: Active</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SecurityDashboard;