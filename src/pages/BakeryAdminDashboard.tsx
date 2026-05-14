import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
// VERSION: 2026-04-29-V3-SOFT-DELETE
import { collection, query, where, onSnapshot, serverTimestamp, doc, setDoc, deleteDoc, updateDoc, getDoc, writeBatch, getDocs, addDoc, runTransaction } from 'firebase/firestore';
import { db, auth, handleFirestoreError } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { useSound } from '../hooks/useSound';
import { exportOrdersToExcel, generateOrderPDF } from '../lib/exportUtils';
import { OrderDetailsModal } from '../components/OrderDetailsModal';

import { createLog } from '../services/logService';

import { DrageesCostSetup } from './DrageesCostSetup';
import { DrageesProduction } from '../components/DrageesProduction';
import { DailySummaryDashboard } from '../components/DailySummaryDashboard';

const createArchive = async (collectionName: string, docId: string, data: any, reason: 'update' | 'delete') => {
  try {
    const archiveId = `arch_${Math.random().toString(36).substring(2, 9)}`;
    await setDoc(doc(db, 'archives', archiveId), {
      originalCollection: collectionName,
      documentId: docId,
      data: data,
      archivedAt: serverTimestamp(),
      archivedBy: auth.currentUser?.email || 'unknown',
      reason: reason
    });
    console.log(`Restore point created for ${collectionName}/${docId}`);
  } catch (err) {
    console.warn('Archive failed (silent):', err);
    // Don't block the main operation if archiving fails
  }
};

import { Dealer, UserProfile, Order, Bakery, OrderStatus, MenuItem, Customer, CakeDetails, ChocolateDetails, OperationType } from '../types';
import { DEALER_COMPANIES, SOUND_PATHS, CAKE_FLAVORS, DEALER_COLORS } from '../constants';
import { cn, formatCurrency, generateWhatsAppInviteLink } from '../lib/utils';
import { 
  Users, UserPlus, TrendingUp, Calendar, Phone, Trash2, Edit2, LayoutGrid, List, Store, 
  MessageCircle, Printer, PieChart, ShoppingBag, CheckCircle2, Clock, Package, 
  Image as ImageIcon, Settings, Wallet, Layers, Heart, Bell, ChevronRight, Truck, 
  Search, Filter, Plus, FileText, Download, Check, X, Volume2, Globe, Palette, Candy, User, IndianRupee, Tag, Zap, Upload, ImagePlus, ExternalLink, ShieldAlert, Database, BellOff, FileSpreadsheet, XCircle, UtensilsCrossed, Receipt, Ban, AlertCircle, ShoppingCart
} from 'lucide-react';
import { format, startOfMonth, differenceInDays, subMonths, endOfMonth } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";

const shareToWhatsApp = (order: Order, bakeryName?: string) => {
  const isCake = 'weight' in order.details;
  const description = isCake ? `${(order.details as any).weight}kg ${(order.details as any).flavor}` : 'Order details';
  const text = encodeURIComponent(`*Order Update - ${order.displayId || `#${order.id.slice(-6).toUpperCase()}`}*\n\nStatus: *${order.status.toUpperCase()}*\n\nDetails:\n- ${description}\n- Delivery: ${order.deliveryDate} @ ${order.deliveryTime}\n\nThank you!\n-${bakeryName || 'The Bakery'}`);
  const phone = order.details && 'phone' in order.details ? (order.details as any).phone : '';
  if (phone) {
    window.open(`https://wa.me/${phone.replace(/\D/g, '')}?text=${text}`, '_blank');
  }
};

const MenuAIScanModal: React.FC<{ bakeryId: string, onClose: () => void, onComplete: () => void }> = ({ bakeryId, onClose, onComplete }) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [adding, setAdding] = useState(false);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result as string);
      reader.readAsDataURL(f);
    }
  };

  const startScan = async () => {
    if (!preview) return;
    setScanning(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = "Analyze this bakery menu image. Identify logical sections or headlines found in the image (e.g., 'Signature Cakes', 'Customized Chocolates'). Group all products into these categories. For each product, extract: name, price (number only), and a brief description. Return a list of categories, each containing its products.";
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: file?.type || "image/jpeg",
                  data: preview.split(',')[1]
                }
              }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                categoryName: { type: Type.STRING },
                items: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      price: { type: Type.NUMBER },
                      description: { type: Type.STRING }
                    },
                    required: ["name", "price"]
                  }
                }
              },
              required: ["categoryName", "items"]
            }
          }
        }
      });

      const data = JSON.parse(response.text);
      setResults(data);
    } catch (err) {
      console.error(err);
      alert('AI Scan failed. Please try a clearer image.');
    } finally {
      setScanning(false);
    }
  };

  const addAllItems = async () => {
    setAdding(true);
    try {
      for (const group of results) {
        for (const item of group.items) {
          const itemId = `item_${Math.random().toString(36).substring(2, 9)}`;
          try {
            await setDoc(doc(db, 'menu_items', itemId), {
              bakeryId,
              name: item.name,
              price: item.price,
              category: group.categoryName.toLowerCase(),
              gstPercent: 5,
              description: item.description || '',
              createdAt: serverTimestamp()
            });
          } catch (err) {
            console.error(`Failed to add item ${item.name}:`, err);
            // Continue with other items
          }
        }
      }
      onComplete();
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.WRITE, 'menu_items/batch');
      alert('Failed to add some items to catalog. Check console for details.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[110] flex items-center justify-center p-4">
      <div className="bg-white max-w-2xl w-full rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        <div className="p-8 bg-slate-900 text-white flex justify-between items-center shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center">
              <Zap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-black">AI Menu Automation</h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Powered by Gemini Vision</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X className="w-6 h-6" /></button>
        </div>

        <div className="p-8 overflow-y-auto space-y-8">
          {!results.length ? (
            <div className="space-y-6">
              <div className="border-2 border-dashed border-slate-200 rounded-3xl p-12 text-center flex flex-col items-center gap-4 hover:border-blue-300 transition-all cursor-pointer relative">
                <input type="file" accept="image/*" onChange={handleImageChange} className="absolute inset-0 opacity-0 cursor-pointer" />
                {preview ? (
                  <img src={preview} className="w-48 h-48 object-cover rounded-2xl shadow-lg" alt="Menu Preview" />
                ) : (
                  <>
                    <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300">
                      <ImageIcon className="w-8 h-8" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-900">Upload physical menu photo</p>
                      <p className="text-xs text-slate-400 font-bold mt-1">We'll automatically extract items, prices & categories</p>
                    </div>
                  </>
                )}
              </div>

              {preview && (
                <button 
                  onClick={startScan}
                  disabled={scanning}
                  className="w-full bg-blue-600 text-white py-5 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-blue-200 flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {scanning ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Analyzing Layout & Headlines...
                    </>
                  ) : (
                    <>
                      <TrendingUp className="w-5 h-5" />
                      Start Vision Analysis
                    </>
                  )}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-8">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Extracted Catalogue</h3>
                <button onClick={() => setResults([])} className="text-[10px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-3 py-1.5 rounded-lg">Rescan Image</button>
              </div>
              
              <div className="space-y-8">
                {results.map((group, gIdx) => (
                  <div key={gIdx} className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="h-[2px] flex-1 bg-slate-100"></div>
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{group.categoryName}</h4>
                      <div className="h-[2px] flex-1 bg-slate-100"></div>
                    </div>
                    <div className="grid gap-3">
                      {group.items.map((item: any, iIdx: number) => (
                        <div key={iIdx} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex justify-between items-center group hover:bg-white hover:border-blue-200 transition-all shadow-sm shadow-transparent hover:shadow-blue-50">
                          <div>
                            <p className="text-sm font-black text-slate-900 group-hover:text-blue-600 transition-colors">{item.name}</p>
                            <p className="text-[9px] text-slate-400 font-bold max-w-[200px] truncate">{item.description}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-black text-slate-900">₹{item.price}</p>
                            <p className="text-[8px] text-slate-300 font-black uppercase tracking-tighter">Unit Price</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-4 sticky bottom-0 bg-white">
                <button 
                  onClick={addAllItems}
                  disabled={adding}
                  className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black uppercase tracking-widest shadow-xl flex items-center justify-center gap-3 disabled:opacity-50 hover:bg-slate-800 transition-all"
                >
                  {adding ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      Building Product Listings...
                    </>
                  ) : (
                    <>
                      <Check className="w-5 h-5" />
                      Add all {results.reduce((acc, g) => acc + g.items.length, 0)} items to Catalogue
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const MenuManager: React.FC<{ bakeryId: string }> = ({ bakeryId }) => {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [showAIScan, setShowAIScan] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form State
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState<'cake' | 'chocolate' | 'other'>('cake');
  const [gst, setGst] = useState('5');
  const [hsn, setHsn] = useState('');
  const [desc, setDesc] = useState('');
  const [weight, setWeight] = useState('');

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

  useEffect(() => {
    if (!bakeryId) {
      setLoading(false);
      return;
    }
    const unsub = onSnapshot(query(collection(db, 'menu_items'), where('bakeryId', '==', bakeryId)), (snap) => {
      setItems(snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as MenuItem))
        .filter(i => !i.isDeleted)
      );
      setLoading(false);
    });
    return unsub;
  }, [bakeryId]);

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
      handleFirestoreError(err, editingItem ? OperationType.UPDATE : OperationType.WRITE, `menu_items/${itemId}`);
    }
  };

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

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [activeCategory, setActiveCategory] = useState('All');

  const categories = ['All', ...Array.from(new Set(items.map(item => item.category)))];
  const filteredItems = activeCategory === 'All' ? items : items.filter(item => item.category === activeCategory);

  const removeItem = (id: string, name: string) => {
    confirmAction(
      'Remove Product?',
      `Are you sure you want to remove "${name}" from your catalogue? It will no longer be visible to dealers.`,
      'Confirm Removal',
      async () => {
        try {
          await updateDoc(doc(db, 'menu_items', id), {
            isDeleted: true,
            deletedAt: serverTimestamp()
          });
          alert('Product removed from catalog.');
        } catch (err) {
          handleFirestoreError(err, OperationType.DELETE, `menu_items/${id}`);
        } finally {
          setPendingAction(null);
        }
      }
    );
  };

  return (
    <div className="space-y-6">
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

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Product Catalogue & Pricing</h2>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Manage your offerings and taxes</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {/* View Toggles */}
          <div className="bg-white p-1 rounded-xl border border-slate-200 flex items-center gap-1 shadow-sm">
            <button 
              onClick={() => setViewMode('grid')}
              className={cn(
                "p-2 rounded-lg transition-all",
                viewMode === 'grid' ? "bg-slate-900 text-white shadow-md" : "text-slate-400 hover:bg-slate-50"
              )}
            >
              <LayoutGrid size={16} />
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={cn(
                "p-2 rounded-lg transition-all",
                viewMode === 'list' ? "bg-slate-900 text-white shadow-md" : "text-slate-400 hover:bg-slate-50"
              )}
            >
              <List size={16} />
            </button>
          </div>

          <button 
            onClick={() => setShowAIScan(true)} 
            className="bg-blue-50 text-blue-600 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:bg-blue-600 hover:text-white transition-all shadow-sm"
          >
            <Zap className="w-4 h-4" />
            AI Menu Scan
          </button>
          <button onClick={() => setShowForm(true)} className="bg-slate-900 text-white px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:bg-slate-800 shadow-md">+ Add Product</button>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar scrollbar-hide">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={cn(
              "px-5 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border whitespace-nowrap",
              activeCategory === cat 
                ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-100" 
                : "bg-white text-slate-400 border-slate-200 hover:border-blue-200"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredItems.map(item => (
            <div key={item.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:border-blue-200 transition-all group relative overflow-hidden flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                  <Tag className="w-6 h-6" />
                </div>
                <div className="flex gap-1">
                  <button 
                    onClick={() => startEdit(item)} 
                    className="p-2 text-slate-300 hover:text-blue-500 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => removeItem(item.id, item.name)} 
                    className="p-2 text-slate-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <h3 className="text-lg font-black text-slate-900 mb-1 leading-tight">{item.name}</h3>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-black uppercase tracking-tighter">{item.category}</span>
                {item.weight && <span className="text-[9px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-black uppercase tracking-tighter">{item.weight}</span>}
                <p className="text-[9px] text-blue-500 font-bold uppercase tracking-widest">HSN: {item.hsnCode || 'N/A'}</p>
              </div>
              <p className="text-xs text-slate-400 font-bold mb-4 line-clamp-2">{item.description || 'No description provided.'}</p>
              <div className="flex justify-between items-end mt-auto">
                <div>
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Price + {item.gstPercent}% GST</p>
                  <p className="text-xl font-black text-slate-900">{formatCurrency(item.price + (item.price * item.gstPercent / 100))}</p>
                </div>
              </div>
            </div>
          ))}
          {filteredItems.length === 0 && (
            <div className="col-span-full py-20 text-center border-2 border-dashed border-slate-100 rounded-3xl">
              <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No products found in this category.</p>
            </div>
          )}
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
                    <div className="flex-1">
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
                      <div className="text-right">
                        <p className="text-xs font-black text-slate-900">{formatCurrency(item.price + (item.price * item.gstPercent / 100))}</p>
                        <p className="text-[8px] text-slate-300 font-black uppercase tracking-tighter">inc. {item.gstPercent}% GST</p>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <button onClick={() => startEdit(item)} className="p-2 text-slate-300 hover:text-blue-500 transition-colors"><Edit2 size={14} /></button>
                        <button onClick={() => removeItem(item.id, item.name)} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {filteredItems.length === 0 && (
             <div className="py-20 text-center bg-white rounded-[2rem] border border-slate-100">
              <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No products found in this category.</p>
            </div>
          )}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <h2 className="text-xl font-bold">{editingItem ? 'Edit Product' : 'Catalogue Entry'}</h2>
              <button onClick={() => {
                setShowForm(false);
                setEditingItem(null);
              }} className="text-slate-400 hover:text-white">×</button>
            </div>
            <form onSubmit={handleAddItem} className="p-8 space-y-6 overflow-y-auto">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Product Name</label>
                <input required value={name} onChange={e => setName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Base Price (₹)</label>
                  <input required type="number" value={price} onChange={e => setPrice(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Weight / Qty</label>
                  <input placeholder="e.g. 500g, 1kg" value={weight} onChange={e => setWeight(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">GST %</label>
                <input required type="number" value={gst} onChange={e => setGst(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">HSN Code</label>
                <input value={hsn} onChange={e => setHsn(e.target.value)} placeholder="e.g. 1905" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold" />
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
                <textarea value={desc} onChange={e => setDesc(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold h-24" />
              </div>
              <button type="submit" className="w-full bg-blue-600 text-white py-4 rounded-xl font-black uppercase tracking-widest shadow-lg">Save to Catalog</button>
            </form>
          </div>
        </div>
      )}

      {showAIScan && (
        <MenuAIScanModal 
          bakeryId={bakeryId} 
          onClose={() => setShowAIScan(false)} 
          onComplete={() => {
            setShowAIScan(false);
            // Items list will auto-refresh via onSnapshot
          }} 
        />
      )}
    </div>
  );
};

const NewOrderModal: React.FC<{ 
  onClose: () => void, 
  bakeryId: string, 
  catalog?: MenuItem[],
  initialType?: 'dealer_cake' | 'custom_cake' | 'chocolate',
  dealers: Dealer[]
}> = ({ onClose, bakeryId, catalog = [], initialType = 'custom_cake', dealers }) => {
  const [type, setType] = useState(initialType);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [birthday, setBirthday] = useState('');
  const [anniversary, setAnniversary] = useState('');
  const [engagement, setEngagement] = useState('');
  const [delDate, setDelDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [delTime, setDelTime] = useState('18:00');
  const [flavor, setFlavor] = useState('');
  const [showFlavorSearch, setShowFlavorSearch] = useState(false);
  const flavorSearchRef = useRef<HTMLDivElement>(null);

  const flavorSuggestions = catalog.filter(item => {
    const isMatchedType = (type === 'chocolate' && item.category === 'chocolate') || 
                        (type !== 'chocolate' && item.category.includes('cake'));
    return isMatchedType && item.name.toLowerCase().includes(flavor.toLowerCase()) && flavor.length > 0;
  });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (flavorSearchRef.current && !flavorSearchRef.current.contains(event.target as Node)) {
        setShowFlavorSearch(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  const [weight, setWeight] = useState('0.5');
  const [qty, setQty] = useState('1');
  const [instr, setInstr] = useState('');
  const [price, setPrice] = useState('');
  const [adv, setAdv] = useState('0');
  const [photoUrl, setPhotoUrl] = useState('');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [chocolateSlip, setChocolateSlip] = useState<string | null>(null);
  const [selectedDealerId, setSelectedDealerId] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const slipInputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('File size too large. Please upload an image under 2MB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImage(reader.result as string);
        setPhotoUrl(''); // Clear URL if file is uploaded
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSlipChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('File size too large. Please upload an image under 2MB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setChocolateSlip(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

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
    fetchISD();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const orderId = `ord_${Math.random().toString(36).substring(2, 9)}`;
      let displayId = `#${orderId.slice(-6).toUpperCase()}`;
      let dealerCompanyName = '';
      
      const orderRef = doc(db, 'orders', orderId);
      
      await runTransaction(db, async (transaction) => {
        if (type === 'dealer_cake' && selectedDealerId) {
          const dealerRef = doc(db, 'dealers', selectedDealerId);
          const dealerSnap = await transaction.get(dealerRef);
          
          if (dealerSnap.exists()) {
            const dealerData = dealerSnap.data() as Dealer;
            const sequence = (dealerData.lastOrderSequence || 0) + 1;
            const prefix = dealerData.orderPrefix || dealerData.companyName.slice(0, 2).toUpperCase();
            displayId = `${prefix}${sequence.toString().padStart(3, '0')}`;
            dealerCompanyName = dealerData.companyName;
            
            // Increment sequence on dealer document
            transaction.update(dealerRef, { lastOrderSequence: sequence });
          }
        }
        
        const orderData = {
          bakeryId,
          type,
          displayId,
          dealerId: type === 'dealer_cake' ? selectedDealerId : null,
          dealerCompanyName,
          status: 'pending',
          quoteTag: type === 'custom_cake' ? 'DESIGN QUOTE PENDING' : null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          deliveryDate: delDate,
          deliveryTime: delTime,
          customerDetails: {
            name,
            phone,
            birthday,
            anniversary,
            engagementDate: engagement
          },
          details: type === 'chocolate' ? {
            quantity: parseInt(qty) || 1,
            productType: 'bites',
            flavor: flavor,
            slipUrl: chocolateSlip || '',
            instruction: instr
          } : {
            weight: parseFloat(weight) || 0.5,
            flavor,
            isPhotoCake: !!(photoUrl || uploadedImage),
            photoUrl: photoUrl || uploadedImage || '',
            instruction: instr
          },
          totalAmount: parseFloat(price) || 0,
          advanceReceived: parseFloat(adv) || 0,
        };
        
        transaction.set(orderRef, orderData);
      });

      // CRM Sync
      const customerId = `cust_${phone}`;
      const customerDoc = doc(db, 'customers', customerId);
      await setDoc(customerDoc, {
        id: customerId,
        bakeryId,
        name,
        phone,
        birthday: birthday || null,
        anniversary: anniversary || null,
        engagementDate: engagement || null,
        createdAt: serverTimestamp(),
        lastOrderAt: serverTimestamp(),
        totalOrders: 1 // In a real app we'd increment, but for simplicity we overwrite or let cloud functions handle it
      }, { merge: true });

      setUploadedImage(null);
      setChocolateSlip(null);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
      <div className="bg-white max-w-2xl w-full rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
        <div className="p-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
          <h2 className="text-sm sm:text-xl font-bold uppercase tracking-widest">New Retail Order</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-2xl px-2">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 sm:p-8 space-y-6 sm:space-y-8 overflow-y-auto custom-scrollbar">
          {/* Order Type */}
          <div className="flex flex-wrap gap-2">
            {['custom_cake', 'chocolate', 'dealer_cake'].map(t => (
              <button 
                key={t}
                type="button"
                onClick={() => setType(t as any)}
                className={cn(
                  "flex-1 min-w-[100px] py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all",
                  type === t ? "bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-200" : "bg-slate-50 text-slate-400 border-slate-100"
                )}
              >
                {t.replace('_', ' ')}
              </button>
            ))}
          </div>

          {type === 'dealer_cake' && (
            <div className="animate-in slide-in-from-top-2 duration-300">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Select Partner Dealer</label>
              <select 
                value={selectedDealerId} 
                onChange={e => setSelectedDealerId(e.target.value)} 
                className="w-full bg-blue-50 border border-blue-100 p-4 rounded-2xl font-bold outline-none focus:ring-4 focus:ring-blue-200"
              >
                <option value="">Choose a Dealer...</option>
                {((window as any).dealers || []).map((d: any) => (
                  <option key={d.id} value={d.id}>{d.companyName} ({d.staffName})</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Customer Details */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b pb-2">Client Profile</h3>
              <input required placeholder="Client Name" value={name} onChange={e => setName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl font-bold" />
              <input required placeholder="Mobile Number" value={phone} onChange={e => setPhone(e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl font-bold" />
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Birth</label>
                  <input type="date" value={birthday} onChange={e => setBirthday(e.target.value)} className="w-full text-[10px] bg-slate-50 border border-slate-200 p-2 rounded-lg font-bold" />
                </div>
                <div>
                  <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Anniversary</label>
                  <input type="date" value={anniversary} onChange={e => setAnniversary(e.target.value)} className="w-full text-[10px] bg-slate-50 border border-slate-200 p-2 rounded-lg font-bold" />
                </div>
                <div>
                  <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Engage</label>
                  <input type="date" value={engagement} onChange={e => setEngagement(e.target.value)} className="w-full text-[10px] bg-slate-50 border border-slate-200 p-2 rounded-lg font-bold" />
                </div>
              </div>
            </div>

            {/* Product Details */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b pb-2">Order Specs</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Deliv. Date</label>
                  <input type="date" required value={delDate} onChange={e => setDelDate(e.target.value)} className="w-full text-xs bg-blue-50 border border-blue-100 p-3 rounded-xl font-bold" />
                </div>
                <div>
                  <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Deliv. Time</label>
                  <input type="time" required value={delTime} onChange={e => setDelTime(e.target.value)} className="w-full text-xs bg-blue-50 border border-blue-100 p-3 rounded-xl font-bold" />
                </div>
              </div>

              <div className="relative" ref={flavorSearchRef}>
                <label className="block text-[10px] font-black text-blue-600 uppercase mb-2">What flavor is it?</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none transition-colors group-focus-within:text-blue-600">
                    <Search size={18} className="text-slate-300" />
                  </div>
                  <input 
                    required 
                    placeholder={type === 'chocolate' ? "Search chocolate flavors..." : "Search cake flavors (e.g. Pineapple, Velvet)..."}
                    value={flavor} 
                    onFocus={() => setShowFlavorSearch(true)}
                    onChange={e => {
                      setFlavor(e.target.value);
                      setShowFlavorSearch(true);
                    }} 
                    className="w-full bg-slate-50 border-2 border-slate-100 focus:border-blue-500 focus:bg-white p-5 pl-12 rounded-[2rem] font-black text-slate-900 transition-all shadow-inner" 
                  />
                </div>
                {showFlavorSearch && flavorSuggestions.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-3 bg-white border border-slate-200 rounded-[2.5rem] shadow-2xl z-[120] max-h-64 overflow-y-auto p-3 space-y-1 animate-in fade-in slide-in-from-top-2">
                    <div className="px-4 py-2 border-b border-slate-50 mb-2">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Recommended from Catalogue</p>
                    </div>
                    {flavorSuggestions.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setFlavor(item.name);
                          setPrice(item.price.toString());
                          if (item.category.includes('500g')) setWeight('0.5');
                          if (item.category.includes('1kg')) setWeight('1');
                          setShowFlavorSearch(false);
                        }}
                        className="w-full text-left p-4 hover:bg-blue-50 rounded-2xl transition-all flex items-center justify-between group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                            <Tag size={18} />
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-900 group-hover:text-blue-700">{item.name}</p>
                            <p className="text-[10px] text-slate-400 font-bold uppercase">{item.category}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-black text-blue-600">₹{item.price}</p>
                          <p className="text-[9px] text-slate-300 font-bold uppercase">Select</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {type === 'chocolate' ? (
                <div className="space-y-4">
                  <input required type="number" placeholder="Quantity" value={qty} onChange={e => setQty(e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl font-bold" />
                  
                  <div className="space-y-3">
                    <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest">Order Slip / Manual Slip</label>
                    <div className="grid grid-cols-1 gap-4">
                      {chocolateSlip ? (
                        <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 group">
                          <img src={chocolateSlip} alt="Slip Preview" className="w-full h-full object-cover" />
                          <button 
                            type="button" 
                            onClick={() => setChocolateSlip(null)}
                            className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-lg"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div>
                          <button 
                            type="button"
                            onClick={() => slipInputRef.current?.click()}
                            className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 p-5 rounded-2xl hover:border-indigo-400 hover:bg-indigo-50 transition-all text-slate-400 hover:text-indigo-600 group"
                          >
                            <FileText className="w-6 h-6 transition-transform group-hover:rotate-12" />
                            <span className="text-[10px] font-black uppercase tracking-widest">Upload Order Slip</span>
                          </button>
                          <input 
                            type="file" 
                            ref={slipInputRef}
                            className="hidden" 
                            accept="image/*"
                            onChange={handleSlipChange}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <input required step="0.5" type="number" placeholder="Weight (kg)" value={weight} onChange={e => setWeight(e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl font-bold" />
                  
                  <div className="space-y-3">
                    <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest">Cake Reference Image</label>
                    <div className="grid grid-cols-1 gap-4">
                      {uploadedImage ? (
                        <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 group">
                          <img src={uploadedImage} alt="Preview" className="w-full h-full object-cover" />
                          <button 
                            type="button" 
                            onClick={() => setUploadedImage(null)}
                            className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-full opacity-0 group-hover:opacity-100 transition-all shadow-lg"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3">
                          <div className="flex gap-2">
                            <button 
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              className="flex-1 flex items-center justify-center gap-2 border-2 border-dashed border-slate-200 p-4 rounded-2xl hover:border-blue-400 hover:bg-blue-50 transition-all text-slate-400 hover:text-blue-600 group"
                            >
                              <ImagePlus className="w-5 h-5 transition-transform group-hover:scale-110" />
                              <span className="text-[10px] font-black uppercase tracking-widest">Upload Photo</span>
                            </button>
                            <input 
                              type="file" 
                              ref={fileInputRef}
                              className="hidden" 
                              accept="image/*"
                              onChange={handleFileChange}
                            />
                          </div>
                          <div className="relative">
                            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                              <ExternalLink size={14} className="text-slate-300" />
                            </div>
                            <input 
                              placeholder="Or paste reference URL..." 
                              value={photoUrl} 
                              onChange={e => {
                                setPhotoUrl(e.target.value);
                                if (e.target.value) setUploadedImage(null);
                              }} 
                              className="w-full bg-slate-50 border border-slate-200 p-4 pl-10 rounded-2xl text-[11px] font-bold" 
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[8px] font-black text-slate-400 uppercase mb-1">Total Order Value</label>
                  <input required type="number" placeholder="Total Price" value={price} onChange={e => setPrice(e.target.value)} className="w-full bg-blue-50 border border-blue-100 p-4 rounded-2xl font-black text-blue-700" />
                </div>
                <div>
                  <label className={`block text-[8px] font-black ${type === 'dealer_cake' ? 'text-slate-400' : 'text-green-600'} uppercase mb-1`}>
                    Advance Payment {type === 'dealer_cake' && '(Optional)'}
                  </label>
                  <input 
                    required={type !== 'dealer_cake'} 
                    type="number" 
                    placeholder="Advance" 
                    value={adv} 
                    onChange={e => setAdv(e.target.value)} 
                    className={`w-full ${type === 'dealer_cake' ? 'bg-slate-50 border-slate-200 text-slate-700' : 'bg-green-50 border-green-100 text-green-700'} p-4 rounded-2xl font-black`} 
                  />
                </div>
              </div>
              <div className="bg-slate-900 p-4 rounded-2xl">
                <div className="flex justify-between items-center text-white">
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Balance Payment</span>
                  <span className="text-xl font-black text-blue-400">₹{(parseFloat(price || '0') - parseFloat(adv || '0')).toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b pb-2">Visuals & Notes</h3>
            <input placeholder="Sample Photo URL (e.g. from Pinterest or Library)" value={photoUrl} onChange={e => setPhotoUrl(e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl font-bold" />
            <textarea placeholder="Specific instructions for production team..." value={instr} onChange={e => setInstr(e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl font-bold h-24" />
          </div>

          <button disabled={loading} type="submit" className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black uppercase tracking-widest shadow-xl disabled:opacity-50">
            {loading ? 'SYNCING...' : 'Process Order & Update CRM'}
          </button>
        </form>
      </div>
    </div>
  );
};

const DashboardOverview: React.FC<{ orders: Order[], bakery: Bakery | null, onNewOrder: (t?: any) => void }> = ({ orders, bakery, onNewOrder }) => {
  const navigate = useNavigate();
  const today = new Date().toDateString();
  const todayOrders = orders.filter(o => o.createdAt?.toDate?.()?.toDateString() === today && !o.isDeleted);
  const pendingOrders = orders.filter(o => o.status === 'pending' && !o.isDeleted);
  const inProduction = orders.filter(o => o.status === 'in_progress' && !o.isDeleted);
  const readyOrders = orders.filter(o => o.status === 'ready' && !o.isDeleted);
  const thisMonthOrders = orders.filter(o => {
    const d = o.createdAt?.toDate?.();
    return d && d >= startOfMonth(new Date()) && !o.isDeleted;
  }).length;
  const yesterdayDate = new Date(new Date().setDate(new Date().getDate() - 1)).toDateString();
  const yesterdayOrders = orders.filter(o => o.createdAt?.toDate?.()?.toDateString() === yesterdayDate && o.status !== 'cancelled' && !o.isDeleted);
  const todayRevenue = todayOrders.reduce((acc, o) => acc + (o.status !== 'cancelled' ? (o.totalAmount || 0) : 0), 0);
  const yesterdayRevenue = yesterdayOrders.reduce((acc, o) => acc + (o.totalAmount || 0), 0);
  const revGrowth = yesterdayRevenue > 0 ? ((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Mobile & Tablet Quick Launch Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 lg:hidden">
        <button 
          onClick={() => navigate('/dashboard/production')}
          className="aspect-square bg-slate-900 rounded-[2rem] flex flex-col items-center justify-center p-4 text-center group active:scale-95 transition-all shadow-xl shadow-slate-200"
        >
          <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-white mb-3 group-hover:bg-amber-500 transition-colors">
            <UtensilsCrossed size={24} />
          </div>
          <span className="text-[10px] sm:text-xs font-black text-white uppercase tracking-widest leading-tight">Live<br/>Pipeline</span>
        </button>
        <button 
          onClick={() => navigate('/dashboard/orders')}
          className="aspect-square bg-white rounded-[2rem] border border-slate-200 flex flex-col items-center justify-center p-4 text-center group active:scale-95 transition-all shadow-sm"
        >
          <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 mb-3 group-hover:bg-blue-600 group-hover:text-white transition-colors">
            <Receipt size={24} />
          </div>
          <span className="text-[10px] sm:text-xs font-black text-slate-900 uppercase tracking-widest leading-tight">Order<br/>History</span>
        </button>
        <button 
          onClick={() => navigate('/dashboard/catalog')}
          className="aspect-square bg-white rounded-[2rem] border border-slate-200 flex flex-col items-center justify-center p-4 text-center group active:scale-95 transition-all shadow-sm"
        >
          <div className="w-12 h-12 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 mb-3 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
            <Tag size={24} />
          </div>
          <span className="text-[10px] sm:text-xs font-black text-slate-900 uppercase tracking-widest leading-tight">Product<br/>Menu</span>
        </button>
        <button 
          onClick={() => navigate('/dashboard/staff')}
          className="aspect-square bg-white rounded-[2rem] border border-slate-200 flex flex-col items-center justify-center p-4 text-center group active:scale-95 transition-all shadow-sm"
        >
          <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600 mb-3 group-hover:bg-purple-600 group-hover:text-white transition-colors">
            <Users size={24} />
          </div>
          <span className="text-[10px] sm:text-xs font-black text-slate-900 uppercase tracking-widest leading-tight">Staff<br/>Portal</span>
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard 
          label="Today's Orders" 
          value={todayOrders.length} 
          icon={ShoppingBag} 
          color="blue" 
          onClick={() => navigate('/dashboard/production')}
        />
        <StatCard 
          label="Pending Approval" 
          value={pendingOrders.length} 
          icon={Clock} 
          color="red" 
          onClick={() => navigate('/dashboard/production')}
        />
        <StatCard 
          label="In Production" 
          value={inProduction.length} 
          icon={Layers} 
          color="amber" 
          onClick={() => navigate('/dashboard/production')}
        />
        <StatCard 
          label="Ready to Dispatch" 
          value={readyOrders.length} 
          icon={CheckCircle2} 
          color="green" 
          onClick={() => navigate('/dashboard/production')}
        />
        <StatCard 
          label="Monthly Orders" 
          value={thisMonthOrders} 
          icon={Calendar} 
          color="purple" 
          onClick={() => navigate('/dashboard/orders')}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-sm">
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Today's Cash Flow</p>
           <h4 className="text-xl font-black text-slate-900">{formatCurrency(todayRevenue)}</h4>
           <div className="flex items-center gap-1 mt-1">
             {revGrowth >= 0 ? <TrendingUp size={12} className="text-emerald-500" /> : <Users size={12} className="text-rose-500" />}
             <span className={cn("text-[9px] font-black uppercase", revGrowth >= 0 ? "text-emerald-500" : "text-rose-500")}>
               {Math.abs(Math.round(revGrowth))}% {revGrowth >= 0 ? 'higher' : 'lower'} than yesterday
             </span>
           </div>
        </div>
        <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-sm">
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Cancellations Today</p>
           <h4 className="text-xl font-black text-slate-900">{todayOrders.filter(o => o.status === 'cancelled').length}</h4>
           <p className="text-[9px] text-slate-400 font-bold uppercase mt-1 leading-none">Accounting Protection Active</p>
        </div>
        <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-sm">
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Loyalty Pulse</p>
           <h4 className="text-xl font-black text-slate-900">{orders.filter(o => o.confirmationReminderSentAt && o.createdAt?.toDate().toDateString() === new Date().toDateString()).length}</h4>
           <p className="text-[9px] text-blue-500 font-bold uppercase mt-1 leading-none">Reminders Dispatched</p>
        </div>
        <div className="p-5 bg-white border border-slate-200 rounded-3xl shadow-sm">
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Dispatch Pipeline</p>
           <h4 className="text-xl font-black text-slate-900">{readyOrders.length > 0 ? Math.round((readyOrders.length / (todayOrders.length || 1)) * 100) : 0}%</h4>
           <p className="text-[9px] text-emerald-500 font-bold uppercase mt-1 leading-none">Readiness Score</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 sm:p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Revenue Velocity</h3>
            <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-3 py-1 rounded-full uppercase tracking-widest animate-pulse">Live</span>
          </div>
          <div className="h-48 flex items-end gap-1 sm:gap-2 px-1 sm:px-4">
            {[45, 67, 89, 56, 78, 90, 85, 95, 76, 88].map((v, i) => (
              <div key={i} className="flex-1 bg-blue-100 rounded-t-lg hover:bg-blue-600 transition-all cursor-pointer group relative" style={{ height: `${v}%` }}>
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  ₹{(v * 100).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-4 text-[10px] text-slate-400 font-black uppercase tracking-widest px-4">
            <span>Morning</span>
            <span>Evening</span>
          </div>
        </div>

        <div className="bg-slate-900 text-white p-6 sm:p-8 rounded-[2.5rem] shadow-xl shadow-slate-200 flex flex-col justify-between relative overflow-hidden">
          <div className="relative z-10">
            <h3 className="text-blue-400 text-[10px] font-black uppercase tracking-widest mb-2">Internal Operations</h3>
            <h2 className="text-2xl font-black mb-6">Quick Entries</h2>
          </div>
          <div className="space-y-3 relative z-10">
            <button onClick={() => onNewOrder('dealer_cake')} className="w-full bg-white/10 hover:bg-white/20 px-4 py-4 rounded-2xl flex items-center gap-3 transition-all text-left group">
              <div className="w-10 h-10 bg-blue-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform"><Package className="w-5 h-5 text-white" /></div>
              <span className="text-xs font-black uppercase tracking-widest">Normal Order</span>
            </button>
            <button onClick={() => onNewOrder('custom_cake')} className="w-full bg-white/10 hover:bg-white/20 px-4 py-4 rounded-2xl flex items-center gap-3 transition-all text-left group">
              <div className="w-10 h-10 bg-purple-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform"><Palette className="w-5 h-5 text-white" /></div>
              <span className="text-xs font-black uppercase tracking-widest">Custom Cake</span>
            </button>
            <button onClick={() => onNewOrder('chocolate')} className="w-full bg-white/10 hover:bg-white/20 px-4 py-4 rounded-2xl flex items-center gap-3 transition-all text-left group">
              <div className="w-10 h-10 bg-amber-500 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform"><Candy className="w-5 h-5 text-white" /></div>
              <span className="text-xs font-black uppercase tracking-widest">Chocolate Batch</span>
            </button>
          </div>
          {/* Background Gradient */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600 rounded-full blur-[100px] opacity-20 -mr-20 -mt-20"></div>
        </div>
      </div>
    </div>
  );
};

const OrdersManager: React.FC<{ orders: Order[], dealers: Dealer[], bakery: Bakery | null }> = ({ orders, dealers, bakery }) => {
  const [filter, setFilter] = useState<'all' | 'today' | 'pending' | 'completed'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'dealer'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [exportDate, setExportDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [rangeStart, setRangeStart] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [rangeEnd, setRangeEnd] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [exporting, setExporting] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(15);

  const handleCancelOrder = async (orderId: string) => {
    const reason = prompt("Enter reason for cancellation:");
    if (!reason) return;
    
    try {
      const orderRef = doc(db, 'orders', orderId);
      await updateDoc(orderRef, {
        status: 'cancelled',
        cancelledAt: serverTimestamp(),
        cancelledBy: auth.currentUser?.email || 'admin',
        cancelledReason: reason,
        updatedAt: serverTimestamp()
      });
      await createLog('order', `Order #${orderId.slice(-6)} cancelled: ${reason}`, auth.currentUser?.uid, auth.currentUser?.email, bakery?.id || '');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  const handleSendReminder = async (order: Order) => {
    if (!order.customerDetails?.phone) return;

    try {
      const orderRef = doc(db, 'orders', order.id);
      await updateDoc(orderRef, {
        confirmationReminderSentAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      const message = `Namaste ${order.customerDetails.name}! This is a friendly reminder for your order at ${bakery?.name || 'Bakesync'}. Your order (#${order.displayId || order.id.slice(-6)}) for ${order.deliveryDate} is currently ${order.status.toUpperCase()}. Looking forward to serving you!`;
      const waUrl = `https://wa.me/91${order.customerDetails.phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
      window.open(waUrl, '_blank');
      
      await createLog('order', `Confirmation reminder sent to ${order.customerDetails.phone}`, auth.currentUser?.uid, auth.currentUser?.email, bakery?.id || '');
    } catch (err) {
       handleFirestoreError(err, OperationType.UPDATE, `orders/${order.id}`);
    }
  };
  
  const filteredOrders = orders.filter(order => {
    const matchesSearch = order.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          order.customerDetails?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          order.dealerCompanyName?.toLowerCase().includes(searchTerm.toLowerCase());
    if (filter === 'today') return matchesSearch && order.createdAt?.toDate().toDateString() === new Date().toDateString();
    if (filter === 'pending') return matchesSearch && (order.status === 'pending');
    if (filter === 'completed') return matchesSearch && order.status === 'sent';
    return matchesSearch;
  }).sort((a, b) => {
    if (sortBy === 'date') {
      const timeA = a.createdAt?.toDate().getTime() || 0;
      const timeB = b.createdAt?.toDate().getTime() || 0;
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    } else {
      const nameA = a.dealerCompanyName || 'Retail';
      const nameB = b.dealerCompanyName || 'Retail';
      return sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
    }
  });

  // Calculate pagination
  const totalPages = Math.ceil(filteredOrders.length / itemsPerPage);
  const paginatedOrders = filteredOrders.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [filteredOrders.length, itemsPerPage, currentPage, totalPages]);

  const handleDailyExport = () => {
    const dailyOrders = orders.filter(o => o.deliveryDate === exportDate);
    if (dailyOrders.length === 0) {
      alert("No orders found for this delivery date.");
      return;
    }
    exportOrdersToExcel(dailyOrders, bakery?.name || 'Bakery', `Delivery_${exportDate}`);
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

  const handleRangeExport = () => {
    setExporting(true);
    try {
      const rangeOrders = orders.filter(o => o.deliveryDate >= rangeStart && o.deliveryDate <= rangeEnd);
      if (rangeOrders.length === 0) {
        alert("No orders found for this range.");
        return;
      }
      exportOrdersToExcel(rangeOrders, bakery?.name || 'Bakery', `Range_${rangeStart}_to_${rangeEnd}`);
      setShowExportModal(false);
    } catch (err) {
      console.error(err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row gap-4 justify-between items-center bg-white p-6 rounded-3xl border border-slate-200">
        <div className="flex p-1 bg-slate-100 rounded-2xl w-full lg:w-auto overflow-x-auto no-scrollbar">
          {['all', 'today', 'pending', 'completed'].map(t => (
            <button 
              key={t}
              onClick={() => setFilter(t as any)}
              className={cn(
                "flex-1 lg:flex-none px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                filter === t ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-800"
              )}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-100 w-full lg:w-auto justify-between lg:justify-start">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <input 
              type="date"
              value={exportDate}
              onChange={(e) => setExportDate(e.target.value)}
              className="bg-transparent text-[10px] font-black uppercase tracking-widest text-slate-600 outline-none w-32"
            />
          </div>
          <button 
            onClick={handleDailyExport}
            className="p-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-sm"
            title="Download Daily Sheet"
          >
            <Download size={14} />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-2xl px-3 py-2 shrink-0">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Show:</span>
            <select 
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="text-[10px] font-bold bg-transparent outline-none appearance-none cursor-pointer hover:text-indigo-600 transition-colors"
            >
              <option value={15}>15</option>
              <option value={30}>30</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search Orders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-12 pr-4 py-3 text-sm font-bold outline-none focus:ring-4 focus:ring-blue-100 transition-all"
            />
          </div>
        </div>
        <div className="flex gap-2 w-full lg:w-auto">
          <button 
            onClick={() => setShowExportModal(true)}
            className="flex-1 lg:flex-none p-3 bg-slate-50 border border-slate-200 rounded-2xl text-slate-600 hover:bg-slate-100 transition-all flex items-center justify-center"
            title="Download Excel Report"
          >
            <FileSpreadsheet className="w-5 h-5 lg:mr-2" />
            <span className="lg:hidden text-[10px] font-black uppercase tracking-widest">Export All</span>
          </button>
        </div>
      </div>

      {/* Advanced Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                  <FileSpreadsheet size={20} />
                </div>
                <div>
                  <h3 className="font-black text-slate-900">Export Orders</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Excel Report Generator</p>
                </div>
              </div>
              <button onClick={() => setShowExportModal(false)} className="w-10 h-10 rounded-full border border-slate-200 flex items-center justify-center text-slate-400 hover:text-red-500 transition-all">
                <XCircle size={20} />
              </button>
            </div>

            <div className="p-8 space-y-8">
              {/* Presets */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Quick Selection</label>
                <div className="grid grid-cols-2 gap-3">
                  <button 
                    onClick={() => setPreset('this_month')}
                    className="px-4 py-3 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-tight hover:border-indigo-500 transition-all text-slate-600"
                  >
                    This Month
                  </button>
                  <button 
                    onClick={() => setPreset('last_month')}
                    className="px-4 py-3 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-tight hover:border-indigo-500 transition-all text-slate-600"
                  >
                    Last Month
                  </button>
                  <button 
                    onClick={() => setPreset('three_months')}
                    className="col-span-2 px-4 py-3 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-tight hover:border-indigo-500 transition-all text-slate-600"
                  >
                    Last 3 Months (Full History)
                  </button>
                </div>
              </div>

              {/* Custom Range */}
              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Custom Date Range</label>
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1.5">
                    <p className="text-[9px] font-bold text-slate-400 ml-1 uppercase">From</p>
                    <input 
                      type="date"
                      value={rangeStart}
                      onChange={(e) => setRangeStart(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-[9px] font-bold text-slate-400 ml-1 uppercase">To</p>
                    <input 
                      type="date"
                      value={rangeEnd}
                      onChange={(e) => setRangeEnd(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs"
                    />
                  </div>
                </div>
              </div>

              <button 
                onClick={handleRangeExport}
                disabled={exporting}
                className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-3"
              >
                {exporting ? (
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                ) : (
                  <Download size={16} />
                )}
                {exporting ? 'Generating...' : 'Download Export'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden">
        {selectedOrder && (
          <OrderDetailsModal 
            order={selectedOrder} 
            bakery={bakery}
            dealer={dealers.find(d => d.id === selectedOrder.dealerId)}
            onClose={() => setSelectedOrder(null)} 
          />
        )}
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-100 font-black text-slate-400 uppercase tracking-widest text-[10px]">
              <tr>
                <th className="px-6 py-4 text-left min-w-[100px] md:min-w-[120px]">
                  <button 
                    onClick={() => {
                      if (sortBy === 'date') setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                      else setSortBy('date');
                    }}
                    className="flex items-center gap-1 hover:text-indigo-600 transition-colors"
                  >
                    Sort: Time {sortBy === 'date' && (sortOrder === 'desc' ? '▼' : '▲')}
                  </button>
                </th>
                <th className="px-6 py-4 text-left min-w-[180px] md:min-w-[200px]">Details</th>
                <th className="hidden sm:table-cell px-6 py-4 text-left min-w-[150px]">Delivery</th>
                <th className="hidden lg:table-cell px-6 py-4 text-left min-w-[150px]">
                  <button 
                    onClick={() => {
                      if (sortBy === 'dealer') setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                      else setSortBy('dealer');
                    }}
                    className="flex items-center gap-1 hover:text-indigo-600 transition-colors"
                  >
                    Sort: Dealer {sortBy === 'dealer' && (sortOrder === 'desc' ? '▼' : '▲')}
                  </button>
                </th>
                <th className="px-6 py-4 text-left min-w-[100px] md:min-w-[120px]">Status</th>
                <th className="hidden md:table-cell px-6 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest min-w-[120px]">Payment Status</th>
                <th className="px-4 py-4 md:px-6 md:py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest min-w-[80px] md:min-w-[100px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-20 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">No orders match your current filters.</td>
                </tr>
              ) : (
                paginatedOrders.map(order => (
                  <tr key={order.id} className="hover:bg-slate-50/50 transition-colors cursor-pointer" onClick={() => setSelectedOrder(order)}>
                    <td className="px-6 py-4">
                    <div className="text-xs font-black text-slate-900">{order.displayId || `#${order.id.slice(-6).toUpperCase()}`}</div>
                    <div className="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                      {order.receivedBy && <span>REC: {order.receivedBy.split(' ')[0]} </span>}
                      {order.readyBy && <span>• RDY: {order.readyBy.split(' ')[0]} </span>}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-bold text-slate-900">
                      {'weight' in order.details ? `${order.details.weight}kg ${order.details.flavor}` : 'Chocolate Batch'}
                    </div>
                    <div className="text-[10px] text-slate-400 font-bold flex flex-wrap gap-x-2">
                       <span>{order.customerDetails?.name || 'Customer'}</span>
                       <span className="lg:hidden text-indigo-500">• {order.dealerCompanyName || 'Direct'}</span>
                    </div>
                  </td>
                  <td className="hidden sm:table-cell px-6 py-4">
                    <div className="flex items-center gap-2 text-xs font-black text-red-600 bg-red-50 w-fit px-2 py-1 rounded">
                      <Clock className="w-3 h-3" />
                      {order.deliveryDate ? format(new Date(order.deliveryDate), 'dd MMM') : '-'} @ {order.deliveryTime || '-'}
                    </div>
                  </td>
                  <td className="hidden lg:table-cell px-6 py-4">
                    <div className="flex items-center gap-2">
                      {order.dealerId && (
                        <div 
                          className="w-2 h-2 rounded-full shrink-0" 
                          style={{ backgroundColor: dealers.find(d => d.id === order.dealerId)?.color || '#6366f1' }}
                        />
                      )}
                      <div className="text-xs font-bold text-slate-700">{order.dealerCompanyName || 'Direct'}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "text-[9px] font-black px-2 py-1 rounded-full uppercase tracking-tighter border",
                      order.status === 'pending' ? "bg-red-50 text-red-600 border-red-100" :
                      order.status === 'sent' ? "bg-green-50 text-green-600 border-green-100" :
                      order.status === 'cancelled' ? "bg-slate-100 text-slate-500 border-slate-200" :
                      "bg-blue-50 text-blue-600 border-blue-100"
                    )}>
                      {order.status}
                    </span>
                  </td>
                  <td className="hidden md:table-cell px-6 py-4">
                    <div className="text-right">
                      {order.type !== 'dealer_cake' ? (
                        <>
                          <div className="text-xs font-black text-slate-900">{formatCurrency(order.totalAmount)}</div>
                          {order.advanceReceived > 0 && (
                            <div className="text-[9px] font-bold text-green-600">Paid: {formatCurrency(order.advanceReceived)}</div>
                          )}
                          {order.totalAmount - (order.advanceReceived || 0) > 0 && (
                            <div className="text-[9px] font-bold text-red-500">Bal: {formatCurrency(order.totalAmount - (order.advanceReceived || 0))}</div>
                          )}
                        </>
                      ) : (
                        <div className="text-[10px] font-bold text-slate-400 italic">Dealer Pricing</div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 md:px-6 md:py-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1 md:gap-2">
                      {order.status !== 'cancelled' && order.status !== 'sent' && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleSendReminder(order); }}
                          className={cn(
                            "p-2 rounded-xl transition-all",
                            order.confirmationReminderSentAt ? "bg-green-50 text-green-600 border border-green-200" : "bg-blue-50 text-blue-600 hover:bg-blue-600 hover:text-white"
                          )}
                          title="Send Confirmation Reminder"
                        >
                          <MessageCircle size={14} className={order.confirmationReminderSentAt ? "animate-pulse" : ""} />
                        </button>
                      )}
                      {order.status !== 'cancelled' && order.status !== 'sent' && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleCancelOrder(order.id); }}
                          className="p-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-600 hover:text-white transition-all shadow-sm"
                          title="Cancel Order"
                        >
                          <Ban size={14} />
                        </button>
                      )}
                      <button 
                        onClick={() => generateOrderPDF(order, bakery)}
                        className="p-2 text-slate-400 hover:text-blue-600 transition-colors bg-slate-50 md:bg-transparent rounded-lg border border-slate-100 md:border-0"
                        title="Download PDF Job Sheet"
                      >
                        <FileText size={16} />
                      </button>
                      {(('photoUrl' in order.details && order.details.photoUrl) || ('slipUrl' in order.details && order.details.slipUrl)) && (
                        <button 
                          onClick={() => {
                            const url = ('photoUrl' in order.details ? order.details.photoUrl : order.details.slipUrl);
                            if (url) window.open(url, '_blank');
                          }}
                          className="p-2 text-slate-400 hover:text-blue-500 transition-colors bg-slate-50 md:bg-transparent rounded-lg border border-slate-100 md:border-0"
                          title="View Reference Image / Slip"
                        >
                          <ImageIcon size={16} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
        
        {filteredOrders.length > itemsPerPage && (
          <div className="px-8 py-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Showing {(currentPage-1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredOrders.length)} of {filteredOrders.length}
            </p>
            <div className="flex items-center gap-2">
              <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest hover:border-blue-500 disabled:opacity-30 disabled:hover:border-slate-200 transition-all font-mono"
              >
                Prev
              </button>
              <div className="flex gap-1 overflow-x-auto max-w-[200px] no-scrollbar">
                {Array.from({ length: Math.min(10, totalPages) }, (_, i) => {
                   let p = i + 1;
                   if (totalPages > 10 && currentPage > 5) {
                     p = currentPage - 5 + i;
                     if (p + 10 > totalPages) p = totalPages - 9;
                   }
                   if (p > totalPages) return null;
                   return (
                    <button 
                      key={p}
                      onClick={() => setCurrentPage(p)}
                      className={cn(
                        "w-8 h-8 rounded-lg text-[10px] font-black transition-all shrink-0 font-mono",
                        currentPage === p ? "bg-blue-600 text-white shadow-lg shadow-blue-100" : "bg-white border border-slate-100 text-slate-400 hover:border-slate-300"
                      )}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
              <button 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
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
};

const ProductionCore: React.FC<{ orders: Order[], bakery: Bakery | null, dealers?: Dealer[] }> = ({ orders, bakery, dealers = [] }) => {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const { playReady, stopReady, playSent, stopPending } = useSound();
  const [activeTab, setActiveTab] = useState<'active' | 'completed'>('active');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'dealers' | 'custom'>('all');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Force re-render periodically for the 5-minute linger logic
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const isRecentlySent = (order: Order) => {
    if (order.status !== 'sent' || !order.sentAt) return false;
    const sentTime = order.sentAt.toDate().getTime();
    const diffInMinutes = (currentTime.getTime() - sentTime) / (1000 * 60);
    return diffInMinutes < 5;
  };

  const isInProgressTooLong = (order: Order) => {
    if (order.status !== 'in_progress' || !order.inProgressAt) return false;
    const inProgressTime = order.inProgressAt.toDate().getTime();
    const diffInMinutes = (currentTime.getTime() - inProgressTime) / (1000 * 60);
    return diffInMinutes > 20;
  };
  
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
  
  const updateStatus = async (orderId: string, currentStatus: OrderStatus) => {
    const docRef = doc(db, 'orders', orderId);
    const order = orders.find(o => o.id === orderId);
    const staffName = auth?.currentUser?.displayName || auth?.currentUser?.email || 'System';
    
    let next: OrderStatus = 'received';
    const isDirectToProduction = order?.type === 'dealer_cake' || order?.type === 'custom_cake' || order?.type === 'chocolate' || !!order?.dealerId;

    if (currentStatus === 'pending') {
      next = isDirectToProduction ? 'in_progress' : 'received';
    } else if (currentStatus === 'received') {
      next = 'in_progress';
    } else if (currentStatus === 'in_progress') {
      next = 'ready';
    } else if (currentStatus === 'ready') {
      next = 'sent';
    } else {
      return;
    }
    
    // Payment Verification for Retail Custom Cakes & Chocolates (Dealers are billed monthly)
    if (next === 'sent') {
      const order = orders.find(o => o.id === orderId);
      const isDealerOrder = order?.dealerId || order?.type === 'dealer_cake';
      if (order && !isDealerOrder && (order.type === 'custom_cake' || order.type === 'chocolate')) {
        const balance = order.totalAmount - (order.advanceReceived || 0);
        if (balance > 0) {
          confirmAction(
            'Balance Payment Verification',
            `Order Total: ₹${order.totalAmount.toLocaleString()}\nAdvance Paid: ₹${(order.advanceReceived || 0).toLocaleString()}\n\nPENDING BALANCE: ₹${balance.toLocaleString()}\n\nHas the balance amount been collected by the staff?`,
            'Confirm Payment & Dispatch',
            async () => {
              try {
                await updateDoc(docRef, { 
                  status: 'sent', 
                  updatedAt: serverTimestamp(),
                  sentAt: serverTimestamp(),
                  sentBy: staffName
                });
                await createLog('order', `Order #${orderId.slice(-6)} delivered by ${staffName} (Payment Verified)`, auth.currentUser?.uid, auth.currentUser?.email, bakery?.id || '');
              } catch (err) {
                handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
              } finally {
                setPendingAction(null);
              }
            }
          );
          return;
        }
      }
    }

    try {
      const updateData: any = { 
        status: next, 
        updatedAt: serverTimestamp(),
      };

      if (next === 'received') {
        updateData.receivedAt = serverTimestamp();
        updateData.receivedBy = staffName;
      } else if (next === 'in_progress') {
        updateData.inProgressAt = serverTimestamp();
        updateData.inProgressBy = staffName;
      } else if (next === 'ready') {
        updateData.readyAt = serverTimestamp();
        updateData.readyBy = staffName;
      } else if (next === 'sent') {
        updateData.sentAt = serverTimestamp();
        updateData.sentBy = staffName;
      }

      await updateDoc(docRef, updateData);
      await createLog('order', `Order #${orderId.slice(-6)} status: ${next} by ${staffName}`, authUser?.uid, authUser?.email, bakery?.id || '');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  const statusCols: OrderStatus[] = ['pending', 'in_progress', 'ready', 'sent'];

  return (
    <div className="space-y-6">
      {/* Confirmation Modal */}
      {pendingAction && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4 text-center">
          <div className="bg-white max-w-sm w-full rounded-[2.5rem] shadow-2xl p-8 animate-in zoom-in-95 duration-200">
            <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center mb-6 mx-auto">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-2">{pendingAction.title}</h3>
            <p className="text-sm font-medium text-slate-500 mb-8 leading-relaxed whitespace-pre-line">
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
                className="flex-1 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all"
              >
                {pendingAction.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      {selectedOrder && (
        <OrderDetailsModal 
          order={selectedOrder} 
          bakery={bakery}
          dealer={dealers.find(d => d.id === selectedOrder.dealerId)}
          onClose={() => setSelectedOrder(null)} 
        />
      )}
      <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl w-fit">
        <button 
          onClick={() => setActiveTab('active')}
          className={cn(
            "px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
            activeTab === 'active' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
          )}
        >
          Active Production ({orders.filter(o => o.status !== 'sent' || isRecentlySent(o)).length})
        </button>
        <button 
          onClick={() => setActiveTab('completed')}
          className={cn(
            "px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
            activeTab === 'completed' ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
          )}
        >
          History Today ({orders.filter(o => o.status === 'sent' && !isRecentlySent(o)).length})
        </button>
      </div>

      {activeTab === 'active' ? (
        <>
          {orders.filter(o => o.status !== 'sent' || isRecentlySent(o)).length === 0 && (
            <div className="py-4 text-center text-slate-400 text-[13px] font-medium">
              No active orders right now
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">

        {statusCols.map(status => (
          <div key={status} className="flex flex-col gap-4">
            <div className="flex items-center justify-between px-2">
              <div className="flex items-center gap-2">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  {status === 'sent' ? 'Sent' : status.replace('_', ' ')}
                </h3>
                {status === 'ready' && orders.filter(o => o.status === 'ready').length > 0 && (
                  <button 
                    onClick={() => stopReady()} 
                    className="bg-red-50 text-red-500 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter hover:bg-red-500 hover:text-white transition-all shadow-sm"
                  >
                    Mute
                  </button>
                )}
              </div>
              <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full text-[10px] font-black">
                {orders.filter(o => {
                  if (status === 'sent') return isRecentlySent(o);
                  return status === 'in_progress' ? (o.status === 'in_progress' || o.status === 'received') : o.status === status;
                }).length}
              </span>
            </div>
            <div className="space-y-4">
              {orders.filter(o => {
                if (status === 'sent') return isRecentlySent(o);
                return status === 'in_progress' ? (o.status === 'in_progress' || o.status === 'received') : o.status === status;
              }).map(order => {
                const dealer = order.dealerId ? dealers.find(d => d.id === order.dealerId) : null;
                const dealerColor = dealer?.color;
                return (
                  <div 
                    key={order.id} 
                    className={cn(
                      "bg-white p-4 rounded-2xl border border-slate-200 shadow-sm group transition-all border-l-4",
                      !order.dealerId && (
                        status === 'pending' ? "border-l-slate-400" :
                        status === 'in_progress' ? "border-l-amber-400" :
                        status === 'ready' ? "border-l-green-400" :
                        "border-l-blue-400"
                      ),
                      (order.status === 'pending' || order.status === 'received') && !order.dealerId && "bg-red-50 border-red-200 animate-flash",
                      isInProgressTooLong(order) && "bg-red-50 border-red-200 animate-pulse border-l-red-600",
                      order.status === 'sent' && "opacity-80"
                    )}
                    style={{ 
                      borderLeftColor: order.dealerId ? (dealerColor || '#6366f1') : undefined,
                      backgroundColor: order.dealerId ? `${dealerColor || '#6366f1'}15` : undefined 
                    }}
                  >
                  <div className="cursor-pointer" onClick={() => setSelectedOrder(order)}>
                    <div className="flex justify-between items-start mb-2">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-slate-900 uppercase">
                        {order.displayId || `#${order.id.slice(-4).toUpperCase()}`}
                      </span>
                      {isInProgressTooLong(order) && (
                        <span className="text-[8px] font-black text-red-600 animate-pulse">⚠️ OVER 20 MINS IN PROG</span>
                      )}
                      <span className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">
                        {order.dealerCompanyName || 'Retail'}
                        {order.receivedBy && <span className="ml-1 text-blue-500"> • Rec: {order.receivedBy.split(' ')[0]}</span>}
                        {order.readyBy && <span className="ml-1 text-green-500"> • Rdy: {order.readyBy.split(' ')[0]}</span>}
                      </span>
                    </div>
                  </div>
                  <div className="text-sm font-black text-slate-800 mb-2">
                    {'weight' in order.details ? (
                      <div className="flex items-center flex-wrap gap-2">
                        <span>{order.details.weight}kg {order.details.flavor}</span>
                        {'quantity' in order.details && (
                          <span className="px-2 py-0.5 bg-blue-600 text-white rounded font-black text-[10px] shadow-sm">
                            QTY: {order.details.quantity || 1}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center flex-wrap gap-2">
                        <span>{('flavor' in order.details ? order.details.flavor : 'Custom Order')}</span>
                        {'quantity' in order.details && (
                          <span className="px-2 py-0.5 bg-blue-600 text-white rounded font-black text-[10px] shadow-sm">
                            QTY: {order.details.quantity || 1}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-[9px] font-black mb-3">
                    <Calendar className="w-3 h-3" />
                    <span className={cn(
                      "flex items-center gap-1",
                      (() => {
                        const delDate = new Date(order.deliveryDate);
                        const today = new Date();
                        today.setHours(0,0,0,0);
                        delDate.setHours(0,0,0,0);
                        const diff = (delDate.getTime() - today.getTime()) / (1000 * 3600 * 24);
                        
                        // Overdue check
                        const now = new Date();
                        const deliveryTime = order.deliveryTime || '23:59';
                        const [hours, mins] = deliveryTime.split(':').map(Number);
                        const fullDeliveryDate = new Date(order.deliveryDate);
                        fullDeliveryDate.setHours(hours, mins, 0, 0);
                        
                        if (now > fullDeliveryDate && order.status !== 'sent') return "text-red-600";
                        if (diff === 0) return "text-red-600";
                        if (diff === 1) return "text-amber-600";
                        return "text-slate-400";
                      })()
                    )}>
                      {order.deliveryDate ? format(new Date(order.deliveryDate), 'dd MMM') : '-'} | {order.deliveryTime || '-'}
                      <span className="ml-1 uppercase text-[11px]">
                        {(() => {
                          const delDate = new Date(order.deliveryDate);
                          const today = new Date();
                          today.setHours(0,0,0,0);
                          delDate.setHours(0,0,0,0);
                          const diff = (delDate.getTime() - today.getTime()) / (1000 * 3600 * 24);

                          const now = new Date();
                          const deliveryTime = order.deliveryTime || '23:59';
                          const [hours, mins] = deliveryTime.split(':').map(Number);
                          const fullDeliveryDate = new Date(order.deliveryDate);
                          fullDeliveryDate.setHours(hours, mins, 0, 0);

                          if (now > fullDeliveryDate && order.status !== 'sent') return "🔴 OVERDUE";
                          if (diff === 0) return "🔴 SAME DAY";
                          if (diff === 1) return "🟡 TOMORROW";
                          return "⚪ SCHEDULED";
                        })()}
                      </span>
                    </span>
                  </div>

                  {order.quoteTag && (
                    <div className={cn(
                      "mb-3 px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest w-fit border-2",
                      order.quoteTag === 'DESIGN QUOTE PENDING' ? "bg-amber-50 text-amber-600 border-amber-100/50 flex items-center gap-2" :
                      order.quoteTag === 'QUOTE SENT — AWAITING CONFIRM' ? "bg-blue-50 text-blue-600 border-blue-100 flex items-center gap-2" :
                      order.quoteTag === 'CONFIRMED' ? "bg-green-50 text-green-600 border-green-100 flex items-center gap-2" :
                      "bg-slate-50 text-slate-600 border-slate-100 flex items-center gap-2"
                    )}>
                      {order.quoteTag === 'DESIGN QUOTE PENDING' && <Zap className="w-3 h-3 text-amber-500 fill-amber-500" />}
                      {order.quoteTag}
                    </div>
                  )}

                  {order.type === 'custom_cake' && (
                    <div className="mb-3 space-y-2">
                       {!order.isQuoteLocked && (
                         <button 
                           onClick={() => navigate(`/admin/orders/${order.id}/design-quote`)}
                           className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-900 border border-slate-200 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-sm transition-all flex items-center justify-center gap-2"
                         >
                           <Palette className="w-3 h-3" />
                           {order.designQuote ? 'Modify Quote' : 'Add Design Quote'}
                         </button>
                       )}
                       {order.designQuote && (
                         <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100/50">
                            <div className="flex justify-between items-center text-[10px] font-black">
                               <span className="text-slate-400 text-[8px] uppercase">Quoted Total</span>
                               <span className="text-blue-600">₹{order.totalAmount.toLocaleString()}</span>
                            </div>
                         </div>
                       )}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {order.type === 'chocolate' && order.status === 'ready' && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); stopReady(); }}
                        className="px-4 py-2 bg-amber-50 text-amber-600 hover:bg-amber-600 hover:text-white rounded-xl border border-amber-100 transition-all text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-sm"
                        title="Silence Alert"
                      >
                        <BellOff size={14} />
                        Silence
                      </button>
                    )}
                    <div className="flex items-center gap-2 mt-auto">
                      <button 
                        onClick={(e) => { e.stopPropagation(); updateStatus(order.id, order.status); }}
                        disabled={order.status === 'sent'}
                        className={cn(
                          "flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all shadow-sm",
                          order.status === 'pending' ? "bg-red-50 text-red-600 border-red-100 hover:bg-red-600 hover:text-white" :
                          order.status === 'sent' ? "bg-slate-50 text-slate-400 border-slate-100 cursor-not-allowed" :
                          "bg-slate-50 text-slate-400 hover:bg-blue-600 hover:text-white border-slate-100"
                        )}
                      >
                        {order.status === 'pending' ? 'Start Production →' : 
                         order.status === 'in_progress' ? 'Mark Ready →' :
                         order.status === 'ready' ? 'Mark Sent →' : 'Sent →'}
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); generateOrderPDF(order, bakery); }}
                        className="p-2.5 bg-slate-50 text-slate-400 hover:text-indigo-600 rounded-xl border border-slate-100 transition-all shadow-sm flex items-center justify-center"
                        title="Download PDF"
                      >
                        <FileText size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    ))}
  </div>
</>
      ) : (
        <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden">
          <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Completed Deliveries</h3>
            <div className="flex bg-slate-200/50 p-1 rounded-xl">
              {(['all', 'dealers', 'custom'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setHistoryFilter(f)}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all",
                    historyFilter === f ? "bg-white text-slate-900 shadow-sm" : "text-slate-400 hover:text-slate-600"
                  )}
                >
                  {f === 'all' ? 'All' : f === 'dealers' ? 'Car Dealers' : 'Custom'}
                </button>
              ))}
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {orders
              .filter(o => o.status === 'sent' && !isRecentlySent(o))
              .filter(o => {
                if (historyFilter === 'all') return true;
                const isDealer = o.dealerId || o.type === 'dealer_cake';
                if (historyFilter === 'dealers') return isDealer;
                if (historyFilter === 'custom') return !isDealer;
                return true;
              })
              .map(order => (
              <div key={order.id} className="p-8 hover:bg-slate-50 transition-all flex items-center justify-between group">
                <div className="flex items-center gap-6">
                  <div className="w-12 h-12 bg-green-50 text-green-600 rounded-2xl flex items-center justify-center">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <h4 className="font-black text-slate-900">{order.displayId || `#${order.id.slice(-6).toUpperCase()}`}</h4>
                      <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded font-black uppercase tracking-tighter">
                        {order.dealerCompanyName || 'Retail'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-bold mt-1">
                      {'weight' in order.details ? `${order.details.weight}kg ${order.details.flavor}` : ('flavor' in order.details ? order.details.flavor : 'Custom')}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-black text-slate-900">{format(order.sentAt?.toDate() || new Date(), 'dd MMM, HH:mm')}</p>
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-tighter">Sent by {order.sentBy || 'Staff'}</p>
                </div>
              </div>
            ))}
            {orders
              .filter(o => o.status === 'sent' && !isRecentlySent(o))
              .filter(o => {
                if (historyFilter === 'all') return true;
                const isDealer = o.dealerId || o.type === 'dealer_cake';
                if (historyFilter === 'dealers') return isDealer;
                if (historyFilter === 'custom') return !isDealer;
                return true;
              }).length === 0 && (
              <div className="py-20 text-center text-slate-400 font-black uppercase tracking-widest text-xs">
                No orders found for the selected filter.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const CustomCakesGallery: React.FC<{ orders: Order[], onNew: () => void }> = ({ orders, onNew }) => {
  const customOrders = orders.filter(o => o.type === 'custom_cake' && !o.isDeleted && o.status !== 'sent');

  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'pending': return <span className="text-[10px] bg-red-100 text-red-700 px-2 py-1 rounded font-black uppercase tracking-widest">Pending Approval</span>;
      case 'in_progress': return <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-1 rounded font-black uppercase tracking-widest">Designing</span>;
      case 'ready': return <span className="text-[10px] bg-green-100 text-green-700 px-2 py-1 rounded font-black uppercase tracking-widest">Ready</span>;
      default: return <span className="text-[10px] bg-slate-100 text-slate-700 px-2 py-1 rounded font-black uppercase tracking-widest">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-6 rounded-3xl border border-slate-200">
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest text-slate-400">Design Portfolio</h2>
          <p className="text-xs font-bold text-slate-900">{customOrders.length} active custom bookings</p>
        </div>
        <button onClick={onNew} className="bg-purple-600 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest">+ New Custom Cake</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {customOrders.map(order => (
          <div key={order.id} className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-xl transition-all group">
            <div className="aspect-square bg-slate-100 relative">
              {('photoUrl' in order.details && order.details.photoUrl) ? (
                <img src={order.details.photoUrl} className="w-full h-full object-cover" alt="Cake Design" />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-300">
                  <ImageIcon className="w-12 h-12 mb-2" />
                  <span className="text-[10px] font-black uppercase tracking-widest">No Preview</span>
                </div>
              )}
              <div className="absolute top-4 right-4 bg-slate-900/80 backdrop-blur-md text-white text-[9px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest">
                {'weight' in order.details ? order.details.flavor : 'Custom'}
              </div>
            </div>
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                {getStatusBadge(order.status)}
                <div className="text-right">
                  <span className="text-xs font-black text-slate-900 block">₹{order.totalAmount.toLocaleString()}</span>
                  {order.advanceReceived > 0 && (
                    <span className="text-[9px] font-bold text-green-600">Advance: ₹{order.advanceReceived.toLocaleString()}</span>
                  )}
                </div>
              </div>
              <p className="text-sm font-bold text-slate-800 line-clamp-2">
                {'instruction' in order.details ? order.details.instruction : 'No instructions provided.'}
              </p>
            </div>
          </div>
        ))}
        {customOrders.length === 0 && <div className="col-span-full py-20 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">No active custom cake orders.</div>}
      </div>
    </div>
  );
};

const ChocolateProduction: React.FC<{ orders: Order[], onNew: () => void }> = ({ orders, onNew }) => {
  const chocolateOrders = orders.filter(o => o.type === 'chocolate' && !o.isDeleted && o.status !== 'sent');

  return (
    <div className="space-y-6">
      <div className="bg-slate-900 text-white p-8 rounded-3xl flex justify-between items-center">
        <div>
          <h2 className="text-xl font-black">Chocolate Batch Factory</h2>
          <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mt-1">Manage Dragees, Bites & Center-filled</p>
        </div>
        <button onClick={onNew} className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-3 rounded-2xl text-xs font-black uppercase tracking-widest transition-all">
          + Create New Batch
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {chocolateOrders.map(order => (
          <div key={order.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex gap-6">
            <div className="w-24 h-24 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-300">
              <Candy className="w-8 h-8" />
            </div>
            <div className="flex-1">
              <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-1 rounded font-black uppercase tracking-widest">
                  {'productType' in order.details ? order.details.productType : 'Chocolate'}
                </span>
                <span className="text-xs font-black text-slate-900">Qty: {'quantity' in order.details ? order.details.quantity : '0'}</span>
              </div>
              <h3 className="text-lg font-black text-slate-900 mb-1">{'flavor' in order.details ? order.details.flavor : 'Assorted'}</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">ORDER #{order.id.slice(-6).toUpperCase()}</p>
            </div>
          </div>
        ))}
        {chocolateOrders.length === 0 && <div className="col-span-full py-20 text-center text-slate-400 font-bold uppercase tracking-widest text-xs border border-dashed border-slate-200 rounded-3xl">No chocolate batches in production.</div>}
      </div>
    </div>
  );
};

const DealersManager: React.FC<{ dealers: Dealer[], orders: Order[], bakeryId: string }> = ({ dealers, orders, bakeryId }) => {
  const { user: authUser, isSuperAdmin } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [compName, setCompName] = useState(DEALER_COMPANIES[0]);
  const [orderPrefix, setOrderPrefix] = useState('');
  const [dealerSearch, setDealerSearch] = useState('');
  const [sName, setSName] = useState('');
  const [sEmail, setSEmail] = useState('');
  const [ph, setPh] = useState('');
  const [sPin, setSPin] = useState('1234');
  const [cakeDisc, setCakeDisc] = useState('0');
  const [prefFlavor, setPrefFlavor] = useState(CAKE_FLAVORS[0]);
  const [prefWeight, setPrefWeight] = useState('0.5');
  const [customPrice, setCustomPrice] = useState('500');
  const [expiryDate, setExpiryDate] = useState('');
  const [selectedColor, setSelectedColor] = useState(DEALER_COLORS[0].value);
  const [availableFlavors, setAvailableFlavors] = useState<string[]>([]);
  const [editingDealer, setEditingDealer] = useState<Dealer | null>(null);
  const [orderingDealer, setOrderingDealer] = useState<Dealer | null>(null);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Filter dealers based on search
  const filteredDealers = useMemo(() => {
    return dealers.filter(d => 
      d.companyName.toLowerCase().includes(dealerSearch.toLowerCase()) ||
      d.staffName.toLowerCase().includes(dealerSearch.toLowerCase()) ||
      d.phone.includes(dealerSearch) ||
      (d.email && d.email.toLowerCase().includes(dealerSearch.toLowerCase()))
    );
  }, [dealers, dealerSearch]);

  const companies = useMemo(() => {
    return Array.from(new Set(filteredDealers.map(d => d.companyName))).sort();
  }, [filteredDealers]);
  
  const topPartner = useMemo(() => {
    const allCompanies = Array.from(new Set(dealers.map(d => d.companyName)));
    if (allCompanies.length === 0) return 'None';
    const totals = allCompanies.map(c => {
      const cDealers = dealers.filter(d => d.companyName === c).map(d => d.id);
      const cOrders = orders.filter(o => o.dealerId && cDealers.includes(o.dealerId));
      return { name: c, total: cOrders.reduce((acc, o) => acc + (o.totalAmount || 0), 0) };
    });
    return totals.sort((a, b) => b.total - a.total)[0]?.name || 'None';
  }, [dealers, orders]);

  // Quick Order Local State
  const [oWeight, setOWeight] = useState(0.5);
  const [oFlavor, setOFlavor] = useState(CAKE_FLAVORS[0]);
  const [oQty, setOQty] = useState(1);
  const [oDate, setODate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [oTime, setOTime] = useState('18:00');
  const [oPhoto, setOPhoto] = useState(false);

  useEffect(() => {
    const fetchISD = async () => {
      try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        if (data.country_calling_code && !ph && !editingDealer) {
          setPh(data.country_calling_code);
        }
      } catch (err) {
        console.warn('Geolocation ISD fetch failed:', err);
      }
    };
    if (showForm && !ph && !editingDealer) fetchISD();
  }, [showForm, editingDealer]);

  useEffect(() => {
    if (!bakeryId) return;
    const q = query(
      collection(db, 'menu_items'),
      where('bakeryId', '==', bakeryId)
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
  }, [bakeryId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    if (!bakeryId) {
      alert('Error: Identity Verification Failed (Missing Bakery ID). Please reload the page.');
      setLoading(false);
      return;
    }
    const cleanPh = ph.trim().replace(/\s/g, '');
    const cleanPin = sPin.trim().substring(0, 4);
    const dealerId = editingDealer ? editingDealer.id : `dealer_${Math.random().toString(36).substring(2, 9)}`;
    console.log('Initiating dealer save for:', dealerId);
    
    try {
      if (editingDealer) {
        // Archive before update
        const oldDoc = await getDoc(doc(db, 'dealers', dealerId));
        if (oldDoc.exists()) await createArchive('dealers', dealerId, oldDoc.data(), 'update');

        // Update dealer record
        await updateDoc(doc(db, 'dealers', dealerId), {
          companyName: compName,
          orderPrefix: orderPrefix.toUpperCase(),
          staffName: sName,
          email: sEmail,
          phone: cleanPh,
          pin: cleanPin,
          customCakeDiscount: Number(cakeDisc),
          preferredFlavor: prefFlavor,
          preferredWeight: Number(prefWeight),
          customPricePerKg: Number(customPrice),
          priceListExpiryDate: expiryDate || null,
          color: selectedColor,
          updatedAt: serverTimestamp(),
        });
        // Use setDoc with merge: true to avoid "No document to update" if users doc is missing
        await setDoc(doc(db, 'users', dealerId), {
          uid: dealerId,
          phone: cleanPh,
          email: sEmail,
          displayName: `${compName} (${sName})`,
          role: 'dealer',
          bakeryId: bakeryId,
          dealerId: dealerId,
          pin: cleanPin
        }, { merge: true });
        
        await createLog('dealer', `Dealer updated: ${compName} - ${sName}`, auth.currentUser?.uid, auth.currentUser?.email, bakeryId);
        alert('Partner information updated.');
      } else {
        // Save new dealer record
        await setDoc(doc(db, 'dealers', dealerId), {
          id: dealerId,
          bakeryId,
          companyName: compName,
          orderPrefix: orderPrefix.toUpperCase(),
          lastOrderSequence: 0,
          staffName: sName,
          email: sEmail,
          phone: cleanPh,
          pin: cleanPin,
          customCakeDiscount: Number(cakeDisc),
          preferredFlavor: prefFlavor,
          preferredWeight: Number(prefWeight),
          customPricePerKg: Number(customPrice),
          priceListExpiryDate: expiryDate || null,
          color: selectedColor,
          createdAt: serverTimestamp(),
        });
        // Create user login record
        await setDoc(doc(db, 'users', dealerId), {
          uid: dealerId,
          phone: cleanPh,
          email: sEmail,
          displayName: `${compName} (${sName})`,
          role: 'dealer',
          bakeryId: bakeryId,
          dealerId: dealerId,
          pin: cleanPin
        });
        await createLog('dealer', `New dealer registered: ${compName} - ${sName}`, auth.currentUser?.uid, auth.currentUser?.email, bakeryId);
      }
      
      console.log('Dealer save successful, closing form');
      setShowForm(false);
      setEditingDealer(null);
      setCompName(DEALER_COMPANIES[0]);
      setOrderPrefix('');
      setSName('');
      setSEmail('');
      setPh('');
      setCakeDisc('0');
      setPrefFlavor(CAKE_FLAVORS[0]);
      setPrefWeight('0.5');
      setCustomPrice('500');
      setExpiryDate('');
      setSelectedColor(DEALER_COLORS[0].value);
    } catch (err) {
      console.error('Save failed:', err);
      handleFirestoreError(err, editingDealer ? OperationType.UPDATE : OperationType.WRITE, `dealers/users/${dealerId}`);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (dealer: Dealer) => {
    setEditingDealer(dealer);
    setCompName(dealer.companyName);
    setOrderPrefix(dealer.orderPrefix || '');
    setSName(dealer.staffName);
    setSEmail(dealer.email || '');
    setPh(dealer.phone);
    setSPin((dealer as any).pin || '1234');
    setCakeDisc(dealer.customCakeDiscount?.toString() || '0');
    setPrefFlavor(dealer.preferredFlavor || CAKE_FLAVORS[0]);
    setPrefWeight(dealer.preferredWeight?.toString() || '0.5');
    setCustomPrice(dealer.customPricePerKg?.toString() || '500');
    setExpiryDate(dealer.priceListExpiryDate || '');
    setSelectedColor(dealer.color || DEALER_COLORS[0].value);
    setShowForm(true);
  };

  const startOrder = (dealer: Dealer) => {
    setOrderingDealer(dealer);
    setOFlavor(dealer.preferredFlavor || CAKE_FLAVORS[0]);
    setOWeight(dealer.preferredWeight || 0.5);
    setOQty(1);
    setODate(format(new Date(), 'yyyy-MM-dd'));
    setShowOrderModal(true);
  };

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderingDealer || !bakeryId) return;
    setLoading(true);
    try {
      const discount = orderingDealer.customCakeDiscount || 0;
      const pricePerKg = orderingDealer.customPricePerKg || 500;
      const photoCharge = oPhoto ? (oWeight < 1 ? 150 : 300) : 0;
      const basePrice = (oWeight * pricePerKg) * oQty;
      const totalAmount = Math.max(0, (basePrice + (photoCharge * oQty)) - discount);

      const orderId = `ord_${Math.random().toString(36).substring(2, 9)}`;
      const orderRef = doc(db, 'orders', orderId);
      const dealerRef = doc(db, 'dealers', orderingDealer.id);

      await runTransaction(db, async (transaction) => {
        const dealerSnap = await transaction.get(dealerRef);
        let sequence = 1;
        let prefix = orderingDealer.orderPrefix || orderingDealer.companyName.slice(0, 2).toUpperCase();
        
        if (dealerSnap.exists()) {
          const dData = dealerSnap.data() as Dealer;
          sequence = (dData.lastOrderSequence || 0) + 1;
          prefix = dData.orderPrefix || dData.companyName.slice(0, 2).toUpperCase();
          transaction.update(dealerRef, { lastOrderSequence: sequence });
        }

        const displayId = `${prefix}${sequence.toString().padStart(3, '0')}`;

        const orderData = {
          bakeryId,
          dealerId: orderingDealer.id,
          displayId,
          dealerCompanyName: orderingDealer.companyName,
          type: 'dealer_cake',
          status: 'received', // Auto-received since staff is placing it
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          receivedAt: serverTimestamp(),
          receivedBy: auth.currentUser?.displayName || auth.currentUser?.email || 'Admin',
          deliveryDate: oDate,
          deliveryTime: oTime,
          details: {
            weight: oWeight,
            flavor: oFlavor,
            isPhotoCake: oPhoto,
            quantity: oQty,
          },
          totalAmount,
          discountApplied: discount,
          advanceReceived: 0,
        };

        transaction.set(orderRef, orderData);
      });

      await createLog('order', `Order placed for ${orderingDealer.companyName} (${orderingDealer.staffName})`, authUser?.uid, authUser?.email, bakeryId);
      setShowOrderModal(false);
      alert('Order placed successfully.');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'orders');
    } finally {
      setLoading(false);
    }
  };

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

  const removeDealer = (id: string, name: string) => {
    if (!id) {
      alert('Error: Missing Dealer ID');
      return;
    }

    confirmAction(
      'Revoke Access?',
      `Are you sure you want to suspend all access for "${name}"? They will no longer be able to log in or place orders.`,
      'Revoke Access',
      async () => {
        setLoading(true);
        try {
          const batch = writeBatch(db);
          const dDoc = await getDoc(doc(db, 'dealers', id));
          const uDoc = await getDoc(doc(db, 'users', id));

          if (dDoc.exists()) {
            batch.update(doc(db, 'dealers', id), { 
              isDeleted: true, 
              deletedAt: serverTimestamp(),
              active: false 
            });
          }

          if (uDoc.exists()) {
            batch.update(doc(db, 'users', id), { 
              isDeleted: true, 
              deletedAt: serverTimestamp(),
              role: 'disabled' 
            });
          }

          await batch.commit();
          await createLog('dealer', `Dealer access removed: ${name}`, authUser?.uid, authUser?.email, bakeryId);
          alert(`Access for "${name}" has been revoked.`);
        } catch (err: any) {
          console.error('DELETION ERROR:', err);
          handleFirestoreError(err, OperationType.DELETE, `dealers/${id}`);
        } finally {
          setLoading(false);
          setPendingAction(null);
        }
      }
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 px-2">
        <div className="flex-1">
          <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest">Dealer Network</h2>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-xs font-bold text-slate-900">{companies.length} Active Partners</p>
            <div className="w-1 h-1 rounded-full bg-slate-300" />
            <p className="text-[9px] font-black text-blue-500 uppercase tracking-widest">Unlimited Partner Slots Included</p>
          </div>
        </div>
        
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
          <div className="relative w-full sm:w-72">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search Dealer or Staff..." 
              value={dealerSearch}
              onChange={(e) => setDealerSearch(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-2xl pl-11 pr-4 py-3 text-xs font-bold focus:ring-4 focus:ring-blue-100 transition-all outline-none"
            />
          </div>
          <button 
            onClick={() => setShowForm(true)} 
            className="w-full sm:w-auto bg-slate-900 text-white px-6 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-2"
          >
            <UserPlus size={16} />
            Add New Partner
          </button>
        </div>
      </div>

      {/* Network Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-2">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col justify-center">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1 leading-none">Total Network</p>
          <div className="flex items-center gap-2">
            <p className="text-3xl font-black text-slate-900 tracking-tighter">{dealers.length}</p>
            <span className="text-[8px] font-black text-slate-400 uppercase">Partners</span>
          </div>
        </div>
        <div className="bg-white/60 backdrop-blur-sm p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col justify-center">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1 leading-none">Live Orders</p>
          <div className="flex items-center gap-2">
            <p className="text-3xl font-black text-indigo-600 tracking-tighter">
              {orders.filter(o => o.dealerId && o.status !== 'sent').length}
            </p>
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-ping" />
          </div>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm flex flex-col justify-center">
          <p className="text-[10px] font-black text-green-600 uppercase tracking-[0.2em] mb-1 leading-none">Total Volume</p>
          <p className="text-2xl font-black text-slate-900 tracking-tighter truncate">₹{orders.filter(o => o.dealerId).reduce((acc, o) => acc + (o.totalAmount || 0), 0).toLocaleString()}</p>
        </div>
        <div className="bg-slate-900 p-6 rounded-[2rem] text-white shadow-xl shadow-slate-200 flex flex-col justify-center overflow-hidden relative group">
          <div className="absolute top-0 right-0 w-20 h-20 bg-blue-500/20 rounded-full blur-2xl -mr-10 -mt-10 group-hover:bg-blue-400/30 transition-all"></div>
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-1 leading-none relative z-10">Top Partner</p>
          <p className="text-base font-black text-blue-400 tracking-tighter truncate relative z-10">{topPartner}</p>
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
        <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
              <Users size={20} />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Partner Directory</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">Managed Entities & Corporate Links</p>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50/50 border-b border-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
              <tr>
                <th className="px-8 py-4">Outlet / Staff</th>
                <th className="px-8 py-4">Contact Info</th>
                <th className="px-8 py-4">Activity</th>
                <th className="px-8 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {companies.map(company => {
                const companyDealers = filteredDealers.filter(d => d.companyName === company);
                if (companyDealers.length === 0) return null;
                
                const dealerIds = companyDealers.map(d => d.id);
                const companyOrders = orders.filter(o => o.dealerId && dealerIds.includes(o.dealerId));
                const totalVolume = companyOrders.reduce((acc, o) => acc + (o.totalAmount || 0), 0);

                return (
                  <React.Fragment key={company}>
                    <tr className="bg-slate-50/50 group border-t border-slate-100">
                      <td colSpan={3} className="px-8 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-2 h-6 bg-indigo-500 rounded-full" />
                          <span className="text-xs font-black text-slate-900 uppercase tracking-widest">{company}</span>
                          <span className="text-[9px] font-black bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded-full">{companyDealers.length} LOCATIONS</span>
                        </div>
                      </td>
                      <td className="px-8 py-4 text-right">
                        <span className="text-[10px] font-black text-slate-400">TOTAL VOLUME: <span className="text-blue-600 font-black">₹{totalVolume.toLocaleString()}</span></span>
                      </td>
                    </tr>
                    {companyDealers.map(dealer => (
                      <tr key={dealer.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-4">
                            <div 
                              className="w-10 h-10 rounded-2xl flex items-center justify-center text-white font-black text-xs shadow-lg shadow-current/20"
                              style={{ backgroundColor: dealer.color || '#6366f1' }}
                            >
                              {dealer.staffName.charAt(0)}
                            </div>
                            <div>
                              <p className="text-sm font-black text-slate-900">{dealer.displayName}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">Staff: {dealer.staffName}</p>
                                {dealer.priceListExpiryDate && differenceInDays(new Date(dealer.priceListExpiryDate), new Date()) < 7 && (
                                  <div className="flex items-center gap-1 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">
                                    <AlertCircle size={8} className="text-amber-600" />
                                    <span className="text-[7px] font-black text-amber-600 uppercase tracking-tighter">Expiry Soon</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="space-y-1">
                            <p className="text-xs font-bold text-slate-600">{dealer.phone}</p>
                            <p className="text-[9px] text-slate-400 font-black uppercase italic truncate max-w-[150px]">{dealer.location || 'Location Pending'}</p>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-2">
                             <div className="flex-1 h-1.5 bg-slate-100 rounded-full max-w-[80px] overflow-hidden">
                                <div className="h-full bg-blue-500" style={{ width: `${Math.min(100, (orders.filter(o => o.dealerId === dealer.id).length / 10) * 100)}%` }} />
                             </div>
                             <span className="text-[10px] font-black text-slate-900 whitespace-nowrap">{orders.filter(o => o.dealerId === dealer.id).length} Orders</span>
                          </div>
                        </td>
                        <td className="px-8 py-6 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button 
                              onClick={() => startOrder(dealer)}
                              className="p-2 text-indigo-600 hover:bg-indigo-600 hover:text-white rounded-xl transition-all shadow-sm border border-indigo-50"
                              title="Quick Order"
                            >
                              <ShoppingCart size={14} />
                            </button>
                            <button 
                              onClick={() => startEdit(dealer)}
                              className="p-2 text-slate-400 hover:text-slate-900 hover:bg-white rounded-xl transition-all border border-transparent hover:border-slate-200"
                              title="Edit"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button 
                              onClick={() => removeDealer(dealer.id, dealer.staffName)}
                              className="p-2 text-red-300 hover:bg-red-600 hover:text-white rounded-xl transition-all shadow-sm border border-red-50"
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                );
              })}
              {filteredDealers.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-20 text-center">
                    <Store className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No dealers matching your search.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {filteredDealers.length === 0 && (
        <div className="py-20 text-center border-2 border-dashed border-slate-100 rounded-[2rem]">
          <Store className="w-12 h-12 text-slate-200 mx-auto mb-4" />
          <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No dealers registered yet.</p>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-6 bg-slate-900 text-white flex justify-between items-center shrink-0">
              <h2 className="text-sm sm:text-xl font-bold uppercase tracking-widest leading-tight">
                {editingDealer ? 'Edit Partner Info' : 'New Dealer / Partner Access'}
              </h2>
              <button 
                onClick={() => { setShowForm(false); setEditingDealer(null); setSName(''); setSEmail(''); setPh(''); }} 
                className="text-slate-400 hover:text-white text-2xl px-2"
              >
                ×
              </button>
            </div>
            <form onSubmit={handleAdd} className="p-4 sm:p-8 space-y-4 sm:space-y-6 overflow-y-auto custom-scrollbar">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Brand Identifier Color</label>
                <div className="flex flex-wrap gap-2">
                  {DEALER_COLORS.map(c => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setSelectedColor(c.value)}
                      className={cn(
                        "w-7 h-7 sm:w-8 sm:h-8 rounded-full transition-all flex items-center justify-center",
                        selectedColor === c.value ? "ring-2 ring-slate-900 ring-offset-2 scale-110" : "hover:scale-105"
                      )}
                      style={{ backgroundColor: c.value }}
                      title={c.name}
                    >
                      {selectedColor === c.value && <Check className="w-4 h-4 text-white" />}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Dealership Partner</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="relative">
                    <select 
                      value={DEALER_COMPANIES.includes(compName) ? compName : 'Other'} 
                      onChange={e => {
                        if (e.target.value === 'Other') {
                          setCompName('');
                        } else {
                          setCompName(e.target.value);
                        }
                      }} 
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold appearance-none text-xs"
                    >
                      {DEALER_COMPANIES.map(c => <option key={c} value={c}>{c}</option>)}
                      <option value="Other">Custom Brand...</option>
                    </select>
                    {!DEALER_COMPANIES.includes(compName) && (
                      <input 
                        placeholder="Enter Brand Name" 
                        value={compName} 
                        onChange={e => setCompName(e.target.value)} 
                        className="mt-2 w-full bg-white border border-indigo-200 rounded-xl px-4 py-3 font-bold text-xs" 
                        required
                      />
                    )}
                  </div>
                  <div className="space-y-1">
                    <input 
                      placeholder="Order Prefix (e.g. TA)" 
                      value={orderPrefix} 
                      onChange={e => setOrderPrefix(e.target.value.toUpperCase())} 
                      className="w-full bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 font-black placeholder:font-bold text-xs" 
                    />
                    <p className="text-[8px] text-blue-400 font-bold ml-2 uppercase">Used for order numbering</p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Partner Contact Name</label>
                  <input required value={sName} onChange={e => setSName(e.target.value)} placeholder="Full Name" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Partner Mobile Login</label>
                  <input required value={ph} onChange={e => setPh(e.target.value)} placeholder="Login ID" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold" />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">Login PIN</label>
                  <input required maxLength={4} value={sPin} onChange={e => setSPin(e.target.value.replace(/\D/g, ''))} placeholder="4 Digit PIN" className="w-full bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 font-black text-indigo-700" />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Google Email (Recommended for Google Login)</label>
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 bg-slate-100 rounded flex items-center justify-center">
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/layout/google.svg" alt="" className="w-3 h-3" />
                  </div>
                  <input type="email" value={sEmail} onChange={e => setSEmail(e.target.value)} placeholder="Enter Gmail to enable Google Login" className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 font-bold" />
                </div>
                <p className="text-[9px] text-slate-400 font-bold mt-1.5 leading-relaxed">If email is provided, staff can login with Google for better security. Otherwise, they use Phone & PIN.</p>
              </div>
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest text-center">Dealer Preferences & Pricing</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Preferred Flavor</label>
                    <select 
                      value={prefFlavor}
                      onChange={e => setPrefFlavor(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs appearance-none"
                    >
                      {availableFlavors.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Preferred Weight (Kg)</label>
                    <select 
                      value={prefWeight}
                      onChange={e => setPrefWeight(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-xs appearance-none"
                    >
                      {[0.5, 1, 1.5, 2].map(w => <option key={w} value={w}>{w} Kg</option>)}
                    </select>
                  </div>
                  <div className="col-span-2 grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                       <label className="block text-[10px] font-black text-green-600 uppercase tracking-widest mb-1">Custom Price (Per Kg)</label>
                       <div className="relative">
                         <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                         <input 
                           type="number"
                           required
                           value={customPrice}
                           onChange={e => setCustomPrice(e.target.value)}
                           className="w-full bg-green-50/30 border border-green-100 rounded-xl pl-9 pr-4 py-3 font-bold text-xs"
                         />
                       </div>
                    </div>
                    <div className="space-y-2">
                       <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Price List Expiry</label>
                       <div className="relative">
                         <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                         <input 
                           type="date"
                           value={expiryDate}
                           onChange={e => setExpiryDate(e.target.value)}
                           className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-3 font-bold text-xs"
                         />
                       </div>
                    </div>
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-purple-600 uppercase tracking-widest mb-1">Flat Kickback/Disc</label>
                      <div className="relative">
                        <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <input 
                          type="number"
                          required
                          value={cakeDisc}
                          onChange={e => setCakeDisc(e.target.value)}
                          className="w-full bg-purple-50/30 border border-purple-100 rounded-xl pl-9 pr-4 py-3 font-bold text-xs"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <button disabled={loading} type="submit" className="w-full bg-blue-600 text-white py-4 rounded-xl font-black uppercase tracking-widest shadow-lg disabled:opacity-50">
                {loading ? 'Processing...' : (editingDealer ? 'Save Changes' : 'Enable Access')}
              </button>
            </form>
          </div>
        </div>
      )}

      {showOrderModal && orderingDealer && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[110] flex items-center justify-center p-4 text-center sm:text-left">
          <div className="bg-white max-w-sm w-full rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            <div className="p-8 bg-blue-600 text-white shrink-0">
              <h2 className="text-xl font-black">{orderingDealer.companyName}</h2>
              <p className="text-[10px] text-blue-100 font-bold uppercase tracking-widest mt-1">Ordering for: {orderingDealer.staffName}</p>
            </div>
            <form onSubmit={handlePlaceOrder} className="p-8 space-y-6 overflow-y-auto">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Flavor</p>
                  <select value={oFlavor} onChange={e => setOFlavor(e.target.value)} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-xs appearance-none">
                    {availableFlavors.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Weight</p>
                  <select value={oWeight} onChange={e => setOWeight(Number(e.target.value))} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 font-bold text-xs appearance-none">
                    {[0.5, 1, 1.5, 2, 3].map(w => <option key={w} value={w}>{w} KG</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-5 gap-3 items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <p className="col-span-2 text-[9px] font-black text-slate-400 uppercase">Quantity</p>
                <div className="col-span-3 flex items-center justify-between">
                  <button type="button" onClick={() => setOQty(Math.max(1, oQty - 1))} className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center font-black">-</button>
                  <span className="font-black text-slate-900">{oQty}</span>
                  <button type="button" onClick={() => setOQty(oQty + 1)} className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center font-black">+</button>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-2">
                     <Calendar className="w-4 h-4 text-blue-500" />
                     <p className="text-[9px] font-bold text-slate-400 uppercase">Delivery Date</p>
                   </div>
                   <input type="date" value={oDate} onChange={e => setODate(e.target.value)} className="bg-transparent font-black text-xs text-right outline-none" />
                </div>
                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-2">
                     <Clock className="w-4 h-4 text-blue-500" />
                     <p className="text-[9px] font-bold text-slate-400 uppercase">Delivery Time</p>
                   </div>
                   <input type="time" value={oTime} onChange={e => setOTime(e.target.value)} className="bg-transparent font-black text-xs text-right outline-none" />
                </div>
              </div>

              <div className="bg-slate-900 rounded-2xl p-4 flex justify-between items-center text-white">
                <div>
                  <p className="text-[8px] text-slate-400 font-bold uppercase">Estimated Total</p>
                  <p className="text-lg font-black text-blue-400">
                    {formatCurrency(Math.max(0, ((oWeight * (orderingDealer.customPricePerKg || 500) + (oPhoto ? (oWeight < 1 ? 150 : 300) : 0)) * oQty) - (orderingDealer.customCakeDiscount || 0)))}
                  </p>
                </div>
                <button type="submit" disabled={loading} className="bg-blue-600 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50">
                  {loading ? 'Ordering...' : 'Confirm'}
                </button>
              </div>
              <button 
                type="button" 
                onClick={() => setShowOrderModal(false)}
                className="w-full text-[9px] font-bold text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
              >
                Cancel Order
              </button>
            </form>
          </div>
        </div>
      )}

      {pendingAction && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[200] flex items-center justify-center p-4 text-center">
          <div className="bg-white max-w-sm w-full rounded-[2.5rem] shadow-2xl p-8 animate-in zoom-in-95 duration-200">
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
                className="flex-1 px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-100 transition-all"
              >
                {pendingAction.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const StaffManager: React.FC<{ staff: UserProfile[], bakeryId: string }> = ({ staff, bakeryId }) => {
  const { user: authUser, isSuperAdmin } = useAuth();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [ph, setPh] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<'production' | 'bakery_admin' | 'sales' | 'chocolate_production'>('production');
  const [lastAddedStaff, setLastAddedStaff] = useState<{ name: string, phone: string, pin: string } | null>(null);

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

  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchISD = async () => {
      try {
        const response = await fetch('https://ipapi.co/json/');
        const data = await response.json();
        if (data.country_calling_code && !ph && !editingStaffId) {
          setPh(data.country_calling_code);
        }
      } catch (err) {
        console.warn('Geolocation ISD fetch failed:', err);
      }
    };
    if (showForm && !ph && !editingStaffId) fetchISD();
  }, [showForm, editingStaffId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    if (!bakeryId) {
      alert('Error: Identity Verification Failed (Missing Bakery ID). Please reload the page.');
      setLoading(false);
      return;
    }
    const cleanPh = ph.trim().replace(/\s/g, '');
    const uid = editingStaffId || `staff_${Math.random().toString(36).substring(2, 9)}`;
    console.log('Initiating staff save for:', uid);
    
    try {
      const staffData: any = {
        displayName: name,
        email,
        phone: cleanPh,
        role,
        bakeryId
      };
      
      // Only include PIN if it's set (optional on edit)
      if (pin) staffData.pin = pin;
      
      if (editingStaffId) {
        // ... existing edit logic ...
        await setDoc(doc(db, 'users', uid), {
          uid,
          ...staffData
        }, { merge: true });
        await createLog('staff', `Staff updated: ${name} (${role})`, auth.currentUser?.uid, auth.currentUser?.email, bakeryId);
        alert('Staff information updated.');
        setShowForm(false);
      } else {
        const finalPin = pin || '1234';
        await setDoc(doc(db, 'users', uid), {
          uid,
          ...staffData,
          pin: finalPin
        });
        await createLog('staff', `New staff member added: ${name} (${role})`, auth.currentUser?.uid, auth.currentUser?.email, bakeryId);
        
        if (cleanPh) {
          setLastAddedStaff({ name, phone: cleanPh, pin: finalPin });
        } else {
          setShowForm(false);
        }
      }
      
      setEditingStaffId(null);
      resetForm();
    } catch (err) {
      console.error('Save failed:', err);
      handleFirestoreError(err, editingStaffId ? OperationType.UPDATE : OperationType.WRITE, `users/${uid}`);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName(''); setEmail(''); setPh(''); setPin('');
  };

  const startEdit = (member: UserProfile) => {
    setEditingStaffId(member.uid);
    setName(member.displayName);
    setEmail(member.email || '');
    setPh(member.phone || '');
    setPin(''); // Don't show pin for security
    setRole(member.role as any);
    setShowForm(true);
  };

  const removeStaff = (uid: string, name: string) => {
    if (!uid) {
      alert('Error: Missing identifier');
      return;
    }

    confirmAction(
      'Remove Staff Member?',
      `Are you sure you want to revoke system access for ${name}? This action will disable their login immediately.`,
      'Remove Access',
      async () => {
        setLoading(true);
        try {
          const batch = writeBatch(db);
          const oldDoc = await getDoc(doc(db, 'users', uid));
          
          if (oldDoc.exists()) {
            batch.update(doc(db, 'users', uid), { 
              isDeleted: true, 
              deletedAt: serverTimestamp(),
              role: 'disabled'
            });
            await batch.commit();
          }
          
          await createLog('staff', `Staff access revoked: ${name}`, authUser?.uid, authUser?.email, bakeryId);
          alert(`Staff member "${name}" has been removed.`);
        } catch (err: any) {
          console.error('STAFF DELETE ERROR:', err);
          handleFirestoreError(err, OperationType.DELETE, `users/${uid}`);
        } finally {
          setLoading(false);
          setPendingAction(null);
        }
      }
    );
  };

  return (
    <div className="space-y-6">
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

      <div className="flex justify-between items-center px-2">
        <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest">Internal Staff</h2>
        <button onClick={() => setShowForm(true)} className="bg-purple-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-purple-700 transition-all">+ Add Member</button>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest min-w-[200px]">Staff Name</th>
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest min-w-[150px]">Access Role</th>
                <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest min-w-[150px]">Mobile Login</th>
                <th className="px-8 py-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest min-w-[120px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {staff.filter(s => s.role !== 'dealer' && s.role !== 'super_admin').map(member => (
                <tr key={member.uid} className="hover:bg-slate-50 transition-colors">
                  <td className="px-8 py-4 font-bold text-slate-900">{member.displayName}</td>
                  <td className="px-8 py-4">
                    <span className="text-[9px] font-black px-2 py-1 bg-purple-50 text-purple-600 rounded uppercase tracking-widest">{member.role.replace('_', ' ')}</span>
                  </td>
                  <td className="px-8 py-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-bold text-slate-900">{member.phone}</span>
                      <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">PIN: {member.pin || '1234'}</span>
                    </div>
                  </td>
                  <td className="px-8 py-4 text-right">
                    <div className="flex justify-end gap-2 text-right">
                      <button onClick={() => startEdit(member)} className="text-slate-300 hover:text-blue-500 transition-colors p-2">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        disabled={loading}
                        onClick={() => removeStaff(member.uid, member.displayName)} 
                        className="text-slate-300 hover:text-red-500 transition-colors p-2 disabled:opacity-30"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-6 bg-purple-600 text-white flex justify-between items-center shrink-0">
              <h2 className="font-bold sm:text-lg">
                {lastAddedStaff ? 'Invite Staff Member' : (editingStaffId ? 'Edit Staff Member' : 'Add Staff Member')}
              </h2>
              <button 
                onClick={() => { setShowForm(false); setEditingStaffId(null); setLastAddedStaff(null); resetForm(); }} 
                className="text-white/60 hover:text-white text-2xl px-2"
              >
                ×
              </button>
            </div>
            
            {lastAddedStaff ? (
              <div className="p-8 space-y-6 text-center">
                <div className="w-20 h-20 bg-green-50 text-green-500 rounded-[2rem] flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-10 h-10" />
                </div>
                <div>
                  <h4 className="text-lg font-black text-slate-900">Staff Created!</h4>
                  <p className="text-xs text-slate-500 font-medium mt-2">
                    {lastAddedStaff.name} has been added. Send them their login details & portal link now.
                  </p>
                  <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-100 text-left">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Login Credentials</p>
                    <p className="text-[10px] font-bold text-slate-700">Phone: {lastAddedStaff.phone}</p>
                    <p className="text-[10px] font-bold text-slate-700">PIN: {lastAddedStaff.pin}</p>
                  </div>
                </div>
                
                <button 
                  onClick={() => {
                    const link = generateWhatsAppInviteLink(lastAddedStaff.phone, lastAddedStaff.name, window.location.origin);
                    window.open(link, '_blank');
                    setShowForm(false);
                    setLastAddedStaff(null);
                  }}
                  className="w-full bg-[#25D366] text-white py-4 rounded-xl font-black uppercase tracking-widest shadow-lg shadow-green-100 flex items-center justify-center gap-2"
                >
                  <MessageCircle size={18} />
                  Send WhatsApp Link
                </button>
                
                <button 
                  onClick={() => { setShowForm(false); setLastAddedStaff(null); }}
                  className="w-full py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleAdd} className="p-4 sm:p-6 space-y-4 overflow-y-auto custom-scrollbar">
              <input required placeholder="Full Name" value={name} onChange={e => setName(e.target.value)} className="w-full bg-slate-50 border p-3 rounded-xl font-bold" />
              <div className="grid grid-cols-2 gap-4">
                <input required placeholder="Mobile Login" value={ph} onChange={e => setPh(e.target.value)} className="w-full bg-slate-50 border p-3 rounded-xl font-bold" />
                <input required={!editingStaffId} placeholder={editingStaffId ? "PIN (Keep Same)" : "4-Digit PIN"} maxLength={4} value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ''))} className="w-full bg-slate-50 border p-3 rounded-xl font-bold text-center" />
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Google Email (Optional)</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 bg-slate-100 rounded flex items-center justify-center pointer-events-none">
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/layout/google.svg" alt="" className="w-3 h-3" />
                  </div>
                  <input type="email" placeholder="Gmail for Google Login" value={email} onChange={e => setEmail(e.target.value)} className="w-full bg-slate-50 border p-3 rounded-xl font-bold pl-9" />
                </div>
              </div>
              <select value={role} onChange={e => setRole(e.target.value as any)} className="w-full bg-slate-50 border p-3 rounded-xl font-bold">
                <option value="production">Bakery Section (Production)</option>
                <option value="chocolate_production">Chocolate Section</option>
                <option value="bakery_admin">Bakery Admin / Manager</option>
                <option value="sales">Sales / Front Desk</option>
              </select>
              <button disabled={loading} type="submit" className="w-full bg-purple-600 text-white py-3 rounded-xl font-black uppercase tracking-widest disabled:opacity-50">
                {loading ? 'Processing...' : (editingStaffId ? 'Update Access' : 'Create Access')}
              </button>
            </form>
          )}
          </div>
        </div>
      )}
    </div>
  );
};

const CustomerDatabase: React.FC<{ orders: Order[] }> = ({ orders }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const { bakery } = useAuth();

  useEffect(() => {
    if (!bakery?.id) return;
    const unsub = onSnapshot(query(collection(db, 'customers'), where('bakeryId', '==', bakery.id)), (snap) => {
      setCustomers(snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Customer))
        .filter(c => !c.isDeleted)
      );
    });
    return unsub;
  }, [bakery]);
  
  const repeatCustomers = customers.filter(c => c.totalOrders >= 2);
  
  return (
    <div className="space-y-6">
      <div className="bg-white p-8 rounded-3xl border border-slate-200">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest">CRM Management ({customers.length})</h2>
          <div className="flex gap-2">
            <span className="flex items-center gap-2 text-[10px] font-black text-pink-600 bg-pink-50 px-3 py-1 rounded-full"><Heart className="w-3 h-3" /> Today's Occasions</span>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {customers.map((c) => (
            <div key={c.id} className="p-6 border border-slate-100 rounded-2xl flex flex-col group hover:bg-slate-50 transition-all">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-slate-100 group-hover:bg-blue-500 group-hover:text-white transition-colors rounded-2xl flex items-center justify-center font-black text-slate-400">{c.name.charAt(0)}</div>
                  <div>
                    <h3 className="font-black text-slate-900">{c.name}</h3>
                    <p className="text-[10px] text-slate-400 font-bold tracking-widest">{c.phone}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black text-slate-900">{c.totalOrders} Orders</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-4 border-t border-slate-50">
                <div className="text-center">
                  <p className="text-[8px] font-black text-slate-400 uppercase">Birthday</p>
                  <p className="text-[10px] font-bold text-slate-700">{c.birthday ? format(new Date(c.birthday), 'dd MMM') : '-'}</p>
                </div>
                <div className="text-center">
                  <p className="text-[8px] font-black text-slate-400 uppercase">Anniv.</p>
                  <p className="text-[10px] font-bold text-slate-700">{c.anniversary ? format(new Date(c.anniversary), 'dd MMM') : '-'}</p>
                </div>
                <div className="text-center">
                  <p className="text-[8px] font-black text-slate-400 uppercase">Engage.</p>
                  <p className="text-[10px] font-bold text-slate-700">{c.engagementDate ? format(new Date(c.engagementDate), 'dd MMM') : '-'}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {repeatCustomers.length > 0 && (
          <div className="mt-8 bg-blue-50 rounded-[2.5rem] p-6 sm:p-10 border border-blue-100 relative overflow-hidden">
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-blue-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-blue-200">
                  <TrendingUp size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Revenue Growth Engine</h3>
                  <p className="text-[10px] text-blue-600 font-bold uppercase tracking-widest">LOYALTY RECOMMENDATIONS</p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {repeatCustomers.slice(0, 4).map(c => (
                  <div key={c.id} className="bg-white p-5 rounded-3xl shadow-sm border border-blue-50 flex flex-col justify-between group hover:scale-[1.02] transition-all">
                    <div>
                      <div className="flex justify-between items-start mb-2">
                         <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-[8px] font-black uppercase">Top 1% Client</span>
                         <span className="text-[10px] font-black text-slate-900">{c.totalOrders}x</span>
                      </div>
                      <h4 className="font-black text-slate-900">{c.name}</h4>
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">Last Order: {c.lastOrderAt ? format(c.lastOrderAt.toDate(), 'dd MMM') : 'Long ago'}</p>
                    </div>
                    <button 
                      onClick={() => {
                        const msg = `Hi ${c.name}, it's been a while since your last treat from ${bakery?.name || 'Bakesync'}! We have some new special items you might like. Want to check them out?`;
                        window.open(`https://wa.me/91${c.phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
                      }}
                      className="mt-4 w-full bg-blue-600 text-white py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                    >
                      <MessageCircle size={14} />
                      Re-Engage
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-blue-200/20 rounded-full blur-[100px]" />
          </div>
        )}

        {customers.length === 0 && (
          <div className="py-20 text-center border-2 border-dashed border-slate-100 rounded-3xl">
            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No customer data yet. Start taking orders to build your CRM.</p>
          </div>
        )}
      </div>
    </div>
  );
};

const AnalyticsReports: React.FC<{ orders: Order[], dealers: Dealer[] }> = ({ orders, dealers }) => {
  const staffStats = orders.filter(o => o.readyBy).reduce((acc: any, o) => {
    const name = o.readyBy!.split('@')[0].split(' ')[0];
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {});

  const sortedStaff = Object.entries(staffStats).sort((a: any, b: any) => b[1] - a[1]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Revenue" value={formatCurrency(orders.reduce((a, b) => a + (b.status === 'cancelled' ? 0 : (b.totalAmount || 0)), 0))} icon={TrendingUp} color="blue" />
        <StatCard label="Total Orders" value={orders.filter(o => o.status !== 'cancelled').length} icon={ShoppingBag} color="purple" />
        <StatCard label="Avg Order Value" value={formatCurrency(orders.length ? orders.reduce((a, b) => a + (b.status === 'cancelled' ? 0 : (b.totalAmount || 0)), 0) / orders.filter(o => o.status !== 'cancelled').length : 0)} icon={PieChart} color="amber" />
        <StatCard label="Dealer Share" value={`${Math.round((orders.filter(o => o.dealerId).length / (orders.length || 1)) * 100)}%`} icon={Store} color="green" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200">
           <div className="flex justify-between items-center mb-6">
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Operational Efficiency</h3>
              <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full uppercase tracking-widest">Staff Performance</span>
           </div>
           <div className="space-y-4">
              {sortedStaff.length === 0 ? (
                <div className="p-12 text-center text-slate-300 font-bold uppercase tracking-widest text-[10px]">No production data yet.</div>
              ) : (
                sortedStaff.map(([name, count]: any) => (
                  <div key={name} className="flex items-center gap-4">
                    <div className="w-20 text-[10px] font-black text-slate-500 uppercase truncate">{name}</div>
                    <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                       <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${(count / (sortedStaff[0][1] as number)) * 100}%` }}
                        className="h-full bg-indigo-600" 
                       />
                    </div>
                    <div className="w-12 text-right text-xs font-black text-slate-900">{count}</div>
                  </div>
                ))
              )}
           </div>
           <div className="mt-8 pt-6 border-t border-slate-100 grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 rounded-2xl">
                 <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Cancellations</p>
                 <p className="text-lg font-black text-slate-900">{orders.filter(o => o.status === 'cancelled').length}</p>
                 <p className="text-[9px] text-red-500 font-bold uppercase mt-1 leading-none">Loss Impact: {formatCurrency(orders.filter(o => o.status === 'cancelled').reduce((acc, o) => acc + (o.totalAmount || 0), 0))}</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-2xl">
                 <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Confirmation Rate</p>
                 <p className="text-lg font-black text-slate-900">
                    {Math.round((orders.filter(o => o.confirmationReminderSentAt).length / (orders.filter(o => o.status === 'pending').length || 1)) * 100)}%
                 </p>
                 <p className="text-[9px] text-blue-500 font-bold uppercase mt-1 leading-none">Reminder Pipeline Active</p>
              </div>
           </div>
        </div>

        <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] relative overflow-hidden">
           <h3 className="text-sm font-black text-blue-400 uppercase tracking-widest mb-6 relative z-10">AI Business Audit</h3>
           <p className="text-xs text-white/70 leading-relaxed mb-6 relative z-10 font-bold italic">
            "Your production throughput is stable, but dealer-initiated custom cakes have a 12% higher cancellation rate than direct orders. Consider enforcing a 25% non-refundable advance forMG/Tata partners to protect margins."
           </p>
           <div className="grid grid-cols-1 gap-3 relative z-10">
              <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                 <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-2">Primary Risk</p>
                 <p className="text-xs font-bold">Unconfirmed pending orders (5+) exceeding 48 hours.</p>
              </div>
              <div className="p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20">
                 <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-2">Opportunity</p>
                 <p className="text-xs font-bold">Resort repeat customers from March with new Dragee catalog.</p>
              </div>
           </div>
           <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-600 rounded-full blur-[100px] opacity-20 -mr-20 -mt-20"></div>
        </div>
      </div>

      <div className="bg-white p-8 rounded-3xl border border-slate-200">
        <div className="flex justify-between items-center mb-8">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Performance Insights</h2>
          <div className="flex gap-2">
            <button className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest"><Printer className="w-4 h-4" /> Export Report</button>
          </div>
        </div>
        <div className="h-64 flex items-end gap-1">
          {[20, 45, 30, 60, 80, 50, 40, 90, 70, 85, 60, 45].map((v, i) => (
            <div key={i} className="flex-1 bg-slate-100 hover:bg-purple-500 transition-all rounded-t-lg relative group" style={{ height: `${v}%` }}>
               <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">Month {i+1}</div>
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-4 text-[10px] text-slate-400 font-black uppercase tracking-widest">
          <span>January</span>
          <span>December</span>
        </div>
      </div>
    </div>
  );
};

const BillingPayments: React.FC<{ orders: Order[], dealers: Dealer[] }> = ({ orders, dealers }) => {
  const { bakery } = useAuth();
  // Group dealerships by company name and sort alphabetically
  const dealerships = Array.from(new Set(dealers.map(d => d.companyName))).sort();
  
  const [submitting, setSubmitting] = useState(false);

  const upgradePlan = async (plan: 'monthly' | 'yearly') => {
    if (!bakery) return;
    setSubmitting(true);
    try {
      const endsAt = new Date();
      if (plan === 'monthly') endsAt.setMonth(endsAt.getMonth() + 1);
      else endsAt.setFullYear(endsAt.getFullYear() + 1);

      await updateDoc(doc(db, 'bakeries', bakery.id), {
        subscriptionStatus: 'active',
        plan,
        subscriptionEndsAt: endsAt,
        updatedAt: serverTimestamp()
      });
      alert(`Success! You have been moved to the ${plan} plan.`);
    } catch (err) {
      console.error(err);
      alert('Subscription upgrade failed. Please contact support.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Platform Subscription Card */}
      <div className="bg-slate-900 rounded-[2.5rem] p-8 sm:p-10 text-white relative overflow-hidden shadow-2xl">
        <div className="relative z-10">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
            <div>
              <div className="flex items-center gap-2 text-blue-400 font-black uppercase tracking-[0.2em] text-[10px] mb-3">
                <Zap className="w-4 h-4 fill-current" />
                BakeSync Platform Subscription
              </div>
              <h2 className="text-3xl font-black tracking-tight">Manage Your Workspace</h2>
            </div>
            <div className="bg-white/10 backdrop-blur-md px-6 py-3 rounded-2xl border border-white/10">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Current Status</p>
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  bakery?.subscriptionStatus === 'active' ? "bg-green-500" : "bg-amber-500"
                )}></div>
                <p className="text-lg font-black uppercase">{bakery?.subscriptionStatus?.replace('_', ' ')}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Plan Display */}
            <div className="lg:col-span-2 bg-white/5 rounded-3xl p-8 border border-white/10">
              <div className="flex flex-col sm:flex-row justify-between gap-8">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Plan Details</p>
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-sm font-bold text-slate-300">Active Plan</h3>
                      <p className="text-xl font-black">{bakery?.plan === 'yearly' ? 'PRO ANNUAL' : bakery?.plan === 'monthly' ? 'PRO MONTHLY' : 'FREE TRIAL'}</p>
                    </div>
                    {bakery?.subscriptionEndsAt && (
                      <div>
                        <h3 className="text-sm font-bold text-slate-300">Renewal Date</h3>
                        <p className="text-xl font-black">{format(bakery.subscriptionEndsAt.toDate(), 'dd MMMM, yyyy')}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col justify-end">
                  <div className="bg-blue-600 px-6 py-4 rounded-2xl">
                    <p className="text-[10px] font-black text-blue-200 uppercase tracking-widest mb-1">Estimated Cost</p>
                    <p className="text-2xl font-black">
                      {bakery?.plan === 'yearly' ? '₹8,388' : bakery?.plan === 'monthly' ? '₹999' : 'FREE'}
                      <span className="text-xs font-bold text-blue-200 ml-1">/{bakery?.plan === 'yearly' ? 'yr' : 'mo'}</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Upgrade Options */}
            <div className="space-y-4">
              <button 
                onClick={() => upgradePlan('monthly')}
                disabled={submitting || bakery?.plan === 'monthly'}
                className="w-full bg-white text-slate-900 p-6 rounded-3xl font-black text-left group hover:bg-blue-500 hover:text-white transition-all disabled:opacity-50"
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] uppercase tracking-widest">Monthly Plan</span>
                  <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </div>
                <p className="text-xl">₹999 <span className="text-xs font-bold opacity-60">/ month</span></p>
              </button>

              <button 
                onClick={() => upgradePlan('yearly')}
                disabled={submitting || bakery?.plan === 'yearly'}
                className="w-full bg-blue-600 text-white p-6 rounded-3xl font-black text-left group hover:bg-blue-500 transition-all border border-white/10 disabled:opacity-50"
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[10px] uppercase tracking-widest text-blue-200">Yearly Plan (Best Value)</span>
                  <div className="bg-white/20 px-2 py-0.5 rounded text-[8px]">SAVE 30%</div>
                </div>
                <p className="text-xl">₹699 <span className="text-xs font-bold opacity-60">/ month</span></p>
                <p className="text-[9px] font-bold text-blue-200 mt-1 uppercase tracking-widest">₹8,388 Billed Annually • Unlimited Staff & Dealers Included</p>
              </button>
            </div>
          </div>
        </div>
        
        {/* Background Accents */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500 rounded-full blur-[120px] opacity-20 -mr-48 -mt-48"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500 rounded-full blur-[100px] opacity-10 -ml-32 -mb-32"></div>
      </div>

      <div className="bg-white p-8 rounded-3xl border border-slate-200">
        <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">Partner Billing Summaries</h2>
        <div className="space-y-4">
          {dealerships.map(company => {
            const companyDealers = dealers.filter(d => d.companyName === company);
            const dealerIds = companyDealers.map(d => d.id);
            const companyOrders = orders.filter(o => o.dealerId && dealerIds.includes(o.dealerId));
            const total = companyOrders.reduce((a, b) => a + (b.totalAmount || 0), 0);
            
            // Calculate last 30 days sent orders
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            const recentSentOrders = companyOrders.filter(o => 
              o.status === 'sent' && 
              o.sentAt && 
              o.sentAt.toDate() >= thirtyDaysAgo
            );

            return (
              <div key={company} className="p-6 border border-slate-100 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-4 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600"><Store className="w-6 h-6" /></div>
                  <div>
                    <h3 className="font-black text-slate-900">{company}</h3>
                    <div className="flex items-center gap-3 mt-1">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                        {companyDealers.length} Employees
                      </p>
                      <span className="w-1 h-1 bg-slate-200 rounded-full"></span>
                      <div className="flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-green-500" />
                        <span className="text-[10px] text-green-600 font-black uppercase tracking-widest">
                          {recentSentOrders.length} Sent (Last 30 Days)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="text-right flex items-center gap-8">
                  <div>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Total Outstanding (All Time)</p>
                    <p className="text-xl font-black text-slate-900">{formatCurrency(total)}</p>
                  </div>
                  <button className="bg-slate-900 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest">Generate Bill</button>
                </div>
              </div>
            );
          })}
          {dealerships.length === 0 && (
            <div className="py-10 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">No dealerships registered.</div>
          )}
        </div>
      </div>
    </div>
  );
};

const BakerySettings: React.FC<{ bakery: Bakery | null }> = ({ bakery }) => {
  const [updating, setUpdating] = useState(false);
  const [notifPermission, setNotifPermission] = useState<string>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  const requestNotificationPermission = async () => {
    if (!('Notification' in window)) {
      alert("This browser does not support desktop notifications");
      return;
    }

    const permission = await Notification.requestPermission();
    setNotifPermission(permission);
    
    if (permission === 'granted') {
      new Notification("Kreative Chocolates", {
        body: "Success! You will now receive alerts for new orders.",
        icon: "https://cdn-icons-png.flaticon.com/512/3135/3135715.png"
      });
    }
  };

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
  const [notifs, setNotifs] = useState({
    newOrderSound: bakery?.notificationSettings?.newOrderSound || SOUND_PATHS.PENDING,
    readySound: bakery?.notificationSettings?.readySound || SOUND_PATHS.READY,
    sentSound: bakery?.notificationSettings?.sentSound || SOUND_PATHS.SENT
  });

  // Sync state if bakery settings load later
  useEffect(() => {
    if (bakery?.notificationSettings) {
      setNotifs({
        newOrderSound: bakery.notificationSettings.newOrderSound || SOUND_PATHS.PENDING,
        readySound: bakery.notificationSettings.readySound || SOUND_PATHS.READY,
        sentSound: bakery.notificationSettings.sentSound || SOUND_PATHS.SENT
      });
    }
  }, [bakery?.notificationSettings]);

  const updateSettings = async () => {
    if (!bakery?.id) return;
    setUpdating(true);
    try {
      await updateDoc(doc(db, 'bakeries', bakery.id), {
        notificationSettings: notifs
      });
      alert('Settings Saved');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `bakeries/${bakery.id}`);
    } finally {
      setUpdating(false);
    }
  };

  const soundOptions = [
    { name: 'Standard Alert', url: 'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3' },
    { name: 'Success Chime', url: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3' },
    { name: 'Ding Dong (Classic)', url: 'https://assets.mixkit.co/active_storage/sfx/585/585-preview.mp3' },
    { name: 'Doorbell (Double)', url: 'https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3' },
    { name: 'Technical', url: 'https://assets.mixkit.co/active_storage/sfx/1484/1484-preview.mp3' }
  ];

  const handleExportAll = async () => {
    if (!bakery?.id) return;
    setUpdating(true);
    try {
      const q = query(collection(db, 'orders'), where('bakeryId', '==', bakery.id));
      const snapshot = await getDocs(q);
      const orders = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Order));
      exportOrdersToExcel(orders, bakery.name);
      await createLog('system', `Order History Exported: ${snapshot.size} records`, auth.currentUser?.uid, auth.currentUser?.email, bakery.id);
    } catch (err: any) {
      console.error('EXPORT FAILED:', err);
      alert(`Export failed: ${err.message}`);
    } finally {
      setUpdating(false);
    }
  };

  const clearDemoOrders = async () => {
    if (!bakery?.id) return;
    
    confirmAction(
      'WIPE DATA: IRREVERSIBLE ACTION',
      "This will PERMANENTLY DELETE ALL ORDERS for this bakery. This is intended strictly for clearing test data before launch. Are you ABSOLUTELY sure?",
      'YES, WIPE ALL DATA',
      async () => {
        setUpdating(true);
        try {
          const q = query(collection(db, 'orders'), where('bakeryId', '==', bakery.id));
          const snapshot = await getDocs(q);
          
          if (snapshot.empty) {
            alert("System Check: No orders found to clear.");
            return;
          }

          const docs = snapshot.docs;
          const chunks = [];
          for (let i = 0; i < docs.length; i += 500) {
            chunks.push(docs.slice(i, i + 500));
          }

          for (const chunk of chunks) {
            const batch = writeBatch(db);
            chunk.forEach(d => batch.delete(d.ref));
            await batch.commit();
          }

          await createLog('system', `Bulk Data Maintenance: ${snapshot.size} orders permanently cleared`, auth.currentUser?.uid, auth.currentUser?.email, bakery.id);
          alert(`Success: ${snapshot.size} demo orders have been removed.`);
        } catch (err: any) {
          handleFirestoreError(err, OperationType.DELETE, `orders(bulk)/${bakery.id}`);
        } finally {
          setUpdating(false);
          setPendingAction(null);
        }
      }
    );
  };

  return (
    <div className="max-w-4xl space-y-6">
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

      <div className="bg-white p-8 rounded-3xl border border-slate-200">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <Settings className="w-6 h-6 text-slate-400" /> General Configuration
          </h2>
          <button 
            onClick={updateSettings} 
            disabled={updating}
            className="bg-slate-900 text-white px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
          >
            {updating ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Bakery Name</label>
              <input readOnly value={bakery?.name || ''} className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl font-bold text-slate-500 cursor-not-allowed" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Contact Number</label>
              <input readOnly value={bakery?.phone || ''} className="w-full bg-slate-50 border border-slate-100 p-4 rounded-2xl font-bold text-slate-500 cursor-not-allowed" />
            </div>
          </div>
          <div className="space-y-6">
            <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 mb-6">
              <h3 className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-2">Account Tier</h3>
              <div className="flex items-center gap-3">
                <span className={cn(
                  "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter border",
                  bakery?.subscriptionStatus === 'free_partner' ? "bg-purple-100 text-purple-700 border-purple-200" :
                  bakery?.subscriptionStatus === 'active' ? "bg-green-100 text-green-700 border-green-200" :
                  "bg-amber-100 text-amber-700 border-amber-200"
                )}>
                  {bakery?.subscriptionStatus?.replace('_', ' ') || 'TRIAL'}
                </span>
                {bakery?.subscriptionStatus === 'free_partner' && (
                  <p className="text-[9px] text-purple-600 font-bold italic">Official Partner Account - Lifetime Free Access</p>
                )}
              </div>
            </div>

            <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100">
              <h3 className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-6">Production Sounds</h3>
              <div className="space-y-4">
                {([
                  { key: 'newOrderSound', label: 'New Order' },
                  { key: 'readySound', label: 'Order Ready' },
                  { key: 'sentSound', label: 'Dispatched' }
                ] as const).map((s) => (
                  <div key={s.key}>
                    <label className="block text-[8px] font-black text-slate-400 uppercase mb-2">{s.label}</label>
                    <div className="flex gap-2">
                      <select 
                        value={notifs[s.key]} 
                        onChange={e => setNotifs({ ...notifs, [s.key]: e.target.value })}
                        className="flex-1 bg-white border border-blue-100 rounded-lg p-2 text-xs font-bold"
                      >
                        {soundOptions.map(opt => <option key={opt.url} value={opt.url}>{opt.name}</option>)}
                      </select>
                      <button 
                        onClick={() => {
                          if (notifs[s.key]) {
                            const a = new Audio(notifs[s.key]);
                            a.play().catch(e => console.warn('Preview blocked:', e));
                          }
                        }} 
                        className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        disabled={!notifs[s.key]}
                      >
                        <Volume2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-slate-900 text-white p-6 rounded-2xl">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Service Status</h3>
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> <span className="text-sm font-black">ACTIVE & SYNCED</span></div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white p-8 rounded-3xl border border-slate-200">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
            <Zap size={24} />
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900">Push Notifications & PWA</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Enable alerts for background activity</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="max-w-md">
              <h4 className="text-sm font-black text-slate-900 mb-1">Browser Alerts</h4>
              <p className="text-[10px] font-medium text-slate-500 leading-relaxed">
                Enable these to receive real-time popups even if the tab is in the background. 
                <span className="block mt-2 font-bold text-indigo-600 italic">Current Status: {notifPermission.toUpperCase()}</span>
              </p>
            </div>
            
            {notifPermission !== 'granted' ? (
              <button 
                onClick={requestNotificationPermission}
                className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
              >
                Allow Notifications
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-emerald-50 text-emerald-600 px-6 py-3 rounded-2xl border border-emerald-100 font-black text-[10px] uppercase tracking-widest">
                <CheckCircle2 size={16} />
                Enabled
              </div>
            )}
          </div>

          <div className="bg-blue-50/50 p-6 rounded-3xl border border-blue-100/50 flex items-start gap-4">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-blue-600 shadow-sm shrink-0">
              <ExternalLink size={20} />
            </div>
            <div>
              <h4 className="text-xs font-black text-blue-900 uppercase tracking-widest mb-1">Mobile Background Tip</h4>
              <p className="text-[10px] font-medium text-blue-700 leading-relaxed">
                For the best experience on mobile, tap the <span className="font-bold underline">"Add to Home Screen"</span> or <span className="font-bold underline">"Install App"</span> option in your browser menu. This allows the system to prioritize background processes and notification delivery.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-red-50 p-8 rounded-3xl border border-red-100 mt-10">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-red-100 flex items-center justify-center text-red-600 shrink-0">
            <ShieldAlert size={24} />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-black text-red-900 flex items-center gap-2">
              Maintenance & Data Management
            </h2>
            <p className="text-sm font-bold text-red-700/70 mt-1 mb-6">
              Critical system actions. Use these features to prepare your environment for production.
            </p>
            
            <div className="bg-white/50 border border-red-200 rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Step 1: Backup Order History</h3>
                  <p className="text-[11px] font-bold text-slate-500 mt-1">Download your current orders to Excel/CSV for your records.</p>
                </div>
                <button 
                  onClick={handleExportAll}
                  disabled={updating}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-blue-200 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
                >
                  <FileText size={14} />
                  Export to Excel
                </button>
              </div>

              <div className="h-px bg-red-100" />

              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-red-900 uppercase tracking-tight">Step 2: Clear Demo Orders</h3>
                  <p className="text-[11px] font-bold text-red-600/70 mt-1">Permanently remove all order history for this bakery after backup.</p>
                </div>
                <button 
                  onClick={clearDemoOrders}
                  disabled={updating}
                  className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-red-200 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
                >
                  <Database size={14} />
                  Wipe Order History
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 pt-8 border-t border-slate-100 flex flex-col items-center">
        <p className="text-[10px] font-black text-slate-300 uppercase tracking-[0.2em]">Bakesync Business Suite</p>
        <p className="text-[10px] font-bold text-slate-400 mt-1">App Version: 1.4.4</p>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ 
  label: string, 
  value: string | number, 
  icon: any, 
  color: 'blue' | 'red' | 'amber' | 'green' | 'purple',
  onClick?: () => void 
}> = ({ label, value, icon: Icon, color, onClick }) => {
  const colors = {
    blue: 'bg-blue-50 text-blue-600 border-blue-100',
    red: 'bg-red-50 text-red-600 border-red-100',
    amber: 'bg-amber-50 text-amber-600 border-amber-100',
    green: 'bg-green-50 text-green-600 border-green-100',
    purple: 'bg-purple-50 text-purple-600 border-purple-100',
  };

  return (
    <div 
      onClick={onClick}
      className={cn(
        "p-5 rounded-[2rem] border shadow-sm transition-all hover:scale-[1.02] flex flex-col justify-between min-h-[140px]", 
        colors[color],
        onClick && "cursor-pointer active:scale-95"
      )}
    >
      <div className="w-10 h-10 rounded-2xl bg-white/50 flex items-center justify-center mb-4">
        <Icon className="w-5 h-5 opacity-80" />
      </div>
      <div>
        <div className="text-[9px] font-black uppercase tracking-[0.1em] mb-1 opacity-60">{label}</div>
        <div className="text-2xl font-black">{value}</div>
      </div>
    </div>
  );
};

export const BakeryAdminDashboard: React.FC<{ view?: string }> = ({ view = 'dashboard' }) => {
  const { bakery, isSuperAdmin } = useAuth();
  const [dealers, setDealers] = useState<Dealer[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [staff, setStaff] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showOrderModal, setShowOrderModal] = useState(false);
  const [orderType, setOrderType] = useState<'dealer_cake' | 'custom_cake' | 'chocolate' | undefined>();
  const { playPending, stopPending, playReady, playSent } = useSound();
  const [isSilenced, setIsSilenced] = useState(false);
  const prevCount = useRef(0);
  const prevStatuses = useRef<Record<string, OrderStatus>>({});

  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => setLoading(false), 5000);
    return () => clearTimeout(timer);
  }, [loading]);

  useEffect(() => {
    if (!bakery?.id) return;
    
    setLoading(true);
    const dUnsub = onSnapshot(query(collection(db, 'dealers'), where('bakeryId', '==', bakery.id)), (snap) => {
      const dealersData = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as Dealer))
        .filter(d => !d.isDeleted)
        .sort((a, b) => a.companyName.localeCompare(b.companyName));
      setDealers(dealersData);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'dealers');
    });

    const mUnsub = onSnapshot(query(collection(db, 'menu_items'), where('bakeryId', '==', bakery.id)), (snap) => {
      setItems(snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as MenuItem))
        .filter(i => !i.isDeleted)
      );
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'menu_items');
    });

    const oUnsub = onSnapshot(query(collection(db, 'orders'), where('bakeryId', '==', bakery.id)), (snap) => {
      const newOrders = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
      
      // Play sound if new orders are received
      const currentAlerts = newOrders.filter(o => o.status === 'pending').length;
      if (currentAlerts > prevCount.current) {
        setIsSilenced(false); // Reset silence when new ones arrive
        playPending();
      } else if (currentAlerts === 0) {
        stopPending();
      }
      prevCount.current = currentAlerts;

      // Transition sounds for Admin (Ready/Sent = single play)
      newOrders.forEach(order => {
        const prev = prevStatuses.current[order.id];
        if (prev && prev !== order.status) {
          if (order.status === 'ready') playReady(); // plays once by default
          if (order.status === 'sent') playSent();
        }
        prevStatuses.current[order.id] = order.status;
      });

      const sortedOrders = newOrders.sort((a, b) => {
        const nameA = a.dealerCompanyName || 'Retail';
        const nameB = b.dealerCompanyName || 'Retail';
        return nameA.localeCompare(nameB);
      });

      setOrders(sortedOrders);
      setLoading(false);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'orders');
    });

    const sUnsub = onSnapshot(query(collection(db, 'users'), where('bakeryId', '==', bakery.id)), (snap) => {
      setStaff(snap.docs
        .map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile))
        .filter(u => !u.isDeleted)
      );
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'users');
    });

    return () => { dUnsub(); oUnsub(); sUnsub(); mUnsub(); };
  }, [bakery]);

  const openOrder = (t?: any) => {
    setOrderType(t);
    setShowOrderModal(true);
  };

  const renderView = () => {
    switch (view) {
      case 'dashboard': return <DashboardOverview orders={orders} bakery={bakery} onNewOrder={openOrder} />;
      case 'orders': return <OrdersManager orders={orders} dealers={dealers} bakery={bakery} />;
      case 'summary': return <DailySummaryDashboard orders={orders} items={items} dealers={dealers} />;
      case 'production': return <ProductionCore orders={orders} bakery={bakery} dealers={dealers} />;
      case 'custom-cakes': return <CustomCakesGallery orders={orders} onNew={() => openOrder('custom_cake')} />;
      case 'chocolates': return <ChocolateProduction orders={orders} onNew={() => openOrder('chocolate')} />;
      case 'dealers': return <DealersManager dealers={dealers} orders={orders} bakeryId={bakery?.id || ''} />;
      case 'catalog': return <MenuManager bakeryId={bakery?.id || ''} />;
      case 'staff': return <StaffManager staff={staff} bakeryId={bakery?.id || ''} />;
      case 'analytics': return <AnalyticsReports orders={orders} dealers={dealers} />;
      case 'billing': return <BillingPayments orders={orders} dealers={dealers} />;
      case 'customers': return <CustomerDatabase orders={orders} />;
      case 'dragees-cost': return <DrageesCostSetup />;
      case 'dragees-production': return <DrageesProduction />;
      case 'settings': return <BakerySettings bakery={bakery} />;
      default: return <DashboardOverview orders={orders} bakery={bakery} onNewOrder={openOrder} />;
    }
  };

  const [showNotifications, setShowNotifications] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const pendingCount = orders.filter(o => o.status === 'pending' && !o.isDeleted).length;
  
  const isOverdue = (order: Order) => {
    if (order.status === 'sent') return false;
    const now = new Date();
    const delDate = new Date(order.deliveryDate);
    const delTime = order.deliveryTime || '23:59';
    const [h, m] = delTime.split(':').map(Number);
    delDate.setHours(h, m, 0, 0);
    return now > delDate;
  };

  const hasOverdue = orders.some(o => isOverdue(o) && !o.isDeleted);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="space-y-6 pb-20"
    >
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative">
        <div className="shrink-0">
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            {view.replaceAll('-', ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
          </h1>
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1 tracking-[0.2em]">{bakery?.name} • Portal</p>
        </div>
        
        <div className="flex items-center gap-4 self-end md:self-center" ref={notificationRef}>
          {pendingCount > 0 && (
            <div className="relative">
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className={cn(
                  "p-2.5 rounded-xl transition-all relative border",
                  hasOverdue ? "bg-red-50 text-red-600 border-red-100 animate-pulse" : "bg-amber-50 text-amber-600 border-amber-100 animate-pulse"
                )}
              >
                <Bell className="w-5 h-5" />
                <span className={cn(
                  "absolute -top-1 -right-1 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-white",
                  hasOverdue ? "bg-red-600" : "bg-amber-600"
                )}>
                  {pendingCount}
                </span>
              </button>

              <AnimatePresence>
                {showNotifications && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-100 z-[120] overflow-hidden"
                  >
                    <div className="p-4 border-b border-slate-50 bg-slate-50/50">
                      <h4 className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Active Alerts</h4>
                    </div>
                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-50">
                      {orders.filter(o => o.status === 'pending' && !o.isDeleted).map(order => (
                        <div key={order.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-black text-slate-900 truncate">{order.dealerCompanyName || 'Retail Order'}</p>
                            <p className="text-[9px] text-slate-400 font-bold">New Pending Approval</p>
                          </div>
                          <button 
                            onClick={() => {
                              stopPending();
                              setIsSilenced(true);
                              setShowNotifications(false);
                            }}
                            className="shrink-0 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-[8px] font-black uppercase tracking-widest"
                          >
                            Dismiss
                          </button>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
      {loading ? (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] py-20 text-center">
          <motion.div 
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 relative"
          >
            <div className="absolute inset-0 border-4 border-indigo-600 border-t-transparent rounded-2xl animate-spin opacity-20"></div>
            <Package className="w-8 h-8 animate-bounce" />
          </motion.div>
          <p className="font-black text-slate-400 uppercase tracking-[0.3em] animate-pulse text-[10px]">Bakery Admin Syncing...</p>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            {renderView()}
          </motion.div>
        </AnimatePresence>
      )}

      {showOrderModal && (
        <NewOrderModal 
          bakeryId={bakery?.id || ''} 
          catalog={items}
          onClose={() => setShowOrderModal(false)} 
          initialType={orderType} 
          dealers={dealers}
        />
      )}
    </motion.div>
  );
};
