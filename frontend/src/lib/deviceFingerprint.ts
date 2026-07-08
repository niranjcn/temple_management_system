/**
 * Generate a device fingerprint for rate limiting
 * This creates a semi-persistent identifier based on browser characteristics
 */

export function generateDeviceFingerprint(): string {
  // Check if we have a stored fingerprint
  const stored = localStorage.getItem('device_fingerprint');
  if (stored) {
    return stored;
  }

  // Generate a new fingerprint based on browser characteristics
  const components: string[] = [];

  // Navigator properties
  components.push(navigator.userAgent || '');
  components.push(navigator.language || '');
  components.push(String(navigator.hardwareConcurrency || 0));
  components.push(String((navigator as any).deviceMemory || 0));
  components.push(String(navigator.maxTouchPoints || 0));

  // Screen properties
  components.push(String(screen.width));
  components.push(String(screen.height));
  components.push(String(screen.colorDepth));
  components.push(String(screen.pixelDepth));

  // Timezone
  components.push(String(new Date().getTimezoneOffset()));

  // Platform
  components.push(navigator.platform || '');

  // Canvas fingerprint (simplified)
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillText('fingerprint', 2, 2);
      components.push(canvas.toDataURL().slice(0, 100));
    }
  } catch (e) {
    // Canvas access might be blocked
    components.push('no-canvas');
  }

  // Generate hash from components
  const fingerprint = simpleHash(components.join('|'));

  // Store for future use
  localStorage.setItem('device_fingerprint', fingerprint);

  return fingerprint;
}

/**
 * Simple hash function for generating fingerprint
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Clear device fingerprint (useful for testing)
 */
export function clearDeviceFingerprint(): void {
  localStorage.removeItem('device_fingerprint');
}
