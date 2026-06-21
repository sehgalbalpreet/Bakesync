import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { Customer, Order } from '../../types';
import { Heart, TrendingUp, MessageCircle } from 'lucide-react';
import { format } from 'date-fns';

interface CustomerDatabaseProps {
  orders: Order[];
}

export const CustomerDatabase: React.FC<CustomerDatabaseProps> = ({ orders }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const { bakery } = useAuth();

  useEffect(() => {
    if (!bakery?.id) return;
    const unsub = onSnapshot(query(collection(db, 'customers'), where('bakeryId', '==', bakery.id)), (snap) => {
      setCustomers(snap.docs
        .map(doc => ({ ...doc.data(), id: doc.id } as Customer))
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
            <span className="flex items-center gap-2 text-[10px] font-black text-pink-600 bg-pink-50 px-3 py-1 rounded-full"><Heart className="w-3 h-3 text-pink-600" /> Today's Occasions</span>
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
            <div className="relative z-10 text-center sm:text-left">
              <div className="flex justify-center sm:justify-start items-center gap-3 mb-6">
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
                  <div key={c.id} className="bg-white p-5 rounded-3xl shadow-sm border border-blue-50 flex flex-col justify-between group hover:scale-[1.02] transition-colors">
                    <div>
                      <div className="flex justify-between items-start mb-2">
                         <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-[8px] font-black uppercase">Top 1% Client</span>
                         <span className="text-[10px] font-black text-slate-900">{c.totalOrders}x</span>
                      </div>
                      <h4 className="font-black text-slate-900">{c.name}</h4>
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">Last Order: {c.lastOrderAt ? format((c.lastOrderAt as any).toDate ? (c.lastOrderAt as any).toDate() : new Date(c.lastOrderAt), 'dd MMM') : 'Long ago'}</p>
                    </div>
                    <button 
                      onClick={() => {
                        const msg = `Hi ${c.name}, it's been a while since your last treat from ${bakery?.name || 'Bakesync'}! We have some new special items you might like. Want to check them out?`;
                        window.open(`https://wa.me/91${c.phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, '_blank');
                      }}
                      className="mt-4 w-full bg-blue-600 text-white py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
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
