
import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, setDoc, updateDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { DrageesBatch, ProductionTracking, DrageesCostSetup } from '../types';
import { getActiveCost } from '../services/costService';
import { cn, formatCurrency } from '../lib/utils';
import { 
  Plus, 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Timer,
  ChevronRight,
  IndianRupee,
  Layers,
  Zap
} from 'lucide-react';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

export const DrageesProduction: React.FC = () => {
  const { bakery } = useAuth();
  const navigate = useNavigate();
  const [batches, setBatches] = useState<DrageesBatch[]>([]);
  const [trackings, setTrackings] = useState<Record<string, ProductionTracking>>({});
  const [activeCost, setActiveCost] = useState<DrageesCostSetup | null>(null);
  const [loading, setLoading] = useState(true);
  const [showNewBatch, setShowNewBatch] = useState(false);

  // New Batch Form State
  const [batchSize, setBatchSize] = useState('10');
  const [machine, setMachine] = useState('Pan 1');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!bakery?.id) return;

    const bUnsub = onSnapshot(query(
      collection(db, 'dragees_batches'), 
      where('bakeryId', '==', bakery.id),
      orderBy('createdAt', 'desc')
    ), (snap) => {
      setBatches(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as DrageesBatch)));
      setLoading(false);
    });

    const tUnsub = onSnapshot(query(
      collection(db, 'production_tracking'),
      where('bakeryId', '==', bakery.id)
    ), (snap) => {
      const tMap: Record<string, ProductionTracking> = {};
      snap.docs.forEach(doc => {
        tMap[doc.id] = doc.data() as ProductionTracking;
      });
      setTrackings(tMap);
    });

    getActiveCost(bakery.id).then(setActiveCost);

    return () => {
      bUnsub();
      tUnsub();
    };
  }, [bakery]);

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bakery?.id || !activeCost) return;

    const bSize = parseFloat(batchSize) || 10;
    const batchId = `drg_${Math.random().toString(36).substring(2, 9)}`;
    
    // Calculate initial cost breakdown based on active setup
    const labour = (activeCost.labourCostPerHour * 4); // Target 4 hours
    const electricity = (activeCost.electricityCostPerHour * 4);
    const rawMaterial = bSize * 450; // Example base rate
    const other = bSize * 50;

    const newBatch: DrageesBatch = {
      id: batchId,
      bakeryId: bakery.id,
      batchSize: bSize,
      status: 'pending',
      machine,
      createdAt: serverTimestamp() as any,
      costBreakdown: {
        rawMaterials: rawMaterial,
        labour,
        electricity,
        packaging: other
      },
      perKgCost: (rawMaterial + labour + electricity + other) / bSize
    };

    await setDoc(doc(db, 'dragees_batches', batchId), newBatch);
    setShowNewBatch(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'in_production': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'completed': return 'bg-green-100 text-green-700 border-green-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest">Dragees Production Hub</h2>
          <p className="text-xs font-bold text-slate-900 mt-1">Monitor Output & Batch Efficiency</p>
        </div>
        <button 
          onClick={() => setShowNewBatch(true)}
          className="bg-blue-600 text-white px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-blue-700 transition-all flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Start New Batch
        </button>
      </div>

      {!activeCost && !loading && (
        <div className="bg-amber-50 border border-amber-200 p-6 rounded-[2rem] flex items-center gap-4 animate-in slide-in-from-top duration-300">
          <div className="w-12 h-12 bg-amber-100 rounded-2xl flex items-center justify-center text-amber-600">
            <AlertCircle />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-black text-amber-900">Costing Setup Required</h3>
            <p className="text-xs font-medium text-amber-700">Please configure your dragees base costs (labour, electricity) before starting production to ensure accurate P/L tracking.</p>
          </div>
          <button 
            onClick={() => navigate('/dashboard/dragees-cost')}
            className="bg-amber-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase"
          >
            Setup Now
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Production Queue</h3>
          {batches.map(batch => {
            const track = trackings[batch.id];
            return (
              <div key={batch.id} className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:border-blue-200 transition-all group">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
                      <Layers className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-black text-slate-900">Batch #{batch.id.slice(-6).toUpperCase()}</h4>
                      <p className="text-[10px] text-slate-400 font-bold">{batch.machine} • {batch.batchSize} KG</p>
                    </div>
                  </div>
                  <span className={cn("px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border", getStatusColor(batch.status))}>
                    {batch.status.replace('_', ' ')}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-4 py-4 border-t border-slate-50">
                  <div className="text-center">
                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Estimated Cost</p>
                    <p className="text-xs font-black text-slate-900">{formatCurrency(batch.costBreakdown.total)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Time Logged</p>
                    <p className="text-xs font-black text-blue-600">{track?.actualProductionTime ? `${(track.actualProductionTime / 60).toFixed(1)} h` : 'Not Started'}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Eff. Cost/KG</p>
                    <p className="text-xs font-black text-green-600">{formatCurrency(track?.labourCostActual ? (batch.costBreakdown.rawMaterial + track.labourCostActual + batch.costBreakdown.electricity + batch.costBreakdown.other) / batch.batchSize : batch.perKgCost)}</p>
                  </div>
                </div>

                <div className="pt-4 flex justify-end">
                  {batch.status !== 'completed' && (
                    <button 
                      onClick={() => navigate(`/production/batch/${batch.id}/tracking`)}
                      className="text-[10px] font-black uppercase tracking-widest text-blue-600 flex items-center gap-1 hover:gap-2 transition-all"
                    >
                      {track?.status === 'RUNNING' ? 'Viewing Live Tracking' : 'Manage Production'} <ChevronRight className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {batches.length === 0 && !loading && (
            <div className="py-20 text-center border-2 border-dashed border-slate-100 rounded-[2rem]">
              <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px]">No active production batches.</p>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Weekly Summary</h3>
          <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -mr-16 -mt-16"></div>
            <TrendingUp className="w-8 h-8 text-blue-400 mb-6" />
            <div className="space-y-6 relative z-10">
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Output</p>
                <p className="text-3xl font-black">{batches.filter(b => b.status === 'completed').reduce((acc, b) => acc + b.batchSize, 0)} KG</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Avg. Cost/KG</p>
                <p className="text-3xl font-black text-blue-400">₹{batches.length ? Math.round(batches.reduce((acc, b) => acc + b.perKgCost, 0) / batches.length) : 0}</p>
              </div>
              <div className="pt-4 border-t border-slate-800">
                <div className="flex justify-between items-center text-[10px] font-black uppercase text-slate-400">
                  <span>Efficiency Score</span>
                  <span className="text-green-400">88%</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-blue-500 w-[88%]"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showNewBatch && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-8 bg-blue-600 text-white flex justify-between items-center">
              <h3 className="text-xl font-black">New Batch Setup</h3>
              <button onClick={() => setShowNewBatch(false)}>×</button>
            </div>
            <form onSubmit={handleCreateBatch} className="p-8 space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Batch Size (KG)</label>
                <input required type="number" step="0.1" value={batchSize || '10'} onChange={e => setBatchSize(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Assign Machine</label>
                <select value={machine} onChange={e => setMachine(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold appearance-none">
                  {['Pan 1', 'Pan 2', 'Pan 3', 'Tumbler 1', 'Coater 1'].map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <button 
                type="submit" 
                disabled={!activeCost}
                className="w-full bg-blue-600 text-white py-4 rounded-xl font-black uppercase tracking-widest shadow-lg disabled:opacity-50"
              >
                {!activeCost ? 'Cost Setup Required' : 'Authorize Production'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
