import React, { useState } from 'react';
import { useCart } from '../context/CartContext';

interface CustomerCartViewProps {
  onNavigateToShops: () => void;
  onNavigateToCheckout: () => void;
}

export const CustomerCartView: React.FC<CustomerCartViewProps> = ({
  onNavigateToShops,
  onNavigateToCheckout,
}) => {
  const {
    cart,
    loading,
    error,
    conflictError,
    updateQuantity,
    removeItem,
    clearCurrentCart,
    clearConflict,
    clearError,
  } = useCart();

  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  const items = cart?.items || [];
  const shop = cart?.shop;
  const itemCount = cart?.item_count || 0;
  const total = cart?.total || 0;

  const handleClear = async () => {
    setConfirmClearOpen(false);
    await clearCurrentCart();
  };

  return (
    <div className="customer-cart-container">
      {/* Page Header */}
      <div className="content-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1>Your Shopping Cart 🛒</h1>
            <p>
              Review your selected local groceries, adjust quantities, and check store totals.
            </p>
          </div>
          {items.length > 0 && (
            <button
              type="button"
              onClick={onNavigateToShops}
              className="button button-sm button-secondary"
            >
              + Add More Items
            </button>
          )}
        </div>
      </div>

      {/* Global Cart Error Notice */}
      {error && (
        <div className="cart-inline-error-banner" style={{ marginBottom: '1.25rem' }} role="alert">
          <div className="error-banner-main">
            <span className="error-banner-icon">❌</span>
            <div className="error-banner-text">
              <strong>Cart Action Failed</strong>
              <p>{error}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={clearError}
            className="button button-sm button-ghost"
            title="Dismiss error"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* One-Shop Conflict Alert */}
      {conflictError && (
        <div className="cart-inline-conflict-banner" style={{ marginBottom: '1.25rem' }} role="alert">
          <div className="conflict-banner-main">
            <div className="conflict-banner-icon-col">
              <span className="conflict-banner-icon">❌</span>
            </div>
            <div className="conflict-banner-text-col">
              <h4 className="conflict-banner-title">Single-Store Cart Policy Conflict</h4>
              <p className="conflict-banner-message">{conflictError}</p>
            </div>
          </div>
          <div className="conflict-banner-actions">
            <button
              type="button"
              onClick={clearConflict}
              className="button button-sm button-ghost"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Loading State */}
      {loading && !cart ? (
        <div className="loading-state-box">
          <div className="spinner"></div>
          <p>Retrieving your neighborhood grocery basket...</p>
        </div>
      ) : items.length === 0 ? (
        /* ========================================================= */
        /* Empty Cart State                                          */
        /* ========================================================= */
        <div className="empty-cart-card">
          <div className="empty-cart-icon">🛒</div>
          <h2 className="empty-cart-title">Your grocery basket is empty</h2>
          <p className="empty-cart-subtitle">
            You haven't added any products yet. Browse approved local provision stores in your neighborhood to pick fresh vegetables, dairy, pantry staples, and daily necessities.
          </p>
          <div className="empty-cart-actions">
            <button
              type="button"
              onClick={onNavigateToShops}
              className="button button-primary empty-cart-browse-btn"
            >
              <span>🏪</span>
              <span>Browse Neighborhood Shops</span>
            </button>
          </div>
        </div>
      ) : (
        /* ========================================================= */
        /* Populated Cart Layout (Items + Summary)                   */
        /* ========================================================= */
        <div className="cart-content-layout">
          {/* Left Column: Store Banner & Cart Items List */}
          <div className="cart-main-column">
            {/* Store Association Banner */}
            {shop && (
              <div className="cart-store-banner">
                <div className="store-banner-left">
                  <div className="store-banner-avatar">
                    {shop.photo_url ? (
                      <img
                        src={shop.photo_url}
                        alt={shop.name}
                        className="store-banner-img"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <span>🏪</span>
                    )}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <h2 className="store-banner-name">{shop.name}</h2>
                      <span className="store-banner-badge">Active Store</span>
                    </div>
                    <p className="store-banner-address">
                      📍 {shop.address}, {shop.city}
                      {shop.business_phone ? ` • 📞 ${shop.business_phone}` : ''}
                    </p>
                  </div>
                </div>
                <div className="store-banner-note">
                  <span className="single-shop-pill">✓ Single-Store Cart</span>
                </div>
              </div>
            )}

            {/* Items Header */}
            <div className="cart-items-header">
              <span className="items-count-heading">
                {itemCount} {itemCount === 1 ? 'item' : 'items'} in your basket
              </span>
              <button
                type="button"
                onClick={() => setConfirmClearOpen(true)}
                className="cart-clear-link"
              >
                Clear Cart
              </button>
            </div>

            {/* Clear Cart Confirmation Dialog */}
            {confirmClearOpen && (
              <div className="alert alert-warning" style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div>
                  <strong>Are you sure you want to clear your cart?</strong>
                  <div style={{ fontSize: '0.85rem' }}>This will remove all {itemCount} item(s) from {shop?.name || 'this store'}.</div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={handleClear}
                    className="button button-sm button-error"
                  >
                    Yes, Clear Cart
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClearOpen(false)}
                    className="button button-sm button-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Cart Items List */}
            <div className="cart-items-list">
              {items.map((item) => {
                const product = item.product;
                const isOutOfStock = product && product.stock < item.quantity;

                return (
                  <div key={item.id} className="cart-item-card">
                    {/* Item Thumbnail */}
                    <div className="cart-item-thumb-box">
                      {product?.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="cart-item-thumb"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="cart-item-thumb-fallback">🛒</div>
                      )}
                    </div>

                    {/* Item Details */}
                    <div className="cart-item-info">
                      <div className="cart-item-header">
                        <span className="cart-item-category">{product?.category || 'Grocery'}</span>
                        <span className="cart-item-unit">per {product?.unit_label || 'unit'}</span>
                      </div>
                      <h3 className="cart-item-name">{product?.name || 'Grocery Item'}</h3>
                      <div className="cart-item-unit-price">
                        ₹{Number(item.unit_price).toFixed(2)}
                      </div>

                      {isOutOfStock && (
                        <div className="cart-item-stock-warning">
                          ⚠️ Only {product.stock} left in stock. Please adjust quantity.
                        </div>
                      )}
                    </div>

                    {/* Quantity Stepper & Subtotal */}
                    <div className="cart-item-actions-box">
                      <div className="cart-item-stepper" aria-label={`Quantity for ${product?.name}`}>
                        <button
                          type="button"
                          className="cart-step-btn"
                          onClick={() => {
                            if (item.quantity > 1) {
                              updateQuantity(item.id, item.quantity - 1);
                            } else {
                              removeItem(item.id);
                            }
                          }}
                          disabled={item.quantity < 1}
                          title={item.quantity === 1 ? 'Remove item' : 'Decrease quantity'}
                        >
                          {item.quantity === 1 ? '🗑️' : '−'}
                        </button>
                        <span className="cart-step-qty">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          className="cart-step-btn"
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          disabled={Boolean(product && item.quantity >= product.stock)}
                          title={product && item.quantity >= product.stock ? 'Maximum available stock reached' : 'Increase quantity'}
                        >
                          +
                        </button>
                      </div>

                      {/* Subtotal */}
                      <div className="cart-item-subtotal-box">
                        <span className="subtotal-label">Subtotal</span>
                        <span className="subtotal-amount">₹{Number(item.subtotal).toFixed(2)}</span>
                      </div>

                      {/* Remove Button */}
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="cart-item-remove-btn"
                        title="Remove product from cart"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Order Summary Card */}
          <div className="cart-summary-column">
            <div className="order-summary-card">
              <h3 className="summary-card-title">Order Summary</h3>

              {shop && (
                <div className="summary-shop-info">
                  <div className="summary-shop-name">{shop.name}</div>
                  <div className="summary-shop-sub">Fulfilling store for this delivery</div>
                </div>
              )}

              <div className="summary-rows-group">
                <div className="summary-row">
                  <span>Items Total ({itemCount} {itemCount === 1 ? 'item' : 'items'})</span>
                  <span className="summary-value">₹{Number(total).toFixed(2)}</span>
                </div>
                <div className="summary-row">
                  <span>Local Neighborhood Delivery</span>
                  <span className="summary-value summary-free">Free</span>
                </div>
                <div className="summary-row">
                  <span>Estimated Taxes & Packaging</span>
                  <span className="summary-value">Included</span>
                </div>
              </div>

              <div className="summary-divider"></div>

              <div className="summary-total-row">
                <span className="summary-total-label">Cart Total</span>
                <span className="summary-total-amount">₹{Number(total).toFixed(2)}</span>
              </div>

              {/* Checkout CTA */}
              <button
                type="button"
                onClick={onNavigateToCheckout}
                className="button button-primary summary-checkout-btn"
                style={{ width: '100%', marginBottom: '0.75rem', fontWeight: 600 }}
                disabled={items.length === 0}
              >
                Proceed to Checkout →
              </button>

              <button
                type="button"
                onClick={onNavigateToShops}
                className="button button-secondary summary-continue-btn"
                style={{ width: '100%' }}
              >
                ← Continue Shopping
              </button>

              {/* COD & Store Trust Badge */}
              <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-subtle)', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.35rem', color: 'var(--color-brown-900)', fontWeight: 600 }}>
                  <span>💵</span>
                  <span>Cash on Delivery (COD) Available</span>
                </div>
                <div>Fast local drop-off directly by your neighborhood shopkeeper.</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
