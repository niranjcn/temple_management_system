import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient, UseQueryResult, UseMutationResult } from '@tanstack/react-query';
import { get, post, put, del, API_BASE_URL } from '../../api/api';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
// Removed intl-tel-input. Using simple country code input "+<digits>".
// Removed unused Select components; using native select for simplicity
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Users,
  CheckCircle,
  Shield,
  Trash2,
  Edit,
  Eye,
  EyeOff,
  Pencil,
  Check,
  X
} from 'lucide-react';
// import { AxiosError } from 'axios';
import { useAuth } from '@/contexts/AuthContext';

// --- Type Definitions ---
interface Admin {
  _id: string;
  name: string;
  email: string;
  google_email?: string;
  username: string;
  mobile_prefix: string;
  mobile_number: number;
  role: string;
  role_id: number;
  permissions: string[];
  isRestricted: boolean;
  created_at: string;
  last_login?: string;
  profile_picture?: string | null;
  dob?: string | null;
  updated_at?: string;
  updated_by?: string;
  created_by?: string;
  notification_preference?: string[];
  notification_list?: string[];
  last_profile_update?: string;
}

interface AdminCreationPayload extends Omit<Admin, '_id' | 'created_at' | 'last_login'> {}

interface AdminUpdatePayload {
  name?: string;
  email?: string;
  google_email?: string;
  username?: string;
  role?: string;
  role_id?: number;
  mobile_prefix?: string;
  mobile_number?: number;
  permissions?: string[];
  isRestricted?: boolean;
  profile_picture?: string;
  dob?: string;
  notification_preference?: string[];
  notification_list?: string[];
}

// --- API Fetching ---
const fetchAdmins = (): Promise<Admin[]> => get<Admin[]>('/admin/users/');

type Role = { _id: string; role_id: number; role_name: string; basic_permissions: string[] };

const AdminManagement = () => {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [roles, setRoles] = useState<Role[]>([]);
  const { user } = useAuth() as any;
  const myRoleId: number = user?.role_id ?? 99;

  useEffect(() => {
    (async () => {
      try {
        const data = await get<Role[]>('/roles/');
        setRoles(data);
      } catch (e) {
        console.error('Failed to fetch roles', e);
      }
    })();
  }, []);

  const { data: admins = [], isLoading, isError }: UseQueryResult<Admin[], Error> = useQuery<Admin[], Error>({
    queryKey: ['admins'],
    queryFn: fetchAdmins,
  });

  if (myRoleId > 2) {
      return <div className="text-red-400">You are not authorized to access this page.</div>;
  }

  if (isError) {
      toast.error('Failed to fetch admins. You may not have permission.');
  }

  // Stats
  const totalAdmins = admins.length;
  const activeAdmins = admins.filter(a => !a.isRestricted).length;
  const permissionCount = new Set(admins.flatMap(a => a.permissions)).size;

  return (
  <div className="space-y-6 w-full">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-300 to-pink-400 bg-clip-text text-transparent">
            Admin Management
          </h1>
          <p className="text-purple-100/90 mt-2">
            Create and manage temple administrators and users
          </p>
        </div>
        <Button
          onClick={() => setShowAddForm(true)}
          disabled={myRoleId > 2}
          className="bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-3 rounded-lg hover:from-purple-700 hover:to-pink-700 transition-all duration-300 transform hover:scale-105 shadow-lg shadow-purple-500/30 flex items-center space-x-2"
        >
          <Users className="h-5 w-5" />
          <span>Create Admins</span>
        </Button>
      </div>

      {/* Admin Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard icon={Users} title="Total Admins" value={totalAdmins} color="indigo" />
        <StatCard icon={CheckCircle} title="Active Admins" value={activeAdmins} color="green" />
        <StatCard icon={Shield} title="Permission Types" value={permissionCount} color="purple" />
      </div>

      {/* Create Admin Form */}
      {showAddForm && (
        <AdminForm
          roles={roles}
          onClose={() => setShowAddForm(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['admins'] });
            setShowAddForm(false);
          }}
        />
      )}

      {/* Admin List */}
      <div className="bg-slate-900/80 backdrop-blur-sm rounded-xl shadow-lg border border-purple-500/30">
        <div className="p-6 border-b border-purple-500/30">
          <h2 className="text-xl font-bold text-purple-400">
            Current Administrators
          </h2>
        </div>
        <div className="overflow-x-auto w-full">
          <Table className="w-full min-w-full table-fixed text-sm text-left text-gray-300">
            <TableHeader>
              <TableRow className="border-b border-purple-500/30">
                <TableHead className="px-6 py-3 text-purple-300 w-1/2 sm:w-1/4">Admin</TableHead>
                <TableHead className="px-6 py-3 text-purple-300 w-1/4 hidden sm:table-cell">Contact</TableHead>
                <TableHead className="px-6 py-3 text-purple-300 w-1/6 hidden md:table-cell">Status</TableHead>
                <TableHead className="px-6 py-3 text-purple-300 w-1/6 hidden md:table-cell">Role</TableHead>
                <TableHead className="px-6 py-3 text-purple-300 w-1/2 sm:w-1/4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
              ) : (
                admins.map(admin => (
                  <AdminRow key={admin._id} admin={admin} roles={roles} />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};

// Helper components to keep the main component clean

const StatCard = ({ icon: Icon, title, value, color }: { icon: React.ElementType, title: string, value: number, color: string }) => (
  <div className={`bg-slate-900/80 backdrop-blur-sm border border-${color}-500/30 p-6 rounded-xl shadow-lg shadow-${color}-500/10`}>
    <div className="flex items-center justify-between">
      <div>
        <p className={`text-sm font-medium text-${color}-300`}>{title}</p>
        <p className="text-3xl font-bold text-white mt-1">{value}</p>
      </div>
      <Icon className={`h-12 w-12 text-${color}-400`} />
    </div>
  </div>
);

const AdminRow = ({ admin, roles }: { admin: Admin, roles: Role[] }) => {
  const queryClient = useQueryClient();
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [modalEditing, setModalEditing] = useState(false);
  const [snapshot, setSnapshot] = useState<{ name: string; username: string; email: string; mobile_prefix: string; mobile_number: string; dob: string } | null>(null);
  // Password change dialog state
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [superAdminPassword, setSuperAdminPassword] = useState('');
  // inline edit states
  const [editingEmail, setEditingEmail] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [editingUsername, setEditingUsername] = useState(false);
  const [editingPhone, setEditingPhone] = useState(false);
  const [editingDob, setEditingDob] = useState(false);
  const [emailValue, setEmailValue] = useState(admin.email);
  const [nameValue, setNameValue] = useState(admin.name);
  const [usernameValue, setUsernameValue] = useState(admin.username);
  const [prefixValue, setPrefixValue] = useState(admin.mobile_prefix);
  const [mobileValue, setMobileValue] = useState(String(admin.mobile_number ?? ''));
  const [dobValue, setDobValue] = useState(admin.dob || '');
  const { user } = useAuth() as any;
  const myRoleId: number = user?.role_id ?? 99;
  const myId: string | undefined = user?._id;
  const isSuperAdmin = admin.role_id === 0;
  const isCurrentUserSuperAdmin = myRoleId === 0;
  // Align with backend: cannot modify Super Admin, must have strictly lower role_id, and no self-mod for any non-super user
  const canModify = !isSuperAdmin && myRoleId < admin.role_id && !(myId && admin._id === myId && myRoleId >= 1);

  // Effect to reset inline edit states when dialog is closed
  useEffect(() => {
    if (!isProfileDialogOpen) {
      setModalEditing(false);
      setSnapshot(null);
      setEditingEmail(false);
      setEditingName(false);
      setEditingUsername(false);
      setEditingPhone(false);
      setEditingDob(false);
      setEmailValue(admin.email);
      setNameValue(admin.name);
      setUsernameValue(admin.username);
      setPrefixValue(admin.mobile_prefix);
      setMobileValue(String(admin.mobile_number ?? ''));
      setDobValue(admin.dob || '');
    }
  }, [isProfileDialogOpen, admin]);

  const resolveProfileUrl = (p?: string | null) => {
    if (!p) return 'https://placehold.co/150x150/1E293B/FFFFFF?text=👤';
    if (p.startsWith('/static') || p.startsWith('/api/')) return `${API_BASE_URL}${p}`;
    if (p.startsWith('http://') || p.startsWith('https://')) return p;
    // fallback treat as relative to API
    return `${API_BASE_URL}${p.startsWith('/') ? p : '/' + p}`;
  };

  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: (id: string) => del(`/admin/users/${id}/`),
    onSuccess: () => {
      toast.success('Admin deleted successfully.');
      queryClient.invalidateQueries({ queryKey: ['admins'] });
    },
    onError: () => {
      toast.error('Failed to delete admin.');
    }
  });

  const restrictMutation = useMutation<void, Error, { id: string; payload: AdminUpdatePayload }>({
    mutationFn: ({ id, payload }) => put(`/admin/users/${id}/`, payload),
    onSuccess: () => {
      toast.success('Admin status updated.');
      queryClient.invalidateQueries({ queryKey: ['admins'] });
    },
    onError: () => {
      toast.error('Failed to update admin status.');
    }
  });

  const updateMutation = useMutation<void, Error, { id: string; payload: Partial<Admin> }>({
    mutationFn: ({ id, payload }) => put(`/admin/users/${id}/`, payload),
    onSuccess: () => {
      toast.success('Profile updated');
      queryClient.invalidateQueries({ queryKey: ['admins'] });
      setEditingEmail(false);
      setEditingPhone(false);
      setEditingDob(false);
      setEditingName(false);
      setEditingUsername(false);
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.detail || e?.message || 'Failed to update profile';
      toast.error(String(msg));
    }
  });

  const passwordChangeMutation = useMutation<void, Error, { targetId: string; newPassword: string; adminPassword: string }>({
    mutationFn: async ({ targetId, newPassword, adminPassword }) => {
      // First verify super admin's password by attempting to get token
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: user?.username, password: adminPassword })
      });
      
      if (!response.ok) {
        throw new Error('Invalid super admin password');
      }
      
      // Now update the target user's password
      await put(`/admin/users/${targetId}/`, { password: newPassword });
    },
    onSuccess: () => {
      toast.success('Password changed successfully');
      setShowPasswordDialog(false);
      setNewPassword('');
      setConfirmPassword('');
      setSuperAdminPassword('');
      queryClient.invalidateQueries({ queryKey: ['admins'] });
    },
    onError: (e: any) => {
      const msg = e?.message || e?.response?.data?.detail || 'Failed to change password';
      toast.error(String(msg));
    }
  });

  const saveEmail = () => {
    if (!canModify) return;
    updateMutation.mutate({ id: admin._id, payload: { email: emailValue } });
  };
  const saveName = () => {
    if (!canModify) return;
    updateMutation.mutate({ id: admin._id, payload: { name: nameValue } });
  };
  const saveUsername = () => {
    if (!canModify) return;
    const newUsername = (usernameValue || '').trim();
    if (!newUsername) { toast.error('Username cannot be empty'); return; }
    updateMutation.mutate({ id: admin._id, payload: { username: newUsername } });
  };
  const savePhone = () => {
    if (!canModify) return;
    const num = Number(mobileValue);
    if (!Number.isFinite(num)) {
      toast.error('Phone must be a number');
      return;
    }
    updateMutation.mutate({ id: admin._id, payload: { mobile_prefix: prefixValue, mobile_number: num } });
  };
  const saveDob = () => {
    if (!canModify) return;
    updateMutation.mutate({ id: admin._id, payload: { dob: dobValue } });
  };

  const enterEditMode = () => {
    if (!canModify) return;
    setSnapshot({
      name: nameValue,
      username: usernameValue,
      email: emailValue,
      mobile_prefix: prefixValue,
      mobile_number: String(mobileValue || ''),
      dob: dobValue,
    });
    setModalEditing(true);
  };

  const cancelEdit = () => {
    if (snapshot) {
      setNameValue(snapshot.name);
      setUsernameValue(snapshot.username);
      setEmailValue(snapshot.email);
      setPrefixValue(snapshot.mobile_prefix);
      setMobileValue(String(snapshot.mobile_number || ''));
      setDobValue(snapshot.dob);
    } else {
      // Fallback to server values
      setNameValue(admin.name);
      setUsernameValue(admin.username);
      setEmailValue(admin.email);
      setPrefixValue(admin.mobile_prefix);
      setMobileValue(String(admin.mobile_number ?? ''));
      setDobValue(admin.dob || '');
    }
    setModalEditing(false);
  };

  const saveAllChanges = () => {
    if (!canModify) return;
    const diff: Partial<Admin> = {};
    if (nameValue !== admin.name) (diff as any).name = nameValue;
    const trimmedUser = (usernameValue || '').trim();
    if (trimmedUser !== admin.username) (diff as any).username = trimmedUser;
    if (emailValue !== admin.email) (diff as any).email = emailValue;
    if (prefixValue !== admin.mobile_prefix) (diff as any).mobile_prefix = prefixValue;
    const num = Number(mobileValue);
    if (Number.isFinite(num) && num !== admin.mobile_number) (diff as any).mobile_number = num;
    if ((dobValue || '') !== (admin.dob || '')) (diff as any).dob = dobValue;

    if (Object.keys(diff).length === 0) {
      toast.info('No changes to save.');
      setModalEditing(false);
      return;
    }

    updateMutation.mutate({ id: admin._id, payload: diff });
    setModalEditing(false);
  };

  const handlePasswordChange = () => {
    if (!newPassword || !confirmPassword || !superAdminPassword) {
      toast.error('All password fields are required');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    
    // Validate password requirements
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters long');
      return;
    }
    
    if (!/[a-zA-Z]/.test(newPassword)) {
      toast.error('Password must contain at least one letter');
      return;
    }
    
    if (!/\d/.test(newPassword)) {
      toast.error('Password must contain at least one number');
      return;
    }
    
    if (!/[!@#$%^&*()_\-+=[\]{}|:;",.<>?/]/.test(newPassword)) {
      toast.error('Password must contain at least one special character');
      return;
    }
    
    passwordChangeMutation.mutate({ 
      targetId: admin._id, 
      newPassword, 
      adminPassword: superAdminPassword 
    });
  };

  return (
    <TableRow className="border-b border-purple-500/30 hover:bg-purple-900/20">
      <TableCell className="px-6 py-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setIsProfileDialogOpen(true)} className="shrink-0 focus:outline-none">
            <img
              src={resolveProfileUrl(admin.profile_picture).replace('150x150', '48x48')}
              alt={admin.name}
              className="w-12 h-12 rounded-full object-cover border-2 border-purple-500/40 hover:border-purple-400 transition"
            />
          </button>
          <div>
            <div className="font-semibold text-white break-words max-w-xs hidden sm:block">{admin.name}</div>
            <div className="text-xs text-gray-300 break-words max-w-xs">{admin.username}</div>
          </div>
        </div>
      </TableCell>
      <TableCell className="px-6 py-4 hidden sm:table-cell">
        <div className="break-words max-w-xs">{admin.email}</div>
        <div className="break-words max-w-xs">{`${admin.mobile_prefix} ${admin.mobile_number}`}</div>
      </TableCell>
      <TableCell className="px-6 py-4 hidden md:table-cell">
        <Badge variant={admin.isRestricted ? 'destructive' : 'secondary'} className={admin.isRestricted ? 'bg-red-600/20 text-red-300 border-red-500/30' : 'bg-green-600/20 text-green-300 border-green-500/30'}>
          {admin.isRestricted ? 'Restricted' : 'Active'}
        </Badge>
      </TableCell>
      <TableCell className="px-6 py-4 hidden md:table-cell">{admin.role}</TableCell>
      <TableCell className="px-6 py-4">
        <div className="flex flex-wrap gap-2">
          <Button className="bg-gradient-to-r from-purple-600 to-pink-600 text-white" onClick={() => setIsProfileDialogOpen(true)}>Open Profile</Button>
          {isCurrentUserSuperAdmin && !isSuperAdmin && (
            <Button className="bg-blue-600 text-white hover:bg-blue-700" onClick={() => setShowPasswordDialog(true)}>
              Change Password
            </Button>
          )}
          <Button className="bg-red-600 text-white" disabled={!canModify} onClick={() => deleteMutation.mutate(admin._id)}>Delete</Button>
          <Button className="bg-amber-600 text-white" disabled={!canModify} onClick={() => restrictMutation.mutate({ id: admin._id, payload: { isRestricted: !admin.isRestricted } })}>
            {admin.isRestricted ? 'Unrestrict' : 'Restrict'}
          </Button>
        </div>
        <Dialog open={isProfileDialogOpen} onOpenChange={setIsProfileDialogOpen}>
          <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] overflow-y-auto overscroll-contain bg-white border border-orange-200 text-slate-800">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-orange-600">
                Admin Profile: {admin.name}
              </DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-1 flex flex-col items-center">
                <img
                  src={resolveProfileUrl(admin.profile_picture)}
                  alt={admin.name}
                  className="w-32 h-32 rounded-full object-cover border-4 border-orange-300"
                />
                <div className="mt-4 text-center">
                  <div className="text-lg font-semibold text-slate-900">{admin.name}</div>
                  <div className="text-sm text-slate-500">{admin.username}</div>
                </div>
              </div>
              <div className="md:col-span-2 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Name panel */}
                  <div className="bg-orange-50 border border-orange-200 rounded-md p-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs uppercase tracking-wide text-orange-600">Name</div>
                    </div>
                    {modalEditing && canModify ? (
                      <Input type="text" value={nameValue} onChange={(e) => setNameValue(e.target.value)} className="bg-white border-orange-300 mt-1" />
                    ) : (
                      <div className="text-sm text-slate-900 mt-0.5 break-words">{nameValue}</div>
                    )}
                  </div>

                  {/* Username panel */}
                  <div className="bg-orange-50 border border-orange-200 rounded-md p-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs uppercase tracking-wide text-orange-600">Username</div>
                    </div>
                    {modalEditing && canModify ? (
                      <Input type="text" value={usernameValue} onChange={(e) => setUsernameValue(e.target.value)} className="bg-white border-orange-300 mt-1" />
                    ) : (
                      <div className="text-sm text-slate-900 mt-0.5 break-words">{usernameValue}</div>
                    )}
                    <div className="text-[11px] text-orange-600 mt-1">Must be unique</div>
                  </div>

                  {/* Notification Email panel */}
                  <div className="bg-orange-50 border border-orange-200 rounded-md p-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs uppercase tracking-wide text-orange-600">Notification Email</div>
                    </div>
                    {modalEditing && canModify ? (
                      <Input type="email" value={emailValue} onChange={(e) => setEmailValue(e.target.value)} className="bg-white border-orange-300 mt-1" />
                    ) : (
                      <div className="text-sm text-slate-900 mt-0.5 break-words">{emailValue}</div>
                    )}
                  </div>

                  {/* Phone panel */}
                  <div className="bg-orange-50 border border-orange-200 rounded-md p-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs uppercase tracking-wide text-orange-600">Phone</div>
                    </div>
                    {modalEditing && canModify ? (
                      <div className="mt-1 flex gap-2 items-center">
                        <Input
                          type="text"
                          value={prefixValue}
                          onChange={(e) => {
                            const digits = e.target.value.replace(/[^0-9]/g, '');
                            setPrefixValue('+' + digits);
                          }}
                          onBeforeInput={(e: any) => {
                            if (e?.data && /\D/.test(e.data)) e.preventDefault();
                          }}
                          onPaste={(e) => {
                            const text = (e.clipboardData?.getData('text') || '').replace(/\D/g, '');
                            e.preventDefault();
                            setPrefixValue('+' + text);
                          }}
                          onDrop={(e) => e.preventDefault()}
                          className="bg-white border-orange-300 w-24"
                        />
                        <Input
                          type="tel"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={mobileValue}
                          onChange={(e) => setMobileValue(e.target.value.replace(/\D/g, ''))}
                          onBeforeInput={(e: any) => { if (e?.data && /\D/.test(e.data)) e.preventDefault(); }}
                          onKeyDown={(e) => {
                            if (e.ctrlKey || e.metaKey) return;
                            const allowed = ['Backspace','Delete','ArrowLeft','ArrowRight','Tab','Home','End'];
                            if (allowed.includes(e.key)) return;
                            if (!/^[0-9]$/.test(e.key)) e.preventDefault();
                          }}
                          onPaste={(e) => {
                            const text = (e.clipboardData?.getData('text') || '').replace(/\D/g, '');
                            e.preventDefault();
                            setMobileValue((prev) => (prev + text).slice(0, 15));
                          }}
                          onDrop={(e) => e.preventDefault()}
                          maxLength={15}
                          className="bg-white border-orange-300 flex-1"
                        />
                      </div>
                    ) : (
                      <div className="text-sm text-slate-900 mt-0.5 break-words">{`${prefixValue} ${mobileValue}`}</div>
                    )}
                  </div>
                  <Info label="Role" value={`${admin.role} (ID ${admin.role_id})`} />
                  <Info label="Status" value={admin.isRestricted ? 'Restricted' : 'Active'} />
                  <div className="bg-orange-50 border border-orange-200 rounded-md p-2">
                    <div className="flex items-center justify-between">
                      <div className="text-xs uppercase tracking-wide text-orange-600">DOB</div>
                    </div>
                    {modalEditing && canModify ? (
                      <Input type="date" value={dobValue} onChange={(e) => setDobValue(e.target.value)} className="bg-white border-orange-300 mt-1" />
                    ) : (
                      <div className="text-sm text-slate-900 mt-0.5 break-words">{dobValue || '—'}</div>
                    )}
                  </div>
                  <Info label="Last Login" value={admin.last_login ? new Date(admin.last_login).toLocaleString() : '—'} />
                  <Info label="Created By" value={admin.created_by || '—'} />
                  <Info label="Created At" value={admin.created_at ? new Date(admin.created_at).toLocaleString() : '—'} />
                  <Info label="Updated By" value={admin.updated_by || '—'} />
                  <Info label="Updated At" value={admin.updated_at ? new Date(admin.updated_at).toLocaleString() : '—'} />
                  <Info label="Last Profile Update" value={admin.last_profile_update ? new Date(admin.last_profile_update).toLocaleDateString() : '—'} />
                </div>
                <div>
                  <div className="text-sm text-slate-600 mb-1">Permissions</div>
                  <div className="flex flex-wrap gap-2">
                    {(admin.permissions || []).length > 0 ? admin.permissions.map((p, idx) => (
                      <Badge key={idx} className="bg-orange-50 border border-orange-200 text-orange-700">{p}</Badge>
                    )) : <span className="text-slate-400">None</span>}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-sm text-slate-600 mb-1">Notification Preference</div>
                    <div className="flex flex-wrap gap-2">
                      {(admin.notification_preference || []).length > 0 ? admin.notification_preference.map((p, idx) => (
                        <Badge key={idx} className="bg-orange-50 border border-orange-200 text-orange-700">{p}</Badge>
                      )) : <span className="text-slate-400">None</span>}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-slate-600 mb-1">Notification List</div>
                    <div className="flex flex-wrap gap-2">
                      {(admin.notification_list || []).length > 0 ? admin.notification_list.map((p, idx) => (
                        <Badge key={idx} className="bg-orange-50 border border-orange-200 text-orange-700">{p}</Badge>
                      )) : <span className="text-slate-400">None</span>}
                    </div>
                  </div>
                </div>
                {/* Global actions at bottom only */}
                {canModify && (
                  <div className="flex flex-col sm:flex-row justify-end gap-2 pt-2">
                    {!modalEditing ? (
                      <Button onClick={enterEditMode} className="bg-orange-600 text-white w-full sm:w-auto">Edit</Button>
                    ) : (
                      <>
                        <Button variant="ghost" onClick={cancelEdit} className="w-full sm:w-auto">Cancel Changes</Button>
                        <Button onClick={saveAllChanges} className="bg-orange-600 text-white w-full sm:w-auto">Save Changes</Button>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Password Change Dialog */}
        <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
          <DialogContent className="bg-slate-900 border border-purple-500/30 text-white w-[95vw] max-w-xs max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-purple-400">
                Change Password for {admin.name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-purple-200 text-sm">As Super Admin, you can change this user's password. You must enter your own password to confirm.</p>
              
              <div className="space-y-3">
                <div>
                  <Label htmlFor="newPassword" className="text-purple-300">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="bg-slate-800/50 border-purple-500/30 mt-1 text-white"
                    placeholder="Min. 8 characters"
                  />
                  <p className="text-xs text-purple-300 mt-1">Must contain: letter, number, special character</p>
                </div>
                
                <div>
                  <Label htmlFor="confirmPassword" className="text-purple-300">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="bg-slate-800/50 border-purple-500/30 mt-1 text-white"
                    placeholder="Re-enter new password"
                  />
                </div>
                
                <div className="pt-4 border-t border-purple-500/30">
                  <Label htmlFor="superAdminPassword" className="text-purple-300 font-semibold">Your Super Admin Password</Label>
                  <p className="text-xs text-purple-200 mb-2">Enter your own password to authorize this change</p>
                  <Input
                    id="superAdminPassword"
                    type="password"
                    value={superAdminPassword}
                    onChange={(e) => setSuperAdminPassword(e.target.value)}
                    className="bg-slate-800/50 border-purple-500/30 text-white"
                    placeholder="Your password"
                  />
                </div>
              </div>
              
              <div className="flex justify-end gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowPasswordDialog(false);
                    setNewPassword('');
                    setConfirmPassword('');
                    setSuperAdminPassword('');
                  }}
                  className="border-purple-500/30 text-purple-300 hover:bg-purple-900/20"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handlePasswordChange}
                  disabled={passwordChangeMutation.isPending}
                  className="bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700"
                >
                  {passwordChangeMutation.isPending ? 'Changing...' : 'Change Password'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </TableCell>
    </TableRow>
  );
};

const AdminForm = ({ roles, adminToEdit, onSuccess, onClose }: { roles: Role[]; adminToEdit?: Admin; onSuccess: () => void; onClose?: () => void; }) => {
  const auth = useAuth() as any;
  const myRoleId: number = auth?.user?.role_id ?? 99;
  type FormState = {
    name: string;
    email: string;
    google_email: string;
    username: string;
    mobile_prefix: string;
    mobile_number: number | string;
    role: string;
    role_id?: number;
    permissions: string[];
    isRestricted: boolean;
    password?: string;
    confirmPassword?: string;
  };
  const [formData, setFormData] = useState<FormState>({
    name: adminToEdit?.name || '',
    email: adminToEdit?.email || adminToEdit?.google_email || '',
    google_email: adminToEdit?.google_email || '',
    username: adminToEdit?.username || '',
    mobile_prefix: adminToEdit?.mobile_prefix || '+91',
    mobile_number: adminToEdit?.mobile_number || '',
    role: adminToEdit?.role || '',
    role_id: adminToEdit?.role_id,
    permissions: adminToEdit?.permissions || [],
    isRestricted: adminToEdit?.isRestricted || false,
    password: '',
    confirmPassword: '',
  });
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordError, setPasswordError] = useState<string>('');
  // Allowed roles: hide super admin always; only roles with role_id strictly greater than myRoleId
  const allowedRoles = roles.filter(r => r.role_id !== 0 && r.role_id > myRoleId);

  const mutation: UseMutationResult<void, Error, AdminCreationPayload | Partial<AdminUpdatePayload>> = useMutation<void, Error, AdminCreationPayload | Partial<AdminUpdatePayload>>({
    mutationFn: (payload) => {
      console.log('Payload being sent:', payload);
      return adminToEdit ? put(`/admin/users/${adminToEdit._id}/`, payload) : post('/admin/users/', payload);
    },
    onSuccess: () => {
      toast.success(`Admin ${adminToEdit ? 'updated' : 'created'} successfully.`);
      onSuccess();
    },
    onError: (error: any) => {
      const detail = error?.response?.data?.detail;
      const msg = Array.isArray(detail)
        ? detail.map((d: any) => d?.msg ?? JSON.stringify(d)).join('; ')
        : (detail || error?.message || 'An unexpected error occurred');
      toast.error(String(msg));
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!adminToEdit) {
      // CREATE mode - password is required
      if (!formData.password) {
        toast.error('Password is required');
        setPasswordError('Password is required');
        return;
      }
      
      if (formData.password !== formData.confirmPassword) {
        toast.error('Passwords do not match');
        setPasswordError('Passwords do not match');
        return;
      }
      
      // Validate password requirements
      if (formData.password.length < 8) {
        toast.error('Password must be at least 8 characters long');
        setPasswordError('Password must be at least 8 characters long');
        return;
      }
      
      if (!/[a-zA-Z]/.test(formData.password)) {
        toast.error('Password must contain at least one letter');
        setPasswordError('Password must contain at least one letter');
        return;
      }
      
      if (!/\d/.test(formData.password)) {
        toast.error('Password must contain at least one number');
        setPasswordError('Password must contain at least one number');
        return;
      }
      
      if (!/[!@#$%^&*()_\-+=[\]{}|:;",.<>?/]/.test(formData.password)) {
        toast.error('Password must contain at least one special character');
        setPasswordError('Password must contain at least one special character');
        return;
      }
      
      if (formData.role_id == null) {
        toast.error('Please select a role');
        return;
      }
      
      // CREATE: must satisfy AdminCreate requirements
      const payload = {
        name: formData.name,
        email: formData.email,
        username: formData.username,
        mobile_prefix: formData.mobile_prefix,
        mobile_number: Number(formData.mobile_number),
        role: formData.role,
        role_id: formData.role_id,
        permissions: formData.permissions,
        isRestricted: formData.isRestricted,
        password: formData.password,
      } as AdminCreationPayload;
      mutation.mutate(payload);
    } else {
      // UPDATE: send only changed fields
      const diff: Partial<AdminUpdatePayload> = {};
      if (formData.name !== adminToEdit.name) diff.name = formData.name;
      if ((formData.google_email || '') !== (adminToEdit.google_email || '')) diff.google_email = formData.google_email;
      if (formData.email !== adminToEdit.email) diff.email = formData.email;
      // Username cannot be edited after creation
      if (formData.mobile_prefix !== adminToEdit.mobile_prefix) diff.mobile_prefix = formData.mobile_prefix;
      const mobileNum = Number(formData.mobile_number);
      if (mobileNum !== adminToEdit.mobile_number) diff.mobile_number = mobileNum;
      if (formData.isRestricted !== adminToEdit.isRestricted) diff.isRestricted = formData.isRestricted;
      if (formData.role_id !== adminToEdit.role_id) diff.role_id = formData.role_id;
      if (formData.role && formData.role !== adminToEdit.role) diff.role = formData.role;
      // role/permissions only if you actually surface editable controls for them
      // if changed: diff.role = formData.role; diff.permissions = formData.permissions;

      // If no changes, do nothing
      if (Object.keys(diff).length === 0) {
        toast.info('No changes to save.');
        return;
      }
      // Do NOT include created_by/created_at on update; backend will set updated metadata
      mutation.mutate(diff);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {/* Username first */}
        {adminToEdit ? (
          <div>
            <Label htmlFor="username" className="text-purple-300">Username</Label>
            <Input id="username" className="bg-slate-800/50 border-purple-500/30 mt-1 opacity-70" value={formData.username} disabled />
            <div className="text-xs text-gray-400 mt-1">Username is permanent and cannot be changed.</div>
          </div>
        ) : (
          <FormField label="Username" id="username" value={formData.username} onChange={(e) => setFormData({ ...formData, username: e.target.value })} />
        )}
        {/* Authentication Email is not required for Create. Show only when editing an existing admin. */}
        {adminToEdit && (
          <FormField
            label="Authentication Email (for login)"
            id="google_email"
            type="email"
            value={formData.google_email}
            onChange={(e) => {
              const val = e.target.value;
              setFormData((prev) => ({ ...prev, google_email: val }));
            }}
          />
        )}
        {/* Name */}
        <FormField label="Name" id="name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} />
        {/* Email */}
        <div>
          <Label htmlFor="email" className="text-purple-300">Email</Label>
          <Input
            id="email"
            type="email"
            className="bg-slate-800/50 border-purple-500/30 mt-1"
            value={formData.email}
            onChange={(e) => { setEmailTouched(true); setFormData({ ...formData, email: e.target.value }); }}
          />
          <div className="text-xs text-gray-400 mt-1">This email will be used for notifications and contact.</div>
        </div>
        {/* Role select below identity fields */}
        <div className="col-span-2">
          <Label htmlFor="role" className="text-purple-300">Role</Label>
          <select
            id="role"
            className="w-full bg-slate-800/50 border-purple-500/30 mt-1 rounded-md p-2"
            value={formData.role_id != null ? String(formData.role_id) : ''}
            onChange={(e) => {
              const val = e.target.value;
              if (!val) { setFormData({ ...formData, role_id: undefined, role: '' }); return; }
              const selected = allowedRoles.find(r => String(r.role_id) === val);
              if (selected) { setFormData({ ...formData, role_id: selected.role_id, role: selected.role_name }); }
            }}
          >
            <option value="">Select role</option>
            {allowedRoles.map(r => (
              <option key={r._id} value={String(r.role_id)}>{r.role_name}</option>
            ))}
          </select>
        </div>
        {/* Phone */}
        <div className="flex gap-2">
          <div className="w-1/3">
            <Label htmlFor="mobile_prefix" className="text-purple-300">Prefix</Label>
            <Input id="mobile_prefix" value={formData.mobile_prefix}
              onChange={(e) => {
                const digits = e.target.value.replace(/[^0-9]/g, '');
                setFormData({ ...formData, mobile_prefix: '+' + digits });
              }}
              onBeforeInput={(e: any) => { if (e?.data && /\D/.test(e.data)) e.preventDefault(); }}
              onPaste={(e) => {
                const text = (e.clipboardData?.getData('text') || '').replace(/\D/g, '');
                e.preventDefault();
                setFormData({ ...formData, mobile_prefix: '+' + text });
              }}
              onDrop={(e) => e.preventDefault()}
              className="bg-slate-800/50 border-purple-500/30 mt-1 h-10" />
          </div>
          <div className="w-2/3">
            <Label htmlFor="mobile_number" className="text-purple-300">Mobile</Label>
            <Input id="mobile_number" inputMode="numeric" pattern="[0-9]*" type="tel"
              className="bg-slate-800/50 border-purple-500/30 mt-1 h-10"
              value={formData.mobile_number}
              onChange={(e) => setFormData({ ...formData, mobile_number: (e.target.value || '').replace(/\D/g, '') })}
              onBeforeInput={(e: any) => { if (e?.data && /\D/.test(e.data)) e.preventDefault(); }}
              onKeyDown={(e) => {
                if (e.ctrlKey || e.metaKey) return;
                const allowed = ['Backspace','Delete','ArrowLeft','ArrowRight','Tab','Home','End'];
                if (allowed.includes(e.key)) return;
                if (!/^[0-9]$/.test(e.key)) e.preventDefault();
              }}
              onPaste={(e) => {
                const text = (e.clipboardData?.getData('text') || '').replace(/\D/g, '');
                e.preventDefault();
                setFormData((prev) => ({ ...prev, mobile_number: String(prev.mobile_number || '').concat(text).slice(0, 15) }));
              }}
              onDrop={(e) => e.preventDefault()}
              maxLength={15}
            />
          </div>
        </div>
      </div>

      {/* Password fields - only show when creating new admin */}
      {!adminToEdit && (
        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-purple-500/30">
          <div>
            <Label htmlFor="password" className="text-purple-300">Password *</Label>
            <Input
              id="password"
              type="password"
              className="bg-slate-800/50 border-purple-500/30 mt-1"
              value={formData.password || ''}
              onChange={(e) => {
                setFormData({ ...formData, password: e.target.value });
                setPasswordError('');
              }}
              placeholder="Min. 8 characters"
            />
            <p className="text-xs text-purple-300 mt-1">Must contain: letter, number, special character</p>
          </div>
          <div>
            <Label htmlFor="confirmPassword" className="text-purple-300">Confirm Password *</Label>
            <Input
              id="confirmPassword"
              type="password"
              className="bg-slate-800/50 border-purple-500/30 mt-1"
              value={formData.confirmPassword || ''}
              onChange={(e) => {
                setFormData({ ...formData, confirmPassword: e.target.value });
                setPasswordError('');
              }}
              placeholder="Re-enter password"
            />
            {passwordError && <p className="text-red-400 text-xs mt-1">{passwordError}</p>}
          </div>
        </div>
      )}

      <div className="flex items-center space-x-2">
        <Checkbox id="isRestricted" checked={formData.isRestricted} onCheckedChange={(checked) => setFormData({ ...formData, isRestricted: !!checked })} />
        <Label htmlFor="isRestricted">Restrict this admin</Label>
      </div>
      <div className="flex justify-end gap-4">
        {onClose && (
          <Button type="button" variant="outline" onClick={onClose} className="border-purple-500/30 text-purple-300">
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={mutation.isPending || (!adminToEdit && allowedRoles.length === 0)}>
          {mutation.isPending ? 'Saving...' : (adminToEdit ? 'Update Admin' : 'Create Admin')}
        </Button>
      </div>
    </form>
  );
};

const FormField = ({ label, id, ...props }: { label: string, id: string, [key: string]: any }) => (
  <div>
    <Label htmlFor={id} className="text-purple-300">{label}</Label>
    <Input id={id} className="bg-slate-800/50 border-purple-500/30 mt-1" {...props} />
  </div>
);

export default AdminManagement;

// Small labeled value helper used in the profile dialog
function Info({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-orange-50 border border-orange-200 rounded-md p-2">
      <div className="text-xs uppercase tracking-wide text-orange-600">{label}</div>
      <div className="text-sm text-slate-900 mt-0.5 break-words">{String(value)}</div>
    </div>
  );
}
