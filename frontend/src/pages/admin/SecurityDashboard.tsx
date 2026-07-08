import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Shield, Search, Calendar, User, Activity, Globe, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import api from "@/api/api";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";

interface SecurityEvent {
  _id: string;
  event_type: string;
  timestamp: string;
  ip_address?: string;
  user_agent?: string;
  user_id?: string;
  username?: string;
  mobile_number?: string;
  details: Record<string, any>;
}

interface SecurityEventsResponse {
  events: SecurityEvent[];
  total_count: number;
  page: number;
  page_size: number;
  total_pages: number;
}

interface SecurityStats {
  time_range_hours: number;
  event_counts: Record<string, number>;
  unique_ips: number;
  unique_users: number;
  total_events: number;
}

const SecurityDashboard = () => {
  const { user } = useAuth() as any;
  const roleId = user?.role_id ?? 99;

  // Access control: Only Super Admin (0) and Admin (1)
  if (roleId > 1) {
    return (
      <div className="container mx-auto py-8">
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-700">Access Denied</CardTitle>
            <CardDescription className="text-red-600">
              You do not have permission to view security events.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const [events, setEvents] = useState<SecurityEvent[]>([]);
  const [stats, setStats] = useState<SecurityStats | null>(null);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 50;

  // Filters
  const [usernameFilter, setUsernameFilter] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [statsHours, setStatsHours] = useState(24);

  // Fetch event types for filter dropdown
  const fetchEventTypes = async () => {
    try {
      const response = await api.get("/security/events/types");
      setEventTypes(response.data);
    } catch (error: any) {
      console.error("Error fetching event types:", error);
    }
  };

  // Fetch security events
  const fetchEvents = async (page = 1) => {
    setLoading(true);
    try {
      const params: any = {
        page,
        page_size: pageSize,
      };

      if (usernameFilter) params.username = usernameFilter;
      if (eventTypeFilter && eventTypeFilter !== "all") params.event_type = eventTypeFilter;
      if (startDate) params.start_date = new Date(startDate).toISOString();
      if (endDate) params.end_date = new Date(endDate).toISOString();

      const response = await api.get<SecurityEventsResponse>("/security/events", { params });
      setEvents(response.data.events);
      setTotalPages(response.data.total_pages);
      setTotalCount(response.data.total_count);
      setCurrentPage(response.data.page);
    } catch (error: any) {
      console.error("Error fetching security events:", error);
      toast.error(error.response?.data?.detail || "Failed to fetch security events");
    } finally {
      setLoading(false);
    }
  };

  // Fetch security statistics
  const fetchStats = async () => {
    setStatsLoading(true);
    try {
      const response = await api.get<SecurityStats>("/security/events/stats", {
        params: { hours: statsHours }
      });
      setStats(response.data);
    } catch (error: any) {
      console.error("Error fetching security stats:", error);
      toast.error("Failed to fetch security statistics");
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    fetchEventTypes();
    fetchEvents(1);
    fetchStats();
  }, []);

  const handleApplyFilters = () => {
    setCurrentPage(1);
    fetchEvents(1);
  };

  const handleClearFilters = () => {
    setUsernameFilter("");
    setEventTypeFilter("all");
    setStartDate("");
    setEndDate("");
    setCurrentPage(1);
    fetchEvents(1);
  };

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      fetchEvents(newPage);
    }
  };

  const getEventTypeBadgeColor = (eventType: string) => {
    const lowerType = eventType.toLowerCase();
    if (lowerType.includes("success") || lowerType.includes("login")) return "bg-green-100 text-green-800 border-green-300";
    if (lowerType.includes("fail") || lowerType.includes("error")) return "bg-red-100 text-red-800 border-red-300";
    if (lowerType.includes("suspicious") || lowerType.includes("rate_limit")) return "bg-yellow-100 text-yellow-800 border-yellow-300";
    if (lowerType.includes("refresh") || lowerType.includes("token")) return "bg-blue-100 text-blue-800 border-blue-300";
    return "bg-gray-100 text-gray-800 border-gray-300";
  };

  const formatEventType = (eventType: string) => {
    return eventType
      .split("_")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const parseDeviceInfo = (details: Record<string, any>) => {
    try {
      const deviceIdentifier = details.device_identifier;
      if (typeof deviceIdentifier === "string") {
        const parsed = JSON.parse(deviceIdentifier);
        return {
          platform: parsed.platform || "Unknown",
          screen: `${parsed.screen_width}x${parsed.screen_height}`,
          timezone: parsed.timezone || "Unknown",
          language: parsed.language || "Unknown"
        };
      }
      return null;
    } catch {
      return null;
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-orange-100 rounded-lg">
            <Shield className="h-6 w-6 text-orange-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-neutral-800">Security Overview</h1>
            <p className="text-sm text-neutral-600">Monitor security events and system activity</p>
          </div>
        </div>
        <Button
          onClick={() => {
            fetchEvents(currentPage);
            fetchStats();
          }}
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-neutral-600">Total Events</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{stats.total_events}</div>
              <p className="text-xs text-neutral-500">Last {stats.time_range_hours}h</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-neutral-600">Unique Users</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats.unique_users}</div>
              <p className="text-xs text-neutral-500">Active users</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-neutral-600">Unique IPs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{stats.unique_ips}</div>
              <p className="text-xs text-neutral-500">Different locations</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-neutral-600">
                <div className="flex items-center gap-2">
                  Time Range
                  <Select
                    value={statsHours.toString()}
                    onValueChange={(val) => {
                      setStatsHours(parseInt(val));
                      setTimeout(() => fetchStats(), 100);
                    }}
                  >
                    <SelectTrigger className="h-6 w-20 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="24">24h</SelectItem>
                      <SelectItem value="72">3d</SelectItem>
                      <SelectItem value="168">7d</SelectItem>
                      <SelectItem value="720">30d</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <div className="text-sm text-neutral-500">Loading...</div>
              ) : (
                <div className="space-y-1">
                  {Object.entries(stats.event_counts).slice(0, 2).map(([type, count]) => (
                    <div key={type} className="flex justify-between text-xs">
                      <span className="text-neutral-600 truncate">{formatEventType(type)}</span>
                      <span className="font-medium">{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Search className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-sm">Username</Label>
              <Input
                id="username"
                placeholder="Search by username"
                value={usernameFilter}
                onChange={(e) => setUsernameFilter(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="eventType" className="text-sm">Event Type</Label>
              <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All events" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All events</SelectItem>
                  {eventTypes.map((type) => (
                    <SelectItem key={type} value={type}>
                      {formatEventType(type)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="startDate" className="text-sm">Start Date</Label>
              <Input
                id="startDate"
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endDate" className="text-sm">End Date</Label>
              <Input
                id="endDate"
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <Button onClick={handleApplyFilters} className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              Apply Filters
            </Button>
            <Button onClick={handleClearFilters} variant="outline">
              Clear Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Events Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Security Events
            </div>
            <Badge variant="outline" className="text-sm">
              {totalCount} total events
            </Badge>
          </CardTitle>
          <CardDescription>
            Showing page {currentPage} of {totalPages}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-neutral-500">Loading events...</div>
          ) : events.length === 0 ? (
            <div className="text-center py-8 text-neutral-500">No security events found</div>
          ) : (
            <div className="space-y-3">
              {events.map((event) => {
                const deviceInfo = parseDeviceInfo(event.details);
                return (
                  <Card key={event._id} className="border-neutral-200">
                    <CardContent className="pt-4">
                      <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                        {/* Event Type Badge */}
                        <div className="flex-shrink-0">
                          <Badge className={`${getEventTypeBadgeColor(event.event_type)} border`}>
                            {formatEventType(event.event_type)}
                          </Badge>
                        </div>

                        {/* Main Info */}
                        <div className="flex-1 space-y-2">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                            {event.username && (
                              <div className="flex items-center gap-2 text-neutral-700">
                                <User className="h-4 w-4 text-neutral-500" />
                                <span className="font-medium">{event.username}</span>
                              </div>
                            )}
                            
                            <div className="flex items-center gap-2 text-neutral-600">
                              <Calendar className="h-4 w-4 text-neutral-500" />
                              {format(new Date(event.timestamp), "MMM dd, yyyy HH:mm:ss")}
                            </div>

                            {event.ip_address && (
                              <div className="flex items-center gap-2 text-neutral-600">
                                <Globe className="h-4 w-4 text-neutral-500" />
                                {event.ip_address}
                              </div>
                            )}

                            {deviceInfo && (
                              <div className="text-neutral-600 text-xs">
                                Platform: {deviceInfo.platform} | Screen: {deviceInfo.screen}
                              </div>
                            )}
                          </div>

                          {/* User Agent */}
                          {event.user_agent && (
                            <div className="text-xs text-neutral-500 bg-neutral-50 p-2 rounded border">
                              <span className="font-medium">User Agent:</span> {event.user_agent}
                            </div>
                          )}

                          {/* Additional Details */}
                          {Object.keys(event.details).length > 0 && (
                            <details className="text-xs">
                              <summary className="cursor-pointer text-orange-600 hover:text-orange-700 font-medium">
                                View Details
                              </summary>
                              <pre className="mt-2 p-2 bg-neutral-50 rounded border text-neutral-700 overflow-x-auto">
                                {JSON.stringify(event.details, null, 2)}
                              </pre>
                            </details>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-6 pt-4 border-t">
              <div className="text-sm text-neutral-600">
                Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalCount)} of {totalCount} events
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <div className="text-sm text-neutral-700 px-3">
                  Page {currentPage} of {totalPages}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SecurityDashboard;
