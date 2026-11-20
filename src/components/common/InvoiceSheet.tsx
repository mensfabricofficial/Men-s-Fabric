import React, { useEffect, useState } from 'react';
import { Order, SiteSettings } from '../../types';
import { BrandLogo } from './BrandLogo';
import { settingsService, defaultSettings } from '../../services/settingsService';
import { formatDatePart, formatTimePart } from '../../lib/dateFormat';
import { getOrderPaidAndDue } from '../../lib/accountingUtils';

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
  const [settings, setSettings] = useState<SiteSettings>(() => settingsService.getInstantSettings() || defaultSettings);

  useEffect(() => {
    return settingsService.subscribeToSettings(setSettings);
  }, []);
  const cleanOrderNum = (order.orderNumber || order.id || '').replace(/^#/, '').trim();
  const displayOrderNumber = cleanOrderNum ? `#${cleanOrderNum}` : '#N/A';
  const invoiceNumber = getFormattedInvoiceNumber(order.orderNumber, order.id);

  const isCod = order.paymentMethod === 'cod';
  const isFreeDelivery = order.deliveryCharge === 0 || Boolean(order.freeDeliveryApplied);
  const advancePaid = Boolean(order.advanceDeliveryPaid) && (order.advanceAmount || 0) > 0;
  const { paid: resolvedPaidAmount, due: resolvedDueAmount } = getOrderPaidAndDue(order);
  const advanceAmount = advancePaid ? (order.advanceAmount ?? order.deliveryCharge) : 0;
  const dueOnDelivery = resolvedDueAmount;
  const showCustomerId =
    Boolean(order.customerId) &&
    order.customerId !== 'guest' &&
    order.customerId !== 'walk-in-pos';

  const totalUnits = (order.items || []).reduce((sum, item) => sum + (item.quantity || 1), 0);

  const formattedDate = formatDatePart(order.createdAt, formatDatePart(new Date()));
  const formattedTime = formatTimePart(order.createdAt, formatTimePart(new Date()));

  const paymentStatusLabel =
    order.paymentStatus === 'paid'
      ? 'Paid'
      : order.paymentStatus === 'refunded'
      ? 'Refunded'
      : order.paymentStatus === 'failed'
      ? 'Failed'
      : isCod && advancePaid
      ? 'Advance Paid'
      : 'Pending';

  const orderStatusLabel = (order.orderStatus || 'pending').replace(/-/g, ' ');
  const storeAddress = settings.address || 'Dhaka, Bangladesh';
  const storePhone = settings.phone || '+880 1700-000000';
  const storeEmail = settings.email || 'mensfabricofficial@gmail.com';

  return (
    <div className="bg-white text-neutral-900 text-[11px] sm:text-xs leading-relaxed space-y-5 w-full min-w-0">
      {/* 1. Minimal Editorial Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-neutral-900 pb-4">
        <div className="space-y-1 min-w-0">
          <BrandLogo variant="dark" imgClassName="h-7 sm:h-8 w-auto" />
          <p className="text-[11px] text-neutral-500 pt-1">{storeAddress}</p>
          <p className="text-[10px] text-neutral-500 break-words">
            {storePhone} <span className="mx-1 text-neutral-300">•</span>{' '}
            <span className="break-all">{storeEmail}</span>
          </p>
        </div>

        <div className="sm:text-right space-y-0.5 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-neutral-200">
          <div className="flex sm:justify-end items-center gap-2">
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-500">
              Invoice
            </span>
            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 border border-neutral-300 rounded text-neutral-800">
              {order.paymentStatus === 'paid' || dueOnDelivery === 0 ? 'Paid' : isCod ? 'COD' : 'Pending'}
            </span>
          </div>
          <p className="text-lg sm:text-xl font-extrabold font-mono tracking-tight text-neutral-900 tabular-nums">
            {invoiceNumber}
          </p>
          <p className="text-[10px] text-neutral-500 tabular-nums">
            Currency: BDT (৳)
          </p>
        </div>
      </div>

      {/* 2. Minimal Order & Time Metadata Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-3 gap-x-4 border-b border-neutral-200 pb-4">
        <div className="min-w-0">
          <span className="block text-[9px] font-bold uppercase tracking-widest text-neutral-400">
            Order No
          </span>
          <span className="font-mono font-bold text-neutral-900 text-xs tabular-nums break-all">
            {displayOrderNumber}
          </span>
        </div>
        <div className="min-w-0">
          <span className="block text-[9px] font-bold uppercase tracking-widest text-neutral-400">
            Date &amp; Time
          </span>
          <span className="font-semibold text-neutral-900 text-[11px] sm:text-xs tabular-nums block">
            {formattedDate}
          </span>
          <span className="text-[10px] text-neutral-500 tabular-nums block">
            {formattedTime}
          </span>
        </div>
        <div className="min-w-0">
          <span className="block text-[9px] font-bold uppercase tracking-widest text-neutral-400">
            Order Status
          </span>
          <span className="font-semibold text-neutral-900 text-[11px] sm:text-xs capitalize">
            {orderStatusLabel}
          </span>
        </div>
        <div className="min-w-0">
          <span className="block text-[9px] font-bold uppercase tracking-widest text-neutral-400">
            Delivery Zone
          </span>
          <span className="font-semibold text-neutral-900 text-[11px] sm:text-xs block truncate">
            {order.deliveryZone || order.shippingAddress?.district || 'Standard Courier'}
          </span>
        </div>
      </div>

      {/* 3. Clean 2-Column Client & Payment Block */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-8 border-b border-neutral-200 pb-4">
        {/* Left: Billed & Shipped To */}
        <div className="space-y-1 min-w-0">
          <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 block mb-1.5">
            Billed &amp; Shipped To
          </span>
          <p className="font-bold text-neutral-900 text-xs sm:text-sm break-words">
            {order.customerName || 'Valued Customer'}
          </p>
          {showCustomerId && (
            <p className="font-mono text-[10px] text-neutral-500">
              Customer ID: <b className="text-neutral-800">{order.customerId}</b>
            </p>
          )}
          <p className="font-mono text-neutral-800 font-semibold text-xs tabular-nums">
            {order.customerPhone}
          </p>
          {order.customerEmail && (
            <p className="text-neutral-500 text-[11px] break-all">{order.customerEmail}</p>
          )}
          <p className="text-neutral-700 text-[11px] leading-relaxed pt-0.5 break-words">
            {order.shippingAddress?.address}
            {(order.shippingAddress?.upazila || order.shippingAddress?.district || order.shippingAddress?.division) &&
              `, ${[order.shippingAddress?.upazila, order.shippingAddress?.district, order.shippingAddress?.division]
                .filter(Boolean)
                .join(', ')}`}
          </p>
          {order.shippingAddress?.notes && (
            <p className="text-[10px] text-neutral-500 italic pt-0.5 break-words">
              Note: &ldquo;{order.shippingAddress.notes}&rdquo;
            </p>
          )}
        </div>

        {/* Right: Payment & Settlement Details */}
        <div className="space-y-1.5 min-w-0 sm:border-l sm:border-neutral-200 sm:pl-6">
          <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 block mb-1.5">
            Payment &amp; Settlement
          </span>
          <div className="flex justify-between gap-3">
            <span className="text-neutral-500">Method</span>
            <span className="font-semibold text-neutral-900 text-right">
              {isCod
                ? 'Cash on Delivery (COD)'
                : `${(order.paymentMethod || 'Online').toUpperCase()} Prepaid`}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-neutral-500">Payment Status</span>
            <span className="font-semibold text-neutral-900 uppercase text-right">
              {paymentStatusLabel}
            </span>
          </div>
          {order.paymentDetails?.senderNumber && (
            <div className="flex justify-between gap-3">
              <span className="text-neutral-500 shrink-0">Sender No</span>
              <span className="font-mono text-neutral-800 tabular-nums break-all text-right">
                {order.paymentDetails.senderNumber}
              </span>
            </div>
          )}
          {order.paymentDetails?.transactionId && (
            <div className="flex justify-between gap-3">
              <span className="text-neutral-500 shrink-0">TrxID</span>
              <span className="font-mono font-bold text-neutral-900 break-all text-right">
                {order.paymentDetails.transactionId}
              </span>
            </div>
          )}
          {resolvedPaidAmount > 0 && (
            <div className="flex justify-between gap-3 text-emerald-700 font-semibold">
              <span>
                {isCod && advancePaid ? `Advance Paid${order.advanceGateway ? ` (${order.advanceGateway.toUpperCase()})` : ''}` : 'Paid Amount'}
              </span>
              <span className="font-mono tabular-nums">
                ৳{resolvedPaidAmount.toLocaleString('en-BD')}
              </span>
            </div>
          )}
          {isFreeDelivery && (
            <div className="flex justify-between gap-3 text-emerald-700 font-semibold">
              <span>Delivery Benefit</span>
              <span>Free Delivery Applied</span>
            </div>
          )}
          <div className="flex justify-between gap-3 pt-1 border-t border-dashed border-neutral-200 font-bold text-neutral-900">
            <span>{isCod ? 'Due on Delivery' : 'Balance Due'}</span>
            <span className={`font-mono tabular-nums ${dueOnDelivery === 0 ? 'text-emerald-700' : 'text-neutral-900'}`}>
              ৳{dueOnDelivery.toLocaleString('en-BD')}
            </span>
          </div>
        </div>
      </div>

      {/* 4A. Mobile Itemized List (Clean Hairline Rows — Zero Table Overflow on Phones) */}
      <div className="sm:hidden print:hidden">
        <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-neutral-500 border-b border-neutral-900 pb-2">
          <span>Items ({totalUnits} {totalUnits === 1 ? 'pc' : 'pcs'})</span>
          <span>Amount</span>
        </div>
        <div className="divide-y divide-neutral-200 border-b border-neutral-200">
          {(order.items || []).map((item, idx) => {
            const itemCode = item.productCode || item.sku;
            return (
              <div key={idx} className="py-3 space-y-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-neutral-900 text-xs leading-snug break-words">
                      <span className="font-mono text-[10px] text-neutral-400 mr-1.5">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      {item.productName}
                    </p>
                    <p className="text-[10px] text-neutral-500 mt-0.5">
                      {item.size} / {item.color}
                      {itemCode ? ` • Code: ${itemCode}` : ''}
                    </p>
                  </div>
                  <span className="font-mono font-bold text-neutral-900 text-xs whitespace-nowrap tabular-nums shrink-0">
                    ৳{(item.totalPrice || 0).toLocaleString('en-BD')}
                  </span>
                </div>
                <p className="text-[10px] font-mono text-neutral-500 tabular-nums">
                  Qty: {item.quantity} × ৳{(item.unitPrice || 0).toLocaleString('en-BD')}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4B. Desktop & A4 Print Table (Pure Minimal Hairline Rules) */}
      <div className="hidden sm:block print:block">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-y border-neutral-900 text-[10px] font-bold uppercase tracking-wider text-neutral-600">
              <th className="py-2.5 px-2 w-9 text-center">#</th>
              <th className="py-2.5 px-2">Item &amp; SKU</th>
              <th className="py-2.5 px-2">Variant</th>
              <th className="py-2.5 px-2 text-center">Qty</th>
              <th className="py-2.5 px-2 text-right">Unit Price</th>
              <th className="py-2.5 px-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 border-b border-neutral-200">
            {(order.items || []).map((item, idx) => {
              const itemCode = item.productCode || item.sku;
              return (
                <tr key={idx}>
                  <td className="py-2.5 px-2 text-center font-mono text-[11px] text-neutral-400 tabular-nums">
                    {String(idx + 1).padStart(2, '0')}
                  </td>
                  <td className="py-2.5 px-2 text-neutral-900">
                    <p className="font-semibold text-neutral-900">{item.productName}</p>
                    {itemCode && (
                      <span className="text-[10px] font-mono text-neutral-400">
                        Code: {itemCode}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-2 text-neutral-600 whitespace-nowrap">
                    {item.size} / {item.color}
                  </td>
                  <td className="py-2.5 px-2 text-center font-semibold text-neutral-900 tabular-nums">
                    {item.quantity}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono text-neutral-700 whitespace-nowrap tabular-nums">
                    ৳{(item.unitPrice || 0).toLocaleString('en-BD')}
                  </td>
                  <td className="py-2.5 px-2 text-right font-mono font-bold text-neutral-900 whitespace-nowrap tabular-nums">
                    ৳{(item.totalPrice || 0).toLocaleString('en-BD')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 5. Clean Minimal Totals & Summary Section */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pt-1">
        <div className="order-2 sm:order-1 text-[10px] text-neutral-500 space-y-0.5">
          <p className="font-semibold text-neutral-700">
            Summary: {(order.items || []).length} line {(order.items || []).length === 1 ? 'item' : 'items'} ({totalUnits} {totalUnits === 1 ? 'unit' : 'units'})
          </p>
          <p>Quality checked &amp; sealed prior to dispatch.</p>
        </div>

        <div className="order-1 sm:order-2 w-full sm:w-72 space-y-1.5 text-[11px] sm:text-xs sm:ml-auto">
          <div className="flex justify-between text-neutral-600">
            <span>Subtotal</span>
            <span className="font-mono tabular-nums">৳{(order.subtotal || 0).toLocaleString('en-BD')}</span>
          </div>

          {order.discount > 0 && (
            <div className="flex justify-between text-emerald-700 font-medium">
              <span>Discount{order.couponCode ? ` (${order.couponCode})` : ''}</span>
              <span className="font-mono tabular-nums">-৳{order.discount.toLocaleString('en-BD')}</span>
            </div>
          )}

          {order.onlineDiscount && order.onlineDiscount > 0 ? (
            <div className="flex justify-between text-emerald-700 font-medium">
              <span>Online Prepayment Discount</span>
              <span className="font-mono tabular-nums">-৳{order.onlineDiscount.toLocaleString('en-BD')}</span>
            </div>
          ) : null}

          <div className="flex justify-between text-neutral-600">
            <span>Delivery Charge</span>
            <span className="font-mono tabular-nums">
              {isFreeDelivery ? 'FREE (৳0)' : `৳${(order.deliveryCharge || 0).toLocaleString('en-BD')}`}
            </span>
          </div>

          <div className="flex justify-between text-sm font-extrabold text-neutral-900 pt-2 border-t border-neutral-900">
            <span>Total</span>
            <span className="font-mono tabular-nums">৳{(order.total || 0).toLocaleString('en-BD')}</span>
          </div>

          {resolvedPaidAmount > 0 && (
            <div className="flex justify-between text-emerald-700 font-medium">
              <span>{isCod && advancePaid ? 'Advance Paid' : 'Paid Amount'}</span>
              <span className="font-mono tabular-nums">-৳{resolvedPaidAmount.toLocaleString('en-BD')}</span>
            </div>
          )}

          <div className="flex justify-between items-center pt-1.5 border-t border-dashed border-neutral-300 font-bold text-neutral-900">
            <span>{isCod ? 'Cash Due on Delivery' : 'Balance Due'}</span>
            <span className={`font-mono text-sm tabular-nums ${dueOnDelivery === 0 ? 'text-emerald-700' : 'text-neutral-900'}`}>
              ৳{dueOnDelivery.toLocaleString('en-BD')}
            </span>
          </div>
        </div>
      </div>

      {/* 6. Minimal Footer */}
      <div className="pt-4 border-t border-neutral-200 flex flex-col sm:flex-row sm:items-end justify-between gap-4 text-[10px] text-neutral-500">
        <div className="space-y-0.5 max-w-md">
          <p className="font-bold text-neutral-700 uppercase tracking-wider">3-Day Exchange Policy</p>
          <p>
            3-day size exchange accepted for unworn items with original invoice &amp; tag attached.
          </p>
        </div>

        <div className="sm:text-right shrink-0">
          <div className="border-b border-neutral-300 w-36 sm:ml-auto mb-1" />
          <p className="font-semibold uppercase tracking-wider text-neutral-600">Authorized Signature</p>
        </div>
      </div>
    </div>
  );
};
