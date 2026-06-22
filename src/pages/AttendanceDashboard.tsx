import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  setDoc, 
  addDoc,
  serverTimestamp, 
  getDoc,
  updateDoc,
  orderBy,
  limit
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { AttendanceRecord } from '../types';
import { 
  Clock, 
  Camera, 
  CheckCircle2, 
  XCircle, 
  Calendar, 
  User, 
  AlertCircle,
  Timer,
  LogIn,
  LogOut,
  MapPin,
  ChevronRight,
  Fingerprint
} from 'lucide-react';
import { format, isToday, startOfMonth, endOfMonth } from 'date-fns';
import { cn } from '../lib/utils';
import { loadFaceModels, getFaceDescriptorFromVideo, compareFaceDescriptors } from '../utils/biometric';
import { FaceEnrollmentModal } from '../components/FaceEnrollmentModal';


const getDistanceInMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const R = 6371000; // Radius of the earth in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
    ; 
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); 
  const d = R * c; // Distance in meters
  return d;
};

export const AttendanceDashboard: React.FC = () => {
  const { profile, bakery, user } = useAuth();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<'success' | 'failing' | null>(null);
  const [loading, setLoading] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const [checkingLocation, setCheckingLocation] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsDistance, setGpsDistance] = useState<number | null>(null);
  const [faceErrorMsg, setFaceErrorMsg] = useState<string | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [showEnrollModal, setShowEnrollModal] = useState(false);

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const recordId = `${profile?.uid}_${todayStr}`;

  // Geofence background tracking states
  const [currentTrackingDistance, setCurrentTrackingDistance] = useState<number | null>(null);
  const [trackingError, setTrackingError] = useState<string | null>(null);

  // Background Geofence Tracking Effect
  useEffect(() => {
    if (!profile || !bakery || !todayRecord || todayRecord.clockOut) {
      setCurrentTrackingDistance(null);
      return;
    }

    const geoConfig = bakery.attendanceSettings;
    if (!geoConfig?.enabled || !geoConfig.latitude || !geoConfig.longitude) {
      return;
    }

    const checkLocationInterval = async () => {
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000
          });
        });

        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;
        const distance = getDistanceInMeters(
          userLat,
          userLng,
          geoConfig.latitude,
          geoConfig.longitude
        );

        setCurrentTrackingDistance(distance);
        setTrackingError(null);

        await processAwayStatus(distance, userLat, userLng);
      } catch (err: any) {
        console.error("Background Location Check Error:", err);
        setTrackingError("Failed to auto-update periodic GPS location check.");
      }
    };

    // Run first position check
    checkLocationInterval();

    // Check periodically (every 30 seconds)
    const intervalId = setInterval(checkLocationInterval, 30000);

    return () => clearInterval(intervalId);
  }, [profile?.uid, bakery?.id, todayRecord?.clockIn ? 1 : 0, todayRecord?.clockOut ? 1 : 0, todayRecord?.awaySince ? 1 : 0]);

  const processAwayStatus = async (distance: number, userLat: number, userLng: number) => {
    if (!profile || !bakery || !todayRecord || todayRecord.clockOut) return;

    const isAway = distance >= 1000; // 1 Km threshold
    const recordRef = doc(db, 'attendance', recordId);

    if (isAway) {
      const now = new Date();
      if (!todayRecord.awaySince) {
        // Just went away
        await updateDoc(recordRef, {
          awaySince: serverTimestamp(),
          lastCheckedLocation: {
            lat: userLat,
            lng: userLng,
            distance: distance,
            timestamp: serverTimestamp()
          }
        });
      } else {
        // Already away, check elapsed time
        const awaySinceDate = todayRecord.awaySince.toDate();
        const elapsedMs = now.getTime() - awaySinceDate.getTime();
        const elapsedHours = elapsedMs / (1000 * 60 * 60);

        if (elapsedHours >= 1) {
          await forceAutoLogoff(distance, userLat, userLng, Math.round(elapsedMs / 60000));
        }
      }
    } else {
      // Returned under range
      if (todayRecord.awaySince) {
        await updateDoc(recordRef, {
          awaySince: null,
          lastCheckedLocation: {
            lat: userLat,
            lng: userLng,
            distance: distance,
            timestamp: serverTimestamp()
          }
        });
      }
    }
  };

  const forceAutoLogoff = async (
    distance: number, 
    userLat: number, 
    userLng: number, 
    awayMinutes: number
  ) => {
    if (!profile || !bakery || !todayRecord || todayRecord.clockOut) return;

    setLoading(true);
    try {
      const recordRef = doc(db, 'attendance', recordId);
      const isOfficialDuty = !!todayRecord.outOfOfficeDuty;

      // 1. Mark attendance as clocked out (logoff)
      await updateDoc(recordRef, {
        clockOut: serverTimestamp(),
        autoClockedOut: true,
        notes: `Automatically clocked out by Geofence. Reason: Worker was away from premises (> 1km away) for more than 1 hour. Total away duration: ${awayMinutes} minutes. Official Office Duty: ${isOfficialDuty ? 'YES' : 'NO'}.`
      });

      // 2. Create alert notification for admin
      const notificationId = `geofence_${profile.uid}_${Date.now()}`;
      await setDoc(doc(db, 'notifications', notificationId), {
        id: notificationId,
        bakeryId: bakery.id,
        title: `🚨 Team Geofence Logoff: ${profile.displayName}`,
        message: `${profile.displayName} was automatically clocked out of duty. Reason: worker moved more than 1 km away (${Math.round(distance)} meters) for ${awayMinutes} minutes. Status was: ${isOfficialDuty ? 'On Official Out-of-Office Duty' : 'Absent without admin notice/notice missing'}.`,
        type: 'attendance_alert',
        createdAt: serverTimestamp(),
        read: false,
        metadata: {
          userId: profile.uid,
          userName: profile.displayName || 'Staff',
          reason: isOfficialDuty ? 'office_duty' : 'no_notice',
          awayDurationMinutes: awayMinutes,
          distance: Math.round(distance)
        }
      });

      alert(`Safety Check: You have been automatically clocked out because you were away from the bakery premises for more than 1 hour (${isOfficialDuty ? 'On Official Duty' : 'Absent without Admin Notice'}).`);

    } catch (err) {
      console.error("Force Auto Logoff Error:", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleOutOfOfficeDuty = async (enabled: boolean) => {
    if (!todayRecord) return;
    try {
      const recordRef = doc(db, 'attendance', recordId);
      await updateDoc(recordRef, {
        outOfOfficeDuty: enabled
      });
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (!profile?.uid || !bakery?.id) return;

    // Listen to today's record
    const unsubToday = onSnapshot(doc(db, 'attendance', recordId), (doc) => {
      if (doc.exists()) {
        setTodayRecord({ id: doc.id, ...doc.data() } as AttendanceRecord);
      } else {
        setTodayRecord(null);
      }
    }, (err) => {
      console.error("Today record subscription failed:", err);
    });

    // Listen to recent records - remove orderBy to bypass missing composite index errors on custom fields
    const q = query(
      collection(db, 'attendance'),
      where('userId', '==', profile.uid),
      limit(30)
    );

    const unsubHistory = onSnapshot(q, (snap) => {
      const parsed = snap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceRecord));
      // Sort in-memory by date descending
      parsed.sort((a, b) => b.date.localeCompare(a.date));
      setRecords(parsed);
      setLoading(false);
    }, (err) => {
      console.error("History subscription failed:", err);
      setLoading(false);
    });

    return () => {
      unsubToday();
      unsubHistory();
    };
  }, [profile?.uid, bakery?.id]);

  const startCamera = async () => {
    setScanning(true);
    setScanResult(null);
    setGpsError(null);
    setGpsDistance(null);
    setCheckingLocation(false);
    setFaceErrorMsg(null);

    if (!profile?.faceDescriptor) {
      setFaceErrorMsg("Face not enrolled yet. Ask your admin to enroll your face, or use PIN login instead.");
      setScanResult('failing');
      setScanning(false);
      return;
    }

    try {
      setModelsLoading(true);
      await loadFaceModels();
      setModelsLoading(false);

      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await new Promise(resolve => {
          if (videoRef.current) videoRef.current.onloadedmetadata = resolve;
        });
      }

      // Give the camera a moment to stabilize/focus before capturing
      setTimeout(async () => {
        if (!videoRef.current) {
          setScanResult('failing');
          setFaceErrorMsg("Camera not ready. Please try again.");
          return;
        }

        const { descriptor, error } = await getFaceDescriptorFromVideo(videoRef.current);

        if (!descriptor) {
          setScanResult('failing');
          setFaceErrorMsg(error || "Could not detect a face. Please try again.");
          return;
        }

        const { distance, isMatch } = compareFaceDescriptors(descriptor, profile.faceDescriptor!);

        if (isMatch) {
          setScanResult('success');
        } else {
          setScanResult('failing');
          setFaceErrorMsg(`Face did not match enrolled profile (confidence gap: ${distance.toFixed(2)}). Please try again or use PIN.`);
        }
      }, 1200);

    } catch (err) {
      console.error("Camera error:", err);
      setFaceErrorMsg("Could not access camera. Please check permissions.");
      setScanResult('failing');
      setModelsLoading(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setScanning(false);
  };

  const handleClockIn = async () => {
    if (!profile || !bakery) return;
    
    setGpsError(null);
    setCheckingLocation(true);

    const geoConfig = bakery.attendanceSettings;
    if (geoConfig?.enabled) {
      if (!geoConfig.latitude || !geoConfig.longitude) {
        setGpsError("Bakery coordinates have not been pinpointed by the manager. Please ask admin to configure geofencing coords in settings.");
        setCheckingLocation(false);
        return;
      }

      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000
          });
        });

        const userLat = position.coords.latitude;
        const userLng = position.coords.longitude;
        const distance = getDistanceInMeters(
          userLat,
          userLng,
          geoConfig.latitude,
          geoConfig.longitude
        );

        setGpsDistance(distance);

        const allowedRadius = geoConfig.radius || 20;
        if (distance > allowedRadius) {
          setGpsError(`verification_failed: You are ${Math.round(distance)} meters away. Allowed range is ${allowedRadius} meters. Please move closer to the bakery and try again.`);
          setCheckingLocation(false);
          return;
        }

        // Successfully in boundaries! Save record with location
        setLoading(true);
        const newRecord: AttendanceRecord = {
          id: recordId,
          userId: profile.uid,
          userName: profile.displayName || 'Staff',
          bakeryId: bakery.id,
          date: todayStr,
          clockIn: serverTimestamp(),
          status: 'present',
          photoUrl: 'face_verified',
          location: {
            lat: userLat,
            lng: userLng
          }
        };

        await setDoc(doc(db, 'attendance', recordId), newRecord);
        setCheckingLocation(false);
        stopCamera();
      } catch (err: any) {
        console.error("GPS Verification Error:", err);
        let errorMsg = "Unable to acquire precise GPS coordinates. Please ensure location services are turned on & reload.";
        if (err.code === 1) {
          errorMsg = "Location access denied. Please approve browser geolocation settings to finish checking in.";
        } else if (err.code === 3) {
          errorMsg = "Location lock timed out. Check your device's GPS signal strength and try again.";
        }
        setGpsError(errorMsg);
        setCheckingLocation(false);
        return;
      }
    } else {
      // Normal clock in (geofencing disabled)
      setLoading(true);
      try {
        const newRecord: AttendanceRecord = {
          id: recordId,
          userId: profile.uid,
          userName: profile.displayName || 'Staff',
          bakeryId: bakery.id,
          date: todayStr,
          clockIn: serverTimestamp(),
          status: 'present',
          photoUrl: geoConfig?.enabled ? 'face_verified' : undefined
        };

        await setDoc(doc(db, 'attendance', recordId), newRecord);
        stopCamera();
      } catch (err) {
        console.error("Clock-In Error:", err);
      } finally {
        setLoading(false);
        setCheckingLocation(false);
      }
    }
  };

  const handleClockOut = async () => {
    if (!todayRecord) return;
    
    setLoading(true);
    try {
      await updateDoc(doc(db, 'attendance', recordId), {
        clockOut: serverTimestamp()
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !todayRecord && records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-20 space-y-4">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">Syncing Attendance Log...</div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6 pb-24">
      {/* Welcome & Status */}
      <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-[0.03] scale-150 rotate-12">
          <Timer size={120} />
        </div>
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative z-10">
          <div>
            <h1 className="text-2xl font-black text-slate-900 leading-tight">
              {todayRecord?.clockIn ? "Working hard today?" : "Welcome back!"}
            </h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
              Production Unit • {format(new Date(), 'EEEE, dd MMMM yyyy')}
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className={cn(
              "px-6 py-4 rounded-3xl border flex flex-col items-center min-w-[120px]",
              todayRecord?.clockIn ? "bg-green-50 border-green-100 text-green-600" : "bg-slate-50 border-slate-100 text-slate-400"
            )}>
              <span className="text-[8px] font-black uppercase tracking-widest mb-1">Status</span>
              <span className="text-xs font-black uppercase">{todayRecord?.clockIn ? (todayRecord.clockOut ? 'Clocked Out' : 'Active Duty') : 'Off Duty'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Clock Control */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900 rounded-[3rem] p-10 text-white flex flex-col justify-between shadow-2xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          
          <div className="relative z-10 mb-12">
            <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mb-6">
              <Clock className="w-6 h-6 text-indigo-400" />
            </div>
            <h2 className="text-4xl font-black tracking-tight mb-2">Shift Control</h2>
            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Verify attendance via face scan</p>
          </div>

          <div className="relative z-10 space-y-4">
            {!todayRecord?.clockIn ? (
              <button 
                onClick={startCamera}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-[2rem] py-8 font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-95 shadow-xl shadow-indigo-900/40"
              >
                <LogIn size={20} />
                Clock In Now
              </button>
            ) : !todayRecord.clockOut ? (
              <button 
                onClick={handleClockOut}
                className="w-full bg-slate-800 hover:bg-red-600 text-white rounded-[2rem] py-8 font-black uppercase tracking-widest flex items-center justify-center gap-3 transition-all group"
              >
                <LogOut size={20} className="group-hover:-translate-x-1 transition-transform" />
                End Shift
              </button>
            ) : (
              <div className="w-full bg-green-500/20 border border-green-500/30 text-green-400 rounded-[2rem] py-8 font-black uppercase tracking-widest flex items-center justify-center gap-3">
                <CheckCircle2 size={20} />
                Shift Completed
              </div>
            )}
          </div>
        </div>

        {/* Current Session Stats */}
        <div className="bg-white rounded-[3rem] border border-slate-200 p-8 flex flex-col justify-between shadow-sm">
          <div className="space-y-6">
             <div className="flex justify-between items-center pb-6 border-b border-slate-50">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Today's Session</p>
                <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-300">
                  <MapPin size={14} />
                </div>
             </div>

             <div className="grid grid-cols-2 gap-8">
               <div className="space-y-1">
                 <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Start Time</p>
                 <p className="text-2xl font-black text-slate-900">
                   {todayRecord?.clockIn ? format(todayRecord.clockIn.toDate(), 'HH:mm') : '--:--'}
                 </p>
               </div>
               <div className="space-y-1">
                 <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest">End Time</p>
                 <p className="text-2xl font-black text-slate-900 text-slate-300">
                   {todayRecord?.clockOut ? format(todayRecord.clockOut.toDate(), 'HH:mm') : '--:--'}
                 </p>
               </div>
             </div>

             <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-3xl flex items-center justify-between">
               <div className="flex items-center gap-3">
                 <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center shadow-sm">
                   <Timer className="text-indigo-600" size={18} />
                 </div>
                 <div>
                   <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">Shift Progress</p>
                   <p className="text-xs font-black text-indigo-900">
                     {todayRecord?.clockIn && !todayRecord.clockOut ? "Recording Hours..." : "0 Hours 0 Mins"}
                   </p>
                 </div>
               </div>
               <div className="h-10 w-1 bg-indigo-200 rounded-full" />
             </div>

             {todayRecord?.clockIn && !todayRecord.clockOut && (
               <div className="pt-4 border-t border-slate-100 mt-4 space-y-3">
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Duty Location Mode</p>
                 <div className="grid grid-cols-2 gap-2">
                   <button
                     type="button"
                     onClick={() => toggleOutOfOfficeDuty(false)}
                     className={cn(
                       "py-2.5 px-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all border flex items-center justify-center gap-2",
                       !todayRecord.outOfOfficeDuty 
                         ? "bg-indigo-600 text-white border-indigo-600 shadow-md"
                         : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                     )}
                   >
                     <span className="w-2 h-2 rounded-full bg-current" />
                     Office Premises
                   </button>
                   <button
                     type="button"
                     onClick={() => toggleOutOfOfficeDuty(true)}
                     className={cn(
                       "py-2.5 px-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all border flex items-center justify-center gap-2",
                       todayRecord.outOfOfficeDuty 
                         ? "bg-amber-600 text-white border-amber-600 shadow-md"
                         : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                     )}
                   >
                     <span className="w-2 h-2 rounded-full bg-current animate-pulse" />
                     Official Out
                   </button>
                 </div>
                 <p className="text-[8px] text-slate-400 font-bold leading-normal text-center">
                   🚨 Going &gt; 1km away for 1+ hours without declaring "Official Out duty" auto-logs you out.
                 </p>
               </div>
             )}
          </div>

          <div className="pt-6">
            <p className="text-[9px] font-bold text-slate-400 text-center leading-relaxed">
              Facing issues? Contact bakery administrator <br/> 
              <span className="text-slate-900">Support: {bakery?.phone || 'Central Helpdesk'}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Face Recognition Enrollment */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 p-8 shadow-sm space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 border border-indigo-100 flex items-center justify-center">
            <Fingerprint className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h3 className="text-slate-900 font-black uppercase text-xs tracking-widest">Face Recognition Login</h3>
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Used to verify your identity at clock-in</p>
          </div>
        </div>

        <div className="p-6 bg-slate-50 border border-slate-100 rounded-3xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-1">
            <p className="text-xs font-black text-slate-900">
              {profile?.faceDescriptor ? "✅ Face Enrolled" : "🔐 Face Not Enrolled Yet"}
            </p>
            <p className="text-[10px] text-slate-500 max-w-xl leading-relaxed">
              {profile?.faceDescriptor
                ? "Your face is registered. Clock-in will verify it's really you before marking attendance."
                : "Enroll your face once so future clock-ins can be verified automatically. You can always fall back to PIN."}
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowEnrollModal(true)}
              className="py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-[9px] font-black uppercase tracking-widest transition-colors flex items-center gap-2 outline-none"
            >
              <Camera size={12} />
              {profile?.faceDescriptor ? "Re-Enroll Face" : "Enroll Face"}
            </button>
          </div>
        </div>
      </div>

      {showEnrollModal && profile && (
        <FaceEnrollmentModal
          userId={profile.uid}
          userName={profile.displayName || 'Staff'}
          onClose={() => setShowEnrollModal(false)}
        />
      )}

      {/* Geofence Simulator Console */}
      {todayRecord?.clockIn && !todayRecord.clockOut && (
        <div className="bg-slate-50 rounded-[2.5rem] border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-100">
              <MapPin size={16} />
            </div>
            <div>
              <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Geofence Simulator (Developer Testing Interface)</h4>
              <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Simulate moving away to verify automatic logoff & admin alert rules</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-center">
              <button
                type="button"
                onClick={async () => {
                  const userLat = (bakery?.attendanceSettings?.latitude || 0) + 0.015; 
                  const userLng = (bakery?.attendanceSettings?.longitude || 0) + 0.015;
                  const distance = 1650;
                  setCurrentTrackingDistance(distance);
                  await processAwayStatus(distance, userLat, userLng);
                  alert(`Simulated moving 1.65 km away. "awaySince" is tracked!`);
                }}
                className="py-3 px-4 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all"
              >
                Simulate Away (&gt;1km)
              </button>

              <button
                type="button"
                onClick={async () => {
                  const userLat = bakery?.attendanceSettings?.latitude || 0;
                  const userLng = bakery?.attendanceSettings?.longitude || 0;
                  const distance = 5;
                  setCurrentTrackingDistance(distance);
                  await processAwayStatus(distance, userLat, userLng);
                  alert(`Simulated returning inside bakery range (5 meters).`);
                }}
                className="py-3 px-4 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all"
              >
                Simulate Under Range
              </button>
            </div>

            <div className="p-4 bg-white rounded-2xl border border-slate-100 text-[10px] font-bold text-slate-600 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400 uppercase tracking-wider text-[8px]">Geofence Range State:</span>
                <span className={cn(
                  "px-2 py-0.5 rounded text-[8px] font-black uppercase",
                  (currentTrackingDistance || 0) >= 1000 ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"
                )}>
                  {currentTrackingDistance !== null 
                    ? (currentTrackingDistance >= 1000 ? 'OUTSIDE Premise' : 'INSIDE Premise') 
                    : 'System Normal'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400 uppercase tracking-wider text-[8px]">Current Distance from Bakery:</span>
                <span className="text-slate-800">
                  {currentTrackingDistance !== null ? `${Math.round(currentTrackingDistance)} meters` : 'Acquiring...'}
                </span>
              </div>
              {todayRecord?.awaySince && (
                <div className="flex justify-between items-center bg-amber-50/50 p-2 rounded-lg border border-amber-100/50">
                  <span className="text-amber-700 uppercase tracking-wider text-[8px]">Away Monitored Since:</span>
                  <span className="text-amber-800">
                    {format(todayRecord.awaySince.toDate(), 'HH:mm:ss')}
                  </span>
                </div>
              )}
            </div>

            {todayRecord?.awaySince && (
              <button
                type="button"
                onClick={async () => {
                  const sixtyFiveMinsAgo = new Date(Date.now() - 65 * 60 * 1000);
                  const recordRef = doc(db, 'attendance', recordId);
                  await updateDoc(recordRef, {
                    awaySince: sixtyFiveMinsAgo
                  });

                  const userLat = (bakery?.attendanceSettings?.latitude || 0) + 0.015;
                  const userLng = (bakery?.attendanceSettings?.longitude || 0) + 0.015;
                  const distance = 1650;
                  setCurrentTrackingDistance(distance);
                  
                  await forceAutoLogoff(distance, userLat, userLng, 65);
                }}
                className="w-full py-4 bg-red-600 hover:bg-red-500 text-white rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-md shadow-red-900/10"
              >
                ⚡ Simulate &gt; 1 Hour Elapsed (Force Auto-Logoff &amp; Notify Admin)
              </button>
            )}
          </div>
        </div>
      )}

      {/* History */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <h3 className="font-black text-slate-900 uppercase text-xs tracking-widest">Attendance History</h3>
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Last 30 Days</p>
          </div>
          <Calendar className="text-slate-300" size={20} />
        </div>

        <div className="divide-y divide-slate-100">
          {records.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <p className="text-[10px] font-black uppercase tracking-widest">No previous shift records found</p>
            </div>
          ) : (
            records.slice(0, 7).map(record => (
              <div key={record.id} className="p-6 flex items-center justify-between hover:bg-slate-50/80 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-white border border-slate-100 rounded-2xl flex items-center justify-center font-black text-xs text-slate-900 shadow-sm">
                    {format(new Date(record.date), 'dd')}
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-slate-900">{format(new Date(record.date), 'EEEE, MMM dd')}</h4>
                    <div className="flex items-center gap-2 mt-1">
                       <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">
                         {record.clockIn ? format(record.clockIn.toDate(), 'HH:mm') : '--'} - {record.clockOut ? format(record.clockOut.toDate(), 'HH:mm') : '--'}
                       </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                   <div className={cn(
                     "px-3 py-1.5 rounded-xl text-[8px] font-black uppercase tracking-widest border",
                     record.status === 'present' ? "bg-green-50 border-green-100 text-green-600" : "bg-amber-50 border-amber-100 text-amber-600"
                   )}>
                     {record.status}
                   </div>
                   <ChevronRight className="text-slate-200" size={16} />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Face Scan Simulation Overlay */}
      <AnimatePresence>
        {scanning && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[300] flex flex-col items-center justify-center p-8"
          >
            <div className="w-full max-w-sm aspect-square bg-slate-800 rounded-[3rem] border-4 border-indigo-500/50 relative overflow-hidden flex items-center justify-center">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                className="w-full h-full object-cover transform scale-x-[-1]"
              />
              
              {/* Scan Overlay Lines */}
              <div className="absolute inset-0 border-[20px] border-slate-900/50 pointer-events-none" />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-64 h-64 border-2 border-indigo-400/30 rounded-full border-dashed animate-spin-slow" />
                <div className="absolute w-56 h-56 border border-white/20 rounded-full" />
              </div>

              {/* Scanning Beam */}
              <div className="absolute top-0 left-0 w-full h-1 bg-indigo-400/50 shadow-[0_0_20px_rgba(129,140,248,0.8)] animate-scan z-20" />

              {/* Status Message */}
              <div className="absolute bottom-8 left-0 right-0 text-center z-20">
                <div className={cn(
                  "inline-flex items-center gap-2 px-6 py-3 rounded-full font-black text-[10px] uppercase tracking-widest shadow-xl",
                  scanResult === 'success' ? "bg-green-500 text-white" : scanResult === 'failing' ? "bg-rose-500 text-white" : "bg-indigo-600 text-white"
                )}>
                  {scanResult === 'success' ? <CheckCircle2 size={14} /> : scanResult === 'failing' ? <AlertCircle size={14} /> : <Camera size={14} className="animate-pulse" />}
                  {scanResult === 'success' ? "Face Verified" : scanResult === 'failing' ? "Verification Failed" : "Align Face in Circle"}
                </div>
              </div>
            </div>

            <div className="mt-6 text-center">
              <p className="text-white text-lg font-black mb-1">Attendance Protocol</p>
              <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">
                {scanResult === 'success' ? "Identity Confirmed" : scanResult === 'failing' ? "Could Not Verify Identity" : "Processing Biometric Data..."}
              </p>
            </div>

            {scanResult === 'success' && (
              <motion.div 
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="mt-6 max-w-sm w-full bg-slate-800/80 border border-slate-700/50 backdrop-blur-md rounded-3xl p-6 text-center space-y-4"
              >
                {checkingLocation ? (
                  <div className="flex flex-col items-center gap-2 py-4">
                    <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Verifying GPS Proximity...</p>
                  </div>
                ) : gpsError ? (
                  <div className="space-y-3">
                    <div className="w-12 h-12 bg-rose-500/10 text-rose-400 rounded-2xl flex items-center justify-center mx-auto">
                      <AlertCircle size={24} />
                    </div>
                    <div>
                      <h4 className="text-xs font-black text-rose-400 uppercase tracking-wider">GPS Verification Failed</h4>
                      <p className="text-[10px] text-slate-200 font-bold mt-1 leading-relaxed">
                        {gpsError.startsWith('verification_failed:') 
                          ? gpsError.replace('verification_failed: ', '') 
                          : gpsError}
                      </p>
                    </div>
                    <button 
                      onClick={handleClockIn}
                      className="w-full bg-purple-600 hover:bg-purple-500 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                    >
                      Retry Distance Check
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {bakery?.attendanceSettings?.enabled && gpsDistance !== null ? (
                      <div className="bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 p-4 rounded-2xl text-center">
                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Location In-Range</p>
                        <p className="text-[10px] font-bold mt-1 text-slate-200">
                          Proximity: {Math.round(gpsDistance)}m (Under {bakery.attendanceSettings.radius || 20}m limit)
                        </p>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-300 font-bold uppercase tracking-wider">Ready to record shift entry</p>
                    )}
                    <button 
                      onClick={handleClockIn}
                      className="w-full bg-green-500 hover:bg-green-400 text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-green-900/20 transition-all text-xs"
                    >
                      Continue Clock In
                    </button>
                  </div>
                )}
              </motion.div>
            )}

            {scanResult === 'failing' && (
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="mt-6 max-w-sm w-full bg-slate-800/80 border border-rose-700/40 backdrop-blur-md rounded-3xl p-6 text-center space-y-4"
              >
                <div className="w-12 h-12 bg-rose-500/10 text-rose-400 rounded-2xl flex items-center justify-center mx-auto">
                  <AlertCircle size={24} />
                </div>
                <div>
                  <h4 className="text-xs font-black text-rose-400 uppercase tracking-wider">Face Verification Failed</h4>
                  <p className="text-[10px] text-slate-200 font-bold mt-1 leading-relaxed">
                    {faceErrorMsg || "Could not verify your identity. Please try again."}
                  </p>
                </div>
                <button
                  onClick={startCamera}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  Try Again
                </button>
              </motion.div>
            )}

            {modelsLoading && (
              <p className="mt-4 text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">
                Loading face recognition model...
              </p>
            )}

            <button 
              onClick={stopCamera}
              className="mt-8 px-10 py-4 bg-white/10 hover:bg-white/20 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
            >
              Cancel Scan
            </button>
          </motion.div>
        )}
      </AnimatePresence>

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
