import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import TempleSidebar from "./TempleSidebar";
import { Bell, User, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import Profile from "./Profile";

const AdminLayout = () => {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  // Conditionally show the navbar and sidebar.
  // The EditProfile page has its own layout and back button,
  // so we hide the main layout's navigation chrome on that page.
  const showNavigation = !location.pathname.includes('/admin/edit-profile');

  const toggleSidebar = () => setIsSidebarOpen((v) => !v);

  return (
    // admin-surface class will scope white/orange theme overrides (see index.css additions)
    <div className="min-h-screen w-full admin-surface">
      {/* Overlay for mobile - sits above header to allow closing sidebar */}
      {showNavigation && isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={toggleSidebar}
          aria-hidden="true"
        />
      )}
      <div className="flex">
        {showNavigation && <TempleSidebar isOpen={isSidebarOpen} onToggle={toggleSidebar} />}
        
        <div className="flex-1 flex flex-col min-w-0 admin-main">
          {/* Header - fixed to always stay visible */}
          {showNavigation && (
            <header className="fixed inset-x-0 top-0 h-16 admin-header flex items-center justify-between px-6 flex-shrink-0 z-30 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
              <div className="flex items-center gap-4">
                {/* Sidebar toggle */}
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-9 w-9 text-neutral-600 hover:bg-orange-100 hover:text-orange-600 transition-colors ${isSidebarOpen ? 'hidden' : ''}`}
                  onClick={toggleSidebar}
                  aria-label={isSidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
                  aria-expanded={isSidebarOpen}
                >
                  <Menu className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-orange-500/90 rounded-md flex items-center justify-center shadow-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                      <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                      <path d="M2 17l10 5 10-5"></path>
                      <path d="M2 12l10 5 10-5"></path>
                    </svg>
                  </div>
                  <h1 className="text-xl font-bold text-neutral-800 tracking-tight">Temple Dashboard</h1>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" className="h-9 w-9 text-neutral-600 hover:bg-orange-100 hover:text-orange-600 transition-colors">
                  <Bell className="h-4 w-4" />
                </Button>
                
                {/* Profile Icon and Dropdown */}
                <div className="relative">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-9 w-9 text-neutral-600 hover:bg-orange-100 hover:text-orange-600 transition-colors"
                    onClick={() => setIsProfileOpen(!isProfileOpen)}
                  >
                    <User className="h-4 w-4" />
                  </Button>
                  {isProfileOpen && <Profile onClose={() => setIsProfileOpen(false)} />}
                </div>
              </div>
            </header>
          )}

          {/* Main Content */}
          <main className={`flex-1 overflow-auto ${showNavigation ? 'p-6 pt-16' : ''}`}>
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}

export default AdminLayout;
