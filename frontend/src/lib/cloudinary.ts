import { post } from '@/api/api'
import { validateFileUpload, createUploadTimeout } from './upload-validation'

export interface SignedUploadRequestPayload {
  filename: string
  content_type?: string
}

export interface SignedUploadPayload {
  upload_url: string
  api_key: string
  cloud_name: string
  signature: string
  timestamp: number
  public_id: string
  object_path: string
  asset_url: string
  secure_url: string
  expires_at: number
  resource_type: string
  params: Record<string, string>
  allowed_extensions: string[]
  max_file_bytes: number
}

export interface CloudinaryUploadResult {
  asset_id: string
  public_id: string
  secure_url: string
  bytes: number
  format: string
  version: number | string
  [key: string]: unknown
}

/**
 * Requests a signed URL from the backend for a direct-to-Cloudinary upload.
 * @param endpoint The API endpoint to request the signed URL from.
 * @param file The file object that will be uploaded.
 * @returns A promise that resolves to the signed upload payload.
 */
export const requestSignedUpload = async (
  endpoint: string,
  file: File
): Promise<SignedUploadPayload> => {
  const payload: SignedUploadRequestPayload = {
    filename: file.name,
  }

  if (file.type) {
    payload.content_type = file.type
  }

  return post<SignedUploadPayload, SignedUploadRequestPayload>(endpoint, payload)
}

/**
 * Uploads a file directly to Cloudinary using a signed payload.
 * @param signed The signed payload received from the backend.
 * @param file The file to upload.
 * @returns A promise that resolves to the Cloudinary upload result.
 */
export const uploadFileToCloudinary = async (
  signed: SignedUploadPayload,
  file: File
): Promise<CloudinaryUploadResult> => {
  // Validate file properties against the signed payload rules before upload.
  const validation = validateFileUpload(file, signed)
  if (!validation.isValid) {
    throw new Error(validation.error)
  }

  // Verify that the signature has not expired.
  const now = Math.floor(Date.now() / 1000)
  if (now >= signed.expires_at) {
    throw new Error('Upload signature has expired. Please request a new upload URL.')
  }

  const formData = new FormData()
  formData.append('file', file)
  formData.append('api_key', signed.api_key)
  formData.append('signature', signed.signature)

  // Append all additional required parameters from the signed payload.
  Object.entries(signed.params).forEach(([key, value]) => {
    formData.append(key, value)
  })

  // Set up a timeout for the upload request to prevent it from hanging indefinitely.
  const { controller, clear } = createUploadTimeout()

  try {
    const response = await fetch(signed.upload_url, {
      method: 'POST',
      signal: controller.signal,
      body: formData,
    })

    const data = await response.json()

    if (!response.ok) {
      const errorMessage = data?.error?.message || data?.message || 'Cloudinary upload failed'
      throw new Error(errorMessage)
    }

    if (data?.public_id !== signed.public_id) {
      throw new Error('Cloudinary public_id mismatch')
    }

    return data as CloudinaryUploadResult
  } catch (error) {
    // Re-throw the original error to be handled by the caller.
    if (error instanceof Error) {
      throw error
    }
    // Throw a generic error if the caught object is not an Error instance.
    throw new Error('Upload failed')
  } finally {
    // Ensure the upload timeout is cleared regardless of success or failure.
    clear()
  }
}