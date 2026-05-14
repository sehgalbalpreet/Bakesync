
import React, { useState } from 'react';
// Build 2026-05-09-v138
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { auth, db } from './firebase';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Login } from './pages/Login';
import { BakerySignup } from './pages/BakerySignup';
import { Layout } from './components/Layout';
import ScrollToTop from './components/ScrollToTop';
import { ProductionDashboard } from './pages/ProductionDashboard';
import { DealerDashboard } from './pages/DealerDashboard';
import { BakeryAdminDashboard } from './pages/BakeryAdminDashboard';
import { SuperAdminDashboard } from './pages/SuperAdminDashboard';
import { DesignQuote } from './pages/DesignQuote';
import { DrageesCostSetup } from './pages/DrageesCostSetup';
import { ProductionTimeTracking } from './pages/ProductionTimeTracking';
import { TrialBanner } from './components/TrialBanner';
import { Volume2, Play, ShieldAlert, Clock, Zap } from 'lucide-react';
import { useSound } from './hooks/useSound';
import { cn } from './lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { doc, getDoc, setDoc, getDocFromServer } from 'firebase/firestore';

const APP_VERSION = '1.4.4';

const DashboardHome = () => {
  const { profile, bakery, isSuperAdmin, impersonatedProfile } = useAuth();
  const { playPending, stopPending, playReady, stopReady, playSent } = useSound();
  const [appConfig, setAppConfig] = useState<any>(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [connectionState, setConnectionState] = useState<'online' | 'reconnecting' | 'offline'>('online');
  const [offlineTime, setOfflineTime] = useState<number | null>(null);

  React.useEffect(() => {
    window.scrollTo(0, 0);
    const scrollContainer = document.querySelector('main > div.overflow-y-auto');
    if (scrollContainer) scrollContainer.scrollTo(0, 0);

    // 1. Version Control & Cache Management (Step 5)
    const checkVersion = async () => {
      try {
        const configRef = doc(db, 'appConfig', 'version');
        const configSnap = await getDocFromServer(configRef);
        
        if (configSnap.exists()) {
          const config = configSnap.data();
          setAppConfig(config);

          const needsUpdate = config.currentVersion !== APP_VERSION;
          const isCritical = config.forceUpdate === true && needsUpdate;

          if (isCritical) {
            setShowUpdateModal(true);
            setShowUpdateBanner(false);
          } else if (needsUpdate) {
            setShowUpdateBanner(true);
            setShowUpdateModal(false);
          } else {
            setShowUpdateBanner(false);
            setShowUpdateModal(false);
          }
        } else if (isSuperAdmin) {
          // Auto-bootstrap if missing
          await setDoc(configRef, {
            currentVersion: APP_VERSION,
            forceUpdate: false,
            updateMessage: 'New version available — please refresh'
          });
        }
      } catch (error) {
        console.error("Version check error:", error);
      }
    };

    checkVersion();
    const interval = setInterval(checkVersion, 15 * 60 * 1000); // More frequent check for hosting migration

    // 2. Connection Monitor (Step 7)
    const handleOnline = () => {
      setConnectionState('reconnecting');
      setOfflineTime(null);
      setTimeout(() => setConnectionState('online'), 2000);
    };

    const handleOffline = () => {
      setConnectionState('offline');
      setOfflineTime(Date.now());
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Timer to force re-render for the offline banner (Step 7)
    let offlineInterval: NodeJS.Timeout;
    if (connectionState === 'offline') {
      offlineInterval = setInterval(() => {
        setOfflineTime(prev => prev); // No-op state update to force re-render and check duration
      }, 5000);
    }

    // 3. Global Error Monitor for Firestore Internal Failures
    const handleError = (event: ErrorEvent | PromiseRejectionEvent) => {
      const errorText = (event instanceof ErrorEvent ? event.message : (event as any).reason?.message) || '';
      if (errorText.includes('INTERNAL ASSERTION FAILED') || errorText.includes('Unexpected state')) {
        console.error("CRITICAL FIRESTORE ERROR DETECTED. Triggering auto-repair...");
        localStorage.removeItem('bakesync_version');
        sessionStorage.clear();
        localStorage.setItem('bakesync_repair_loop_guard', Date.now().toString());
        window.location.search = "force_upgrade=true&repair=auto";
      }
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleError);

    // Register service worker for PWA
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(registration => {
          console.log('SW registered:', registration);
          registration.update();
        }).catch(error => {
          console.log('SW registration failed:', error);
        });
      });
    }

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleError);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (offlineInterval) clearInterval(offlineInterval);
      clearInterval(interval);
    };
  }, [isSuperAdmin, connectionState]);

  const isLongOffline = connectionState === 'offline' && offlineTime && (Date.now() - offlineTime > 30000);

  return (
    <div className="space-y-6">
      {/* Global Connection/Syncing Indicators */}
      <AnimatePresence>
        {connectionState === 'reconnecting' && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-amber-400 text-amber-950 text-[9px] font-black uppercase tracking-[0.2em] py-1 px-4 flex items-center justify-center gap-2 sticky top-0 z-[100] shadow-sm overflow-hidden"
          >
            <div className="w-1.5 h-1.5 bg-amber-950/40 rounded-full animate-pulse"></div>
            Reconnecting to server...
          </motion.div>
        )}

        {isLongOffline && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-amber-100 text-amber-800 text-[10px] font-bold uppercase tracking-wider py-3 px-6 flex items-center justify-center gap-3 sticky top-0 z-[100] border-b border-amber-200"
          >
            <ShieldAlert className="w-4 h-4" />
            You are offline — changes will sync when connection is restored
          </motion.div>
        )}

        {showUpdateBanner && (
          <motion.div 
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-blue-600 text-white py-3 px-6 flex items-center justify-between gap-4 sticky top-0 z-[110] shadow-xl"
          >
            <div className="flex items-center gap-3">
              <Zap className="w-4 h-4 animate-pulse" />
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-widest">A new version is available — tap to update</span>
            </div>
            <button 
              onClick={() => window.location.reload()}
              className="bg-white text-blue-600 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-blue-50 transition-colors"
            >
              Refresh Now
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <TrialBanner bakery={bakery} />

      {/* Force Update Modal */}
      {showUpdateModal && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[1000] flex items-center justify-center p-6 text-center">
          <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-2xl">
            <div className="w-20 h-20 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <ShieldAlert className="w-10 h-10 animate-pulse" />
            </div>
            <h2 className="text-2xl font-black text-slate-900 mb-4 tracking-tight">Version Conflict</h2>
            <p className="text-slate-600 mb-8 font-medium leading-relaxed">
              {appConfig?.updateMessage || "BakeSync has been updated. Please refresh to continue."}
            </p>
            <button 
              onClick={() => {
                // Remove version key to force fresh check on reload
                localStorage.removeItem('bakesync_version');
                window.location.reload();
              }}
              className="w-full py-4 bg-slate-900 text-white rounded-xl font-black uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-3"
            >
              Refresh Now
            </button>
          </div>
        </div>
      )}
      
      {/* Role-Based Dashboard Controller */}
      {isSuperAdmin && !impersonatedProfile && <SuperAdminDashboard />}
      {profile?.role === 'bakery_admin' && <BakeryAdminDashboard />}
      {(profile?.role === 'production' || profile?.role === 'chocolate_production') && <ProductionDashboard />}
      {(profile?.role === 'dealer' || profile?.role === 'dealer_admin' || profile?.role === 'dealer_staff') && <DealerDashboard />}

      {/* Sound Testing Mode (For Admins/Testing) */}
      {(isSuperAdmin || profile?.role === 'bakery_admin') && (
        <div className="mt-12 bg-white p-6 rounded-3xl border border-dashed border-gray-300">
          <div className="flex items-center gap-2 mb-4">
            <Volume2 className="w-5 h-5 text-gray-400" />
            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest">Alert Testing Panel</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button onClick={playPending} className="flex items-center justify-center gap-2 py-3 bg-red-50 text-red-700 rounded-xl font-bold text-xs hover:bg-red-100 transition-colors">
              <Play className="w-3 h-3" /> RING RING
            </button>
            <button 
              onClick={() => {
                stopPending();
                stopReady();
              }} 
              className="flex items-center justify-center gap-2 py-3 bg-gray-50 text-gray-700 rounded-xl font-bold text-xs hover:bg-gray-100 transition-colors"
            >
              STOP ALL
            </button>
            <button onClick={playReady} className="flex items-center justify-center gap-2 py-3 bg-blue-50 text-blue-700 rounded-xl font-bold text-xs hover:bg-blue-100 transition-colors">
              <Play className="w-3 h-3" /> DING DONG
            </button>
            <button onClick={playSent} className="flex items-center justify-center gap-2 py-3 bg-green-50 text-green-700 rounded-xl font-bold text-xs hover:bg-green-100 transition-colors">
              <Play className="w-3 h-3" /> TECHNICAL
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const ProtectedRoute: React.FC<{ children: React.ReactNode, adminOnly?: boolean }> = ({ children, adminOnly }) => {
  const { user, profile, loading, isSuperAdmin, bakery } = useAuth();
  
  if (loading) return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-50 p-6 text-center">
      <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-6"></div>
      <p className="text-gray-900 font-black uppercase tracking-widest text-sm animate-pulse mb-2">Bakesync Core v{APP_VERSION}</p>
      <p className="text-slate-400 font-bold text-[10px] uppercase tracking-widest">Warming up systems...</p>
      
      <div className="mt-12 flex flex-col items-center gap-4">
        <p className="text-[9px] text-slate-300 font-bold uppercase tracking-widest">Connection Issues?</p>
        <div className="flex flex-col sm:flex-row gap-3">
          <button 
            onClick={() => {
              localStorage.removeItem('bakesync_version');
              window.location.reload();
            }}
            className="px-6 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black text-slate-400 uppercase tracking-widest hover:border-indigo-400 hover:text-indigo-600 transition-all"
          >
            Soft Reload
          </button>
          
          <button 
            onClick={() => {
              if (confirm("EMERGENCY REPAIR: This will sign you out and clear ALL local cache. Recommended if the app is frozen or stuck. Proceed?")) {
                localStorage.clear();
                window.location.href = "/";
              }
            }}
            className="px-6 py-2 bg-rose-50 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-100 transition-all"
          >
            Deep Repair (Reset App)
          </button>
        </div>
      </div>
    </div>
  );
  
  if (!user) return <Navigate to="/login" />;

  // Auth check for Super Admin
  if (isSuperAdmin) return <Layout>{children}</Layout>;

  // Authorization check: User must have a profile
  if (!profile) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 p-6 text-center">
        <div className="w-20 h-20 bg-red-100 text-red-600 rounded-3xl flex items-center justify-center mb-6">
          <ShieldAlert className="w-10 h-10" />
        </div>
        <h1 className="text-2xl font-black text-slate-900 mb-2">Access Denied</h1>
        <p className="text-slate-500 font-bold max-w-md">
          you are not authorised by the superadmin
        </p>
        <button 
          onClick={() => auth.signOut()}
          className="mt-8 px-8 py-3 bg-slate-900 text-white rounded-xl font-black uppercase tracking-widest text-xs hover:bg-slate-800 transition-all"
        >
          Sign Out
        </button>
      </div>
    );
  }

  // Bakery Status Check
  const isDealer = profile?.role === 'dealer' || profile?.role === 'dealer_admin' || profile?.role === 'dealer_staff';
  
  if (bakery && !isDealer && (bakery.subscriptionStatus === 'pending_approval' || bakery.subscriptionStatus === 'expired')) {
    const isPending = bakery.subscriptionStatus === 'pending_approval';
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 p-6 text-center">
        <div className={cn(
          "w-20 h-20 rounded-3xl flex items-center justify-center mb-6",
          isPending ? "bg-amber-100 text-amber-600" : "bg-red-100 text-red-600"
        )}>
          {isPending ? <Clock className="w-10 h-10" /> : <ShieldAlert className="w-10 h-10" />}
        </div>
        <h1 className="text-2xl font-black text-slate-900 mb-2">
          {isPending ? 'Approval Pending' : 'Subscription Expired'}
        </h1>
        <p className="text-slate-500 font-bold max-w-md">
          {isPending 
            ? `Your registration for "${bakery.name}" is being reviewed. Please wait for the system administrator to approve your access.`
            : `Your subscription for "${bakery.name}" has expired. Please contact support or renew your plan to continue using the system.`
          }
        </p>
        <div className="flex gap-4 mt-8">
          {!isPending && (
            <button className="px-8 py-3 bg-blue-600 text-white rounded-xl font-black uppercase tracking-widest text-xs hover:bg-blue-700 transition-all">
              Renew Plan
            </button>
          )}
          <button 
            onClick={() => auth.signOut()}
            className="px-8 py-3 bg-slate-900 text-white rounded-xl font-black uppercase tracking-widest text-xs hover:bg-slate-800 transition-all"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  // ENFORCEMENT: ONLY users with phone number linked in database are allowed
  if (!profile.phone) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 p-6 text-center">
        <div className="w-20 h-20 bg-amber-100 text-amber-600 rounded-3xl flex items-center justify-center mb-6">
          <ShieldAlert className="w-10 h-10" />
        </div>
        <h1 className="text-2xl font-black text-slate-900 mb-2">Registration Incomplete</h1>
        <p className="text-slate-500 font-bold max-w-md">
          you are not authorised by the superadmin (No phone number linked to your profile)
        </p>
        <button 
          onClick={() => auth.signOut()}
          className="mt-8 px-8 py-3 bg-slate-900 text-white rounded-xl font-black uppercase tracking-widest text-xs hover:bg-slate-800 transition-all"
        >
          Sign Out
        </button>
      </div>
    );
  }

  if (adminOnly && !isSuperAdmin) return <Navigate to="/dashboard" />;
  
  return <Layout>{children}</Layout>;
};

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <ScrollToTop />
        <div className="min-h-screen bg-slate-50">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<BakerySignup />} />
            <Route path="/dashboard/users" element={
              <ProtectedRoute adminOnly>
                <SuperAdminDashboard view="users" />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/logs" element={
              <ProtectedRoute adminOnly>
                <SuperAdminDashboard view="logs" />
              </ProtectedRoute>
            } />
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <DashboardHome />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/orders" element={
              <ProtectedRoute>
                <BakeryAdminDashboard view="orders" />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/production" element={
              <ProtectedRoute>
                <BakeryAdminDashboard view="production" />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/summary" element={
              <ProtectedRoute>
                <BakeryAdminDashboard view="summary" />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/custom-cakes" element={
              <ProtectedRoute>
                <BakeryAdminDashboard view="custom-cakes" />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/chocolates" element={
              <ProtectedRoute>
                <BakeryAdminDashboard view="chocolates" />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/dealers" element={
              <ProtectedRoute>
                <BakeryAdminDashboard view="dealers" />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/staff" element={
              <ProtectedRoute>
                <StaffRouteSelector />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/analytics" element={
              <ProtectedRoute>
                <BakeryAdminDashboard view="analytics" />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/billing" element={
              <ProtectedRoute>
                <BakeryAdminDashboard view="billing" />
              </ProtectedRoute>
            } />
            <Route path="/admin/orders/:orderId/design-quote" element={
              <ProtectedRoute>
                <DesignQuote />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/customers" element={
              <ProtectedRoute>
                <BakeryAdminDashboard view="customers" />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/settings" element={
              <ProtectedRoute>
                <BakeryAdminDashboard view="settings" />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/catalog" element={
              <ProtectedRoute>
                {/* Dynamically select dashboard based on role */}
                <CatalogRouteSelector />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/history" element={
              <ProtectedRoute>
                <HistoryRouteSelector />
              </ProtectedRoute>
            } />
            <Route path="/admin/dragees-cost-setup" element={
              <ProtectedRoute>
                <DrageesCostSetup />
              </ProtectedRoute>
            } />
            <Route path="/production/batch/:batchId/tracking" element={
              <ProtectedRoute>
                <ProductionTimeTracking />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/dragees-cost" element={
              <ProtectedRoute>
                <BakeryAdminDashboard view="dragees-cost" />
              </ProtectedRoute>
            } />
            <Route path="/dashboard/dragees-production" element={
              <ProtectedRoute>
                <BakeryAdminDashboard view="dragees-production" />
              </ProtectedRoute>
            } />
            <Route path="/" element={<Navigate to="/dashboard" />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

const CatalogRouteSelector = () => {
  const { profile } = useAuth();
  if (profile?.role === 'dealer' || profile?.role === 'dealer_admin' || profile?.role === 'dealer_staff') return <DealerDashboard view="catalog" />;
  return <BakeryAdminDashboard view="catalog" />;
};

const HistoryRouteSelector = () => {
  const { profile } = useAuth();
  if (profile?.role === 'dealer' || profile?.role === 'dealer_admin' || profile?.role === 'dealer_staff') return <DealerDashboard view="history" />;
  return <Navigate to="/dashboard" />;
};

const StaffRouteSelector = () => {
  const { profile } = useAuth();
  if (profile?.role === 'dealer' || profile?.role === 'dealer_admin') return <DealerDashboard view="staff" />;
  return <BakeryAdminDashboard view="staff" />;
};
