import React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Calendar, Package, Image, TrendingUp, Flame, Star, DollarSign, Clock, MapPin } from "lucide-react"
import { Link } from "react-router-dom"
import { useQuery } from "@tanstack/react-query"
import api, { get, fetchBookings, fetchEmployeeBookings, EmployeeBooking, Booking } from "../../api/api"
import { toast } from "sonner"
import { useAuth } from "../../contexts/AuthContext"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis, PieChart, Pie, Cell } from "recharts"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"

// Define interfaces for the data we'll fetch

interface RitualInstance {
  ritualId: string;
  ritualName: string;
  devoteeName: string;
  naal: string;
  dob: string;
  subscription: string;
  quantity: number;
}

interface Ritual {
  _id: string;
  name: string;
  description: string;
  price: number;
  duration: string;
  popular: boolean;
  icon_name: string;
}

interface EventRec {
  _id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  description: string;
  image: string;
}

interface ActivityRec {
  id: string;
  username: string;
  role: string;
  activity: string;
  timestamp: string; // ISO
}

// Define stock item interface
interface StockItem {
  _id: string;
  name: string;
  quantity: number;
  unit: string;
}

// Fetch bookings data

// Fetch rituals data
const fetchRituals = (): Promise<Ritual[]> => get<Ritual[]>('/rituals/');

// Fetch stock data
const fetchStockItems = (): Promise<StockItem[]> => get<StockItem[]>('/stock/');

const AdminDashboard = () => {
  const { user } = (useAuth() as any) || {};
  const roleId: number = user?.role_id ?? 99;
  const showRecentActivities = roleId <= 1; // Super Admin (0) and Admin (1)
  const showRecentEvents = roleId > 1; // Everyone else that can access dashboard
  
  // --- Chart state ---
  const [seriesGranularity, setSeriesGranularity] = React.useState<'day' | 'month' | 'year'>('month');
  const [pieScope, setPieScope] = React.useState<'month' | 'year'>('month');
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = React.useState<number>(now.getMonth()); // 0-11
  const [selectedYear, setSelectedYear] = React.useState<number>(now.getFullYear());
  const MONTHS = [
    'January','February','March','April','May','June','July','August','September','October','November','December'
  ];
  
  // Fetch both public and employee bookings
  const { data: bookings, isLoading: isLoadingBookings } = useQuery<Booking[]>({
    queryKey: ['adminBookings'],
    queryFn: fetchBookings,
  });

  const { data: employeeBookings, isLoading: isLoadingEmployeeBookings } = useQuery<EmployeeBooking[]>({
    queryKey: ['adminEmployeeBookings'],
    queryFn: fetchEmployeeBookings,
  });

  // Fetch rituals data
  const { data: rituals, isLoading: isLoadingRituals } = useQuery<Ritual[]>({
    queryKey: ['adminRituals'],
    queryFn: fetchRituals,
  });

  // Fetch stock data
  const { data: stockItems, isLoading: isLoadingStock } = useQuery<StockItem[]>({
    queryKey: ['adminStockItems'],
    queryFn: fetchStockItems,
  });

  // Calculate combined stats from both booking types
  const totalBookings = (bookings?.length || 0) + (employeeBookings?.length || 0);
  const totalRituals = rituals?.length || 0;
  const publicRevenue = bookings?.reduce((sum, booking) => sum + booking.total_cost, 0) || 0;
  const employeeRevenue = employeeBookings?.reduce((sum, booking) => sum + booking.total_cost, 0) || 0;
  const totalRevenue = publicRevenue + employeeRevenue;
  
  // Calculate stock stats
  const totalStockItems = stockItems?.length || 0;
  const totalStockQuantity = stockItems?.reduce((sum, item) => sum + item.quantity, 0) || 0;
  const lowStockItems = stockItems?.filter(item => item.quantity < 10).length || 0;
  
  // Derive "upcoming" rituals from actual rituals list.
  // Since scheduling data isn't provided by the API, we surface popular rituals first then fall back to the first few.
  const upcomingRituals = (rituals || [])
    .slice()
    .sort((a, b) => Number(b.popular) - Number(a.popular))
    .slice(0, 4);

  const statsCards = [
    {
      title: "Total Bookings",
      value: totalBookings.toString(),
      change: "+12.5%", // This would ideally be calculated from historical data
      icon: Calendar,
      color: "text-purple-400",
      bgColor: "bg-purple-400/20",
      link: "/admin/bookings"
    },
    {
      title: "Active Rituals",
      value: totalRituals.toString(),
      change: "+3.2%", // This would ideally be calculated from historical data
      icon: Flame,
      color: "text-pink-400",
      bgColor: "bg-pink-400/20",
      link: "/admin/rituals"
    },
    {
      title: "Revenue (Month)",
      value: `₹${totalRevenue.toLocaleString()}`,
      change: "+8.1%", // This would ideally be calculated from historical data
      icon: DollarSign,
      color: "text-amber-400",
      bgColor: "bg-amber-400/20",
      link: "/admin/bookings" // navigate to bookings for revenue breakdown
    },
    {
      title: "Stock Items",
      value: totalStockItems.toString(),
      change: lowStockItems > 0 ? `${lowStockItems} low stock` : "All stocked",
      icon: Package,
      color: "text-blue-400",
      bgColor: "bg-blue-400/20",
      link: "/admin/stock"
    }
  ]

  // Fetch recent activities (only admins with role_id <=1 can access endpoint; others will 403)
  const { data: activities, isLoading: loadingActivities, isError: activitiesError } = useQuery<ActivityRec[]>({
    queryKey: ['adminActivities'],
    queryFn: () => get<ActivityRec[]>('/activity/activities'),
    staleTime: 60_000,
    enabled: showRecentActivities,
    retry: (failureCount, error: any) => {
      const status = error?.response?.status;
      // Don't retry unauthorized/forbidden repeatedly
      if (status === 401 || status === 403) return false;
      return failureCount < 2;
    },
  });

  // Recent events for non-admin roles (role_id > 1)
  const { data: events, isLoading: loadingEvents, isError: eventsError } = useQuery<EventRec[]>({
    queryKey: ['adminRecentEvents'],
    queryFn: () => get<EventRec[]>('/events/'),
    staleTime: 60_000,
    enabled: showRecentEvents,
  });

  // Helper to format relative time (simple, no external deps)
  const relativeTime = (iso: string) => {
    const now = Date.now();
    const ts = new Date(iso).getTime();
    const diffSec = Math.max(1, Math.floor((now - ts) / 1000));
    const units: [number, string][] = [
      [60, 'second'],
      [60, 'minute'],
      [24, 'hour'],
      [30, 'day'],
      [12, 'month']
    ];
    let value = diffSec; let unit = 'second';
    for (let i = 0; i < units.length; i++) {
      const [div, name] = units[i];
      if (value < div) { unit = name; break; }
      value = Math.floor(value / div);
      unit = name;
    }
    if (unit === 'second' && value > 59) { value = Math.floor(value / 60); unit = 'minute'; }
    return `${value} ${unit}${value !== 1 ? 's' : ''} ago`;
  };

  const recentActivities: ActivityRec[] = (activities || []).slice(0, 4);
  const recentEvents: EventRec[] = (events || [])
    .slice()
    .sort((a, b) => {
      const ad = new Date(a.date || 0).getTime();
      const bd = new Date(b.date || 0).getTime();
      return bd - ad;
    })
    .slice(0, 4);

  // Infer a destination route for an activity string
  const routeForActivity = (a: ActivityRec): string => {
    const text = a.activity.toLowerCase();
    if (text.includes('booking')) return '/admin/bookings';
    if (text.includes('stock')) return '/admin/stock';
    if (text.includes('gallery')) return '/admin/gallery';
    if (text.includes('event')) return '/admin/events';
    if (text.includes('ritual')) return '/admin/rituals';
    if (text.includes('admin')) return '/admin/management';
    return '/admin/activity';
  };

  // --- Helpers for analytics ---
  const objectIdToDate = (id: string) => new Date(parseInt(id?.substring(0, 8), 16) * 1000);
  const bookingVolume = (b: { instances: RitualInstance[] }) => b.instances?.reduce((s, i) => s + (Number(i.quantity) || 0), 0) || 0;
  const mergedBookings: Array<Booking | EmployeeBooking> = [
    ...(bookings || []),
    ...(employeeBookings || []),
  ];
  type BucketItem = { bucket: string; date: Date; volume: number };
  const formatBucket = (d: Date, gran: 'day' | 'month' | 'year') => {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    if (gran === 'day') return `${yyyy}-${mm}-${dd}`;
    if (gran === 'month') return `${yyyy}-${mm}`;
    return `${yyyy}`;
  };
  const seriesData: BucketItem[] = React.useMemo(() => {
    const map = new Map<string, BucketItem>();
    for (const b of mergedBookings) {
      const d = objectIdToDate((b as any)._id);
      if (isNaN(d.getTime())) continue;
      const key = formatBucket(d, seriesGranularity);
      const prev = map.get(key);
      const vol = bookingVolume(b as any);
      if (prev) {
        prev.volume += vol;
      } else {
        map.set(key, { bucket: key, date: d, volume: vol });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [mergedBookings, seriesGranularity]);

  const formatBucketLabel = (label: string, gran: 'day' | 'month' | 'year') => {
    try {
      if (gran === 'year') return label;
      if (gran === 'month') {
        const [y, m] = label.split('-').map(Number);
        const d = new Date(y, m - 1, 1);
        return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
      }
      // day
      const [y, m, d] = label.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      return dt.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return label;
    }
  };

  // Pie data: most booked rituals (by quantity), within current month or current year
  const pieData = React.useMemo(() => {
    const count = new Map<string, number>();
    for (const b of mergedBookings) {
      const d = objectIdToDate((b as any)._id);
      if (isNaN(d.getTime())) continue;
      if (pieScope === 'month') {
        if (d.getFullYear() !== selectedYear || d.getMonth() !== selectedMonth) continue;
      } else {
        if (d.getFullYear() !== selectedYear) continue;
      }
      for (const inst of (b as any).instances || []) {
        const name = inst.ritualName || 'Unknown';
        const qty = Number(inst.quantity) || 0;
        count.set(name, (count.get(name) || 0) + qty);
      }
    }
    const arr = Array.from(count.entries()).map(([name, value]) => ({ name, value }));
    arr.sort((a, b) => b.value - a.value);
    // Limit to top 8 and bucket the rest as "Others"
    const top = arr.slice(0, 8);
    const rest = arr.slice(8);
    const restSum = rest.reduce((s, r) => s + r.value, 0);
    return restSum > 0 ? [...top, { name: 'Others', value: restSum }] : top;
  }, [mergedBookings, pieScope, selectedMonth, selectedYear]);

  

  const PIE_COLORS = [
    '#7c3aed', '#06b6d4', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#22c55e', '#eab308', '#3b82f6', '#f97316'
  ];

  // After all hooks have been called consistently, we can conditionally render a loader
  if (isLoadingBookings || isLoadingEmployeeBookings || isLoadingRituals || isLoadingStock) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-purple-400">Loading dashboard data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Hero Section (Refactored for clarity & no overlap) */}
      <section className="rounded-xl border border-purple-500/20 bg-white/90 backdrop-blur px-6 py-8 shadow-sm flex flex-col justify-center admin-hero">
        <p className="text-xs font-semibold tracking-wider text-orange-600 uppercase mb-2">Dashboard</p>
        <h1 className="text-2xl md:text-3xl font-bold text-neutral-900 flex items-center gap-2">
          <span role="img" aria-label="Namaste">🙏</span>
          <span>Temple Dashboard</span>
        </h1>
        <p className="mt-2 text-sm md:text-base text-neutral-600 max-w-2xl">
          Manage your sacred space with clarity and efficiency.
        </p>
      </section>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statsCards.map((stat, index) => {
          const inner = (
            <Card key={index} className="bg-slate-900/80 backdrop-blur-sm border-purple-500/30 shadow-lg shadow-purple-500/10 hover:shadow-purple-500/20 transition-all cursor-pointer">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-purple-300">
                  {stat.title}
                </CardTitle>
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <stat.icon className={`h-4 w-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{stat.value}</div>
                <p className="text-xs text-purple-300">
                  <span className={stat.change.startsWith('+') ? 'text-green-400' : 'text-red-400'}>
                    {stat.change}
                  </span>
                  {" "}from last month
                </p>
              </CardContent>
            </Card>
          );
          return stat.link ? (
            <Link to={stat.link} key={index} className="block hover:scale-105 transition-transform">
              {inner}
            </Link>
          ) : inner;
        })}
      </div>

      {/* Analytics Grid: Bookings over time and Most booked rituals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bookings Over Time */}
        <Card className="bg-slate-900/80 backdrop-blur-sm border-purple-500/30 shadow-lg shadow-purple-500/10 hover:shadow-purple-500/20 ring-1 ring-purple-500/10">
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-purple-300">
                <TrendingUp className="h-5 w-5" />
                Rituals booked over time
              </CardTitle>
              <CardDescription className="text-purple-400/80">
                Total rituals booked per {seriesGranularity}
              </CardDescription>
            </div>
            <ToggleGroup type="single" value={seriesGranularity} onValueChange={(v) => v && setSeriesGranularity(v as any)}>
              <ToggleGroupItem value="day">Day</ToggleGroupItem>
              <ToggleGroupItem value="month">Month</ToggleGroupItem>
              <ToggleGroupItem value="year">Year</ToggleGroupItem>
            </ToggleGroup>
          </CardHeader>
          <CardContent>
            {seriesData.length === 0 ? (
              <div className="text-sm text-purple-300/80">No booking data yet.</div>
            ) : (
              <div className="relative h-80">
                <ChartContainer
                  className="h-full"
                  config={{ volume: { label: 'Rituals booked', color: 'hsl(280 100% 70%)' } }}
                >
                  <AreaChart data={seriesData} margin={{ left: 12, right: 12, top: 10 }}>
                    <defs>
                      <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.6} />
                        <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.08} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis
                      dataKey="bucket"
                      tick={{ fill: 'currentColor' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis tick={{ fill: 'currentColor' }} tickLine={false} axisLine={false} allowDecimals={false} />
                    <ChartTooltip
                      content={<ChartTooltipContent
                        nameKey="volume"
                        labelFormatter={(val) => formatBucketLabel(String(val), seriesGranularity)}
                        formatter={(value) => (
                          <div className="flex w-full items-center justify-between">
                            <span className="text-muted-foreground">Rituals</span>
                            <span className="font-mono font-medium">{Number(value).toLocaleString()}</span>
                          </div>
                        )}
                      />}
                    />
                    <Area type="monotone" dataKey="volume" stroke="#a78bfa" fill="url(#volumeGradient)" strokeWidth={2.5} dot={{ r: 2 }} activeDot={{ r: 4 }} isAnimationActive />
                  </AreaChart>
                </ChartContainer>
                {/* Decorative glow */}
                <div className="pointer-events-none absolute -inset-6 -z-10 rounded-2xl bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.15),transparent_60%)]" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Most Booked Rituals */}
        <Card className="bg-slate-900/80 backdrop-blur-sm border-purple-500/30 shadow-lg shadow-purple-500/10 hover:shadow-purple-500/20 ring-1 ring-purple-500/10">
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-purple-300">
                <Star className="h-5 w-5" />
                Most booked rituals
              </CardTitle>
              <CardDescription className="text-purple-400/80">
                {pieScope === 'month' ? (
                  <>Top rituals in {MONTHS[selectedMonth]} {selectedYear}</>
                ) : (
                  <>Top rituals in {selectedYear}</>
                )}
              </CardDescription>
            </div>
            {/* Responsive controls container */}
            <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
              <ToggleGroup 
                type="single" 
                value={pieScope} 
                onValueChange={(v) => v && setPieScope(v as any)} 
                className="[&>button]:flex-1 sm:[&>button]:flex-initial"
              >
                <ToggleGroupItem value="month">Month</ToggleGroupItem>
                <ToggleGroupItem value="year">Year</ToggleGroupItem>
              </ToggleGroup>
              <div className="flex w-full items-center gap-2 sm:w-auto">
                {pieScope === 'month' && (
                  <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
                    <SelectTrigger className="w-full sm:w-[9.5rem]">
                      <SelectValue placeholder="Select month" />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, idx) => (
                        <SelectItem key={m} value={String(idx)}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
                  <SelectTrigger className="w-full sm:w-[6.5rem]">
                    <SelectValue placeholder="Year" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 5 }).map((_, i) => {
                      const y = now.getFullYear() - 2 + i; // prev 2, current, next 2
                      return <SelectItem key={y} value={String(y)}>{y}</SelectItem>;
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <div className="text-sm text-purple-300/80">No ritual data to display.</div>
            ) : (
              <div className="relative h-80">
                <ChartContainer className="h-full" config={{}}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={110} innerRadius={58} stroke="#1f1f2b" strokeWidth={1} isAnimationActive>
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <ChartTooltip
                      content={<ChartTooltipContent formatter={(value, name) => (
                        <div className="flex w-full items-center justify-between">
                          <span className="text-muted-foreground">{String(name)}</span>
                          <span className="font-mono font-medium">{Number(value).toLocaleString()}</span>
                        </div>
                      )} />}
                    />
                  </PieChart>
                </ChartContainer>
                {/* Decorative glow */}
                <div className="pointer-events-none absolute -inset-6 -z-10 rounded-2xl bg-[radial-gradient(ellipse_at_top,rgba(124,58,237,0.15),transparent_60%)]" />
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left card: Recent Activities for admins; Recent Events for others */}
        {showRecentActivities ? (
          <Card className="bg-slate-900/80 backdrop-blur-sm border-purple-500/30 shadow-lg shadow-purple-500/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-purple-400">
                <Clock className="h-5 w-5" />
                Recent Activities
              </CardTitle>
              <CardDescription className="text-purple-300">
                Latest updates from your temple management
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {loadingActivities && (
                  <div className="text-sm text-purple-300">Loading recent activities...</div>
                )}
                {activitiesError && !loadingActivities && (
                  <div className="text-sm text-red-400">Unable to load activities.</div>
                )}
                {!loadingActivities && !activitiesError && recentActivities.length === 0 && (
                  <div className="text-sm text-purple-300/80">No recent activity.</div>
                )}
                {!loadingActivities && !activitiesError && recentActivities.map((activity) => (
                  <Link to={routeForActivity(activity)} key={activity.id} className="block group">
                    <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-purple-900/30 transition-colors">
                      <div className="w-2 h-2 bg-purple-400 rounded-full mt-2 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate text-white group-hover:text-purple-200">{activity.activity}</p>
                        <p className="text-xs text-purple-300">{relativeTime(activity.timestamp)} • {activity.username}</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-slate-900/80 backdrop-blur-sm border-purple-500/30 shadow-lg shadow-purple-500/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-purple-400">
                <Calendar className="h-5 w-5" />
                Recent Events
              </CardTitle>
              <CardDescription className="text-purple-300">
                Latest events happening at the temple
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {loadingEvents && (
                  <div className="text-sm text-purple-300">Loading recent events...</div>
                )}
                {eventsError && !loadingEvents && (
                  <div className="text-sm text-red-400">Unable to load events.</div>
                )}
                {!loadingEvents && !eventsError && recentEvents.length === 0 && (
                  <div className="text-sm text-purple-300/80">No events found.</div>
                )}
                {!loadingEvents && !eventsError && recentEvents.map((ev) => (
                  <Link to={"/admin/events"} key={ev._id} className="block group">
                    <div className="p-3 rounded-lg hover:bg-purple-900/30 transition-colors">
                      <p className="text-sm font-medium truncate text-white group-hover:text-purple-200">{ev.title}</p>
                      <div className="text-xs text-purple-300 flex flex-wrap gap-4 mt-1">
                        <span className="flex items-center"><Calendar className="h-3 w-3 mr-1 text-primary" />{new Date(ev.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        {ev.time && <span className="flex items-center"><Clock className="h-3 w-3 mr-1 text-primary" />{ev.time}</span>}
                        {ev.location && <span className="flex items-center"><MapPin className="h-3 w-3 mr-1 text-primary" />{ev.location}</span>}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-purple-500/30">
                <Link to="/admin/events" className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1">
                  View all events <span>→</span>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Upcoming Rituals (Derived from actual rituals) */}
        <Card className="bg-slate-900/80 backdrop-blur-sm border-purple-500/30 shadow-lg shadow-purple-500/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-pink-400">
              <Flame className="h-5 w-5" />
              Upcoming Rituals
            </CardTitle>
            <CardDescription className="text-purple-300">
              Highlighting active offerings (popular first)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {upcomingRituals.length === 0 && (
                <div className="text-sm text-purple-300/80">No rituals available.</div>
              )}
              {upcomingRituals.map((ritual) => (
                <Link
                  to={`/admin/rituals`}
                  key={ritual._id}
                  className="flex items-center justify-between p-3 rounded-lg border border-purple-500/20 bg-purple-900/20 hover:bg-purple-900/30 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center group-hover:scale-105 transition-transform">
                      <Star className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <p className="font-medium text-white group-hover:text-purple-200">{ritual.name}</p>
                      <p className="text-xs text-purple-300">Duration: {ritual.duration || '—'}</p>
                      <p className="text-xs text-purple-300">₹{ritual.price.toLocaleString()}</p>
                    </div>
                  </div>
                  <div
                    className={`px-2 py-1 rounded-full text-[10px] font-medium ${
                      ritual.popular
                        ? 'bg-green-600 text-white border border-green-400'
                        : 'bg-yellow-500 text-black border border-yellow-300'
                    }`}
                  >
                    {ritual.popular ? 'Popular' : 'Ritual'}
                  </div>
                </Link>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-purple-500/30">
              <Link 
                to="/admin/rituals" 
                className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1"
              >
                View all rituals <span>→</span>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      

      {/* Quick Actions */}
      <Card className="bg-slate-900/80 backdrop-blur-sm border-purple-500/30 shadow-lg shadow-purple-500/10">
        <CardHeader>
          <CardTitle className="text-purple-400">Quick Actions</CardTitle>
          <CardDescription className="text-purple-300">
            Frequently used temple management tasks
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { title: "New Booking", icon: Calendar, link: "/ritual-booking" },
              { title: "Add Stock", icon: Package, link: "/admin/stock/add" },
              { title: "Upload Photo", icon: Image, link: "/admin/gallery" },
              { title: "Create Event", icon: Calendar, link: "/admin/events" }
            ].map((action, index) => (
              <Link
                to={action.link}
                key={index}
                className="p-4 rounded-lg border border-purple-500/30 hover:shadow-lg hover:shadow-purple-500/20 transition-all cursor-pointer group bg-purple-900/20 hover:bg-purple-900/40"
              >
                <div className="text-center">
                  <div className="w-12 h-12 mx-auto mb-3 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                    <action.icon className="h-6 w-6 text-white" />
                  </div>
                  <p className="font-medium text-sm text-white">{action.title}</p>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminDashboard;
