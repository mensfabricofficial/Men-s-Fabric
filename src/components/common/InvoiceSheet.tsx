import React from 'react';
import { Order } from '../../types';
import { BrandLogo } from './BrandLogo';
import { getLocalSettings } from '../../services/settingsService';

interface InvoiceSheetProps {
  order: Order;
}

export const getFormattedInvoiceNumber = (orderNumber?: string, fallbackId?: string): string => {
  const raw = (orderNumber || fallbackId || '000000').trim();
  const clean = raw.replace(/^#/, '').trim();
  if (/^INV-/i.test(clean)) return clean.toUpperCase();
  return `INV-${clean}`;
};

export const InvoiceSheet: React.FC<InvoiceSheetProps> = ({ order }) => {
  const settings = getLocalSettings();
  const cleanOrderNum = (order.orderNumber || order.id || '').replace(/^#/, '').trim();
  const displayOrderNumber = cleanOrderNum ? `#${cleanOrderNum}` : '#N/A';
  const invoiceNumber = getFormattedInvoiceNumber(order.orderNumber, order.id);

  const isCod = order.paymentMethod === 'cod';
  const isFreeDelivery = order.deliveryCharge === 0 || Boolean(order.freeDeliveryApplied);
  const advancePaid = Boolean(order.advanceDeliveryPaid) && (order.advanceAmount || 0) > 0;
  const advanceAmount = advancePaid ? (order.advanceAmount ?? order.deliveryCharge) : 0;
  const dueOnDelivery =
    order.dueOnDelivery !== undefined
      ? order.dueOnDelivery
      : isCod
      ? Math.max(0, (order.subtotal || 0) - (order.discount || 0) + (advancePaid ? 0 : (order.deliveryCharge || 0)))
      : 0;

  const totalUnits = (order.items || []).reduce((sum, item) => sum + (item.quantity || 1), 0);

  const orderDateObj = (() => {
    try {
      if (order.createdAt?.toDate) return order.createdAt.toDate();
      if (order.createdAt?.seconds) return new Date(order.createdAt.seconds * 1000);
      if (typeof order.createdAt === 'string' || typeof order.createdAt === 'number') {
        const d = new Date(order.createdAt);
        if (!Number.isNaN(d.getTime())) return d;
      }
    } catch {
      // ignore
    }
    return new Date();
  })();

  const formattedDate = orderDateObj.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const formattedTime = orderDateObj.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const paymentStatusLabel =
    order.paymentStatus === 'paid'
      ? 'Paid in Full'
      : order.paymentStatus === 'refunded'
      ? 'Refunded'
      : order.paymentStatus === 'failed'
      ? 'Payment Failed'
      : isCod && advancePaid
      ? 'Advance Paid (COD)'
      : 'Payment Pending';

  const orderStatusLabel = (order.orderStatus || 'pending').replace(/-/g, ' ').toUpperCase();
  const storeAddress = settings.address || 'Dhaka, Bangladesh';
  const storePhone = settings.phone || '+880 1700-000000';
  const storeEmail = settings.email || 'mensfabricofficial@gmail.com';

  return (
    <div className="bg-white text-neutral-900 text-[11px] sm:text-xs leading-relaxed space-y-4 sm:space-y-5 w-full min-w-0">
      {/* 1. Executive Header Band */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b-2 border-neutral-900 pb-4">
        <div className="space-y-1 min-w-0">
          <BrandLogo variant="dark" imgClassName="h-7 sm:h-8 w-auto" />
          <p className="text-[11px] text-neutral-600 font-medium pt-1">
            {storeAddress}
          </p>
          <p className="text-[10px] text-neutral-500 break-words">
            Hotline: <span className="text-neutral-800 font-medium">{storePhone}</span>
            <span className="mx-1.5 text-neutral-300">|</span>
            Email: <span className="text-neutral-800 font-medium break-all">{storeEmail}</span>
          </p>
        </div>

        <div className="sm:text-right space-y-1 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-neutral-200">
          <div className="flex sm:justify-end items-center gap-2">
            <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-neutral-500 border border-neutral-300 px-2 py-0.5 rounded">
              Commercial Invoice
            </span>
            <span
              className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                order.paymentStatus === 'paid' || dueOnDelivery === 0
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-neutral-900 text-white'
              }`}
            >
              {order.paymentStatus === 'paid' || dueOnDelivery === 0 ? 'PAID' : isCod ? 'COD' : 'UNPAID'}
            </span>
          </div>
          <p className="text-lg sm:text-xl font-black font-mono tracking-tight text-neutral-900 pt-0.5 tabular-nums">
            {invoiceNumber}
          </p>
          <p className="text-[10px] text-neutral-500 tabular-nums">
            Currency: <span className="font-semibold text-neutral-800">BDT (৳)</span>
          </p>
        </div>
      </div>

      {/* 2. Key Reference Metadata Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3 bg-neutral-50 border border-neutral-200 rounded-xl p-3 sm:p-3.5">
        <div className="min-w-0">
          <span className="block text-[9px] font-bold uppercase tracking-widest text-neutral-400">
            Order Number
          </span>
          <p className="font-mono font-bold text-neutral-900 text-xs truncate tabular-nums">
            {displayOrderNumber}
          </p>
        </div>
        <div className="min-w-0">
          <span className="block text-[9px] font-bold uppercase tracking-widest text-neutral-400">
            Issue Date &amp; Time
          </span>
          <p className="font-semibold text-neutral-900 text-[11px] sm:text-xs tabular-nums">
            {formattedDate}
          </p>
          <p className="text-[10px] text-neutral-500 tabular-nums">{formattedTime}</p>
        </div>
        <div className="min-w-0">
          <span className="block text-[9px] font-bold uppercase tracking-widest text-neutral-400">
            Order Status
          </span>
          <p className="font-bold text-neutral-900 text-[11px] sm:text-xs tracking-wide">
            {orderStatusLabel}
          </p>
        </div>
        <div className="min-w-0">
          <span className="block text-[9px] font-bold uppercase tracking-widest text-neutral-400">
            Delivery Zone
          </span>
          <p className="font-semibold text-neutral-900 text-[11px] sm:text-xs truncate">
            {order.deliveryZone || order.shippingAddress?.district || 'Standard Express'}
          </p>
          <p className="text-[10px] text-neutral-500">
            {isFreeDelivery ? 'Complimentary Free Shipping' : 'Express Courier'}
          </p>
        </div>
      </div>

      {/* 3. Structured 2-Column Billing/Shipping & Payment Details */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {/* Billed & Shipped To Card */}
        <div className="border border-neutral-200 rounded-xl p-3.5 sm:p-4 bg-white space-y-1.5 min-w-0">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-1.5 mb-1">
            <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-neutral-400">
              Billed &amp; Shipped To
            </span>
          </div>
          <p className="font-bold text-neutral-900 text-xs sm:text-sm break-words">
            {order.customerName || 'Valued Customer'}
          </p>
          <p className="font-mono text-neutral-800 font-semibold text-xs tabular-nums">
            {order.customerPhone}
          </p>
          {order.customerEmail && (
            <p className="text-neutral-500 text-[11px] break-all">{order.customerEmail}</p>
          )}
          <div className="pt-1 text-neutral-700 text-[11px] leading-snug break-words">
            <p>{order.shippingAddress?.address}</p>
            {(order.shippingAddress?.upazila || order.shippingAddress?.district || order.shippingAddress?.division) && (
              <p className="text-neutral-600 font-medium">
                {[order.shippingAddress?.upazila, order.shippingAddress?.district, order.shippingAddress?.division].filter(Boolean).join(', ')}
              </p>
            )}
          </div>
          {order.shippingAddress?.notes && (
            <div className="mt-1.5 pt-1.5 border-t border-dashed border-neutral-200 text-[10px] text-neutral-600 italic break-words">
              Delivery Note: &ldquo;{order.shippingAddress.notes}&rdquo;
            </div>
          )}
        </div>

        {/* Payment & Settlement Card */}
        <div className="border border-neutral-200 rounded-xl p-3.5 sm:p-4 bg-white space-y-1.5 min-w-0">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-1.5 mb-1">
            <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-neutral-400">
              Payment &amp; Settlement
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-neutral-500 text-[11px]">Method</span>
            <span className="font-bold text-neutral-900 text-right">
              {isCod
                ? 'Cash on Delivery (COD)'
                : `${(order.paymentMethod || 'Online').toUpperCase()} Prepaid`}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-neutral-500 text-[11px]">Status</span>
            <span className="font-bold text-neutral-900 uppercase text-[11px] text-right">
              {paymentStatusLabel}
            </span>
          </div>
          {order.paymentDetails?.senderNumber && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-neutral-500 text-[11px]">Sender No</span>
              <span className="font-mono font-semibold text-neutral-800 text-[11px] tabular-nums break-all text-right">
                {order.paymentDetails.senderNumber}
              </span>
            </div>
          )}
          {order.paymentDetails?.transactionId && (
            <div className="flex items-center justify-between gap-2">
              <span className="text-neutral-500 text-[11px] shrink-0">TrxID</span>
              <span className="font-mono font-bold text-neutral-900 text-[11px] break-all text-right">
                {order.paymentDetails.transactionId}
              </span>
            </div>
          )}
          {isCod && advancePaid && (
            <div className="flex items-center justify-between gap-2 text-emerald-700 font-semibold">
              <span className="text-[11px]">
                Advance Paid{order.advanceGateway ? ` (${order.advanceGateway.toUpperCase()})` : ''}
              </span>
              <span className="font-mono tabular-nums">
                ৳{advanceAmount.toLocaleString('en-BD')}
              </span>
            </div>
          )}
          {isFreeDelivery && (
            <div className="flex items-center justify-between gap-2 text-emerald-700 font-semibold">
              <span className="text-[11px]">Shipping Benefit</span>
              <span className="text-[11px]">Complimentary Free Delivery</span>
            </div>
          )}
          <div className="pt-1.5 mt-1 border-t border-dashed border-neutral-200 flex items-center justify-between gap-2">
            <span className="font-bold text-neutral-700 text-[11px]">
              {isCod ? 'Cash Due on Delivery' : 'Balance Due'}
            </span>
            <span
              className={`font-mono font-black text-xs sm:text-sm tabular-nums ${
                dueOnDelivery === 0 ? 'text-emerald-700' : 'text-neutral-900'
              }`}
            >
              ৳{dueOnDelivery.toLocaleString('en-BD')}
            </span>
          </div>
        </div>
      </div>

      {/* 4A. Mobile View: Stacked Card Breakdown (Zero Horizontal Overflow on Phones) */}
      <div className="sm:hidden print:hidden border border-neutral-200 rounded-xl overflow-hidden">
        <div className="bg-neutral-900 text-white px-3.5 py-2.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
          <span>Itemized Order Details</span>
          <span className="tabular-nums">{totalUnits} {totalUnits === 1 ? 'Unit' : 'Units'}</span>
        </div>
        <div className="divide-y divide-neutral-200 bg-white">
          {(order.items || []).map((item, idx) => {
            const itemCode = item.productCode || item.sku;
            return (
              <div key={idx} className="p-3.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono font-bold text-neutral-400">
                        #{String(idx + 1).padStart(2, '0')}
                      </span>
                      <p className="font-bold text-neutral-900 text-xs leading-snug break-words">
                        {item.productName}
                      </p>
                    </div>
                    {itemCode && (
                      <p className="text-[10px] font-mono text-neutral-500">
                        SKU/Code: {itemCode}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-[10px] text-neutral-600">
                  <span className="bg-neutral-100 border border-neutral-200 px-2 py-0.5 rounded font-medium">
                    Size: <b className="text-neutral-900">{item.size}</b>
                  </span>
                  <span className="bg-neutral-100 border border-neutral-200 px-2 py-0.5 rounded font-medium">
                    Color: <b className="text-neutral-900">{item.color}</b>
                  </span>
                </div>

                <div className="flex items-center justify-between pt-1.5 border-t border-dashed border-neutral-100 text-[11px]">
                  <span className="text-neutral-600 font-mono tabular-nums">
                    {item.quantity} × ৳{(item.unitPrice || 0).toLocaleString('en-BD')}
                  </span>
                  <span className="font-mono font-extrabold text-neutral-900 text-xs tabular-nums">
                    ৳{(item.totalPrice || 0).toLocaleString('en-BD')}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4B. Desktop & A4 Print View: Crisp Executive 6-Column Table */}
      <div className="hidden sm:block print:block border border-neutral-200 rounded-xl overflow-hidden">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-neutral-900 text-white text-[10px] font-bold uppercase tracking-wider">
              <th className="py-2.5 px-3 w-10 text-center">#</th>
              <th className="py-2.5 px-3">Item Description &amp; SKU</th>
              <th className="py-2.5 px-3">Variant (Size / Color)</th>
              <th className="py-2.5 px-3 text-center">Qty</th>
              <th className="py-2.5 px-3 text-right">Unit Price</th>
              <th className="py-2.5 px-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 bg-white">
            {(order.items || []).map((item, idx) => {
              const itemCode = item.productCode || item.sku;
              return (
                <tr key={idx} className={idx % 2 === 1 ? 'bg-neutral-50/40' : ''}>
                  <td className="py-3 px-3 text-center font-mono text-[11px] text-neutral-400 tabular-nums">
                    {String(idx + 1).padStart(2, '0')}
                  </td>
                  <td className="py-3 px-3 text-neutral-900">
                    <p className="font-semibold text-neutral-900">{item.productName}</p>
                    {itemCode && (
                      <span className="text-[10px] font-mono text-neutral-500">
                        Code: {itemCode}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-neutral-700 whitespace-nowrap">
                    <span className="font-medium text-neutral-900">{item.size}</span>
                    <span className="mx-1.5 text-neutral-300">/</span>
                    <span>{item.color}</span>
                  </td>
                  <td className="py-3 px-3 text-center font-bold text-neutral-900 tabular-nums">
                    {item.quantity}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-neutral-700 whitespace-nowrap tabular-nums">
                    ৳{(item.unitPrice || 0).toLocaleString('en-BD')}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-neutral-900 whitespace-nowrap tabular-nums">
                    ৳{(item.totalPrice || 0).toLocaleString('en-BD')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 5. Financial Settlement Summary & Verification */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-start pt-1">
        {/* Left: Summary & Fulfillment Box */}
        <div className="sm:col-span-5 order-2 sm:order-1 border border-neutral-200 rounded-xl p-3.5 bg-neutral-50/60 space-y-2 text-[10px] text-neutral-600">
          <p className="font-bold uppercase tracking-wider text-neutral-800 text-[10px]">
            Order Verification Notes
          </p>
          <div className="space-y-1">
            <div className="flex justify-between">
              <span>Line Items / Total Qty:</span>
              <span className="font-mono font-semibold text-neutral-900 tabular-nums">
                {(order.items || []).length} items ({totalUnits} pcs)
              </span>
            </div>
            <div className="flex justify-between">
              <span>Exchange Eligibility:</span>
              <span className="font-semibold text-neutral-900">3-Day Easy Size Exchange</span>
            </div>
            <div className="flex justify-between">
              <span>Authenticity:</span>
              <span className="font-semibold text-neutral-900">100% QC Inspected</span>
            </div>
          </div>
        </div>

        {/* Right: Framed Financial Ledger */}
        <div className="sm:col-span-7 order-1 sm:order-2 border border-neutral-200 rounded-xl overflow-hidden bg-white">
          <div className="p-3.5 space-y-2 text-[11px] sm:text-xs">
            <div className="flex justify-between items-center text-neutral-600">
              <span>Merchandise Subtotal ({totalUnits} {totalUnits === 1 ? 'pc' : 'pcs'})</span>
              <span className="font-mono font-medium text-neutral-900 tabular-nums">
                ৳{(order.subtotal || 0).toLocaleString('en-BD')}
              </span>
            </div>

            {order.discount > 0 && (
              <div className="flex justify-between items-center text-emerald-700 font-medium">
                <span>Promo Discount{order.couponCode ? ` (${order.couponCode})` : ''}</span>
                <span className="font-mono tabular-nums">-৳{order.discount.toLocaleString('en-BD')}</span>
              </div>
            )}

            {order.onlineDiscount && order.onlineDiscount > 0 ? (
              <div className="flex justify-between items-center text-emerald-700 font-medium">
                <span>Online Prepayment Discount</span>
                <span className="font-mono tabular-nums">-৳{order.onlineDiscount.toLocaleString('en-BD')}</span>
              </div>
            ) : null}

            <div className="flex justify-between items-center text-neutral-600">
              <span>Shipping &amp; Handling{order.deliveryZone ? ` (${order.deliveryZone})` : ''}</span>
              <span className="font-mono font-medium text-neutral-900 tabular-nums">
                {isFreeDelivery ? 'FREE (৳0)' : `৳${(order.deliveryCharge || 0).toLocaleString('en-BD')}`}
              </span>
            </div>
          </div>

          <div className="bg-neutral-900 text-white px-3.5 py-2.5 flex justify-between items-center text-xs sm:text-sm font-extrabold">
            <span className="uppercase tracking-wider">Invoice Total</span>
            <span className="font-mono tabular-nums">৳{(order.total || 0).toLocaleString('en-BD')}</span>
          </div>

          <div className="px-3.5 py-2.5 bg-neutral-50 space-y-1.5 text-[11px] sm:text-xs border-t border-neutral-200">
            {isCod && advancePaid && (
              <div className="flex justify-between items-center text-emerald-700 font-semibold">
                <span>Advance Paid</span>
                <span className="font-mono tabular-nums">-৳{advanceAmount.toLocaleString('en-BD')}</span>
              </div>
            )}
            {!isCod && order.paymentStatus === 'paid' && (
              <div className="flex justify-between items-center text-emerald-700 font-semibold">
                <span>Paid via {(order.paymentMethod || 'Online').toUpperCase()}</span>
                <span className="font-mono tabular-nums">-৳{(order.total || 0).toLocaleString('en-BD')}</span>
              </div>
            )}

            <div className="flex justify-between items-center font-extrabold text-neutral-900 pt-0.5">
              <span>{isCod ? 'Cash Due on Delivery' : 'Net Balance Due'}</span>
              <span
                className={`font-mono text-sm tabular-nums ${
                  dueOnDelivery === 0 ? 'text-emerald-700' : 'text-neutral-900'
                }`}
              >
                ৳{dueOnDelivery.toLocaleString('en-BD')}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 6. Exchange Policy & Authorized Signatory Footer */}
      <div className="pt-4 border-t border-neutral-200 flex flex-col sm:flex-row sm:items-end justify-between gap-4 text-[10px] text-neutral-500">
        <div className="space-y-1 max-w-md">
          <p className="font-bold text-neutral-800 uppercase tracking-wider">
            3-Day Exchange Policy &amp; Terms
          </p>
          <p className="leading-relaxed">
            3-day size exchange accepted for unworn, unwashed items with original invoice &amp; hangtag attached.
            Thank you for choosing Selvee.
          </p>
        </div>

        <div className="sm:text-right shrink-0 pt-2 sm:pt-0">
          <div className="border-b border-neutral-400 w-40 sm:ml-auto mb-1" />
          <p className="font-bold uppercase tracking-wider text-neutral-700">
            Authorized Signature
          </p>
          <p className="text-[9px] text-neutral-400">Computer Generated Official Invoice</p>
        </div>
      </div>
    </div>
  );
};
