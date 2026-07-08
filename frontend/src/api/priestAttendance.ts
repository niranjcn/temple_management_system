/**
 * Attendance API Service
 * 
 * Handles all API calls for admin attendance management.
 * Uses adminApi to route to the admin service.
 */

import { adminApi } from './api';

// ============= Type Definitions =============

export interface AdminUser {
  id: string;
  username: string;
  name: string;
  email?: string;
  role?: string;
  isAttendance?: boolean;
  has_salary_configured: boolean;
  daily_salary?: number;
  address?: string;
  specialization?: string;
  notes?: string;
  mobile_number?: number;
  mobile_prefix?: string;
  created_at?: string;
}

export interface AttendanceReportEntry {
  user_id: string;
  username: string;
  name: string;
  role?: string;
  email?: string;
  specialization?: string;
  daily_salary: number;
  total_days_marked: number;
  days_present: number;
  days_absent: number;
  total_overtime_hours: number;
  working_days_in_period: number;
  attendance_percentage: number;
  total_salary: number;
}

export interface AttendanceRecord {
  id: string;
  user_id: string;
  username: string;
  user_name: string;
  attendance_date: string;
  is_present: boolean;
  check_in_time?: string;
  check_out_time?: string;
  overtime_hours: number;
  outside_hours?: number;
  check_in_location?: {
    lat: number;
    lon: number;
  };
  check_out_location?: {
    lat: number;
    lon: number;
  };
  notes?: string;
  marked_by: string;
  marked_by_name?: string;
  created_at: string;
  updated_at: string;
  synced_at?: string;
  sync_origin?: string;
  sync_device_id?: string;
}

export interface AttendanceDashboard {
  today_present: number;
  today_absent: number;
  today_total: number;
  current_month_total_records: number;
  eligible_users_count: number;
  current_month: number;
  current_year: number;
}

export interface PaginatedAttendance {
  records: AttendanceRecord[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface CreateAttendanceData {
  user_id: string;
  username: string;
  attendance_date: string;
  is_present?: boolean;
  check_in_time?: string;
  check_out_time?: string;
  overtime_hours?: number;
  notes?: string;
}

export interface BulkAttendanceEntry {
  user_id: string;
  username: string;
  is_present?: boolean;
  check_in_time?: string;
  check_out_time?: string;
  overtime_hours?: number;
  notes?: string;
}

export interface BulkAttendanceData {
  attendance_date: string;
  attendances: BulkAttendanceEntry[];
}

export interface UpdateAttendanceData {
  is_present?: boolean;
  check_in_time?: string;
  check_out_time?: string;
  overtime_hours?: number;
  notes?: string;
}

// ============= Admin User APIs =============

export const getEligibleUsers = async (): Promise<AdminUser[]> => {
  const response = await adminApi.get('/attendance/users');
  return response.data;
};

// ============= Attendance Marking APIs =============

export const markAttendance = async (data: CreateAttendanceData): Promise<AttendanceRecord> => {
  const response = await adminApi.post('/attendance/mark', data);
  return response.data;
};

export const markBulkAttendance = async (data: BulkAttendanceData): Promise<{
  success: boolean;
  message: string;
  data?: any;
}> => {
  const response = await adminApi.post('/attendance/mark-bulk', data);
  return response.data;
};

export const getAttendanceRecords = async (params?: {
  page?: number;
  page_size?: number;
  user_id?: string;
  username?: string;
  start_date?: string;
  end_date?: string;
  month?: number;
  year?: number;
  is_present?: boolean;
}): Promise<PaginatedAttendance> => {
  const response = await adminApi.get('/attendance/records', { params });
  return response.data;
};

export const getAttendanceRecord = async (attendanceId: string): Promise<AttendanceRecord> => {
  const response = await adminApi.get(`/attendance/records/${attendanceId}`);
  return response.data;
};

export const updateAttendance = async (attendanceId: string, data: UpdateAttendanceData): Promise<AttendanceRecord> => {
  const response = await adminApi.put(`/attendance/records/${attendanceId}`, data);
  return response.data;
};

export const deleteAttendance = async (attendanceId: string): Promise<void> => {
  await adminApi.delete(`/attendance/records/${attendanceId}`);
};

// ============= Dashboard APIs =============

export const getDashboardStats = async (): Promise<AttendanceDashboard> => {
  const response = await adminApi.get('/attendance/dashboard');
  return response.data;
};

// ============= Helper Functions =============

/**
 * Format date for API (YYYY-MM-DD)
 */
export const formatDateForAPI = (date: Date): string => {
  return date.toISOString().split('T')[0];
};

/**
 * Get current month and year
 */
export const getCurrentMonthYear = (): { month: number; year: number } => {
  const now = new Date();
  return {
    month: now.getMonth() + 1,
    year: now.getFullYear()
  };
};

/**
 * Format currency (INR)
 */
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
};

/**
 * Format date for display (DD/MM/YYYY)
 */
export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

/**
 * Get month name
 */
export const getMonthName = (month: number): string => {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[month - 1] || '';
};

// ============= Employee Management Functions =============

export interface EmployeeDetailsData {
  address?: string;
  specialization?: string;
  daily_salary: number;
  notes?: string;
}

export const getAllEmployees = async (): Promise<AdminUser[]> => {
  const response = await adminApi.get('/attendance/employees');
  return response.data;
};

export const toggleUserAttendance = async (
  userId: string, 
  employeeDetails?: EmployeeDetailsData
): Promise<any> => {
  const response = await adminApi.post(
    `/attendance/users/${userId}/toggle-attendance`,
    employeeDetails || null
  );
  return response.data;
};

export const getAttendanceReport = async (params?: {
  start_date?: string;
  end_date?: string;
  month?: number;
  year?: number;
}): Promise<AttendanceReportEntry[]> => {
  const response = await adminApi.get('/attendance/report', { params });
  return response.data;
};

export default {
  // User Management
  getEligibleUsers,
  getAllEmployees,
  toggleUserAttendance,
  
  // Attendance
  markAttendance,
  markBulkAttendance,
  getAttendanceRecords,
  getAttendanceRecord,
  updateAttendance,
  deleteAttendance,
  
  // Dashboard
  getDashboardStats,
  
  // Reports
  getAttendanceReport,
  
  // Helpers
  formatDateForAPI,
  getCurrentMonthYear,
  formatCurrency,
  formatDate,
  getMonthName
};

