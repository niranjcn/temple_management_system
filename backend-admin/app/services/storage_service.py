import os
import io
import time
from datetime import datetime
from typing import Dict, Optional, Tuple
from fastapi import HTTPException, UploadFile
from urllib.parse import quote, unquote, urlparse
from dotenv import load_dotenv
import requests
import cloudinary
from cloudinary.uploader import upload as cloudinary_upload, destroy as cloudinary_destroy
from cloudinary.utils import cloudinary_url, api_sign_request
from PIL import Image
import re
import cloudinary.api as cloudinary_api

# Load environment variables from a .env file
load_dotenv()


class CloudinaryStorageService:
    """Storage service implementation backed by Cloudinary."""

    # TTL Constants
    DEFAULT_SIGNED_URL_TTL = 3600  # 1 hour for viewing
    UPLOAD_SIGNATURE_TTL = 900     # 15 minutes for uploads
    TEMP_URL_TTL = 300            # 5 minutes for temporary access

    def __init__(self):
        self.cloudinary_url = os.getenv("CLOUDINARY_URL", "")

        # Bucket names are reused from existing env vars to avoid touching other parts of the app.
        self.bucket_name = os.getenv("CLOUDINARY_PROFILE_FOLDER")
        self.events_bucket = os.getenv("CLOUDINARY_EVENTS_FOLDER")
        self.gallery_bucket = os.getenv("CLOUDINARY_GALLERY_FOLDER")

        try:
            self.max_image_size_mb = max(1, int(os.getenv("MAX_IMAGE_SIZE_MB", "2")))
        except ValueError:
            self.max_image_size_mb = 2
        self.max_image_bytes = self.max_image_size_mb * 1024 * 1024
        self.allowed_extensions = {"jpg", "jpeg", "png", "gif", "webp"}

        # Optional public base URL to construct absolute URLs (e.g., http://localhost:8080)
        self.public_base = (os.getenv("PUBLIC_BASE_URL", "") or "").rstrip("/")

        self.enabled = bool(self.cloudinary_url)

        # Feature toggles / security knobs
        self.use_advanced_transforms = os.getenv("CLOUDINARY_USE_ADVANCED_TRANSFORMS", "true").lower() in {"1", "true", "yes"}
        self.default_view_ttl = int(os.getenv("CLOUDINARY_DEFAULT_VIEW_TTL", str(self.DEFAULT_SIGNED_URL_TTL)))
        self.max_view_ttl = int(os.getenv("CLOUDINARY_MAX_VIEW_TTL", "7200"))  # 2 hours cap by default
        # Additional allowed formats override (comma separated) if provided
        extra_formats = os.getenv("CLOUDINARY_ALLOWED_FORMATS")
        if extra_formats:
            for fmt in extra_formats.split(","):
                fmt_clean = fmt.strip().lower()
                if fmt_clean:
                    self.allowed_extensions.add(fmt_clean)

        if not self.enabled:
            print("Cloudinary storage disabled: CLOUDINARY_URL not configured")
        else:
            cloudinary.config(cloudinary_url=self.cloudinary_url, secure=True)
            print("Cloudinary storage service initialized successfully")

        # Route to bucket map used for parsing stored values
        self._route_bucket_map = {
            "profile": self.bucket_name,
            "events": self.events_bucket,
            "gallery": self.gallery_bucket,
            "committee": self.gallery_bucket,
        }

    def _ensure_enabled(self):
        """Check if Cloudinary storage is enabled and properly configured."""
        if not self.enabled:
            raise RuntimeError("Cloudinary storage is not enabled. Please configure CLOUDINARY_URL environment variable.")

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _publicize(self, path: str) -> str:
        """Used to prefix a path with the PUBLIC_BASE_URL if configured."""
        if not path:
            return path
        return f"{self.public_base}{path}" if self.public_base else path

    def get_public_url_for_bucket(self, bucket_name: str, object_path: str, route_key: Optional[str] = None) -> str:
        """Construct the public API route for a stored object."""
        if route_key == "committee" and bucket_name == self.gallery_bucket:
            base = "/api/committee/files/"
        elif bucket_name == self.events_bucket:
            base = "/api/events/files/"
        elif bucket_name == self.gallery_bucket:
            base = "/api/gallery/files/"
        elif bucket_name == self.bucket_name:
            base = "/api/profile/files/"
        else:
            base = f"/api/files/{bucket_name}/"
        return self._publicize(f"{base}{quote(object_path)}")

    def validate_image_file(self, file: UploadFile, content: bytes, max_size_mb: Optional[int] = None) -> str:
        """Validate image size and content type.

        If max_size_mb is provided, enforce that size limit.
        If max_size_mb is None, no size validation is performed.
        """
        # Enforce size limit only if specified
        if max_size_mb is not None:
            max_bytes = int(max_size_mb) * 1024 * 1024
            if len(content) > max_bytes:
                raise HTTPException(status_code=413, detail=f"File too large. Maximum size is {max_size_mb}MB")

        kind = self._get_image_format(content)
        allowed_types = {"jpeg", "png", "gif", "webp"}
        allowed_mimes = {"image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"}

        if (kind not in allowed_types) and (file.content_type not in allowed_mimes):
            raise HTTPException(
                status_code=400,
                detail="Invalid file type. Only images (JPEG, PNG, GIF, WebP) are allowed"
            )

        return kind or "jpeg"

    def generate_object_path(self, username: str, filename: str, image_type: str) -> str:
        """Generate a unique path for a user's file."""
        timestamp = datetime.utcnow().strftime("%Y-%m-%d_%H-%M-%S_%f")
        safe_filename = os.path.basename(filename or f"profile.{image_type}")
        if not safe_filename.lower().endswith((".jpg", ".jpeg", ".png", ".gif", ".webp")):
            safe_filename = f"{safe_filename}.{image_type}"
        # Sanitize filename to avoid spaces/special chars that can complicate signatures
        safe_filename = re.sub(r"[^A-Za-z0-9_.-]+", "-", safe_filename)
        return f"{username}/{timestamp}/{safe_filename}"

    def generate_generic_object_path(self, filename: str, image_type: Optional[str] = None, prefix: Optional[str] = None) -> str:
        """Generate a unique path for non-user specific uploads."""
        timestamp = datetime.utcnow().strftime("%Y-%m-%d_%H-%M-%S_%f")
        base_name = filename or (f"image.{image_type}" if image_type else "file")
        safe_filename = os.path.basename(base_name)
        if image_type and not safe_filename.lower().endswith((".jpg", ".jpeg", ".png", ".gif", ".webp")):
            safe_filename = f"{safe_filename}.{image_type}"
        # Sanitize filename
        safe_filename = re.sub(r"[^A-Za-z0-9_.-]+", "-", safe_filename)
        if prefix:
            return f"{prefix}/{timestamp}/{safe_filename}"
        return f"{timestamp}/{safe_filename}"

    def _build_public_id(self, bucket_name: str, object_path: str) -> str:
        """Construct the Cloudinary public ID from a bucket and object path."""
        combined = f"{bucket_name}/{object_path.lstrip('/')}" if bucket_name else object_path.lstrip("/")
        base, _ = os.path.splitext(combined)
        return base

    def build_public_id(self, bucket_name: str, object_path: str) -> str:
        """Public helper to derive the Cloudinary public ID for an object path."""
        return self._build_public_id(bucket_name, object_path)

    def _validate_extension(self, filename: str) -> str:
        """Used to validate the file extension for allowed image types."""
        _, ext = os.path.splitext(filename)
        clean = ext.lstrip(".").lower()
        if not clean:
            raise HTTPException(status_code=400, detail="Filename must include an image extension")
        if clean not in self.allowed_extensions:
            raise HTTPException(status_code=400, detail="Unsupported image type. Allowed: JPG, JPEG, PNG, GIF, WEBP")
        return clean

    def prepare_signed_upload(
        self,
        *,
        route_key: str,
        filename: str,
        username: Optional[str] = None,
        prefix: Optional[str] = None,
        resource_type: str = "image",
        ttl_seconds: int = 900,
    ) -> Dict[str, object]:
        """Generate a short-lived Cloudinary signature for direct client uploads."""
        self._ensure_enabled()

        bucket_name = self._route_bucket_map.get(route_key)
        if not bucket_name:
            raise HTTPException(status_code=400, detail="Invalid upload target")

        cfg = cloudinary.config(secure=True)
        api_secret = getattr(cfg, "api_secret", None)
        api_key = getattr(cfg, "api_key", None)
        cloud_name = getattr(cfg, "cloud_name", None)

        if not api_key or not api_secret or not cloud_name:
            raise HTTPException(status_code=500, detail="Cloudinary credentials are not fully configured")

        extension = self._validate_extension(filename)

        if route_key == "profile":
            if not username:
                raise HTTPException(status_code=400, detail="Username is required for profile uploads")
            object_path = self.generate_object_path(username, filename, extension)
        else:
            resolved_prefix = prefix
            if route_key == "committee" and not resolved_prefix:
                resolved_prefix = "committee"
            object_path = self.generate_generic_object_path(filename, extension, prefix=resolved_prefix)

        public_id = self._build_public_id(bucket_name, object_path)
        timestamp = int(time.time())
        expires_at = timestamp + int(ttl_seconds)

        # Decide the suggested max bytes to return to the client BEFORE building the params
        # so that it can be included in the signature parameters.
        # Profile uploads: strict small size (2MB). Others: generous large cap (100MB).
        suggested_max_bytes = 2 * 1024 * 1024 if route_key == "profile" else 100 * 1024 * 1024

        # Enhanced security parameters for upload (must be assembled after suggested_max_bytes is defined)
        # IMPORTANT: Only include parameters here that the client will ALSO send to Cloudinary.
        # Excluding max_file_size from signing because the frontend currently omits it, causing signature mismatch.
        params_to_sign = {
            "public_id": public_id,
            "timestamp": timestamp,
            "invalidate": "true",
            "overwrite": "false",
            "access_mode": "authenticated",
            # Add file type restrictions
            "allowed_formats": ",".join(sorted(self.allowed_extensions)),
        }

        # Optionally include transformation hints (only if explicitly enabled)
        if self.use_advanced_transforms:
            params_to_sign.update({
                "eager": "q_auto,f_auto",
                "colors": "true",
                "faces": "true",
            })

        signature = api_sign_request(params_to_sign, api_secret)

        upload_url = f"https://api.cloudinary.com/v1_1/{cloud_name}/{resource_type}/upload"
        asset_url = self.get_public_url_for_bucket(bucket_name, object_path, route_key)
        secure_url = self.get_secure_url_for_bucket(bucket_name, object_path)

        params = {k: str(v) for k, v in params_to_sign.items()}
        # Provide advisory (not signed) limits separately so frontend can enforce client-side if desired
        params_advisory = {
            "max_file_size": str(suggested_max_bytes)
        }

        response: Dict[str, object] = {
            "upload_url": upload_url,
            "api_key": api_key,
            "cloud_name": cloud_name,
            "signature": signature,
            "timestamp": timestamp,
            "public_id": public_id,
            "object_path": object_path,
            "asset_url": asset_url,
            "secure_url": secure_url,
            "expires_at": expires_at,
            "resource_type": resource_type,
            "params": params,
            "advisory": params_advisory,
            "allowed_extensions": tuple(sorted(self.allowed_extensions)),
            "max_file_bytes": suggested_max_bytes,
        }

        return response

    # ------------------------------------------------------------------
    # Signed Delivery URL helpers (view / download)
    # ------------------------------------------------------------------
    def generate_temporary_view_url(self, route_key: str, object_path: str, ttl_seconds: Optional[int] = None) -> str:
        """Generate a short-lived signed URL for viewing an existing stored asset.

        NOTE: This MUST only be called from an authenticated backend route; do not
        expose this method directly to untrusted callers.
        """
        if not self.enabled:
            raise HTTPException(status_code=503, detail="Object storage disabled")
        bucket_name = self._route_bucket_map.get(route_key)
        if not bucket_name:
            raise HTTPException(status_code=400, detail="Invalid route key")
        # Force a fixed 1 hour (3600s) expiration window regardless of caller input
        ttl_seconds = self.DEFAULT_SIGNED_URL_TTL
        return self.get_signed_url_for_bucket(bucket_name, object_path, expires_in_seconds=ttl_seconds)

    def build_dynamic_transform_url(self, route_key: str, object_path: str, *, width: Optional[int] = None,
                                    height: Optional[int] = None, quality: str = "auto", format_auto: bool = True,
                                    crop: Optional[str] = None, secure: bool = True) -> str:
        """Build (optionally signed) transformed delivery URL for an image.

        Use for on-demand thumbnails instead of storing multiple variants.
        """
        if not self.enabled:
            raise HTTPException(status_code=503, detail="Object storage disabled")
        bucket_name = self._route_bucket_map.get(route_key)
        if not bucket_name:
            raise HTTPException(status_code=400, detail="Invalid route key")
        public_id = self._build_public_id(bucket_name, object_path)
        transformation = []
        if width or height:
            t = {k: v for k, v in {"width": width, "height": height}.items() if v}
            if crop:
                t["crop"] = crop
            transformation.append(t)
        fmt = None
        if format_auto:
            fmt = None  # let Cloudinary decide via fetch_format=auto
        url, _ = cloudinary_url(
            public_id,
            secure=secure,
            resource_type="image",
            quality=quality,
            fetch_format="auto" if format_auto else None,
            transformation=transformation if transformation else None,
        )
        return url

    # ------------------------------------------------------------------
    # Post-upload verification (defense-in-depth for advisory limits)
    # ------------------------------------------------------------------
    def verify_uploaded_asset(self, route_key: str, object_path: str) -> Dict[str, object]:
        """Fetch the asset metadata from Cloudinary and enforce server-side policies.

        Intended to be called AFTER the client reports a successful direct upload.
        You can store returned metadata in DB if needed.
        """
        if not self.enabled:
            raise HTTPException(status_code=503, detail="Object storage disabled")
        bucket_name = self._route_bucket_map.get(route_key)
        if not bucket_name:
            raise HTTPException(status_code=400, detail="Invalid route key")
        public_id = self._build_public_id(bucket_name, object_path)
        try:
            info = cloudinary_api.resource(public_id, resource_type="image")
        except Exception as exc:  # broad catch: Cloudinary raises different exceptions
            raise HTTPException(status_code=404, detail=f"Asset not found: {exc}")

        bytes_size = info.get("bytes")
        fmt = (info.get("format") or "").lower()
        if bytes_size and bytes_size > self.max_image_bytes:
            # Schedule deletion for oversize asset
            try:
                cloudinary_destroy(public_id, resource_type="image", invalidate=True)
            except Exception as e:
                logger.warning(f"Failed to delete oversized asset {public_id}: {e}")
            raise HTTPException(status_code=413, detail="Uploaded file exceeds allowed size")
        if fmt and fmt not in self.allowed_extensions:
            try:
                cloudinary_destroy(public_id, resource_type="image", invalidate=True)
            except Exception as e:
                logger.warning(f"Failed to delete unsupported format asset {public_id}: {e}")
            raise HTTPException(status_code=415, detail="Unsupported media format")
        return {
            "public_id": public_id,
            "bytes": bytes_size,
            "format": fmt,
            "width": info.get("width"),
            "height": info.get("height"),
            "created_at": info.get("created_at"),
            "secure_url": info.get("secure_url"),
        }

    def _build_secure_url(self, bucket_name: str, object_path: str) -> str:
        """Construct a secure, direct URL to a Cloudinary asset."""
        _, ext = os.path.splitext(object_path)
        fmt = ext.lstrip(".") or None
        public_id = self._build_public_id(bucket_name, object_path)
        url, _ = cloudinary_url(public_id, format=fmt, secure=True, resource_type="image")
        return url

    def get_secure_url_for_bucket(self, bucket_name: str, object_path: str) -> str:
        """Public helper to get a secure URL for an object in a specific bucket."""
        return self._build_secure_url(bucket_name, object_path)

    def get_signed_url_for_bucket(self, bucket_name: str, object_path: str, expires_in_seconds: Optional[int] = None) -> str:
        """Generate a signed URL for a private/authenticated image in a specific bucket.
        
        Args:
            bucket_name: The name of the bucket containing the object
            object_path: The path to the object within the bucket
            expires_in_seconds: Optional override for URL expiration time
                              Defaults to DEFAULT_SIGNED_URL_TTL (1 hour)
                              Use TEMP_URL_TTL for temporary access (5 minutes)
                              Use None to use the default expiration
        """
        if not self.enabled:
            raise HTTPException(status_code=503, detail="Object storage is disabled")

        # Always enforce a 1 hour TTL (3600s) for consistency & security
        expires_in_seconds = self.DEFAULT_SIGNED_URL_TTL

        _, ext = os.path.splitext(object_path)
        fmt = ext.lstrip(".") or None
        public_id = self._build_public_id(bucket_name, object_path)
        expires_at = int(time.time()) + expires_in_seconds

        # Generate signed URL with additional security parameters
        url, _ = cloudinary_url(
            public_id,
            format=fmt,
            secure=True,
            resource_type="image",
            sign_url=True,
            expires_at=expires_at,
            # Add transformation restrictions
            quality="auto",  # Auto-optimize quality
            fetch_format="auto",  # Auto-select best format
        )
        return url

    def _extract_from_cloudinary_url(self, url: str, bucket_name: str) -> Optional[str]:
        """Used to parse an object path from a full Cloudinary URL."""
        try:
            parsed = urlparse(url)
        except Exception:
            return None

        path = parsed.path.lstrip("/")
        if not path:
            return None

        segments = path.split("/")
        if len(segments) < 3:
            return None

        # Skip cloud_name, resource_type, delivery_type
        rest = segments[3:]  # Skip /cloud_name/image/upload/

        # Find the version part (v followed by digits)
        version_index = None
        for i, part in enumerate(rest):
            if part.startswith("v") and part[1:].isdigit():
                version_index = i
                break

        if version_index is None:
            return None

        # Public ID is everything after the version
        public_id_parts = rest[version_index + 1:]
        if not public_id_parts:
            return None

        public_id = "/".join(public_id_parts)

        # Remove bucket prefix if present
        if bucket_name and public_id.startswith(f"{bucket_name}/"):
            public_id = public_id[len(bucket_name) + 1:]

        return public_id

    def _extract_object_path(self, identifier: Optional[str], route_key: str, bucket_name: Optional[str]) -> Optional[str]:
        """Used to extract a clean object path from various identifier formats."""
        if not identifier:
            return None

        value = str(identifier).strip()
        if not value:
            return None

        if value.startswith("/api/"):
            remainder = value[len("/api/"):]
            parts = remainder.split("/", 2)
            if len(parts) >= 3 and parts[1] == "files":
                route = parts[0]
                if route == route_key:
                    return unquote(parts[2])
            # Generic pattern: /api/files/<bucket>/<object>
            if remainder.startswith("files/"):
                generic = remainder[len("files/"):]
                if bucket_name and generic.startswith(f"{bucket_name}/"):
                    generic = generic[len(bucket_name) + 1:]
                return unquote(generic)

        if value.startswith("http://") or value.startswith("https://"):
            return self._extract_from_cloudinary_url(value, bucket_name or "")

        return unquote(value.lstrip("/"))

    def normalize_stored_path(self, identifier: Optional[str], route_key: str) -> Optional[str]:
        """Used to normalize a stored identifier into a consistent object path."""
        bucket_name = self._route_bucket_map.get(route_key)
        return self._extract_object_path(identifier, route_key, bucket_name)

    def _get_image_format(self, content: bytes) -> Optional[str]:
        """Determine the image format from its binary content."""
        try:
            img = Image.open(io.BytesIO(content))
            return img.format.lower() if img.format else None
        except Exception:
            return None
    # ------------------------------------------------------------------
    # Deletion operations
    # ------------------------------------------------------------------
    def delete_file(self, object_path: str) -> bool:
        """Used to delete a file from the default bucket."""
        return self.delete_file_from_bucket(self.bucket_name, object_path)

    def delete_file_from_bucket(self, bucket_name: str, object_path: Optional[str]) -> bool:
        """Used to delete a file from a specified bucket."""
        if not object_path:
            return False
        if not self.enabled:
            return False
        try:
            public_id = self._build_public_id(bucket_name, object_path)
            result = cloudinary_destroy(public_id, resource_type="image", invalidate=True)
            return result.get("result") in {"ok", "not found"}
        except Exception as exc:
            print(f"Error deleting from Cloudinary (bucket={bucket_name}, path={object_path}): {exc}")
            raise HTTPException(status_code=500, detail=f"Failed to delete file: {str(exc)}")

    def delete_profile_asset(self, identifier: Optional[str]) -> bool:
        """Used to delete a user's profile asset."""
        object_path = self.normalize_stored_path(identifier, "profile")
        return self.delete_file_from_bucket(self.bucket_name, object_path)

    def delete_event_asset(self, identifier: Optional[str]) -> bool:
        """Used to delete an asset associated with an event."""
        object_path = self.normalize_stored_path(identifier, "events")
        return self.delete_file_from_bucket(self.events_bucket, object_path)

    def delete_gallery_asset(self, identifier: Optional[str]) -> bool:
        """Used to delete an asset from the gallery."""
        object_path = self.normalize_stored_path(identifier, "gallery")
        return self.delete_file_from_bucket(self.gallery_bucket, object_path)

    def delete_committee_asset(self, identifier: Optional[str]) -> bool:
        """Used to delete a committee-related asset."""
        object_path = self.normalize_stored_path(identifier, "committee")
        return self.delete_file_from_bucket(self.gallery_bucket, object_path)

    def list_user_files(self, username: str, limit: int = 10) -> list:
        """List files for a specific user. Currently a placeholder."""
        # Cloudinary listing not currently required; return empty list for compatibility.
        return []


# Create a global instance for use across the application
storage_service = CloudinaryStorageService()
