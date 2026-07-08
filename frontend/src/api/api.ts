// Centralized API service
// This creates a single axios instance so base URL, headers, and interceptors
// can be managed in one place instead of scattering http://localhost:8000 across files.

import axios, { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig, AxiosRequestConfig } from 'axios';
import { enhancedJwtAuth } from '../lib/enhancedJwtAuth';

// Types
interface RitualInstance {
    ritualId: string;
    ritualName: string;
    devoteeName: string;
    naal: string;
    dob: string;
    subscription: string;
    quantity: number;
}

export interface EmployeeBooking {
    _id: string;
    name: string;
    total_cost: number;
    instances: RitualInstance[];
    booked_by: string; // employee username
    timestamp: string;
}

export interface PublicBooking {
    _id: string;
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    total_cost: number;
    instances: RitualInstance[];
    booked_by?: string; // 'self' (default)
    timestamp: string;
}

export interface Booking {
    _id: string;
    name: string;
    email: string;
    phone: string;
    address: string;
    total_cost: number;
    instances: RitualInstance[];
}

// Resolve base URLs: Support split backend architecture
// Public API: User-facing content (bookings, events, gallery, etc.)
// Admin API: Administrative operations (admin, roles, activity, etc.)
// Vite exposes env vars prefixed with VITE_.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const viteEnv = (import.meta as any)?.env as { 
	VITE_PUBLIC_API_BASE_URL?: string;
	VITE_ADMIN_API_BASE_URL?: string;
	VITE_API_BASE_URL?: string;  // Legacy fallback
} | undefined;

const envPublicBase = viteEnv?.VITE_PUBLIC_API_BASE_URL;
const envAdminBase = viteEnv?.VITE_ADMIN_API_BASE_URL;
const envLegacyBase = viteEnv?.VITE_API_BASE_URL;

function derivePublicBaseURL(): string {
	if (envPublicBase && envPublicBase.trim()) return envPublicBase.replace(/\/$/, '');
	if (envLegacyBase && envLegacyBase.trim()) return envLegacyBase.replace(/\/$/, '');
	
	// Local development
	if (typeof window !== 'undefined') {
		const { protocol, hostname } = window.location;
		if (hostname === 'localhost' || hostname === '127.0.0.1') {
			return `${protocol}//${hostname}:8080`;
		}
	}
	
	// Production public API
	return 'https://temple-public-api.onrender.com';
}

function deriveAdminBaseURL(): string {
	if (envAdminBase && envAdminBase.trim()) return envAdminBase.replace(/\/$/, '');
	if (envLegacyBase && envLegacyBase.trim()) return envLegacyBase.replace(/\/$/, '');
	
	// Local development (same as public for now)
	if (typeof window !== 'undefined') {
		const { protocol, hostname } = window.location;
		if (hostname === 'localhost' || hostname === '127.0.0.1') {
			return `${protocol}//${hostname}:8081`;
		}
	}
	
	// Production admin API
	return 'https://temple-admin-api.onrender.com';
}

export const PUBLIC_API_BASE_URL = derivePublicBaseURL();
export const ADMIN_API_BASE_URL = deriveAdminBaseURL();

// Legacy export for backwards compatibility
export const API_BASE_URL = PUBLIC_API_BASE_URL;

// Create two axios instances - one for public API, one for admin API
const publicApi: AxiosInstance = axios.create({
	baseURL: `${PUBLIC_API_BASE_URL}/api`,
	withCredentials: false,
	headers: {
		'Content-Type': 'application/json',
	},
});

const adminApi: AxiosInstance = axios.create({
	baseURL: `${ADMIN_API_BASE_URL}/api`,
	withCredentials: false,
	headers: {
		'Content-Type': 'application/json',
	},
});

// Helper to determine which API instance to use based on path
function getApiInstance(url: string): AxiosInstance {
	// Admin endpoints that should use admin API
	const adminPaths = [
		'/admin',
		'/enhanced-admin',
		'/roles',
		'/profile',
		'/activity',
		'/stock',
		'/security',
		'/attendance',
		'/location',
		'/employee-bookings'
	];
	
	// Check if this is an admin endpoint
	const isAdminEndpoint = adminPaths.some(path => url.startsWith(path));
	
	return isAdminEndpoint ? adminApi : publicApi;
}

// Default to public API for backward compatibility
const api: AxiosInstance = publicApi;

// Token management helper - applies to both API instances
export const setAuthToken = (token: string | null) => {
	if (token) {
		publicApi.defaults.headers.common['Authorization'] = `Bearer ${token}`;
		adminApi.defaults.headers.common['Authorization'] = `Bearer ${token}`;
		localStorage.setItem('token', token);
	} else {
		delete publicApi.defaults.headers.common['Authorization'];
		delete adminApi.defaults.headers.common['Authorization'];
		localStorage.removeItem('token');
	}
};

// On initialization, if a token exists in localStorage set it.
const existing = (typeof window !== 'undefined') ? localStorage.getItem('token') : null;
if (existing) {
	setAuthToken(existing);
}

// Request interceptor to add JWT authentication - apply to both instances
const requestInterceptor = async (config: InternalAxiosRequestConfig) => {
	try {
		// Skip auth for authentication endpoints
		const authPaths = ['/api/auth/get-token', '/api/auth/login', '/api/auth/refresh-token'];
		const isAuthPath = authPaths.some(path => config.url?.includes(path));
		
		if (!isAuthPath) {
			// Get current access token (handles automatic refresh)
			const token = await enhancedJwtAuth.getAccessToken();
			if (token) {
				config.headers.set('Authorization', `Bearer ${token}`);
				
				// Add enhanced security headers
				const deviceFingerprint = enhancedJwtAuth.getDeviceFingerprint();
				const location = enhancedJwtAuth.getCurrentLocationData();
				
				if (deviceFingerprint) {
					config.headers.set('X-Device-Fingerprint', JSON.stringify(deviceFingerprint));
				}
				
				if (location) {
					config.headers.set('X-Client-Latitude', location.latitude.toString());
					config.headers.set('X-Client-Longitude', location.longitude.toString());
				}
			}
		}
	} catch (error) {
		console.error('Failed to set JWT token:', error);
	}
	
	return config;
};

const requestErrorInterceptor = (error: any) => Promise.reject(error);

// Apply interceptors to both API instances
publicApi.interceptors.request.use(requestInterceptor, requestErrorInterceptor);
adminApi.interceptors.request.use(requestInterceptor, requestErrorInterceptor);

// Response interceptor for global error handling (401, etc.) - apply to both instances
const responseInterceptor = (response: AxiosResponse) => response;

const responseErrorInterceptor = async (error: any) => {
	if (error?.response?.status === 401) {
		// Token invalid or expired - clear authentication
		setAuthToken(null);
		
		// Check if the request was to a protected admin endpoint
		const isAdminEndpoint = error?.config?.url?.includes('/admin') || 
		                       error?.config?.url?.includes('/profile') ||
		                       error?.config?.url?.includes('/activity') ||
		                       error?.config?.url?.includes('/bookings') ||
		                       error?.config?.url?.includes('/employee-bookings');
		
		if (isAdminEndpoint) {
			// Clear the enhanced JWT auth session
			await enhancedJwtAuth.logout();
			
			// Redirect to login (if in browser context)
			if (typeof window !== 'undefined') {
				window.location.href = '/login';
			}
		}
	}
	return Promise.reject(error);
};

publicApi.interceptors.response.use(responseInterceptor, responseErrorInterceptor);
adminApi.interceptors.response.use(responseInterceptor, responseErrorInterceptor);

// Helper typed wrappers - automatically route to correct API
export const get = <T = unknown>(url: string, config?: AxiosRequestConfig) => {
	const apiInstance = getApiInstance(url);
	return apiInstance.get<T>(url, config).then(r => r.data);
};

export const post = <T = unknown, B = unknown>(url: string, body?: B, config?: AxiosRequestConfig) => {
	const apiInstance = getApiInstance(url);
	return apiInstance.post<T>(url, body, config).then(r => r.data);
};

export const put = <T = unknown, B = unknown>(url: string, body?: B, config?: AxiosRequestConfig) => {
	const apiInstance = getApiInstance(url);
	return apiInstance.put<T>(url, body, config).then(r => r.data);
};

export const patch = <T = unknown, B = unknown>(url: string, body?: B, config?: AxiosRequestConfig) => {
	const apiInstance = getApiInstance(url);
	return apiInstance.patch<T>(url, body, config).then(r => r.data);
};

export const del = <T = unknown>(url: string, config?: AxiosRequestConfig) => {
	const apiInstance = getApiInstance(url);
	return apiInstance.delete<T>(url, config).then(r => r.data);
};

// Export both API instances for direct use if needed
export { publicApi, adminApi };

export default api;

// API functions
export const fetchBookings = (): Promise<Booking[]> => get<Booking[]>('/bookings/');
export const fetchPublicBookings = (): Promise<PublicBooking[]> => get<PublicBooking[]>('/bookings/');
export const fetchEmployeeBookings = (): Promise<EmployeeBooking[]> => get<EmployeeBooking[]>('/employee-bookings/');

// Usage examples (remove or comment out in prod):
// import api from '@/api/api';
// const events = await api.get('/events/');
// const rituals = await get<Ritual[]>('/rituals/');
