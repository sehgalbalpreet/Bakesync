import { db } from '../firebase';
import { collection, query, where, orderBy, getDocs, limit, startAt, endAt } from 'firebase/firestore';

export interface MonthlyCost {
  id: string;
  bakeryId: string;
  month: string; // YYYY-MM
  chocolateCostCompound: number;
  chocolateCostCouverture: number;
  centerCost: number;
  electricityCostPerHour: number;
  labourCostPerHour: number;
  wholesaleMargin: number;
  retailMargin: number;
  updatedAt: any;
}

export const getActiveCost = async (bakeryId: string, date: Date = new Date()): Promise<MonthlyCost | null> => {
  try {
    const monthStr = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
    const q = query(
      collection(db, 'monthly_costs'),
      where('bakeryId', '==', bakeryId),
      where('month', '==', monthStr),
      limit(1)
    );
    
    const snap = await getDocs(q);
    if (!snap.empty) {
      return { id: snap.docs[0].id, ...snap.docs[0].data() } as MonthlyCost;
    }
    
    // Fallback to latest cost if current month not found
    const fallbackQ = query(
      collection(db, 'monthly_costs'),
      where('bakeryId', '==', bakeryId),
      orderBy('month', 'desc'),
      limit(1)
    );
    const fallbackSnap = await getDocs(fallbackQ);
    if (!fallbackSnap.empty) {
      return { id: fallbackSnap.docs[0].id, ...fallbackSnap.docs[0].data() } as MonthlyCost;
    }

    return null;
  } catch (err) {
    console.error("Error fetching active cost:", err);
    return null;
  }
};
