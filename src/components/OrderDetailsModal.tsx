import React from 'react';
import { X, Calendar, Clock, User, Phone, Package, Tag, Hash, FileText, Image as ImageIcon, Download, Share2 } from 'lucide-react';
import { Order, ChocolateDetails, CakeDetails, Dealer } from '../types';
import { formatCurrency } from '../lib/utils';
import { generateOrderPDF } from '../lib/exportUtils';
import { cn } from '../lib/utils';

interface OrderDetailsModalProps {
  order: Order;
  bakery: any;
  dealer?: Dealer;
  onClose: () => void;
}

export const OrderDetailsModal: React.FC<OrderDetailsModalProps> = ({ order, bakery, dealer, onClose }) => {
  const isChocolate = order.type === 'chocolate';
  const cakeDetails = !isChocolate ? (order.details as CakeDetails) : null;
  const chocolateDetails = isChocolate ? (order.details as ChocolateDetails) : null;
  
  const photoUrl = cakeDetails?.photoUrl || chocolateDetails?.slipUrl;
  const isSlip = !!chocolateDetails?.slipUrl;

  const handleShare = () => {
    const text = `Order Details: ${order.displayId || order.id}\nStatus: ${order.status.toUpperCase()}\nDelivery: ${order.deliveryDate} @ ${order.deliveryTime}\nFlavor: ${order.details.flavor}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Order Details</h2>
              <div className={cn(
                "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                order.status === 'pending' ? "bg-slate-100 text-slate-500" :
                order.status === 'production' ? "bg-indigo-100 text-indigo-600" :
                order.status === 'ready' ? "bg-green-100 text-green-600" :
                "bg-blue-100 text-blue-600"
              )}>
                {order.status}
              </div>
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">ID: {order.displayId || order.id}</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-3 h-3 text-slate-400" />
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Delivery Date</span>
              </div>
              <p className="text-sm font-black text-slate-700">{order.deliveryDate}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-3 h-3 text-slate-400" />
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Time</span>
              </div>
              <p className="text-sm font-black text-slate-700">{order.deliveryTime}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-2 mb-2">
                <Tag className="w-3 h-3 text-slate-400" />
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Type</span>
              </div>
              <p className="text-sm font-black text-slate-700 uppercase">{order.type.replace('_', ' ')}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <div className="flex items-center gap-2 mb-2">
                <Hash className="w-3 h-3 text-slate-400" />
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                  {isChocolate ? 'Quantity' : 'Weight'}
                </span>
              </div>
              <p className="text-sm font-black text-slate-700">
                {isChocolate ? chocolateDetails?.quantity : `${cakeDetails?.weight} KG`}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Left Column: Core Info */}
            <div className="space-y-6">
              {/* Customer Box */}
              <div className="space-y-3">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Customer Details</h3>
                <div className="bg-white border-2 border-slate-100 p-4 rounded-2xl shadow-sm">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center font-black">
                      {order.customerDetails?.name?.[0] || 'W'}
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-800">{order.customerDetails?.name || 'Walk-in Customer'}</p>
                      <div className="flex items-center gap-1.5 text-slate-400">
                        <Phone size={10} />
                        <span className="text-[10px] font-bold">{order.customerDetails?.phone || 'No Phone'}</span>
                      </div>
                    </div>
                  </div>
                  {order.dealerCompanyName && (
                    <div className="pt-3 border-t border-slate-50 space-y-2">
                      <p className="text-[9px] font-bold text-slate-400 uppercase">Booked via Dealer</p>
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-xs font-black text-indigo-600">{order.dealerCompanyName}</p>
                          {dealer && (
                            <p className="text-[10px] font-bold text-slate-500 mt-0.5">{dealer.staffName}</p>
                          )}
                        </div>
                        {dealer?.phone && (
                          <a 
                            href={`tel:${dealer.phone}`}
                            className="bg-indigo-50 text-indigo-600 p-2 rounded-lg hover:bg-indigo-600 hover:text-white transition-all flex items-center gap-1.5"
                          >
                            <Phone size={12} />
                            <span className="text-[10px] font-black">{dealer.phone}</span>
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Product Info */}
              <div className="space-y-3">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Product Info</h3>
                <div className="grid grid-cols-1 gap-2">
                  <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
                    <span className="text-[10px] font-bold text-slate-400">FLAVOR</span>
                    <span className="text-xs font-black text-slate-700 uppercase">{order.details.flavor}</span>
                  </div>
                </div>
              </div>

              {/* Instructions */}
              <div className="space-y-3">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Special Instructions</h3>
                <div className="bg-amber-50/50 border border-amber-100 p-4 rounded-2xl italic text-xs text-slate-600 leading-relaxed min-h-[60px]">
                  {order.details.instruction ? order.details.instruction : 'Standard product, no special instructions provided.'}
                </div>
              </div>

              {/* Amount Box - Only if not dealer cake or shown to admin */}
              {order.type !== 'dealer_cake' && (
                <div className="space-y-3">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Payment Summary</h3>
                  <div className="bg-indigo-600 text-white p-5 rounded-2xl shadow-lg shadow-indigo-200">
                    <div className="flex justify-between items-center mb-4 pb-4 border-b border-white/20">
                      <span className="text-[10px] font-black uppercase tracking-widest opacity-80">Total Amount</span>
                      <span className="text-2xl font-black">{formatCurrency(order.totalAmount)}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold opacity-80 uppercase tracking-tight">Advance Shared</span>
                      <span className="font-black">{formatCurrency(order.advanceReceived || 0)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column: Reference Image */}
            <div className="space-y-4">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {isSlip ? 'Order Slip Reference' : 'Reference Image'}
              </h3>
              {photoUrl ? (
                <div className="relative group rounded-3xl overflow-hidden border-4 border-slate-50 shadow-xl bg-slate-100 aspect-[4/5]">
                  <img src={photoUrl} alt="Reference" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-4">
                    <button 
                      onClick={() => window.open(photoUrl, '_blank')}
                      className="p-3 bg-white text-indigo-600 rounded-full hover:scale-110 transition-transform shadow-xl"
                    >
                      <ImageIcon size={20} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="aspect-[4/5] bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                  <ImageIcon size={48} className="mb-4 opacity-20" />
                  <p className="text-[10px] font-black uppercase tracking-widest">No Image Reference Provided</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-slate-100 bg-slate-50 flex gap-3">
          <button 
            onClick={() => generateOrderPDF(order, bakery)}
            className="flex-1 bg-white border border-slate-200 text-slate-700 px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-50 transition-all"
          >
            <Download size={16} />
            Download Job Sheet
          </button>
          <button 
            onClick={handleShare}
            className="px-6 py-4 bg-green-50 text-green-600 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-green-100 transition-all"
          >
            <Share2 size={16} />
            Share
          </button>
        </div>
      </div>
    </div>
  );
};
