// Enhanced JWT Authentication Service for Frontend
// Includes device fingerprinting, geolocation, and enhanced security

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

interface DeviceFingerprint {
  screen_width?: number;
  screen_height?: number;
  timezone?: string;
  language?: string;
  platform?: string;
  canvas_fingerprint?: string;
  webgl_fingerprint?: string;
  user_agent?: string;
}

interface GeolocationCoords {
  latitude: number;
  longitude: number;
}

class EnhancedJWTAuthService {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: Date | null = null;
  private refreshTimer: NodeJS.Timeout | null = null;
  private deviceFingerprint: DeviceFingerprint | null = null;
  private currentLocation: GeolocationCoords | null = null;
  private isUserAuthenticated: boolean = false; // Track if user is actually logged in

  constructor() {
    // Initialize token from session storage
    this.loadTokenFromSession();
    // Generate device fingerprint
    this.generateDeviceFingerprint();
    // Get geolocation if permitted
    this.getCurrentLocation();
  }

  /**
   * Initialize enhanced security features
   */
  async initializeSecurityFeatures(): Promise<void> {
    try {
      // Regenerate device fingerprint to ensure it's fresh
      await this.generateDeviceFingerprint();
      
      // Update geolocation
      this.getCurrentLocation();
      
      // Set up rate limit tracking
      this.setupRateLimitTracking();
      
      console.log('Enhanced security features initialized');
    } catch (error) {
      console.warn('Failed to initialize enhanced security features:', error);
    }
  }

  /**
   * Set up rate limit tracking for API calls
   */
  private setupRateLimitTracking(): void {
    // Track API call frequency to help with rate limiting
    const globalWindow = window as any;
    if (!globalWindow.apiCallTracker) {
      globalWindow.apiCallTracker = {
        calls: [],
        addCall: (endpoint: string) => {
          const now = Date.now();
          globalWindow.apiCallTracker.calls.push({ endpoint, timestamp: now });
          
          // Clean up old calls (older than 1 hour)
          const oneHourAgo = now - (60 * 60 * 1000);
          globalWindow.apiCallTracker.calls = globalWindow.apiCallTracker.calls.filter(
            (call: any) => call.timestamp > oneHourAgo
          );
        },
        getRecentCalls: (minutes: number = 1) => {
          const cutoff = Date.now() - (minutes * 60 * 1000);
          return globalWindow.apiCallTracker.calls.filter((call: any) => call.timestamp > cutoff);
        }
      };
    }
  }

  /**
   * Generate device fingerprint for enhanced security
   */
  private async generateDeviceFingerprint(): Promise<void> {
    try {
      const fingerprint: DeviceFingerprint = {
        screen_width: window.screen.width,
        screen_height: window.screen.height,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        language: navigator.language,
        platform: navigator.platform,
        user_agent: navigator.userAgent
      };

      // Canvas fingerprinting
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.textBaseline = 'top';
          ctx.font = '14px Arial';
          ctx.fillText('Device fingerprint canvas', 2, 2);
          fingerprint.canvas_fingerprint = canvas.toDataURL().slice(-50);
        }
      } catch (e) {
        console.warn('Canvas fingerprinting failed:', e);
      }

      // WebGL fingerprinting
      try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl') as WebGLRenderingContext;
        if (gl) {
          const renderer = gl.getParameter(gl.RENDERER);
          const vendor = gl.getParameter(gl.VENDOR);
          fingerprint.webgl_fingerprint = `${vendor}_${renderer}`.slice(-50);
        }
      } catch (e) {
        console.warn('WebGL fingerprinting failed:', e);
      }

      this.deviceFingerprint = fingerprint;
    } catch (error) {
      console.warn('Device fingerprinting failed:', error);
    }
  }

  /**
   * Get current geolocation
   */
  private getCurrentLocation(): void {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          this.currentLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          };
        },
        (error) => {
          console.warn('Geolocation failed:', error.message);
        },
        { timeout: 10000, enableHighAccuracy: false }
      );
    }
  }

  /**
   * Get enhanced headers for API requests
   */
  private getEnhancedHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Add device fingerprint
    if (this.deviceFingerprint) {
      headers['X-Device-Fingerprint'] = JSON.stringify(this.deviceFingerprint);
    }

    // Add geolocation
    if (this.currentLocation) {
      headers['X-Client-Latitude'] = this.currentLocation.latitude.toString();
      headers['X-Client-Longitude'] = this.currentLocation.longitude.toString();
    }

    return headers;
  }

  /**
   * Get initial token from backend for app initialization
   */
  async getInitialToken(): Promise<boolean> {
    try {
      const response = await fetch(`${this.getApiBaseUrl()}/api/auth/get-token`, {
        method: 'POST',
        headers: this.getEnhancedHeaders(),
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to get initial token');
      }

      const tokenData: TokenResponse = await response.json();
      this.setTokens(tokenData, false); // false = not authenticated user
      return true;
    } catch (error) {
      console.error('Failed to get initial token:', error);
      return false;
    }
  }

  /**
   * Authenticate using username and password.
   */
  async login(username: string, password: string): Promise<boolean> {
    const headers = this.getEnhancedHeaders();

    const response = await fetch(`${this.getApiBaseUrl()}/api/auth/login`, {
      method: 'POST',
      headers,
      credentials: 'include',
      body: JSON.stringify({
        username: username.trim(),
        password,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ detail: 'Login failed' }));
      throw new Error(errorData.detail || 'Login failed');
    }

    const tokenData: TokenResponse = await response.json();
    this.setTokens(tokenData, true);
    return true;
  }

  /**
   * Logout and clear tokens with enhanced cleanup
   */
  async logout(): Promise<void> {
    try {
  // Reuse the same fingerprint data used for rate limiting on the backend
      const { generateDeviceFingerprint } = await import('./deviceFingerprint');
      const deviceFingerprintId = generateDeviceFingerprint();
      
      // Call backend logout endpoint with device fingerprint
      await fetch(`${this.getApiBaseUrl()}/api/auth/logout`, {
        method: 'POST',
        headers: {
          ...this.getEnhancedHeaders(),
          'Authorization': `Bearer ${this.accessToken}`
        },
        credentials: 'include',
        body: JSON.stringify({
          device_fingerprint: deviceFingerprintId
        })
      });
    } catch (error) {
      console.error('Logout request failed:', error);
    } finally {
      this.clearTokens();
      
      // Clear device fingerprint and location
      this.deviceFingerprint = null;
      this.currentLocation = null;
      
      // Mark as not authenticated
      this.isUserAuthenticated = false;
      
      // Regenerate for next session
      this.generateDeviceFingerprint();
      this.getCurrentLocation();
      
      // Emit logout event
      authEventBus.emit('logout');
    }
  }

  /**
   * Get current access token with enhanced validation
   */
  async getAccessToken(): Promise<string | null> {
    // Check if token is expired or expiring soon (within 1 minute)
    if (this.tokenExpiry && this.tokenExpiry.getTime() - Date.now() < 60000) {
      try {
        await this.refreshAccessToken();
      } catch (error) {
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
    return this.isUserAuthenticated && 
           this.accessToken !== null && 
           this.tokenExpiry !== null && 
           this.tokenExpiry > new Date();
  }

  /**
   * Get current user information with enhanced verification
   */
  async getCurrentUser(): Promise<UserInfo | null> {
    try {
      const token = await this.getAccessToken();
      if (!token) return null;

      const response = await fetch(`${this.getApiBaseUrl()}/api/auth/verify-token`, {
        headers: {
          ...this.getEnhancedHeaders(),
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
   * Refresh access token with enhanced security
   */
  private async refreshAccessToken(): Promise<void> {
    try {
      const response = await fetch(`${this.getApiBaseUrl()}/api/auth/refresh-token`, {
        method: 'POST',
        headers: this.getEnhancedHeaders(),
        credentials: 'include',
      });

      if (!response.ok) {
        // Refresh token is invalid, clear tokens and emit session expired event
        this.clearTokens();
        this.isUserAuthenticated = false;
        authEventBus.emit('session-expired', { reason: 'refresh_token_expired' });
        throw new Error('Refresh token invalid');
      }

      const tokenData: TokenResponse = await response.json();
      this.setTokens(tokenData, this.isUserAuthenticated); // maintain current auth state
    } catch (error) {
      console.error('Token refresh failed:', error);
      this.clearTokens();
      this.isUserAuthenticated = false;
      authEventBus.emit('session-expired', { reason: 'token_refresh_failed' });
      throw error;
    }
  }

  /**
   * Set tokens and manage expiry
   */
  private setTokens(tokenData: TokenResponse, isAuthenticated: boolean = false): void {
    this.accessToken = tokenData.access_token;
    this.refreshToken = tokenData.refresh_token ?? null;
    this.tokenExpiry = new Date(Date.now() + tokenData.expires_in * 1000);
    this.isUserAuthenticated = isAuthenticated;
    
    // Store in session storage
    sessionStorage.setItem('access_token', this.accessToken);
    sessionStorage.setItem('token_expiry', this.tokenExpiry.toISOString());
    sessionStorage.setItem('is_authenticated', isAuthenticated.toString());

    // Set up automatic refresh timer (refresh 1 minute before expiry)
    this.setRefreshTimer(tokenData.expires_in - 60);
  }

  /**
   * Clear all tokens and related data
   */
  private clearTokens(): void {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
    this.isUserAuthenticated = false;
    
    // Clear session storage
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('token_expiry');
    sessionStorage.removeItem('is_authenticated');

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
    const isAuth = sessionStorage.getItem('is_authenticated');

    if (token && expiry) {
      const expiryDate = new Date(expiry);
      if (expiryDate > new Date()) {
        this.accessToken = token;
        this.tokenExpiry = expiryDate;
        this.isUserAuthenticated = isAuth === 'true';
        
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
    return import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';
  }

  /**
   * Get device fingerprint for external use
   */
  getDeviceFingerprint(): DeviceFingerprint | null {
    return this.deviceFingerprint;
  }

  /**
   * Get current location for external use
   */
  getCurrentLocationData(): GeolocationCoords | null {
    return this.currentLocation;
  }

  /**
   * Force refresh of device fingerprint and location
   */
  async refreshSecurityData(): Promise<void> {
    await this.generateDeviceFingerprint();
    this.getCurrentLocation();
  }
}

// Export singleton instance
export const enhancedJwtAuth = new EnhancedJWTAuthService();
export default enhancedJwtAuth;