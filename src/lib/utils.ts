
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number) {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return '₹0';
  }
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function generateWhatsAppInviteLink(phone: string, name: string, portalUrl: string) {
  const cleanPhone = phone.replace(/\D/g, '');
  const message = `Hello ${name}! Welcome to the KreativeOTP Portal. You have been added as a team member. You can access the dashboard here: ${portalUrl}`;
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

export function safeTimestampToDate(ts: any): Date | null {
  if (!ts) return null;
  if (typeof ts.toDate === 'function') return ts.toDate();
  if (ts instanceof Date) return ts;
  if (typeof ts === 'number') return new Date(ts);
  if (typeof ts === 'string') return new Date(ts);
  return null;
}

export function safeGetTime(ts: any): number {
  return safeTimestampToDate(ts)?.getTime() || 0;
}

export function generateDealerSupportWhatsAppLink(bakeryPhoneOrWa: string | undefined, dealerCompanyName: string, orderId?: string, problemReason?: string) {
  const cleanPhone = (bakeryPhoneOrWa || '').replace(/\D/g, '');
  const groupName = `Kreative ${dealerCompanyName.trim() || 'Partner'}`;
  let message = `Hello ${groupName} Support 👋\n\n`;
  if (orderId) {
    message += `Reaching out from ${dealerCompanyName || 'Dealership'} regarding Order #${orderId}.\n`;
  } else {
    message += `Reaching out from ${dealerCompanyName || 'Dealership'} for bakery support.\n`;
  }
  if (problemReason) {
    message += `Reported Issue: ${problemReason}\n`;
  }
  message += `Please check and coordinate resolution. Thank you!`;
  
  if (!cleanPhone) {
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}

export function generateCustomerFeedbackWhatsAppLink(customerPhone: string, customerName: string, orderId: string, bakeryName: string) {
  const cleanPhone = (customerPhone || '').replace(/\D/g, '');
  const message = `Hello ${customerName || 'Customer'} 👋\n\nYour cake order #${orderId} from ${bakeryName || 'Kreative Chocolates'} has been completed / dispatched! 🎂✨\n\nWe would love your feedback. How would you rate your cake & experience? (Reply with 1 to 5 stars ⭐)\n\n⭐⭐⭐⭐⭐ : Excellent!\n⭐⭐⭐⭐ : Very Good\n⭐⭐⭐ : Average\n⭐⭐ : Below Expectations\n⭐ : Unhappy (Please let us know how we can improve)\n\nThank you for choosing us! 🙏`;
  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
}
