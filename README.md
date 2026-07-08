# Temple Management System

A comprehensive web application for managing temple operations, rituals, events, bookings, and administrative tasks.

## 🔐 **Enterprise-Grade Security**

- **JWT Authentication**: Short-lived tokens (7 minutes) with automatic refresh
- **No Secret Exposure**: Backend secrets never reach frontend
- **Client Binding**: Tokens bound to specific IP + User-Agent
- **HTTP-Only Cookies**: Refresh tokens protected from XSS
- **CORS Protection**: Only Netlify domain allowed
- **HTTPS Enforced**: All communication encrypted

## ✨ **Features**

- **Ritual Management**: Book and manage temple rituals
- **Event Management**: Create and organize temple events  
- **Admin Dashboard**: Administrative interface with role-based access
- **Gallery**: Photo and media management
- **Calendar Integration**: Temple calendar and scheduling
- **Stock Management**: Inventory tracking

## Quick Start

1. **Setup Environment Variables**
   - Copy `.env.example` to `.env` in both `backend/` and `frontend/` directories
   - Configure database URLs and API secret keys
   - Set `CLOUDINARY_URL=cloudinary://<api_key>:<api_secret>@dmcras5t4` in `backend/.env` (and optionally override `CLOUDINARY_*_FOLDER` values) so media uploads use Cloudinary storage

2. **Backend Setup**
   ```bash
   cd backend
   pip install -r requirements.txt
   uvicorn app.main:app --reload --port 8080
   ```

3. **Frontend Setup**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

4. **Access the Application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:8080
   - API Documentation: http://localhost:8080/docs

## 📚 **Documentation**

### Security & Best Practices
- `backend/SECURITY_SUMMARY.md` - **Quick reference for security fixes**
- `backend/SECURITY_FIXES_REPORT.md` - Detailed security audit report
- `backend/CODING_STANDARDS.md` - Python coding standards and best practices
- `JWT_SECURITY_IMPLEMENTATION.md` - Complete JWT security guide
- `PRODUCTION_SECURITY.md` - Production security configuration

### Deployment & API
- `RENDER_NETLIFY_DEPLOYMENT.md` - Deployment instructions
- `API_Security_Documentation.md` - Legacy security docs

## 🛡️ **Security Audit Status**

**Last Audit:** October 22, 2025  
**Status:** ✅ Production Secure - Updates Available

### Code Security (Completed ✅)
| Category | Issues Found | Fixed | Status |
|----------|--------------|-------|--------|
| Critical (eval usage) | 2 | 2 | ✅ |
| High (insecure random) | 1 | 1 | ✅ |
| Medium (error handling) | 12 | 12 | ✅ |
| **Total** | **15** | **15** | **✅** |

### Dependency Security (Reviewed ✅)
| Platform | Vulnerabilities | Production Impact | Status |
|----------|-----------------|-------------------|--------|
| Python (pip) | 1 Low | None (build-time only) | ⚠️ Monitor |
| Node.js (vite/esbuild) | 2 Moderate | None (dev-time only) | ⚠️ Update Available |
| **Production** | **0** | **None** | **✅ Secure** |

See `DEPENDENCY_SECURITY_AUDIT.md` for detailed analysis.  
See `backend/SECURITY_SUMMARY.md` for code security quick reference.

## 📚 **Documentation**

- `JWT_SECURITY_IMPLEMENTATION.md` - Complete security guide
- `RENDER_NETLIFY_DEPLOYMENT.md` - Deployment instructions
- `PRODUCTION_SECURITY.md` - Production security configuration
- `API_Security_Documentation.md` - Legacy security docs

## 🚀 **Production Ready**

✅ **Deployed URLs:**
- **Frontend**: https://heroic-elf-ec8175.netlify.app
- **Backend**: https://temple-management-system-3p4x.onrender.com

✅ **Security Features:**
- JWT tokens with 7-minute expiry
- Client binding (IP + User-Agent)
- HTTP-only refresh token cookies
- CORS restricted to Netlify domain
- No secret keys in frontend code
- HTTPS enforced everywhere

✅ **All Vulnerabilities Mitigated:**
- Secret key exposure ❌
- Session hijacking ❌  
- XSS attacks ❌
- CSRF attacks ❌
- Token replay ❌
- CORS abuse ❌
- Network interception ❌
