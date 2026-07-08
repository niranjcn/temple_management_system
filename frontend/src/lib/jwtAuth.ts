// JWT Authentication Service for Frontend
// Handles secure token management without exposing secret keys

import { authEventBus } from './authEvents';

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

interface UserInfo {
  sub: string;
  user_id?: string;
  role?: string;
  role_id?: number;
  permissions?: string[];
}

class JWTAuthService {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor() {
    // Initialize token from session storage (not localStorage for security)
    this.loadTokenFromSession();
  }

  /**
   * Get initial token from backend for app initialization
   */
  async getInitialToken(): Promise<boolean> {
    try {
      const response = await fetch(`${this.getApiBaseUrl()}/api/auth/get-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies for refresh token
      });

      if (!response.ok) {
        throw new Error('Failed to get initial token');
      }

      const tokenData: TokenResponse = await response.json();
      this.setTokens(tokenData);
      return true;
    } catch (error) {
      console.error('Failed to get initial token:', error);
      return false;
    }
  }

  /**
   * Login with username and password
   */
  async login(username: string, password: string): Promise<boolean> {
    // Deprecated: password login disabled on server
    throw new Error('Password login disabled. Use Google Sign-In.');
  }

  /**
   * Send OTP to mobile number
   */
  async sendOTP(mobileNumber: string): Promise<{ message: string; mobile_number: string; expires_in: number }> {
    const response = await fetch(`${this.getApiBaseUrl()}/api/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ mobile_number: mobileNumber }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Failed to send OTP' }));
      throw new Error(errorData.detail || 'Failed to send OTP');
    }
    return await response.json();
  }

  /**
   * Verify OTP and login
   */
  async verifyOTP(mobileNumber: string, otp: string): Promise<boolean> {
    const response = await fetch(`${this.getApiBaseUrl()}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ mobile_number: mobileNumber, otp: otp }),
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Invalid OTP' }));
      throw new Error(errorData.detail || 'Invalid OTP');
    }
    const tokenData: TokenResponse = await response.json();
    this.setTokens(tokenData);
    return true;
  }

  /**
   * Logout and clear tokens
   */
  async logout(): Promise<void> {
    try {
      // Call backend logout endpoint to clear refresh token cookie
      await fetch(`${this.getApiBaseUrl()}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout request failed:', error);
    } finally {
      this.clearTokens();
      
      // Disconnect from Google to allow login with same account
      this.disconnectFromGoogle();
      
      // Emit logout event
      authEventBus.emit('logout');
    }
  }

  /**
   * Disconnect from Google Sign-In to allow re-login with same account
   */
  private disconnectFromGoogle(): void {
    try {
      const w = window as any;
      if (w.google && w.google.accounts && w.google.accounts.id) {
        // Disconnect from Google
        w.google.accounts.id.disableAutoSelect();
        
        // Also try to revoke the authorization if available
        if (w.google.accounts.oauth2) {
          w.google.accounts.oauth2.revoke('', () => {
            console.log('Google authorization revoked');
          });
        }
      }
    } catch (error) {
      console.log('Google disconnect not available or failed:', error);
    }
  }

  /**
   * Get current access token (handles automatic refresh)
   */
  async getAccessToken(): Promise<string | null> {
    // Check if token is expired or expiring soon (within 1 minute)
    if (this.tokenExpiry && this.tokenExpiry.getTime() - Date.now() < 60000) {
      try {
        await this.refreshAccessToken();
      } catch (error) {
        // If refresh fails, token is invalid
        console.error('Token refresh failed:', error);
        return null;
      }
    }

    return this.accessToken;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.accessToken !== null && this.tokenExpiry !== null && this.tokenExpiry > new Date();
  }

  /**
   * Get current user information
   */
  async getCurrentUser(): Promise<UserInfo | null> {
    try {
      const token = await this.getAccessToken();
      if (!token) return null;

      const response = await fetch(`${this.getApiBaseUrl()}/api/auth/verify-token`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        credentials: 'include',
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Token expired or invalid
          this.clearTokens();
          authEventBus.emit('session-expired', { reason: 'token_verification_failed' });
        }
        return null;
      }

      const data = await response.json();
      return data.user;
    } catch (error) {
      console.error('Failed to get current user:', error);
      return null;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  private async refreshAccessToken(): Promise<void> {
    try {
      const response = await fetch(`${this.getApiBaseUrl()}/api/auth/refresh-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Send refresh token cookie
      });

      if (!response.ok) {
        // Refresh token is invalid, clear tokens and emit session expired event
        this.clearTokens();
        authEventBus.emit('session-expired', { reason: 'refresh_token_expired' });
        throw new Error('Refresh token invalid');
      }

      const tokenData: TokenResponse = await response.json();
      this.setTokens(tokenData);
    } catch (error) {
      console.error('Token refresh failed:', error);
      this.clearTokens();
      authEventBus.emit('session-expired', { reason: 'token_refresh_failed' });
      throw error;
    }
  }

  /**
   * Set tokens and manage expiry
   */
  private setTokens(tokenData: TokenResponse): void {
    this.accessToken = tokenData.access_token;
    this.tokenExpiry = new Date(Date.now() + tokenData.expires_in * 1000);
    
    // Store in session storage (not localStorage for security)
    sessionStorage.setItem('access_token', this.accessToken);
    sessionStorage.setItem('token_expiry', this.tokenExpiry.toISOString());

    // Set up automatic refresh timer (refresh 1 minute before expiry)
    this.setRefreshTimer(tokenData.expires_in - 60);
  }

  /**
   * Clear all tokens
   */
  private clearTokens(): void {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
    
    // Clear session storage
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('token_expiry');

    // Clear refresh timer
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Load token from session storage on init
   */
  private loadTokenFromSession(): void {
    const token = sessionStorage.getItem('access_token');
    const expiry = sessionStorage.getItem('token_expiry');

    if (token && expiry) {
      const expiryDate = new Date(expiry);
      if (expiryDate > new Date()) {
        this.accessToken = token;
        this.tokenExpiry = expiryDate;
        
        // Set refresh timer
        const secondsUntilRefresh = Math.max(0, (expiryDate.getTime() - Date.now()) / 1000 - 60);
        this.setRefreshTimer(secondsUntilRefresh);
      } else {
        // Token expired, clear it
        this.clearTokens();
      }
    }
  }

  /**
   * Set timer for automatic token refresh
   */
  private setRefreshTimer(seconds: number): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    if (seconds > 0) {
      this.refreshTimer = setTimeout(() => {
        this.refreshAccessToken().catch(error => {
          console.error('Automatic token refresh failed:', error);
        });
      }, seconds * 1000);
    }
  }

  /**
   * Get API base URL from environment
   */
  private getApiBaseUrl(): string {
    // Use the environment variable, fallback to a default for local dev
    // return import.meta.env.VITE_API_BASE_URL || 'https://temple-management-system-3p4x.onrender.com';
    return import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
  }
}

// Export singleton instance
export const jwtAuth = new JWTAuthService();
export default jwtAuth;