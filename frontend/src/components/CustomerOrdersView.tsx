import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { fetchOrders, viewOrDownloadInvoice } from '../api/client';
import type { OrderDetails } from '../api/client';

interface CustomerOrdersViewProps {
  onViewOrderDetail: (orderId: string) => void;
  onNavigateToShops: () => void;
}

export const CustomerOrdersView: React.FC<CustomerOrdersViewProps> = ({
  onViewOrderDetail,
  onNavigateToShops,
}) => {
  const { token } = useAuth();
  const [orders, setOrders] = useState<OrderDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const handleDownloadInvoice = async (e: React.MouseEvent, orderId: string) => {
    e.stopPropagation();
    if (!token) return;
    setDownloadingId(orderId);
    try {
      await viewOrDownloadInvoice(token, orderId, 'view');
    } catch (err: any) {
      alert(err?.message || 'Could not load invoice.');
    } finally {
      setDownloadingId(null);
    }
  };

  const loadOrders = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchOrders(token);
      setOrders(data.orders || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load your orders. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [token]);

  const formatDate = (isoStr: string) => {
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

  return (
    <div className="customer-orders-container">
      {/* Header */}
      <div className="content-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1>My Orders 📦</h1>
            <p>Track your neighborhood grocery orders and review past purchase history.</p>
          </div>
          <button
            type="button"
            onClick={loadOrders}
            className="button button-sm button-secondary"
            disabled={loading}
          >
            {loading ? 'Refreshing...' : '🔄 Refresh Orders'}
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="alert alert-error" role="alert" style={{ marginBottom: '1.5rem' }}>
          <span className="alert-icon">⚠️</span>
          <div style={{ flex: 1 }}>
            <strong>Unable to fetch orders</strong>
            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem' }}>{error}</p>
          </div>
          <button
            type="button"
            onClick={loadOrders}
            className="button button-sm button-ghost"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && orders.length === 0 ? (
        <div className="loading-state-box">
          <div className="spinner"></div>
          <p>Loading your order history...</p>
        </div>
      ) : orders.length === 0 ? (
        /* Empty Orders State */
        <div className="empty-cart-card">
          <div className="empty-cart-icon">📦</div>
          <h2 className="empty-cart-title">No orders placed yet</h2>
          <p className="empty-cart-subtitle">
            You haven't placed any grocery orders yet. Discover fresh local provisions and daily essentials from neighborhood stores near you.
          </p>
          <button
            type="button"
            onClick={onNavigateToShops}
            className="button button-primary"
            style={{ marginTop: '1rem' }}
          >
            🏪 Browse Neighborhood Shops
          </button>
        </div>
      ) : (
        /* Orders List (Newest First) */
        <div className="orders-list">
          {orders.map((order) => {
            const itemCount = order.item_count || (order.items?.length ?? 0);
            const itemsPreview = (order.items || [])
              .map((it) => `${it.product_name} (${it.quantity})`)
              .join(', ');

            return (
              <div key={order.id} className="order-history-card">
                {/* Top Row: Order ID, Date, Status */}
                <div className="order-card-header">
                  <div className="order-header-left">
                    <span className="order-id-label">Order</span>
                    <strong className="order-id-val">#{order.id}</strong>
                    <span className="order-date-separator">•</span>
                    <span className="order-date">{formatDate(order.created_at)}</span>
                  </div>
                  <div className="order-header-right">
                    <span className={`order-status-badge status-${order.status?.toLowerCase() || 'created'}`}>
                      {order.status === 'CREATED' ? 'Order Placed' : order.status?.replace(/_/g, ' ')}
                    </span>
                    {(order.status || '').toUpperCase() === 'CANCELLED' && order.cancellation_reason && (
                      <div style={{ fontSize: '0.75rem', color: '#991B1B', marginTop: '0.25rem', textAlign: 'right', maxWidth: '200px' }}>
                        Cancelled: {order.cancellation_reason}
                      </div>
                    )}
                    {(order.status || '').toUpperCase() === 'CANCELLED' &&
                      order.payment_method === 'ONLINE' &&
                      (order.payment_status === 'PAID' || order.refund_status === 'REFUND_INITIATED') && (
                        <div style={{ fontSize: '0.75rem', color: '#B45309', fontWeight: 600, marginTop: '0.2rem', textAlign: 'right' }}>
                          Refund Initiated (1–2 business days)
                        </div>
                    )}
                  </div>
                </div>

                {/* Body: Store info, Items list summary, Delivery Address */}
                <div className="order-card-body">
                  <div className="order-store-row">
                    <span className="store-icon">🏪</span>
                    <strong>{order.shop?.name || 'Local Store'}</strong>
                    <span className="store-city">
                      {order.shop?.city ? `(${order.shop.city})` : ''}
                    </span>
                  </div>

                  <div className="order-items-summary">
                    <span className="items-count-badge">
                      {itemCount} {itemCount === 1 ? 'item' : 'items'}
                    </span>
                    <span className="items-names-preview" title={itemsPreview}>
                      {itemsPreview || 'Grocery items'}
                    </span>
                  </div>

                  <div className="order-meta-info-row">
                    <div className="meta-info-item">
                      <span className="meta-info-icon">📍</span>
                      <span className="meta-info-text">
                        {order.delivery_address?.address}, {order.delivery_address?.city}
                      </span>
                    </div>
                    <div className="meta-info-item">
                      <span className="meta-info-icon">{order.payment_method === 'ONLINE' ? '💳' : '💵'}</span>
                      <span className="meta-info-text">
                        {order.payment_method === 'ONLINE' ? (
                          order.payment_status === 'PAID' ? 'Online Payment (PAID ✅)' : 'Online Payment (Pending)'
                        ) : (
                          'Cash on Delivery (COD)'
                        )}
                      </span>
                    </div>
                    <div className="meta-info-item">
                      <span className="meta-info-icon">{(order.delivery_method || 'HAND_TO_CUSTOMER') === 'LEAVE_AT_DOOR' ? '🚪' : '🤝'}</span>
                      <span className="meta-info-text">
                        {(order.delivery_method || 'HAND_TO_CUSTOMER') === 'LEAVE_AT_DOOR' ? 'Leave at Door' : 'Hand to Customer'}
                      </span>
                    </div>
                    {order.status === 'OUT_FOR_DELIVERY' && (
                      <span style={{
                        background: '#FEF3C7',
                        color: '#92400E',
                        padding: '0.2rem 0.55rem',
                        borderRadius: '12px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        marginLeft: 'auto'
                      }}>
                        {(order.delivery_method || 'HAND_TO_CUSTOMER') === 'LEAVE_AT_DOOR' ? '🚪 Contactless' : '🔐 OTP Ready'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Footer: Total Amount & Action CTA */}
                <div className="order-card-footer">
                  <div className="order-total-box">
                    <span className="total-label">
                      {order.payment_method === 'ONLINE'
                        ? (order.payment_status === 'PAID' ? 'Total Paid:' : 'Total (Pending):')
                        : 'Total to Pay (COD):'}
                    </span>
                    <span className="total-amount">₹{Number(order.total).toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {(order.payment_method === 'COD' || order.payment_status === 'PAID') && (
                      <button
                        type="button"
                        onClick={(e) => handleDownloadInvoice(e, order.id)}
                        disabled={downloadingId === order.id}
                        className="button button-sm button-ghost"
                        style={{ border: '1px solid #CBD5E1', fontSize: '0.8rem', padding: '0.35rem 0.65rem' }}
                        title="View & Download PDF Invoice"
                      >
                        {downloadingId === order.id ? 'Opening...' : '📄 Invoice'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onViewOrderDetail(order.id)}
                      className="button button-sm button-secondary order-view-btn"
                    >
                      View Order Details →
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
