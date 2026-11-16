import React, { useState, useEffect, useRef } from 'react';
import { 
  ShieldCheck, 
  Truck, 
  ShoppingBag, 
  ArrowLeft, 
  CheckCircle, 
  AlertCircle,
  Lock,
  Tag,
  Copy,
  Check,
  Upload,
  Image as ImageIcon,
  Sparkles,
  Info,
  User,
  CreditCard,
  Smartphone,
  Banknote,
  ArrowRight,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { orderService } from '../services/orderService';
import { settingsService, defaultPaymentSettings } from '../services/settingsService';
import { ShippingAddress, PaymentMethod, PaymentSettings, PaymentDetails } from '../types';
import { FloatingInput, FloatingTextarea, FloatingSelect } from '../components/common/FloatingInput';

interface CheckoutPageProps {
  onNavigate: (route: string) => void;
}

const BD_DIVISIONS = [
  'Dhaka',
  'Chattogram',
  'Rajshahi',
  'Khulna',
  'Barishal',
  'Sylhet',
  'Rangpur',
  'Mymensingh',
];

const BD_DISTRICTS_BY_DIVISION: Record<string, string[]> = {
  Dhaka: [
    'Dhaka',
    'Faridpur',
    'Gazipur',
    'Gopalganj',
    'Kishoreganj',
    'Madaripur',
    'Manikganj',
    'Munshiganj',
    'Narayanganj',
    'Narsingdi',
    'Rajbari',
    'Shariatpur',
    'Tangail',
  ],
  Chattogram: [
    'Chattogram',
    'Bandarban',
    'Brahmanbaria',
    'Chandpur',
    "Cox's Bazar",
    'Cumilla',
    'Feni',
    'Khagrachhari',
    'Lakshmipur',
    'Noakhali',
    'Rangamati',
  ],
  Rajshahi: [
    'Rajshahi',
    'Bogura',
    'Chapainawabganj',
    'Joypurhat',
    'Naogaon',
    'Natore',
    'Pabna',
    'Sirajganj',
  ],
  Khulna: [
    'Khulna',
    'Bagerhat',
    'Chuadanga',
    'Jashore',
    'Jhenaidah',
    'Kushtia',
    'Magura',
    'Meherpur',
    'Narail',
    'Satkhira',
  ],
  Barishal: [
    'Barishal',
    'Barguna',
    'Bhola',
    'Jhalokati',
    'Patuakhali',
    'Pirojpur',
  ],
  Sylhet: [
    'Sylhet',
    'Habiganj',
    'Moulvibazar',
    'Sunamganj',
  ],
  Rangpur: [
    'Rangpur',
    'Dinajpur',
    'Gaibandha',
    'Kurigram',
    'Lalmonirhat',
    'Nilphamari',
    'Panchagarh',
    'Thakurgaon',
  ],
  Mymensingh: [
    'Mymensingh',
    'Jamalpur',
    'Netrokona',
    'Sherpur',
  ],
};

const MFS_LOGOS: Record<'bkash' | 'nagad' | 'rocket', string> = {
  bkash: '/assets/aistudio/bkash_739d0e9e.png',
  nagad: '/assets/aistudio/nagad2_9f19b07d.jfif',
  rocket: '/assets/aistudio/DBBL-Mobile-Banking-Becomes-Rocket_a4583d30.jpg',
};

const normalizeDivisionName = (raw?: string) => {
  if (!raw) return 'Dhaka';
  if (raw === 'Chittagong') return 'Chattogram';
  if (raw === 'Barisal') return 'Barishal';
  return BD_DIVISIONS.includes(raw) ? raw : 'Dhaka';
};

export const CheckoutPage: React.FC<CheckoutPageProps> = ({ onNavigate }) => {
  const { 
    items, 
    subtotal, 
    discount, 
    coupons,
    baseDeliveryCharge,
    deliveryCharge, 
    isFreeDelivery,
    activeFreeDeliveryCoupon,
    grandTotal, 
    appliedCoupon, 
    deliveryZones,
    selectedZone,
    setSelectedZone,
    clearCart 
  } = useCart();
  const { currentUser, customerProfile } = useAuth();

  // Settings for Payment Gateways & Online Discount
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>(defaultPaymentSettings);

  // Form Fields
  const initialDivision = normalizeDivisionName(customerProfile?.division);
  const initialDistrictList = BD_DISTRICTS_BY_DIVISION[initialDivision] || BD_DISTRICTS_BY_DIVISION.Dhaka;
  const savedDistrict = customerProfile?.district || customerProfile?.city || '';
  const initialDistrict = initialDistrictList.includes(savedDistrict)
    ? savedDistrict
    : initialDistrictList[0];

  const [fullName, setFullName] = useState(customerProfile?.name || currentUser?.displayName || '');
  const [phone, setPhone] = useState(customerProfile?.phone || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [address, setAddress] = useState(customerProfile?.address || '');
  const [division, setDivision] = useState(initialDivision);
  const [district, setDistrict] = useState(initialDistrict);
  const [notes, setNotes] = useState('');
  
  // Payment State: 'cod' or 'online'
  const [paymentMode, setPaymentMode] = useState<'cod' | 'online'>('cod');
  const [onlineGateway, setOnlineGateway] = useState<'bkash' | 'nagad' | 'rocket'>('bkash');
  const paymentMethod: PaymentMethod = paymentMode === 'cod' ? 'cod' : onlineGateway;

  const [senderNumber, setSenderNumber] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string>('');
  const [copiedNumber, setCopiedNumber] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [gatewayDropdownOpen, setGatewayDropdownOpen] = useState(false);
  const gatewayDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    settingsService.getSettings().then((s) => {
      if (s.paymentSettings) {
        setPaymentSettings(s.paymentSettings);
      }
    });
  }, []);

  useEffect(() => {
    if (!gatewayDropdownOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (gatewayDropdownRef.current && !gatewayDropdownRef.current.contains(e.target as Node)) {
        setGatewayDropdownOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGatewayDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [gatewayDropdownOpen]);

  // If cart is empty
  if (items.length === 0) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-neutral-100 flex items-center justify-center mx-auto mb-4">
          <ShoppingBag className="w-8 h-8 text-neutral-400" />
        </div>
        <h2 className="text-xl font-extrabold uppercase tracking-tight text-neutral-900 mb-2">Your Cart is Empty</h2>
        <p className="text-xs text-neutral-500 mb-6 max-w-sm mx-auto">
          You have no items in your shopping cart. Explore our premium menswear collection.
        </p>
        <button
          onClick={() => onNavigate('/shop')}
          className="px-6 py-3 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-neutral-800 transition-colors cursor-pointer"
        >
          Return to Shop
        </button>
      </div>
    );
  }

  // If user is not logged in, prompt to log in / register first before checkout
  if (!currentUser) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 sm:py-24">
        <div className="bg-white border border-neutral-200 rounded-2xl p-6 sm:p-8 shadow-xs text-center space-y-6">
          <div className="w-14 h-14 bg-neutral-100 rounded-full flex items-center justify-center mx-auto">
            <User className="w-7 h-7 text-neutral-700" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-extrabold uppercase tracking-tight text-neutral-900">
              Sign In to Complete Checkout
            </h2>
            <p className="text-xs text-neutral-500 mt-2 leading-relaxed">
              Please sign in or create an account to proceed with your order. This ensures accurate order tracking, SMS notifications, and delivery management.
            </p>
          </div>

          <div className="p-4 bg-neutral-50 rounded-xl border border-neutral-200 text-left text-xs space-y-1.5">
            <div className="flex justify-between text-neutral-600">
              <span>Items in Cart:</span>
              <span className="font-semibold">{items.reduce((s, i) => s + i.quantity, 0)} items</span>
            </div>
            <div className="flex justify-between text-neutral-600">
              <span>Subtotal:</span>
              <span className="font-bold text-neutral-900">৳{subtotal.toLocaleString('en-BD')}</span>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => onNavigate('/account?redirect=checkout')}
              className="w-full py-3.5 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-xl hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
            >
              <span>Sign In / Create Account</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => onNavigate('/shop')}
              className="w-full py-3 border border-neutral-300 text-neutral-700 text-xs font-semibold uppercase tracking-wider rounded-xl hover:bg-neutral-50 transition-colors cursor-pointer"
            >
              Continue Shopping
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Also check if entered phone/email unlocks a customer-targeted one-time free delivery pass
  const phoneMatchedFreeDelivery =
    !activeFreeDeliveryCoupon && coupons.length > 0
      ? settingsService.getActiveFreeDeliveryForUser(coupons, {
          uid: currentUser?.uid,
          email: email.trim() || currentUser?.email,
          phone: phone.trim() || customerProfile?.phone,
        })
      : null;

  const effectiveFreeDeliveryCoupon =
    activeFreeDeliveryCoupon ||
    (phoneMatchedFreeDelivery && subtotal >= (phoneMatchedFreeDelivery.minOrderAmount || 0)
      ? phoneMatchedFreeDelivery
      : null);

  const effectiveFreeDelivery = isFreeDelivery || Boolean(effectiveFreeDeliveryCoupon);
  const effectiveDeliveryCharge = effectiveFreeDelivery ? 0 : (baseDeliveryCharge || deliveryCharge);
  const effectiveGrandTotal = Math.max(0, subtotal - discount + effectiveDeliveryCharge);
  const needsAdvancePayment = paymentMode === 'online' || (paymentMode === 'cod' && effectiveDeliveryCharge > 0);

  // Calculate Online Payment Discount
  const isOnlinePayment = paymentMode === 'online';
  let onlineDiscount = 0;
  if (isOnlinePayment && paymentSettings.onlineDiscountActive) {
    if (paymentSettings.onlineDiscountType === 'percentage') {
      onlineDiscount = Math.round((subtotal * paymentSettings.onlineDiscountValue) / 100);
    } else {
      onlineDiscount = Math.min(paymentSettings.onlineDiscountValue, subtotal);
    }
  }

  const finalPayableTotal = Math.max(0, effectiveGrandTotal - onlineDiscount);

  // Copy gateway number to clipboard
  const handleCopyNumber = (num: string) => {
    navigator.clipboard.writeText(num.replace(/[^0-9]/g, ''));
    setCopiedNumber(true);
    setTimeout(() => setCopiedNumber(false), 2000);
  };

  const handleProofChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setErrorMessage('File size must be under 5MB.');
        return;
      }
      setProofFile(file);
      setProofPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    // Phone validation
    const cleanPhone = phone.trim().replace(/[^0-9+]/g, '');
    if (!cleanPhone || cleanPhone.length < 11) {
      setErrorMessage('Please enter a valid mobile number (e.g. 01700-000000).');
      return;
    }

    if (!address.trim()) {
      setErrorMessage('Please enter your full street delivery address.');
      return;
    }

    // Require Sender Number and TrxID when advance or full online payment is required
    const activeGwName = onlineGateway.toUpperCase();
    if (needsAdvancePayment) {
      if (!senderNumber.trim() || senderNumber.trim().length < 11) {
        setErrorMessage(
          paymentMode === 'cod'
            ? `Please enter your ${activeGwName} number used to pay the ৳${effectiveDeliveryCharge} advance delivery fee.`
            : `Please enter the ${activeGwName} mobile number used to send payment.`
        );
        return;
      }
      if (!transactionId.trim() || transactionId.trim().length < 6) {
        setErrorMessage(
          paymentMode === 'cod'
            ? `Please provide the Transaction ID (TrxID) for the ৳${effectiveDeliveryCharge} advance delivery fee payment.`
            : 'Please provide a valid Transaction ID (TrxID) received in your payment SMS/app.'
        );
        return;
      }
    }

    setIsSubmitting(true);

    try {
      // 1. Process payment proof if provided (compressed client-side, zero storage failure)
      let proofUrl = '';
      if (needsAdvancePayment && proofFile) {
        proofUrl = await orderService.uploadPaymentProof(proofFile);
      }

      // 2. Build sanitized shipping address
      const shippingAddress: ShippingAddress = {
        fullName: fullName.trim(),
        phone: cleanPhone,
        address: address.trim(),
        division,
        district: district.trim(),
      };
      if (email.trim()) shippingAddress.email = email.trim();
      if (notes.trim()) shippingAddress.notes = notes.trim();

      // 3. Prepare payment details with advance delivery fee tracking
      let paymentDetails: PaymentDetails | undefined;
      if (needsAdvancePayment) {
        paymentDetails = {
          method: paymentMethod,
          senderNumber: senderNumber.trim(),
          transactionId: transactionId.trim().toUpperCase(),
          ...(proofUrl ? { proofUrl } : {}),
        };

        if (paymentMode === 'cod') {
          paymentDetails.advanceDeliveryPaid = true;
          paymentDetails.advanceGateway = onlineGateway;
          paymentDetails.advanceAmount = effectiveDeliveryCharge;
          paymentDetails.dueOnDelivery = Math.max(0, subtotal - discount);
        } else {
          if (onlineDiscount > 0) paymentDetails.onlineDiscountApplied = onlineDiscount;
          paymentDetails.advanceAmount = finalPayableTotal;
          paymentDetails.dueOnDelivery = 0;
        }
      }

      // 4. Submit order
      const result = await orderService.createOrder({
        customerId: currentUser?.uid || 'guest',
        customerName: fullName.trim(),
        customerPhone: cleanPhone,
        customerEmail: email.trim() || currentUser?.email || '',
        shippingAddress,
        items,
        couponCode: appliedCoupon?.code || effectiveFreeDeliveryCoupon?.code || '',
        freeDeliveryApplied: effectiveFreeDelivery,
        freeDeliveryCouponId: effectiveFreeDeliveryCoupon?.id || '',
        deliveryZoneId: selectedZone?.id || 'dhaka',
        paymentMethod,
        ...(paymentDetails ? { paymentDetails } : {}),
      });

      if (!result.success || !result.orderId) {
        throw new Error(result.error || 'Failed to place order.');
      }

      // Clear cart and navigate to confirmation
      clearCart();
      onNavigate(`/order-confirmation?id=${encodeURIComponent(result.orderId || '')}&number=${encodeURIComponent(result.orderNumber || '')}`);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Failed to place order. Please review your details and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getActiveGateway = () => {
    switch (onlineGateway) {
      case 'bkash':
        return paymentSettings.bkash;
      case 'nagad':
        return paymentSettings.nagad;
      case 'rocket':
        return paymentSettings.rocket;
      default:
        return paymentSettings.bkash;
    }
  };

  const activeGateway = getActiveGateway();

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-14">
      
      {/* Back button & Page Title */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => onNavigate('/shop')}
          className="p-2 text-neutral-500 hover:text-black rounded-lg hover:bg-neutral-100 transition-colors cursor-pointer"
          aria-label="Back to store"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <span className="text-[11px] font-bold uppercase tracking-widest text-neutral-400">Order Checkout</span>
          <h1 className="text-2xl sm:text-3xl font-extrabold uppercase tracking-tight text-neutral-900">
            Shipping & Payment
          </h1>
        </div>
      </div>

      <form onSubmit={handleSubmitOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Column: Form Fields */}
        <div className="lg:col-span-7 space-y-6">
          
          <div className="bg-white border border-neutral-200 rounded-2xl p-5 sm:p-7 shadow-xs space-y-6">
            
            {/* Error Message */}
            {errorMessage && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* SECTION 1: Customer Contact */}
            <div className="space-y-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-black text-white text-[10px] flex items-center justify-center font-bold">1</span>
                <span>Contact Details</span>
              </h2>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FloatingInput
                  label="Full Name *"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your full name"
                />

                <FloatingInput
                  label="Mobile Phone *"
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="01XXXXXXXXX"
                  className="font-mono"
                />
              </div>

              <FloatingInput
                label="Email Address (For invoice & updates)"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
              />
            </div>

            {/* SECTION 2: Shipping Address */}
            <div className="space-y-4 pt-5 border-t border-neutral-200">
              <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-black text-white text-[10px] flex items-center justify-center font-bold">2</span>
                <span>Delivery Address</span>
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FloatingSelect
                  label="Division *"
                  value={division}
                  onChange={(e) => {
                    const nextDiv = e.target.value;
                    setDivision(nextDiv);
                    const divDistricts = BD_DISTRICTS_BY_DIVISION[nextDiv] || [];
                    const defaultDistrict = divDistricts[0] || nextDiv;
                    setDistrict(defaultDistrict);
                    if (nextDiv === 'Dhaka' && defaultDistrict === 'Dhaka') {
                      const dhakaZone = deliveryZones.find((z) => z.id === 'dhaka') || deliveryZones[0];
                      if (dhakaZone) setSelectedZone(dhakaZone);
                    } else {
                      const outsideZone = deliveryZones.find((z) => z.id === 'outside-dhaka') || deliveryZones[1] || deliveryZones[0];
                      if (outsideZone) setSelectedZone(outsideZone);
                    }
                  }}
                >
                  {BD_DIVISIONS.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </FloatingSelect>

                <FloatingSelect
                  label="District *"
                  value={district}
                  onChange={(e) => {
                    const nextDist = e.target.value;
                    setDistrict(nextDist);
                    if (division === 'Dhaka' && nextDist === 'Dhaka') {
                      const dhakaZone = deliveryZones.find((z) => z.id === 'dhaka') || deliveryZones[0];
                      if (dhakaZone) setSelectedZone(dhakaZone);
                    } else {
                      const outsideZone = deliveryZones.find((z) => z.id === 'outside-dhaka') || deliveryZones[1] || deliveryZones[0];
                      if (outsideZone) setSelectedZone(outsideZone);
                    }
                  }}
                >
                  {(BD_DISTRICTS_BY_DIVISION[division] || [district]).map((dist) => (
                    <option key={dist} value={dist}>{dist}</option>
                  ))}
                </FloatingSelect>
              </div>

              <FloatingTextarea
                label="Full Street Address & House No. *"
                required
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="House #, Road #, Sector / Area, Landmark..."
              />

              <FloatingInput
                label="Delivery Notes (Optional)"
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Call before arrival, leave with concierge"
              />
            </div>

            {/* SECTION 3: Shipping Zone */}
            <div className="space-y-4 pt-5 border-t border-neutral-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-black text-white text-[10px] flex items-center justify-center font-bold">3</span>
                  <span>Shipping Zone</span>
                </h2>
                {effectiveFreeDelivery && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full">
                    <Truck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>
                      One-Time Free Delivery Applied! {effectiveFreeDeliveryCoupon?.code ? `(${effectiveFreeDeliveryCoupon.code})` : ''}
                    </span>
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3">
                {[...deliveryZones]
                  .sort((a, b) => {
                    const aInside = a.id === 'dhaka' || a.name.toLowerCase().includes('inside');
                    const bInside = b.id === 'dhaka' || b.name.toLowerCase().includes('inside');
                    if (aInside && !bInside) return -1;
                    if (!aInside && bInside) return 1;
                    const aOutside = a.id === 'outside-dhaka' || a.name.toLowerCase().includes('outside');
                    const bOutside = b.id === 'outside-dhaka' || b.name.toLowerCase().includes('outside');
                    if (aOutside && !bOutside) return -1;
                    if (!aOutside && bOutside) return 1;
                    return 0;
                  })
                  .map((zone) => {
                    const isInside = zone.id === 'dhaka' || zone.name.toLowerCase().includes('inside');
                    const isSelected = selectedZone?.id === zone.id;
                    const zoneTitle = isInside ? 'Inside Dhaka' : 'Outside Dhaka';
                    const zoneSubtext = isInside
                      ? 'Fast home delivery across Dhaka city within 24–48 hours.'
                      : 'Nationwide courier doorstep delivery across all 64 districts.';

                    return (
                      <label
                        key={zone.id}
                        className={`relative flex items-start gap-3 p-4 rounded-xl cursor-pointer border transition-all duration-200 ${
                          isSelected
                            ? 'border-neutral-900 bg-neutral-50/90 ring-1 ring-neutral-900 shadow-xs'
                            : 'border-neutral-200 bg-white hover:border-neutral-400 hover:bg-neutral-50/30'
                        }`}
                      >
                        <input
                          type="radio"
                          name="deliveryZone"
                          checked={isSelected}
                          onChange={() => setSelectedZone(zone)}
                          className="mt-1 accent-black cursor-pointer shrink-0"
                        />
                        <div className="flex-1 flex items-start justify-between gap-3 text-xs">
                          <div>
                            <p className="font-bold text-neutral-900 text-sm tracking-tight">{zoneTitle}</p>
                            <p className="text-[11px] text-neutral-500 mt-0.5">{zoneSubtext}</p>
                          </div>
                          {effectiveFreeDelivery ? (
                            <div className="text-right shrink-0">
                              <span className="text-[10px] text-neutral-400 line-through font-mono mr-1.5">৳{zone.charge}</span>
                              <span className="font-black text-emerald-700 text-sm uppercase">FREE</span>
                            </div>
                          ) : (
                            <span className="font-black text-neutral-900 text-base font-mono shrink-0">
                              ৳{zone.charge}
                            </span>
                          )}
                        </div>
                      </label>
                    );
                  })}
              </div>
            </div>

            {/* SECTION 4: Payment Method Selection */}
            <div className="space-y-4 pt-5 border-t border-neutral-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900 flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-black text-white text-[10px] flex items-center justify-center font-bold">4</span>
                  <span>Payment Method</span>
                </h2>
                {paymentSettings.onlineDiscountActive && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full">
                    <Sparkles className="w-3 h-3 text-emerald-600" />
                    <span>Save {paymentSettings.onlineDiscountType === 'percentage' ? `${paymentSettings.onlineDiscountValue}%` : `৳${paymentSettings.onlineDiscountValue}`} with Online Payment</span>
                  </span>
                )}
              </div>

              {/* Two Primary Options Stacked Vertically: Cash on Delivery & Online Payment */}
              <div className="grid grid-cols-1 gap-3">
                
                {/* 1. Cash on Delivery */}
                <div
                  onClick={() => setPaymentMode('cod')}
                  className={`p-4 border rounded-xl cursor-pointer transition-all flex items-start gap-3 select-none ${
                    paymentMode === 'cod' 
                      ? 'border-black bg-neutral-50 ring-2 ring-black' 
                      : 'border-neutral-200 bg-white hover:border-neutral-400'
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentModeSelector"
                    checked={paymentMode === 'cod'}
                    onChange={() => setPaymentMode('cod')}
                    className="mt-1 accent-black cursor-pointer"
                  />
                  <div className="text-xs flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-neutral-900 text-sm">Cash on Delivery</span>
                      {effectiveDeliveryCharge === 0 ? (
                        <span className="text-[10px] uppercase font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">
                          ৳0 Advance
                        </span>
                      ) : (
                        <span className="text-[10px] uppercase font-bold text-neutral-700 bg-neutral-200/90 px-2 py-0.5 rounded">
                          ৳{effectiveDeliveryCharge} Advance
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-neutral-500 mt-1">
                      {effectiveDeliveryCharge === 0
                        ? `One-Time Free Delivery applied! No advance payment needed—pay ৳${Math.max(0, subtotal - discount).toLocaleString('en-BD')} in cash upon parcel delivery.`
                        : `Pay ৳${effectiveDeliveryCharge} delivery fee in advance via bKash/Nagad/Rocket; pay garment total of ৳${Math.max(0, subtotal - discount)} upon parcel delivery.`}
                    </p>
                  </div>
                </div>

                {/* 2. Online Payment (bKash / Nagad / Rocket) */}
                <div
                  onClick={() => setPaymentMode('online')}
                  className={`p-4 border rounded-xl cursor-pointer transition-all flex items-start gap-3 select-none ${
                    paymentMode === 'online' 
                      ? 'border-black bg-neutral-50 ring-2 ring-black' 
                      : 'border-neutral-200 bg-white hover:border-neutral-400'
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentModeSelector"
                    checked={paymentMode === 'online'}
                    onChange={() => setPaymentMode('online')}
                    className="mt-1 accent-black cursor-pointer"
                  />
                  <div className="text-xs flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="font-bold text-neutral-900 text-sm">Online Payment</span>
                        <div className="flex items-center gap-1.5">
                          <img src={MFS_LOGOS.bkash} alt="bKash" className="w-5 h-5 rounded object-cover border border-neutral-200" />
                          <img src={MFS_LOGOS.nagad} alt="Nagad" className="w-5 h-5 rounded object-cover border border-neutral-200" />
                          <img src={MFS_LOGOS.rocket} alt="Rocket" className="h-5 w-7 rounded object-cover border border-neutral-200" />
                        </div>
                      </div>
                      {paymentSettings.onlineDiscountActive && (
                        <span className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded-full font-bold">
                          Save {paymentSettings.onlineDiscountType === 'percentage' ? `${paymentSettings.onlineDiscountValue}%` : `৳${paymentSettings.onlineDiscountValue}`}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-neutral-500 mt-1">
                      Pay online via bKash, Nagad, or Rocket with {paymentSettings.onlineDiscountActive ? `${paymentSettings.onlineDiscountType === 'percentage' ? `${paymentSettings.onlineDiscountValue}%` : `৳${paymentSettings.onlineDiscountValue}`} discount` : 'instant confirmation'}; ৳0 due at delivery.
                    </p>
                  </div>
                </div>

              </div>

              {/* COD Free Delivery Confirmation Card (No advance MFS required!) */}
              {paymentMode === 'cod' && effectiveDeliveryCharge === 0 && (
                <div className="p-4 sm:p-5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3 text-xs text-emerald-900">
                  <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-sm text-emerald-950">
                      Cash on Delivery Ready — ৳0 Advance Required
                    </p>
                    <p className="text-[11px] text-emerald-800 mt-0.5 leading-relaxed">
                      Your one-time Free Delivery reward{effectiveFreeDeliveryCoupon?.code ? ` (${effectiveFreeDeliveryCoupon.code})` : ''} covers the ৳{baseDeliveryCharge} courier fee. Simply click <b>"Confirm & Place Order"</b> and pay <b>৳{Math.max(0, subtotal - discount).toLocaleString('en-BD')}</b> to the courier when your parcel arrives.
                    </p>
                  </div>
                </div>
              )}

              {/* Digital Gateway Payment Box (For COD with delivery fee > 0 OR Online Payment) */}
              {activeGateway && needsAdvancePayment && (
                <div className="p-5 sm:p-6 bg-neutral-50/90 border border-neutral-300 rounded-2xl shadow-xs space-y-5 animate-fade-in transition-all">
                  
                  {/* Mode Banner */}
                  <div className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
                    paymentMode === 'cod'
                      ? 'bg-amber-50/80 border-amber-200 text-amber-900'
                      : 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                  }`}>
                    <div>
                      <p className="font-bold text-sm">
                        {paymentMode === 'cod'
                          ? `Pay ৳${effectiveDeliveryCharge} Delivery Charge to Confirm Order`
                          : `Online Payment Total: ৳${finalPayableTotal.toLocaleString('en-BD')}`}
                      </p>
                      <p className="text-[11px] mt-0.5 opacity-90">
                        {paymentMode === 'cod'
                          ? `Remaining balance of ৳${Math.max(0, subtotal - discount).toLocaleString('en-BD')} will be collected in cash by the courier upon delivery.`
                          : `You save ৳${onlineDiscount} with online payment. ৳0 will be payable upon delivery.`}
                      </p>
                    </div>
                  </div>

                  {/* Gateway Selector Dropdown (bKash / Nagad / Rocket with Official Logos) */}
                  <div className="relative" ref={gatewayDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setGatewayDropdownOpen((prev) => !prev)}
                      aria-expanded={gatewayDropdownOpen}
                      aria-haspopup="listbox"
                      className={`w-full h-12 px-3.5 bg-white border rounded-[6px] flex items-center justify-between text-sm font-semibold text-neutral-900 transition-colors cursor-pointer ${
                        gatewayDropdownOpen ? 'border-neutral-900' : 'border-neutral-400 hover:border-neutral-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <img
                          src={MFS_LOGOS[onlineGateway]}
                          alt={onlineGateway}
                          className={`${onlineGateway === 'rocket' ? 'h-6 w-8' : 'w-6 h-6'} rounded object-cover border border-neutral-200 shrink-0`}
                        />
                        <span>
                          {onlineGateway === 'bkash' ? 'bKash' : onlineGateway === 'nagad' ? 'Nagad' : 'Rocket'}
                        </span>
                      </div>
                      <ChevronDown
                        className={`w-4 h-4 text-neutral-600 transition-transform duration-200 ${
                          gatewayDropdownOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    <span className="pointer-events-none absolute -top-2.5 left-3 px-1.5 text-[11px] font-medium text-neutral-900 bg-[linear-gradient(to_bottom,#fafafa_50%,#ffffff_50%)] leading-none">
                      Select Payment Method *
                    </span>

                    {gatewayDropdownOpen && (
                      <div
                        role="listbox"
                        className="absolute left-0 right-0 mt-1.5 bg-white border border-neutral-300 rounded-[8px] shadow-xl overflow-hidden z-30 animate-fade-in"
                      >
                        {(['bkash', 'nagad', 'rocket'] as const)
                          .filter((gw) => paymentSettings[gw].enabled)
                          .map((gw) => {
                            const isSelected = onlineGateway === gw;
                            const label = gw === 'bkash' ? 'bKash' : gw === 'nagad' ? 'Nagad' : 'Rocket';
                            return (
                              <button
                                key={gw}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                onClick={() => {
                                  setOnlineGateway(gw);
                                  setGatewayDropdownOpen(false);
                                }}
                                className={`w-full px-3.5 py-2.5 flex items-center justify-between text-xs sm:text-sm transition-colors cursor-pointer ${
                                  isSelected
                                    ? 'bg-neutral-100 font-bold text-neutral-900'
                                    : 'bg-white font-medium text-neutral-700 hover:bg-neutral-50'
                                }`}
                              >
                                <div className="flex items-center gap-2.5">
                                  <img
                                    src={MFS_LOGOS[gw]}
                                    alt={label}
                                    className={`${gw === 'rocket' ? 'h-6 w-8' : 'w-6 h-6'} rounded object-cover border border-neutral-200 shrink-0`}
                                  />
                                  <span>{label}</span>
                                </div>
                                {isSelected && <Check className="w-4 h-4 text-black shrink-0" />}
                              </button>
                            );
                          })}
                      </div>
                    )}
                  </div>

                  {/* Gateway Header & Prominent Account Number Box */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 bg-white rounded-xl border border-neutral-200 shadow-2xs">
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={MFS_LOGOS[onlineGateway]}
                        alt={onlineGateway.toUpperCase()}
                        className={`${onlineGateway === 'rocket' ? 'w-11 h-8' : 'w-9 h-9'} rounded-lg object-cover border border-neutral-200 shrink-0`}
                      />
                      <div className="min-w-0">
                        <span className="text-[10px] uppercase font-bold tracking-widest text-neutral-500 block">
                          {onlineGateway.toUpperCase()} Official Account
                        </span>
                        <p className="text-[13px] sm:text-sm font-extrabold text-neutral-900 mt-0.5 leading-snug">
                          {activeGateway.accountType}
                        </p>
                      </div>
                    </div>

                    {/* Copy Button Box */}
                    <div className="flex items-center justify-between sm:justify-end gap-2.5 bg-neutral-50 px-3.5 py-2 rounded-xl border border-neutral-300 shrink-0">
                      <span className="font-mono font-extrabold text-sm sm:text-[15px] text-neutral-900 tracking-wide whitespace-nowrap">
                        {activeGateway.number}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopyNumber(activeGateway.number)}
                        className="px-3 py-1.5 bg-black text-white text-[11px] font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 whitespace-nowrap"
                      >
                        {copiedNumber ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedNumber ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Net Amount to Send Alert */}
                  <div className="p-4 bg-white rounded-xl border border-neutral-200 flex items-center justify-between text-xs">
                    <div>
                      <p className="text-neutral-500 text-[11px] font-semibold">
                        {paymentMode === 'cod' ? 'Advance Delivery Charge to Send:' : 'Exact Total to Send:'}
                      </p>
                      <p className="text-xl font-black text-neutral-900">
                        ৳{(paymentMode === 'cod' ? effectiveDeliveryCharge : finalPayableTotal).toLocaleString('en-BD')}
                      </p>
                    </div>
                    {paymentMode === 'cod' ? (
                      <span className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
                        Due at Doorstep: ৳{Math.max(0, subtotal - discount).toLocaleString('en-BD')}
                      </span>
                    ) : (
                      onlineDiscount > 0 && (
                        <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>৳{onlineDiscount} Online Discount Included</span>
                        </span>
                      )
                    )}
                  </div>

                  {/* Step-by-Step Payment Instructions */}
                  <div className="space-y-2 bg-white p-4 rounded-xl border border-neutral-200">
                    <p className="font-bold text-neutral-900 uppercase text-[11px] flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-neutral-600" />
                      <span>How to Send Payment:</span>
                    </p>
                    <div className="space-y-1 text-xs text-neutral-600 leading-relaxed font-sans whitespace-pre-line pl-1">
                      {activeGateway.instructions || `1. Open your ${onlineGateway.toUpperCase()} app or dial the USSD code.\n2. Choose "Send Money".\n3. Enter the number shown above: ${activeGateway.number}\n4. Enter the exact Amount: ৳${paymentMode === 'cod' ? effectiveDeliveryCharge : finalPayableTotal}\n5. Complete the payment, then enter your Sender Number & TrxID below.`}
                    </div>
                  </div>

                  {/* Sender Number & Transaction ID Inputs */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                    <FloatingInput
                      label="Sender Mobile Number *"
                      labelBgClass="bg-[linear-gradient(to_bottom,#fafafa_50%,#ffffff_50%)]"
                      type="tel"
                      required
                      value={senderNumber}
                      onChange={(e) => setSenderNumber(e.target.value)}
                      placeholder="01XXXXXXXXX"
                      className="font-mono"
                    />

                    <FloatingInput
                      label="Transaction ID (TrxID) *"
                      labelBgClass="bg-[linear-gradient(to_bottom,#fafafa_50%,#ffffff_50%)]"
                      type="text"
                      required
                      value={transactionId}
                      onChange={(e) => setTransactionId(e.target.value.toUpperCase())}
                      placeholder="e.g. BKL7829XQ"
                      className="font-mono uppercase"
                    />
                  </div>

                  {/* Payment Proof Screenshot Upload (Safe Client Compression - 0 Storage Error) */}
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-700 mb-1.5">
                      Payment Screenshot Proof (Optional — Recommended for instant verification)
                    </label>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                      <label className="h-12 flex items-center gap-2 px-5 bg-white border border-neutral-300 hover:border-black rounded-xl text-xs font-semibold text-neutral-800 cursor-pointer transition-colors shadow-2xs">
                        <Upload className="w-4 h-4 text-neutral-500" />
                        <span>{proofFile ? 'Change Receipt Screenshot' : 'Upload Receipt Screenshot'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleProofChange}
                          className="hidden"
                        />
                      </label>
                      {proofPreview && (
                        <div className="flex items-center gap-2.5 bg-white p-1.5 pr-3 rounded-xl border border-neutral-300 shadow-2xs">
                          <img
                            src={proofPreview}
                            alt="Receipt Preview"
                            className="w-9 h-9 object-cover rounded-lg border border-neutral-200"
                          />
                          <span className="text-[11px] text-neutral-600 truncate max-w-xs">{proofFile?.name}</span>
                          <button
                            type="button"
                            onClick={() => { setProofFile(null); setProofPreview(''); }}
                            className="text-red-600 text-xs hover:underline cursor-pointer ml-1 font-semibold"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              )}

            </div>

          </div>

        </div>

        {/* Right Column: Order Summary & Confirmation Button */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-neutral-200 rounded-2xl p-5 sm:p-7 shadow-xs space-y-5 sticky top-24">
            
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900 pb-3 border-b border-neutral-200">
              Order Summary ({items.reduce((s, i) => s + i.quantity, 0)} Items)
            </h3>

            {/* Items mini-list */}
            <div className="max-h-60 overflow-y-auto divide-y divide-neutral-100 pr-1">
              {items.map((item, idx) => {
                const itemPrice = typeof item.salePrice === 'number' && item.salePrice > 0 ? item.salePrice : item.price;
                return (
                  <div key={`${item.productId}-${item.size}-${item.color}-${idx}`} className="py-2.5 flex items-center justify-between text-xs first:pt-0">
                    <div className="flex items-center gap-3">
                      <img
                        src={item.productImage || '/assets/aistudio/selvee1_8ff37f5b.jpg'}
                        alt={item.productName}
                        className="w-12 h-14 object-cover rounded-lg bg-neutral-100 border border-neutral-200"
                      />
                      <div>
                        <p className="font-semibold text-neutral-900 line-clamp-1">{item.productName}</p>
                        <p className="text-[11px] text-neutral-500">
                          {item.size} • {item.color} • Qty: {item.quantity}
                        </p>
                      </div>
                    </div>
                    <span className="font-bold text-neutral-900">
                      ৳{(itemPrice * item.quantity).toLocaleString('en-BD')}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Cost Breakdown */}
            <div className="space-y-2.5 pt-3 border-t border-neutral-200 text-xs">
              <div className="flex items-center justify-between text-neutral-600">
                <span>Subtotal</span>
                <span className="font-medium text-neutral-900">৳{subtotal.toLocaleString('en-BD')}</span>
              </div>

              {discount > 0 && (
                <div className="flex items-center justify-between text-emerald-700 font-medium">
                  <span>Coupon Discount ({appliedCoupon?.code})</span>
                  <span>-৳{discount.toLocaleString('en-BD')}</span>
                </div>
              )}

              {paymentMode === 'online' && onlineDiscount > 0 && (
                <div className="flex items-center justify-between text-emerald-700 font-medium">
                  <span>
                    Online Payment Discount
                    {paymentSettings.onlineDiscountType === 'percentage'
                      ? ` (${paymentSettings.onlineDiscountValue}%)`
                      : ''}
                  </span>
                  <span>-৳{onlineDiscount.toLocaleString('en-BD')}</span>
                </div>
              )}

              <div className="flex items-center justify-between text-neutral-600">
                <span>
                  Delivery Fee ({selectedZone?.id === 'dhaka' || selectedZone?.name.toLowerCase().includes('inside') ? 'Inside Dhaka' : 'Outside Dhaka'})
                </span>
                {effectiveFreeDelivery ? (
                  <span className="font-bold text-emerald-700">
                    <span className="line-through text-neutral-400 mr-1.5 font-normal">৳{baseDeliveryCharge}</span>
                    FREE
                  </span>
                ) : (
                  <span className="font-medium text-neutral-900">৳{effectiveDeliveryCharge.toLocaleString('en-BD')}</span>
                )}
              </div>

              {/* Minimal Totals & Method Summary */}
              {paymentMode === 'cod' ? (
                <>
                  {effectiveDeliveryCharge > 0 && (
                    <div className="flex items-center justify-between text-neutral-600">
                      <span>Advance Delivery Fee</span>
                      <span className="font-medium text-neutral-900">
                        -৳{effectiveDeliveryCharge.toLocaleString('en-BD')}
                      </span>
                    </div>
                  )}

                  <div className="pt-3 mt-1 border-t border-neutral-200 space-y-2">
                    <div className="flex items-center justify-between text-xs text-neutral-500">
                      <span>Payment Method</span>
                      <span className="font-medium text-neutral-800">
                        {effectiveDeliveryCharge === 0
                          ? 'Cash on Delivery'
                          : `COD (${onlineGateway === 'bkash' ? 'bKash' : onlineGateway === 'nagad' ? 'Nagad' : 'Rocket'} Advance)`}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-base font-bold text-neutral-900 pt-2 border-t border-neutral-100">
                      <span>Due on Delivery</span>
                      <span>৳{Math.max(0, subtotal - discount).toLocaleString('en-BD')}</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="pt-3 mt-1 border-t border-neutral-200 space-y-2">
                  <div className="flex items-center justify-between text-xs text-neutral-500">
                    <span>Payment Method</span>
                    <span className="font-medium text-neutral-800">
                      Online Payment ({onlineGateway === 'bkash' ? 'bKash' : onlineGateway === 'nagad' ? 'Nagad' : 'Rocket'})
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-neutral-500">
                    <span>Due on Delivery</span>
                    <span className="font-medium text-neutral-900">৳0</span>
                  </div>

                  <div className="flex items-center justify-between text-base font-bold text-neutral-900 pt-2 border-t border-neutral-100">
                    <span>Total Payable</span>
                    <span>৳{finalPayableTotal.toLocaleString('en-BD')}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-4 bg-black text-white text-xs font-bold uppercase tracking-widest rounded-xl hover:bg-neutral-800 transition-colors flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              <span>{isSubmitting ? 'Confirming Order...' : 'Confirm & Place Order'}</span>
            </button>

            {/* Trust badge */}
            <div className="text-center pt-2">
              <p className="text-[11px] text-neutral-400 flex items-center justify-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-neutral-500" />
                <span>100% Secure Checkout • Authentic Quality Guarantee</span>
              </p>
            </div>

          </div>
        </div>

      </form>

    </div>
  );
};
