import { SignedUploadPayload } from './cloudinary';

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export function validateFileUpload(file: File, config: SignedUploadPayload): ValidationResult {
  // Check file size
  if (file.size > config.max_file_bytes) {
    return {
      isValid: false,
      error: `File size exceeds ${(config.max_file_bytes / (1024 * 1024)).toFixed(1)} MB limit`,
    };
  }

  // Check file type
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !config.allowed_extensions.includes(extension)) {
    return {
      isValid: false,
      error: `Invalid file type. Allowed types: ${config.allowed_extensions.join(', ')}`,
    };
  }

  // Validate MIME type
  const allowedMimes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
  ];
  
  if (!allowedMimes.includes(file.type.toLowerCase())) {
    return {
      isValid: false,
      error: 'Invalid file type. Only images (JPEG, PNG, GIF, WebP) are allowed',
    };
  }

  return { isValid: true };
}

// Helper to create an abort controller with timeout
export function createUploadTimeout(timeoutMs: number = 30000): { 
  controller: AbortController; 
  clear: () => void;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return {
    controller,
    clear: () => clearTimeout(timeoutId)
  };
}