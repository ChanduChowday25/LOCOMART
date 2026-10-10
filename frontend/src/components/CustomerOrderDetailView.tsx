import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchOrderById, regenerateDeliveryOtp, viewOrDownloadInvoice } from '../api/client';
import type { OrderDetails } from '../api/client';

interface CustomerOrderDetailViewProps {
  orderId: string;
  onBack: () => void;
  onNavigateToShops: () => void;
}

export const CustomerOrderDetailView: React.FC<CustomerOrderDetailViewProps> = ({
  orderId,
  onBack,
  onNavigateToShops,
}) => {
  const { token } = useAuth();
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRegeneratingOtp, setIsRegeneratingOtp] = useState(false);
  const [otpFeedback, setOtpFeedback] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState<number>(0);
  const [downloadingInvoice, setDownloadingInvoice] = useState<'view' | 'download' | null>(null);
  const [invoiceFeedback, setInvoiceFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (typeof order?.delivery_otp?.cooldown_seconds_remaining === 'number') {
      setCooldownSeconds(order.delivery_otp.cooldown_seconds_remaining);
    }
  }, [order?.delivery_otp?.cooldown_seconds_remaining]);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const interval = setInterval(() => {
      setCooldownSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [cooldownSeconds]);

  const loadOrderDetail = async () => {
    if (!token || !orderId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchOrderById(token, orderId);
      setOrder(res.order || (res as any));
    } catch (err: any) {
      setError(err.message || 'Unable to retrieve order details.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateOtp = async () => {
    if (!token || !orderId || isRegeneratingOtp || cooldownSeconds > 0) return;
    if (order?.delivery_otp?.regenerations_remaining === 0) return;
    setIsRegeneratingOtp(true);
    setOtpFeedback(null);
    try {
      const res = await regenerateDeliveryOtp(token, orderId);
      setOrder((prev) => (prev ? { ...prev, delivery_otp: res.delivery_otp } : prev));
      if (typeof res.delivery_otp?.cooldown_seconds_remaining === 'number') {
        setCooldownSeconds(res.delivery_otp.cooldown_seconds_remaining);
      } else {
        setCooldownSeconds(60);
      }
      setOtpFeedback('New delivery OTP generated successfully!');
    } catch (err: any) {
      const errMsg = err.message || 'Failed to generate new OTP.';
      setOtpFeedback(errMsg);
      const match = errMsg.match(/wait (\d+) seconds/i);
      if (match && match[1]) {
        setCooldownSeconds(parseInt(match[1], 10));
      }
    } finally {
      setIsRegeneratingOtp(false);
    }
  };

  const handleInvoiceAction = async (action: 'view' | 'download') => {
    if (!token || !order) return;
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

  useEffect(() => {
    loadOrderDetail();
  }, [orderId, token]);

  const formatDate = (isoStr?: string) => {
    if (!isoStr) return '';
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  if (loading) {
    return (
      <div className="order-detail-container">
        <div className="loading-state-box">
          <div className="spinner"></div>
          <p>Retrieving order details #{orderId}...</p>
        </div>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="order-detail-container">
        <button
          type="button"
          onClick={onBack}
          className="button button-sm button-ghost"
          style={{ marginBottom: '1rem' }}
        >
          ← Back to My Orders
        </button>
        <div className="alert alert-error" role="alert">
          <span className="alert-icon">⚠️</span>
          <div>
            <h4>Failed to load order #{orderId}</h4>
            <p>{error || 'Order record could not be found or you do not have permission to view it.'}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={loadOrderDetail}
          className="button button-secondary"
          style={{ marginTop: '1rem' }}
        >
          Retry
        </button>
      </div>
    );
  }

  const delivery = order.delivery_address || {};
  const shop = order.shop || {};
  const items = order.items || [];

  return (
    <div className="order-detail-container">
      {/* Top Navigation */}
      <div className="order-detail-top-nav" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button
          type="button"
          onClick={onBack}
          className="button button-sm button-ghost order-detail-back-btn"
        >
          ← Back to My Orders
        </button>
        <button
          type="button"
          onClick={loadOrderDetail}
          className="button button-sm button-ghost"
          style={{ fontSize: '0.825rem', color: '#475569', border: '1px solid #CBD5E1' }}
          title="Refresh current order and invoice status"
        >
          🔄 Refresh Status
        </button>
      </div>

      {/* Main Order Header Banner */}
      <div className="order-detail-header-card">
        <div className="header-card-left">
          <div className="order-title-row">
            <h1>Order #{order.id}</h1>
            <span className={`order-status-badge status-${order.status?.toLowerCase() || 'created'}`}>
              {order.status === 'CREATED' ? 'Order Placed' : order.status?.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="order-placed-time">
            Placed on <strong>{formatDate(order.created_at)}</strong>
          </p>
        </div>

        <div className="header-card-right">
          <div className="header-total-due">
            <span className="due-label">
              {order.payment_method === 'ONLINE'
                ? (order.payment_status === 'PAID' ? 'Total Paid (Online):' : 'Total (Online Pending):')
                : 'Total to Pay (COD):'}
            </span>
            <span className="due-amount">₹{Number(order.total).toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* M9: Invoice Bar Card */}
      {(() => {
        const isInvoiceEligible = order.payment_method === 'COD' || order.payment_status === 'PAID';
        const isPendingOnline = order.payment_method === 'ONLINE' && order.payment_status !== 'PAID' && order.status !== 'CANCELLED';
        const isCancelled = order.status === 'CANCELLED';
        return (
          <div
            style={{
              background: '#FFFFFF',
              border: '1px solid #E2E8F0',
              borderRadius: '12px',
              padding: '1rem 1.25rem',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.5rem' }}>📄</span>
              <div>
                <div style={{ fontWeight: 600, color: '#1E293B', fontSize: '0.95rem' }}>
                  Order Invoice & Receipt {order.invoice?.invoice_number ? `(#${order.invoice.invoice_number})` : ''}
                </div>
                <div style={{ fontSize: '0.825rem', color: '#64748B' }}>
                  {isInvoiceEligible
                    ? (isCancelled
                        ? (order.payment_method === 'ONLINE' ? 'Cancelled invoice record (Refund initiated).' : 'Cancelled invoice record (Order not fulfilled).')
                        : (order.invoice?.invoice_number ? `Invoice #${order.invoice.invoice_number} is ready for view/download.` : 'Immutable snapshot receipt available.'))
                    : isPendingOnline
                    ? 'Invoice will become available once online payment is confirmed.'
                    : 'Invoice is not available for unpaid online orders.'}
                </div>
                {invoiceFeedback && (
                  <div style={{ color: '#DC2626', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    {invoiceFeedback}
                  </div>
                )}
              </div>
            </div>

            {isInvoiceEligible && (
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="button button-sm button-ghost"
                  style={{ border: '1px solid #CBD5E1', color: '#334155' }}
                  disabled={downloadingInvoice !== null}
                  onClick={() => handleInvoiceAction('view')}
                >
                  {downloadingInvoice === 'view' ? 'Opening...' : '📄 View Invoice'}
                </button>
                <button
                  type="button"
                  className="button button-sm button-secondary"
                  disabled={downloadingInvoice !== null}
                  onClick={() => handleInvoiceAction('download')}
                >
                  {downloadingInvoice === 'download' ? 'Downloading...' : '⬇️ Download PDF'}
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* M7.1 & M7.2 Order Status Alerts for Customer */}
      {(order.status || '').toUpperCase() === 'ACCEPTED' && (
        <div
          className="alert alert-success"
          style={{
            marginBottom: '1.5rem',
            background: '#ECFDF5',
            border: '1px solid #A7F3D0',
            color: '#065F46',
            borderRadius: 'var(--radius-md, 8px)',
            padding: '1rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <span style={{ fontSize: '1.25rem' }}>✓</span>
          <div>
            <strong style={{ display: 'block' }}>Order Accepted by Store</strong>
            <span style={{ fontSize: '0.875rem' }}>
              The shopkeeper has reviewed and accepted your order.
            </span>
          </div>
        </div>
      )}

      {(order.status || '').toUpperCase() === 'PREPARING' && (
        <div
          className="alert alert-warning"
          style={{
            marginBottom: '1.5rem',
            background: '#FEF3C7',
            border: '1px solid #FDE68A',
            color: '#92400E',
            borderRadius: 'var(--radius-md, 8px)',
            padding: '1rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <span style={{ fontSize: '1.25rem' }}>👨‍🍳</span>
          <div>
            <strong style={{ display: 'block' }}>Order Being Prepared</strong>
            <span style={{ fontSize: '0.875rem' }}>
              The store is currently packaging your grocery items.
            </span>
          </div>
        </div>
      )}

      {(order.status || '').toUpperCase() === 'OUT_FOR_DELIVERY' && (
        <div style={{ marginBottom: '1.5rem' }}>
          {(order.delivery_method || 'HAND_TO_CUSTOMER') === 'LEAVE_AT_DOOR' ? (
            <div
              className="alert alert-info"
              style={{
                background: '#EEF2FF',
                border: '1px solid #C7D2FE',
                color: '#3730A3',
                borderRadius: 'var(--radius-md, 8px)',
                padding: '1.25rem',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
              }}
            >
              <span style={{ fontSize: '1.75rem' }}>🚪</span>
              <div>
                <strong style={{ display: 'block', fontSize: '1.05rem', color: '#312E81' }}>
                  Out for Delivery — Leave at Door (Contactless)
                </strong>
                <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.9rem', color: '#4338CA' }}>
                  Your order is on the way! The delivery partner will leave your grocery package at your doorstep.
                  <strong> No OTP verification is required.</strong>
                </p>
              </div>
            </div>
          ) : (
            <div
              className="delivery-otp-customer-card"
              style={{
                background: '#F8FAFC',
                border: '2px solid #6366F1',
                borderRadius: '12px',
                padding: '1.5rem',
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.1)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.75rem' }}>🚚</span>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#1E1B4B' }}>Out for Delivery — Delivery OTP</h3>
                    <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.875rem', color: '#4B5563' }}>
                      Share this OTP with the shopkeeper when your order arrives.
                    </p>
                  </div>
                </div>
                <span
                  style={{
                    background: '#EEF2FF',
                    color: '#4338CA',
                    padding: '0.35rem 0.75rem',
                    borderRadius: '20px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    letterSpacing: '0.5px',
                  }}
                >
                  🤝 HAND TO CUSTOMER
                </span>
              </div>

              {/* 6-Digit Code Display */}
              <div
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: '10px',
                  padding: '1.25rem',
                  textAlign: 'center',
                  margin: '1rem 0',
                }}
              >
                {order.delivery_otp?.code ? (
                  <>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '0.75rem' }}>
                      Your 6-Digit Delivery OTP
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'center',
                        gap: '0.5rem',
                        marginBottom: '0.75rem',
                      }}
                    >
                      {order.delivery_otp.code.split('').map((digit, idx) => (
                        <span
                          key={idx}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '46px',
                            height: '56px',
                            fontSize: '1.75rem',
                            fontWeight: 800,
                            fontFamily: 'monospace',
                            background: '#F1F5F9',
                            color: '#1E293B',
                            border: '2px solid #CBD5E1',
                            borderRadius: '8px',
                            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)',
                          }}
                        >
                          {digit}
                        </span>
                      ))}
                    </div>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: '#059669', fontWeight: 600 }}>
                      ✓ Valid OTP • Share with runner at your doorstep
                    </p>
                  </>
                ) : (
                  <div style={{ padding: '0.5rem' }}>
                    <div style={{ color: '#DC2626', fontWeight: 700, fontSize: '1rem', marginBottom: '0.5rem' }}>
                      {order.delivery_otp?.is_locked
                        ? '⚠️ OTP Locked (5 Failed Verification Attempts)'
                        : '⚠️ Delivery OTP Expired (10-Minute Validity)'}
                    </div>
                    <p style={{ margin: '0 0 0.75rem 0', fontSize: '0.875rem', color: '#4B5563' }}>
                      Please generate a new delivery OTP below so the shopkeeper can verify handover.
                    </p>
                  </div>
                )}
              </div>

              {/* Expiry & Actions Row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '1rem',
                  fontSize: '0.85rem',
                  color: '#4B5563',
                  borderTop: '1px solid #E2E8F0',
                  paddingTop: '0.75rem',
                }}
              >
                <div>
                  {order.delivery_otp?.expires_at && (
                    <div>
                      🕒 <strong>Validity:</strong> 10 minutes (expires{' '}
                      {formatDate(order.delivery_otp.expires_at)})
                    </div>
                  )}
                  {typeof order.delivery_otp?.attempt_count === 'number' && order.delivery_otp.attempt_count > 0 && (
                    <div style={{ color: '#B45309', marginTop: '0.2rem' }}>
                      ⚠️ Verification attempts: {order.delivery_otp.attempt_count} of 5
                    </div>
                  )}
                  {typeof order.delivery_otp?.regenerations_remaining === 'number' && (
                    <div
                      style={{
                        color: order.delivery_otp.regenerations_remaining === 0 ? '#DC2626' : '#6B7280',
                        marginTop: '0.2rem',
                        fontWeight: order.delivery_otp.regenerations_remaining === 0 ? 600 : 400,
                      }}
                    >
                      🔄 Regenerations remaining: {order.delivery_otp.regenerations_remaining} of{' '}
                      {order.delivery_otp.max_regenerations ?? 5}
                    </div>
                  )}
                  {cooldownSeconds > 0 && (
                    <div style={{ color: '#D97706', marginTop: '0.2rem', fontWeight: 600 }}>
                      ⏳ Cooldown active: retry in {cooldownSeconds}s
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleRegenerateOtp}
                  disabled={
                    isRegeneratingOtp ||
                    cooldownSeconds > 0 ||
                    order.delivery_otp?.regenerations_remaining === 0
                  }
                  className="button button-sm button-secondary"
                  style={{
                    background:
                      cooldownSeconds > 0 || order.delivery_otp?.regenerations_remaining === 0
                        ? '#F3F4F6'
                        : '#FFFFFF',
                    border:
                      order.delivery_otp?.regenerations_remaining === 0
                        ? '1px solid #D1D5DB'
                        : cooldownSeconds > 0
                        ? '1px solid #FCD34D'
                        : '1px solid #6366F1',
                    color:
                      order.delivery_otp?.regenerations_remaining === 0
                        ? '#9CA3AF'
                        : cooldownSeconds > 0
                        ? '#D97706'
                        : '#4F46E5',
                    fontWeight: 600,
                    cursor:
                      cooldownSeconds > 0 || order.delivery_otp?.regenerations_remaining === 0
                        ? 'not-allowed'
                        : 'pointer',
                  }}
                >
                  {isRegeneratingOtp
                    ? 'Generating...'
                    : order.delivery_otp?.regenerations_remaining === 0
                    ? '🚫 Max Limit Reached'
                    : cooldownSeconds > 0
                    ? `⏳ Wait ${cooldownSeconds}s`
                    : '🔄 Generate New OTP'}
                </button>
              </div>

              {otpFeedback && (
                <div
                  style={{
                    marginTop: '0.75rem',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    color: otpFeedback.includes('successfully') ? '#059669' : '#DC2626',
                  }}
                >
                  {otpFeedback}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {(order.status || '').toUpperCase() === 'DELIVERED' && (
        <div
          className="alert alert-success"
          style={{
            marginBottom: '1.5rem',
            background: '#ECFDF5',
            border: '1px solid #A7F3D0',
            color: '#065F46',
            borderRadius: 'var(--radius-md, 8px)',
            padding: '1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          <span style={{ fontSize: '2rem' }}>🎉</span>
          <div>
            <strong style={{ display: 'block', fontSize: '1.1rem', color: '#065F46' }}>
              Order Delivered Successfully!
            </strong>
            <span style={{ fontSize: '0.9rem', color: '#047857' }}>
              Your neighborhood grocery order has been delivered and verified. Thank you for shopping with LOCOMART!
            </span>
          </div>
        </div>
      )}

      {(order.status || '').toUpperCase() === 'CANCELLED' && (
        <div
          className="alert alert-error"
          style={{
            marginBottom: '1.5rem',
            background: '#FEF2F2',
            border: '1px solid #FECACA',
            color: '#991B1B',
            borderRadius: 'var(--radius-md, 8px)',
            padding: '1.25rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.25rem' }}>✕</span>
            <div>
              <strong style={{ display: 'block', fontSize: '1rem' }}>Order Cancelled by Shopkeeper</strong>
              <span style={{ fontSize: '0.875rem' }}>
                {order.cancellation_reason
                  ? `Cancellation Reason: ${order.cancellation_reason}`
                  : 'This order was cancelled by the store. Reserved inventory was restored.'}
              </span>
            </div>
          </div>

          {order.payment_method === 'ONLINE' &&
            (order.payment_status === 'PAID' || order.refund_status === 'REFUND_INITIATED') && (
              <div
                style={{
                  marginTop: '0.5rem',
                  padding: '0.75rem 1rem',
                  background: '#FFFBEB',
                  border: '1px solid #FCD34D',
                  borderRadius: '6px',
                  color: '#92400E',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.25rem',
                  fontSize: '0.875rem',
                }}
              >
                <div style={{ fontWeight: 700, color: '#B45309' }}>
                  💳 Refund Details:
                </div>
                <div>Order cancelled by shopkeeper.</div>
                <div style={{ fontWeight: 600 }}>Your payment refund has been initiated.</div>
                <div>Expected refund: 1–2 business days.</div>
                {order.stripe_payment_intent_id && (
                  <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    Payment Reference: {order.stripe_payment_intent_id}
                  </div>
                )}
                <div style={{ fontSize: '0.75rem', fontStyle: 'italic', color: '#A16207', marginTop: '0.25rem' }}>
                  * Portfolio/Test-mode simulation. Original Stripe payment reference is preserved.
                </div>
              </div>
            )}
        </div>
      )}

      {/* 3-Column Info Cards: Shop, Delivery Address, Payment Mode */}
      <div className="order-detail-grid">
        {/* Card 1: Fulfilling Store */}
        <div className="detail-info-card">
          <div className="detail-card-header">
            <span className="card-icon">🏪</span>
            <h3>Fulfilling Store</h3>
          </div>
          <div className="detail-card-content">
            <strong className="detail-shop-name">{shop.name || 'Neighborhood Provision Store'}</strong>
            <p className="detail-text">📍 {shop.address || 'Local Market'}, {shop.city || ''}</p>
            {shop.phone && (
              <p className="detail-text">📞 {shop.phone}</p>
            )}
            <span className="detail-badge-pill">Local Neighborhood Partner</span>
          </div>
        </div>

        {/* Card 2: Delivery Address Snapshot */}
        <div className="detail-info-card">
          <div className="detail-card-header">
            <span className="card-icon">📍</span>
            <h3>Delivery Address (Snapshot)</h3>
          </div>
          <div className="detail-card-content">
            <strong className="detail-recipient-name">{delivery.name}</strong>
            <p className="detail-text">📞 {delivery.phone}</p>
            <p className="detail-text">{delivery.address}</p>
            <p className="detail-text">
              {delivery.city}, {delivery.state} - <strong>{delivery.pincode}</strong>
            </p>
          </div>
        </div>

        {/* Card 3: Delivery Method */}
        <div className="detail-info-card">
          <div className="detail-card-header">
            <span className="card-icon">
              {(order.delivery_method || 'HAND_TO_CUSTOMER') === 'LEAVE_AT_DOOR' ? '🚪' : '🤝'}
            </span>
            <h3>Delivery Method</h3>
          </div>
          <div className="detail-card-content">
            {(order.delivery_method || 'HAND_TO_CUSTOMER') === 'LEAVE_AT_DOOR' ? (
              <>
                <strong style={{ color: 'var(--color-primary)' }}>Leave at Door</strong>
                <p className="detail-text" style={{ marginTop: '0.35rem' }}>
                  Contactless drop-off at your doorstep.
                </p>
                <div className="cod-security-tag" style={{ marginTop: '0.65rem', background: '#F1F5F9', color: '#475569', borderColor: '#CBD5E1' }}>
                  ✓ No OTP Required
                </div>
              </>
            ) : (
              <>
                <strong style={{ color: 'var(--color-primary)' }}>Hand to Customer</strong>
                <p className="detail-text" style={{ marginTop: '0.35rem' }}>
                  Direct handover verified via 6-digit delivery OTP.
                </p>
                <div className="cod-security-tag" style={{ marginTop: '0.65rem', background: '#EEF2FF', color: '#4338CA', borderColor: '#C7D2FE' }}>
                  🔐 OTP Handover Required
                </div>
              </>
            )}
          </div>
        </div>

        {/* Card 4: Settlement & Payment */}
        <div className="detail-info-card">
          <div className="detail-card-header">
            <span className="card-icon">{order.payment_method === 'ONLINE' ? '💳' : '💵'}</span>
            <h3>Payment Method</h3>
          </div>
          <div className="detail-card-content">
            {order.payment_method === 'ONLINE' ? (
              <>
                <strong style={{ color: order.payment_status === 'PAID' ? '#065F46' : 'var(--color-primary)' }}>
                  Online Payment (Stripe Test Mode)
                </strong>
                <p className="detail-text" style={{ marginTop: '0.35rem' }}>
                  Status:{' '}
                  <strong style={{ color: order.payment_status === 'PAID' ? '#065F46' : '#92400E' }}>
                    {order.payment_status === 'PAID' ? 'PAID ✅' : 'PAYMENT PENDING'}
                  </strong>
                </p>
                {order.stripe_payment_intent_id && (
                  <p className="detail-text" style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
                    Ref: {order.stripe_payment_intent_id}
                  </p>
                )}
                <div className="cod-security-tag" style={{ marginTop: '0.65rem', background: '#ECFDF5', color: '#065F46', borderColor: '#A7F3D0' }}>
                  {order.payment_status === 'PAID' ? '✓ No Collection on Delivery' : '⏳ Awaiting Stripe Confirmation'}
                </div>
              </>
            ) : (
              <>
                <strong style={{ color: 'var(--color-primary)' }}>Cash on Delivery (COD)</strong>
                <p className="detail-text" style={{ marginTop: '0.35rem' }}>
                  Hand over <strong>₹{Number(order.total).toFixed(2)}</strong> in cash when the delivery partner arrives.
                </p>
                <div className="cod-security-tag" style={{ marginTop: '0.65rem' }}>
                  ✓ Pay on Delivery
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Ordered Items Table with Immutable Stored Snapshots */}
      <div className="order-items-detail-card">
        <div className="items-card-top">
          <h3>Purchased Items ({items.length})</h3>
          <span className="snapshot-tag">
            🔒 Stored Price & Product Snapshots
          </span>
        </div>
        <p className="snapshot-explanation">
          These items reflect the exact product names, unit prices, and quantities captured atomically at the moment your order was confirmed.
        </p>

        <div className="order-items-table-wrapper">
          <table className="order-detail-items-table">
            <thead>
              <tr>
                <th>Product Description</th>
                <th style={{ textAlign: 'center' }}>Unit</th>
                <th style={{ textAlign: 'right' }}>Snapshot Price</th>
                <th style={{ textAlign: 'center' }}>Qty</th>
                <th style={{ textAlign: 'right' }}>Item Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td>
                    <div className="table-item-name">
                      <strong>{it.product_name}</strong>
                      {it.product_description && (
                        <span className="table-item-desc">{it.product_description}</span>
                      )}
                    </div>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="table-unit-label">{it.unit_label || 'piece'}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    ₹{Number(it.unit_price).toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="table-qty-badge">{it.quantity}</span>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>
                    ₹{Number(it.subtotal).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} style={{ textAlign: 'right' }}>
                  Items Subtotal:
                </td>
                <td style={{ textAlign: 'right' }}>
                  ₹{Number(order.subtotal).toFixed(2)}
                </td>
              </tr>
              <tr>
                <td colSpan={4} style={{ textAlign: 'right' }}>
                  Local Neighborhood Delivery:
                </td>
                <td style={{ textAlign: 'right', color: 'var(--color-success)' }}>
                  Free
                </td>
              </tr>
              <tr className="tfoot-grand-total">
                <td colSpan={4} style={{ textAlign: 'right', fontWeight: 700 }}>
                  Total to Pay on Delivery:
                </td>
                <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--color-primary)' }}>
                  ₹{Number(order.total).toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Action Footer */}
      <div className="order-detail-footer-actions">
        <button
          type="button"
          onClick={onBack}
          className="button button-secondary"
        >
          ← Return to My Orders
        </button>
        <button
          type="button"
          onClick={onNavigateToShops}
          className="button button-primary"
        >
          Order More Groceries
        </button>
      </div>
    </div>
  );
};
