import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { get, post, put } from '../../api/api';
import { useAuth } from '../../contexts/AuthContext';

interface LocationConfig {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  check_in_radius: number;
  outside_radius: number;
  address?: string;
  notes?: string;
  created_by: string;
  created_by_name?: string;
  updated_by: string;
  updated_by_name?: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
}

const LocationManagement: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [locationConfig, setLocationConfig] = useState<LocationConfig | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    latitude: '',
    longitude: '',
    check_in_radius: '100',
    outside_radius: '500',
    address: '',
    notes: '',
  });

  // Check if user is super admin
  useEffect(() => {
    if (user && user.role_id !== 0) {
      navigate('/admin');
    }
  }, [user, navigate]);

  // Fetch location configuration
  useEffect(() => {
    fetchLocationConfig();
  }, []);

  const fetchLocationConfig = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await get<LocationConfig>('/location/config');

      setLocationConfig(response);
      setFormData({
        name: response.name,
        latitude: response.latitude.toString(),
        longitude: response.longitude.toString(),
        check_in_radius: response.check_in_radius.toString(),
        outside_radius: response.outside_radius.toString(),
        address: response.address || '',
        notes: response.notes || '',
      });
    } catch (err: any) {
      if (err.response?.status === 404) {
        // No location configured yet
        setLocationConfig(null);
        setIsEditing(true);
      } else {
        setError(err.response?.data?.detail || 'Failed to fetch location configuration');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const validateForm = (): boolean => {
    const lat = parseFloat(formData.latitude);
    const lon = parseFloat(formData.longitude);
    const checkInRadius = parseFloat(formData.check_in_radius);
    const outsideRadius = parseFloat(formData.outside_radius);

    if (!formData.name.trim()) {
      setError('Location name is required');
      return false;
    }

    if (isNaN(lat) || lat < -90 || lat > 90) {
      setError('Latitude must be between -90 and 90');
      return false;
    }

    if (isNaN(lon) || lon < -180 || lon > 180) {
      setError('Longitude must be between -180 and 180');
      return false;
    }

    if (isNaN(checkInRadius) || checkInRadius < 10 || checkInRadius > 1000) {
      setError('Check-in radius must be between 10 and 1000 meters');
      return false;
    }

    if (isNaN(outsideRadius) || outsideRadius < 100 || outsideRadius > 5000) {
      setError('Outside radius must be between 100 and 5000 meters');
      return false;
    }

    if (outsideRadius <= checkInRadius) {
      setError('Outside radius must be greater than check-in radius');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const payload = {
        name: formData.name,
        latitude: parseFloat(formData.latitude),
        longitude: parseFloat(formData.longitude),
        check_in_radius: parseFloat(formData.check_in_radius),
        outside_radius: parseFloat(formData.outside_radius),
        address: formData.address || undefined,
        notes: formData.notes || undefined,
      };

      if (locationConfig) {
        // Update existing location
        await put('/location/config', payload);
        setSuccess('Location configuration updated successfully');
      } else {
        // Create new location
        await post('/location/config', payload);
        setSuccess('Location configuration created successfully');
      }

      setIsEditing(false);
      await fetchLocationConfig();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save location configuration');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (locationConfig) {
      setFormData({
        name: locationConfig.name,
        latitude: locationConfig.latitude.toString(),
        longitude: locationConfig.longitude.toString(),
        check_in_radius: locationConfig.check_in_radius.toString(),
        outside_radius: locationConfig.outside_radius.toString(),
        address: locationConfig.address || '',
        notes: locationConfig.notes || '',
      });
      setIsEditing(false);
    }
    setError(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading location configuration...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Location Management</h1>
        <p className="text-gray-600">
          Configure the temple location for GPS-based attendance tracking.
          Mobile apps will use this configuration to validate check-ins and check-outs.
        </p>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-6 bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-lg">
          {success}
        </div>
      )}

      <div className="bg-white rounded-lg shadow-md p-6">
        {!isEditing && locationConfig ? (
          // Display mode
          <div>
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-2xl font-semibold text-gray-800">{locationConfig.name}</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Last updated {new Date(locationConfig.updated_at).toLocaleDateString()} by{' '}
                  {locationConfig.updated_by_name}
                </p>
              </div>
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors"
              >
                Edit Configuration
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-1">Coordinates</h3>
                <p className="text-lg text-gray-800">
                  {locationConfig.latitude}, {locationConfig.longitude}
                </p>
                <a
                  href={`https://www.google.com/maps?q=${locationConfig.latitude},${locationConfig.longitude}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline"
                >
                  View on Google Maps →
                </a>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-1">Check-in Radius</h3>
                <p className="text-lg text-gray-800">{locationConfig.check_in_radius} meters</p>
                <p className="text-sm text-gray-500">Users must be within this range to check in/out</p>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-500 mb-1">Outside Zone Radius</h3>
                <p className="text-lg text-gray-800">{locationConfig.outside_radius} meters</p>
                <p className="text-sm text-gray-500">Beyond this range, user is considered "outside"</p>
              </div>

              {locationConfig.address && (
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-1">Address</h3>
                  <p className="text-lg text-gray-800">{locationConfig.address}</p>
                </div>
              )}

              {locationConfig.notes && (
                <div className="md:col-span-2">
                  <h3 className="text-sm font-medium text-gray-500 mb-1">Notes</h3>
                  <p className="text-gray-800">{locationConfig.notes}</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          // Edit/Create mode
          <form onSubmit={handleSubmit}>
            <h2 className="text-2xl font-semibold text-gray-800 mb-6">
              {locationConfig ? 'Edit' : 'Create'} Location Configuration
            </h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Location Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  placeholder="e.g., Main Temple"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Latitude * (-90 to 90)
                  </label>
                  <input
                    type="number"
                    step="any"
                    name="latitude"
                    value={formData.latitude}
                    onChange={handleInputChange}
                    placeholder="e.g., 10.8505"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Longitude * (-180 to 180)
                  </label>
                  <input
                    type="number"
                    step="any"
                    name="longitude"
                    value={formData.longitude}
                    onChange={handleInputChange}
                    placeholder="e.g., 76.2711"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Check-in Radius (meters) * (10-1000)
                  </label>
                  <input
                    type="number"
                    name="check_in_radius"
                    value={formData.check_in_radius}
                    onChange={handleInputChange}
                    min="10"
                    max="1000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Users must be within this range to check in/out
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Outside Zone Radius (meters) * (100-5000)
                  </label>
                  <input
                    type="number"
                    name="outside_radius"
                    value={formData.outside_radius}
                    onChange={handleInputChange}
                    min="100"
                    max="5000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Beyond this range, time is logged as "outside hours"
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Address (Optional)
                </label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  placeholder="Physical address of the location"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes (Optional)
                </label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleInputChange}
                  rows={3}
                  placeholder="Additional notes about this location"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              {locationConfig && (
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
                  disabled={saving}
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                className="px-6 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={saving}
              >
                {saving ? 'Saving...' : locationConfig ? 'Update Location' : 'Create Location'}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-semibold text-blue-900 mb-2">💡 How to get coordinates:</h3>
        <ol className="text-sm text-blue-800 space-y-1 ml-4 list-decimal">
          <li>Open Google Maps and find your temple location</li>
          <li>Right-click on the exact location and select "What's here?"</li>
          <li>Copy the coordinates shown at the bottom (format: latitude, longitude)</li>
          <li>Paste them into the form above</li>
        </ol>
      </div>
    </div>
  );
};

export default LocationManagement;
