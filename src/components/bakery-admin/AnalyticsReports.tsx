import React from 'react';
import { StatCard } from './StatCard';
import { Order, Dealer } from '../../types';
import { formatCurrency } from '../../lib/utils';
import { TrendingUp, ShoppingBag, PieChart, Store, Printer } from 'lucide-react';
import { motion } from 'motion/react';
import { exportOrdersToExcel } from '../../lib/exportUtils';

interface AnalyticsReportsProps {
  orders: Order[];
  dealers: Dealer[];
}

export const AnalyticsReports: React.FC<AnalyticsReportsProps> = ({ orders, dealers }) => {
  const staffStats = orders.filter(o => o.readyBy && !o.isDeleted).reduce((acc: any, o) => {
    const name = o.readyBy!.split('@')[0].split(' ')[0];
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {});

  const sortedStaff = Object.entries(staffStats).sort((a: any, b: any) => b[1] - a[1]);

  // Dynamic Performance Insights Monthly Calculations
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthShorts = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const currentYear = new Date().getFullYear();

  const monthlyRevenues = monthNames.map((monthName, index) => {
    const monthOrders = orders.filter(o => {
      const d = o.createdAt?.toDate?.();
      return d && d.getFullYear() === currentYear && d.getMonth() === index && o.status !== 'cancelled' && !o.isDeleted;
    });
    const rev = monthOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    return {
      monthLabel: monthName,
      shortLabel: monthShorts[index],
      revenue: rev
    };
  });

  const maxMonthlyVal = Math.max(...monthlyRevenues.map(r => r.revenue), 1);

  // Dynamic AI Business Audit Data
  const dealerOrders = orders.filter(o => o.dealerId && !o.isDeleted);
  const directOrders = orders.filter(o => !o.dealerId && !o.isDeleted);
  const cancelledDealers = dealerOrders.filter(o => o.status === 'cancelled').length;
  const cancelledDirect = directOrders.filter(o => o.status === 'cancelled').length;
  const dealerCancelRate = dealerOrders.length ? Math.round((cancelledDealers / dealerOrders.length) * 100) : 0;
  const directCancelRate = directOrders.length ? Math.round((cancelledDirect / directOrders.length) * 100) : 0;

  const hasHighDealerCancel = dealerCancelRate > directCancelRate && dealerCancelRate > 5;
  const unconfirmedOrdersCount = orders.filter(o => o.status === 'pending' && !o.isDeleted).length;
  const unconfirmedRisk = unconfirmedOrdersCount >= 4;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total Revenue" value={formatCurrency(orders.reduce((a, b) => a + (b.status === 'cancelled' || b.isDeleted ? 0 : (b.totalAmount || 0)), 0))} icon={TrendingUp} color="blue" />
        <StatCard label="Total Orders" value={orders.filter(o => o.status !== 'cancelled' && !o.isDeleted).length} icon={ShoppingBag} color="purple" />
        <StatCard label="Avg Order Value" value={formatCurrency(orders.filter(o => o.status !== 'cancelled' && !o.isDeleted).length ? orders.reduce((a, b) => a + (b.status === 'cancelled' || b.isDeleted ? 0 : (b.totalAmount || 0)), 0) / orders.filter(o => o.status !== 'cancelled' && !o.isDeleted).length : 0)} icon={PieChart} color="amber" />
        <StatCard label="Dealer Share" value={`${Math.round((orders.filter(o => o.dealerId && !o.isDeleted).length / (orders.filter(o => !o.isDeleted).length || 1)) * 100)}%`} icon={Store} color="green" />
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
                 <p className="text-lg font-black text-slate-900">{orders.filter(o => o.status === 'cancelled' && !o.isDeleted).length}</p>
                 <p className="text-[9px] text-red-500 font-bold uppercase mt-1 leading-none">Loss Impact: {formatCurrency(orders.filter(o => o.status === 'cancelled' && !o.isDeleted).reduce((acc, o) => acc + (o.totalAmount || 0), 0))}</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-2xl">
                 <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Confirmation Rate</p>
                 <p className="text-lg font-black text-slate-900">
                    {Math.round((orders.filter(o => o.confirmationReminderSentAt && !o.isDeleted).length / (orders.filter(o => o.status === 'pending' && !o.isDeleted).length || 1)) * 100)}%
                 </p>
                 <p className="text-[9px] text-blue-500 font-bold uppercase mt-1 leading-none">Reminder Pipeline Active</p>
              </div>
           </div>
        </div>

        <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] relative overflow-hidden">
           <h3 className="text-sm font-black text-blue-400 uppercase tracking-widest mb-6 relative z-10 text-blue-400">AI Business Audit</h3>
           <p className="text-xs text-white/70 leading-relaxed mb-6 relative z-10 font-bold italic">
            "Your production throughput is stable. Your partner dealer cancellation rate is currently {dealerCancelRate}%, compared to direct retail orders at {directCancelRate}%. {hasHighDealerCancel ? 'Consider enforcing a 25% non-refundable advance for dealer partners to protect margins.' : 'Good job maintaining healthy partner relations.'}"
           </p>
           <div className="grid grid-cols-1 gap-3 relative z-10 text-white">
              <div className="p-4 bg-white/5 rounded-2xl border border-white/10 text-white">
                 <p className="text-[9px] font-black text-blue-400 uppercase tracking-widest mb-2">Primary Risk</p>
                 <p className="text-xs font-bold text-white">
                    {unconfirmedRisk 
                      ? `${unconfirmedOrdersCount} unconfirmed pending orders. Process these quickly to secure inventory.`
                      : 'No critical pending bottlenecks detected. Keep pipeline updated.'}
                 </p>
              </div>
              <div className="p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 text-white">
                 <p className="text-[9px] font-black text-emerald-400 uppercase tracking-widest mb-2 text-emerald-400">Opportunity</p>
                 <p className="text-xs font-bold text-white">
                    {dealerOrders.length > 0 
                      ? `Dealers drive ${Math.round((dealerOrders.length / (orders.length || 1)) * 100)}% of orders. Launch a unified catalog push.`
                      : 'Collaborate with partner car dealerships to expand cake distribution volume.'}
                 </p>
              </div>
           </div>
           <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-600 rounded-full blur-[100px] opacity-20 -mr-20 -mt-20"></div>
        </div>
      </div>

      <div className="bg-white p-8 rounded-3xl border border-slate-200">
        <div className="flex justify-between items-center mb-8 text-center sm:text-left">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Performance Insights</h2>
          <div className="flex gap-2">
            <button onClick={() => exportOrdersToExcel(orders, "Bakery_Business_Report")} className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 transition-colors text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-xs cursor-pointer"><Printer className="w-4 h-4" /> Export Report</button>
          </div>
        </div>
        <div className="h-64 flex items-end gap-1">
          {monthlyRevenues.map((item, i) => {
            const pct = Math.max(8, Math.round((item.revenue / maxMonthlyVal) * 100));
            return (
              <div key={i} className="flex-1 bg-slate-100 hover:bg-purple-500 transition-all rounded-t-lg relative group" style={{ height: `${pct}%` }}>
                 <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20 shadow-lg">
                   ₹{item.revenue.toLocaleString()} ({item.shortLabel})
                 </div>
              </div>
            );
          })}
        </div>
        <div className="flex justify-between mt-4 text-[10px] text-slate-400 font-black uppercase tracking-widest">
          <span>January</span>
          <span>December</span>
        </div>
      </div>
    </div>
  );
};
