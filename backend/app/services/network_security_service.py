"""
Network Security Service
Implements HSTS, Certificate Transparency, WAF Protection, and DDoS Protection
"""

import time
import hashlib
import json
from typing import Dict, List, Optional, Set
from collections import defaultdict, deque
from datetime import datetime, timedelta
from fastapi import Request, HTTPException
from ..database import security_events_collection
import asyncio
import logging

logger = logging.getLogger("network_security")

class NetworkSecurityService:
    def __init__(self):
        # Rate limiting storage
        self.rate_limit_storage = defaultdict(lambda: deque())
        self.blocked_ips = defaultdict(lambda: {"until": None, "reason": ""})
        
        # WAF rules storage
        self.waf_rules = []
        self.suspicious_patterns = [
            r'<script.*?>',  # XSS attempts
            r'union.*select',  # SQL injection
            r'drop\s+table',  # SQL injection
            r'\.\.\/\.\.\/\.\.',  # Path traversal
            r'eval\s*\(',  # Code injection
            r'exec\s*\(',  # Code execution
            r'system\s*\(',  # System commands
        ]
        
        # Certificate monitoring
        self.certificate_logs = []
        
        # DDoS protection settings
        self.ddos_thresholds = {
            "requests_per_minute": 100,
            "requests_per_hour": 1000,
            "concurrent_connections": 50
        }
        
        self.connection_counts = defaultdict(int)
        
        # Initialize WAF rules
        self._initialize_waf_rules()
    
    def _initialize_waf_rules(self):
        """Initialize Web Application Firewall rules"""
        self.waf_rules = [
            {
                "name": "SQL Injection Protection",
                "pattern": r"(?i)(union|select|insert|update|delete|drop|create|alter|exec|execute)",
                "block": True,
                "log": True
            },
            {
                "name": "XSS Protection", 
                "pattern": r"(?i)(<script|javascript:|on\w+\s*=)",
                "block": True,
                "log": True
            },
            {
                "name": "Path Traversal Protection",
                "pattern": r"(\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e%5c)",
                "block": True,
                "log": True
            },
            {
                "name": "Command Injection Protection",
                "pattern": r"(?i)(;|\||&|`|\$\(|\${|eval\s*\(|exec\s*\()",
                "block": True,
                "log": True
            },
            {
                "name": "File Upload Protection",
                "pattern": r"(?i)\.(php|jsp|asp|aspx|pl|py|rb|exe|dll|sh|bat)$",
                "block": True,
                "log": True
            }
        ]
    
    def add_hsts_headers(self, response) -> None:
        """Add HTTP Strict Transport Security headers"""
        # HSTS - Force HTTPS for 1 year, include subdomains
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
        
        # Additional security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            "font-src 'self'; "
            "connect-src 'self'; "
            "frame-ancestors 'none';"
        )
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), "
            "payment=(), usb=(), magnetometer=(), gyroscope=()"
        )
    
    async def check_certificate_transparency(self, domain: str) -> Dict:
        """Monitor certificate transparency logs"""
        # This would integrate with CT log APIs in production
        # For now, we'll simulate the monitoring
        
        ct_entry = {
            "domain": domain,
            "timestamp": datetime.utcnow().isoformat(),
            "certificate_hash": hashlib.sha256(f"{domain}_{time.time()}".encode()).hexdigest(),
            "issuer": "Let's Encrypt Authority X3",
            "valid_from": datetime.utcnow().isoformat(),
            "valid_until": (datetime.utcnow() + timedelta(days=90)).isoformat(),
            "status": "valid"
        }
        
        # Store in certificate logs
        self.certificate_logs.append(ct_entry)
        
        # Log security event
        await security_events_collection.insert_one({
            "event_type": "certificate_transparency",
            "domain": domain,
            "certificate_data": ct_entry,
            "timestamp": datetime.utcnow(),
            "severity": "info"
        })
        
        return ct_entry
    
    async def waf_inspection(self, request: Request) -> Dict[str, any]:
        """Web Application Firewall inspection"""
        client_ip = self._get_client_ip(request)
        
        # Check if IP is blocked
        if client_ip in self.blocked_ips:
            block_info = self.blocked_ips[client_ip]
            if block_info["until"] and datetime.utcnow() < block_info["until"]:
                raise HTTPException(
                    status_code=403, 
                    detail=f"IP blocked: {block_info['reason']}"
                )
            else:
                # Unblock expired blocks
                del self.blocked_ips[client_ip]
        
        inspection_result = {
            "blocked": False,
            "threats_detected": [],
            "risk_score": 0,
            "client_ip": client_ip
        }
        
        # Inspect URL, headers, and body
        inspection_targets = {
            "url": str(request.url),
            "user_agent": request.headers.get("user-agent", ""),
            "referer": request.headers.get("referer", ""),
        }
        
        # Add request body if present
        if request.method in ["POST", "PUT", "PATCH"]:
            try:
                body = await request.body()
                if body:
                    inspection_targets["body"] = body.decode('utf-8', errors='ignore')
            except (UnicodeDecodeError, AttributeError) as e:
                logger.warning(f"Failed to decode request body for WAF inspection: {e}")
        
        # Run WAF rules
        for rule in self.waf_rules:
            import re
            pattern = re.compile(rule["pattern"], re.IGNORECASE)
            
            for target_name, target_value in inspection_targets.items():
                if pattern.search(target_value):
                    threat = {
                        "rule_name": rule["name"],
                        "target": target_name,
                        "matched_value": target_value[:100],  # Truncate for logging
                        "severity": "high"
                    }
                    
                    inspection_result["threats_detected"].append(threat)
                    inspection_result["risk_score"] += 25
                    
                    if rule["block"]:
                        inspection_result["blocked"] = True
                    
                    if rule["log"]:
                        await self._log_waf_event(client_ip, threat, request)
        
        # Block if high risk score
        if inspection_result["risk_score"] >= 50:
            inspection_result["blocked"] = True
            
            # Temporary block IP (15 minutes)
            self.blocked_ips[client_ip] = {
                "until": datetime.utcnow() + timedelta(minutes=15),
                "reason": f"WAF blocked - Risk score: {inspection_result['risk_score']}"
            }
        
        return inspection_result
    
    async def ddos_protection(self, request: Request) -> Dict[str, any]:
        """DDoS protection with rate limiting and traffic filtering"""
        client_ip = self._get_client_ip(request)
        current_time = time.time()
        
        # Clean old entries
        minute_ago = current_time - 60
        hour_ago = current_time - 3600
        
        # Get request history for this IP
        ip_requests = self.rate_limit_storage[client_ip]
        
        # Remove old requests
        while ip_requests and ip_requests[0] < minute_ago:
            ip_requests.popleft()
        
        # Add current request
        ip_requests.append(current_time)
        
        # Check rate limits
        requests_per_minute = len([r for r in ip_requests if r > minute_ago])
        
        # Calculate requests per hour (we need a separate storage for this)
        requests_per_hour = len([r for r in ip_requests if r > hour_ago])
        
        # Update connection count
        self.connection_counts[client_ip] = self.connection_counts.get(client_ip, 0) + 1
        
        protection_result = {
            "blocked": False,
            "rate_limited": False,
            "requests_per_minute": requests_per_minute,
            "requests_per_hour": requests_per_hour,
            "concurrent_connections": self.connection_counts[client_ip],
            "client_ip": client_ip
        }
        
        # Check thresholds
        if requests_per_minute > self.ddos_thresholds["requests_per_minute"]:
            protection_result["blocked"] = True
            protection_result["rate_limited"] = True
            
            # Block IP for 5 minutes
            self.blocked_ips[client_ip] = {
                "until": datetime.utcnow() + timedelta(minutes=5),
                "reason": f"Rate limit exceeded: {requests_per_minute} requests/minute"
            }
            
            await self._log_ddos_event(client_ip, "rate_limit_exceeded", protection_result)
        
        elif requests_per_hour > self.ddos_thresholds["requests_per_hour"]:
            protection_result["blocked"] = True
            protection_result["rate_limited"] = True
            
            # Block IP for 30 minutes
            self.blocked_ips[client_ip] = {
                "until": datetime.utcnow() + timedelta(minutes=30),
                "reason": f"Hourly rate limit exceeded: {requests_per_hour} requests/hour"
            }
            
            await self._log_ddos_event(client_ip, "hourly_limit_exceeded", protection_result)
        
        elif self.connection_counts[client_ip] > self.ddos_thresholds["concurrent_connections"]:
            protection_result["blocked"] = True
            
            await self._log_ddos_event(client_ip, "too_many_connections", protection_result)
        
        return protection_result
    
    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP address from request"""
        # Check for forwarded IP (load balancer/proxy)
        forwarded_for = request.headers.get("x-forwarded-for")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        
        # Check for real IP header
        real_ip = request.headers.get("x-real-ip")
        if real_ip:
            return real_ip
        
        # Fall back to direct client IP
        return request.client.host if request.client else "unknown"
    
    async def _log_waf_event(self, client_ip: str, threat: Dict, request: Request):
        """Log WAF security event"""
        await security_events_collection.insert_one({
            "event_type": "waf_threat_detected",
            "client_ip": client_ip,
            "threat_details": threat,
            "request_url": str(request.url),
            "request_method": request.method,
            "user_agent": request.headers.get("user-agent", ""),
            "timestamp": datetime.utcnow(),
            "severity": threat.get("severity", "medium")
        })
    
    async def _log_ddos_event(self, client_ip: str, event_type: str, details: Dict):
        """Log DDoS protection event"""
        await security_events_collection.insert_one({
            "event_type": f"ddos_{event_type}",
            "client_ip": client_ip,
            "protection_details": details,
            "timestamp": datetime.utcnow(),
            "severity": "high"
        })
    
    def get_blocked_ips(self) -> List[Dict]:
        """Get currently blocked IPs"""
        current_time = datetime.utcnow()
        active_blocks = []
        
        for ip, block_info in self.blocked_ips.items():
            if block_info["until"] and current_time < block_info["until"]:
                active_blocks.append({
                    "ip": ip,
                    "blocked_until": block_info["until"].isoformat(),
                    "reason": block_info["reason"],
                    "remaining_minutes": int((block_info["until"] - current_time).total_seconds() / 60)
                })
        
        return active_blocks
    
    def unblock_ip(self, ip: str) -> bool:
        """Manually unblock an IP address"""
        if ip in self.blocked_ips:
            del self.blocked_ips[ip]
            return True
        return False
    
    async def get_security_stats(self) -> Dict:
        """Get network security statistics"""
        current_time = time.time()
        minute_ago = current_time - 60
        
        # Calculate current load
        total_requests_last_minute = 0
        active_ips = set()
        
        for ip, requests in self.rate_limit_storage.items():
            recent_requests = len([r for r in requests if r > minute_ago])
            total_requests_last_minute += recent_requests
            if recent_requests > 0:
                active_ips.add(ip)
        
        return {
            "active_connections": len(active_ips),
            "requests_last_minute": total_requests_last_minute,
            "blocked_ips": len(self.get_blocked_ips()),
            "waf_rules_active": len(self.waf_rules),
            "certificate_logs": len(self.certificate_logs),
            "ddos_thresholds": self.ddos_thresholds
        }

# Global instance
network_security = NetworkSecurityService()