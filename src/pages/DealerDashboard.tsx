import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { collection, addDoc, query, where, onSnapshot, serverTimestamp, orderBy, limit, doc, getDoc, getDocs, runTransaction, deleteDoc, setDoc, enableNetwork, disableNetwork, getDocFromServer, terminate, clearIndexedDbPersistence } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useSound } from '../hooks/useSound';
import { Order, OrderStatus, MenuItem, Dealer } from '../types';
import { DealerStaffManager } from '../components/DealerStaffManager';
import { CAKE_FLAVORS, DEALER_COMPANIES } from '../constants';
import { cn, formatCurrency } from '../lib/utils';
import { Plus, Package, Clock, CheckCircle2, Truck, Image as ImageIcon, Send, Bell, MessageCircle, Tag, ShoppingCart, Calendar, Info, LayoutGrid, List, Edit2, Trash2, Zap, ShieldAlert, Download, FileText, Printer, FileSpreadsheet, XCircle, AlertTriangle } from 'lucide-react';
import { format, addDays, subDays, startOfMonth, endOfMonth, subMonths, addMinutes } from 'date-fns';
import { exportOrdersToExcel, generateOrderPDF } from '../lib/exportUtils';
import { OrderDetailsModal } from '../components/OrderDetailsModal';

const CatalogBrowser: React.FC<{ bakeryId: string, dealerId: string, dealershipName: string, discount: number, canManage: boolean, userRole: string, orderPrefix?: string }> = ({ bakeryId, dealerId, dealershipName, discount, canManage, userRole, orderPrefix }) => {
  const isAnyDealer = userRole === 'dealer' || userRole === 'dealer_admin' || userRole === 'dealer_staff';
  const [items, setItems] = useState<MenuItem[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'tabs'>('list');
  const [activeCategory, setActiveCategory] = useState('All');
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const tomorrow = 1;
  const [deliveryDate, setDeliveryDate] = useState(format(addDays(new Date(), tomorrow), 'yyyy-MM-dd'));
  const [deliveryTime, setDeliveryTime] = useState('18:00');
  const [isBakeryRush, setIsBakeryRush] = useState(false);

    // Sync Rush State
    useEffect(() => {
      if (!bakeryId) return;
      
      let q = query(
        collection(db, 'orders'),
        where('bakeryId', '==', bakeryId)
      );

      // CRITICAL: If dealer role, MUST filter by dealerId to satisfy security rules
      if (isAnyDealer) {
        q = query(
          collection(db, 'orders'),
          where('bakeryId', '==', bakeryId),
          where('dealerId', '==', dealerId)
        );
      }

      const unsubscribe = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
        const isFromCache = snapshot.metadata.fromCache;
        const isSyncing = snapshot.metadata.hasPendingWrites;
        console.log(`CatalogBrowser: Rush snapshot (id: ${dealerId}, cache: ${isFromCache}, docs: ${snapshot.size}, syncing: ${isSyncing})`);
        const activeCount = snapshot.docs.filter(doc => 
          ['pending', 'received', 'in_progress'].includes(doc.data().status)
        ).length;
        setIsBakeryRush(activeCount > 8); // Increased threshold slightly
      }, (err) => {
        console.error("CatalogBrowser: Rush listener failed:", err);
      });
      return () => unsubscribe();
    }, [bakeryId, isAnyDealer, dealerId]);

  // Set default delivery time to +30/45m if it's for today
  useEffect(() => {
    const now = new Date();
    const waitMinutes = isBakeryRush ? 45 : 30;
    const defaultDelivery = addMinutes(now, waitMinutes);
    
    // We only auto-set to today+wait if it's currently set to tomorrow or earlier
    // But user wants "default time for delivery of a cake to 30 minutes after the order is placed"
    // So let's default to Today + 30/45m
    setDeliveryDate(format(defaultDelivery, 'yyyy-MM-dd'));
    setDeliveryTime(format(defaultDelivery, 'HH:mm'));
  }, [isBakeryRush]);

  // Action State for Modal
  const [pendingAction, setPendingAction] = useState<{
    title: string;
    message: string;
    confirmText: string;
    onResolve: () => void;
  } | null>(null);

  const confirmAction = (title: string, message: string, confirmText: string, onResolve: () => void) => {
    setPendingAction({ title, message, confirmText, onResolve });
  };

  // Cart State
  const [cart, setCart] = useState<Record<string, number>>({});

  // Management State
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState<any>('cake');
  const [gst, setGst] = useState('5');
  const [hsn, setHsn] = useState('');
  const [desc, setDesc] = useState('');
  const [weight, setWeight] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'menu_items'), where('bakeryId', '==', bakeryId)), (snap) => {
      setItems(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as MenuItem)));
    });
    return () => unsub();
  }, [bakeryId]);

  const categories = ['All', ...Array.from(new Set(items.map(item => item.category)))];
  const filteredItems = activeCategory === 'All' ? items : items.filter(item => item.category === activeCategory);

  const updateCart = (itemId: string, delta: number) => {
    setCart(prev => {
      const current = prev[itemId] || 0;
      const next = Math.max(0, current + delta);
      if (next === 0) {
        const { [itemId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: next };
    });
  };

  const cartTotal = (Object.entries(cart) as [string, number][]).reduce((acc, [id, qty]) => {
    const item = items.find(i => i.id === id);
    if (!item) return acc;
    const priceWithGst = item.price + (item.price * item.gstPercent / 100);
    return acc + (priceWithGst * qty);
  }, 0);

  const cartCount = (Object.values(cart) as number[]).reduce((a, b) => a + b, 0);

  const startEdit = (item: MenuItem) => {
    setEditingItem(item);
    setName(item.name);
    setPrice(item.price.toString());
    setCategory(item.category as any || 'cake');
    setGst(item.gstPercent?.toString() || '5');
    setHsn(item.hsnCode || '');
    setDesc(item.description || '');
    setWeight(item.weight || '');
    setShowForm(true);
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const itemId = editingItem ? editingItem.id : `item_${Math.random().toString(36).substring(2, 9)}`;
    const itemData = {
      bakeryId,
      name,
      price: parseFloat(price) || 0,
      category,
      gstPercent: parseFloat(gst) || 0,
      hsnCode: hsn,
      description: desc,
      weight,
      updatedAt: serverTimestamp()
    };

    if (!editingItem) {
      (itemData as any).createdAt = serverTimestamp();
    }

    try {
      await setDoc(doc(db, 'menu_items', itemId), itemData, { merge: true });
      setShowForm(false);
      setEditingItem(null);
      setName(''); setPrice(''); setDesc(''); setHsn(''); setGst('5'); setWeight('');
    } catch (err) {
      console.error(err);
      alert('Action failed. Check console.');
    }
  };

  const removeItem = (id: string, itemName: string) => {
    confirmAction(
      'Remove from Catalogue?',
      `Are you sure you want to remove "${itemName}"? This item will no longer be available for ordering.`,
      'Remove Item',
      async () => {
        try {
          await deleteDoc(doc(db, 'menu_items', id));
        } catch (err) {
          console.error(err);
        } finally {
          setPendingAction(null);
        }
      }
    );
  };

  const placeBulkOrder = () => {
    const cartEntries = Object.entries(cart) as [string, number][];
    if (cartEntries.length === 0) return;

    confirmAction(
      'Confirm Bulk Order?',
      `Place order for ${cartCount} items scheduled for ${format(new Date(deliveryDate), 'PPP')}?`,
      'Place Order',
      async () => {
        setSubmitting(true);
        try {
          const dealerIdToUse = dealerId.trim() || 'anonymous';
          const dealerRef = doc(db, 'dealers', dealerIdToUse);
          
          await runTransaction(db, async (transaction) => {
            let lastSeq = 0;
            let prefix = orderPrefix || dealershipName.slice(0, 2).toUpperCase() || 'ORD';
            
            // Try to get dealer snap but handle if it doesn't exist yet
            const dealerSnap = await transaction.get(dealerRef);
            if (dealerSnap.exists()) {
              const dData = dealerSnap.data() as Dealer;
              lastSeq = dData.lastOrderSequence || 0;
              prefix = dData.orderPrefix || dData.companyName.slice(0, 2).toUpperCase() || prefix;
            } else {
              // Create dealer document if it doesn't exist to prevent transaction failure on update
              transaction.set(dealerRef, {
                bakeryId,
                companyName: dealershipName || 'New Dealer',
                lastOrderSequence: 0,
                updatedAt: serverTimestamp(),
                createdAt: serverTimestamp()
              }, { merge: true });
            }

            let currentSeq = lastSeq;
            for (const [itemId, qty] of cartEntries) {
              const item = items.find(i => i.id === itemId);
              if (!item) continue;

              // Improved cake detection for categories like "500g cake"
              const isCake = item.category.toLowerCase().includes('cake');
              const isChocolate = item.category.toLowerCase().includes('chocolate');
              
              const appliedDiscount = isCake ? discount : 0;
              const priceWithGst = item.price + (item.price * item.gstPercent / 100);
              const finalAmount = Math.max(0, (priceWithGst * qty) - appliedDiscount);

              // Parse weight if it's a cake
              let weightValue = 1;
              if (isCake && item.weight) {
                const numericMatch = item.weight.match(/(\d+(\.\d+)?)/);
                if (numericMatch) {
                  weightValue = parseFloat(numericMatch[0]);
                  // Adjust for g vs kg
                  if (item.weight.toLowerCase().includes('g') && !item.weight.toLowerCase().includes('k')) {
                    weightValue = weightValue / 1000;
                  }
                }
              }

              currentSeq++;
              const displayId = `${prefix}${currentSeq.toString().padStart(3, '0')}`;
              const orderId = `ord_${Math.random().toString(36).substring(2, 9)}`;
              const orderRef = doc(db, 'orders', orderId);

              const orderData = {
                bakeryId,
                dealerId: dealerIdToUse,
                displayId,
                dealerCompanyName: dealershipName || 'Dealer Order',
                type: isCake ? 'dealer_cake' : (isChocolate ? 'chocolate' : 'custom_cake'),
                status: 'pending',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
                deliveryDate,
                deliveryTime,
                details: isCake ? {
                  weight: weightValue, // Weight per unit
                  flavor: item.name,
                  isPhotoCake: false,
                  quantity: qty,
                  instruction: `CATALOG ORDER: ${item.name} (${qty} units)`
                } : {
                  quantity: qty,
                  productType: item.category,
                  flavor: item.name,
                  instruction: `CATALOG ORDER: ${item.name} (${qty} units)`
                },
                totalAmount: finalAmount,
                discountApplied: appliedDiscount,
                advanceReceived: 0,
                customerDetails: {
                  name: dealershipName || 'Catalog Order',
                  phone: ''
                }
              };

              transaction.set(orderRef, orderData);
            }
            
            // Update dealer's sequence counter
            transaction.update(dealerRef, { 
              lastOrderSequence: currentSeq,
              updatedAt: serverTimestamp()
            });
          });

          setCart({});
          alert(`Successfully placed ${cartEntries.length} orders! Check your Active tab.`);
        } catch (err: any) {
          console.error("Order Transaction Error:", err);
          alert(`Order placement failed: ${err.message || 'Check connection'}`);
        } finally {
          setSubmitting(false);
          setPendingAction(null);
        }
      }
    );
  };

  return (
    <div className="space-y-6 pb-32">
      {/* Confirmation Modal */}
      {pendingAction && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full rounded-[2.5rem] shadow-2xl p-8 animate-in zoom-in-95 duration-200 text-center">
            <div className="w-16 h-16 bg-red-50 text-red-500 rounded-2xl flex items-center justify-center mb-6 mx-auto">
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
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Delivery Scheduler */}
        <div className="flex-1 flex flex-col sm:flex-row gap-4 items-center justify-between bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center shrink-0">
              <Calendar className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 leading-tight">Schedule Delivery</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Select date for items</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 w-full sm:w-auto">
            <div className="flex items-center gap-2">
              <input 
                type="date" 
                min={format(new Date(), 'yyyy-MM-dd')}
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
                className="flex-1 sm:flex-none bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-xs"
              />
              <input 
                type="time" 
                value={deliveryTime}
                onChange={(e) => setDeliveryTime(e.target.value)}
                className="flex-1 sm:flex-none bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-xs"
              />
            </div>
            {isBakeryRush && (
              <div className="flex items-center gap-2 text-rose-600 bg-rose-50 px-3 py-1 rounded-lg border border-rose-100">
                <Zap className="w-3 h-3 animate-pulse" />
                <span className="text-[10px] font-black uppercase">Bakery Busy: +15m delay</span>
              </div>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-2xl border border-slate-100 shadow-sm self-start">
          {canManage && (
            <button 
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-md flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add Product
            </button>
          )}

          <div className="flex items-center gap-1 p-1 bg-slate-50 rounded-xl">
            <button 
              onClick={() => setViewMode('list')}
              className={cn(
                "p-2 rounded-lg transition-all",
                viewMode === 'list' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}
            >
              <List className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setViewMode('tabs')}
              className={cn(
                "p-2 rounded-lg transition-all",
                viewMode === 'tabs' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
              )}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Category Tabs (Horizontal Scroll on Mobile) */}
      {viewMode === 'tabs' && (
        <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide no-scrollbar">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "px-6 py-2.5 rounded-full text-[10px] font-black uppercase tracking-[0.1em] transition-all whitespace-nowrap",
                activeCategory === cat 
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-100" 
                  : "bg-white text-slate-400 border border-slate-100 hover:border-blue-200"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <div className="py-24 text-center bg-white rounded-[3rem] border border-slate-100 shadow-sm">
          <div className="relative w-24 h-24 mx-auto mb-8">
            <div className="absolute inset-0 bg-blue-50 rounded-full animate-pulse"></div>
            <div className="relative bg-white rounded-full p-6 border border-slate-100 shadow-sm">
              <ShoppingCart className="w-full h-full text-blue-400" />
            </div>
          </div>
          <h3 className="text-xl font-black text-slate-900">Catalogue is Empty</h3>
          <p className="text-sm text-slate-400 font-bold max-w-xs mx-auto mt-3 leading-relaxed">
            Your bakery hasn't populated their dealer catalogue yet. 
            <br />
            <span className="text-blue-600 block mt-4 font-black uppercase tracking-widest text-[10px] bg-blue-50 py-2 px-4 rounded-full inline-block">Contact Admin to Add Items</span>
          </p>
        </div>
      ) : viewMode === 'tabs' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map(item => (
            <div key={item.id} className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-all group">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                    <Tag className="w-5 h-5" />
                  </div>
                  <div className="flex items-center gap-1">
                    {canManage && (
                      <>
                        <button onClick={() => startEdit(item)} className="p-2 text-slate-300 hover:text-blue-600 transition-colors"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={() => removeItem(item.id, item.name)} className="p-2 text-slate-300 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>
                      </>
                    )}
                    <span className="text-[9px] font-black px-2 py-1 bg-blue-50 text-blue-600 rounded uppercase tracking-widest ml-2">{item.category}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-lg font-black text-slate-900">{item.name}</h3>
                  {item.weight && <span className="text-[9px] font-black text-blue-500 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">{item.weight}</span>}
                </div>
                <p className="text-xs text-slate-400 font-bold mb-6 line-clamp-2">{item.description || 'Professional bakery selection ready for your guests.'}</p>
                
                {!isAnyDealer && (
                  <div className="flex justify-between items-center mb-6">
                    <div>
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Pricing (inc. GST)</p>
                      <p className="text-xl font-black text-slate-900">{formatCurrency(item.price + (item.price * item.gstPercent / 100))}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  {cart[item.id] ? (
                    <div className="flex-1 flex items-center bg-slate-100 rounded-xl overflow-hidden p-1">
                      <button onClick={() => updateCart(item.id, -1)} className="w-10 h-10 flex items-center justify-center text-slate-600 hover:bg-white rounded-lg transition-all font-black text-lg">−</button>
                      <span className="flex-1 text-center font-black text-xs">{cart[item.id]}</span>
                      <button onClick={() => updateCart(item.id, 1)} className="w-10 h-10 flex items-center justify-center text-slate-600 hover:bg-white rounded-lg transition-all font-black text-lg">+</button>
                    </div>
                  ) : (
                    <button 
                      onClick={() => updateCart(item.id, 1)}
                      className="flex-1 bg-slate-900 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-800 transition-all active:scale-95"
                    >
                      <Plus className="w-4 h-4" />
                      Add This Item
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-8">
          {Array.from(new Set(filteredItems.map(i => i.category))).map(cat => (
            <div key={cat} className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-slate-50/50 px-8 py-3 border-b border-slate-100 flex justify-between items-center">
                <h3 className="text-[11px] font-black text-slate-900 uppercase tracking-[0.25em]">{cat}</h3>
                <span className="text-[9px] font-bold text-slate-400 bg-white px-2 py-0.5 rounded-full border border-slate-100">{filteredItems.filter(i => i.category === cat).length} Products</span>
              </div>
              <div className="divide-y divide-slate-50">
                {filteredItems.filter(i => i.category === cat).map(item => (
                  <div key={item.id} className="px-8 py-4 hover:bg-slate-50/50 transition-all flex items-center justify-between group">
                    <div className="flex-1 mr-4">
                      <div className="flex items-center gap-3">
                        <h4 className="text-sm font-black text-slate-900">{item.name}</h4>
                        {item.weight && (
                          <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest border border-blue-100 px-2 py-0.5 rounded-full bg-blue-50">
                            {item.weight}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 font-bold mt-0.5">{item.description || 'No description'}</p>
                    </div>
                    <div className="flex items-center gap-8">
                      {!isAnyDealer && (
                        <div className="text-right">
                          <p className="text-xs font-black text-slate-900">{formatCurrency(item.price + (item.price * item.gstPercent / 100))}</p>
                          <p className="text-[8px] text-slate-300 font-black uppercase tracking-tighter">inc. {item.gstPercent}% GST</p>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-3">
                        {canManage && (
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all mr-2">
                            <button onClick={() => startEdit(item)} className="p-2 text-slate-300 hover:text-blue-500 transition-colors"><Edit2 size={14} /></button>
                            <button onClick={() => removeItem(item.id, item.name)} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                          </div>
                        )}
                        
                        {cart[item.id] ? (
                          <div className="flex items-center bg-slate-100 rounded-lg overflow-hidden p-0.5 w-24">
                            <button onClick={() => updateCart(item.id, -1)} className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-white rounded transition-all font-black">−</button>
                            <span className="flex-1 text-center font-black text-[10px]">{cart[item.id]}</span>
                            <button onClick={() => updateCart(item.id, 1)} className="w-8 h-8 flex items-center justify-center text-slate-600 hover:bg-white rounded transition-all font-black">+</button>
                          </div>
                        ) : (
                          <button 
                            onClick={() => updateCart(item.id, 1)}
                            className="bg-slate-900 text-white p-2 rounded-lg hover:bg-slate-800 transition-all active:scale-95 flex items-center gap-2"
                          >
                            <Plus size={14} />
                            <span className="text-[9px] font-black uppercase pr-1">Add</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Floating Place Order Button - Refined for Mobile/Tablet */}
      {cartCount > 0 && (
        <div className="fixed bottom-8 right-4 lg:right-8 z-[90] animate-in slide-in-from-bottom-10 flex flex-col items-end gap-3">
          {/* Cart Preview (Small) on Tablet/Mobile */}
          <div className="bg-white/90 backdrop-blur-md px-4 py-2 rounded-2xl border border-slate-100 shadow-xl lg:hidden">
            <p className="text-[10px] font-black text-slate-900 uppercase">{cartCount} Items Selected</p>
          </div>
          
          <button 
            onClick={placeBulkOrder}
            disabled={submitting}
            className="group relative flex items-center gap-4 bg-slate-900 text-white pl-6 pr-4 py-4 rounded-[2.5rem] shadow-2xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50 border-4 border-white lg:border-none"
          >
            <div className="hidden sm:block">
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest text-left leading-none mb-1">Finish & Place</p>
              <p className="text-sm font-black flex items-center gap-2">
                Order Items 
                {!isAnyDealer && (
                  <>
                    <span className="w-1 h-1 bg-slate-700 rounded-full"></span> 
                    {formatCurrency(cartTotal)}
                  </>
                )}
              </p>
            </div>
            <div className="bg-blue-600 p-4 rounded-3xl shadow-lg group-hover:bg-blue-500 transition-colors">
              <ShoppingCart className={cn("w-6 h-6", submitting && "animate-bounce")} />
            </div>
          </button>
        </div>
      )}

      {/* Form Modal for Add/Edit */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <h2 className="text-xl font-bold">{editingItem ? 'Edit Product' : 'Catalogue Entry'}</h2>
              <button onClick={() => {
                setShowForm(false);
                setEditingItem(null);
                setName(''); setPrice(''); setDesc(''); setHsn(''); setWeight('');
              }} className="text-slate-400 hover:text-white">×</button>
            </div>
            <form onSubmit={handleAddItem} className="p-8 space-y-6 overflow-y-auto">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Product Name</label>
                <input required value={name} onChange={e => setName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Base Price</label>
                  <input required type="number" value={price} onChange={e => setPrice(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Weight / Qty</label>
                  <input placeholder="e.g. 500g, 1kg" value={weight} onChange={e => setWeight(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">GST %</label>
                  <input required type="number" value={gst} onChange={e => setGst(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">HSN Code</label>
                  <input value={hsn} onChange={e => setHsn(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Category</label>
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {['500g cake', '1kg cake', 'chocolate', 'snack', 'other'].map(c => (
                      <button 
                        key={c}
                        type="button"
                        onClick={() => setCategory(c as any)}
                        className={cn(
                          "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all",
                          category === c ? "bg-slate-900 text-white border-slate-900 shadow-md" : "bg-slate-50 text-slate-400 border-slate-100"
                        )}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  <input 
                    placeholder="Or type custom category..."
                    value={category}
                    onChange={(e) => setCategory(e.target.value.toLowerCase() as any)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Description</label>
                <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs" />
              </div>
              <button type="submit" className="w-full bg-blue-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all">
                {editingItem ? 'Update Catalog Item' : 'Save Item to Catalog'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export const DealerDashboard: React.FC<{ view?: string }> = ({ view = 'dashboard' }) => {
  const { profile, bakery } = useAuth();
  const { playReadySingle, playSent, playPending, stopPending } = useSound();
  const [orders, setOrders] = useState<Order[]>([]);
  const [availableFlavors, setAvailableFlavors] = useState<string[]>([]);
  const [dealerProfile, setDealerProfile] = useState<Dealer | null>(null);
  const [loading, setLoading] = useState(true);
  const [connectionStatus, setConnectionStatus] = useState<'online' | 'offline' | 'syncing'>('syncing');
  const [syncErrors, setSyncErrors] = useState<{msg: string, code?: string}[]>([]);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const VERSION = 'v1.4.4';

  useEffect(() => {
    if (profile) {
      console.log("DealerDashboard: Profile loaded", {
        uid: profile.uid,
        role: profile.role,
        dealerId: profile.dealerId,
        bakeryId: profile.bakeryId
      });
    }
  }, [profile]);

  // Monitor network status
  useEffect(() => {
    const updateOnlineStatus = async () => {
      if (window.navigator.onLine && connectionStatus === 'offline') {
        try {
          await enableNetwork(db);
          setConnectionStatus('syncing');
        } catch (err) {
          console.warn("Recover network failed:", err);
        }
      } else if (!window.navigator.onLine) {
        setConnectionStatus('offline');
      }
    };

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    // Initial check
    if (!navigator.onLine) setConnectionStatus('offline');

    // Safety fallback for 'syncing' state on slow mobile connections
    const timer = setInterval(() => {
      if (connectionStatus === 'syncing' && navigator.onLine) {
        // If we've been syncing for 15s and have data, just mark it as online to appease the user
        if (orders.length > 0) {
          console.log("DealerDashboard: Long sync detect with data, relaxing status");
          setConnectionStatus('online');
        }
      }
    }, 15000);

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
      clearInterval(timer);
    };
  }, [connectionStatus, orders.length]);

  // Automatic network recovery heart-beat
  useEffect(() => {
    const timer = setInterval(() => {
      if (connectionStatus !== 'online' && navigator.onLine) {
        console.log("DealerDashboard: Heartbeat poking network...");
        enableNetwork(db).catch(() => {});
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [connectionStatus]);

  const handleForceRefresh = async () => {
    setLoading(true);
    try {
      // Poke Firestore network state aggressively
      await disableNetwork(db);
      await enableNetwork(db);
      
      // Force a real server-side read to skip cache and verify connection
      if (profile?.uid) {
        await getDocFromServer(doc(db, 'dealers', profile.dealerId || profile.uid));
      }
      
      console.log("DealerDashboard: Network poked and verified via server read");
    } catch (err) {
      console.error("DealerDashboard: Network poke/verify failed:", err);
    }
    
    // Force a hard reload by changing the URL with a timestamp to bust browser cache
    // Also clear specific localStorage keys if any
    localStorage.removeItem('bakery_orders_cache'); 
    const url = new URL(window.location.href);
    url.searchParams.set('v', Date.now().toString());
    window.location.href = url.toString();
  };

  const handleRepairDatabase = async () => {
    if (!window.confirm("This will clear your local offline cache to fix sync issues. Your data on the server is safe. Proceed?")) return;
    
    setLoading(true);
    try {
      await terminate(db);
      await clearIndexedDbPersistence(db);
      console.log("DealerDashboard: Database repair successful");
      alert("Local data cleared. The app will now reload and resync with the server.");
      window.location.reload();
    } catch (err) {
      console.error("DealerDashboard: Database repair failed:", err);
      alert("Repair failed. Try closing all tabs and reopening the app.");
      setLoading(false);
    }
  };

  // Safety timeout for loading state
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (loading) {
      console.log("DealerDashboard: Start loading timer");
      timer = setTimeout(() => {
        console.log("DealerDashboard: Loading timed out, forcing false");
        // If we have any orders at all (from cache), force false sooner
        setLoading(false);
      }, orders.length > 0 ? 3000 : 6000); 
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [loading, orders.length]);
  // Handle PWA resume/visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log("DealerDashboard: Page visible, verifying connection...");
        // Don't set loading(true) here as it causes UI flicker
        // Instead, just poke the networks
        enableNetwork(db).catch(console.error);
        
        // Only force reload if truly disconnected for a long time
        if (!lastSync || (Date.now() - lastSync.getTime() > 1000 * 60 * 30)) {
           console.log("DealerDashboard: Long inactivity, triggering refresh...");
           setLoading(true);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [lastSync]);

  const [showOrderForm, setShowOrderForm] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'today' | 'active' | 'completed' | 'reports'>('today');
  const [exportDate, setExportDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [rangeStart, setRangeStart] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [rangeEnd, setRangeEnd] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [exporting, setExporting] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  
  // Pagination State for Dealer Dashboard Tabs
  const [todayCurrentPage, setTodayCurrentPage] = useState(1);
  const [todayItemsPerPage, setTodayItemsPerPage] = useState(5);
  const [activeCurrentPage, setActiveCurrentPage] = useState(1);
  const [activeItemsPerPage, setActiveItemsPerPage] = useState(10);
  const [historyCurrentPage, setHistoryCurrentPage] = useState(1);
  const [historyItemsPerPage, setHistoryItemsPerPage] = useState(10);
  
  // Update page counts when orders change or items per page changes
  useEffect(() => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const todayCount = orders.filter(o => o.deliveryDate === todayStr).length;
    const totalTodayPagesNum = Math.ceil(todayCount / todayItemsPerPage);
    if (todayCurrentPage > totalTodayPagesNum && totalTodayPagesNum > 0) {
      setTodayCurrentPage(totalTodayPagesNum);
    }

    const activeCount = orders.filter(o => o.status !== 'sent').length;
    const totalActivePagesNum = Math.ceil(activeCount / activeItemsPerPage);
    if (activeCurrentPage > totalActivePagesNum && totalActivePagesNum > 0) {
      setActiveCurrentPage(totalActivePagesNum || 1);
    }

    const historyCount = orders.filter(o => o.status === 'sent').length;
    const totalHistoryPagesNum = Math.ceil(historyCount / historyItemsPerPage);
    if (historyCurrentPage > totalHistoryPagesNum && totalHistoryPagesNum > 0) {
      setHistoryCurrentPage(totalHistoryPagesNum || 1);
    }
  }, [orders, todayItemsPerPage, todayCurrentPage, activeItemsPerPage, activeCurrentPage, historyItemsPerPage, historyCurrentPage]);
  
  const prevStatuses = useRef<Record<string, OrderStatus>>({});
  const prevProblemStatus = useRef<Record<string, string | null>>({});
  const [globalAlert, setGlobalAlert] = useState<{title: string, message: string, type: 'info' | 'danger'} | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  
  useEffect(() => {
    const scrollContainer = document.querySelector('main > div.overflow-y-auto');
    if (scrollContainer) scrollContainer.scrollTo(0, 0);
  }, []);

  if (view === 'staff') {
    return (
      <div className="p-4 sm:p-8">
        <DealerStaffManager />
      </div>
    );
  }

  // Form State
  const [weight, setWeight] = useState(0.5);
  const [quantity, setQuantity] = useState(1);
  const [flavor, setFlavor] = useState(CAKE_FLAVORS[0]);
  const [isPhotoCake, setIsPhotoCake] = useState(false);
  const [custName, setCustName] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [instruction, setInstruction] = useState('');
  const [delDate, setDelDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [delTime, setDelTime] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [isBakeryRush, setIsBakeryRush] = useState(false);

    // Sync Rush State
    useEffect(() => {
      if (!bakery?.id) return;
      
      const userRole = profile?.role;
      const isRestricted = userRole === 'dealer' || userRole === 'dealer_admin' || userRole === 'dealer_staff';

      // Check for high volume in production
      let q = query(
        collection(db, 'orders'),
        where('bakeryId', '==', bakery.id)
      );

      if (isRestricted) {
        q = query(
          collection(db, 'orders'),
          where('bakeryId', '==', bakery.id),
          where('dealerId', '==', profile?.dealerId || profile?.uid)
        );
      }

      console.log(`DealerDashboard: Rush sync starting (restricted: ${isRestricted})`);

      const unsubscribe = onSnapshot(q, { includeMetadataChanges: true }, (snapshot) => {
        const isFromCache = snapshot.metadata.fromCache;
        const isSyncing = snapshot.metadata.hasPendingWrites;
        console.log(`DealerDashboard: Rush snapshot received (cache: ${isFromCache}, docs: ${snapshot.size}, syncing: ${isSyncing})`);
        
        // If there are more than 8 active orders, consider it a rush
        const activeCount = snapshot.docs.filter(doc => 
          ['pending', 'received', 'in_progress'].includes(doc.data().status)
        ).length;
        setIsBakeryRush(activeCount > 8);
      }, (err) => {
        console.error("DealerDashboard: Rush listener failed:", err);
      });

      return () => unsubscribe();
    }, [bakery?.id, profile]);

  // Set default delivery time based on current time + rush
  useEffect(() => {
    if (!showOrderForm) return;
    
    const now = new Date();
    const waitMinutes = isBakeryRush ? 45 : 30;
    const defaultDelivery = addMinutes(now, waitMinutes);
    
    setDelDate(format(defaultDelivery, 'yyyy-MM-dd'));
    setDelTime(format(defaultDelivery, 'HH:mm'));
  }, [showOrderForm, isBakeryRush]);

  const resetForm = () => {
    setWeight(0.5);
    setQuantity(1);
    if (availableFlavors.length > 0) {
      setFlavor(availableFlavors[0]);
    } else {
      setFlavor(CAKE_FLAVORS[0]);
    }
    setIsPhotoCake(false);
    setUploadedImage(null);
    setCustName('');
    setCustPhone('');
    setInstruction('');
    
    // Re-calculate default time for next order
    const now = new Date();
    const waitMinutes = isBakeryRush ? 45 : 30;
    const defaultDelivery = addMinutes(now, waitMinutes);
    setDelDate(format(defaultDelivery, 'yyyy-MM-dd'));
    setDelTime(format(defaultDelivery, 'HH:mm'));
  };
  const fileInputRef = useRef<HTMLInputElement>(null);

  const compressImage = (base64Str: string, maxWidth = 800, maxHeight = 800): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height *= maxWidth / width;
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width *= maxHeight / height;
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7)); // 70% quality JPEG
      };
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Allow up to 10MB for picking, but we will compress it down
      if (file.size > 10 * 1024 * 1024) {
        alert('File is way too large. Please select a smaller photo or take a screenshot.');
        return;
      }
      
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        try {
          const compressed = await compressImage(base64);
          setUploadedImage(compressed);
          setIsPhotoCake(true);
        } catch (err) {
          console.error("Compression error:", err);
          setUploadedImage(base64); // Fallback to original
          setIsPhotoCake(true);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    if (!profile?.uid) return;
    const fetchDealer = async () => {
      const dId = profile?.dealerId || profile?.uid;
      if (!dId) return;
      try {
        const dDoc = await getDoc(doc(db, 'dealers', dId));
        if (dDoc.exists()) {
          const dData = dDoc.data() as Dealer;
          setDealerProfile({ id: dDoc.id, ...dData } as Dealer);
          if (dData.preferredFlavor) setFlavor(dData.preferredFlavor);
          if (dData.preferredWeight) setWeight(dData.preferredWeight);
        }
      } catch (err) {
        console.error("Error fetching dealer profile:", err);
      }
    };
    fetchDealer();
  }, [profile]);

  useEffect(() => {
    if (!profile) return;

    const currentDealerId = profile.dealerId || profile.uid;
    
    if (!currentDealerId) {
      console.log("DealerDashboard: No profile or dealer ID, stopping listener (v1.4.4)");
      setLoading(false);
      return;
    }

    console.log(`DealerDashboard: Starting listener for ${currentDealerId} (v1.4.4)`);

    const q = query(
      collection(db, 'orders'),
      where('dealerId', '==', currentDealerId),
      limit(150)
    );

    const processSnapshot = (snapshot: any) => {
      try {
        const ordersData: Order[] = [];
        const isSyncing = snapshot.metadata.hasPendingWrites;
        const isFromCache = snapshot.metadata.fromCache;
        
        console.log(`DealerDashboard: Orders snap (id: ${currentDealerId}, cache: ${isFromCache}, docs: ${snapshot.size}, syncing: ${isSyncing})`);

        // Robust Connection Status Logic
        if (isSyncing) {
          setConnectionStatus('syncing');
        } else if (isFromCache) {
          // Mobile sometimes stays in "fromCache" for a while.
          // If we are actually online according to navigator, we should trust it for UI purposes
          setConnectionStatus(navigator.onLine ? 'online' : 'offline');
        } else {
          setConnectionStatus('online');
        }
        
        if (!isFromCache) setLastSync(new Date());

        snapshot.forEach((doc: any) => {
          const data = doc.data({ serverTimestamps: 'estimate' });
          const order = { id: doc.id, ...data } as Order;
          ordersData.push(order);

          // Check for status changes
          const prevStatus = prevStatuses.current[order.id];
          if (prevStatus && prevStatus !== order.status) {
            if (order.status === 'ready') playReadySingle();
            if (order.status === 'sent') playSent();
          }
          prevStatuses.current[order.id] = order.status;
        });

        // Robust sort that handles potential nulls/missing timestamps gracefully
        ordersData.sort((a, b) => {
          const t1 = (a.createdAt as any)?.toMillis?.() || Date.now();
          const t2 = (b.createdAt as any)?.toMillis?.() || Date.now();
          return t2 - t1;
        });

        setOrders(ordersData);
        setLoading(false);
      } catch (err) {
        console.error("DealerDashboard: Error processing orders snapshot:", err);
        setLoading(false);
      }
    };

    const unsubscribe = onSnapshot(q, { includeMetadataChanges: true }, processSnapshot, (error: any) => {
      console.error("Orders listener failed:", error);
      setSyncErrors(prev => [...prev, { msg: error.message, code: error.code }]);
      setLoading(false);
      
      if (error.code === 'permission-denied') {
        console.warn("DealerDashboard: Permission Denied. ID mismatch suspected.");
      }
      
      // Fallback: simple query if the complex one fails (e.g. missing index)
      const fallbackQ = query(
        collection(db, 'orders'),
        where('dealerId', '==', currentDealerId),
        limit(150)
      );
      
      const unsubFallback = onSnapshot(fallbackQ, { includeMetadataChanges: true }, (snapshot) => {
        try {
          const fallbackData = snapshot.docs.map(d => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) } as Order));
          const isSyncing = snapshot.metadata.hasPendingWrites;
          const isFromCache = snapshot.metadata.fromCache;

          // Robust Connection Status Logic (Fallback Listener)
          if (isSyncing) {
            setConnectionStatus('syncing');
          } else if (isFromCache) {
            setConnectionStatus(navigator.onLine ? 'online' : 'offline');
          } else {
            setConnectionStatus('online');
          }
          
          if (!isFromCache) setLastSync(new Date());
          
          fallbackData.sort((a, b) => {
            const t1 = (a.createdAt as any)?.toMillis?.() || Date.now();
            const t2 = (b.createdAt as any)?.toMillis?.() || Date.now();
            return t2 - t1;
          });

          fallbackData.forEach(order => {
            const prev = prevStatuses.current[order.id];
            const prevProblem = prevProblemStatus.current[order.id];

            if (prev && prev !== order.status) {
              if (order.status === 'ready') playReadySingle();
              if (order.status === 'sent') playSent();
            }

            // Detect newly reported problems
            if (order.problemDetails && prevProblem !== order.problemDetails.reason) {
              playPending(); // Trigger looping alert
              setGlobalAlert({
                title: 'PRODUCTION PROBLEM ALERT',
                message: `Bakery reported an issue with your order ${order.displayId || '#' + order.id.slice(-4)}: ${order.problemDetails.reason.toUpperCase()}. Details: ${order.problemDetails.description}`,
                type: 'danger'
              });
            }

            prevStatuses.current[order.id] = order.status;
            prevProblemStatus.current[order.id] = order.problemDetails?.reason || null;
          });

          setOrders(fallbackData);
          setLoading(false);
        } catch (err) {
          console.error("Error processing fallback orders:", err);
          setLoading(false);
        }
      }, (fallbackError) => {
        console.error("Fallback listener ALSO failed:", fallbackError);
        setLoading(false);
      });
      unsubRef.current = unsubFallback;
    });

    // Safety timeout: If after 8 seconds we haven't received a snapshot, 
    // force loading false so we can show cache or error state
    const safetyTimer = setTimeout(() => {
      setLoading(prevState => {
        if (prevState) console.warn("DealerDashboard: Snapshot timeout - forcing load state end");
        return false;
      });
    }, 8000);

    return () => {
      clearTimeout(safetyTimer);
      unsubscribe();
      if (unsubRef.current) unsubRef.current();
    };
  }, [profile, playReadySingle, playSent]);

  useEffect(() => {
    if (!bakery) return;
    const q = query(
      collection(db, 'menu_items'),
      where('bakeryId', '==', bakery.id)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const items = snap.docs.map(doc => doc.data() as MenuItem);
      const uniqueFlavors = Array.from(new Set(
        items
          .filter(i => i.category === 'cake' || i.category === 'dealer_cake_base')
          .map(i => i.name)
      ));
      setAvailableFlavors(uniqueFlavors.length > 0 ? uniqueFlavors : CAKE_FLAVORS);
    });
    return () => unsubscribe();
  }, [bakery]);

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bakery || !profile) return;

    setSubmitting(true);
    try {
      const discount = dealerProfile?.customCakeDiscount || 0;
      const pricePerKg = dealerProfile?.customPricePerKg || 500;
      const photoCharge = isPhotoCake ? (weight < 1 ? 150 : 300) : 0;
      const basePrice = (weight * pricePerKg) * quantity;
      const totalBeforeDiscount = basePrice + (photoCharge * quantity);
      const finalAmount = Math.max(0, totalBeforeDiscount - discount);

      const orderDocId = `ord_${Math.random().toString(36).substring(2, 9)}`;
      const orderRef = doc(db, 'orders', orderDocId);
      const dealerRef = doc(db, 'dealers', profile.dealerId || profile.uid);

      let finalDisplayId = '';
      await runTransaction(db, async (transaction) => {
        const dealerSnap = await transaction.get(dealerRef);
        let displayId = `#${orderDocId.slice(-6).toUpperCase()}`;
        
        if (dealerSnap.exists()) {
          const dData = dealerSnap.data() as Dealer;
          const sequence = (dData.lastOrderSequence || 0) + 1;
          const prefix = dData.orderPrefix || dData.companyName.slice(0, 2).toUpperCase();
          displayId = `${prefix}${sequence.toString().padStart(3, '0')}`;
          
          // Increment sequence
          transaction.update(dealerRef, { lastOrderSequence: sequence });
        } else {
          // Create dealer document if missing
          transaction.set(dealerRef, {
            bakeryId: bakery.id,
            companyName: dealerProfile?.companyName || profile.displayName.split(' ')[0] || 'Unknown Dealer',
            lastOrderSequence: 1,
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp()
          }, { merge: true });
          displayId = `ORD001`;
        }

        finalDisplayId = displayId;

        const orderData = {
          bakeryId: bakery.id,
          dealerId: profile.dealerId || profile.uid,
          displayId,
          dealerCompanyName: dealerProfile?.companyName || profile.displayName.split(' ')[0],
          type: 'dealer_cake',
          status: 'pending',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          deliveryDate: delDate,
          deliveryTime: delTime,
          details: {
            weight,
            flavor,
            isPhotoCake,
            quantity,
            instruction,
            photoUrl: uploadedImage || ''
          },
          totalAmount: finalAmount,
          discountApplied: discount,
          advanceReceived: 0,
          customerDetails: {
            name: custName || dealerProfile?.companyName || profile.displayName.split(' ')[0] || 'Dealer Order',
            phone: custPhone || ''
          }
        };

        transaction.set(orderRef, orderData);
      });
      
      setShowOrderForm(false);
      resetForm();
      alert(`Success! Order ${finalDisplayId} has been placed.`);
    } catch (err: any) {
      console.error("Error placing order:", err);
      let errorMsg = 'Failed to place order. Please check your internet connection.';
      
      if (err.message?.includes('too large') || err.code === 'invalid-argument') {
        errorMsg = 'Image file is too large for the database. Try a smaller photo or a screenshot.';
      } else if (err.code === 'permission-denied') {
        errorMsg = 'Permission denied. Please log in again.';
      }
      
      alert(errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const shareToWhatsApp = (order: Order) => {
    const isAnyDealer = profile?.role === 'dealer' || profile?.role === 'dealer_admin' || profile?.role === 'dealer_staff';
    const details = 'weight' in order.details ? `${order.details.weight}kg ${order.details.flavor}` : 'Gift Pack';
    const text = isAnyDealer 
      ? `*BakeSync Order Details*%0A%0AOrder ID: #${order.id.slice(-6).toUpperCase()}%0AProduct: ${details}%0AStatus: ${order.status.toUpperCase()}%0A%0APowered by BakeSync`
      : `*BakeSync Order Details*%0A%0AOrder ID: #${order.id.slice(-6).toUpperCase()}%0AProduct: ${details}%0AStatus: ${order.status.toUpperCase()}%0AAmt: ${formatCurrency(order.totalAmount)}%0A%0APowered by BakeSync`;
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const getStatusIcon = (status: OrderStatus, order?: Order) => {
    if (order?.problemDetails) return <AlertTriangle className="w-4 h-4 text-rose-500 animate-pulse" />;
    switch (status) {
      case 'pending': return <Clock className="w-4 h-4 text-gray-400" />;
      case 'in_progress': return <Package className="w-4 h-4 text-yellow-600" />;
      case 'ready': return <Bell className="w-4 h-4 text-blue-500" />;
      case 'sent': return <Truck className="w-4 h-4 text-green-500" />;
    }
  };

  const getStatusText = (status: OrderStatus, order?: Order) => {
    if (order?.problemDetails) return `ISSUE: ${order.problemDetails.reason.toUpperCase()}`;
    switch (status) {
      case 'pending': return 'Wait for acknowledgment';
      case 'in_progress': return 'Cake is being baked';
      case 'ready': return 'Ready for pickup';
      case 'sent': return 'Dispatched / Delivered';
    }
  };

  const handleRangeExport = async (start: string, end: string) => {
    if (!bakery || !profile) return;
    setExporting(true);
    try {
      const q = query(
        collection(db, 'orders'),
        where('dealerId', '==', profile.dealerId || profile.uid),
        where('deliveryDate', '>=', start),
        where('deliveryDate', '<=', end)
      );
      
      const snap = await getDocs(q);
      const rangeOrders = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Order))
        .sort((a, b) => b.deliveryDate.localeCompare(a.deliveryDate));
      
      if (rangeOrders.length === 0) {
        alert("No orders found for this range.");
        return;
      }
      
      exportOrdersToExcel(rangeOrders, bakery.name, `Range_${start}_to_${end}`);
      setShowExportModal(false);
    } catch (err) {
      console.error("Export range failed:", err);
      alert("Failed to fetch orders for export.");
    } finally {
      setExporting(false);
    }
  };

  const setPreset = (type: 'last_month' | 'three_months' | 'this_month') => {
    const today = new Date();
    if (type === 'this_month') {
      setRangeStart(format(startOfMonth(today), 'yyyy-MM-dd'));
      setRangeEnd(format(today, 'yyyy-MM-dd'));
    } else if (type === 'last_month') {
      const lastMonth = subMonths(today, 1);
      setRangeStart(format(startOfMonth(lastMonth), 'yyyy-MM-dd'));
      setRangeEnd(format(endOfMonth(lastMonth), 'yyyy-MM-dd'));
    } else if (type === 'three_months') {
      setRangeStart(format(startOfMonth(subMonths(today, 2)), 'yyyy-MM-dd'));
      setRangeEnd(format(today, 'yyyy-MM-dd'));
    }
  };

  const renderDashboard = () => {
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const todayOrders = orders.filter(o => o.deliveryDate === todayStr);
    const activeOrders = orders.filter(o => o.status !== 'sent');
    const completedOrders = orders.filter(o => o.status === 'sent');

    // Pagination Calculation for Today
    const totalTodayPages = Math.ceil(todayOrders.length / todayItemsPerPage);
    const paginatedTodayOrders = todayOrders.slice(
      (todayCurrentPage - 1) * todayItemsPerPage,
      todayCurrentPage * todayItemsPerPage
    );

    // Pagination Calculation for Active
    const totalActivePages = Math.ceil(activeOrders.length / activeItemsPerPage);
    const paginatedActiveOrders = activeOrders.slice(
      (activeCurrentPage - 1) * activeItemsPerPage,
      activeCurrentPage * activeItemsPerPage
    );

    // Pagination Calculation for History
    const totalHistoryPages = Math.ceil(completedOrders.length / historyItemsPerPage);
    const paginatedHistoryOrders = completedOrders.slice(
      (historyCurrentPage - 1) * historyItemsPerPage,
      historyCurrentPage * historyItemsPerPage
    );

    const safeTodayOrders = todayOrders.length > 5 ? paginatedTodayOrders : todayOrders;
    const safeActiveOrders = activeOrders.length > activeItemsPerPage ? paginatedActiveOrders : activeOrders;
    const safeHistoryOrders = completedOrders.length > historyItemsPerPage ? paginatedHistoryOrders : completedOrders;

    return (
      <div className="space-y-8">
        {/* Global Production Alert */}
        {globalAlert && (
          <div className="z-[300] w-full animate-in slide-in-from-top-10 duration-500">
            <div className={cn(
              "p-6 rounded-[2.5rem] border-4 flex flex-col md:flex-row items-center gap-6 shadow-2xl backdrop-blur-xl relative",
              globalAlert.type === 'danger' ? "bg-rose-600 border-rose-400 text-white" : "bg-blue-600 border-blue-400 text-white"
            )}>
              <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center shrink-0 animate-bounce">
                <AlertTriangle className="w-8 h-8" />
              </div>
              <div className="flex-1 text-center md:text-left">
                <h4 className="text-xl font-black uppercase tracking-widest">{globalAlert.title}</h4>
                <p className="text-sm font-bold opacity-90 leading-tight mt-1">{globalAlert.message}</p>
              </div>
              <button 
                onClick={() => { setGlobalAlert(null); stopPending(); }}
                className="bg-white text-rose-600 px-8 py-4 rounded-2xl text-xs font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl"
              >
                Acknowledge Issue
              </button>
            </div>
          </div>
        )}

        {/* Header Action */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 bg-white p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] border border-gray-100 shadow-sm relative overflow-hidden">
          {/* Connection Status Bar */}
          <div className={cn(
            "absolute top-0 left-0 right-0 h-1 transition-all duration-500",
            connectionStatus === 'online' ? "bg-green-500" : 
            connectionStatus === 'syncing' ? "bg-blue-500 animate-pulse" : "bg-red-500"
          )} />
          
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 w-full">
              <div className="shrink-0">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-black text-gray-900 tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-indigo-600">Dealer Portal</h1>
                    <div className="px-2 py-0.5 bg-indigo-600 text-white text-[8px] font-black uppercase rounded-md shadow-sm flex items-center gap-1">
                      LIVE: {VERSION}
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          if(confirm("Force system update? This will clear local cache and reload.")) {
                            localStorage.clear();
                            window.location.search = "force_upgrade=true";
                          }
                        }}
                        className="ml-1 opacity-70 hover:opacity-100 transition-opacity"
                        title="Repair / Update"
                      >
                        (↻)
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-50 rounded-full border border-slate-100 shadow-inner">
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      connectionStatus === 'online' ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" : 
                      connectionStatus === 'syncing' ? "bg-blue-500 animate-pulse" : "bg-red-500"
                    )} />
                    <div className="flex flex-col">
                      <span className={cn(
                        "text-[9px] font-black uppercase tracking-wider",
                        connectionStatus === 'online' ? "text-green-600" : 
                        connectionStatus === 'syncing' ? "text-blue-600" : "text-rose-500"
                      )}>
                        {connectionStatus === 'online' ? 'Connected' : 
                         connectionStatus === 'syncing' ? (orders.length > 0 ? 'Updating...' : 'Syncing...') : 
                         (navigator.onLine ? 'Cloud Sync Pending...' : 'Offline Mode')}
                      </span>
                      {lastSync && (
                        <span className="text-[6px] font-bold text-slate-400 uppercase tracking-tighter">
                          Verified: {format(lastSync, 'HH:mm:ss')}
                        </span>
                      )}
                      {connectionStatus !== 'online' && navigator.onLine && (
                        <button 
                          onClick={() => enableNetwork(db)}
                          className="text-[6px] font-black text-blue-600 uppercase tracking-tighter hover:underline"
                        >
                          Reconnect Now
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">{profile?.displayName} @ {bakery?.name}</p>
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col gap-1">
                      <button 
                        onClick={handleForceRefresh}
                        className="text-[9px] font-black text-indigo-600 border border-indigo-200 bg-indigo-50/50 px-3 py-1 rounded-lg uppercase tracking-widest hover:bg-indigo-100 transition-all flex items-center gap-1.5"
                      >
                        <Zap size={10} />
                        Force Refresh & Clear Cache
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              
              <button 
                onClick={() => setShowOrderForm(true)}
                className="w-full md:w-auto bg-indigo-600 text-white px-8 py-4 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 active:scale-95"
              >
                <Plus className="w-5 h-5" />
                PLACE NEW ORDER
              </button>
            </div>
        </div>

        {/* Square Tabs Selection */}
        {activeOrders.length > 5 && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center gap-3"
          >
            <div className="w-10 h-10 bg-amber-500 text-white rounded-full flex items-center justify-center shrink-0 animate-pulse">
              <Zap size={20} fill="currentColor" />
            </div>
            <div>
              <p className="text-xs font-black text-amber-900 uppercase tracking-tight">Bakery Rush Time Alert</p>
              <p className="text-[10px] font-bold text-amber-700 uppercase">High production volume. Orders may take slightly longer than usual.</p>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:gap-4">
          <button 
            onClick={() => setActiveTab('today')}
            className={cn(
              "p-6 rounded-[2rem] border transition-all flex flex-col items-center gap-3 text-center",
              activeTab === 'today' 
                ? "bg-indigo-600 border-indigo-600 text-white shadow-xl shadow-indigo-100 scale-[1.02]" 
                : "bg-white border-gray-100 text-gray-400 hover:border-indigo-200"
            )}
          >
            <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center", activeTab === 'today' ? "bg-white/20" : "bg-indigo-50 text-indigo-600")}>
              <Calendar size={20} />
            </div>
            <div>
              <p className={cn("text-[9px] font-black uppercase tracking-widest mb-0.5", activeTab === 'today' ? "text-indigo-100" : "text-gray-400")}>Today</p>
              <p className="text-xl font-black">{todayOrders.length}</p>
            </div>
          </button>

          <button 
            onClick={() => setActiveTab('active')}
            className={cn(
              "p-6 rounded-[2rem] border transition-all flex flex-col items-center gap-3 text-center",
              activeTab === 'active' 
                ? "bg-amber-500 border-amber-500 text-white shadow-xl shadow-amber-100 scale-[1.02]" 
                : "bg-white border-gray-100 text-gray-400 hover:border-amber-200"
            )}
          >
            <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center", activeTab === 'active' ? "bg-white/20" : "bg-amber-50 text-amber-600")}>
              <Clock size={20} />
            </div>
            <div>
              <p className={cn("text-[9px] font-black uppercase tracking-widest mb-0.5", activeTab === 'active' ? "text-amber-100" : "text-gray-400")}>Active</p>
              <p className="text-xl font-black">{activeOrders.length}</p>
            </div>
          </button>

          <button 
            onClick={() => setActiveTab('completed')}
            className={cn(
              "p-6 rounded-[2rem] border transition-all flex flex-col items-center gap-3 text-center",
              activeTab === 'completed' 
                ? "bg-green-600 border-green-600 text-white shadow-xl shadow-green-100 scale-[1.02]" 
                : "bg-white border-gray-100 text-gray-400 hover:border-green-200"
            )}
          >
            <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center", activeTab === 'completed' ? "bg-white/20" : "bg-green-50 text-green-600")}>
              <CheckCircle2 size={20} />
            </div>
            <div>
              <p className={cn("text-[9px] font-black uppercase tracking-widest mb-0.5", activeTab === 'completed' ? "text-green-100" : "text-gray-400")}>History</p>
              <p className="text-xl font-black">{completedOrders.length}</p>
            </div>
          </button>

          <button 
            onClick={() => setActiveTab('reports')}
            className={cn(
              "p-6 rounded-[2rem] border transition-all flex flex-col items-center gap-3 text-center",
              activeTab === 'reports' 
                ? "bg-slate-900 border-slate-900 text-white shadow-xl shadow-slate-100 scale-[1.02]" 
                : "bg-white border-gray-100 text-gray-400 hover:border-slate-300"
            )}
          >
            <div className={cn("w-10 h-10 rounded-2xl flex items-center justify-center", activeTab === 'reports' ? "bg-white/20" : "bg-slate-100 text-slate-600")}>
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <p className={cn("text-[9px] font-black uppercase tracking-widest mb-0.5", activeTab === 'reports' ? "text-slate-400" : "text-gray-400")}>Reports</p>
              <p className="text-xl font-black">GET</p>
            </div>
          </button>
        </div>

        {/* Mobile/Tablet Floating Order Button - EXTRA CALL TO ACTION */}
        <div className="lg:hidden fixed bottom-20 right-4 sm:bottom-24 sm:right-6 z-[100] animate-in zoom-in-50 duration-300">
          <button 
            onClick={() => setShowOrderForm(true)}
            className="w-16 h-16 bg-indigo-600 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all border-4 border-white"
          >
            <Plus size={32} />
          </button>
        </div>

        {/* Tab Content */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
          {activeTab === 'reports' ? (
            <div className="bg-white p-8 md:p-10 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                  <FileText size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900">Reports Center</h3>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Download your order data</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                {/* Daily Report */}
                <div className="bg-slate-50/50 p-8 rounded-3xl border border-slate-100 flex flex-col gap-6">
                  <div>
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Daily Delivery List</h4>
                    <p className="text-sm font-bold text-slate-600">Download orders for a specific delivery date</p>
                  </div>
                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <div className="flex flex-1 items-center gap-3 bg-white p-3 rounded-2xl border border-slate-200 w-full">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      <input 
                        type="date"
                        value={exportDate}
                        onChange={(e) => setExportDate(e.target.value)}
                        className="bg-transparent text-[10px] font-black uppercase tracking-widest text-slate-600 outline-none w-full"
                      />
                    </div>
                    <button 
                      onClick={() => {
                        const dailyOrders = orders.filter(o => o.deliveryDate === exportDate);
                        if (dailyOrders.length === 0) {
                          alert("No orders found for this delivery date.");
                          return;
                        }
                        exportOrdersToExcel(dailyOrders, bakery?.name || 'Bakery', `Delivery_${exportDate}`);
                      }}
                      className="w-full sm:w-auto px-6 py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all flex items-center justify-center gap-2"
                    >
                      <Download size={14} />
                      Download
                    </button>
                  </div>
                </div>

                {/* Advanced Multi-Date */}
                <div className="bg-slate-50/50 p-8 rounded-3xl border border-slate-100 flex flex-col justify-between">
                  <div>
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Advanced Export</h4>
                    <p className="text-sm font-bold text-slate-600">Choose custom date ranges or monthly presets</p>
                  </div>
                  <button 
                    onClick={() => setShowExportModal(true)}
                    className="mt-6 w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-3"
                  >
                    <FileSpreadsheet size={16} />
                    Open Export Options
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-[2.5rem] border border-gray-200 overflow-hidden shadow-sm">
              <div className="px-8 py-6 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                <h2 className="text-sm font-black text-gray-900 uppercase tracking-widest">
                  {activeTab === 'today' ? "Today's Deliveries" : activeTab === 'active' ? 'Active Orders' : 'Delivery History'}
                </h2>
                <div className="flex items-center gap-4">
                  {activeTab === 'today' && todayOrders.length > 5 && (
                    <div className="flex items-center gap-2">
                       <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Show:</span>
                       <select 
                         value={todayItemsPerPage}
                         onChange={(e) => {
                           setTodayItemsPerPage(Number(e.target.value));
                           setTodayCurrentPage(1);
                         }}
                         className="text-[10px] font-bold bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none appearance-none cursor-pointer hover:border-indigo-300 transition-colors"
                       >
                         <option value={5}>5 per page</option>
                         <option value={10}>10 per page</option>
                       </select>
                    </div>
                  )}
                  {activeTab === 'active' && activeOrders.length > 10 && (
                    <div className="flex items-center gap-2">
                       <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Show:</span>
                       <select 
                         value={activeItemsPerPage}
                         onChange={(e) => {
                           setActiveItemsPerPage(Number(e.target.value));
                           setActiveCurrentPage(1);
                         }}
                         className="text-[10px] font-bold bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none appearance-none cursor-pointer hover:border-indigo-300 transition-colors"
                       >
                         <option value={10}>10 per page</option>
                         <option value={20}>20 per page</option>
                         <option value={50}>50 per page</option>
                       </select>
                    </div>
                  )}
                  {activeTab === 'history' && completedOrders.length > 10 && (
                    <div className="flex items-center gap-2">
                       <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Show:</span>
                       <select 
                         value={historyItemsPerPage}
                         onChange={(e) => {
                           setHistoryItemsPerPage(Number(e.target.value));
                           setHistoryCurrentPage(1);
                         }}
                         className="text-[10px] font-bold bg-white border border-slate-200 rounded-lg px-2 py-1 outline-none appearance-none cursor-pointer hover:border-indigo-300 transition-colors"
                       >
                         <option value={10}>10 per page</option>
                         <option value={20}>20 per page</option>
                         <option value={50}>50 per page</option>
                       </select>
                    </div>
                  )}
                  <div className="px-3 py-1 bg-white rounded-full border border-gray-100 text-[10px] font-bold text-gray-400">
                    {`${activeTab === 'today' ? todayOrders.length : activeTab === 'active' ? activeOrders.length : completedOrders.length} Records`}
                  </div>
                </div>
              </div>
              <div className="divide-y divide-gray-100">
                {syncErrors.length > 0 && (
                  <div className="mb-6 p-4 bg-red-50 border border-red-100 rounded-2xl animate-in fade-in slide-in-from-top-4">
                    <div className="flex items-center gap-3 mb-2">
                      <ShieldAlert className="w-5 h-5 text-red-600" />
                      <h4 className="text-xs font-black text-red-900 uppercase tracking-widest">Connection Alert</h4>
                    </div>
                    {syncErrors.map((err, i) => (
                      <p key={i} className="text-[10px] font-bold text-red-600 leading-relaxed mb-1">
                        {err.msg} {err.code ? `[${err.code}]` : ''}
                      </p>
                    ))}
                    <button 
                      onClick={handleRepairDatabase}
                      className="mt-2 text-[10px] font-black text-red-700 underline uppercase tracking-tighter"
                    >
                      Attempt Database Repair
                    </button>
                  </div>
                )}
                
                {loading && orders.length === 0 ? (
                  <div className="p-16 text-center">
                    <div className="w-16 h-16 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
                    <p className="text-lg font-black text-slate-900 uppercase tracking-widest mb-1">Synchronizing Portal</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] animate-pulse">Establishing Live Server Link ({VERSION})</p>
                    
                    <div className="flex flex-col items-center gap-4 mt-10">
                      <div className="max-w-xs p-4 bg-indigo-50 rounded-2xl border border-indigo-100 mb-4 mx-auto">
                        <p className="text-[10px] font-bold text-indigo-700 leading-relaxed uppercase">
                          First load after update may take 5-10 seconds to rebuild local database.
                        </p>
                      </div>
                      
                      <button 
                        onClick={() => setLoading(false)}
                        className="w-full max-w-[200px] px-6 py-3 bg-white border-2 border-slate-200 rounded-2xl text-[10px] font-black text-slate-400 uppercase tracking-widest hover:border-indigo-400 hover:text-indigo-600 transition-all flex items-center justify-center gap-2"
                      >
                        Skip & View Cache
                      </button>
                      
                      <button 
                        onClick={handleRepairDatabase}
                        className="w-full max-w-[200px] px-6 py-3 bg-rose-50 text-rose-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-100 transition-all flex items-center justify-center gap-2"
                      >
                        Repair Persistent Sync
                      </button>
                    </div>
                    <div className="mt-8 p-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Phone Troubleshooting Tips:</p>
                      <ul className="text-[9px] text-slate-400 text-left space-y-1">
                        <li>• Check if "Battery Saver" or "Low Power Mode" is ON (Turn it OFF)</li>
                        <li>• Ensure "Data Saver" is OFF in your browser settings</li>
                        <li>• If using Mobile Data, check if Chrome/Safari has background data allowed</li>
                        <li>• Try opening the app in a Private/Incognito tab to test connection</li>
                      </ul>
                    </div>
                  </div>
                ) : (activeTab === 'today' ? todayOrders : activeTab === 'active' ? activeOrders : completedOrders).length === 0 ? (
                  <div className="p-16 text-center">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Package className="text-slate-200" size={32} />
                    </div>
                    <p className="text-sm font-black text-slate-400 uppercase tracking-widest">No orders found</p>
                  </div>
                ) : (
                  (activeTab === 'today' ? safeTodayOrders : activeTab === 'active' ? safeActiveOrders : safeHistoryOrders).map(order => (
                    <div key={order.id} className="px-5 py-5 md:px-8 md:py-6 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-slate-50 transition-colors" onClick={() => setSelectedOrder(order)}>
                      <div className="flex items-start gap-4 md:gap-5">
                        <div className={cn(
                          "w-12 h-12 md:w-14 md:h-14 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm",
                          order.status === 'sent' ? "bg-green-50 text-green-600" : 
                          order.status === 'ready' ? "bg-blue-50 text-blue-600" :
                          order.status === 'in_progress' ? "bg-amber-50 text-amber-600" :
                          "bg-indigo-50 text-indigo-600"
                        )}>
                          <Package className="w-5 h-5 md:w-6 md:h-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between md:justify-start gap-2 mb-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[9px] md:text-[10px] bg-slate-900 text-white px-2 py-0.5 rounded uppercase font-black">
                                {order.displayId || `#${order.id.slice(-6).toUpperCase()}`}
                              </span>
                              <span className="text-[9px] md:text-[10px] text-gray-400 font-bold uppercase hidden xs:inline">
                                {order.createdAt?.toDate() ? format(order.createdAt.toDate(), 'MMM dd, HH:mm') : 'Recently'}
                              </span>
                            </div>
                            {/* Mobile only status badge to save space if it's too long below */}
                            <div className="md:hidden">
                              <div className={cn(
                                "px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tight border",
                                order.problemDetails ? "bg-rose-600 text-white border-rose-400" : (
                                  order.status === 'pending' ? "bg-slate-50 text-slate-500 border-slate-200" :
                                  order.status === 'in_progress' ? "bg-amber-50 text-amber-700 border-amber-100" :
                                  order.status === 'ready' ? "bg-blue-50 text-blue-700 border-blue-100" :
                                  "bg-green-50 text-green-700 border-green-100"
                                )
                              )}>
                                {order.problemDetails ? '⚠️ ISSUE' : order.status.toUpperCase()}
                              </div>
                            </div>
                          </div>
                          <p className="font-black text-slate-900 text-sm md:text-base truncate">
                            {'weight' in order.details ? `${order.details.weight}kg ${order.details.flavor}` : 'Classic Selection'}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <Calendar size={10} className="text-slate-300" />
                            <span className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-tight">Delivery: {order.deliveryDate} @ {order.deliveryTime}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-end gap-3 md:gap-2 pt-3 md:pt-0 border-t border-slate-50 md:border-0">
                        <div className={cn(
                          "hidden md:block px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border",
                          order.problemDetails ? "bg-rose-600 text-white border-rose-400 animate-pulse shadow-lg shadow-rose-200" : (
                            order.status === 'pending' ? "bg-slate-50 text-slate-500 border-slate-200" :
                            order.status === 'in_progress' ? "bg-amber-50 text-amber-700 border-amber-100" :
                            order.status === 'ready' ? "bg-blue-50 text-blue-700 border-blue-100" :
                            "bg-green-50 text-green-700 border-green-100"
                          )
                        )}>
                          {order.problemDetails ? `⚠️ ISSUE: ${order.problemDetails.reason.toUpperCase()}` : (
                            order.status === 'pending' ? 'Order Received' :
                            order.status === 'in_progress' ? 'Being Made' :
                            order.status === 'ready' ? 'Ready for Pickup' :
                            `Delivered — ${order.sentAt ? format(order.sentAt.toDate(), 'dd MMM, p') : format(new Date(), 'dd MMM, p')}`
                          )}
                        </div>
                        {/* Status Label for mobile below badge */}
                        <div className="md:hidden flex flex-col gap-1 min-w-0">
                          {order.problemDetails ? (
                            <p className="text-[9px] font-black text-rose-500 uppercase truncate">⚠️ {order.problemDetails.reason.toUpperCase()}</p>
                          ) : (
                            <p className="text-[9px] font-black text-slate-400 uppercase truncate">
                              {order.status === 'sent' ? 'Completed' : 'Active Order'}
                            </p>
                          )}
                        </div>
                        
                        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                          <button 
                            onClick={() => generateOrderPDF(order, bakery)}
                            className="p-2 md:p-2.5 bg-slate-50 text-slate-400 hover:text-indigo-600 rounded-xl border border-slate-100 transition-all hover:bg-white"
                            title="Download PDF"
                          >
                            <FileText size={16} />
                          </button>
                          {(('photoUrl' in order.details && order.details.photoUrl) || ('slipUrl' in order.details && order.details.slipUrl)) && (
                              <button 
                                onClick={() => {
                                  const url = ('photoUrl' in order.details ? order.details.photoUrl : order.details.slipUrl);
                                  if (url) window.open(url, '_blank');
                                }}
                                className="p-2 md:p-2.5 bg-slate-50 text-slate-400 hover:text-blue-600 rounded-xl border border-slate-100 transition-all hover:bg-white"
                                title="View Reference Image"
                              >
                                <ImageIcon size={16} />
                              </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {/* Pagination Controls for Today */}
              {activeTab === 'today' && todayOrders.length > 5 && (
                <div className="px-8 py-6 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Showing {(todayCurrentPage-1) * todayItemsPerPage + 1} to {Math.min(todayCurrentPage * todayItemsPerPage, todayOrders.length)} of {todayOrders.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <button 
                      disabled={todayCurrentPage === 1}
                      onClick={() => setTodayCurrentPage(p => Math.max(1, p - 1))}
                      className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:border-indigo-500 disabled:opacity-30 disabled:hover:border-slate-200 transition-all font-mono"
                    >
                      Prev
                    </button>
                    <div className="flex gap-1">
                      {Array.from({ length: totalTodayPages }, (_, i) => i + 1).map(page => (
                        <button 
                          key={page}
                          onClick={() => setTodayCurrentPage(page)}
                          className={cn(
                            "w-8 h-8 rounded-lg text-[10px] font-black transition-all font-mono",
                            todayCurrentPage === page ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100" : "bg-white border border-slate-100 text-slate-400 hover:border-slate-300"
                          )}
                        >
                          {page}
                        </button>
                      ))}
                    </div>
                    <button 
                      disabled={todayCurrentPage === totalTodayPages}
                      onClick={() => setTodayCurrentPage(p => Math.min(totalTodayPages, p + 1))}
                      className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:border-indigo-500 disabled:opacity-30 disabled:hover:border-slate-200 transition-all font-mono"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}

              {/* Pagination Controls for Active */}
              {activeTab === 'active' && activeOrders.length > activeItemsPerPage && (
                <div className="px-8 py-6 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Showing {(activeCurrentPage-1) * activeItemsPerPage + 1} to {Math.min(activeCurrentPage * activeItemsPerPage, activeOrders.length)} of {activeOrders.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <button 
                      disabled={activeCurrentPage === 1}
                      onClick={() => setActiveCurrentPage(p => Math.max(1, p - 1))}
                      className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:border-indigo-500 disabled:opacity-30 disabled:hover:border-slate-200 transition-all font-mono"
                    >
                      Prev
                    </button>
                    <div className="flex gap-1 overflow-x-auto max-w-[200px] no-scrollbar">
                      {Array.from({ length: totalActivePages }, (_, i) => i + 1).map(page => (
                        <button 
                          key={page}
                          onClick={() => setActiveCurrentPage(page)}
                          className={cn(
                            "w-8 h-8 rounded-lg text-[10px] font-black transition-all shrink-0 font-mono",
                            activeCurrentPage === page ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100" : "bg-white border border-slate-100 text-slate-400 hover:border-slate-300"
                          )}
                        >
                          {page}
                        </button>
                      ))}
                    </div>
                    <button 
                      disabled={activeCurrentPage === totalActivePages}
                      onClick={() => setActiveCurrentPage(p => Math.min(totalActivePages, p + 1))}
                      className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:border-indigo-500 disabled:opacity-30 disabled:hover:border-slate-200 transition-all font-mono"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}

              {/* Pagination Controls for History */}
              {activeTab === 'history' && completedOrders.length > historyItemsPerPage && (
                <div className="px-8 py-6 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Showing {(historyCurrentPage-1) * historyItemsPerPage + 1} to {Math.min(historyCurrentPage * historyItemsPerPage, completedOrders.length)} of {completedOrders.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <button 
                      disabled={historyCurrentPage === 1}
                      onClick={() => setHistoryCurrentPage(p => Math.max(1, p - 1))}
                      className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:border-indigo-500 disabled:opacity-30 disabled:hover:border-slate-200 transition-all font-mono"
                    >
                      Prev
                    </button>
                    <div className="flex gap-1 overflow-x-auto max-w-[200px] no-scrollbar">
                      {Array.from({ length: totalHistoryPages }, (_, i) => i + 1).map(page => (
                        <button 
                          key={page}
                          onClick={() => setHistoryCurrentPage(page)}
                          className={cn(
                            "w-8 h-8 rounded-lg text-[10px] font-black transition-all shrink-0 font-mono",
                            historyCurrentPage === page ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100" : "bg-white border border-slate-100 text-slate-400 hover:border-slate-300"
                          )}
                        >
                          {page}
                        </button>
                      ))}
                    </div>
                    <button 
                      disabled={historyCurrentPage === totalHistoryPages}
                      onClick={() => setHistoryCurrentPage(p => Math.min(totalHistoryPages, p + 1))}
                      className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:border-indigo-500 disabled:opacity-30 disabled:hover:border-slate-200 transition-all font-mono"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Global Export Modals preserved via state outside locally if needed but usually global */}
      </div>
    );
  };

  const renderHistory = () => (
    <div className="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
        <h2 className="font-bold text-gray-900">Complete History</h2>
      </div>
      <div className="divide-y divide-gray-100">
        {orders.map(order => (
          <div key={order.id} className="p-6 flex items-center justify-between group hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => setSelectedOrder(order)}>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-black text-slate-900 uppercase">
                  {order.displayId || `#${order.id.slice(-6).toUpperCase()}`}
                </span>
                <p className="text-[10px] text-slate-400 font-bold uppercase">{order.createdAt?.toDate() ? format(order.createdAt.toDate(), 'PPP p') : 'Pending'}</p>
              </div>
              <p className="font-bold text-sm">{ 'weight' in order.details ? `${order.details.weight}kg ${order.details.flavor}` : 'Item' }</p>
            </div>
            <div className="text-right flex items-center gap-2 md:gap-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-all flex-shrink-0">
                <button 
                  onClick={() => generateOrderPDF(order, bakery)}
                  className="p-2 text-slate-400 hover:text-indigo-600 transition-colors bg-slate-50 md:bg-transparent rounded-lg border border-slate-100 md:border-0"
                  title="Download PDF"
                >
                  <FileText size={16} />
                </button>
                <button 
                  onClick={() => shareToWhatsApp(order)}
                  className="p-2 text-slate-400 hover:text-green-600 transition-colors bg-slate-50 md:bg-transparent rounded-lg border border-slate-100 md:border-0"
                  title="WhatsApp"
                >
                  <MessageCircle size={16} />
                </button>
              </div>
              <div className="flex flex-col items-end">
                {order.type !== 'dealer_cake' && !(profile?.role === 'dealer' || profile?.role === 'dealer_admin' || profile?.role === 'dealer_staff') && (
                  <p className="font-black text-indigo-600">{formatCurrency(order.totalAmount)}</p>
                )}
                <div className={cn(
                  "px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest",
                  order.status === 'pending' ? "bg-slate-100 text-slate-500" :
                  order.status === 'in_progress' ? "bg-amber-100 text-amber-700" :
                  order.status === 'ready' ? "bg-blue-100 text-blue-700" :
                  "bg-green-100 text-green-700"
                )}>
                  {order.status === 'pending' ? 'Pending' :
                   order.status === 'in_progress' ? 'In Progress' :
                   order.status === 'ready' ? 'Ready' :
                   `Delivered — ${order.sentAt ? format(order.sentAt.toDate(), 'dd MMM, p') : format(new Date(), 'dd MMM, p')}`}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderView = () => {
    const isAdmin = profile?.role === 'super_admin' || profile?.role === 'bakery_admin';
    switch (view) {
      case 'dashboard': return renderDashboard();
      case 'history': return renderHistory();
      case 'catalog': return <CatalogBrowser bakeryId={bakery?.id || ''} dealerId={profile?.dealerId || profile?.uid || ''} dealershipName={profile?.displayName?.split(' ')[0] || ''} discount={dealerProfile?.customCakeDiscount || 0} canManage={isAdmin} userRole={profile?.role || ''} orderPrefix={dealerProfile?.orderPrefix} />;
      default: return renderDashboard();
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="max-w-6xl mx-auto py-6 px-4"
    >
      {selectedOrder && (
        <OrderDetailsModal 
          order={selectedOrder} 
          bakery={bakery}
          dealer={dealerProfile || undefined}
          onClose={() => setSelectedOrder(null)} 
        />
      )}
      {renderView()}
      
      {/* Order Modal */}
      {showOrderForm && (
        <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white max-w-lg w-full rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 max-h-[90vh] flex flex-col">
            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-indigo-50/50 shrink-0">
              <h2 className="text-xl font-bold text-indigo-900">Place Cake Order</h2>
              <button onClick={() => setShowOrderForm(false)} className="text-indigo-400 hover:text-indigo-600">×</button>
            </div>
            
            <form onSubmit={handleSubmitOrder} className="p-8 space-y-6 overflow-y-auto flex-1 custom-scrollbar">
              <div className="bg-indigo-50/50 px-4 py-2 rounded-lg flex items-center justify-center gap-2 mb-4">
                <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></div>
                <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">Scroll for more options</span>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Select Weight</label>
                <div className="grid grid-cols-3 gap-3">
                  {[0.5, 1, 2].map(w => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => {
                        setWeight(w);
                        if (w === 0.5) {
                          setDelDate(format(new Date(), 'yyyy-MM-dd'));
                        }
                      }}
                      className={cn(
                        "py-3 rounded-xl border-2 font-bold transition-all",
                        weight === w ? "bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200" : "bg-white border-gray-100 text-gray-500 hover:border-indigo-200"
                      )}
                    >
                      {w} KG
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-blue-50/50 p-6 rounded-3xl border border-blue-100/50 animate-in slide-in-from-top-4 duration-300">
                  <label className="block text-[10px] font-black text-blue-400 uppercase tracking-widest mb-4 text-center">Schedule Delivery</label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <p className="text-[9px] font-bold text-slate-400 ml-1">DATE</p>
                      <div className="relative">
                        <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500 pointer-events-none" />
                        <input 
                          type="date" 
                          required 
                          min={format(new Date(), 'yyyy-MM-dd')}
                          value={delDate}
                          onChange={e => setDelDate(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-2xl pl-12 pr-4 py-3.5 font-bold text-xs outline-none focus:ring-4 focus:ring-blue-100 transition-all"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-[9px] font-bold text-slate-400 ml-1">TIME</p>
                      <div className="relative">
                        <Clock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500 pointer-events-none" />
                        <input 
                          type="time" 
                          required 
                          value={delTime}
                          onChange={e => setDelTime(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-2xl pl-12 pr-4 py-3.5 font-bold text-xs outline-none focus:ring-4 focus:ring-blue-100 transition-all"
                        />
                      </div>
                    </div>
                  </div>
                  {isBakeryRush && (
                    <div className="mt-4 flex items-center gap-2 text-rose-600 bg-rose-50 py-2 px-4 rounded-xl border border-rose-100 animate-pulse">
                      <Zap className="w-3 h-3 fill-current" />
                      <span className="text-[9px] font-black uppercase tracking-widest leading-none">High Production Load — +15m Wait time active</span>
                    </div>
                  )}
                  {weight < 1 && (
                    <div className="mt-4 flex items-center justify-center gap-2 text-rose-600 bg-rose-50 py-2 px-4 rounded-xl border border-rose-100">
                      <Zap className="w-3 h-3 fill-current" />
                      <span className="text-[9px] font-black uppercase tracking-widest">⚡ Same day delivery — rush charge applies</span>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex flex-col items-center bg-indigo-50/30 p-4 rounded-2xl border border-indigo-100/50">
                <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-3">Number of Cakes</label>
                    <div className="flex items-center gap-6">
                      <button 
                        type="button"
                        onClick={() => setQuantity(Math.max(1, quantity - 1))}
                        className="w-10 h-10 rounded-xl bg-white border border-indigo-100 flex items-center justify-center text-indigo-600 hover:bg-indigo-50 transition-colors"
                      >
                        -
                      </button>
                      <span className="text-xl font-black text-indigo-900 min-w-[2ch] text-center">{quantity}</span>
                      <button 
                        type="button"
                        onClick={() => setQuantity(quantity + 1)}
                        className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white hover:bg-indigo-700 transition-colors shadow-md"
                      >
                        +
                      </button>
                    </div>
                  </div>

              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Select Flavor</label>
                <select 
                  value={flavor}
                  onChange={(e) => setFlavor(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 font-semibold text-gray-700 focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                >
                  {availableFlavors.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Customer Name (Optional)</label>
                  <input 
                    placeholder="For Job Sheet"
                    value={custName}
                    onChange={(e) => setCustName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Customer Phone</label>
                  <input 
                    placeholder="Mobile Number"
                    value={custPhone}
                    onChange={(e) => setCustPhone(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center">
                    <ImageIcon className="w-5 h-5 text-indigo-500" />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-gray-900">Photo Cake</p>
                    {!(profile?.role === 'dealer' || profile?.role === 'dealer_admin' || profile?.role === 'dealer_staff') && <p className="text-[10px] text-gray-400 font-bold uppercase">Extra ₹150 / ₹300</p>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPhotoCake(!isPhotoCake)}
                  className={cn(
                    "w-12 h-6 rounded-full transition-all relative",
                    isPhotoCake ? "bg-indigo-600" : "bg-gray-300"
                  )}
                >
                  <div className={cn(
                    "absolute top-1 w-4 h-4 rounded-full bg-white transition-all shadow-sm",
                    isPhotoCake ? "left-7" : "left-1"
                  )} />
                </button>
              </div>

              {(isPhotoCake || !!uploadedImage) && (
                <div className="bg-slate-50 p-6 rounded-2xl border border-dashed border-slate-300 animate-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Image Reference</h3>
                    {uploadedImage && (
                      <button 
                        type="button"
                        onClick={() => setUploadedImage(null)}
                        className="text-[10px] font-black text-red-500 uppercase tracking-widest hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  
                  {uploadedImage ? (
                    <div className="relative w-full h-48 rounded-xl overflow-hidden group">
                      <img src={uploadedImage} alt="Reference" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button 
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="bg-white text-slate-900 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg"
                        >
                          Change Photo
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button 
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full h-32 flex flex-col items-center justify-center gap-3 bg-white rounded-xl border border-slate-100 hover:border-indigo-200 transition-all group"
                    >
                      <div className="w-10 h-10 bg-indigo-50 text-indigo-500 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Plus className="w-5 h-5" />
                      </div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Click to upload reference image</p>
                    </button>
                  )}
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    hidden 
                    accept="image/*" 
                    onChange={handleFileChange} 
                  />
                  <p className="text-[9px] text-slate-400 mt-4 text-center">Supported: JPG, PNG (Max 2MB)</p>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Special Instructions (e.g. Design notes)</label>
                <textarea 
                  placeholder="Type any specific instructions for the bakery team..."
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs h-20 resize-none outline-none focus:ring-4 focus:ring-blue-100 transition-all"
                />
              </div>

              <div className="bg-gray-900 text-white p-4 rounded-2xl flex justify-between items-center">
                <div>
                  {!(profile?.role === 'dealer' || profile?.role === 'dealer_admin' || profile?.role === 'dealer_staff') ? (
                    <>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Total Payable</p>
                      <p className="text-xl font-black">
                        {formatCurrency(Math.max(0, ((weight * (dealerProfile?.customPricePerKg || 500) + (isPhotoCake ? (weight < 1 ? 150 : 300) : 0)) * quantity) - (dealerProfile?.customCakeDiscount || 0)))}
                      </p>
                      {dealerProfile?.customCakeDiscount ? (
                        <p className="text-[9px] text-green-400 font-bold uppercase tracking-widest">Partner Discount Applied: ₹{dealerProfile.customCakeDiscount}</p>
                      ) : null}
                    </>
                  ) : (
                    <div>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Dealer Booking</p>
                      <p className="text-sm font-bold text-indigo-300">Order verification required by staff</p>
                    </div>
                  )}
                </div>
                <button 
                  type="submit"
                  disabled={submitting}
                  className="bg-indigo-500 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-400 transition-colors disabled:opacity-50"
                >
                  {submitting ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  {submitting ? 'PLACING...' : 'PLACE ORDER'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </motion.div>
  );
};
