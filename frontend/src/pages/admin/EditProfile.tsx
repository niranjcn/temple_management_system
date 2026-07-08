import React, { useState, useEffect, useRef } from 'react';
import { Upload, User, Phone, Save, X, Loader2, Pencil, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { get, put, post, API_BASE_URL } from '../../api/api';
import { UserProfile } from '../../components/Profile'; // Corrected relative import path
import { toast } from 'sonner';
import { requestSignedUpload, uploadFileToCloudinary } from '../../lib/cloudinary';

// This interface matches the ProfileUpdate Pydantic model from your FastAPI backend
export interface ProfileUpdatePayload {
  name?: string;
  mobile_number?: number;
  mobile_prefix?: string;
  email?: string;
  profile_picture?: string;
  dob?: string;
}

const EditProfile: React.FC = () => {
  const [formData, setFormData] = useState({ name: '', email: '', mobile_prefix: '+91', mobile_number: '', dob: '' });
  const [savedProfile, setSavedProfile] = useState<UserProfile | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState('');
  const [lastProfileUpdate, setLastProfileUpdate] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  
  const navigate = useNavigate();

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setInitialLoading(true);
        const userData = await get<UserProfile>('/profile/me');
        setFormData({
          name: userData.name,
          email: userData.email,
          mobile_prefix: userData.mobile_prefix || '+91',
          mobile_number: String(userData.mobile_number ?? ''),
          dob: (userData as any)?.dob || '',
        });
        setRole(userData.role);
        // cache last_profile_update locally to avoid repeated API calls on every click
        setLastProfileUpdate((userData as any)?.last_profile_update || null);
        const pic = userData.profile_picture || null;
        setImagePreview(pic ? (pic.startsWith('/static') || pic.startsWith('/api/') ? `${API_BASE_URL}${pic}` : pic) : null);
        setSavedProfile(userData);
      } catch (err) {
        console.error("Failed to fetch user data:", err);
        setError("Could not load your profile data. Please try again later.");
      } finally {
        setInitialLoading(false);
      }
    };
    fetchInitialData();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const maxBytes = 2 * 1024 * 1024;
      if (file.size > maxBytes) {
        setError('File too large. Max 2 MB allowed.');
        return;
      }
      if (!file.type.startsWith('image/')) {
        setError('Unsupported file type. Please upload an image.');
        return;
      }
      setError(null);
      setSelectedFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const preCheckAndOpenPicker = () => {
    if (lastProfileUpdate) {
      const lastDt = new Date(lastProfileUpdate);
      const nextAllowed = new Date(lastDt.getTime() + 60 * 24 * 60 * 60 * 1000);
      const now = new Date();
      if (now < nextAllowed) {
        const ms = nextAllowed.getTime() - now.getTime();
        const days = Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
        const hours = Math.max(0, Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)));
        toast.error(`60-day cooldown active. You can change your profile picture on ${nextAllowed.toLocaleString()} (in ${days} day(s) ${hours} hour(s)).`);
        return;
      }
    }
    fileInputRef.current?.click();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    const payload: ProfileUpdatePayload = {
      name: formData.name,
      email: formData.email,
      mobile_prefix: formData.mobile_prefix,
      mobile_number: parseInt(formData.mobile_number, 10),
      dob: formData.dob || undefined,
    };

    if (isNaN(payload.mobile_number!)) {
      setError('Phone number must be a valid number.');
      setIsSaving(false);
      return;
    }

    if (selectedFile) {
      try {
        const signed = await requestSignedUpload('/profile/me/get_signed_upload', selectedFile);

        if (selectedFile.size > signed.max_file_bytes) {
          throw new Error('Selected image exceeds the 2 MB limit.');
        }

        const cloudinaryResult = await uploadFileToCloudinary(signed, selectedFile);

        const finalizePayload = {
          object_path: signed.object_path,
          public_id: cloudinaryResult.public_id,
          secure_url: cloudinaryResult.secure_url,
          format: cloudinaryResult.format,
          bytes: cloudinaryResult.bytes,
          version: cloudinaryResult.version ? String(cloudinaryResult.version) : undefined,
        };

        const updated = await post<UserProfile, typeof finalizePayload>('/profile/me/finalize_upload', finalizePayload);
        const pic = updated?.profile_picture || null;
        setImagePreview(pic ? (String(pic).startsWith('/static') || String(pic).startsWith('/api/') ? `${API_BASE_URL}${pic}` : pic) : null);
        setSavedProfile(updated);
        setLastProfileUpdate((updated as any)?.last_profile_update || null);
      } catch (uploadErr: any) {
        console.error('Failed to upload profile picture:', uploadErr);
        const detail = uploadErr?.response?.data?.detail || uploadErr?.message || 'Upload failed';
        if (typeof detail === 'object' && detail?.next_allowed) {
          const na = new Date(detail.next_allowed);
          const now = new Date();
          const ms = na.getTime() - now.getTime();
          const days = Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
          const hours = Math.max(0, Math.floor((ms % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000)));
          toast.error(`60-day cooldown active. You can change your profile picture on ${na.toLocaleString()} (in ${days} day(s) ${hours} hour(s)).`);
        } else {
          toast.error(typeof detail === 'string' ? detail : 'Failed to upload profile picture.');
          if (typeof detail === 'string') {
            setError(detail);
          }
        }
        setIsSaving(false);
        return;
      }
    }

    try {
      const updatedProfile = await put<UserProfile, ProfileUpdatePayload>('/profile/me', payload);
      toast.success('Profile updated successfully!');
      if (updatedProfile) {
        setSavedProfile(updatedProfile);
        const pic = updatedProfile.profile_picture || null;
        setImagePreview(pic ? (String(pic).startsWith('/static') || String(pic).startsWith('/api/') ? `${API_BASE_URL}${pic}` : String(pic)) : imagePreview);
      }
      setSelectedFile(null);
      setIsEditing(false);
    } catch (err) {
      console.error('Failed to update profile:', err);
      setError('Failed to save changes. Please check your input and try again. If uploading a new photo, ensure it\'s an image under 2 MB and you haven\'t changed it in the last 60 days.');
    } finally {
      setIsSaving(false);
    }
  };

  if (initialLoading) {
    return (
      <div className="flex justify-center items-center h-screen bg-orange-50">
        <Loader2 className="w-12 h-12 text-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-orange-50 min-h-screen p-4 sm:p-6 lg:p-8 flex items-center justify-center">
      <div className="bg-white rounded-2xl p-8 w-full max-w-4xl border border-orange-200 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
            <div className="flex items-center gap-4">
                 <button 
                    onClick={() => navigate(-1)} 
                    className="text-orange-600 hover:text-orange-800 transition-colors p-2 rounded-full hover:bg-orange-100"
                    aria-label="Go back"
                >
                    <ArrowLeft className="w-6 h-6" />
                </button>
                <h1 className="text-3xl font-bold text-orange-600">Profile</h1>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsEditing((v) => {
                  const next = !v;
                  if (!next && savedProfile) {
                    setFormData({
                      name: savedProfile.name,
                      email: savedProfile.email,
                      mobile_prefix: savedProfile.mobile_prefix || '+91',
                      mobile_number: String(savedProfile.mobile_number ?? ''),
                      dob: (savedProfile as any)?.dob || '',
                    });
                    setSelectedFile(null);
                    const pic = savedProfile.profile_picture || null;
                    setImagePreview(pic ? (pic.startsWith('/static') || pic.startsWith('/api/') ? `${API_BASE_URL}${pic}` : pic) : null);
                  }
                  return next;
                });
              }}
              className="flex items-center gap-2 bg-orange-600 text-white py-2.5 px-6 rounded-full font-semibold shadow-md hover:bg-orange-700 transition-all duration-300 shrink-0 w-full sm:w-auto self-start sm:self-auto"
            >
              <Pencil className="w-4 h-4" />
              {isEditing ? 'Stop Editing' : 'Edit Profile'}
            </button>
        </div>
        
        {error && (
          <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-md mb-6 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Profile Picture Section */}
          <div className="md:col-span-1 flex flex-col items-center">
            <div className="relative group w-40 h-40">
              <img
                src={imagePreview || 'https://placehold.co/160x160/f3f4f6/666?text=?'}
                alt="Profile Preview"
                className="w-full h-full rounded-full object-cover border-4 border-orange-200 bg-neutral-100"
              />
              <button
                type="button"
                onClick={preCheckAndOpenPicker}
                aria-label="Upload profile picture"
                className={`absolute inset-0 bg-black/60 rounded-full flex items-center justify-center text-white transition-opacity ${isEditing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} cursor-pointer`}
                disabled={!isEditing}
              >
                <Upload className="w-7 h-7" />
              </button>
            </div>
            <input ref={fileInputRef} type="file" id="profile-upload" className="hidden" accept="image/*" onChange={handleImageChange} />
            <p className="mt-4 text-center text-neutral-500 text-xs leading-relaxed">
              JPG / PNG / GIF / WEBP &lt; 2 MB.
              <br />Profile picture can be changed every 30 days.
            </p>
          </div>

          {/* User Details Form */}
          <div className="md:col-span-2 space-y-6">
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-orange-500" />
              <div className="text-sm font-semibold text-orange-700 mb-1">Name</div>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                className={`w-full bg-white border border-orange-300 rounded-full py-3 pl-12 pr-4 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all ${!isEditing ? 'opacity-70' : ''}`}
                disabled={!isEditing}
                placeholder="Full Name"
              />
            </div>
            {/* DOB */}
            <div>
              <div className="text-sm font-semibold text-orange-700 mb-1">Date of Birth</div>
              <input
                type="date"
                name="dob"
                value={formData.dob}
                onChange={handleInputChange}
                className={`w-full bg-white border border-orange-300 rounded-full py-3 px-4 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all ${!isEditing ? 'opacity-70' : ''}`}
                disabled={!isEditing}
              />
            </div>

            {/* Notification Email */}
            <div>
              <div className="text-sm font-semibold text-orange-700 mb-1">Notification Email</div>
              <input 
                type="email" 
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                className={`w-full bg-white border border-orange-300 rounded-full py-3 px-4 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all ${!isEditing ? 'opacity-70' : ''}`}
                disabled={!isEditing}
                placeholder="Notification Email"
              />
            </div>

            {/* Phone split */}
            <div>
              <div className="text-sm font-semibold text-orange-700 mb-1">Mobile Number</div>
              <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 ${!isEditing ? 'opacity-70 pointer-events-none select-none' : ''}`}>
                <div className="relative sm:col-span-1">
                  <input
                    type="text"
                    name="mobile_prefix"
                    value={formData.mobile_prefix}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/[^0-9]/g, '');
                      setFormData(prev => ({ ...prev, mobile_prefix: '+' + digits }));
                    }}
                    onBeforeInput={(e: any) => { if (e?.data && /\D/.test(e.data)) e.preventDefault(); }}
                    onPaste={(e) => {
                      const text = (e.clipboardData?.getData('text') || '').replace(/\D/g, '');
                      e.preventDefault();
                      setFormData(prev => ({ ...prev, mobile_prefix: '+' + text }));
                    }}
                    onDrop={(e) => e.preventDefault()}
                    placeholder="+91"
                    className={`w-full bg-white border border-orange-300 rounded-full py-3 px-4 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all ${!isEditing ? 'opacity-70' : ''}`}
                    disabled={!isEditing}
                  />
                </div>
                <div className="relative sm:col-span-2">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-orange-500" />
                  <input
                    type="tel"
                    name="mobile_number"
                    value={formData.mobile_number}
                    onChange={(e) => setFormData(prev => ({ ...prev, mobile_number: (e.target.value || '').replace(/\D/g, '') }))}
                    inputMode="numeric"
                    pattern="[0-9]*"
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
                      setFormData(prev => ({ ...prev, mobile_number: String(prev.mobile_number || '').concat(text).slice(0, 15) }));
                    }}
                    onDrop={(e) => e.preventDefault()}
                    maxLength={15}
                    className={`w-full bg-white border border-orange-300 rounded-full py-3 pl-12 pr-4 text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all`}
                    placeholder="Phone Number"
                    disabled={!isEditing}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 bg-orange-50 border border-orange-200 rounded-full p-4">
              <span className="text-sm font-semibold uppercase tracking-wider text-orange-700">Role:</span>
              <span className="text-slate-900 font-medium">{role}</span>
            </div>
            
            <div className="flex flex-wrap justify-end items-center gap-4 pt-4">
              <button
                type="submit"
                className="flex items-center justify-center gap-2 w-full sm:w-40 bg-orange-600 text-white py-2.5 px-6 rounded-full font-semibold shadow-md hover:bg-orange-700 transition-all duration-300 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isSaving || !isEditing}
              >
                {isSaving ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditProfile;
