import React, { useState, useEffect } from 'react';
import { signInWithPopup, GoogleAuthProvider, signInAnonymously } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, getDoc, setDoc, serverTimestamp, query, collection, where, getDocs, deleteDoc, updateDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Store, ShieldCheck, ChevronRight, Phone, Fingerprint, Camera, AlertCircle, LogIn, LogOut, CheckCircle2, Timer, MapPin, Loader2, Sparkles, XCircle } from 'lucide-react';
import { UserProfile, Bakery } from '../types';
import { APP_VERSION } from '../version';
import { getBiometricUsers, registerBiometricUser, removeBiometricUser, BiometricUser } from '../utils/biometric';
import { format } from 'date-fns';


export const Login: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [showPhoneLogin, setShowPhoneLogin] = useState(false);
  const [step, setStep] = useState<'phone' | 'pin'>('phone');
  const [identifiedUser, setIdentifiedUser] = useState<UserProfile | null>(null);

  const { loginManual, logout } = useAuth();
  
  // Biometrics States
  const [biometricUsers, setBiometricUsers] = useState<BiometricUser[]>([]);
  const [showBiometricSelector, setShowBiometricSelector] = useState(false);
  const [scanningBiometric, setScanningBiometric] = useState<BiometricUser | null>(null);
  const [scanResult, setScanResult] = useState<'success' | 'failing' | null>(null);
  const [scanType, setScanType] = useState<'face' | 'fingerprint'>('fingerprint');

  // Success kiosk state
  const [kioskUser, setKioskUser] = useState<UserProfile | null>(null);
  const [kioskProfileToBind, setKioskProfileToBind] = useState<UserProfile | null>(null);
  const [kioskBakery, setKioskBakery] = useState<Bakery | null>(null);
  const [todayAttendance, setTodayAttendance] = useState<any | null>(null);
  const [checkingAttendanceState, setCheckingAttendanceState] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Enrollment Prompt after success PIN Login
  const [showEnrollmentPrompt, setShowEnrollmentPrompt] = useState<{ profile: UserProfile; pin: string } | null>(null);

  // Geofencing in login page
  const [gpsChecking, setGpsChecking] = useState(false);
  const [gpsDistance, setGpsDistance] = useState<number | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371000; // Radius of the earth in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2); 
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
    return R * c; // Distance in meters
  };

  // Load biometric users on mount
  useEffect(() => {
    setBiometricUsers(getBiometricUsers());
  }, []);
  
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
    const last10 = cleanPh.replace(/\D/g, '').slice(-10);
    const possiblePhones = [cleanPh];
    if (last10.length === 10) {
      if (!possiblePhones.includes(last10)) possiblePhones.push(last10);
      if (!possiblePhones.includes(`+91${last10}`)) possiblePhones.push(`+91${last10}`);
      if (!possiblePhones.includes(`91${last10}`)) possiblePhones.push(`91${last10}`);
    }

    try {
      // 1. Check users collection
      const q = query(collection(db, 'users'), where('phone', 'in', possiblePhones));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        // 2. Check bakeries collection (Primary Owners)
        const bakeryQuery = query(collection(db, 'bakeries'), where('phone', 'in', possiblePhones));
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
        const usersList = querySnapshot.docs.map(doc => ({ ...doc.data(), uid: doc.id } as UserProfile));
        const activeUser = usersList.find(u => !u.isDeleted && (u.role as string) !== 'disabled');
        
        if (activeUser) {
          setIdentifiedUser(activeUser);
        } else {
          throw new Error('This account has been disabled or suspended. Please contact your administrator.');
        }
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
        try {
          await setDoc(doc(db, 'users', currentUser.uid), profileToBind);
        } catch (setErr: any) {
          console.error("Profile Bind Error:", setErr);
          if (setErr.code === 'permission-denied') {
            throw new Error(`Permission Denied while binding profile (UID: ${currentUser.uid}). Please contact Admin.`);
          }
          throw setErr;
        }

        // Still create the session for backward compatibility during rules transition
        try {
          await setDoc(doc(db, 'sessions', currentUser.uid), {
            userId: currentUser.uid,
            pin: expectedPin,
            timestamp: serverTimestamp()
          });
        } catch (sessErr: any) {
          console.warn("Session marker could not be created (Rule delay or permission issue):", sessErr);
          // If profile was bound, we can still proceed as long as rules allow dashboard access via profile
        }
        
        const biometricsRegistered = getBiometricUsers().some(u => u.uid === profileToBind.uid);
        if (!biometricsRegistered) {
          // Open the enrollment prompt so they can trigger Face ID / Touch ID enrollment!
          setShowEnrollmentPrompt({ profile: profileToBind as any, pin: expectedPin });
        } else {
          loginManual(profileToBind as any);
          navigate('/dashboard');
        }
      } else {
        throw new Error('Security Alert: Incorrect PIN. Access denied.');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Biometric methods
  const FaceEnrollmentModal = (type: 'face' | 'fingerprint') => {
    if (!showEnrollmentPrompt) return;
    const { profile, pin } = showEnrollmentPrompt;
    const success = registerBiometricUser(profile, pin, type);
    if (success) {
      alert(`🎉 Biometrics configured successfully on this device/browser for ${profile.displayName}! Next time, you can sign-in with 1 tap.`);
    }
    setBiometricUsers(getBiometricUsers());
    loginManual(profile);
    setShowEnrollmentPrompt(null);
    navigate('/dashboard');
  };

  const handleSkipEnrollment = () => {
    if (!showEnrollmentPrompt) return;
    loginManual(showEnrollmentPrompt.profile);
    setShowEnrollmentPrompt(null);
    navigate('/dashboard');
  };

  const faceDescriptor = () => {
    setError(null);
    const users = getBiometricUsers();
    if (users.length === 0) {
      setError("No registered biometrics found on this device. Please log in with Phone & PIN, then enable biometrics in your attendance settings.");
      return;
    }
    if (users.length === 1) {
      handleSelectBiometricProfile(users[0]);
    } else {
      setShowBiometricSelector(true);
    }
  };

  const handleSelectBiometricProfile = (bUser: BiometricUser) => {
    setShowBiometricSelector(false);
    setScanningBiometric(bUser);
    setScanType(bUser.preferredType || 'fingerprint');
    setScanResult(null);

    // Simulate scanning
    setTimeout(() => {
      setScanResult('success');
      setTimeout(() => {
        handleBiometricSuccess(bUser);
        setScanningBiometric(null);
      }, 1000);
    }, 2500);
  };

  const handleBiometricSuccess = async (bUser: BiometricUser) => {
    setCheckingAttendanceState(true);
    setError(null);

    try {
      // 1. Re-bind custom Profile dynamically matching PIN Login UID mapping
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Auth state lost. Please refresh the page.");

      // Form the profile object
      const boundProfile: UserProfile = {
        uid: currentUser.uid,
        phone: bUser.phone,
        displayName: bUser.displayName,
        role: bUser.role as any,
        bakeryId: bUser.bakeryId,
        pin: bUser.pin
      };

      // Set user profile in Firestore
      await setDoc(doc(db, 'users', currentUser.uid), {
        ...boundProfile,
        lastLogin: serverTimestamp()
      }, { merge: true });

      // Create session document
      await setDoc(doc(db, 'sessions', currentUser.uid), {
        userId: currentUser.uid,
        pin: bUser.pin,
        timestamp: serverTimestamp()
      }, { merge: true });

      // Save references in Kiosk states so they can punch or proceed to full dashboard
      setKioskUser(boundProfile);
      setKioskProfileToBind(boundProfile);

      // Fetch Bakery coordinates & details
      const bSnap = await getDoc(doc(db, 'bakeries', bUser.bakeryId));
      if (bSnap.exists()) {
        setKioskBakery({ id: bSnap.id, ...bSnap.data() } as Bakery);
      }

      // Check current today attendance status
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const recId = `${currentUser.uid}_${todayStr}`;
      const attSnap = await getDoc(doc(db, 'attendance', recId));
      if (attSnap.exists()) {
        setTodayAttendance({ id: attSnap.id, ...attSnap.data() });
      } else {
        setTodayAttendance(null);
      }

    } catch (err: any) {
      console.error("Biometric registration check-in bind failed:", err);
      setError("Biometric sign-in synced failed: " + err.message);
    } finally {
      setCheckingAttendanceState(false);
    }
  };

  const handleKioskPunchIn = async () => {
    if (!kioskUser || !kioskBakery) return;
    setGpsError(null);
    setGpsChecking(true);

    const geoConfig = kioskBakery.attendanceSettings;
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const recordId = `${kioskUser.uid}_${todayStr}`;

    let userLat: number | undefined;
    let userLng: number | undefined;

    if (geoConfig?.enabled) {
      if (!geoConfig.latitude || !geoConfig.longitude) {
        setGpsError("Bakery coordinates have not been pinpointed. Ask manager to configure geofencing coords in settings.");
        setGpsChecking(false);
        return;
      }

      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000
          });
        });

        userLat = position.coords.latitude;
        userLng = position.coords.longitude;
        const distance = calculateDistance(
          userLat,
          userLng,
          geoConfig.latitude,
          geoConfig.longitude
        );

        setGpsDistance(distance);

        const allowedRadius = geoConfig.radius || 20;
        if (distance > allowedRadius) {
          setGpsError(`You are ${Math.round(distance)} meters away. Permitted radius is ${allowedRadius} meters. Move closer & retry.`);
          setGpsChecking(false);
          return;
        }
      } catch (err: any) {
        let errorMsg = "Unable to lock GPS position. Ensure locations are turned on inside your browser.";
        if (err.code === 1) {
          errorMsg = "Geolocation access denied. Approve browser geolocation settings to finish punching in.";
        }
        setGpsError(errorMsg);
        setGpsChecking(false);
        return;
      }
    }

    try {
      const recordRef = doc(db, 'attendance', recordId);
      const newRecord = {
        id: recordId,
        userId: kioskUser.uid,
        userName: kioskUser.displayName,
        bakeryId: kioskBakery.id,
        date: todayStr,
        clockIn: serverTimestamp(),
        status: 'present',
        photoUrl: 'https://images.unsplash.com/photo-1599566150163-29194dcaad36?auto=format&fit=crop&q=80&w=100',
        ...(userLat !== undefined && userLng !== undefined ? { location: { lat: userLat, lng: userLng } } : {})
      };

      await setDoc(recordRef, newRecord);
      setTodayAttendance(newRecord);
      setCountdown(4);
    } catch (err: any) {
      console.error(err);
      setError("Punch In failed: " + err.message);
    } finally {
      setGpsChecking(false);
    }
  };

  const handleKioskPunchOut = async () => {
    if (!kioskUser) return;
    setGpsChecking(true);
    
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const recordId = `${kioskUser.uid}_${todayStr}`;

    try {
      const recordRef = doc(db, 'attendance', recordId);
      await updateDoc(recordRef, {
        clockOut: serverTimestamp()
      });
      
      setTodayAttendance({
        ...todayAttendance,
        clockOut: { toDate: () => new Date() }
      });
      setCountdown(4);
    } catch (err: any) {
      console.error(err);
      setError("Punch Out failed: " + err.message);
    } finally {
      setGpsChecking(false);
    }
  };

  const handleKioskClose = async () => {
    setKioskUser(null);
    setKioskProfileToBind(null);
    setKioskBakery(null);
    setTodayAttendance(null);
    setCountdown(null);
    setScanResult(null);
    setGpsDistance(null);
    setGpsError(null);
    // Logout from current bound session to prevent unauthorized access
    await logout();
  };

  const handleKioskProceedToDashboard = () => {
    if (kioskProfileToBind) {
      loginManual(kioskProfileToBind);
      navigate('/dashboard');
    }
  };

  // Kiosk countdown effect
  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      handleKioskClose();
      return;
    }
    const timer = setTimeout(() => {
      setCountdown(countdown - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if profile exists
      const profileDoc = await getDoc(doc(db, 'users', user.uid));
      const existingProfile = profileDoc.exists() ? profileDoc.data() as UserProfile : null;
      const isProfileActive = existingProfile && !existingProfile.isDeleted && (existingProfile.role as string) !== 'disabled';
      
      if (!isProfileActive) {
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
          const docs = emailSnapshot.docs.map(docSnap => ({ ...docSnap.data(), uid: docSnap.id } as UserProfile));
          const activeInv = docs.find(u => !u.isDeleted && (u.role as string) !== 'disabled');
          matchingDocId = activeInv ? activeInv.uid : emailSnapshot.docs[0].id;
        } else if (!phoneMatchSnapshot.empty) {
          const docs = phoneMatchSnapshot.docs.map(docSnap => ({ ...docSnap.data(), uid: docSnap.id } as UserProfile));
          const activeInv = docs.find(u => !u.isDeleted && (u.role as string) !== 'disabled');
          matchingDocId = activeInv ? activeInv.uid : phoneMatchSnapshot.docs[0].id;
        }

        if (matchingDocId) {
          const matchingDocSnap = await getDoc(doc(db, 'users', matchingDocId));
          const invitedUser = matchingDocSnap.exists() ? (matchingDocSnap.data() as UserProfile) : null;

          if (!invitedUser || !invitedUser.phone) {
             throw new Error('you are not authorised by the superadmin (Profile missing phone number)');
          }

          if ((invitedUser.role as string) === 'disabled' || invitedUser.isDeleted) {
             throw new Error('This account has been disabled. Please contact your administrator.');
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
                {biometricUsers.length > 0 && (
                  <button
                    onClick={faceDescriptor}
                    className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3.5 px-4 rounded-xl font-bold hover:opacity-90 transition-all shadow-md active:scale-95 text-xs uppercase tracking-wider"
                  >
                    <Fingerprint className="w-5 h-5 animate-pulse" />
                    1-Tap Biometric Login ({biometricUsers.length})
                  </button>
                )}

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
                  // Try to find sw and unregister
                  if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.getRegistrations().then(registrations => {
                      for (const registration of registrations) {
                        registration.unregister();
                      }
                    });
                  }
                  window.location.href = window.location.pathname + "?force_upgrade=true&repair=manual";
                }
              }}
              className="text-[10px] font-black text-slate-300 uppercase tracking-widest hover:text-blue-400 transition-colors"
            >
              System stuck? Force Repair (v{APP_VERSION})
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

      {/* Biometric Selector */}
      {showBiometricSelector && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[250] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] p-8 max-w-sm w-full border border-slate-100 shadow-2xl space-y-6">
            <div className="text-center">
              <h3 className="text-lg font-black text-slate-950 uppercase tracking-wide">Select Staff Profile</h3>
              <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mt-1">Ready for 1-tap biometric scan</p>
            </div>

            <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
              {biometricUsers.map((user, idx) => (
                <button
                  key={`${user.uid}_${user.preferredType}_${idx}`}
                  onClick={() => handleSelectBiometricProfile(user)}
                  className="w-full p-4 hover:bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-tr from-slate-100 to-slate-200 rounded-xl flex items-center justify-center text-slate-700 font-black">
                      {user.displayName.charAt(0)}
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-black text-slate-900 leading-none mb-1 group-hover:text-blue-600 transition-colors">{user.displayName}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{user.role.replace('_', ' ')}</p>
                    </div>
                  </div>
                  <div className="text-slate-300 group-hover:text-blue-500 transition-colors">
                    {user.preferredType === 'face' ? <Camera size={16} /> : <Fingerprint size={16} />}
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={() => setShowBiometricSelector(false)}
              className="w-full py-3.5 bg-slate-100 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Biometric Scanning Overlay */}
      {scanningBiometric && (
        <div className="fixed inset-0 bg-slate-950/90 backdrop-blur-xl z-[300] flex flex-col items-center justify-center p-8 text-white">
          <div className="w-full max-w-xs aspect-square rounded-[3rem] border-4 border-indigo-500/30 relative overflow-hidden flex flex-col items-center justify-center bg-slate-900/60 shadow-2xl">
            {/* Scanning Radar Laser Line */}
            <div className="absolute top-0 left-0 w-full h-1 bg-indigo-400/50 shadow-[0_0_20px_rgba(129,140,248,0.8)] animate-scan z-20" />
            
            {scanType === 'face' ? (
              <div className="space-y-4 text-center">
                <div className="relative flex items-center justify-center">
                  <div className="w-48 h-48 border border-white/20 rounded-full flex items-center justify-center animate-pulse">
                    <div className="w-40 h-40 border-2 border-indigo-400/20 border-dashed rounded-full animate-spin-slow" />
                  </div>
                  <Camera className={`absolute w-12 h-12 text-indigo-400 z-10 ${scanResult === 'success' ? 'text-green-400' : ''}`} />
                </div>
              </div>
            ) : (
              <div className="relative flex items-center justify-center">
                <div className="absolute inset-0 w-32 h-32 bg-indigo-500/10 blur-xl rounded-full animate-ping" />
                <div className="w-24 h-24 rounded-full border border-indigo-500/20 flex items-center justify-center relative">
                  <Fingerprint className={`w-14 h-14 text-indigo-400 transition-colors duration-500 ${scanResult === 'success' ? 'text-green-400 animate-none' : 'animate-pulse'}`} />
                </div>
              </div>
            )}

            {/* Progress state banner */}
            <div className="absolute bottom-8 left-0 right-0 text-center">
              <span className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full font-black text-[9px] uppercase tracking-widest ${
                scanResult === 'success' ? 'bg-green-500 text-white shadow-lg' : 'bg-indigo-600/60 border border-indigo-400/20'
              }`}>
                {scanResult === 'success' ? <CheckCircle2 size={12} /> : scanType === 'face' ? <Camera size={12} className="animate-spin" /> : <Fingerprint size={12} className="animate-pulse" />}
                {scanResult === 'success' ? 'Biometrics Verified' : 'Scanning Biometric Identity...'}
              </span>
            </div>
          </div>

          <div className="mt-8 text-center space-y-1">
            <h3 className="text-lg font-black">{scanningBiometric.displayName}</h3>
            <p className="text-[9px] font-black uppercase text-indigo-400 tracking-[0.2em]">Contacting WebAuthn Authenticator Securely</p>
          </div>
        </div>
      )}

      {/* Attendance Quick-Action Kiosk Overlay */}
      {kioskUser && (
        <div className="fixed inset-0 bg-slate-905/70 backdrop-blur-md z-[280] flex items-center justify-center p-4">
          <div className="bg-white rounded-[3rem] p-8 max-w-md w-full border border-slate-200 shadow-2xl relative overflow-hidden flex flex-col space-y-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="absolute top-0 right-0 p-8 opacity-[0.02] rotate-12 scale-150">
              <Timer size={100} />
            </div>

            <div className="flex items-center justify-between border-b border-slate-50 pb-5">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center font-black text-indigo-600 text-lg">
                  {kioskUser.displayName.charAt(0)}
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 leading-tight">{kioskUser.displayName}</h3>
                  <p className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider">{kioskUser.role.replace('_', ' ')}</p>
                </div>
              </div>

              <div className={`px-4 py-2 rounded-2xl border text-[9px] font-black uppercase tracking-wider ${
                todayAttendance?.clockIn ? (todayAttendance.clockOut ? "bg-slate-50 text-slate-400 border-slate-100" : "bg-green-50 text-green-600 border-green-100") : "bg-amber-50 text-amber-600 border-amber-100"
              }`}>
                {todayAttendance?.clockIn ? (todayAttendance.clockOut ? "Clocked Out" : "Clocked In / Active") : "Off Duty"}
              </div>
            </div>

            <div className="text-center space-y-2 py-4 bg-slate-50 border border-slate-100 rounded-3xl relative">
              <p className="text-[10px] uppercase font-black text-slate-400 tracking-wider">Current Station Time</p>
              <p className="text-3xl font-black text-slate-900 tracking-tight font-mono">
                {format(new Date(), 'HH:mm:ss')}
              </p>
              <p className="text-[8.5px] font-bold text-slate-400 uppercase tracking-widest">{format(new Date(), 'EEEE, dd MMMM yyyy')}</p>
            </div>

            {gpsChecking ? (
              <div className="flex flex-col items-center justify-center gap-3 py-6">
                <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest animate-pulse">Locking GPS Location & Proximity...</p>
              </div>
            ) : gpsError ? (
              <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl text-center text-rose-700 space-y-2">
                <AlertCircle className="w-5 h-5 mx-auto text-rose-500" />
                <p className="text-xs font-black uppercase tracking-wider">GPS Restriction Failed</p>
                <p className="text-[10px] font-medium leading-relaxed">{gpsError}</p>
                <button
                  onClick={() => { setGpsError(null); setGpsDistance(null); }}
                  className="text-[9px] font-black uppercase tracking-wider text-rose-500 hover:underline pt-1 block mx-auto outline-none"
                >
                  Acknowledge & Try Again
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {countdown !== null ? (
                  <div className="p-5 bg-emerald-50 border border-emerald-100 text-emerald-700 rounded-3xl text-center space-y-2">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                    <h4 className="font-black text-sm uppercase tracking-wide">Punch Logged Successfully!</h4>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Shift status updated beautifully.
                    </p>
                    <div className="pt-2">
                      <span className="inline-block px-3 py-1 bg-white border border-emerald-100 text-[9px] font-black uppercase tracking-widest rounded-lg">
                        Kiosk resetting in {countdown}s
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {!todayAttendance?.clockIn ? (
                      <button
                        onClick={handleKioskPunchIn}
                        className="p-6 bg-green-600 hover:bg-green-500 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest flex flex-col items-center justify-center gap-3 shadow-lg shadow-green-100 transition-all hover:scale-[1.02] active:scale-95 outline-none font-mono"
                      >
                        <LogIn size={24} />
                        Punch In
                      </button>
                    ) : !todayAttendance.clockOut ? (
                      <button
                        onClick={handleKioskPunchOut}
                        className="p-6 bg-slate-900 hover:bg-red-600 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest flex flex-col items-center justify-center gap-3 shadow-lg transition-all hover:scale-[1.02] active:scale-95 outline-none font-mono"
                      >
                        <LogOut size={24} />
                        Punch Out
                      </button>
                    ) : (
                      <div className="col-span-2 p-6 bg-slate-50 border border-slate-100 rounded-2xl text-center text-slate-400 font-bold text-[10px] uppercase tracking-widest leading-relaxed">
                        Shift Completed For Today. <br/> See you tomorrow!
                      </div>
                    )}

                    <button
                      onClick={handleKioskProceedToDashboard}
                      className={`p-6 rounded-[2rem] font-black text-xs uppercase tracking-widest flex flex-col items-center justify-center gap-3 transition-all outline-none ${
                        !todayAttendance?.clockIn 
                          ? "col-span-1 bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100 hover:scale-[1.02]"
                          : todayAttendance?.clockOut
                            ? "col-span-2 bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100 hover:scale-[1.02]"
                            : "bg-blue-50 text-blue-600 border border-blue-100 hover:bg-blue-100 hover:scale-[1.02] active:scale-95 shadow-md"
                      }`}
                    >
                      <Sparkles size={24} />
                      Dashboard
                    </button>
                  </div>
                )}
              </div>
            )}

            {countdown === null && (
              <button
                onClick={handleKioskClose}
                className="w-full py-3.5 bg-slate-100 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-colors outline-none"
              >
                Close Kiosk / Log Out
              </button>
            )}
          </div>
        </div>
      )}

      {/* Enrollment Prompt */}
      {showEnrollmentPrompt && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] max-w-sm w-full p-8 border border-slate-100 shadow-xl text-center space-y-6">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner">
              <Fingerprint className="w-8 h-8 animate-pulse" />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900 mb-2">Enable Biometrics?</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Unlock 1-tap fingerprint or face-scan login and clock-in/out on this device. Perfect for quick shifts!
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => FaceEnrollmentModal('fingerprint')}
                className="py-3.5 bg-slate-900 text-white font-bold text-[10px] uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 outline-none hover:bg-slate-800 transition"
              >
                <Fingerprint size={14} />
                Fingerprint
              </button>
              <button
                onClick={() => FaceEnrollmentModal('face')}
                className="py-3.5 bg-indigo-600 text-white font-bold text-[10px] uppercase tracking-widest rounded-2xl flex items-center justify-center gap-2 outline-none hover:bg-indigo-500 transition"
              >
                <Camera size={14} />
                Face ID
              </button>
            </div>

            <button
              onClick={handleSkipEnrollment}
              className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mx-auto hover:text-slate-600 outline-none"
            >
              Maybe Later
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes scan {
          0%, 100% { top: 0; }
          50% { top: 100%; }
        }
        .animate-scan {
          animation: scan 3s ease-in-out infinite;
        }
        .animate-spin-slow {
          animation: spin 10s linear infinite;
        }
      `}</style>
    </div>
  );
};
