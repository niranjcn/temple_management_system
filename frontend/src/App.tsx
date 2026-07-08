import { Toaster } from "./components/ui/sonner";
import { TooltipProvider } from "./components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Index from "./pages/Index"; // retained for internal reuse
import HomePage from "./pages/HomePage";
import AboutTemple from "./pages/AboutTemple";
import CommitteeMembers from "./pages/CommitteeMembers";
import NotFound from "./pages/NotFound";
import RitualBooking from "./pages/RitualBooking";
import RitualBrowsing from "./pages/RitualBrowsing";
import EventDetails from "./pages/EventDetails";
import FullEvents from "./pages/FullEvents";
import FullGallery from "./pages/FullGallery";
import Login from "./pages/Login";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import { useAuth } from "./contexts/AuthContext";
import AdminLayout from "./components/AdminLayout";
import ManageRituals from "./pages/admin/ManageRituals";
import ManageEvents from "./pages/admin/ManageEvents";
import ManageGallery from "./pages/admin/ManageGallery";
import CalendarManagement from "./pages/admin/CalendarManagement";
import ManageBookings from "./pages/admin/ManageBookings";
import AdminDashboard from "./pages/admin/Admin";
import AddStock from "./pages/admin/AddStock";
import StockAnalytics from "./pages/admin/StockAnalytics";
import CreateAdmin from "./pages/admin/AdminManagement";
import EditProfile from "./pages/admin/EditProfile";
import Activity from "./pages/admin/Activity";
import EmployeeBooking from "./pages/admin/EmployeeBooking"; // <-- add
import ManageCommittee from "./pages/admin/ManageCommittee";
import BackupManagement from "./pages/admin/BackupManagement";
import SecurityDashboard from "./pages/admin/SecurityDashboard";
import PriestManagement from "./pages/admin/PriestManagement";
import AttendanceReport from "./pages/admin/AttendanceReport";
import LocationManagement from "./pages/admin/LocationManagement";

const queryClient = new QueryClient();

const RoleGuard = ({ allow, children }: { allow: (roleId?: number) => boolean; children: React.ReactNode }) => {
  const { user } = (useAuth() as any) || {};
  const roleId: number | undefined = user?.role_id;
  if (!allow(roleId)) {
    return <NotFound />;
  }
  return <>{children}</>;
};

// Decides where to land when visiting /admin based on role
const AdminIndexRouter = () => {
  const { user } = (useAuth() as any) || {};
  const roleId: number = user?.role_id ?? 99;
  // Editors (3) -> events, Employees (4) -> employee booking, others -> dashboard
  if (roleId === 3) return <Navigate to="/admin/events" replace />;
  if (roleId === 4) return <Navigate to="/admin/employee-booking" replace />; // <-- updated
  return <AdminDashboard />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public Routes */}
            {/* Home with entrance door animation wrapper */}
            <Route path="/" element={<HomePage />} />
            <Route path="/ritual-booking" element={<RitualBooking />} />
            <Route path="/ritual-browsing" element={<RitualBrowsing />} />
            <Route path="/about" element={<AboutTemple />} />
            <Route path="/committee" element={<CommitteeMembers />} />
            <Route path="/events" element={<FullEvents />} />
            <Route path="/events/:id" element={<EventDetails />} />
            <Route path="/gallery" element={<FullGallery />} />
            <Route path="/login" element={<Login />} />

            {/* Admin Routes */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              {/* Dashboard hidden for editor (3) and employee (4); redirect to role landing */}
              <Route index element={<AdminIndexRouter />} />
              {/* Website Management: Editor(3) can access only these; Employee(4) only rituals; others allowed */}
              <Route path="rituals" element={
                <RoleGuard allow={(rid) => (rid ?? 99) <= 4}>
                  <ManageRituals />
                </RoleGuard>
              } />
              <Route path="events" element={
                <RoleGuard allow={(rid) => (rid ?? 99) !== 4}>
                  <ManageEvents />
                </RoleGuard>
              } />
              <Route path="gallery" element={
                <RoleGuard allow={(rid) => (rid ?? 99) !== 4}>
                  <ManageGallery />
                </RoleGuard>
              } />

              {/* Calendar Management visible only to Admin/Super (role_id <= 1) */}
              <Route path="calendar" element={
                <RoleGuard allow={(rid) => (rid ?? 99) <= 1}>
                  <CalendarManagement />
                </RoleGuard>
              } />

              {/* Bookings hidden for editor; employees can access */}
              <Route path="bookings" element={
                <RoleGuard allow={(rid) => (rid ?? 99) !== 3}>
                  <ManageBookings />
                </RoleGuard>
              } />

              {/* Employee Booking: accessible to all roles (page enforces view-only for some) */}
              <Route path="employee-booking" element={<EmployeeBooking />} />

              {/* Stock visible to all except editor (3); viewers see read-only */}
              <Route path="stock/add" element={
                <RoleGuard allow={(rid) => (rid ?? 99) !== 3}>
                  <AddStock />
                </RoleGuard>
              } />
              <Route path="stock/analytics" element={
                <RoleGuard allow={(rid) => (rid ?? 99) !== 3}>
                  <StockAnalytics />
                </RoleGuard>
              } />

              {/* Admin Management visible only to role_id <= 2 (Super/Admin/Privileged) */}
              <Route path="management" element={
                <RoleGuard allow={(rid) => (rid ?? 99) <= 2}>
                  <CreateAdmin />
                </RoleGuard>
              } />

              {/* Activity Log visible only to role_id <= 1 (Super/Admin) */}
              <Route path="activity" element={
                <RoleGuard allow={(rid) => (rid ?? 99) <= 1}>
                  <Activity />
                </RoleGuard>
              } />

              {/* Backup Management visible only to role_id <= 1 (Super/Admin) */}
              <Route path="backup" element={
                <RoleGuard allow={(rid) => (rid ?? 99) <= 1}>
                  <BackupManagement />
                </RoleGuard>
              } />

              {/* Security Overview visible only to role_id <= 1 (Super/Admin) */}
              <Route path="security" element={
                <RoleGuard allow={(rid) => (rid ?? 99) <= 1}>
                  <SecurityDashboard />
                </RoleGuard>
              } />

              {/* Committee Management visible only to role_id <= 1 (Super/Admin) */}
              <Route path="committee" element={
                <RoleGuard allow={(rid) => (rid ?? 99) <= 1}>
                  <ManageCommittee />
                </RoleGuard>
              } />

              {/* Priest Attendance Management: Accessible to all admin users */}
              <Route path="priest-management" element={<PriestManagement />} />
              <Route path="attendance-report" element={<AttendanceReport />} />

              {/* Location Management: Only Super Admins (role_id === 0) */}
              <Route path="location-management" element={
                <RoleGuard allow={(rid) => rid === 0}>
                  <LocationManagement />
                </RoleGuard>
              } />

              {/* Edit Profile accessible to all logged-in users */}
              <Route path="edit-profile" element={<EditProfile />} />

            </Route>

            {/* Catch-all Not Found Route */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

