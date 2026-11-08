import React from 'react';
import { X, Printer, Download, CheckCircle, ShieldCheck, Truck } from 'lucide-react';
import { Order } from '../../types';
import { BrandLogo } from './BrandLogo';
import { Barcode } from './Barcode';

import { printElementById } from '../../lib/printHelper';

interface A4InvoiceModalProps {
  order: Order;
  isOpen: boolean;
  onClose: () => void;
}

export const A4InvoiceModal: React.FC<A4InvoiceModalProps> = ({ order, isOpen, onClose }) => {
  if (!isOpen) return null;

  const displayOrderNumber = order.orderNumber?.startsWith('#')
    ? order.orderNumber
    : `#${order.orderNumber}`;

  const handlePrint = () => {
    printElementById('printable-customer-invoice', `Invoice-${order.orderNumber}`);
  };

  const isCod = order.paymentMethod === 'cod';
  const advancePaid = Boolean(order.advanceDeliveryPaid);
  const advanceAmount = order.advanceAmount || order.deliveryCharge;
  const dueOnDelivery = order.dueOnDelivery ?? (isCod ? Math.max(0, order.subtotal - order.discount) : 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-xs overflow-y-auto print:p-0 print:bg-white">
      
      {/* Container */}
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full my-6 max-h-[95vh] flex flex-col justify-between overflow-hidden animate-fade-in print:m-0 print:p-0 print:max-w-none print:shadow-none print:rounded-none print:max-h-none">
        
        {/* Top Control Bar (Hidden in Print) */}
        <div className="p-4 sm:p-5 border-b border-neutral-200 flex items-center justify-between bg-neutral-50 print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-800">
              Official A4 Customer Invoice
            </span>
            <span className="font-mono text-xs font-bold text-neutral-500">{displayOrderNumber}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 bg-black hover:bg-neutral-800 text-white rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors cursor-pointer shadow-xs"
            >
              <Printer className="w-4 h-4" />
              <span>Print / Download PDF (A4)</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-neutral-400 hover:text-black rounded-lg hover:bg-neutral-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Print Stylesheet */}
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            body * {
              visibility: hidden !important;
            }
            #printable-customer-invoice, #printable-customer-invoice * {
              visibility: visible !important;
            }
            #printable-customer-invoice {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              margin: 0 !important;
              padding: 12mm 15mm !important;
              background: #ffffff !important;
              color: #000000 !important;
            }
            @page {
              size: A4 portrait;
              margin: 0;
            }
          }
        ` }} />

        {/* Printable A4 Content */}
        <div id="printable-customer-invoice" className="p-6 sm:p-10 overflow-y-auto space-y-6 text-xs text-neutral-900 leading-normal flex-1">
          
          {/* Header */}
          <div className="flex justify-between items-start border-b-2 border-neutral-900 pb-5">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <BrandLogo variant="dark" className="h-9" />
              </div>
              <h2 className="text-base font-black uppercase tracking-tight text-neutral-900">
                MEN'S FABRIC <span className="text-xs font-normal text-neutral-500">(Clothing Brand)</span>
              </h2>
              <p className="text-[11px] text-neutral-600">
                Dhaka, Bangladesh • Official Customer Tax & Delivery Invoice
              </p>
              <p className="text-[11px] text-neutral-500">
                Hotline: +880 1700-000000 • mensfabricofficial@gmail.com
              </p>
            </div>

            <div className="text-right space-y-1">
              <span className="inline-block text-[10px] font-mono uppercase font-black bg-black text-white px-2.5 py-1 rounded">
                TAX INVOICE
              </span>
              <p className="text-lg font-black font-mono text-black">{displayOrderNumber}</p>
              <p className="text-[11px] text-neutral-500">
                Date: {order.createdAt?.toDate ? order.createdAt.toDate().toLocaleDateString('en-BD') : new Date().toLocaleDateString('en-BD')}
              </p>
              <div className="pt-1">
                <span className={`inline-block px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                  isCod ? 'bg-neutral-100 text-neutral-800 border border-neutral-300' : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                }`}>
                  {isCod ? 'Cash on Delivery (Advance Fee Paid)' : `${order.paymentMethod.toUpperCase()} (Online Prepaid)`}
                </span>
              </div>
            </div>
          </div>

          {/* Payment & Verification Banner */}
          <div className="border border-neutral-300 rounded-xl p-4 bg-neutral-50/70">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-200">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span className="font-extrabold uppercase text-[11px] tracking-wider text-neutral-900">
                  Payment Verification & Courier Clearance
                </span>
              </div>
              <span className="font-bold text-[11px] text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                {isCod ? 'Advance Delivery Charge Confirmed' : 'Order Paid in Full'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 text-[11px]">
              <div>
                <span className="text-neutral-500 block uppercase font-bold text-[9px]">Payment Mode</span>
                <p className="font-bold text-neutral-900 uppercase">
                  {isCod ? `Cash on Delivery (COD)` : `${order.paymentMethod.toUpperCase()} (Prepayment)`}
                </p>
              </div>

              <div>
                <span className="text-neutral-500 block uppercase font-bold text-[9px]">
                  {isCod ? 'Advance Delivery Fee' : 'Total Amount Paid'}
                </span>
                <p className="font-black text-emerald-700">
                  {isCod 
                    ? `৳${advanceAmount.toLocaleString('en-BD')} (via ${(order.advanceGateway || order.paymentDetails?.advanceGateway || 'MFS').toUpperCase()})`
                    : `৳${order.total.toLocaleString('en-BD')}`}
                </p>
                {order.paymentDetails?.transactionId && (
                  <p className="text-[10px] text-neutral-500 font-mono">TrxID: {order.paymentDetails.transactionId}</p>
                )}
              </div>

              <div>
                <span className="text-neutral-500 block uppercase font-bold text-[9px]">
                  Collectable Cash by Courier
                </span>
                <p className="font-black text-sm text-red-600">
                  ৳{dueOnDelivery.toLocaleString('en-BD')}
                </p>
                <p className="text-[10px] text-neutral-500">
                  {dueOnDelivery === 0 ? 'Nothing to pay upon arrival' : 'Pay in cash upon parcel delivery'}
                </p>
              </div>
            </div>
          </div>

          {/* Customer & Shipping Addresses */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-neutral-50 p-4 rounded-xl border border-neutral-200">
            <div>
              <span className="font-bold uppercase tracking-wider text-neutral-400 text-[10px] block mb-1">
                Billed & Shipped To:
              </span>
              <p className="font-extrabold text-neutral-900 text-sm">{order.customerName}</p>
              <p className="font-medium text-neutral-800">{order.shippingAddress.address}</p>
              <p className="text-neutral-600">{order.shippingAddress.district}, {order.shippingAddress.division}</p>
              <p className="font-mono text-neutral-900 font-bold mt-1">📞 {order.customerPhone}</p>
              {order.customerEmail && <p className="text-neutral-500">{order.customerEmail}</p>}
            </div>

            <div className="sm:text-right">
              <span className="font-bold uppercase tracking-wider text-neutral-400 text-[10px] block mb-1">
                Dispatch Logistics:
              </span>
              <p className="font-semibold text-neutral-900">Zone: {order.deliveryZone}</p>
              <p className="text-neutral-600">Courier Partner: Steadfast / Pathao Express</p>
              <p className="text-neutral-600">Standard Delivery: 2-4 business days</p>
              {order.shippingAddress.notes && (
                <p className="text-neutral-500 italic mt-1 font-normal">Customer Note: "{order.shippingAddress.notes}"</p>
              )}
            </div>
          </div>

          {/* Itemized Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse border border-neutral-200 text-xs min-w-[480px]">
              <thead className="bg-neutral-100 font-bold uppercase text-neutral-700 text-[10px]">
                <tr>
                  <th className="p-3 border border-neutral-200">Item & Description</th>
                  <th className="p-3 border border-neutral-200">Size / Color</th>
                  <th className="p-3 border border-neutral-200 text-center">Qty</th>
                  <th className="p-3 border border-neutral-200 text-right">Unit Price</th>
                  <th className="p-3 border border-neutral-200 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 font-medium">
                {order.items.map((item, idx) => {
                  const itemCode = item.productCode || item.sku || `MF-${item.productId.slice(0, 6).toUpperCase()}`;
                  return (
                    <tr key={idx}>
                      <td className="p-3 border border-neutral-200 text-neutral-900">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div>
                            <span className="font-bold">{item.productName}</span>
                            <span className="block text-[10px] text-neutral-500 font-mono font-bold">
                              Code: {itemCode}
                            </span>
                          </div>
                          <div className="shrink-0 bg-white p-1 rounded border border-neutral-100">
                            <Barcode value={itemCode} width={0.9} height={20} displayValue={false} />
                          </div>
                        </div>
                      </td>
                      <td className="p-3 border border-neutral-200 text-neutral-600">
                        {item.size} / {item.color}
                      </td>
                      <td className="p-3 border border-neutral-200 text-center font-bold">
                        {item.quantity}
                      </td>
                      <td className="p-3 border border-neutral-200 text-right">
                        ৳{item.unitPrice.toLocaleString('en-BD')}
                      </td>
                      <td className="p-3 border border-neutral-200 text-right font-bold">
                        ৳{item.totalPrice.toLocaleString('en-BD')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Financial Calculation */}
          <div className="flex justify-end pt-2">
            <div className="w-full sm:w-80 space-y-1.5 text-right text-xs">
              <div className="flex justify-between text-neutral-600">
                <span>Subtotal:</span>
                <span>৳{order.subtotal.toLocaleString('en-BD')}</span>
              </div>
              {order.discount > 0 && (
                <div className="flex justify-between text-emerald-700 font-semibold">
                  <span>Coupon Discount ({order.couponCode}):</span>
                  <span>-৳{order.discount.toLocaleString('en-BD')}</span>
                </div>
              )}
              {order.onlineDiscount && order.onlineDiscount > 0 ? (
                <div className="flex justify-between text-emerald-700 font-semibold">
                  <span>Online Prepayment Discount:</span>
                  <span>-৳{order.onlineDiscount.toLocaleString('en-BD')}</span>
                </div>
              ) : null}
              <div className="flex justify-between text-neutral-600">
                <span>Delivery Charge ({order.deliveryZone}):</span>
                <span>৳{order.deliveryCharge.toLocaleString('en-BD')}</span>
              </div>
              
              <div className="flex justify-between text-sm font-extrabold text-neutral-900 pt-1.5 border-t border-neutral-300">
                <span>Total Order Value:</span>
                <span>৳{order.total.toLocaleString('en-BD')}</span>
              </div>

              {isCod && advancePaid && (
                <>
                  <div className="flex justify-between text-xs font-bold text-emerald-700">
                    <span>Advance Delivery Fee Paid:</span>
                    <span>-৳{advanceAmount.toLocaleString('en-BD')}</span>
                  </div>
                  <div className="flex justify-between text-sm font-black text-red-600 pt-1.5 border-t border-dashed border-red-300 bg-red-50 p-2 rounded-lg">
                    <span>Cash Due on Delivery:</span>
                    <span>৳{dueOnDelivery.toLocaleString('en-BD')}</span>
                  </div>
                </>
              )}

              {!isCod && (
                <div className="flex justify-between text-xs font-bold text-emerald-700 pt-1 border-t border-emerald-200 bg-emerald-50 p-1.5 rounded">
                  <span>Balance Due on Arrival:</span>
                  <span>৳0 (Fully Paid Online)</span>
                </div>
              )}
            </div>
          </div>

          {/* Terms & Signature Footer */}
          <div className="pt-6 border-t-2 border-neutral-300 grid grid-cols-1 sm:grid-cols-2 gap-4 text-[10px] text-neutral-500 items-end">
            <div className="space-y-1.5">
              <p className="font-bold text-neutral-800 uppercase tracking-wider">Exchange & Return Policy</p>
              <p>• Size exchange accepted within 7 days with original invoice & parcel tag attached.</p>
              <p>• Items must be unworn and unwashed. Contact support for courier pickup.</p>
            </div>

            <div className="text-left sm:text-right space-y-4">
              <div className="border-b border-neutral-400 w-40 sm:ml-auto pb-1">
                <span className="font-script text-sm font-bold text-neutral-700 italic">MEN'S FABRIC</span>
              </div>
              <p className="font-bold uppercase tracking-wider text-neutral-800 text-[10px]">
                Authorized Store Representative
              </p>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
