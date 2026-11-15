import React from 'react';
import { Order } from '../../types';
import { BrandLogo } from './BrandLogo';

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

  const formattedDate = (() => {
    try {
      if (order.createdAt?.toDate) return order.createdAt.toDate().toLocaleDateString('en-BD');
      if (order.createdAt?.seconds) return new Date(order.createdAt.seconds * 1000).toLocaleDateString('en-BD');
      if (typeof order.createdAt === 'string') return new Date(order.createdAt).toLocaleDateString('en-BD');
    } catch {
      // ignore
    }
    return new Date().toLocaleDateString('en-BD');
  })();

  const paymentStatusLabel =
    order.paymentStatus === 'paid'
      ? 'Paid'
      : order.paymentStatus === 'refunded'
      ? 'Refunded'
      : order.paymentStatus === 'failed'
      ? 'Failed'
      : 'Pending';

  return (
    <div className="bg-white text-neutral-900 text-[11px] sm:text-xs leading-relaxed space-y-5">
      {/* Minimal Header: Logo (no duplicate brand name text) + Invoice Metadata */}
      <div className="flex flex-wrap justify-between items-start gap-4 border-b border-neutral-900 pb-4">
        <div className="space-y-1">
          <BrandLogo variant="dark" imgClassName="h-7 sm:h-8" />
          <p className="text-[11px] text-neutral-500 pt-0.5">
            Dhaka, Bangladesh
          </p>
          <p className="text-[10px] text-neutral-500">
            +880 1700-000000 • mensfabricofficial@gmail.com
          </p>
        </div>

        <div className="text-right space-y-0.5 ml-auto">
          <span className="inline-block text-[9px] font-bold uppercase tracking-widest text-neutral-500 border border-neutral-300 px-2 py-0.5 rounded">
            Invoice
          </span>
          <p className="text-base sm:text-lg font-black font-mono tracking-tight text-neutral-900 pt-0.5">
            {invoiceNumber}
          </p>
          <p className="text-[11px] text-neutral-500">
            Order: <span className="font-mono font-semibold text-neutral-800">{displayOrderNumber}</span> • Date: {formattedDate}
          </p>
        </div>
      </div>

      {/* Customer & Payment Details (Clean 2-Column Minimal Grid) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-neutral-50/70 p-4 rounded-xl border border-neutral-200">
        <div className="space-y-0.5">
          <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
            Billed &amp; Shipped To
          </span>
          <p className="font-bold text-neutral-900 text-xs sm:text-sm">{order.customerName}</p>
          <p className="font-mono text-neutral-800 font-semibold">{order.customerPhone}</p>
          {order.customerEmail && <p className="text-neutral-500 text-[11px]">{order.customerEmail}</p>}
          <p className="text-neutral-700 pt-0.5">
            {order.shippingAddress?.address}
            {(order.shippingAddress?.district || order.shippingAddress?.division) &&
              `, ${[order.shippingAddress?.district, order.shippingAddress?.division].filter(Boolean).join(', ')}`}
          </p>
          {order.deliveryZone && (
            <p className="text-[10px] text-neutral-500 pt-0.5">Zone: {order.deliveryZone}</p>
          )}
          {order.shippingAddress?.notes && (
            <p className="text-[10px] text-neutral-500 italic pt-0.5">Note: &ldquo;{order.shippingAddress.notes}&rdquo;</p>
          )}
        </div>

        <div className="sm:text-right space-y-1">
          <span className="text-[9px] font-bold uppercase tracking-widest text-neutral-400 block mb-1">
            Payment Details
          </span>
          <p className="font-bold text-neutral-900">
            {isCod
              ? 'Cash on Delivery (COD)'
              : `${(order.paymentMethod || 'Online').toUpperCase()} Prepaid`}
          </p>
          <p className="text-[11px] text-neutral-600">
            Payment Status:{' '}
            <span className="font-bold text-neutral-900 uppercase">{paymentStatusLabel}</span>
          </p>
          {order.paymentDetails?.transactionId && (
            <p className="text-[11px] text-neutral-600 font-mono">
              TrxID: <span className="font-bold text-neutral-900">{order.paymentDetails.transactionId}</span>
            </p>
          )}
          {isCod && advancePaid && (
            <p className="text-[11px] text-emerald-700 font-semibold">
              Advance Paid: ৳{advanceAmount.toLocaleString('en-BD')}
              {order.advanceGateway ? ` (${order.advanceGateway.toUpperCase()})` : ''}
            </p>
          )}
          {isFreeDelivery && (
            <p className="text-[11px] text-emerald-700 font-semibold">
              Free Delivery Applied
            </p>
          )}
          <p className="text-[11px] font-bold text-neutral-900 pt-0.5">
            Due on Delivery: ৳{dueOnDelivery.toLocaleString('en-BD')}
          </p>
        </div>
      </div>

      {/* Itemized Products Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-[11px] sm:text-xs">
          <thead>
            <tr className="border-y border-neutral-300 bg-neutral-50 text-[10px] font-bold uppercase tracking-wider text-neutral-600">
              <th className="py-2.5 px-3">Item</th>
              <th className="py-2.5 px-3">Variant</th>
              <th className="py-2.5 px-3 text-center">Qty</th>
              <th className="py-2.5 px-3 text-right">Price</th>
              <th className="py-2.5 px-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {(order.items || []).map((item, idx) => {
              const itemCode = item.productCode || item.sku;
              return (
                <tr key={idx}>
                  <td className="py-2.5 px-3 text-neutral-900">
                    <p className="font-semibold text-neutral-900">{item.productName}</p>
                    {itemCode && (
                      <span className="text-[10px] font-mono text-neutral-400">Code: {itemCode}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-neutral-600 whitespace-nowrap">
                    {item.size} / {item.color}
                  </td>
                  <td className="py-2.5 px-3 text-center font-semibold text-neutral-900">
                    {item.quantity}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-neutral-700 whitespace-nowrap">
                    ৳{(item.unitPrice || 0).toLocaleString('en-BD')}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-neutral-900 whitespace-nowrap">
                    ৳{(item.totalPrice || 0).toLocaleString('en-BD')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Minimal Totals Block */}
      <div className="flex justify-end pt-1">
        <div className="w-full sm:w-72 space-y-1.5 text-[11px] sm:text-xs">
          <div className="flex justify-between text-neutral-600">
            <span>Subtotal</span>
            <span className="font-mono">৳{(order.subtotal || 0).toLocaleString('en-BD')}</span>
          </div>

          {order.discount > 0 && (
            <div className="flex justify-between text-emerald-700 font-medium">
              <span>Discount{order.couponCode ? ` (${order.couponCode})` : ''}</span>
              <span className="font-mono">-৳{order.discount.toLocaleString('en-BD')}</span>
            </div>
          )}

          {order.onlineDiscount && order.onlineDiscount > 0 ? (
            <div className="flex justify-between text-emerald-700 font-medium">
              <span>Online Prepayment Discount</span>
              <span className="font-mono">-৳{order.onlineDiscount.toLocaleString('en-BD')}</span>
            </div>
          ) : null}

          <div className="flex justify-between text-neutral-600">
            <span>Delivery Charge</span>
            <span className="font-mono">
              {isFreeDelivery ? 'FREE (৳0)' : `৳${(order.deliveryCharge || 0).toLocaleString('en-BD')}`}
            </span>
          </div>

          <div className="flex justify-between text-sm font-black text-neutral-900 pt-2 border-t border-neutral-900">
            <span>Total</span>
            <span className="font-mono">৳{(order.total || 0).toLocaleString('en-BD')}</span>
          </div>

          {isCod && advancePaid && (
            <div className="flex justify-between text-emerald-700 font-medium">
              <span>Advance Paid</span>
              <span className="font-mono">-৳{advanceAmount.toLocaleString('en-BD')}</span>
            </div>
          )}

          <div className="flex justify-between items-center pt-1.5 border-t border-dashed border-neutral-300 font-bold text-neutral-900">
            <span>{isCod ? 'Cash Due on Delivery' : 'Balance Due'}</span>
            <span className={`font-mono text-sm ${dueOnDelivery === 0 ? 'text-emerald-700' : 'text-neutral-900'}`}>
              ৳{dueOnDelivery.toLocaleString('en-BD')}
            </span>
          </div>
        </div>
      </div>

      {/* Minimal Footer */}
      <div className="pt-4 border-t border-neutral-200 flex flex-col sm:flex-row sm:items-end justify-between gap-4 text-[10px] text-neutral-500">
        <div className="space-y-0.5">
          <p className="font-bold text-neutral-700 uppercase tracking-wider">Exchange Policy</p>
          <p>7-day size exchange accepted for unworn items with original invoice &amp; tag attached.</p>
        </div>

        <div className="sm:text-right shrink-0">
          <div className="border-b border-neutral-300 w-36 sm:ml-auto mb-1" />
          <p className="font-semibold uppercase tracking-wider text-neutral-600">Authorized Signature</p>
        </div>
      </div>
    </div>
  );
};
