import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { 
  Clock, 
  Calendar as CalendarIcon, 
  MapPin, 
  User, 
  TrendingUp,
  Filter,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  getAttendanceRecords,
  getEligibleUsers,
  type AttendanceRecord,
  type AdminUser
} from '@/api/priestAttendance';

const AttendanceReport: React.FC = () => {
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date())
  });
  const [selectedMonth, setSelectedMonth] = useState<Date>(new Date());

  // Fetch eligible users (only those with isAttendance=true)
  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['eligible-users'],
    queryFn: getEligibleUsers,
  });

  // Fetch attendance records for selected user
  const { data: attendanceData, isLoading: attendanceLoading } = useQuery({
    queryKey: ['user-attendance', selectedUserId, dateRange],
    queryFn: () => getAttendanceRecords({
      user_id: selectedUserId,
      start_date: format(dateRange.from, 'yyyy-MM-dd'),
      end_date: format(dateRange.to, 'yyyy-MM-dd'),
      page_size: 100
    }),
    enabled: !!selectedUserId,
  });

  const eligibleUsers = users?.filter(u => u.isAttendance) || [];
  const records = attendanceData?.records || [];

  // Calculate statistics
  const totalPresent = records.filter(r => r.is_present).length;
  const totalAbsent = records.filter(r => !r.is_present).length;
  const totalOvertime = records.reduce((sum, r) => sum + (r.overtime_hours || 0), 0);
  const totalOutside = records.reduce((sum, r) => sum + (r.outside_hours || 0), 0);
  const avgAttendance = records.length > 0 ? (totalPresent / records.length) * 100 : 0;

  const handleMonthChange = (direction: 'prev' | 'next') => {
    const newMonth = direction === 'prev'
      ? new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() - 1)
      : new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1);
    
    setSelectedMonth(newMonth);
    setDateRange({
      from: startOfMonth(newMonth),
      to: endOfMonth(newMonth)
    });
  };

  const selectedUser = eligibleUsers.find(u => u.id === selectedUserId);

  return (
    <div className="container mx-auto py-8 px-4">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Attendance Report</h1>
        <p className="text-gray-600 mt-1">View detailed attendance history for each employee</p>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Select Employee & Period
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* User Select */}
            <div className="space-y-2">
              <Label>Employee</Label>
              <Select
                value={selectedUserId}
                onValueChange={setSelectedUserId}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select an employee..." />
                </SelectTrigger>
                <SelectContent>
                  {usersLoading ? (
                    <SelectItem value="loading" disabled>Loading...</SelectItem>
                  ) : eligibleUsers.length === 0 ? (
                    <SelectItem value="none" disabled>No employees enrolled</SelectItem>
                  ) : (
                    eligibleUsers.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{user.name}</span>
                          <span className="text-xs text-gray-500">@{user.username}</span>
                          {user.role && (
                            <Badge variant="outline" className="text-xs">{user.role}</Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Month Navigation */}
            <div className="space-y-2">
              <Label>Month</Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleMonthChange('prev')}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="flex-1 justify-start">
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {format(selectedMonth, 'MMMM yyyy')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={selectedMonth}
                      onSelect={(date) => {
                        if (date) {
                          setSelectedMonth(date);
                          setDateRange({
                            from: startOfMonth(date),
                            to: endOfMonth(date)
                          });
                        }
                      }}
                    />
                  </PopoverContent>
                </Popover>

                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleMonthChange('next')}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* User not selected state */}
      {!selectedUserId && (
        <Card>
          <CardContent className="text-center py-16">
            <User className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-700 mb-2">Select an Employee</h3>
            <p className="text-gray-500">Choose an employee from the dropdown above to view their attendance records</p>
          </CardContent>
        </Card>
      )}

      {/* Statistics Cards */}
      {selectedUserId && selectedUser && (
        <>
          {/* User Info */}
          <Card className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-2xl">{selectedUser.name}</CardTitle>
                  <CardDescription className="text-base mt-1">
                    @{selectedUser.username} • {selectedUser.role || 'Employee'}
                  </CardDescription>
                  {selectedUser.specialization && (
                    <p className="text-sm text-gray-600 mt-2">{selectedUser.specialization}</p>
                  )}
                </div>
                {selectedUser.daily_salary && (
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Daily Salary</p>
                    <p className="text-2xl font-bold text-green-600">₹{selectedUser.daily_salary}</p>
                  </div>
                )}
              </div>
            </CardHeader>
          </Card>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total Days</CardDescription>
                <CardTitle className="text-2xl">{records.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Present</CardDescription>
                <CardTitle className="text-2xl text-green-600">{totalPresent}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Absent</CardDescription>
                <CardTitle className="text-2xl text-red-600">{totalAbsent}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Overtime Hours</CardDescription>
                <CardTitle className="text-2xl text-blue-600">{totalOvertime.toFixed(1)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Outside Hours</CardDescription>
                <CardTitle className="text-2xl text-orange-600">{totalOutside.toFixed(1)}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          {/* Attendance Records */}
          {attendanceLoading ? (
            <Card>
              <CardContent className="text-center py-12">
                <p className="text-gray-600">Loading attendance records...</p>
              </CardContent>
            </Card>
          ) : records.length === 0 ? (
            <Card>
              <CardContent className="text-center py-12">
                <CalendarIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No attendance records found for the selected period</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {records.map((record) => (
                <Card 
                  key={record.id} 
                  className={cn(
                    "hover:shadow-lg transition-shadow",
                    record.is_present ? "border-l-4 border-l-green-500" : "border-l-4 border-l-red-500"
                  )}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">
                          {format(parseISO(record.attendance_date), 'MMM dd, yyyy')}
                        </CardTitle>
                        <CardDescription>
                          {format(parseISO(record.attendance_date), 'EEEE')}
                        </CardDescription>
                      </div>
                      <Badge variant={record.is_present ? "default" : "destructive"}>
                        {record.is_present ? 'Present' : 'Absent'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Check In Time */}
                    {record.check_in_time && (
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="w-4 h-4 text-green-600" />
                        <span className="text-gray-600">Check In:</span>
                        <span className="font-semibold">{record.check_in_time}</span>
                      </div>
                    )}

                    {/* Check Out Time */}
                    {record.check_out_time && (
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="w-4 h-4 text-red-600" />
                        <span className="text-gray-600">Check Out:</span>
                        <span className="font-semibold">{record.check_out_time}</span>
                      </div>
                    )}

                    {/* Overtime */}
                    {record.overtime_hours > 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <TrendingUp className="w-4 h-4 text-blue-600" />
                        <span className="text-gray-600">Overtime:</span>
                        <span className="font-semibold text-blue-600">
                          {record.overtime_hours.toFixed(1)} hrs
                        </span>
                      </div>
                    )}

                    {/* Outside Hours */}
                    {record.outside_hours && record.outside_hours > 0 && (
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="w-4 h-4 text-orange-600" />
                        <span className="text-gray-600">Outside:</span>
                        <span className="font-semibold text-orange-600">
                          {record.outside_hours.toFixed(1)} hrs
                        </span>
                      </div>
                    )}

                    {/* GPS Location Indicators */}
                    {(record.check_in_location || record.check_out_location) && (
                      <div className="pt-2 border-t">
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <MapPin className="w-3 h-3" />
                          <span>GPS tracked</span>
                        </div>
                      </div>
                    )}

                    {/* Notes */}
                    {record.notes && (
                      <div className="pt-2 border-t">
                        <p className="text-xs text-gray-600">{record.notes}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AttendanceReport;
