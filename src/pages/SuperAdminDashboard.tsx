import React, { useState, useEffect } from 'react';
// VERSION: 2026-04-29-V3-SOFT-DELETE
import { collection, query, getDocs, doc, setDoc, deleteDoc, onSnapshot, serverTimestamp, updateDoc, getDoc, where } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Bakery, UserProfile, Dealer } from '../types';
import { Building2, Users, Search, ExternalLink, ShieldAlert, Zap, Filter, Trash2, Edit2, Check, X, FileText, Clock, ShoppingBag, Mail, Phone } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

import { createLog } from '../services/logService';

interface SystemLog {
  id: string;
  type: string;
  message: string;
  userId?: string;
  userEmail?: string;
  bakeryId?: string;
  timestamp: any;
  metadata?: any;
}

export const SuperAdminDashboard: React.FC<{ view?: string }> = ({ view = 'dashboard' }) => {
  const { impersonate } = useAuth();
  const navigate = useNavigate();
  const [bakeries, setBakeries] = useState<Bakery[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [globalOrdersCount, setGlobalOrdersCount] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'bakeries' | 'users' | 'logs' | 'dealers'>(view as any || 'bakeries');
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [editingDealer, setEditingDealer] = useState<Dealer | null>(null);
  const [editPrefix, setEditPrefix] = useState('');
  const [editCompanyName, setEditCompanyName] = useState('');
  const [editingBakery, setEditingBakery] = useState<Bakery | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editStatus, setEditStatus] = useState<Bakery['subscriptionStatus']>('active');
  const [updating, setUpdating] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ title: string, message: string, confirmText: string, onResolve: () => void } | null>(null);

  // Pagination State
  const [logsCurrentPage, setLogsCurrentPage] = useState(1);
  const [logsItemsPerPage, setLogsItemsPerPage] = useState(25);
  const [signupRequests, setSignupRequests] = useState<any[]>([]);

  useEffect(() => {
    const totalPages = Math.ceil(logs.length / logsItemsPerPage);
    if (logsCurrentPage > totalPages && totalPages > 0) {
      setLogsCurrentPage(totalPages);
    }
  }, [logs.length, logsItemsPerPage, logsCurrentPage]);

  const confirmAction = (title: string, message: string, confirmText: string, onResolve: () => void) => {
    setPendingAction({ title, message, confirmText, onResolve });
  };

  useEffect(() => {
    const unsubSignupRequests = onSnapshot(query(collection(db, 'signup_requests'), where('status', '==', 'pending')), (snapshot) => {
      const data: any[] = [];
      snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() }));
      setSignupRequests(data);
    });

    const unsubBakeries = onSnapshot(collection(db, 'bakeries'), (snapshot) => {
      const data: Bakery[] = [];
      snapshot.forEach(doc => {
        const item = { id: doc.id, ...doc.data() } as Bakery;
        if (!item.isDeleted) data.push(item);
      });
      setBakeries(data);
    });

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const data: UserProfile[] = [];
      snapshot.forEach(doc => {
        const user = { ...doc.data() } as UserProfile;
        if (!user.isDeleted) data.push(user);
      });
      setUsers(data);
      setLoading(false);
    });

    const unsubDealers = onSnapshot(collection(db, 'dealers'), (snapshot) => {
      const data: Dealer[] = [];
      snapshot.forEach(doc => {
        const item = { id: doc.id, ...doc.data() } as Dealer;
        if (!item.isDeleted) data.push(item);
      });
      setDealers(data);
    });

    const unsubOrders = onSnapshot(collection(db, 'orders'), (snapshot) => {
      setGlobalOrdersCount(snapshot.size);
    });

    const unsubLogs = onSnapshot(query(collection(db, 'system_logs')), (snapshot) => {
      const data: SystemLog[] = [];
      snapshot.forEach(doc => data.push({ id: doc.id, ...doc.data() } as SystemLog));
      // Sort by timestamp descending
      data.sort((a, b) => (b.timestamp?.toMillis() || 0) - (a.timestamp?.toMillis() || 0));
      setLogs(data);
    });

    return () => {
      unsubSignupRequests();
      unsubBakeries();
      unsubUsers();
      unsubDealers();
      unsubOrders();
      unsubLogs();
    };
  }, []);

  useEffect(() => {
    if (view) setViewMode(view as any);
  }, [view]);

  const startEditing = (bakery: Bakery) => {
    setEditingBakery(bakery);
    setEditName(bakery.name);
    setEditPhone(bakery.phone || '');
    setEditStatus(bakery.subscriptionStatus);
  };

  const handleUpdateDealer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDealer) return;
    setUpdating(true);
    try {
      await updateDoc(doc(db, 'dealers', editingDealer.id), {
        companyName: editCompanyName,
        orderPrefix: editPrefix.toUpperCase()
      });
      
      await createLog('system', `Dealer updated: ${editingDealer.id} (Prefix: ${editPrefix})`, auth.currentUser?.uid, auth.currentUser?.email);
      setEditingDealer(null);
    } catch (err) {
      console.error(err);
    } finally {
      setUpdating(false);
    }
  };

  const handleUpdateBakery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBakery) return;
    setUpdating(true);
    try {
      await updateDoc(doc(db, 'bakeries', editingBakery.id), {
        name: editName,
        phone: editPhone,
        subscriptionStatus: editStatus
      });
      
      await createLog('bakery', `Bakery settings updated: ${editName}`, auth.currentUser?.uid, auth.currentUser?.email, editingBakery.id);
      
      setEditingBakery(null);
    } catch (err) {
      console.error(err);
    } finally {
      setUpdating(false);
    }
  };

  const [showBakeryForm, setShowBakeryForm] = useState(false);
  const [newBakeryName, setNewBakeryName] = useState('');
  const [newBakeryEmail, setNewBakeryEmail] = useState('');
  const [newBakeryPhone, setNewBakeryPhone] = useState('');
  const [newBakeryAddress, setNewBakeryAddress] = useState('');
  const [newBakeryGst, setNewBakeryGst] = useState('');
  const [newBakeryPin, setNewBakeryPin] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchISD = async () => {
      try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        if (data.country_calling_code) {
          if (!newBakeryPhone && showBakeryForm) setNewBakeryPhone(data.country_calling_code);
          if (!editPhone && editingBakery) setEditPhone(data.country_calling_code);
        }
      } catch (err) {
        console.warn('Geolocation ISD fetch failed:', err);
      }
    };
    if (showBakeryForm || editingBakery) fetchISD();
  }, [showBakeryForm, editingBakery]);

  const handleAddBakery = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const bakeryId = `bakery_${Math.random().toString(36).substring(2, 9)}`;
      const isKreative = newBakeryName.toLowerCase().includes('kreative chocolates');
      
      await setDoc(doc(db, 'bakeries', bakeryId), {
        name: newBakeryName,
        adminEmail: newBakeryEmail,
        phone: newBakeryPhone,
        address: newBakeryAddress,
        gstNumber: newBakeryGst,
        pin: newBakeryPin || '1234',
        trialStartedAt: serverTimestamp(),
        subscriptionStatus: isKreative ? 'free_partner' : 'trial',
        settings: {}
      });
      
      await createLog('bakery', `New bakery registered: ${newBakeryName}`, auth.currentUser?.uid, auth.currentUser?.email, bakeryId);
      
      setShowBakeryForm(false);
      setNewBakeryName('');
      setNewBakeryEmail('');
      setNewBakeryPhone('');
      setNewBakeryAddress('');
      setNewBakeryGst('');
      setNewBakeryPin('');
    } catch (err) {
      console.error("Error adding bakery:", err);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredBakeries = bakeries.filter(b => 
    b.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    b.adminEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (b.phone && b.phone.includes(searchTerm))
  );

  const filteredUsers = users.filter(u => 
    u.displayName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (u.email && u.email.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (u.phone && u.phone.includes(searchTerm)) ||
    (u.role && u.role.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleDeleteUser = (uid: string, name: string) => {
    confirmAction(
      'Revoke Login Access?',
      `Are you sure you want to archvie "${name}"? They will no longer be able to log in to the portal.`,
      'Revoke Access',
      async () => {
        try {
          await updateDoc(doc(db, 'users', uid), {
            isDeleted: true,
            deletedAt: serverTimestamp(),
            role: 'disabled'
          });
          // Also check if they are a dealer
          const dealerDoc = await getDoc(doc(db, 'dealers', uid));
          if (dealerDoc.exists()) {
            await updateDoc(doc(db, 'dealers', uid), { 
              isDeleted: true, 
              deletedAt: serverTimestamp() 
            });
          }
          await createLog('system', `Soft-deleted user profile: ${name} (${uid})`, auth.currentUser?.uid, auth.currentUser?.email);
          alert('User access revoked successfully.');
        } catch (err) {
          console.error(err);
        } finally {
          setPendingAction(null);
        }
      }
    );
  };

  const handleDeleteBakery = (id: string, name: string) => {
    confirmAction(
      'CRITICAL: Deactivate Bakery?',
      `This will suspend "${name}" and all its associated users. All data will be archived and hidden from the platform.`,
      'Deactivate Bakery',
      async () => {
        try {
          setUpdating(true);
          await updateDoc(doc(db, 'bakeries', id), {
            isDeleted: true,
            deactivatedAt: serverTimestamp(),
            status: 'suspended'
          });
          await createLog('system', `Soft-deleted bakery tenant: ${name} (${id})`, auth.currentUser?.uid, auth.currentUser?.email);
          alert('Bakery deactivated and archived.');
        } catch (err) {
          console.error(err);
        } finally {
          setUpdating(false);
          setPendingAction(null);
        }
      }
    );
  };

  const handleApproveBakery = async (request: any) => {
    confirmAction(
      'Approve Bakery Signup?',
      `Confirm approval for "${request.bakeryName}". This will grant them a 3-month free trial.`,
      'Approve & Activate',
      async () => {
        try {
          const trialEnds = new Date();
          trialEnds.setMonth(trialEnds.getMonth() + 3);

          await updateDoc(doc(db, 'bakeries', request.bakeryId), {
            subscriptionStatus: 'trial',
            trialStartedAt: serverTimestamp(),
            subscriptionEndsAt: trialEnds,
            status: 'active'
          });

          await updateDoc(doc(db, 'signup_requests', request.id), {
            status: 'approved',
            approvedAt: serverTimestamp()
          });

          await createLog('system', `Bakery Approved: ${request.bakeryName}`, auth.currentUser?.uid, auth.currentUser?.email, request.bakeryId);
          alert('Bakery approved and trial activated!');
        } catch (err) {
          console.error(err);
        } finally {
          setPendingAction(null);
        }
      }
    );
  };

  const renderView = () => {
    if (viewMode === 'dealers') {
      const filteredDealers = dealers.filter(d => 
        d.companyName.toLowerCase().includes(searchTerm.toLowerCase()) || 
        d.staffName.toLowerCase().includes(searchTerm.toLowerCase())
      );
      return (
        <div className="space-y-6">
          <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
              <h2 className="font-black text-slate-900 uppercase tracking-widest text-xs flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-600" />
                Dealer Network Management
              </h2>
              <div className="relative flex-1 max-w-xs ml-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Filter by company..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-2 text-[10px] font-bold outline-none focus:ring-2 focus:ring-blue-100 transition-all"
                />
              </div>
            </div>
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Company</th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Order Prefix</th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Staff Contact</th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Bakery</th>
                    <th className="px-8 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Settings</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredDealers.map(dealer => {
                    const bakery = bakeries.find(b => b.id === dealer.bakeryId);
                    return (
                      <tr key={dealer.id} className="hover:bg-slate-50 transition-all">
                        <td className="px-8 py-4">
                          <p className="text-sm font-black text-slate-900">{dealer.companyName}</p>
                          <p className="text-[10px] text-slate-400 font-bold">ID: {dealer.id}</p>
                        </td>
                        <td className="px-8 py-4">
                          <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded-lg font-black text-[10px] border border-blue-100">
                            {dealer.orderPrefix || 'NONE'}
                          </span>
                        </td>
                        <td className="px-8 py-4">
                          <p className="text-xs font-bold text-slate-600">{dealer.staffName}</p>
                          <p className="text-[10px] text-slate-400 font-bold">{dealer.phone}</p>
                        </td>
                        <td className="px-8 py-4">
                          <p className="text-xs font-bold text-slate-900">{bakery?.name || 'Unknown'}</p>
                        </td>
                        <td className="px-8 py-4 text-right">
                          <button 
                            onClick={() => {
                              setEditingDealer(dealer);
                              setEditPrefix(dealer.orderPrefix || '');
                              setEditCompanyName(dealer.companyName);
                            }}
                            className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
                          >
                            <Edit2 size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View for Dealers */}
            <div className="lg:hidden divide-y divide-slate-100">
              {filteredDealers.length === 0 ? (
                <div className="p-12 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px]">No dealers match your search.</div>
              ) : (
                filteredDealers.map(dealer => {
                  const bakery = bakeries.find(b => b.id === dealer.bakeryId);
                  return (
                    <div key={dealer.id} className="p-6 space-y-4 hover:bg-slate-50/30 transition-colors">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-base font-black text-slate-900 leading-tight">{dealer.companyName}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[8px] font-black uppercase border border-blue-100">
                              {dealer.orderPrefix || 'NONE'}
                            </span>
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">ID: {dealer.id}</span>
                          </div>
                        </div>
                        <button 
                          onClick={() => {
                            setEditingDealer(dealer);
                            setEditPrefix(dealer.orderPrefix || '');
                            setEditCompanyName(dealer.companyName);
                          }}
                          className="p-2 text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-600 hover:text-white transition-all shadow-sm"
                        >
                          <Edit2 size={16} />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-slate-50 rounded-2xl p-4">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 leading-none">Contact</p>
                          <p className="text-xs font-bold text-slate-900 truncate">{dealer.staffName}</p>
                          <p className="text-[10px] text-slate-500 font-medium mt-0.5">{dealer.phone}</p>
                        </div>
                        <div className="bg-slate-50 rounded-2xl p-4">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 leading-none">Bakery Partner</p>
                          <p className="text-xs font-bold text-slate-900 truncate">{bakery?.name || 'Unknown'}</p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      );
    }

    if (viewMode === 'users') {
      return (
        <div className="space-y-6">
          <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="px-6 sm:px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="relative flex-1 max-w-md w-full">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Search user directory..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-2xl pl-12 pr-4 py-3 text-xs font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all"
                />
              </div>
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-right sm:text-left">
                Retrieved {users.length} active profiles
              </div>
            </div>
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b border-slate-100">
                  <tr>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">User / Identity</th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Role</th>
                    <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Bakery Association</th>
                    <th className="px-8 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filteredUsers.map(userProfile => {
                    const associatedBakery = bakeries.find(b => b.id === userProfile.bakeryId);
                    return (
                      <tr key={userProfile.uid} className="hover:bg-slate-50/50 transition-all group">
                        <td className="px-8 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-slate-100 rounded-xl flex items-center justify-center font-black text-slate-400 text-xs">
                              {userProfile.displayName?.charAt(0)}
                            </div>
                            <div>
                              <p className="text-sm font-black text-slate-900 leading-tight">{userProfile.displayName}</p>
                              <div className="flex gap-2 text-[10px] text-slate-400 font-bold mt-0.5">
                                <span>{userProfile.phone}</span>
                                {userProfile.email && <span className="truncate max-w-[150px]"> {userProfile.email}</span>}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-4">
                          <span className={cn(
                            "text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-tighter border",
                            userProfile.role === 'bakery_admin' ? "bg-purple-50 text-purple-600 border-purple-100" :
                            userProfile.role === 'dealer' ? "bg-blue-50 text-blue-600 border-blue-100" :
                            "bg-slate-100 text-slate-600 border-slate-200"
                          )}>
                            {userProfile.role?.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-8 py-4">
                          {associatedBakery ? (
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-slate-900">{associatedBakery.name}</span>
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">ID: {associatedBakery.id.split('_')[1] || associatedBakery.id}</span>
                            </div>
                          ) : (
                            <span className="text-[10px] font-black text-slate-300 uppercase italic">Unlinked</span>
                          )}
                        </td>
                        <td className="px-8 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button 
                              onClick={() => {
                                if (associatedBakery) {
                                  impersonate(userProfile, associatedBakery);
                                  navigate('/dashboard');
                                } else {
                                  alert('Cannot impersonate unlinked user (Missing Bakery context)');
                                }
                              }}
                              className="px-3 py-1.5 bg-blue-50 text-blue-600 text-[10px] font-black uppercase tracking-widest rounded-lg hover:bg-blue-600 hover:text-white transition-all"
                            >
                              Login As
                            </button>
                            <button 
                              onClick={() => handleDeleteUser(userProfile.uid, userProfile.displayName)}
                              className="p-1.5 text-slate-300 hover:text-red-500 rounded-lg transition-all"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="lg:hidden divide-y divide-slate-100 px-0">
              {filteredUsers.length === 0 ? (
                <div className="p-12 text-center text-slate-400 font-bold uppercase tracking-widest text-[10px]">No users match your search.</div>
              ) : (
                filteredUsers.map(userProfile => {
                  const associatedBakery = bakeries.find(b => b.id === userProfile.bakeryId);
                  return (
                    <div key={userProfile.uid} className="p-6 space-y-4 hover:bg-slate-50/30 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center font-black text-slate-400 text-sm">
                            {userProfile.displayName?.charAt(0)}
                          </div>
                          <div>
                            <p className="text-base font-black text-slate-900 leading-tight">{userProfile.displayName}</p>
                            <div className="flex flex-col gap-0.5 text-[10px] text-slate-400 font-bold mt-1">
                              <span>{userProfile.phone}</span>
                              {userProfile.email && <span className="truncate">{userProfile.email}</span>}
                            </div>
                          </div>
                        </div>
                        <span className={cn(
                          "text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-tighter border shrink-0",
                          userProfile.role === 'bakery_admin' ? "bg-purple-50 text-purple-600 border-purple-100" :
                          userProfile.role === 'dealer' ? "bg-blue-50 text-blue-600 border-blue-100" :
                          "bg-slate-100 text-slate-600 border-slate-200"
                        )}>
                          {userProfile.role?.replace('_', ' ')}
                        </span>
                      </div>

                      <div className="bg-slate-50 rounded-2xl p-4 flex flex-col xs:flex-row xs:items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 leading-none">Bakery Partner</p>
                          {associatedBakery ? (
                            <p className="text-xs font-bold text-slate-900 truncate">{associatedBakery.name}</p>
                          ) : (
                            <p className="text-[10px] font-black text-slate-300 uppercase italic">Unlinked Profile</p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => {
                              if (associatedBakery) {
                                impersonate(userProfile, associatedBakery);
                                navigate('/dashboard');
                              } else {
                                alert('Cannot impersonate unlinked user');
                              }
                            }}
                            className="flex-1 xs:flex-none px-4 py-2.5 bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl shadow-lg shadow-blue-100 active:scale-95 transition-all text-center"
                          >
                            Login As
                          </button>
                          <button 
                            onClick={() => handleDeleteUser(userProfile.uid, userProfile.displayName)}
                            className="p-2.5 text-slate-400 bg-white border border-slate-200 rounded-xl active:scale-95 transition-all"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      );
    }

    if (viewMode === 'logs') {
      const totalPages = Math.ceil(logs.length / logsItemsPerPage);
      const paginatedLogs = logs.slice(
        (logsCurrentPage - 1) * logsItemsPerPage,
        logsCurrentPage * logsItemsPerPage
      );

      return (
        <div className="space-y-6">
          <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="font-black text-slate-900 uppercase tracking-widest text-xs flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                System Activity Logs
              </h2>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Show:</span>
                  <select 
                    value={logsItemsPerPage}
                    onChange={(e) => {
                      setLogsItemsPerPage(Number(e.target.value));
                      setLogsCurrentPage(1);
                    }}
                    className="text-[10px] font-bold bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none appearance-none cursor-pointer hover:border-blue-300 transition-colors"
                  >
                    <option value={25}>25 per page</option>
                    <option value={50}>50 per page</option>
                    <option value={100}>100 per page</option>
                  </select>
                </div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Retrieved {logs.length} events
                </div>
              </div>
            </div>
            <div className="divide-y divide-slate-50">
              {logs.length === 0 ? (
                <div className="p-20 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">No activity logs recorded yet.</div>
              ) : (
                paginatedLogs.map(log => (
                  <div key={log.id} className="p-6 hover:bg-slate-50 transition-all flex items-start gap-4">
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                      log.type === 'error' ? "bg-red-100 text-red-600" : 
                      log.type === 'auth' ? "bg-purple-100 text-purple-600" :
                      log.type === 'order' ? "bg-amber-100 text-amber-600" :
                      "bg-blue-100 text-blue-600"
                    )}>
                      {log.type === 'order' ? <ShoppingBag size={18} /> : 
                       log.type === 'auth' ? <Users size={18} /> :
                       <Zap size={18} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1">
                        <p className="text-sm font-bold text-slate-900">{log.message}</p>
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase ml-4 shrink-0">
                          <Clock className="w-3 h-3" />
                          {log.timestamp ? format(log.timestamp.toDate(), 'HH:mm • dd MMM') : 'Just now'}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-400 font-black uppercase tracking-widest">
                        {log.userEmail && <span>User: {log.userEmail}</span>}
                        {log.bakeryId && <span>Bakery: {log.bakeryId.split('_')[1] || log.bakeryId}</span>}
                        <span>ID: {log.id.slice(-6).toUpperCase()}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            
            {logs.length > logsItemsPerPage && (
              <div className="px-8 py-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Showing {(logsCurrentPage-1) * logsItemsPerPage + 1} to {Math.min(logsCurrentPage * logsItemsPerPage, logs.length)} of {logs.length}
                </p>
                <div className="flex items-center gap-2">
                  <button 
                    disabled={logsCurrentPage === 1}
                    onClick={() => setLogsCurrentPage(p => Math.max(1, p - 1))}
                    className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:border-blue-500 disabled:opacity-30 disabled:hover:border-slate-200 transition-all font-mono"
                  >
                    Prev
                  </button>
                  <div className="flex gap-1 overflow-x-auto max-w-[200px] no-scrollbar">
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                      <button 
                        key={page}
                        onClick={() => setLogsCurrentPage(page)}
                        className={cn(
                          "w-8 h-8 rounded-lg text-[10px] font-black transition-all shrink-0 font-mono",
                          logsCurrentPage === page ? "bg-blue-600 text-white shadow-lg shadow-blue-100" : "bg-white border border-slate-100 text-slate-400 hover:border-slate-300"
                        )}
                      >
                        {page}
                      </button>
                    ))}
                  </div>
                  <button 
                    disabled={logsCurrentPage === totalPages}
                    onClick={() => setLogsCurrentPage(p => Math.min(totalPages, p + 1))}
                    className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:border-blue-500 disabled:opacity-30 disabled:hover:border-slate-200 transition-all font-mono"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Tenants List */}
        <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-black text-slate-900 uppercase tracking-widest text-xs flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-600" />
                Active Bakery Partners
              </h2>
              <button 
                onClick={() => setShowBakeryForm(true)}
                className="text-[10px] font-black bg-slate-900 text-white px-5 py-2.5 rounded-xl uppercase hover:bg-slate-800 transition-all shadow-lg active:scale-95"
              >
                + Register New Bakery
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search by bakery name, email or mobile..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-2xl pl-12 pr-4 py-4 text-sm font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all"
              />
            </div>
          </div>

          <div className="divide-y divide-slate-50">
            {filteredBakeries.length === 0 ? (
              <div className="p-20 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">No bakeries matching your criteria.</div>
            ) : (
              filteredBakeries.map(bakery => (
                <div key={bakery.id} className="p-4 sm:p-6 hover:bg-slate-50 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group">
                  <div className="flex items-start sm:items-center gap-4 flex-1 min-w-0">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-100 rounded-xl sm:rounded-2xl flex items-center justify-center font-black text-slate-400 text-sm sm:text-lg group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors shrink-0">
                      {bakery.name.charAt(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <button 
                          onClick={() => {
                            impersonate({ uid: 'impersonated', displayName: bakery.name, email: bakery.adminEmail, role: 'bakery_admin', bakeryId: bakery.id }, bakery);
                            navigate('/dashboard');
                          }}
                          className="font-black text-slate-900 hover:text-blue-600 transition-colors text-left truncate max-w-[200px] sm:max-w-none"
                          title="Switch to this Store View"
                        >
                          {bakery.name}
                        </button>
                        <div className="flex gap-1 flex-shrink-0">
                          {bakery.subscriptionStatus === 'free_partner' && (
                            <span className="text-[8px] sm:text-[9px] bg-purple-100 text-purple-700 px-1.5 sm:px-2 py-0.5 rounded-full font-black uppercase tracking-tighter border border-purple-200">PARTNER</span>
                          )}
                          {bakery.subscriptionStatus === 'trial' && (
                            <span className="text-[8px] sm:text-[9px] bg-amber-100 text-amber-700 px-1.5 sm:px-2 py-0.5 rounded-full font-black uppercase tracking-tighter border border-amber-200">TRIAL</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2 sm:gap-3 text-[10px] sm:text-[11px] text-slate-400 font-bold uppercase tracking-widest truncate">
                        <span className="truncate">{bakery.adminEmail}</span>
                        {bakery.phone && (
                          <>
                            <span className="text-slate-200 hidden sm:inline">|</span>
                            <span>{bakery.phone}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-end gap-1 sm:gap-2 sm:ml-4 border-t sm:border-t-0 border-slate-50 pt-3 sm:pt-0">
                    <button 
                      onClick={() => startEditing(bakery)}
                      className="p-2 sm:p-2.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600 rounded-xl transition-all"
                      title="Edit Settings"
                    >
                      <Edit2 className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                    <button 
                      onClick={() => handleDeleteBakery(bakery.id, bakery.name)}
                      className="p-2 sm:p-2.5 text-slate-400 hover:bg-red-50 hover:text-red-500 rounded-xl transition-all"
                      title="Delete Bakery"
                    >
                      <Trash2 className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="bg-slate-900 text-white p-6 sm:p-10 rounded-[2rem] sm:rounded-[3rem] shadow-2xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-center md:items-center gap-8">
          <div className="text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-2 text-blue-400 font-bold uppercase tracking-widest text-[10px] mb-3">
              <ShieldAlert className="w-4 h-4" />
              Platform Control Center
            </div>
            <h1 className="text-3xl sm:text-4xl font-black mb-2 tracking-tight">
              {viewMode === 'logs' ? 'System Audit' : viewMode === 'users' ? 'User Directory' : 'Main Dashboard'}
            </h1>
            <p className="text-slate-400 max-w-lg text-sm mx-auto md:mx-0">
              {viewMode === 'logs' ? `Analyzing ${logs.length} historical events.` : viewMode === 'users' ? `Managing login access for ${users.length} active accounts.` : `Managing ${bakeries.length} bakeries in the BakeSync ecosystem.`}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3 sm:gap-4 w-full md:w-auto">
            <button 
              onClick={() => setViewMode('bakeries')}
              className={cn(
                "flex-1 md:flex-none bg-white/10 backdrop-blur-md px-4 sm:px-6 py-3 sm:py-4 rounded-2xl sm:rounded-3xl border border-white/10 text-center transition-all",
                viewMode === 'bakeries' ? "ring-2 ring-blue-500 bg-white/20" : "hover:bg-white/5"
              )}
            >
              <p className="text-2xl sm:text-3xl font-black">{bakeries.length}</p>
              <p className="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest">Global Tenants</p>
            </button>
            <button 
              onClick={() => setViewMode('users')}
              className={cn(
                "flex-1 md:flex-none bg-white/10 backdrop-blur-md px-4 sm:px-6 py-3 sm:py-4 rounded-2xl sm:rounded-3xl border border-white/10 text-center transition-all",
                viewMode === 'users' ? "ring-2 ring-blue-500 bg-white/20" : "hover:bg-white/5"
              )}
            >
              <p className="text-2xl sm:text-3xl font-black">{users.length}</p>
              <p className="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Users</p>
            </button>
            <button 
              onClick={() => setViewMode('dealers')}
              className={cn(
                "flex-1 md:flex-none bg-white/10 backdrop-blur-md px-4 sm:px-6 py-3 sm:py-4 rounded-2xl sm:rounded-3xl border border-white/10 text-center transition-all",
                viewMode === 'dealers' ? "ring-2 ring-blue-500 bg-white/20" : "hover:bg-white/5"
              )}
            >
              <p className="text-2xl sm:text-3xl font-black">{dealers.length}</p>
              <p className="text-[8px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dealer Partners</p>
            </button>
            <div className="flex-1 md:flex-none bg-blue-600 px-4 sm:px-6 py-3 sm:py-4 rounded-2xl sm:rounded-3xl shadow-lg shadow-blue-900/50 text-center min-w-[100px]">
              <p className="text-2xl sm:text-3xl font-black">{globalOrdersCount}</p>
              <p className="text-[8px] sm:text-[10px] font-bold text-blue-100 uppercase tracking-widest">System Orders</p>
            </div>
          </div>
        </div>
      </div>

      {signupRequests.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-[2rem] p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-black text-amber-900 uppercase tracking-tight flex items-center gap-2">
                <Clock className="w-6 h-6" /> Pending Registrations
              </h2>
              <p className="text-amber-700/60 font-bold text-xs">New bakeries waiting for platform access approval.</p>
            </div>
            <span className="px-4 py-1.5 bg-amber-200 text-amber-900 rounded-full font-black text-xs">{signupRequests.length} REQUESTS</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {signupRequests.map(req => (
              <div key={req.id} className="bg-white rounded-3xl p-6 shadow-sm border border-amber-100 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 font-black text-xl">
                      {req.bakeryName.charAt(0)}
                    </div>
                    <span className="text-[9px] font-black text-amber-400 uppercase tracking-widest bg-amber-50 px-2 py-1 rounded-lg">New Signup</span>
                  </div>
                  <h3 className="text-lg font-black text-slate-900 leading-tight mb-1">{req.bakeryName}</h3>
                  <p className="text-xs font-bold text-slate-500 mb-4">{req.ownerName}</p>
                  
                  <div className="space-y-2 mb-6">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
                      <Mail size={12} /> {req.email}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
                      <Phone size={12} /> {req.phone}
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleApproveBakery(req)}
                    className="flex-1 bg-green-600 text-white py-3 rounded-xl font-black uppercase tracking-widest text-[10px] hover:bg-green-700 transition-all flex items-center justify-center gap-2"
                  >
                    <Check size={14} /> Approve
                  </button>
                  <button 
                    className="px-4 py-3 bg-slate-50 text-slate-400 rounded-xl hover:text-red-600 transition-all"
                    title="Reject Request"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-20 text-center font-black text-slate-400 uppercase tracking-widest animate-pulse">Syncing Cloud...</div>
      ) : renderView()}

      <AnimatePresence>
        {pendingAction && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white max-w-sm w-full rounded-[2.5rem] shadow-2xl p-8"
            >
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mb-6">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-black text-slate-900 mb-2">{pendingAction.title}</h3>
              <p className="text-sm font-medium text-slate-500 mb-8 leading-relaxed">
                {pendingAction.message}
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setPendingAction(null)}
                  className="flex-1 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:bg-slate-50 transition-all border border-slate-100"
                >
                  Cancel
                </button>
                <button 
                  onClick={pendingAction.onResolve}
                  className="flex-1 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white bg-red-500 hover:bg-red-600 shadow-lg shadow-red-100 transition-all"
                >
                  {pendingAction.confirmText}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingDealer && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white max-w-md w-full rounded-[2.5rem] shadow-2xl overflow-hidden"
            >
              <div className="p-8 bg-blue-600 text-white flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold">Configure Dealer</h2>
                  <p className="text-blue-100 text-[10px] font-black uppercase tracking-widest mt-1">Management Profile</p>
                </div>
                <button onClick={() => setEditingDealer(null)} className="p-2 hover:bg-white/10 rounded-full">
                  <X />
                </button>
              </div>
              <form onSubmit={handleUpdateDealer} className="p-8 space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Company Name</label>
                  <input 
                    type="text"
                    required
                    value={editCompanyName}
                    onChange={(e) => setEditCompanyName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all shadow-inner"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Order Prefix (e.g. TA, MG, SK)</label>
                  <input 
                    type="text"
                    maxLength={3}
                    placeholder="TA"
                    value={editPrefix}
                    onChange={(e) => setEditPrefix(e.target.value.toUpperCase())}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 font-black outline-none focus:ring-4 focus:ring-blue-100 transition-all uppercase shadow-inner"
                  />
                  <p className="text-[9px] text-slate-400 font-bold mt-2 ml-1">Used to generate unique order numbers (e.g. TA001)</p>
                </div>
                <button 
                  type="submit" 
                  disabled={updating}
                  className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all"
                >
                  {updating ? 'SYNCING...' : 'SAVE CONFIGURATION'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingBakery && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[110] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white max-w-md w-full rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-8 bg-slate-900 text-white flex justify-between items-center shrink-0">
                <div>
                  <h2 className="text-xl font-bold">Edit Bakery</h2>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mt-1">Tenant ID: {editingBakery.id}</p>
                </div>
                <button onClick={() => setEditingBakery(null)} className="p-2 hover:bg-white/10 rounded-full text-slate-400">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <form onSubmit={handleUpdateBakery} className="p-8 space-y-6 overflow-y-auto">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Store Name</label>
                  <input 
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Contact Phone</label>
                  <input 
                    type="tel"
                    required
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Subscription Tier</label>
                  <select 
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all appearance-none"
                  >
                    <option value="trial">Standard Trial</option>
                    <option value="active">Active Subscription</option>
                    <option value="free_partner">Kreative Partner (Free)</option>
                  </select>
                </div>
                <button 
                  type="submit" 
                  disabled={updating}
                  className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                >
                  {updating ? 'SAVING...' : 'UPDATE STORE SETTINGS'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Bakery Modal */}
      <AnimatePresence>
        {showBakeryForm && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white max-w-md w-full rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-8 bg-slate-900 text-white flex justify-between items-center shrink-0">
                <h2 className="text-xl font-bold">Onboard New Bakery</h2>
                <button onClick={() => setShowBakeryForm(false)} className="text-slate-400 hover:text-white">×</button>
              </div>
              <form onSubmit={handleAddBakery} className="p-8 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Bakery Name</label>
                    <input 
                      type="text"
                      required
                      value={newBakeryName}
                      onChange={(e) => setNewBakeryName(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm"
                      placeholder="e.g. Moonlight Bakers"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Primary Email</label>
                    <input 
                      type="email"
                      required
                      value={newBakeryEmail}
                      onChange={(e) => setNewBakeryEmail(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm"
                      placeholder="admin@bakery.com"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Phone Number</label>
                    <input 
                      type="tel"
                      value={newBakeryPhone}
                      onChange={(e) => setNewBakeryPhone(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm"
                      placeholder="+91..."
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">GST Number</label>
                    <input 
                      type="text"
                      value={newBakeryGst}
                      onChange={(e) => setNewBakeryGst(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm"
                      placeholder="22AAAAA0000A1Z5"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Login PIN (4-Digits)</label>
                  <input 
                    type="password"
                    maxLength={4}
                    value={newBakeryPin}
                    onChange={(e) => setNewBakeryPin(e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm"
                    placeholder="e.g. 1234"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Registered Address</label>
                  <textarea 
                    value={newBakeryAddress}
                    onChange={(e) => setNewBakeryAddress(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 font-bold outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm"
                    rows={2}
                    placeholder="Street, City, State, ZIP"
                  />
                </div>

                <div className="pt-2">
                  <button 
                    type="submit" 
                    disabled={submitting}
                    className="w-full bg-blue-600 text-white py-4 rounded-xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg active:scale-95 disabled:opacity-50"
                  >
                    {submitting ? 'Creating Tenant...' : 'Initialize Bakery'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
