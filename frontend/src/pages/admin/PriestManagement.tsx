import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { UserCheck, Users, Search, Mail, Phone, Briefcase, Calendar, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  getAllEmployees,
  toggleUserAttendance,
  formatCurrency,
  type AdminUser,
  type EmployeeDetailsData
} from '@/api/priestAttendance';
import { useAuth } from '@/contexts/AuthContext';

interface EmployeeDialogData {
  employee: AdminUser;
  isOpen: boolean;
}

const EmployeeManagement: React.FC = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [dialogData, setDialogData] = useState<EmployeeDialogData>({ employee: null as any, isOpen: false });
  const [employeeDetails, setEmployeeDetails] = useState<EmployeeDetailsData>({
    address: '',
    specialization: '',
    daily_salary: 0,
    notes: ''
  });

  // Check if user has access - Super Admin (role_id: 0) or Admin (role_id: 1)
  const hasAccess = user?.role_id === 0 || user?.role_id === 1;

  // Fetch all employees
  const { data: employees, isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: getAllEmployees,
    enabled: hasAccess,
  });

  // Toggle attendance mutation
  const toggleMutation = useMutation({
    mutationFn: ({ userId, details }: { userId: string; details?: EmployeeDetailsData }) => 
      toggleUserAttendance(userId, details),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      queryClient.invalidateQueries({ queryKey: ['eligible-users'] });
      toast.success(data.message || 'Employee attendance status updated!');
      setDialogData({ employee: null as any, isOpen: false });
      // Reset form
      setEmployeeDetails({
        address: '',
        specialization: '',
        daily_salary: 0,
        notes: ''
      });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to update employee status');
    },
  });

  const handleToggleAttendance = (employee: AdminUser) => {
    if (employee.isAttendance) {
      // If already enrolled, just remove them
      if (confirm(`Are you sure you want to remove ${employee.name} from attendance tracking?`)) {
        toggleMutation.mutate({ userId: employee.id });
      }
    } else {
      // If not enrolled, open dialog to collect details
      setDialogData({ employee, isOpen: true });
      // Pre-fill if user already has details
      if (employee.daily_salary) {
        setEmployeeDetails({
          address: employee.address || '',
          specialization: employee.specialization || '',
          daily_salary: employee.daily_salary || 0,
          notes: employee.notes || ''
        });
      }
    }
  };

  const handleSubmitEmployeeDetails = () => {
    // Validate salary
    if (!employeeDetails.daily_salary || employeeDetails.daily_salary <= 0) {
      toast.error('Daily salary is required and must be greater than 0');
      return;
    }

    toggleMutation.mutate({ 
      userId: dialogData.employee.id, 
      details: employeeDetails 
    });
  };

  const handleCloseDialog = () => {
    setDialogData({ employee: null as any, isOpen: false });
    setEmployeeDetails({
      address: '',
      specialization: '',
      daily_salary: 0,
      notes: ''
    });
  };

  if (!hasAccess) {
    return (
      <div className="container mx-auto py-8 px-4">
        <Card className="border-red-300 bg-red-50">
          <CardContent className="pt-6 text-center">
            <p className="text-red-800">You do not have permission to access Employee Management.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Filter employees based on search query
  const filteredEmployees = employees?.filter(emp =>
    emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    emp.role?.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const enrolledCount = filteredEmployees.filter(e => e.isAttendance).length;
  const notEnrolledCount = filteredEmployees.filter(e => !e.isAttendance).length;

  return (
    <div className="container mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Employee Management</h1>
          <p className="text-gray-600 mt-1">Manage employee attendance enrollment</p>
        </div>
      </div>

      {/* Search Bar */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search by name, username, email, or role..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Employees</CardDescription>
            <CardTitle className="text-3xl">{filteredEmployees.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Enrolled in Attendance</CardDescription>
            <CardTitle className="text-3xl text-green-600">{enrolledCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Not Enrolled</CardDescription>
            <CardTitle className="text-3xl text-gray-400">{notEnrolledCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Employee List */}
      {isLoading ? (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-gray-600">Loading employees...</p>
          </CardContent>
        </Card>
      ) : filteredEmployees.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <p className="text-gray-600">
              {searchQuery ? 'No employees match your search' : 'No employees found'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEmployees.map((employee) => (
            <Card key={employee.id} className={`${employee.isAttendance ? 'border-green-200' : ''}`}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="text-lg flex items-center gap-2">
                      {employee.name}
                      {employee.isAttendance && (
                        <Badge className="bg-green-500">Enrolled</Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="mt-1">
                      <span className="font-medium">@{employee.username}</span>
                      {employee.role && (
                        <Badge variant="outline" className="ml-2">{employee.role}</Badge>
                      )}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-3">
                {/* Contact Info */}
                {employee.email && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Mail className="w-4 h-4" />
                    <span className="truncate">{employee.email}</span>
                  </div>
                )}
                {employee.mobile_number && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Phone className="w-4 h-4" />
                    <span>{employee.mobile_prefix}{employee.mobile_number}</span>
                  </div>
                )}

                {/* Salary Info */}
                {employee.has_salary_configured && employee.daily_salary && (
                  <div className="flex items-center gap-2 text-lg font-semibold text-green-600">
                    <Briefcase className="w-5 h-5" />
                    <span>{formatCurrency(employee.daily_salary)}/day</span>
                  </div>
                )}

                {/* Specialization */}
                {employee.specialization && (
                  <div className="pt-2 border-t text-sm text-gray-600">
                    <p><span className="font-medium">Specialization:</span> {employee.specialization}</p>
                  </div>
                )}

                {/* Created Date */}
                {employee.created_at && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Calendar className="w-3 h-3" />
                    <span>Joined: {format(new Date(employee.created_at), 'MMM dd, yyyy')}</span>
                  </div>
                )}

                {/* Action Button */}
                <div className="pt-3">
                  <Button
                    onClick={() => handleToggleAttendance(employee)}
                    disabled={toggleMutation.isPending}
                    variant={employee.isAttendance ? "outline" : "default"}
                    className="w-full"
                  >
                    <UserCheck className="w-4 h-4 mr-2" />
                    {employee.isAttendance ? 'Remove from Attendance' : 'Add as Employee'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Employee Details Dialog */}
      <Dialog open={dialogData.isOpen} onOpenChange={(open) => !open && handleCloseDialog()}>
        <DialogContent className="sm:max-w-[500px] max-w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Employee Details</DialogTitle>
            <DialogDescription className="break-words">
              Enter employee details for {dialogData.employee?.name}. Daily salary is required.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Daily Salary - Required */}
            <div className="grid gap-2">
              <Label htmlFor="salary" className="flex items-center gap-1 text-sm">
                Daily Salary <span className="text-red-500">*</span>
              </Label>
              <Input
                id="salary"
                type="number"
                min="0"
                step="0.01"
                placeholder="Enter daily salary"
                value={employeeDetails.daily_salary || ''}
                onChange={(e) => setEmployeeDetails({ ...employeeDetails, daily_salary: parseFloat(e.target.value) || 0 })}
                className="w-full"
                required
              />
            </div>

            {/* Address - Optional */}
            <div className="grid gap-2">
              <Label htmlFor="address" className="text-sm">Address (Optional)</Label>
              <Textarea
                id="address"
                placeholder="Enter residential address"
                value={employeeDetails.address || ''}
                onChange={(e) => setEmployeeDetails({ ...employeeDetails, address: e.target.value })}
                className="w-full resize-none min-h-[80px]"
                rows={3}
                maxLength={500}
              />
              <span className="text-xs text-gray-500">
                {employeeDetails.address?.length || 0}/500 characters
              </span>
            </div>

            {/* Specialization - Optional */}
            <div className="grid gap-2">
              <Label htmlFor="specialization" className="text-sm">Specialization (Optional)</Label>
              <Input
                id="specialization"
                placeholder="Area of expertise"
                value={employeeDetails.specialization || ''}
                onChange={(e) => setEmployeeDetails({ ...employeeDetails, specialization: e.target.value })}
                className="w-full"
                maxLength={200}
              />
            </div>

            {/* Notes - Optional */}
            <div className="grid gap-2">
              <Label htmlFor="notes" className="text-sm">Notes (Optional)</Label>
              <Textarea
                id="notes"
                placeholder="Additional notes or comments"
                value={employeeDetails.notes || ''}
                onChange={(e) => setEmployeeDetails({ ...employeeDetails, notes: e.target.value })}
                className="w-full resize-none min-h-[80px]"
                rows={3}
                maxLength={1000}
              />
              <span className="text-xs text-gray-500">
                {employeeDetails.notes?.length || 0}/1000 characters
              </span>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={handleCloseDialog}
              disabled={toggleMutation.isPending}
              className="w-full sm:w-auto order-2 sm:order-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              onClick={handleSubmitEmployeeDetails}
              disabled={toggleMutation.isPending || !employeeDetails.daily_salary || employeeDetails.daily_salary <= 0}
              className="w-full sm:w-auto order-1 sm:order-2"
            >
              {toggleMutation.isPending ? 'Adding...' : 'Add as Employee'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmployeeManagement;
