import React, { useState, useEffect } from 'react';
import { signInWithPopup, GoogleAuthProvider, signInAnonymously } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp, query, collection, where, getDocs, deleteDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Store, ShieldCheck, ChevronRight, Phone } from 'lucide-react';
import { UserProfile, Bakery } from '../types';

export const Login: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [showPhoneLogin, setShowPhoneLogin] = useState(false);
  const [step, setStep] = useState<'phone' | 'pin'>('phone');
  const [identifiedUser, setIdentifiedUser] = useState<UserProfile | null>(null);

  const { loginManual } = useAuth();
  
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [initializingTooLong, setInitializingTooLong] = useState(false);

  const initAuth = async () => {
    try {
      if (!auth.currentUser) {
        await signInAnonymously(auth);
      } else {
        setIsAuthReady(true);
      }
    } catch (err) {
      console.error('Manual Init failed:', err);
      setError('Connection failed. Please check your network.');
    }
  };

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      if (user) {
        setIsAuthReady(true);
        setError(null);
      }
    });

    const init = async () => {
      try {
        if (!auth.currentUser) {
          // Attempt anonymous auth, but don't block the UI with an error message immediately
          // if it fails on page load (could be temporary network glitch).
          await signInAnonymously(auth);
        } else {
          setIsAuthReady(true);
        }
      } catch (err) {
        console.warn('Background Auth failed:', err);
        // Silent fail on background init to avoid scaring users on page load.
      }
    };

    init();

    const timer = setTimeout(() => {
      if (!auth.currentUser) {
        setInitializingTooLong(true);
      }
    }, 6000);

    return () => {
      unsub();
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const fetchISD = async () => {
      try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        if (data.country_calling_code && !phone) {
          setPhone(data.country_calling_code);
        }
      } catch (err) {
        console.warn('Geolocation ISD fetch failed:', err);
      }
    };
    if (showPhoneLogin) fetchISD();
  }, [showPhoneLogin]);

  const handlePhoneIdentification = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!isAuthReady) {
      setError('System is initializing, please wait a moment...');
      setLoading(false);
      return;
    }

    const cleanPh = phone.trim().replace(/\s/g, '');

    try {
      // 1. Check users collection
      const q = query(collection(db, 'users'), where('phone', '==', cleanPh));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        // 2. Check bakeries collection (Primary Owners)
        const bakeryQuery = query(collection(db, 'bakeries'), where('phone', '==', cleanPh));
        const bakerySnapshot = await getDocs(bakeryQuery);

        if (bakerySnapshot.empty) {
          throw new Error('This number is not registered. Please ask your administrator to add you as staff or partner.');
        } else {
          const b = bakerySnapshot.docs[0].data();
          setIdentifiedUser({
            uid: `owner_${bakerySnapshot.docs[0].id}`,
            displayName: b.name,
            email: b.adminEmail || '',
            role: 'bakery_admin',
            bakeryId: bakerySnapshot.docs[0].id,
            phone: cleanPh,
            pin: b.pin || '1234'
          } as any);
        }
      } else {
        const found = querySnapshot.docs[0].data() as UserProfile;
        setIdentifiedUser({ ...found, uid: querySnapshot.docs[0].id });
      }
      setStep('pin');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePinVerification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifiedUser) return;
    
    setLoading(true);
    setError(null);

    try {
      const expectedPin = identifiedUser.pin || '1234';
      
      if (pin === expectedPin) {
        const currentUser = auth.currentUser;
        if (!currentUser) throw new Error('Auth session lost. Please refresh.');

        // Bind the profile to this unique anonymous UID
        // This makes security rules MUCH faster and reliable (avoiding recursive get() calls)
        const profileToBind = {
          ...identifiedUser,
          uid: currentUser.uid,
          lastLogin: serverTimestamp()
        };

        // If the current document ID is different (first time login or new device), 
        // we create the new one and eventually the old one would be cleaned up or just left as a template
        // Actually, we should check if we need to migrate or just set the new one
        await setDoc(doc(db, 'users', currentUser.uid), profileToBind);

        // Still create the session for backward compatibility during rules transition
        await setDoc(doc(db, 'sessions', currentUser.uid), {
          userId: currentUser.uid,
          pin: expectedPin,
          timestamp: serverTimestamp()
        });
        
        loginManual(profileToBind);
        navigate('/dashboard');
      } else {
        throw new Error('Security Alert: Incorrect PIN. Access denied.');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if profile exists
      const profileDoc = await getDoc(doc(db, 'users', user.uid));
      
      if (!profileDoc.exists()) {
        // 1. Check if invited by Email
        const emailQuery = query(collection(db, 'users'), where('email', '==', user.email));
        const emailSnapshot = await getDocs(emailQuery);

        // 2. NEW: Check if invited by Phone (Deduplication)
        // Note: Google User might have phone number, but often we just rely on the user having been added by the admin previously
        // We'll also check if there's any user with the same phone if user.phoneNumber exists
        let phoneMatchSnapshot: any = { empty: true };
        if (user.phoneNumber) {
          const cleanGooglePhone = user.phoneNumber.replace(/\s/g, '');
          const phoneQuery = query(collection(db, 'users'), where('phone', '==', cleanGooglePhone));
          phoneMatchSnapshot = await getDocs(phoneQuery);
        }

        let assignedBakeryId = '';
        let assignedRole: any = 'bakery_admin';
        let extraData: any = {};
        let matchingDocId = '';

        if (!emailSnapshot.empty) {
          matchingDocId = emailSnapshot.docs[0].id;
        } else if (!phoneMatchSnapshot.empty) {
          matchingDocId = phoneMatchSnapshot.docs[0].id;
        }

        if (matchingDocId) {
          const matchingDoc = matchingDocId === emailSnapshot.docs[0]?.id ? emailSnapshot.docs[0] : phoneMatchSnapshot.docs[0];
          const invitedUser = matchingDoc.data();

          if (!invitedUser.phone) {
             throw new Error('you are not authorised by the superadmin (Profile missing phone number)');
          }

          assignedBakeryId = invitedUser.bakeryId;
          assignedRole = invitedUser.role;
          extraData = { ...invitedUser };
          // Keep important fields but overwrite IDs
          delete extraData.uid;
          
          // Delete the temporary "phone-only" record to replace with full Google UID record
          await deleteDoc(doc(db, 'users', matchingDocId));
        } else {
          // 3. Check if this is the Bakery Admin (Owner) invited by Super Admin
          const bakeriesQuery = query(collection(db, 'bakeries'), where('adminEmail', '==', user.email));
          const bakerySnapshot = await getDocs(bakeriesQuery);
          
          if (!bakerySnapshot.empty) {
            const bakeryData = bakerySnapshot.docs[0].data();
            if (!bakeryData.phone) {
              throw new Error('you are not authorised by the superadmin (Bakery missing contact number)');
            }
            assignedBakeryId = bakerySnapshot.docs[0].id;
          } else {
            // 4. Super Admin logic
            if (user.email === 'sehgalbalpreet@gmail.com') {
              assignedBakeryId = 'system';
              assignedRole = 'super_admin';
            } else {
              // No longer allowing auto-signup
              throw new Error('you are not authorised by the superadmin');
            }
          }
        }

        const profile: UserProfile = {
          uid: user.uid,
          email: user.email!,
          role: assignedRole,
          bakeryId: assignedBakeryId,
          displayName: user.displayName || 'User',
          ...extraData
        };

        await setDoc(doc(db, 'users', user.uid), profile);

        if (assignedRole === 'super_admin') {
           await setDoc(doc(db, 'admins', user.uid), { email: user.email });
        }
      }

      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message);
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
        <div className="p-8">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center">
              <Store className="w-10 h-10 text-blue-600" />
            </div>
          </div>
          
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-slate-900 mb-2">BakeSync SaaS</h1>
            <p className="text-slate-500">The central nervous system for your bakery operations.</p>
          </div>

          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl text-xs mb-6 flex items-start gap-3 border border-red-100 animate-in fade-in zoom-in duration-300">
              <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
              <div className="font-bold leading-relaxed">{error}</div>
            </div>
          )}

          <div className="space-y-4">
            {!showPhoneLogin ? (
              <>
                <button
                  onClick={handleGoogleLogin}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-3 bg-white border border-slate-300 py-3.5 px-4 rounded-xl font-bold text-slate-700 hover:bg-slate-50 transition-all disabled:opacity-50 shadow-sm active:scale-95"
                >
                  <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/layout/google.svg" alt="Google" className="w-5 h-5" />
                  {loading ? 'Authenticating...' : 'Sign in with Google'}
                </button>

                <div className="relative my-6 text-center">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
                  <span className="relative px-4 text-xs font-black uppercase text-slate-400 bg-white tracking-widest">or access via phone</span>
                </div>

                <button 
                  onClick={() => setShowPhoneLogin(true)}
                  className="w-full py-3.5 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 font-bold text-sm hover:border-blue-300 hover:text-blue-500 transition-all"
                >
                  STAFF LOGIN (PHONE NUMBER)
                </button>

                <div className="pt-4 text-center">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Bakery Owner?</p>
                  <button 
                    onClick={() => navigate('/signup')}
                    className="text-xs font-bold text-blue-600 hover:underline"
                  >
                    Click here to register your bakery
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={step === 'phone' ? handlePhoneIdentification : handlePinVerification} className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
                {step === 'phone' ? (
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Pre-Approved Phone Number</label>
                    <div className="relative">
                      <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                      <input 
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-11 pr-4 py-3.5 font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all font-mono"
                        placeholder="+91..."
                      />
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="mb-4 p-3 bg-blue-50 rounded-xl border border-blue-100 flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">{identifiedUser?.displayName.charAt(0)}</div>
                      <div>
                        <p className="text-xs font-black text-blue-900 leading-none mb-1">{identifiedUser?.displayName}</p>
                        <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">{identifiedUser?.role.replace('_', ' ')} Identified</p>
                      </div>
                    </div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1 text-center">Enter 4-Digit Login PIN</label>
                    <input 
                      type="password"
                      maxLength={4}
                      required
                      autoFocus
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 font-black outline-none focus:ring-2 focus:ring-blue-500 transition-all text-center text-2xl tracking-[1em]"
                      placeholder="••••"
                    />
                  </div>
                )}
                
                <button 
                  type="submit"
                  disabled={loading || !isAuthReady}
                  className="w-full bg-blue-600 text-white py-4 rounded-xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 disabled:opacity-50"
                >
                  {loading ? 'VERIFYING...' : !isAuthReady ? 'INITIALIZING...' : step === 'phone' ? 'NEXT: ENTER PIN' : 'LOGIN TO STATION'}
                </button>

                {!isAuthReady && initializingTooLong && (
                  <button
                    type="button"
                    onClick={initAuth}
                    className="w-full py-2 text-[10px] font-black text-blue-600 uppercase tracking-widest hover:underline"
                  >
                    System Slow? Click to Re-connect
                  </button>
                )}

                <button 
                  type="button"
                  onClick={() => {
                    if (step === 'pin') setStep('phone');
                    else setShowPhoneLogin(false);
                  }}
                  className="w-full py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600"
                >
                  {step === 'pin' ? '← Wrong Number?' : 'Back to Main Login'}
                </button>
              </form>
            )}
          </div>

          <p className="text-center mt-8 text-xs text-gray-400">
            By signing in, you agree to our Terms of Service and Privacy Policy.
          </p>
          <div className="mt-4 text-center">
            <button 
              onClick={() => {
                if(confirm("EMERGENCY REPAIR: This will clear your local browser cache and force the application to update. Recommended if you are seeing an old version or the app is stuck. Proceed?")) {
                  localStorage.clear();
                  sessionStorage.clear();
                  window.location.search = "force_upgrade=true&repair=manual";
                }
              }}
              className="text-[10px] font-black text-slate-300 uppercase tracking-widest hover:text-blue-400 transition-colors"
            >
              System stuck? Force Repair (v1.4.4)
            </button>
          </div>
        </div>
        
        <div className="bg-gray-50 px-8 py-4 flex items-center justify-between border-t border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-xs font-medium text-gray-500 tracking-wide uppercase">System Status: Live</span>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-300" />
        </div>
      </div>
    </div>
  );
};
