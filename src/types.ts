
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export type UserRole = 'super_admin' | 'bakery_admin' | 'staff' | 'production' | 'dealer' | 'dealer_staff' | 'sales' | 'delivery' | 'chocolate_production';

export type OrderStatus = 'pending' | 'received' | 'in_progress' | 'ready' | 'sent' | 'cancelled';

export type OrderType = 'dealer_cake' | 'custom_cake' | 'chocolate';

export interface Bakery {
  id: string;
  name: string;
  trialStartedAt: any; // Firestore Timestamp
  subscriptionStatus: 'trial' | 'active' | 'expired' | 'free_partner' | 'pending_approval';
  plan?: 'monthly' | 'yearly';
  subscriptionEndsAt?: any; // Firestore Timestamp
  adminEmail: string;
  phone?: string;
  address?: string;
  gstNumber?: string;
  isDeleted?: boolean;
  settings: {
    whatsappNumber?: string;
    googleReviewLink?: string;
  };
  notificationSettings?: {
    newOrderSound?: string;
    readySound?: string;
    sentSound?: string;
  };
}

export interface UserProfile {
  uid: string;
  email?: string;
  phone?: string;
  role: UserRole;
  bakeryId: string;
  displayName: string;
  dealerId?: string; // Only for dealer role
  isDeleted?: boolean;
}

export interface Dealer {
  id: string;
  bakeryId: string;
  companyName: string; // Tata, MG, Skoda, etc.
  orderPrefix?: string; // e.g. "TA" for Tata
  lastOrderSequence?: number; // Monotonically increasing counter for order IDs
  phone: string;
  staffName: string;
  email?: string;
  customCakeDiscount?: number; // Fixed amount discount per cake
  preferredFlavor?: string;
  preferredWeight?: number;
  customPricePerKg?: number;
  priceListExpiryDate?: string; // YYYY-MM-DD
  color?: string; // Hex color code for identifying dealer in UI
  isDeleted?: boolean;
}

export interface CakeDetails {
  weight: number; // 0.5, 1, 2, etc.
  flavor: string;
  isPhotoCake: boolean;
  photoUrl?: string;
  instruction?: string;
}

export interface ChocolateDetails {
  quantity: number;
  productType: 'bites' | 'dragees' | 'center_filled';
  flavor: string;
  referenceImageUrl?: string;
  slipUrl?: string;
  instruction?: string;
}

export interface MenuItem {
  id: string;
  bakeryId: string;
  name: string;
  description?: string;
  category: 'cake' | 'chocolate' | 'dealer_cake_base' | 'other';
  price: number;
  weight?: string; // e.g. "500g", "1kg"
  gstPercent: number;
  hsnCode?: string;
  imageUrl?: string;
  isDeleted?: boolean;
}

export interface DesignQuote {
  fondantType: 'none' | 'half' | 'full';
  fondantCost: number;
  tierSelected: number;
  tierSource: 'ai' | 'admin';
  tierConfidence?: 'high' | 'medium' | 'low';
  tierReason?: string;
  characters: {
    small: number;
    large: number;
    cost: number;
  };
  flowers: {
    fondant: number;
    real: number;
    procurementIncluded: boolean;
    cost: number;
  };
  complexityItems: string[];
  surchargePercent: number;
  surchargeAmount: number;
  rushCharge: number;
  basePrice: number;
  marketPrice: number;
  internalPrice: number;
  finalQuote: number;
  negotiationFloor: number;
  profitIndicator: 'high' | 'safe' | 'risky';
  adminOverridePrice?: number;
  adminOverrideReason?: string;
  quoteSentAt?: any;
  quoteSentVia?: 'whatsapp';
  adminWhoQuoted?: string;
}

export interface Order {
  id: string;
  bakeryId: string;
  displayId?: string; // e.g. TA101
  dealerId?: string;
  dealerCompanyName?: string;
  type: OrderType;
  status: OrderStatus;
  createdAt: any;
  receivedAt?: any;
  receivedBy?: string; // Staff name/email
  updatedAt?: any; // To track last modification
  isDeleted?: boolean;
  inProgressAt?: any;
  inProgressBy?: string;
  readyAt?: any;
  readyBy?: string; // Staff name/email
  sentAt?: any;
  sentBy?: string; // Staff name/email
  cancelledAt?: any;
  cancelledBy?: string;
  cancelledReason?: string;
  confirmationReminderSentAt?: any;
  deliveryDate?: string; // YYYY-MM-DD
  deliveryTime?: string; // HH:mm
  details: CakeDetails | ChocolateDetails;
  totalAmount: number;
  discountApplied?: number;
  advanceReceived: number;
  customerDetails?: {
    name: string;
    phone: string;
    birthday?: string;
    anniversary?: string;
    engagementDate?: string;
  };
  designQuote?: DesignQuote;
  quoteTag?: 'DESIGN QUOTE PENDING' | 'QUOTE SENT — AWAITING CONFIRM' | 'CONFIRMED' | 'DECLINED';
  isQuoteLocked?: boolean;
  problemDetails?: {
    reason: 'electricity' | 'oven' | 'delay' | 'cancel' | 'other';
    description: string;
    reportedAt: any;
  };
}

export interface DrageesCostSetup {
  id: string;
  bakeryId: string;
  month: string; // YYYY-MM
  chocolatePriceKg: number;
  centerPriceKg: number;
  labourRateHour: number;
  electricityRateHour: number;
  updatedAt: any;
}

export interface DrageesBatch {
  id: string;
  bakeryId: string;
  batchSize: number;
  actualOutputKg?: number; // Optional until completed
  machine: string;
  chocolateType?: 'Compound' | 'Couverture' | 'Both';
  costBreakdown: {
    rawMaterials: number;
    electricity: number;
    labour: number;
    packaging: number;
  };
  status: 'pending' | 'draft' | 'production' | 'completed';
  createdAt: any;
  perKgCost?: number;
}

export interface ProductionTracking {
  id: string; // Same as batchId
  bakeryId: string;
  assignedStaff: string;
  startTime: any;
  endTime?: any;
  status: 'NOT_STARTED' | 'RUNNING' | 'PAUSED' | 'COMPLETED';
  actualProductionTime: number; // minutes
  totalPauseTime: number; // minutes
  efficiencyStatus?: 'On Time' | 'Slightly Over' | 'Significantly Over';
  labourCostActual: number;
  labourCostEstimated: number;
  pauses: {
    reason: string;
    pauseStart: any;
    pauseEnd?: any;
    duration?: number;
  }[];
}

export interface DrageesPriceEntry {
  id: string;
  bakeryId: string;
  wholesalePricePerKg: number;
  retailPricePerJar: number;
  marginWholesale: number;
  marginRetail: number;
  batchRef: string;
  date: string;
  savedBy: string;
  savedAt: any;
}

export interface Customer {
  id: string;
  bakeryId: string;
  name: string;
  phone: string;
  birthday?: string;
  anniversary?: string;
  engagementDate?: string;
  createdAt: any;
  lastOrderAt?: any;
  totalOrders: number;
  isDeleted?: boolean;
  deletedAt?: any;
}
