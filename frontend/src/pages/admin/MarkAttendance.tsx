import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarIcon, Save, CheckCircle2, XCircle, AlertCircle, Clock, User } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  getEligibleUsers,
  getAttendanceRecords,
  markBulkAttendance,
  formatDateForAPI,
  AdminUser,
  BulkAttendanceEntry
} from '@/api/priestAttendance';

interface AttendanceEntry extends BulkAttendanceEntry {
  user: AdminUser;
}

const MarkAttendance: React.FC = () => {
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [attendanceEntries, setAttendanceEntries] = useState<AttendanceEntry[]>([]);
  const [alreadyMarked, setAlreadyMarked] = useState<Set<string>>(new Set());

  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ['eligible-users'],
    queryFn: getEligibleUsers,
  });

  const { data: existingAttendance } = useQuery({
    queryKey: ['attendance-records', formatDateForAPI(selectedDate)],
    queryFn: () => getAttendanceRecords({
      start_date: formatDateForAPI(selectedDate),
      end_date: formatDateForAPI(selectedDate),
      page_size: 100
    }),
  });

  useEffect(() => {
    if (usersData) {
      const markedUserIds = new Set(existingAttendance?.records.map(r => r.user_id) || []);
      setAlreadyMarked(markedUserIds);
      const entries: AttendanceEntry[] = usersData
        .filter(user => !markedUserIds.has(user.id))
        .map(user => ({
          user_id: user.id,
          username: user.username,
          user,
          is_present: true,
          overtime_hours: 0,
          check_in_time: '',
          check_out_time: '',
          notes: ''
        }));
      setAttendanceEntries(entries);
    }
  }, [usersData, existingAttendance, selectedDate]);

  const updateEntry = (index: number, updates: Partial<AttendanceEntry>) => {
    const newEntries = [...attendanceEntries];
    newEntries[index] = { ...newEntries[index], ...updates };
    setAttendanceEntries(newEntries);
  };

  const markAllPresent = () => {
    setAttendanceEntries(attendanceEntries.map(entry => ({ ...entry, is_present: true })));
    toast.success('All marked present');
  };

  const markAllAbsent = () => {
    setAttendanceEntries(attendanceEntries.map(entry => ({ ...entry, is_present: false })));
    toast.success('All marked absent');
  };

  const saveMutation = useMutation({
    mutationFn: markBulkAttendance,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['attendance-records'] });
      queryClient.invalidateQueries({ queryKey: ['eligible-users'] });
      toast.success(data.message || 'Attendance saved successfully!');
      if (data.data?.errors && data.data.errors.length > 0) {
        toast.warning(`Some errors occurred: ${data.data.errors.join(', ')}`);
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to save attendance');
    },
  });

  const handleSave = () => {
    if (attendanceEntries.length === 0) {
      toast.error('No attendance entries to save');
      return;
    }
    const bulkData = {
      attendance_date: formatDateForAPI(selectedDate),
      attendances: attendanceEntries.map(({ user, ...entry }) => entry)
    };
    saveMutation.mutate(bulkData);
  };

  const totalPresent = attendanceEntries.filter(e => e.is_present).length;
  const totalAbsent = attendanceEntries.filter(e => !e.is_present).length;
  const isFutureDate = selectedDate > new Date();

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Mark Attendance</h1>
          <p className="text-gray-600 mt-1">Record daily attendance for all users</p>
        </div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full md:w-auto justify-start text-left font-normal">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(selectedDate, 'PPP')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar mode="single" selected={selectedDate} onSelect={(date) => date && setSelectedDate(date)} disabled={(date) => date > new Date()} initialFocus />
          </PopoverContent>
        </Popover>
      </div>
      {isFutureDate && (
        <Card className="mb-6 border-yellow-300 bg-yellow-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-yellow-800">
              <AlertCircle className="w-5 h-5" />
              <p>Cannot mark attendance for future dates. Please select today or a past date.</p>
            </div>
          </CardContent>
        </Card>
      )}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card><CardHeader className="pb-2"><CardDescription>Total Users</CardDescription><CardTitle className="text-2xl">{attendanceEntries.length + alreadyMarked.size}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Present</CardDescription><CardTitle className="text-2xl text-green-600 flex items-center gap-2"><CheckCircle2 className="w-5 h-5" />{totalPresent + (existingAttendance?.records.filter(r => r.is_present).length || 0)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Absent</CardDescription><CardTitle className="text-2xl text-red-600 flex items-center gap-2"><XCircle className="w-5 h-5" />{totalAbsent + (existingAttendance?.records.filter(r => !r.is_present).length || 0)}</CardTitle></CardHeader></Card>
        <Card><CardHeader className="pb-2"><CardDescription>Already Marked</CardDescription><CardTitle className="text-2xl text-blue-600">{alreadyMarked.size}</CardTitle></CardHeader></Card>
      </div>
      {alreadyMarked.size > 0 && (
        <Card className="mb-6 border-blue-300 bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-blue-800">
              <AlertCircle className="w-5 h-5" />
              <p>Attendance has already been marked for {alreadyMarked.size} user(s) on this date. They are not shown below.</p>
            </div>
          </CardContent>
        </Card>
      )}
      {attendanceEntries.length > 0 && !isFutureDate && (
        <Card className="mb-6">
          <CardHeader><CardTitle className="text-lg">Quick Actions</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              <Button onClick={markAllPresent} variant="outline" className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-600" />Mark All Present</Button>
              <Button onClick={markAllAbsent} variant="outline" className="flex items-center gap-2"><XCircle className="w-4 h-4 text-red-600" />Mark All Absent</Button>
            </div>
          </CardContent>
        </Card>
      )}
      {usersLoading ? (
        <Card><CardContent className="text-center py-12"><p className="text-gray-600">Loading users...</p></CardContent></Card>
      ) : attendanceEntries.length === 0 ? (
        <Card><CardContent className="text-center py-12"><p className="text-gray-600">{alreadyMarked.size > 0 ? 'Attendance has been marked for all users on this date.' : 'No users available for attendance marking.'}</p></CardContent></Card>
      ) : (
        <>
          <div className="space-y-4">
            {attendanceEntries.map((entry, index) => (
              <Card key={entry.user_id} className={`${!entry.is_present && 'opacity-75'}`}>
                <CardHeader>
                  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center"><User className="w-6 h-6 text-yellow-600" /></div>
                      <div>
                        <CardTitle className="text-lg">{entry.user.name}</CardTitle>
                        <CardDescription>@{entry.user.username}  {entry.user.role}{entry.user.has_salary_configured && entry.user.daily_salary && (<span className="ml-2 text-green-600">₹{entry.user.daily_salary}/day</span>)}</CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Label htmlFor={`present-${index}`} className="text-sm font-medium">{entry.is_present ? 'Present' : 'Absent'}</Label>
                      <Switch id={`present-${index}`} checked={entry.is_present} onCheckedChange={(checked) => updateEntry(index, { is_present: checked })} />
                    </div>
                  </div>
                </CardHeader>
                {entry.is_present && (
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor={`checkin-${index}`} className="flex items-center gap-2"><Clock className="w-4 h-4" />Check-in Time</Label>
                        <Input id={`checkin-${index}`} type="time" value={entry.check_in_time || ''} onChange={(e) => updateEntry(index, { check_in_time: e.target.value })} className="w-full" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`checkout-${index}`} className="flex items-center gap-2"><Clock className="w-4 h-4" />Check-out Time</Label>
                        <Input id={`checkout-${index}`} type="time" value={entry.check_out_time || ''} onChange={(e) => updateEntry(index, { check_out_time: e.target.value })} className="w-full" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`notes-${index}`}>Notes (Optional)</Label>
                      <Textarea id={`notes-${index}`} value={entry.notes || ''} onChange={(e) => updateEntry(index, { notes: e.target.value })} placeholder="Add any notes for this attendance record..." rows={2} className="resize-none" />
                    </div>
                    {(entry.user.specialization || entry.user.address) && (
                      <div className="pt-2 border-t space-y-1 text-sm text-gray-600">
                        {entry.user.specialization && (<p><span className="font-medium">Specialization:</span> {entry.user.specialization}</p>)}
                        {entry.user.address && (<p><span className="font-medium">Address:</span> {entry.user.address}</p>)}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
          {!isFutureDate && (
            <div className="mt-6 flex justify-end">
              <Button onClick={handleSave} size="lg" disabled={saveMutation.isPending} className="px-8">
                <Save className="w-5 h-5 mr-2" />
                {saveMutation.isPending ? 'Saving...' : 'Save Attendance'}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default MarkAttendance;