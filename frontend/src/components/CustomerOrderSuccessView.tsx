import React, { useState } from 'react';
import type { OrderDetails } from '../api/client';
import { viewOrDownloadInvoice } from '../api/client';
import { useAuth } from '../context/AuthContext';

interface CustomerOrderSuccessViewProps {
  order: OrderDetails;
  onViewAllOrders: () => void;
  onViewOrderDetail: (orderId: string) => void;
  onContinueShopping: () => void;
  onReturnToCart?: () => void;
  onRefreshOrderStatus?: (orderId: string) => Promise<void>;
}

export const CustomerOrderSuccessView: React.FC<CustomerOrderSuccessViewProps> = ({
  order,
  onViewAllOrders,
  onViewOrderDetail,
  onContinueShopping,
  onReturnToCart,
  onRefreshOrderStatus,
}) => {
  const { token } = useAuth();
  const [checking, setChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState<string | null>(null);
  const [downloadingInvoice, setDownloadingInvoice] = useState<'view' | 'download' | null>(null);
  const [invoiceFeedback, setInvoiceFeedback] = useState<string | null>(null);

  const delivery = order.delivery_address || {};
  const shop = order.shop || {};
  const items = order.items || [];

  const isOnline = order.payment_method === 'ONLINE';
  const isPaid = order.payment_status === 'PAID';
  const isFailedOrCancelled = order.payment_status === 'FAILED' || order.status === 'CANCELLED';
  const isPendingOnline = isOnline && !isPaid && !isFailedOrCancelled;
  const isInvoiceEligible = order.payment_method === 'COD' || isPaid;

  const handleInvoiceAction = async (action: 'view' | 'download') => {
    if (!token) {
      setInvoiceFeedback('Please log in to access your invoice.');
      return;
    }
    setDownloadingInvoice(action);
    setInvoiceFeedback(null);
    try {
      await viewOrDownloadInvoice(token, order.id, action);
    } catch (err: any) {
      setInvoiceFeedback(err?.message || 'Failed to retrieve invoice. Please try again.');
    } finally {
      setDownloadingInvoice(null);
    }
  };

  const handleCheckStatus = async () => {
    if (!onRefreshOrderStatus) return;
    setChecking(true);
    setCheckMessage(null);
    try {
      await onRefreshOrderStatus(order.id);
      setCheckMessage('Status refreshed.');
    } catch (err: any) {
      setCheckMessage(err.message || 'Could not verify status. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  // Determine Hero styling based on order & payment state
  let heroIcon = '✓';
  let heroIconBg = '#10B981';
  let heroTitle = 'Order Placed Successfully! 🎉';
  let heroSubtitle = 'Thank you for supporting your local neighborhood store. Your order has been placed and confirmed.';

  if ((order.status || '').toUpperCase() === 'ACCEPTED') {
    heroIcon = '✓';
    heroIconBg = '#10B981';
    heroTitle = 'Order Accepted by Store! 🎉';
    heroSubtitle = 'The shopkeeper has accepted your order and will begin processing it.';
  } else if ((order.status || '').toUpperCase() === 'PREPARING') {
    heroIcon = '👨‍🍳';
    heroIconBg = '#F59E0B';
    heroTitle = 'Order Being Prepared! 👨‍🍳';
    heroSubtitle = 'The store is currently packaging your fresh grocery items.';
  } else if ((order.status || '').toUpperCase() === 'OUT_FOR_DELIVERY') {
    heroIcon = '🚚';
    heroIconBg = '#4F46E5';
    heroTitle = 'Out for Delivery! 🚚';
    heroSubtitle = 'Your order is dispatched and on its way to your delivery address!';
  } else if ((order.status || '').toUpperCase() === 'CANCELLED') {
    heroIcon = '✕';
    heroIconBg = '#EF4444';
    heroTitle = 'Order Cancelled by Shopkeeper';
    heroSubtitle = order.cancellation_reason
      ? `This order was cancelled by the store: ${order.cancellation_reason}`
      : 'This order was cancelled by the store.';
  } else if (!isOnline) {
    // COD Order
    heroIcon = '✓';
    heroIconBg = '#10B981';
    heroTitle = 'Order Placed Successfully! 🎉';
    heroSubtitle = 'Thank you for supporting your local neighborhood store. Your Cash on Delivery order has been sent to the store.';
  } else if (isPaid) {
    // Online PAID (Order remains PENDING until shopkeeper accepts)
    heroIcon = '✓';
    heroIconBg = '#10B981';
    heroTitle = 'Payment Successful! 🎉';
    heroSubtitle = 'Your payment has been verified via Stripe. Your order is pending store confirmation and has been sent to the shopkeeper.';
  } else if (isPendingOnline) {
    // Online PENDING
    heroIcon = '⏳';
    heroIconBg = '#F59E0B';
    heroTitle = 'Payment Pending ⏳';
    heroSubtitle = 'We are awaiting confirmation of your Stripe payment. Your order will be sent to the store once payment is verified.';
  } else if (isFailedOrCancelled) {
    // Online FAILED or CANCELLED
    heroIcon = '✕';
    heroIconBg = '#EF4444';
    heroTitle = 'Payment Failed or Cancelled ❌';
    heroSubtitle = 'Your online payment was cancelled or could not be completed. Any reserved stock has been safely restored.';
  }

  // Derive Order Fulfillment Status independently
  const normalizedOrderStatus = (order.status || 'PENDING').toUpperCase();
  let orderStatusText = 'PENDING';
  let orderStatusClass = 'status-pending';

  if (normalizedOrderStatus === 'ACCEPTED') {
    orderStatusText = 'ACCEPTED';
    orderStatusClass = 'status-accepted';
  } else if (normalizedOrderStatus === 'PREPARING') {
    orderStatusText = 'PREPARING';
    orderStatusClass = 'status-preparing';
  } else if (normalizedOrderStatus === 'OUT_FOR_DELIVERY') {
    orderStatusText = 'OUT FOR DELIVERY';
    orderStatusClass = 'status-out_for_delivery';
  } else if (normalizedOrderStatus === 'DELIVERED' || normalizedOrderStatus === 'COMPLETED') {
    orderStatusText = 'DELIVERED';
    orderStatusClass = 'status-delivered';
  } else if (normalizedOrderStatus === 'CANCELLED') {
    orderStatusText = 'CANCELLED';
    orderStatusClass = 'status-cancelled';
  } else {
    // Keep fulfillment status as PENDING until shopkeeper accepts
    orderStatusText = 'PENDING';
    orderStatusClass = 'status-pending';
  }

  // Derive Payment Status independently
  const normalizedPaymentStatus = (order.payment_status || '').toUpperCase();
  let paymentStatusText = 'PENDING';
  let paymentStatusClass = 'status-pending';
  let paymentStatusStyle: React.CSSProperties = {
    background: '#FEF3C7',
    color: '#92400E',
    border: '1px solid #FCD34D',
  };

  if (isPaid || normalizedPaymentStatus === 'PAID') {
    paymentStatusText = 'PAID ✅';
    paymentStatusClass = 'status-paid';
    paymentStatusStyle = {
      background: '#D1FAE5',
      color: '#065F46',
      border: '1px solid #A7F3D0',
    };
  } else if (normalizedPaymentStatus === 'FAILED' || (isOnline && isFailedOrCancelled)) {
    paymentStatusText = 'FAILED ❌';
    paymentStatusClass = 'status-cancelled';
    paymentStatusStyle = {
      background: '#FEE2E2',
      color: '#991B1B',
      border: '1px solid #FECACA',
    };
  } else if (normalizedPaymentStatus === 'CANCELLED') {
    paymentStatusText = 'CANCELLED';
    paymentStatusClass = 'status-cancelled';
    paymentStatusStyle = {
      background: '#FEE2E2',
      color: '#991B1B',
      border: '1px solid #FECACA',
    };
  } else if (isPendingOnline) {
    paymentStatusText = 'PENDING ⏳';
    paymentStatusClass = 'status-pending';
    paymentStatusStyle = {
      background: '#FEF3C7',
      color: '#92400E',
      border: '1px solid #FCD34D',
    };
  } else {
    paymentStatusText = normalizedPaymentStatus || 'PENDING';
    paymentStatusClass = 'status-pending';
    paymentStatusStyle = {
      background: '#FEF3C7',
      color: '#92400E',
      border: '1px solid #FCD34D',
    };
  }

  return (
    <div className="order-success-container">
      {/* Hero Card */}
      <div className="order-success-hero">
        <div
          className="order-success-check-badge"
          style={{ background: heroIconBg, color: '#FFFFFF' }}
        >
          {heroIcon}
        </div>
        <h1 className="order-success-title">{heroTitle}</h1>
        <p className="order-success-subtitle">{heroSubtitle}</p>

        <div className="order-success-meta-bar">
          <div className="meta-pill">
            <span className="meta-label">Order ID:</span>
            <strong className="meta-val">#{order.id}</strong>
          </div>
          <div className="meta-pill">
            <span className="meta-label">Order Status:</span>
            <span className={`order-status-badge ${orderStatusClass}`}>
              {orderStatusText}
            </span>
          </div>
          <div className="meta-pill">
            <span className="meta-label">Payment Status:</span>
            <span
              className={`order-status-badge ${paymentStatusClass}`}
              style={paymentStatusStyle}
            >
              {paymentStatusText}
            </span>
          </div>
          <div className="meta-pill">
            <span className="meta-label">Amount:</span>
            <strong className="meta-val">₹{Number(order.total).toFixed(2)}</strong>
          </div>
          <div className="meta-pill">
            <span className="meta-label">Payment:</span>
            <strong className="meta-val">
              {isOnline ? '💳 Online Payment (Stripe)' : '💵 Cash on Delivery (COD)'}
            </strong>
          </div>
          <div className="meta-pill">
            <span className="meta-label">Delivery:</span>
            <strong className="meta-val">
              {(order.delivery_method || 'HAND_TO_CUSTOMER') === 'LEAVE_AT_DOOR'
                ? '🚪 Leave at Door'
                : '🤝 Hand to Customer'}
            </strong>
          </div>
        </div>
      </div>

      {/* Explanatory Banner for Pending or Cancelled Online Payments */}
      {isPendingOnline && (
        <div
          className="alert alert-warning"
          style={{
            margin: '1.5rem 0',
            padding: '1.25rem',
            borderRadius: 'var(--radius-md, 8px)',
            background: '#FFFBEB',
            border: '1px solid #FCD34D',
            color: '#92400E',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '1rem' }}>
            <span>⏳</span>
            <span>Why is my payment pending?</span>
          </div>
          <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.5, color: '#78350F' }}>
            Your order items are temporarily reserved while Stripe processes your transaction. As soon as your payment is verified, this order will automatically become confirmed and be sent to the store runner.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.25rem', flexWrap: 'wrap' }}>
            {onRefreshOrderStatus && (
              <button
                type="button"
                onClick={handleCheckStatus}
                disabled={checking}
                className="button button-sm button-secondary"
                style={{ background: '#FFFFFF', borderColor: '#F59E0B', color: '#92400E' }}
              >
                {checking ? 'Checking Status...' : '🔄 Re-check Payment Status'}
              </button>
            )}
            {checkMessage && (
              <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{checkMessage}</span>
            )}
          </div>
        </div>
      )}

      {isFailedOrCancelled && (
        <div
          className="alert alert-error"
          style={{
            margin: '1.5rem 0',
            padding: '1.25rem',
            borderRadius: 'var(--radius-md, 8px)',
            background: '#FEF2F2',
            border: '1px solid #FCA5A5',
            color: '#991B1B',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '1rem' }}>
            <span>⚠️</span>
            <span>Payment Incomplete or Cancelled</span>
          </div>
          <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.5, color: '#7F1D1D' }}>
            The checkout session was not completed, and this order has not been placed with the shopkeeper. No funds were captured. Any reserved inventory has been automatically released back to the store.
          </p>
          {onReturnToCart && (
            <div style={{ marginTop: '0.25rem' }}>
              <button
                type="button"
                onClick={onReturnToCart}
                className="button button-sm button-primary"
              >
                🛒 Return to Cart to Retry
              </button>
            </div>
          )}
        </div>
      )}

      {/* Explanatory Banner for Cancelled Paid Online Orders (Refund Initiated) */}
      {(order.status || '').toUpperCase() === 'CANCELLED' && isOnline && (isPaid || order.refund_status === 'REFUND_INITIATED') && (
        <div
          className="alert alert-warning"
          style={{
            margin: '1.5rem 0',
            padding: '1.25rem',
            borderRadius: 'var(--radius-md, 8px)',
            background: '#FFFBEB',
            border: '1px solid #FCD34D',
            color: '#92400E',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '1rem' }}>
            <span>💳</span>
            <span>Refund Information</span>
          </div>
          <p style={{ margin: 0, fontSize: '0.925rem', fontWeight: 600, color: '#B45309' }}>
            Order cancelled by shopkeeper.
          </p>
          <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.5, color: '#78350F' }}>
            Your payment refund has been initiated.
          </p>
          <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600, color: '#92400E' }}>
            Expected refund: 1–2 business days.
          </p>
          {order.stripe_payment_intent_id && (
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', fontFamily: 'monospace', color: '#78350F' }}>
              Original Payment Reference: {order.stripe_payment_intent_id}
            </p>
          )}
          <span style={{ fontSize: '0.75rem', color: '#A16207', fontStyle: 'italic' }}>
            * Note: Stripe Test Mode simulated order. No real currency was collected or transferred.
          </span>
        </div>
      )}

      {/* Details Grid: Shop, Delivery Address, Payment Mode */}
      <div className="order-success-details-grid">
        {/* Fulfilling Shop Card */}
        <div className="success-info-card">
          <div className="info-card-header">
            <span className="info-card-icon">🏪</span>
            <h3>Fulfilling Store</h3>
          </div>
          <div className="info-card-body">
            <h4 className="store-name">{shop.name || 'Neighborhood Store'}</h4>
            <p className="store-address">📍 {shop.address || 'Local Market'}, {shop.city || ''}</p>
            {shop.phone && (
              <p className="store-contact">📞 {shop.phone}</p>
            )}
            <div className="store-fulfill-badge">Local Store Runner Delivery</div>
          </div>
        </div>

        {/* Delivery Address Card */}
        <div className="success-info-card">
          <div className="info-card-header">
            <span className="info-card-icon">📍</span>
            <h3>Delivery Address</h3>
          </div>
          <div className="info-card-body">
            <h4 className="recipient-name">{delivery.name}</h4>
            <p className="recipient-phone">📞 {delivery.phone}</p>
            <p className="recipient-street">{delivery.address}</p>
            <p className="recipient-locality">
              {delivery.city}, {delivery.state} - {delivery.pincode}
            </p>
          </div>
        </div>

        {/* Payment Settlement Card */}
        <div className="success-info-card">
          <div className="info-card-header">
            <span className="info-card-icon">{isOnline ? '💳' : '💵'}</span>
            <h3>Payment Settlement</h3>
          </div>
          <div className="info-card-body">
            {isOnline ? (
              isPaid ? (
                <>
                  <h4 style={{ color: '#065F46', fontWeight: 700 }}>
                    Paid via Stripe Test Mode
                  </h4>
                  <p style={{ fontSize: '0.875rem', color: 'var(--color-text-body)', marginTop: '0.35rem' }}>
                    Total of <strong>₹{Number(order.total).toFixed(2)}</strong> settled online. No cash collection required upon delivery.
                  </p>
                  {order.stripe_payment_intent_id && (
                    <p style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                      Payment Ref: {order.stripe_payment_intent_id}
                    </p>
                  )}
                  <div className="cod-security-tag" style={{ background: '#ECFDF5', color: '#065F46', borderColor: '#A7F3D0' }}>
                    ✓ Instant Stripe Test Verification
                  </div>
                </>
              ) : isPendingOnline ? (
                <>
                  <h4 style={{ color: '#92400E', fontWeight: 700 }}>
                    Awaiting Stripe Confirmation
                  </h4>
                  <p style={{ fontSize: '0.875rem', color: 'var(--color-text-body)', marginTop: '0.35rem' }}>
                    Amount due: <strong>₹{Number(order.total).toFixed(2)}</strong>. Verification is in progress.
                  </p>
                  <div className="cod-security-tag" style={{ background: '#FEF3C7', color: '#92400E', borderColor: '#FCD34D' }}>
                    ⏳ Payment Pending
                  </div>
                </>
              ) : (
                <>
                  <h4 style={{ color: '#991B1B', fontWeight: 700 }}>
                    Payment Not Completed
                  </h4>
                  <p style={{ fontSize: '0.875rem', color: 'var(--color-text-body)', marginTop: '0.35rem' }}>
                    Transaction was cancelled or failed. Order is inactive.
                  </p>
                </>
              )
            ) : (
              <>
                <h4 style={{ color: 'var(--color-primary)', fontWeight: 700 }}>
                  Cash on Delivery (COD)
                </h4>
                <p style={{ fontSize: '0.875rem', color: 'var(--color-text-body)', marginTop: '0.35rem' }}>
                  Please keep exact change of <strong>₹{Number(order.total).toFixed(2)}</strong> ready when the store runner arrives.
                </p>
                <div className="cod-security-tag">
                  🔒 No advance payment taken
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Purchased Items List */}
      <div className="success-items-card">
        <h3 className="success-items-title">Ordered Items ({items.length})</h3>
        <div className="success-items-table">
          <div className="items-table-header">
            <span className="col-item">Product</span>
            <span className="col-price">Unit Price</span>
            <span className="col-qty">Quantity</span>
            <span className="col-subtotal">Subtotal</span>
          </div>
          <div className="items-table-body">
            {items.map((it) => (
              <div key={it.id} className="items-table-row">
                <div className="col-item">
                  <strong>{it.product_name}</strong>
                  {it.unit_label && <span className="item-unit-tag">({it.unit_label})</span>}
                </div>
                <div className="col-price">₹{Number(it.unit_price).toFixed(2)}</div>
                <div className="col-qty">× {it.quantity}</div>
                <div className="col-subtotal">₹{Number(it.subtotal).toFixed(2)}</div>
              </div>
            ))}
          </div>
          <div className="items-table-footer">
            <div className="footer-row">
              <span>Items Subtotal</span>
              <span>₹{Number(order.subtotal).toFixed(2)}</span>
            </div>
            <div className="footer-row">
              <span>Neighborhood Delivery</span>
              <span className="summary-free">Free</span>
            </div>
            <div className="footer-total-row">
              <span>Grand Total</span>
              <span className="grand-total-val">₹{Number(order.total).toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Invoice Card */}
      <div className="success-items-card" style={{ marginTop: '1.25rem', border: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-text-main)' }}>
              <span>📄</span> Order Invoice & Receipt
            </h3>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
              {isInvoiceEligible
                ? (order.status === 'CANCELLED'
                    ? (order.payment_method === 'ONLINE' ? 'Cancelled invoice record (Refund initiated).' : 'Cancelled invoice record (Order not fulfilled).')
                    : (order.invoice?.invoice_number ? `Invoice #${order.invoice.invoice_number} is available.` : 'Official order snapshot invoice is ready.'))
                : isPendingOnline
                ? 'Invoice will become available automatically once online payment is confirmed.'
                : 'Invoice is not available for unpaid online orders.'}
            </p>
          </div>

          {isInvoiceEligible && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="button button-ghost"
                style={{ fontSize: '0.875rem', padding: '0.45rem 0.9rem' }}
                disabled={downloadingInvoice !== null}
                onClick={() => handleInvoiceAction('view')}
              >
                {downloadingInvoice === 'view' ? 'Opening...' : '📄 View Invoice'}
              </button>
              <button
                type="button"
                className="button button-secondary"
                style={{ fontSize: '0.875rem', padding: '0.45rem 0.9rem' }}
                disabled={downloadingInvoice !== null}
                onClick={() => handleInvoiceAction('download')}
              >
                {downloadingInvoice === 'download' ? 'Downloading...' : '⬇️ Download PDF'}
              </button>
            </div>
          )}
        </div>
        {invoiceFeedback && (
          <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: '#dc2626' }}>
            {invoiceFeedback}
          </div>
        )}
      </div>

      {/* Navigation and Next Steps */}
      <div className="order-success-actions">
        {isFailedOrCancelled ? (
          <>
            {onReturnToCart && (
              <button
                type="button"
                onClick={onReturnToCart}
                className="button button-primary"
              >
                🛒 Return to Cart / Retry Checkout
              </button>
            )}
            <button
              type="button"
              onClick={onContinueShopping}
              className="button button-secondary"
            >
              Browse Neighborhood Shops
            </button>
            <button
              type="button"
              onClick={onViewAllOrders}
              className="button button-ghost"
            >
              My Orders History
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onViewOrderDetail(order.id)}
              className="button button-primary"
            >
              View Order Details →
            </button>
            <button
              type="button"
              onClick={onViewAllOrders}
              className="button button-secondary"
            >
              My Orders History
            </button>
            <button
              type="button"
              onClick={onContinueShopping}
              className="button button-ghost"
            >
              Continue Shopping
            </button>
          </>
        )}
      </div>
    </div>
  );
};
