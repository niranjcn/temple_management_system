import React, { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  LayoutDashboard,
  Globe,
  Calendar,
  Image,
  Flame,
  BookOpen,
  Package,
  Users,
  Shield,
  ChevronDown,
  ChevronRight,
  BarChart3,
  Plus,
  Activity,
  ShoppingCart,
  Database,
  UserCheck,
  FileText,
  MapPin
} from 'lucide-react';

type SidebarProps = { isOpen?: boolean; onToggle?: () => void };

const TempleSidebar: React.FC<SidebarProps> = ({ isOpen = false, onToggle }) => {
  const { user } = useAuth() as any;
  const roleId = user?.role_id ?? 99;

  const [isWebsiteExpanded, setIsWebsiteExpanded] = useState(true);
  const [isStockExpanded, setIsStockExpanded] = useState(true);
  const [isPriestAttendanceExpanded, setIsPriestAttendanceExpanded] = useState(true);
  const [isAdminExpanded, setIsAdminExpanded] = useState(true);
  
  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `w-full flex items-center space-x-3 px-4 py-3 rounded-md text-sm font-medium transition-colors duration-150 border ${
      isActive
        ? 'bg-orange-500 text-white border-orange-600 shadow-sm'
        : 'bg-white text-neutral-700 border-neutral-200 hover:bg-orange-50 hover:border-orange-300 hover:text-orange-600'
    }`;
    
  const subNavLinkClass = ({ isActive }: { isActive: boolean }) =>
    `w-full flex items-center space-x-3 px-4 py-2 rounded-md text-sm transition-colors duration-150 border ${
      isActive
        ? 'bg-orange-100 text-orange-700 border-orange-300'
        : 'bg-white text-neutral-600 border-neutral-200 hover:bg-orange-50 hover:border-orange-300 hover:text-orange-600'
    }`;

  // Visibility classes: hide by default; show when isOpen.
  // On small screens, it's an absolute overlay. On large screens, it's relative when open, absolute when closed.
  const baseClasses = "bg-white text-neutral-800 w-72 min-h-screen p-6 shadow-lg border-r border-neutral-200 z-50 transition-transform duration-300 ease-in-out admin-sidebar";
  const responsiveClasses = `fixed top-0 left-0 ${isOpen ? 'lg:relative' : 'lg:absolute lg:top-0 lg:left-0'}`;
  const visibilityClasses = isOpen ? "translate-x-0" : "-translate-x-full";

  return (
    <aside className={`${baseClasses} ${responsiveClasses} ${visibilityClasses}`}>
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center space-x-3">
          <div className="w-8 h-8 bg-orange-500 rounded-md flex items-center justify-center shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                <path d="M2 17l10 5 10-5"></path>
                <path d="M2 12l10 5 10-5"></path>
            </svg>
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-neutral-800">Temple Admin</h1>
          </div>
          {/* Toggle button lives inside sidebar and closes it; visible on all sizes */}
          <button
            className="inline-flex items-center justify-center h-9 w-9 rounded-md text-neutral-600 hover:bg-orange-50 hover:text-orange-600"
            aria-label={isOpen ? "Close sidebar" : "Open sidebar"}
            onClick={() => onToggle?.()}
          >
            {/* Same hamburger icon used as a toggle */}
            <span className="sr-only">Toggle sidebar</span>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 5h14a1 1 0 110 2H3a1 1 0 110-2zm0 4h14a1 1 0 110 2H3a1 1 0 110-2zm0 4h14a1 1 0 110 2H3a1 1 0 110-2z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-neutral-500">Sacred Management System</p>
      </div>

      <nav className="space-y-2">
    {/* Dashboard visible to all except Editors (3) and Employees (4) */}
    {roleId !== 3 && roleId !== 4 && (
        <NavLink to="/admin" end className={navLinkClass}>
            <LayoutDashboard className="h-5 w-5" />
            <span className="font-medium">Dashboard</span>
        </NavLink>
        )}
        {/* Bookings hidden for Editors */}
        {roleId !== 3 && (
        <NavLink to="/admin/bookings" className={navLinkClass}>
            <BookOpen className="h-5 w-5" />
            <span className="font-medium">All Bookings</span>
        </NavLink>
        )}

    {/* Employee Booking: available to all roles; interactivity is handled within the page */}
    <NavLink to="/admin/employee-booking" className={navLinkClass}>
      <ShoppingCart className="h-5 w-5" />
      <span className="font-medium">Employee Booking</span>
    </NavLink>

        {/* Website Management Section */}
        <div>
          <button
            onClick={() => setIsWebsiteExpanded(!isWebsiteExpanded)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-md text-neutral-600 hover:bg-orange-50 hover:text-orange-600 transition-colors text-sm font-medium"
          >
            <div className="flex items-center space-x-3">
              <Globe className="h-5 w-5" />
              <span className="font-medium">Website Management</span>
            </div>
            {isWebsiteExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          
          {isWebsiteExpanded && (
            <div className="ml-6 mt-2 space-y-1">
        {/* Editors (3) can access Events & Gallery; Employees (4) only Rituals */}
        {(roleId !== 4) && (
                <NavLink to="/admin/events" className={subNavLinkClass}>
                    <Calendar className="h-4 w-4" />
                    <span>Event Management</span>
                </NavLink>
                )}
        {(roleId !== 4) && (
                <NavLink to="/admin/gallery" className={subNavLinkClass}>
                    <Image className="h-4 w-4" />
                    <span>Gallery Management</span>
                </NavLink>
                )}
        {roleId <= 1 && (
        <NavLink to="/admin/calendar" className={subNavLinkClass}>
          <Calendar className="h-4 w-4" />
          <span>Calendar Management</span>
        </NavLink>
        )}
                {roleId <= 1 && (
                <NavLink to="/admin/committee" className={subNavLinkClass}>
                    <Users className="h-4 w-4" />
                    <span>Committee Members</span>
                </NavLink>
                )}
                {(
                  roleId === 3 || roleId === 4 || roleId < 3 || roleId >= 5
                ) && (
                <NavLink to="/admin/rituals" className={subNavLinkClass}>
                    <Flame className="h-4 w-4" />
                    <span>Ritual Management</span>
                </NavLink>
                )}
            </div>
          )}
        </div>

  {/* Stock Management Section: visible for all except Editor (3) */}
  {roleId !== 3 && (
        <div>
          <button
            onClick={() => setIsStockExpanded(!isStockExpanded)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-md text-neutral-600 hover:bg-orange-50 hover:text-orange-600 transition-colors text-sm font-medium"
          >
            <div className="flex items-center space-x-3">
              <Package className="h-5 w-5" />
              <span className="font-medium">Stock Management</span>
            </div>
            {isStockExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          
          {isStockExpanded && (
             <div className="ml-6 mt-2 space-y-1">
                <NavLink to="/admin/stock/add" className={subNavLinkClass}>
                    <Plus className="h-4 w-4" />
                    <span>Add Stock</span>
                </NavLink>
                <NavLink to="/admin/stock/analytics" className={subNavLinkClass}>
                    <BarChart3 className="h-4 w-4" />
                    <span>Analytics</span>
                </NavLink>
             </div>
          )}
        </div>
        )}

        {/* Priest Attendance Section: visible for all admin users */}
        <div>
          <button
            onClick={() => setIsPriestAttendanceExpanded(!isPriestAttendanceExpanded)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-md text-neutral-600 hover:bg-orange-50 hover:text-orange-600 transition-colors text-sm font-medium"
          >
            <div className="flex items-center space-x-3">
              <UserCheck className="h-5 w-5" />
              <span className="font-medium">Priest Attendance</span>
            </div>
            {isPriestAttendanceExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          
          {isPriestAttendanceExpanded && (
             <div className="ml-6 mt-2 space-y-1">
                <NavLink to="/admin/priest-management" className={subNavLinkClass}>
                    <Users className="h-4 w-4" />
                    <span>Priest Management</span>
                </NavLink>
                <NavLink to="/admin/attendance-report" className={subNavLinkClass}>
                    <FileText className="h-4 w-4" />
                    <span>Attendance Report</span>
                </NavLink>
                {/* Location Management: Only visible to Super Admin (role_id === 0) */}
                {roleId === 0 && (
                  <NavLink to="/admin/location-management" className={subNavLinkClass}>
                    <MapPin className="h-4 w-4" />
                    <span>Location Management</span>
                  </NavLink>
                )}
             </div>
          )}
        </div>

        {/* Admin Management Section */}
        {/* Admin Management visible only to role_id <= 2 (Super/Admin/Privileged), but page will also gate */}
        {roleId <= 2 && (
        <div>
          <button
            onClick={() => setIsAdminExpanded(!isAdminExpanded)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-md text-neutral-600 hover:bg-orange-50 hover:text-orange-600 transition-colors text-sm font-medium"
          >
            <div className="flex items-center space-x-3">
              <Shield className="h-5 w-5" />
              <span className="font-medium">Admin Management</span>
            </div>
            {isAdminExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          
          {isAdminExpanded && (
            <div className="ml-6 mt-2 space-y-1">
                <NavLink to="/admin/management" className={subNavLinkClass}>
                    <Users className="h-4 w-4" />
                    <span>Manage Admins</span>
                </NavLink>
                {roleId <= 1 && (
                <NavLink to="/admin/activity" className={subNavLinkClass}>
                    <Activity className="h-4 w-4" />
                    <span>Activity Log</span>
                </NavLink>
                )}
                {roleId <= 1 && (
                <NavLink to="/admin/security" className={subNavLinkClass}>
                    <Shield className="h-4 w-4" />
                    <span>Security Overview</span>
                </NavLink>
                )}
                {roleId <= 1 && (
                <NavLink to="/admin/backup" className={subNavLinkClass}>
                    <Database className="h-4 w-4" />
                    <span>Backup Management</span>
                </NavLink>
                )}
            </div>
          )}
        </div>
        )}
      </nav>
    </aside>
  );
};

export default TempleSidebar;

