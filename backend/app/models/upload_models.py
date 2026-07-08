from enum import Enum
from typing import Dict, Optional

from pydantic import BaseModel, Field, field_validator


class UploadTarget(str, Enum):
    PROFILE = "profile"
    EVENTS = "events"
    GALLERY = "gallery"
    COMMITTEE = "committee"


ALLOWED_IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "gif", "webp"}


class SignedUploadRequest(BaseModel):
    filename: str = Field(..., description="Original filename including extension")
    content_type: Optional[str] = Field(
        None,
        description="Optional MIME type provided by the browser. Used for validation hints only.",
    )

    @field_validator("filename")
    @classmethod
    def validate_filename(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Filename is required")
        if "." not in cleaned:
            raise ValueError("Filename must include an extension (e.g. image.jpg)")
        return cleaned


class SignedUploadResponse(BaseModel):
    upload_url: str = Field(..., description="Direct Cloudinary upload endpoint")
    api_key: str = Field(..., description="Cloudinary API key to use for the direct upload")
    cloud_name: str = Field(..., description="Cloudinary cloud name")
    signature: str = Field(..., description="HMAC signature authorising this upload")
    timestamp: int = Field(..., description="Unix timestamp used when generating the signature")
    public_id: str = Field(..., description="Fully qualified Cloudinary public ID (folder/object without extension)")
    object_path: str = Field(..., description="Relative object path within the mapped bucket including extension")
    asset_url: str = Field(..., description="Backend-served API route for the uploaded image")
    secure_url: str = Field(..., description="Predicted Cloudinary HTTPS URL for immediate previews")
    expires_at: int = Field(..., description="Timestamp indicating when the signature should be considered expired")
    resource_type: str = Field(..., description="Cloudinary resource type, e.g. 'image'")
    params: Dict[str, str] = Field(
        ..., description="Key/value pairs that must be sent alongside the file when uploading to Cloudinary"
    )
    allowed_extensions: tuple[str, ...] = Field(
        default=tuple(sorted(ALLOWED_IMAGE_EXTENSIONS)),
        description="Image extensions permitted for this upload",
    )
    max_file_bytes: int = Field(
        default=2 * 1024 * 1024,
        description="Suggested client-side max file size in bytes (mirrors backend validation)",
    )


class UploadFinalizeRequest(BaseModel):
    object_path: str = Field(..., description="Relative object path that was authorised for the upload")
    public_id: str = Field(..., description="Cloudinary public ID reported after upload")
    secure_url: Optional[str] = Field(None, description="Secure Cloudinary URL returned after upload")
    format: Optional[str] = Field(None, description="Image format reported by Cloudinary")
    bytes: Optional[int] = Field(None, description="Size of the uploaded asset in bytes")
    version: Optional[str] = Field(None, description="Cloudinary version identifier for the asset")
