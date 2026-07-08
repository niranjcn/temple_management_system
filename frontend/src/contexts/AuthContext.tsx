import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { enhancedJwtAuth } from '../lib/enhancedJwtAuth';
import { authEventBus } from '../lib/authEvents';
import { toast } from 'sonner';

type AuthUser = { _id?: string; username: string; role_id?: number; role?: string } | null;
type AuthContextType = {
  user: AuthUser;
  isAuthenticated: boolean;
  loading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  loginWithGoogle: (idToken: string) => Promise<boolean>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState<AuthUser>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const init = async () => {
      try {
        // Initialize enhanced security features
        await enhancedJwtAuth.initializeSecurityFeatures();
        
        // Check if user is already authenticated
        if (enhancedJwtAuth.isAuthenticated()) {
          const currentUser = await enhancedJwtAuth.getCurrentUser();
          if (currentUser) {
            setIsAuthenticated(true);
            setUser({ 
              username: currentUser.sub, 
              role_id: currentUser.role_id, 
              role: currentUser.role, 
              _id: currentUser.user_id 
            });
          } else {
            // Token exists but user verification failed - clear session
            setIsAuthenticated(false);
            setUser(null);
          }
        } else {
          // Not authenticated - don't get initial token
          // Public routes work without token, admin routes require authentication
          setIsAuthenticated(false);
          setUser(null);
        }
      } catch (error) {
        console.error('Auth initialization failed:', error);
        setIsAuthenticated(false);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    void init();

    // Listen for session expiration events
    const handleSessionExpired = (data: any) => {
      setIsAuthenticated(false);
      setUser(null);
      toast.error('Your session has expired. Please login again.');
      navigate('/login');
    };

    const handleLogout = () => {
      setIsAuthenticated(false);
      setUser(null);
    };

    authEventBus.on('session-expired', handleSessionExpired);
    authEventBus.on('logout', handleLogout);

    return () => {
      authEventBus.off('session-expired', handleSessionExpired);
      authEventBus.off('logout', handleLogout);
    };
  }, [navigate]);

  const login = async (username: string, password: string) => {
    try {
      const success = await enhancedJwtAuth.login(username, password);
      if (!success) {
        return false;
      }

      const currentUser = await enhancedJwtAuth.getCurrentUser();
      if (currentUser) {
        finishLoginWithUser(currentUser);
        return true;
      }

      throw new Error('Unable to retrieve user profile after login');
    } catch (error) {
      console.error('Login failed:', error);
      throw error;
    }
  };

  const finishLoginWithUser = (currentUser: any) => {
    setIsAuthenticated(true);
    setUser({ 
      username: currentUser.sub, 
      role_id: currentUser.role_id, 
      role: currentUser.role, 
      _id: currentUser.user_id 
    });
    const rid = Number(currentUser.role_id ?? 99);
    if (rid === 3) {
      navigate('/admin/events');
    } else if (rid === 4) {
      navigate('/admin/bookings');
    } else {
      navigate('/admin');
    }
  };

  const loginWithGoogle = async (idToken: string) => {
    console.error('Google login disabled');
    return false;
  };

  const logout = async () => {
    try {
      await enhancedJwtAuth.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setIsAuthenticated(false);
      setUser(null);
      navigate('/login');
    }
  };

  const authContextValue = {
    user,
    isAuthenticated,
    loading,
    login,
    loginWithGoogle,
    logout,
  };

  return (
    <AuthContext.Provider value={authContextValue}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};

