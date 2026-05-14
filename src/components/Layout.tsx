import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  LogOut, 
  User, 
  Building2, 
  Store, 
  LayoutDashboard, 
  UtensilsCrossed, 
  Users, 
  Receipt, 
  Zap,
  Tag,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Candy,
  TrendingUp,
  IndianRupee
} from 'lucide-react';
import { auth } from '../firebase';
import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '../lib/utils';
import { differenceInDays } from 'date-fns';
import { TRIAL_DAYS } from '../constants';
import { motion, AnimatePresence } from 'motion/react';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { profile, bakery, impersonatedProfile, stopImpersonating, isSuperAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const getNavItems = () => {
    if (isSuperAdmin && !impersonatedProfile) {
      return [
        { label: 'Platform Home', icon: LayoutDashboard, path: '/dashboard' },
        { label: 'User Directory', icon: Users, path: '/dashboard/users' },
        { label: 'System Logs', icon: Zap, path: '/dashboard/logs' },
      ];
    }

    if (profile?.role === 'bakery_admin') {
      return [
        { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
        { label: 'Daily Pulse', icon: TrendingUp, path: '/dashboard/summary' },
        { label: 'Orders', icon: Receipt, path: '/dashboard/orders' },
        { label: 'Production', icon: UtensilsCrossed, path: '/dashboard/production' },
        { label: 'Custom Cakes', icon: Building2, path: '/dashboard/custom-cakes' },
        { label: 'Dealers', icon: Users, path: '/dashboard/dealers' },
        { label: 'Staff', icon: Users, path: '/dashboard/staff' },
        { label: 'Dragee Calculator', icon: Candy, path: '/dashboard/dragees-cost' },
        { label: 'Analytics', icon: Zap, path: '/dashboard/analytics' },
        { label: 'Customers', icon: User, path: '/dashboard/customers' },
      ];
    }

    if (profile?.role === 'production_manager' || profile?.role === 'production' || profile?.role === 'chocolate_production') {
      return [
        { label: 'Production', icon: UtensilsCrossed, path: '/dashboard' },
        { label: 'Orders', icon: Receipt, path: '/dashboard/orders' },
        { label: 'Custom Cakes', icon: Building2, path: '/dashboard/custom-cakes' },
        { label: 'Chocolate', icon: Store, path: '/dashboard/chocolates' },
      ];
    }

    if (profile?.role === 'dealer' || profile?.role === 'dealer_admin') {
      return [
        { label: 'Place Orders', icon: Store, path: '/dashboard' },
        { label: 'Browse Catalog', icon: Tag, path: '/dashboard/catalog' },
        { label: 'My History', icon: Receipt, path: '/dashboard/history' },
        { label: 'My Team', icon: Users, path: '/dashboard/staff' },
      ];
    }

    if (profile?.role === 'dealer_staff') {
      return [
        { label: 'Place Orders', icon: Store, path: '/dashboard' },
        { label: 'Browse Catalog', icon: Tag, path: '/dashboard/catalog' },
        { label: 'My History', icon: Receipt, path: '/dashboard/history' },
      ];
    }

    return [{ label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' }];
  };

  const navItems = getNavItems();

  const trialStart = bakery?.trialStartedAt?.toDate ? bakery.trialStartedAt.toDate() : (bakery?.trialStartedAt ? new Date(bakery.trialStartedAt) : new Date());
  const daysRemaining = Math.max(0, TRIAL_DAYS - differenceInDays(new Date(), trialStart));

  // Only show trial alert for bakery admins on trial (skip for free partners)
  const showTrialAlert = profile?.role === 'bakery_admin' && 
                        bakery?.subscriptionStatus === 'trial' && 
                        bakery?.subscriptionStatus !== 'free_partner';

  const navigateAndClose = (path: string) => {
    navigate(path);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans text-slate-800">
      {/* Mobile Backdrop */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsMobileMenuOpen(false)}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <motion.aside 
        initial={false}
        animate={{ 
          width: isCollapsed ? 80 : 256,
          x: isMobileMenuOpen ? 0 : (typeof window !== 'undefined' && window.innerWidth < 1024 ? -256 : 0)
        }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        className={cn(
          "bg-slate-900 flex flex-col flex-shrink-0 relative group z-[70] h-full transition-shadow duration-300",
          "lg:relative fixed inset-y-0 left-0",
          isMobileMenuOpen ? "shadow-2xl" : ""
        )}
      >
        {/* Toggle Button (Desktop) */}
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="absolute -right-3 top-20 w-6 h-6 bg-slate-900 border border-slate-700 rounded-full hidden lg:flex items-center justify-center text-slate-400 hover:text-white z-50 transition-colors shadow-lg"
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        {/* Close Button (Mobile) */}
        <button 
          onClick={() => setIsMobileMenuOpen(false)}
          className="absolute right-4 top-6 lg:hidden text-slate-400 hover:text-white"
        >
          <X size={24} />
        </button>

        <div className={cn("p-6 flex items-center", isCollapsed ? "lg:justify-center lg:px-0" : "gap-3")}>
          <div className="w-8 h-8 bg-amber-500 rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-amber-500/20 shrink-0">B</div>
          <AnimatePresence mode="wait">
            {(!isCollapsed || isMobileMenuOpen) && (
              <div className="flex flex-col">
                <motion.span 
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="text-white font-bold text-lg tracking-tight whitespace-nowrap"
                >
                  BakeSync
                </motion.span>
                {bakery?.subscriptionStatus === 'free_partner' && (
                  <span className="text-[7px] font-black bg-purple-500 text-white px-1.5 py-0.5 rounded uppercase tracking-tighter mt-0.5 w-fit">Partner</span>
                )}
              </div>
            )}
          </AnimatePresence>
        </div>
        
        <nav className="flex-1 px-4 space-y-1 overflow-y-auto custom-scrollbar py-4">
          {navItems.map((item) => (
            <button
              key={item.path}
              onClick={() => navigateAndClose(item.path)}
              className={cn(
                "w-full rounded-md text-sm font-medium flex items-center transition-colors overflow-hidden",
                isCollapsed && !isMobileMenuOpen ? "lg:justify-center lg:p-2" : "px-3 py-2 gap-3",
                location.pathname === item.path 
                  ? "bg-amber-500/10 text-amber-400" 
                  : "text-slate-400 hover:text-white hover:bg-slate-800"
              )}
              title={isCollapsed ? item.label : undefined}
            >
              <item.icon className={cn("w-4 h-4 shrink-0", location.pathname === item.path ? "text-amber-400" : "text-slate-500")} />
              {(!isCollapsed || isMobileMenuOpen) && <span className="whitespace-nowrap">{item.label}</span>}
            </button>
          ))}
        </nav>

        <div className={cn("p-4 border-t border-slate-800", isCollapsed && !isMobileMenuOpen && "lg:flex lg:justify-center")}>
          {(!isCollapsed || isMobileMenuOpen) ? (
            <div className="flex flex-col gap-1">
              <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Powered by Flourish SaaS</div>
              <div className="text-[9px] text-slate-600 font-bold tracking-tight">v1.4.4</div>
            </div>
          ) : (
            <div className="text-[10px] text-slate-500 font-bold">1.4.4</div>
          )}
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 sm:gap-4 overflow-hidden">
            {/* Mobile Menu Toggle */}
            <button 
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 -ml-2 rounded-lg text-slate-500 hover:bg-slate-100 lg:hidden"
            >
              <Menu size={24} />
            </button>

            {impersonatedProfile ? (
              <span className="px-2 py-0.5 sm:px-3 sm:py-1 bg-amber-100 text-amber-700 rounded-full text-[8px] sm:text-[10px] font-black italic border border-amber-200 animate-pulse whitespace-nowrap">
                SIMULATION
              </span>
            ) : isSuperAdmin ? (
              <span className="px-2 py-0.5 sm:px-3 sm:py-1 bg-blue-100 text-blue-700 rounded-full text-[8px] sm:text-[10px] font-black italic border border-blue-200 whitespace-nowrap">
                SUPER ADMIN
              </span>
            ) : null}
            
            <span className="text-slate-300 text-sm hidden sm:inline">|</span>
            <div className="flex items-center gap-2 overflow-hidden">
              <span className="font-bold text-slate-700 truncate text-sm sm:text-base">{bakery?.name}</span>
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0"></div>
            </div>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-6">
            {showTrialAlert && (
              <div className="hidden md:flex flex-col items-end">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Trial Countdown</span>
                <span className={cn("text-xs font-bold", daysRemaining < 10 ? "text-red-500" : "text-amber-600")}>
                  {daysRemaining} Days
                </span>
              </div>
            )}
            
            <div className="flex items-center gap-2 sm:gap-3 pl-2 sm:pl-6 border-l border-slate-100">
              <div className="hidden sm:flex flex-col items-end mr-1">
                <span className="text-xs font-bold text-slate-900">{profile?.displayName}</span>
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter shrink-0">{profile?.role.replace('_', ' ')}</span>
              </div>
              <button 
                onClick={handleLogout}
                className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-slate-100 border-2 border-white shadow-sm flex items-center justify-center font-bold text-slate-600 hover:bg-slate-200 transition-all shrink-0"
              >
                {profile?.displayName.charAt(0) || <LogOut className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </header>

        {/* Impersonation Warning Banner */}
        {impersonatedProfile && (
          <div className="bg-amber-100 border-b border-amber-200 px-4 sm:px-6 py-2 flex justify-between items-center animate-in slide-in-from-top duration-300">
            <div className="flex items-center gap-2 sm:gap-3 text-amber-800 text-[10px] sm:text-xs font-bold uppercase">
              <Zap className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="truncate">Simulating: {impersonatedProfile.displayName}</span>
            </div>
            <button 
              onClick={stopImpersonating}
              className="text-[8px] sm:text-[10px] bg-amber-800 text-white px-2 py-1 sm:px-3 sm:py-1 rounded font-black hover:bg-amber-900 transition-colors whitespace-nowrap"
            >
              EXIT
            </button>
          </div>
        )}

        {/* Views Pane */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 sm:p-6">
          {children}
        </div>
      </main>
    </div>
  );
};
