import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, API_BASE_URL } from '@/api/api'; // Using alias-based import path
import { useAuth } from '@/contexts/AuthContext';

// This interface should match the AdminPublic Pydantic model from your FastAPI backend
export interface UserProfile {
  _id: string;
  name: string;
  email: string;
  username: string;
  role: string;
  mobile_number: number;
  mobile_prefix: string;
  profile_picture?: string;
}

const resolveProfileUrl = (p?: string | null, fallbackChar: string = 'U') => {
  const placeholder = `https://placehold.co/150x150/A78BFA/FFFFFF?text=${fallbackChar}`;
  if (!p) return placeholder;
  if (p.startsWith('/static') || p.startsWith('/api/')) return `${API_BASE_URL}${p}`;
  if (p.startsWith('http://') || p.startsWith('https://')) return p;
  return `${API_BASE_URL}${p.startsWith('/') ? p : '/' + p}`;
};

const Profile: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { logout } = useAuth();

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        // Using the 'get' helper directly from api.ts
        const profileData = await get<UserProfile>('/profile/me');
        setUser(profileData);
      } catch (err) {
        console.error("Failed to fetch profile:", err);
        setError("Could not load profile.");
      }
    };

    fetchProfile();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const handleEditClick = () => {
    // Open profile page (view mode with an Edit button)
    navigate('/admin/edit-profile');
    onClose();
  };

  const handleLogoutClick = () => {
    logout();
    navigate('/login');
    onClose();
  };

  if (error) {
    return (
      <div ref={profileRef} className="absolute top-full right-0 mt-4 w-72 rounded-xl bg-slate-900/90 p-6 z-50 text-center text-red-400">
        {error}
      </div>
    );
  }

  if (!user) {
    return (
      <div ref={profileRef} className="absolute top-full right-0 mt-4 w-72 rounded-xl bg-slate-900/90 p-6 z-50 text-center text-gray-400">
        Loading...
      </div>
    );
  }

  const imgSrc = resolveProfileUrl(user.profile_picture, user.name?.charAt(0) || 'U');

  return (
    <div
      ref={profileRef}
      className="absolute top-full right-0 mt-4 w-72 rounded-xl bg-slate-900/90 backdrop-blur-lg shadow-[0_0_25px_-5px_rgba(192,132,252,0.3)] border border-purple-800/50 p-6 z-50 origin-top-right"
    >
      <div className="flex flex-col items-center space-y-4">
        {/* Profile Picture */}
        <div className="p-1 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full transition-transform duration-300 hover:scale-105 cursor-pointer">
          <div className="w-24 h-24 rounded-full overflow-hidden bg-slate-800 p-1">
            <img
              src={imgSrc}
              alt="User Profile"
              className="w-full h-full object-cover rounded-full"
            />
          </div>
        </div>

        {/* User Details */}
        <div className="text-center">
          <h3 className="text-xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">{user.name}</h3>
          <p className="text-sm text-gray-400">{`${user.mobile_prefix} ${user.mobile_number}`}</p>
          <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-pink-300 bg-pink-500/20 rounded-full px-3 py-1 inline-block">
            {user.role}
          </p>
        </div>

        {/* Separator */}
        <hr className="w-full border-t border-purple-500/30 my-2" />

        {/* Open Profile Button */}
        <button
          onClick={handleEditClick}
          className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white py-2.5 px-4 rounded-full font-semibold shadow-md hover:from-purple-500 hover:to-pink-500 transition-all duration-300 transform hover:scale-105 hover:shadow-lg hover:shadow-pink-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-pink-500"
        >
          Open Profile
        </button>

        {/* Logout Button */}
        <button
          onClick={handleLogoutClick}
          className="w-full bg-gradient-to-r from-red-600 to-red-700 text-white py-2.5 px-4 rounded-full font-semibold shadow-md hover:from-red-500 hover:to-red-600 transition-all duration-300 transform hover:scale-105 hover:shadow-lg hover:shadow-red-500/40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-red-500"
        >
          Logout
        </button>
      </div>
    </div>
  );
};

export default Profile;

