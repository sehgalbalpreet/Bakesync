
import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { UserProfile, Bakery, UserRole } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  bakery: Bakery | null;
  loading: boolean;
  isSuperAdmin: boolean;
  // Super Admin "Login As" state
  impersonatedProfile: UserProfile | null;
  impersonatedBakery: Bakery | null;
  impersonate: (profile: UserProfile, bakery: Bakery) => void;
  stopImpersonating: () => void;
  loginManual: (profile: UserProfile) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [manualProfile, setManualProfile] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem('bakesync_manual_profile');
      if (!saved) return null;
      return JSON.parse(saved);
    } catch (err) {
      console.warn('Failed to parse manual profile:', err);
      localStorage.removeItem('bakesync_manual_profile');
      return null;
    }
  });
  const [bakery, setBakery] = useState<Bakery | null>(null);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  // Milestone logging for debugging "warming up" issues
  const logMilestone = (msg: string) => {
    console.log(`[AuthContext] ${msg} at ${new Date().toLocaleTimeString()}`);
  }

  const [impersonatedProfile, setImpersonatedProfile] = useState<UserProfile | null>(null);
  const [impersonatedBakery, setImpersonatedBakery] = useState<Bakery | null>(null);

  useEffect(() => {
    logMilestone('Initializing Auth Listener');
    
    // Safety Force Stop Loading after 8 seconds to prevent permanent "warming up" hang
    const safetyTimer = setTimeout(() => {
      if (loading) {
        logMilestone('SAFETY TRIGGER: Auth initialization took too long. Forcing app start.');
        setLoading(false);
      }
    }, 8000);

    const fetchBakery = async (bakeryId: string) => {
      try {
        logMilestone(`Fetching bakery ${bakeryId}`);
        const bakeryDoc = await getDoc(doc(db, 'bakeries', bakeryId));
        if (bakeryDoc.exists()) {
          setBakery({ id: bakeryDoc.id, ...bakeryDoc.data() } as Bakery);
        }
      } catch (error) {
        console.error("Error fetching bakery:", error);
      }
    };

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      logMilestone(`Auth State changed: ${firebaseUser ? 'User UID: ' + firebaseUser.uid : 'No User'}`);
      setLoading(true);
      setUser(firebaseUser);
      
      try {
        if (firebaseUser) {
          // Auto-sync super admin record
          if (firebaseUser.email === 'sehgalbalpreet@gmail.com') {
            logMilestone('Super Admin Identified. Syncing admin doc.');
            await setDoc(doc(db, 'admins', firebaseUser.uid), {
              email: firebaseUser.email,
              lastLogin: new Date().toISOString(),
              role: 'super_admin'
            }, { merge: true }).catch(err => console.warn("Admin sync failed (expected if rules not matching yet):", err));
          }

          logMilestone('Fetching profile from Firestore');
          const profileDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
          if (profileDoc.exists()) {
            const profileData = profileDoc.data() as UserProfile;
            logMilestone(`Profile found (role: ${profileData.role})`);
            setProfile(profileData);
            if (profileData.bakeryId) {
              logMilestone('Fetching bakery details');
              const bDoc = await getDoc(doc(db, 'bakeries', profileData.bakeryId));
              if (bDoc.exists()) {
                const bData = bDoc.data() as Bakery;
                
                // Subscription Logic
                let status = bData.subscriptionStatus;
                
                // Auto-expire trial if past date
                if (status === 'trial' && bData.subscriptionEndsAt) {
                  const end = bData.subscriptionEndsAt.toDate();
                  if (new Date() > end) {
                    status = 'expired';
                    if (profileData.role === 'bakery_admin' || profileData.role === 'super_admin') {
                      await updateDoc(doc(db, 'bakeries', bDoc.id), { subscriptionStatus: 'expired' }).catch(e => console.error("Could not auto-expire trial:", e));
                    }
                  }
                }

                setBakery({ id: bDoc.id, ...bData, subscriptionStatus: status } as Bakery);
              }
            }
            // Clear manual profile if Google user is found
            setManualProfile(null);
            localStorage.removeItem('bakesync_manual_profile');
          } else {
            logMilestone('No Firestore profile found for this Google user');
            setProfile(null);
            setBakery(null);
          }
        } else if (manualProfile) {
          logMilestone('Handling Manual PIN Profile');
          if (manualProfile.bakeryId) {
            await fetchBakery(manualProfile.bakeryId);
          }
        } else {
          logMilestone('No authenticated session');
          setProfile(null);
          setBakery(null);
          setImpersonatedProfile(null);
          setImpersonatedBakery(null);
        }
      } catch (error) {
        console.error("Auth Listener Error:", error);
        setInitError("Network sync is taking longer than usual...");
      } finally {
        logMilestone('Initialization Sequence Complete');
        setLoading(false);
        clearTimeout(safetyTimer);
      }
    });

    return () => {
      unsubscribe();
      clearTimeout(safetyTimer);
    };
  }, [manualProfile]);

  const loginManual = (profile: UserProfile) => {
    setManualProfile(profile);
    localStorage.setItem('bakesync_manual_profile', JSON.stringify(profile));
  };

  const logout = async () => {
    await auth.signOut();
    setManualProfile(null);
    localStorage.removeItem('bakesync_manual_profile');
  };

  const impersonate = (profile: UserProfile, bakery: Bakery) => {
    if (profile?.role === 'super_admin' || isSuperAdmin) {
      setImpersonatedProfile(profile);
      setImpersonatedBakery(bakery);
    }
  };

  const stopImpersonating = () => {
    setImpersonatedProfile(null);
    setImpersonatedBakery(null);
  };

  const isSuperAdmin = (impersonatedProfile || manualProfile || profile)?.role === 'super_admin' || user?.email === 'sehgalbalpreet@gmail.com';

  const value = {
    user,
    profile: impersonatedProfile || manualProfile || profile,
    bakery: impersonatedBakery || bakery,
    loading,
    isSuperAdmin,
    impersonatedProfile,
    impersonatedBakery,
    impersonate,
    stopImpersonating,
    loginManual,
    logout
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
