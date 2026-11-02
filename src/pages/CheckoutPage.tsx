import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Truck, 
  ShoppingBag, 
  ArrowLeft, 
  CheckCircle, 
  AlertCircle,
  Lock,
  Tag
} from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { orderService } from '../services/orderService';
import { ShippingAddress } from '../types';

interface CheckoutPageProps {
  onNavigate: (route: string) => void;
}

const BD_DIVISIONS = [
  'Dhaka',
  'Chittagong',
  'Rajshahi',
  'Khulna',
  'Barisal',
  'Sylhet',
  'Rangpur',
  'Mymensingh',
];

export const CheckoutPage: React.FC<CheckoutPageProps> = ({ onNavigate }) => {
  const { 
    items, 
    subtotal, 
    discount, 
    deliveryCharge, 
    grandTotal, 
    appliedCoupon, 
    deliveryZones,
    selectedZone,
    setSelectedZone,
    clearCart 
  } = useCart();
  const { currentUser, customerProfile } = useAuth();

  // Form Fields
  const [fullName, setFullName] = useState(customerProfile?.name || currentUser?.displayName || '');
  const [phone, setPhone] = useState(customerProfile?.phone || '');
  const [email, setEmail] = useState(currentUser?.email || '');
  const [address, setAddress] = useState(customerProfile?.address || '');
  const [division, setDivision] = useState('Dhaka');
  const [district, setDistrict] = useState(customerProfile?.city || 'Dhaka');
  const [notes, setNotes] = useState('');
  
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'bkash'>('cod');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (items.length === 0) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <ShoppingBag className="w-12 h-12 text-neutral-300 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-neutral-900 mb-2">Your Bag is Empty</h2>
        <p className="text-xs text-neutral-500 mb-6">You have no items in your cart to proceed with checkout.</p>
        <button
          onClick={() => onNavigate('/shop')}
          className="px-6 py-2.5 bg-black text-white text-xs font-semibold uppercase tracking-wider rounded-lg cursor-pointer"
        >
          Return to Shop
        </button>
      </div>
    );
  }

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    // Bangladeshi Phone validation
    const cleanPhone = phone.trim().replace(/[^0-9+]/g, '');
    if (!cleanPhone || cleanPhone.length < 11) {
      setErrorMessage('Please enter a valid Bangladeshi mobile number (e.g. 01700-000000).');
      return;
    }

    if (!address.trim()) {
      setErrorMessage('Please enter your full delivery address.');
      return;
    }

    setIsSubmitting(true);

    const shippingAddress: ShippingAddress = {
      fullName: fullName.trim(),
      phone: cleanPhone,
      email: email.trim() || '',
      address: address.trim(),
      division,
      district: district.trim(),
      notes: notes.trim() || '',
    };

    try {
      const res = await orderService.createOrder({
        customerId: currentUser?.uid || 'guest',
        customerName: fullName.trim(),
        customerPhone: cleanPhone,
        customerEmail: email.trim() || '',
        shippingAddress,
        items,
        couponCode: appliedCoupon?.code || '',
        deliveryZoneId: selectedZone?.id || 'dhaka',
        paymentMethod: 'cod',
      });

      if (!res.success) {
        setErrorMessage(res.error || 'Failed to place order.');
        setIsSubmitting(false);
        return;
      }

      // Success! Clear cart and navigate to confirmation
      clearCart();
      onNavigate(`/order-confirmation?id=${res.orderId}&number=${res.orderNumber}`);
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
      
      {/* Back button */}
      <div className="mb-6">
        <button
          onClick={() => onNavigate('/shop')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-500 hover:text-black cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Continue Shopping</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
        
        {/* Left: Customer Information & Delivery Form (7 cols) */}
        <div className="lg:col-span-7">
          <form onSubmit={handleSubmitOrder} className="space-y-6">
            
            {/* Header */}
            <div className="border-b border-neutral-200 pb-4">
              <h1 className="text-xl sm:text-2xl font-bold uppercase tracking-tight text-neutral-900">
                Checkout & Shipping
              </h1>
              <p className="text-xs text-neutral-500 mt-1">
                Please enter your delivery details. No upfront payment required for Cash on Delivery.
              </p>
            </div>

            {errorMessage && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Customer Contact */}
            <div className="space-y-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900">1. Contact Information</h2>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-700 mb-1">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Tanvir Ahmed"
                    className="w-full px-3.5 py-2.5 text-xs bg-white border border-neutral-300 rounded-lg focus:outline-none focus:border-black"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-700 mb-1">
                    Mobile Phone (01XXXXXXXXX) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="01700-000000"
                    className="w-full px-3.5 py-2.5 text-xs bg-white border border-neutral-300 rounded-lg focus:outline-none focus:border-black"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-700 mb-1">
                  Email Address (For invoice & tracking updates)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. name@example.com"
                  className="w-full px-3.5 py-2.5 text-xs bg-white border border-neutral-300 rounded-lg focus:outline-none focus:border-black"
                />
              </div>
            </div>

            {/* Shipping Address */}
            <div className="space-y-4 pt-4 border-t border-neutral-200">
              <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900">2. Delivery Address</h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-700 mb-1">
                    Division <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={division}
                    onChange={(e) => {
                      setDivision(e.target.value);
                      if (e.target.value === 'Dhaka') {
                        const dhakaZone = deliveryZones.find((z) => z.id === 'dhaka') || deliveryZones[0];
                        if (dhakaZone) setSelectedZone(dhakaZone);
                      } else {
                        const outsideZone = deliveryZones.find((z) => z.id === 'outside-dhaka') || deliveryZones[1] || deliveryZones[0];
                        if (outsideZone) setSelectedZone(outsideZone);
                      }
                    }}
                    className="w-full px-3.5 py-2.5 text-xs bg-white border border-neutral-300 rounded-lg focus:outline-none focus:border-black cursor-pointer"
                  >
                    {BD_DIVISIONS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-700 mb-1">
                    District / City <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    placeholder="e.g. Dhaka North / Mirpur / Chattogram"
                    className="w-full px-3.5 py-2.5 text-xs bg-white border border-neutral-300 rounded-lg focus:outline-none focus:border-black"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-700 mb-1">
                  Full Street Address & Holding / Flat No. <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="House #, Road #, Sector/Area, Landmarked location..."
                  className="w-full px-3.5 py-2.5 text-xs bg-white border border-neutral-300 rounded-lg focus:outline-none focus:border-black"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-neutral-700 mb-1">
                  Delivery Instructions / Notes (Optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Call before arrival, leave with security..."
                  className="w-full px-3.5 py-2.5 text-xs bg-white border border-neutral-300 rounded-lg focus:outline-none focus:border-black"
                />
              </div>
            </div>

            {/* Delivery Zone Options */}
            <div className="space-y-4 pt-4 border-t border-neutral-200">
              <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900">3. Shipping Zone</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {deliveryZones.map((zone) => (
                  <label
                    key={zone.id}
                    className={`flex items-start gap-3 p-3.5 border rounded-lg cursor-pointer transition-all ${
                      selectedZone?.id === zone.id
                        ? 'border-black bg-neutral-50 ring-1 ring-black'
                        : 'border-neutral-200 bg-white hover:border-neutral-400'
                    }`}
                  >
                    <input
                      type="radio"
                      name="deliveryZone"
                      checked={selectedZone?.id === zone.id}
                      onChange={() => setSelectedZone(zone)}
                      className="mt-0.5 accent-black"
                    />
                    <div className="text-xs">
                      <p className="font-bold text-neutral-900">{zone.name}</p>
                      <p className="text-neutral-500 text-[11px] mt-0.5">{zone.estimatedDays}</p>
                      <p className="font-semibold text-neutral-900 mt-1">৳{zone.charge}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Payment Method */}
            <div className="space-y-4 pt-4 border-t border-neutral-200">
              <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-900">4. Payment Method</h2>
              <div className="p-4 border-2 border-black rounded-lg bg-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full border-4 border-black flex items-center justify-center shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-neutral-900">Cash on Delivery (COD)</p>
                    <p className="text-[11px] text-neutral-500">Pay cash in hand upon receiving and inspecting your package</p>
                  </div>
                </div>
                <span className="text-[11px] font-bold bg-neutral-100 text-neutral-800 px-2 py-0.5 rounded">Default</span>
              </div>
            </div>

            {/* Submit Action */}
            <div className="pt-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-4 bg-black text-white text-xs font-bold uppercase tracking-widest rounded-lg hover:bg-neutral-800 transition-colors shadow-xl disabled:bg-neutral-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
              >
                <Lock className="w-4 h-4" />
                <span>{isSubmitting ? 'Processing Order...' : `Confirm Order (৳${grandTotal.toLocaleString('en-BD')})`}</span>
              </button>
              <p className="text-[11px] text-neutral-400 text-center mt-2">
                🔒 Safe & encrypted. Your contact details are never shared with third parties.
              </p>
            </div>

          </form>
        </div>

        {/* Right: Order Summary Breakdown (5 cols) */}
        <div className="lg:col-span-5">
          <div className="bg-neutral-50 border border-neutral-200 rounded-xl p-5 sm:p-6 sticky top-28 space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900 border-b border-neutral-200 pb-3">
              Order Summary ({items.reduce((s, i) => s + i.quantity, 0)} items)
            </h3>

            {/* Items list */}
            <div className="max-h-72 overflow-y-auto divide-y divide-neutral-200 pr-1">
              {items.map((item, idx) => {
                const itemPrice = typeof item.salePrice === 'number' && item.salePrice > 0 ? item.salePrice : item.price;
                return (
                  <div key={idx} className="py-3 flex gap-3 text-xs first:pt-0">
                    <img
                      src={item.productImage || '/logo.jpg'}
                      alt={item.productName}
                      className="w-14 h-18 object-cover rounded bg-white border border-neutral-200 shrink-0"
                    />
                    <div className="flex-1 flex flex-col justify-between">
                      <div>
                        <p className="font-semibold text-neutral-900 line-clamp-1">{item.productName}</p>
                        <p className="text-[11px] text-neutral-500 mt-0.5">
                          Size: {item.size} • Color: {item.color}
                        </p>
                      </div>
                      <div className="flex justify-between items-baseline">
                        <span className="text-[11px] text-neutral-500">Qty: {item.quantity}</span>
                        <span className="font-bold text-neutral-900">
                          ৳{(itemPrice * item.quantity).toLocaleString('en-BD')}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Totals */}
            <div className="border-t border-neutral-200 pt-3 space-y-2 text-xs">
              <div className="flex justify-between text-neutral-600">
                <span>Subtotal</span>
                <span>৳{subtotal.toLocaleString('en-BD')}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between text-emerald-700 font-semibold">
                  <span>Coupon Discount ({appliedCoupon?.code})</span>
                  <span>-৳{discount.toLocaleString('en-BD')}</span>
                </div>
              )}
              <div className="flex justify-between text-neutral-600">
                <span>Delivery Charge ({selectedZone?.name})</span>
                <span>৳{deliveryCharge.toLocaleString('en-BD')}</span>
              </div>
              <div className="flex justify-between text-base font-extrabold text-neutral-900 pt-2 border-t border-neutral-200">
                <span>Grand Total</span>
                <span>৳{grandTotal.toLocaleString('en-BD')}</span>
              </div>
            </div>

            <div className="pt-2 text-[11px] text-neutral-500 space-y-1">
              <p className="flex items-center gap-1.5">
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                <span>No advance card charge required</span>
              </p>
              <p className="flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-neutral-600" />
                <span>Estimated dispatch within 24 hours</span>
              </p>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};
