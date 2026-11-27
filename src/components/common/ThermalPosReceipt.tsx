import React, { useEffect, useState } from 'react';
import { Order, SiteSettings } from '../../types';
import { BrandLogo } from './BrandLogo';
import { settingsService, defaultSettings } from '../../services/settingsService';
import { getFormattedInvoiceNumber } from './InvoiceSheet';
import { formatDateTime } from '../../lib/dateFormat';
import {
  getOrderCustomerPaidAndDue,
  getOrderRecognizedSale,
  getOrderFreeDeliveryFee,
} from '../../lib/accountingUtils';

interface ThermalPosReceiptProps {
  order: Order;
  receiptTitle?: string;
  variant?: 'customer' | 'final_sale';
}

export const ThermalPosReceipt: React.FC<ThermalPosReceiptProps> = ({
  order,
  receiptTitle,
  variant = 'customer',
}) => {
  const [settings, setSettings] = useState<SiteSettings>(
    () => settingsService.getInstantSettings() || defaultSettings
  );

  useEffect(() => {
    return settingsService.subscribeToSettings(setSettings);
  }, []);

  const invoiceNumber = getFormattedInvoiceNumber(order.orderNumber, order.id);
  const cleanOrderNum = (order.orderNumber || order.id || '').replace(/^#/, '').trim();
  const displayOrderNumber = cleanOrderNum ? `#${cleanOrderNum}` : '#N/A';

  const isFinalSale = variant === 'final_sale';
  const isCod = order.paymentMethod === 'cod';
  const advancePaid = Boolean(order.advanceDeliveryPaid) && (order.advanceAmount || 0) > 0;
  const { paid, due } = getOrderCustomerPaidAndDue(order);
  const deliveryAmt = Math.max(0, Number(order.deliveryCharge) || 0);
  const rec = order.pipeline?.codReconciliation;
  const freeDelivFee = getOrderFreeDeliveryFee(order);
  const courierCodCharge = Math.max(0, Number(rec?.codCharge ?? order.codCharge ?? 0) || 0);
  const expectedNetProducts = Math.max(
    0,
    (Number(order.subtotal) || 0) - (Number(order.discount) || 0) - (Number(order.onlineDiscount) || 0)
  );
  const customerCodCharge = Math.max(
    0,
    (Number(order.total) || 0) - (expectedNetProducts + deliveryAmt)
  );
  const finalSaleTotal =
    rec?.resolved || typeof order.netSaleAmount === 'number'
      ? getOrderRecognizedSale(order)
      : Math.max(0, expectedNetProducts - freeDelivFee - courierCodCharge);

  const showCustomerId =
    Boolean(order.customerId) &&
    order.customerId !== 'guest' &&
    order.customerId !== 'walk-in-pos';

  const storeAddress = settings.address || 'Dhaka, Bangladesh';
  const storePhone = settings.phone || '+880 1700-000000';

  const destinationParts = [
    order.shippingAddress?.address,
    order.shippingAddress?.upazila,
    order.shippingAddress?.district,
  ].filter(Boolean);

  return (
    <div className="max-w-[320px] mx-auto bg-white p-4 border border-dashed border-neutral-300 font-mono text-[11px] text-neutral-900 space-y-2.5 leading-tight print:border-none print:p-0 print:max-w-none">
      {/* Header */}
      <div className="text-center pb-2 border-b border-dashed border-neutral-400 space-y-1">
        <BrandLogo variant="dark" imgClassName="h-6 mx-auto" />
        <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-700">
          {receiptTitle || (isFinalSale ? 'Final Sale Invoice' : 'Customer Invoice')}
        </p>
        <p className="text-[10px] text-neutral-600">{storeAddress}</p>
        <p className="text-[10px] text-neutral-600">Hotline: {storePhone}</p>
      </div>

      {/* Metadata */}
      <div className="space-y-0.5 text-[10px] pb-2 border-b border-dashed border-neutral-400">
        <div className="flex justify-between gap-2">
          <span className="font-bold">INVOICE:</span>
          <span className="font-bold">{invoiceNumber}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>RECEIPT / ORDER:</span>
          <span className="font-bold">{displayOrderNumber}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>DATE:</span>
          <span>{formatDateTime(order.createdAt, formatDateTime(new Date()))}</span>
        </div>
        {showCustomerId && (
          <div className="flex justify-between gap-2">
            <span>CUSTOMER ID:</span>
            <span className="font-bold">{order.customerId}</span>
          </div>
        )}
        <div className="flex justify-between gap-2">
          <span>CUSTOMER:</span>
          <span className="font-bold truncate max-w-[170px] text-right">
            {order.customerName || 'Walk-in Customer'}
          </span>
        </div>
        {order.customerPhone && order.customerPhone !== 'N/A' && (
          <div className="flex justify-between gap-2">
            <span>PHONE:</span>
            <span className="font-bold">{order.customerPhone}</span>
          </div>
        )}
        {destinationParts.length > 0 && order.orderChannel !== 'pos' && (
          <div className="pt-0.5">
            <span>DESTINATION:</span>
            <p className="text-neutral-700 pl-1 break-words">{destinationParts.join(', ')}</p>
          </div>
        )}
        {order.couponCode && (
          <div className="flex justify-between gap-2">
            <span>COUPON:</span>
            <span className="font-bold">{order.couponCode}</span>
          </div>
        )}
      </div>

      {/* Items */}
      <div className="pb-2 border-b border-dashed border-neutral-400">
        <div className="flex justify-between font-bold border-b border-neutral-300 pb-1 mb-1.5 text-[10px]">
          <span>ITEM / VARIANT</span>
          <span>QTY x PRICE = TOTAL</span>
        </div>
        <div className="space-y-1.5">
          {(order.items || []).map((item, idx) => (
            <div key={idx} className="space-y-0.5">
              <p className="font-bold break-words">{item.productName}</p>
              <div className="flex justify-between gap-2 text-[10px] text-neutral-700">
                <span>
                  {item.size} / {item.color}
                </span>
                <span className="whitespace-nowrap">
                  {item.quantity} x ৳{(item.unitPrice || 0).toLocaleString('en-BD')} ={' '}
                  <b>৳{(item.totalPrice || 0).toLocaleString('en-BD')}</b>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Totals */}
      <div className="space-y-0.5 pb-2 border-b border-dashed border-neutral-400 text-[11px] tabular-nums">
        <div className="flex justify-between">
          <span>Subtotal:</span>
          <span>৳{(order.subtotal || 0).toLocaleString('en-BD')}</span>
        </div>
        {(Number(order.discount) || 0) > 0 && (
          <div className="flex justify-between text-emerald-800">
            <span>Discount{order.couponCode ? ` (${order.couponCode})` : ''}:</span>
            <span>-৳{(Number(order.discount) || 0).toLocaleString('en-BD')}</span>
          </div>
        )}
        {(Number(order.onlineDiscount) || 0) > 0 ? (
          <div className="flex justify-between text-emerald-800 font-bold">
            <span>Online Discount:</span>
            <span>-৳{(Number(order.onlineDiscount) || 0).toLocaleString('en-BD')}</span>
          </div>
        ) : null}
        {isFinalSale ? (
          <>
            {deliveryAmt > 0 && (
              <div className="flex justify-between text-neutral-500">
                <span>Delivery (Separate):</span>
                <span>৳{deliveryAmt.toLocaleString('en-BD')}</span>
              </div>
            )}
            {freeDelivFee > 0 && (
              <div className="flex justify-between text-red-700 font-bold">
                <span>Free Delivery Fee:</span>
                <span>-৳{freeDelivFee.toLocaleString('en-BD')}</span>
              </div>
            )}
            <div className="flex justify-between text-red-700 font-bold">
              <span>COD Charge:</span>
              <span>{courierCodCharge > 0 ? `-৳${courierCodCharge.toLocaleString('en-BD')}` : '৳0'}</span>
            </div>
            <div className="flex justify-between font-extrabold text-xs pt-1 border-t border-neutral-300 text-emerald-800">
              <span>FINAL SALE AMOUNT:</span>
              <span>৳{finalSaleTotal.toLocaleString('en-BD')}</span>
            </div>
            {typeof rec?.collectedCash === 'number' && (
              <div className="flex justify-between text-[10px] text-neutral-600 pt-0.5">
                <span>Collected Cash:</span>
                <span>৳{rec.collectedCash.toLocaleString('en-BD')}</span>
              </div>
            )}
          </>
        ) : (
          <>
            {(deliveryAmt > 0 || order.freeDeliveryApplied) && (
              <div className="flex justify-between">
                <span>Delivery{order.deliveryZone ? ` (${order.deliveryZone})` : ''}:</span>
                <span>
                  {deliveryAmt === 0
                    ? 'FREE (৳0)'
                    : `+৳${deliveryAmt.toLocaleString('en-BD')}`}
                </span>
              </div>
            )}
            {customerCodCharge > 0 && (
              <div className="flex justify-between">
                <span>COD Charge:</span>
                <span>+৳{customerCodCharge.toLocaleString('en-BD')}</span>
              </div>
            )}
            {advancePaid && due > 0 && (
              <div className="flex justify-between text-emerald-800 font-bold">
                <span>Adv. Delivery Paid ({order.advanceGateway?.toUpperCase() || 'MFS'}):</span>
                <span>-৳{(Number(order.advanceAmount ?? deliveryAmt) || 0).toLocaleString('en-BD')}</span>
              </div>
            )}
            <div className="flex justify-between font-extrabold text-xs pt-1 border-t border-neutral-300">
              <span>GRAND TOTAL:</span>
              <span>৳{(Number(order.total) || 0).toLocaleString('en-BD')}</span>
            </div>
            <div className="flex justify-between font-bold text-emerald-800 pt-0.5">
              <span>PAID:</span>
              <span>৳{paid.toLocaleString('en-BD')}</span>
            </div>
            <div
              className={`flex justify-between font-black pt-0.5 ${
                due > 0 ? 'text-red-700' : 'text-neutral-700'
              }`}
            >
              <span>{isCod ? 'DUE ON DELIVERY:' : 'REMAINING DUE:'}</span>
              <span>৳{due.toLocaleString('en-BD')}</span>
            </div>
          </>
        )}
      </div>

      {/* Payment Meta */}
      <div className="space-y-0.5 pb-2 border-b border-dashed border-neutral-400 text-[10px]">
        <div className="flex justify-between gap-2">
          <span className="font-bold">PAYMENT:</span>
          <span className="font-extrabold uppercase">
            {order.paymentMethod === 'cod' && order.orderChannel === 'pos'
              ? 'CASH'
              : order.paymentMethod || 'cod'}{' '}
            ({(order.paymentStatus || 'pending').toUpperCase()})
          </span>
        </div>
        {order.paymentDetails?.transactionId && (
          <div className="flex justify-between gap-2">
            <span>TrxID:</span>
            <span className="font-bold">{order.paymentDetails.transactionId}</span>
          </div>
        )}
        {order.paymentDetails?.senderNumber && (
          <div className="flex justify-between gap-2">
            <span>Sender No:</span>
            <span className="font-bold">{order.paymentDetails.senderNumber}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="text-center pt-1 space-y-1">
        <div className="tracking-[4px] font-bold text-xs">
          ||| | |||| | ||| || ||||| | |||
        </div>
        <p className="text-[9px] font-mono tracking-widest">{invoiceNumber}</p>
        <p className="text-[10px] font-bold uppercase pt-0.5">
          Thank you for shopping with Selvee!
        </p>
        <p className="text-[9px] text-neutral-500">
          3-Day exchange with original invoice &amp; parcel tag.
        </p>
      </div>
    </div>
  );
};
