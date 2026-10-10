import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { createOrder, createStripeCheckoutSession } from '../api/client';
import type { OrderDetails } from '../api/client';

interface CustomerCheckoutViewProps {
  onNavigateToCart: () => void;
  onNavigateToProfile: () => void;
  onOrderSuccess: (order: OrderDetails) => void;
}

export const CustomerCheckoutView: React.FC<CustomerCheckoutViewProps> = ({
  onNavigateToCart,
  onNavigateToProfile,
  onOrderSuccess,
}) => {
  const { user, token } = useAuth();
  const { cart, refreshCart, resetCart, cancelPendingUpdates, loading } = useCart();

  const [isPlacing, setIsPlacing] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [deliveryMethod, setDeliveryMethod] = useState<'HAND_TO_CUSTOMER' | 'LEAVE_AT_DOOR'>('HAND_TO_CUSTOMER');
  const [paymentMethod, setPaymentMethod] = useState<'COD' | 'ONLINE'>('COD');
  const [cancelNotice, setCancelNotice] = useState<boolean>(() => {
    return new URLSearchParams(window.location.search).get('cancelled') === 'true';
  });

  const handleDeliveryMethodChange = (method: 'HAND_TO_CUSTOMER' | 'LEAVE_AT_DOOR') => {
    setDeliveryMethod(method);
    if (method === 'LEAVE_AT_DOOR') {
      setPaymentMethod('ONLINE');
    }
  };

  const handlePaymentMethodChange = (method: 'COD' | 'ONLINE') => {
    if (method === 'COD' && deliveryMethod === 'LEAVE_AT_DOOR') {
      return;
    }
    setPaymentMethod(method);
  };

  // Ensure checkout has authoritative active cart on mount if not already loaded
  useEffect(() => {
    if (token && (!cart || !cart.items || cart.items.length === 0)) {
      refreshCart();
    }
  }, [token, cart, refreshCart]);

  // Validate complete delivery address snapshot from customer profile
  const profileName = (user?.name || '').trim();
  const profilePhone = (user?.phone || '').trim();
  const profileAddress = (user?.address || '').trim();
  const profileCity = (user?.city || '').trim();
  const profileState = (user?.state || '').trim();
  const profilePincode = (user?.pincode || '').trim();

  const missingFields: string[] = [];
  if (!profileName) missingFields.push('Full Name');
  if (!profilePhone) missingFields.push('Phone Number');
  if (!profileAddress) missingFields.push('Street Address');
  if (!profileCity) missingFields.push('City');
  if (!profileState) missingFields.push('State');
  if (!profilePincode) missingFields.push('Pincode');

  const isAddressComplete = missingFields.length === 0;

  const items = cart?.items || [];
  const shop = cart?.shop;
  const subtotal = cart?.subtotal || 0;
  const total = cart?.total || 0;

  const handlePlaceOrder = async () => {
    if (!token) {
      setApiError('Authentication expired. Please log in again.');
      return;
    }
    if (!isAddressComplete) {
      setApiError('Please complete your delivery address before placing an order.');
      return;
    }
    if (items.length === 0) {
      setApiError('Your cart is empty. Add products before placing an order.');
      return;
    }
    if (deliveryMethod === 'LEAVE_AT_DOOR' && paymentMethod === 'COD') {
      setApiError("Cash on Delivery isn't available for Leave-at-Door delivery because payment must be completed before the order is left at your address.");
      return;
    }
    if (isPlacing) return;

    setIsPlacing(true);
    setApiError(null);

    // 1. Cancel any pending/debounced cart mutations from earlier quantity actions
    cancelPendingUpdates();

    // 2. Authoritative pre-checkout cart validation against backend
    let activeCart = null;
    try {
      activeCart = await refreshCart();
    } catch {
      setIsPlacing(false);
      setApiError('Unable to verify your shopping cart with the server. Please try again.');
      return;
    }

    if (!activeCart || !activeCart.cart || !activeCart.items || activeCart.items.length === 0) {
      setIsPlacing(false);
      setApiError('Your shopping cart is no longer active. Please return to the cart and add your products again.');
      return;
    }

    try {
      if (paymentMethod === 'ONLINE') {
        const res = await createStripeCheckoutSession(token, deliveryMethod, 'ONLINE');
        if (!res.checkout_url) {
          throw new Error('Stripe Checkout session URL was not returned.');
        }
        // Online order created; cart in DB is now converted/cleared. Immediately reflect empty cart in UI
        resetCart();
        window.location.href = res.checkout_url;
        return;
      } else {
        const res = await createOrder(token, deliveryMethod, 'COD');
        const placedOrder = res.order || (res as any);
        // Order transaction converted/cleared cart in DB; immediately clear cart in UI
        resetCart();
        onOrderSuccess(placedOrder);
      }
    } catch (err: any) {
      const errMsg = err.message || 'Failed to place order. Please try again.';
      if (
        errMsg.toLowerCase().includes('no active shopping cart') ||
        errMsg.toLowerCase().includes('cart is empty') ||
        errMsg.toLowerCase().includes('cart not found') ||
        errMsg.toLowerCase().includes('not found')
      ) {
        resetCart();
        await refreshCart();
        setApiError('Your shopping cart is no longer active. Please return to the cart and add your products again.');
      } else {
        setApiError(errMsg);
      }
      setIsPlacing(false);
    }
  };

  if (loading && (!cart || items.length === 0)) {
    return (
      <div className="customer-checkout-container">
        <div className="content-header">
          <h1>Checkout & Delivery 🛍️</h1>
          <p>Complete your neighborhood grocery purchase.</p>
        </div>
        <div className="empty-cart-card">
          <div className="spinner" style={{ margin: '0 auto 1rem' }}></div>
          <h2 className="empty-cart-title">Loading checkout details...</h2>
        </div>
      </div>
    );
  }

  if (!cart || items.length === 0) {
    return (
      <div className="customer-checkout-container">
        <div className="content-header">
          <h1>Checkout & Delivery 🛍️</h1>
          <p>Complete your neighborhood grocery purchase.</p>
        </div>
        {apiError && (
          <div className="checkout-alert-error" role="alert" style={{ marginBottom: '1.5rem' }}>
            <div className="checkout-alert-icon">⚠️</div>
            <div className="checkout-alert-content">
              <h4>Cart Needs Attention</h4>
              <p>{apiError}</p>
            </div>
            <button
              type="button"
              onClick={() => setApiError(null)}
              className="button button-sm button-ghost"
              style={{ alignSelf: 'flex-start' }}
            >
              Dismiss
            </button>
          </div>
        )}
        <div className="empty-cart-card">
          <div className="empty-cart-icon">🛒</div>
          <h2 className="empty-cart-title">No items in your cart to checkout</h2>
          <p className="empty-cart-subtitle">
            {apiError || 'Your shopping basket is currently empty. Please add items from a neighborhood store before checking out.'}
          </p>
          <button
            type="button"
            onClick={onNavigateToCart}
            className="button button-primary"
            style={{ marginTop: '1rem' }}
          >
            ← Return to Cart
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="customer-checkout-container">
      {/* Header & Back Action */}
      <div className="content-header">
        <button
          type="button"
          onClick={onNavigateToCart}
          className="button button-sm button-ghost checkout-back-btn"
        >
          ← Back to Cart
        </button>
        <h1 style={{ marginTop: '0.5rem' }}>Review & Place Order 📦</h1>
        <p>
          Verify your delivery address, review your items, and choose your delivery and payment preferences.
        </p>
      </div>

      {/* Cancelled notice banner */}
      {cancelNotice && (
        <div className="checkout-alert-error" role="alert" style={{ background: '#FFFBEB', borderColor: '#F59E0B' }}>
          <div className="checkout-alert-icon">ℹ️</div>
          <div className="checkout-alert-content">
            <h4 style={{ color: '#92400E' }}>Checkout Cancelled</h4>
            <p style={{ color: '#B45309' }}>
              Your online payment was cancelled at Stripe Checkout. No charges were made, and your selected items were released. You can place the order again when ready.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCancelNotice(false)}
            className="button button-sm button-ghost"
            style={{ alignSelf: 'flex-start' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* API Submission Error */}
      {apiError && (
        <div className="checkout-alert-error" role="alert">
          <div className="checkout-alert-icon">⚠️</div>
          <div className="checkout-alert-content">
            <h4>Order Submission Failed</h4>
            <p>{apiError}</p>
          </div>
          <button
            type="button"
            onClick={() => setApiError(null)}
            className="button button-sm button-ghost"
            style={{ alignSelf: 'flex-start' }}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="checkout-grid-layout">
        {/* Left Column: Delivery Address, Payment Method, Order Items */}
        <div className="checkout-main-col">
          {/* ------------------------------------------------------------- */}
          {/* 1. Delivery Address Section (Profile Authoritative)           */}
          {/* ------------------------------------------------------------- */}
          <div className="checkout-card">
            <div className="checkout-card-header">
              <div className="checkout-step-badge">1</div>
              <div style={{ flex: 1 }}>
                <h3 className="checkout-section-title">Delivery Address</h3>
                <p className="checkout-section-subtitle">
                  Orders are dispatched directly to your saved profile address.
                </p>
              </div>
              <button
                type="button"
                onClick={onNavigateToProfile}
                className="button button-sm button-secondary"
              >
                {isAddressComplete ? 'Edit in Profile' : 'Update Profile'}
              </button>
            </div>

            {isAddressComplete ? (
              <div className="checkout-address-preview">
                <div className="address-preview-icon">📍</div>
                <div className="address-preview-details">
                  <div className="address-recipient-name">
                    <strong>{profileName}</strong>
                    <span className="address-verified-tag">✓ Profile Verified</span>
                  </div>
                  <div className="address-phone">
                    <span>📞 {profilePhone}</span>
                  </div>
                  <div className="address-street">
                    {profileAddress}
                  </div>
                  <div className="address-locality">
                    {profileCity}, {profileState} — <strong>{profilePincode}</strong>
                  </div>
                </div>
              </div>
            ) : (
              <div className="checkout-address-incomplete-warning">
                <div className="warning-icon">⚠️</div>
                <div className="warning-body">
                  <h4>Delivery Profile Incomplete</h4>
                  <p>
                    Your profile is missing required delivery details:{' '}
                    <strong>{missingFields.join(', ')}</strong>.
                    LOCOMART requires a complete street address, city, state, pincode, and phone number before placing an order.
                  </p>
                  <button
                    type="button"
                    onClick={onNavigateToProfile}
                    className="button button-sm button-primary"
                    style={{ marginTop: '0.75rem' }}
                  >
                    Complete Profile Address Now →
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ------------------------------------------------------------- */}
          {/* 2. Delivery Method Section (Personal Handover vs Contactless) */}
          {/* ------------------------------------------------------------- */}
          <div className="checkout-card">
            <div className="checkout-card-header">
              <div className="checkout-step-badge">2</div>
              <div>
                <h3 className="checkout-section-title">Delivery Method</h3>
                <p className="checkout-section-subtitle">
                  Choose how you want to receive your grocery order.
                </p>
              </div>
            </div>

            <div className="payment-options-list">
              {/* Option A: Hand to Customer */}
              <label
                className={`payment-option-card ${deliveryMethod === 'HAND_TO_CUSTOMER' ? 'payment-option-selected' : ''}`}
                style={{ cursor: 'pointer' }}
              >
                <div className="payment-radio-col">
                  <input
                    type="radio"
                    name="deliveryMethod"
                    value="HAND_TO_CUSTOMER"
                    checked={deliveryMethod === 'HAND_TO_CUSTOMER'}
                    onChange={() => handleDeliveryMethodChange('HAND_TO_CUSTOMER')}
                  />
                </div>
                <div className="payment-info-col">
                  <div className="payment-title-row">
                    <span className="payment-method-name">🤝 Personal handover</span>
                    <span className="payment-badge-active" style={{ background: '#ECFDF5', color: '#065F46' }}>
                      OTP Required
                    </span>
                  </div>
                  <p className="payment-method-desc">
                    Your order is handed directly to you. A 6-digit OTP is required to confirm delivery.
                  </p>
                </div>
              </label>

              {/* Option B: Leave at Door */}
              <label
                className={`payment-option-card ${deliveryMethod === 'LEAVE_AT_DOOR' ? 'payment-option-selected' : ''}`}
                style={{ cursor: 'pointer' }}
              >
                <div className="payment-radio-col">
                  <input
                    type="radio"
                    name="deliveryMethod"
                    value="LEAVE_AT_DOOR"
                    checked={deliveryMethod === 'LEAVE_AT_DOOR'}
                    onChange={() => handleDeliveryMethodChange('LEAVE_AT_DOOR')}
                  />
                </div>
                <div className="payment-info-col">
                  <div className="payment-title-row">
                    <span className="payment-method-name">🚪 Contactless delivery</span>
                    <span className="payment-badge-active" style={{ background: '#EFF6FF', color: '#1D4ED8' }}>
                      Online Payment Required
                    </span>
                  </div>
                  <p className="payment-method-desc">
                    Your order is left at your delivery address. No OTP or personal handover is required.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* ------------------------------------------------------------- */}
          {/* 3. Payment Method Section (COD vs Stripe Online)              */}
          {/* ------------------------------------------------------------- */}
          <div className="checkout-card">
            <div className="checkout-card-header">
              <div className="checkout-step-badge">3</div>
              <div>
                <h3 className="checkout-section-title">Payment Method</h3>
                <p className="checkout-section-subtitle">
                  Select your preferred settlement option.
                </p>
              </div>
            </div>

            <div className="payment-options-list">
              {/* Option A: Cash on Delivery */}
              <label
                className={`payment-option-card ${
                  paymentMethod === 'COD' && deliveryMethod !== 'LEAVE_AT_DOOR'
                    ? 'payment-option-selected'
                    : ''
                } ${deliveryMethod === 'LEAVE_AT_DOOR' ? 'payment-option-disabled' : ''}`}
                style={
                  deliveryMethod === 'LEAVE_AT_DOOR'
                    ? { cursor: 'not-allowed', opacity: 0.65 }
                    : { cursor: 'pointer' }
                }
                onClick={(e) => {
                  if (deliveryMethod === 'LEAVE_AT_DOOR') {
                    e.preventDefault();
                  }
                }}
              >
                <div className="payment-radio-col">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="COD"
                    checked={paymentMethod === 'COD' && deliveryMethod !== 'LEAVE_AT_DOOR'}
                    disabled={deliveryMethod === 'LEAVE_AT_DOOR'}
                    onChange={() => handlePaymentMethodChange('COD')}
                  />
                </div>
                <div className="payment-info-col">
                  <div className="payment-title-row">
                    <span className="payment-method-name">💵 Cash on Delivery (COD)</span>
                    {deliveryMethod === 'LEAVE_AT_DOOR' ? (
                      <span
                        className="payment-badge-soon"
                        style={{ background: '#FEE2E2', color: '#991B1B' }}
                      >
                        Not Available
                      </span>
                    ) : (
                      <span className="payment-badge-active">Available</span>
                    )}
                  </div>
                  <p className="payment-method-desc">
                    Pay with exact cash or local UPI directly to the shopkeeper's delivery runner when groceries reach your doorstep.
                  </p>
                  {deliveryMethod === 'LEAVE_AT_DOOR' && (
                    <div
                      style={{
                        marginTop: '0.65rem',
                        padding: '0.6rem 0.75rem',
                        backgroundColor: '#FEF2F2',
                        border: '1px solid #FECACA',
                        borderRadius: '6px',
                        fontSize: '0.825rem',
                        color: '#991B1B',
                        lineHeight: 1.45,
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.5rem',
                      }}
                    >
                      <span style={{ fontSize: '1rem', lineHeight: 1 }}>⚠️</span>
                      <span>
                        Cash on Delivery isn't available for Leave-at-Door delivery because payment must be completed before the order is left at your address.
                      </span>
                    </div>
                  )}
                </div>
              </label>

              {/* Option B: Online Payment (Stripe Test Mode) */}
              <label
                className={`payment-option-card ${paymentMethod === 'ONLINE' ? 'payment-option-selected' : ''}`}
                style={{ cursor: 'pointer' }}
              >
                <div className="payment-radio-col">
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="ONLINE"
                    checked={paymentMethod === 'ONLINE'}
                    onChange={() => handlePaymentMethodChange('ONLINE')}
                  />
                </div>
                <div className="payment-info-col">
                  <div className="payment-title-row">
                    <span className="payment-method-name">💳 Online Payment (Cards, UPI, NetBanking)</span>
                    <span className="payment-badge-active" style={{ background: '#EEF2FF', color: '#4F46E5' }}>
                      Stripe Test Mode
                    </span>
                  </div>
                  <p className="payment-method-desc">
                    Pay instantly via Stripe secure checkout in test mode. No real money will be charged.
                  </p>
                </div>
              </label>
            </div>

            {/* Test Mode Instructions Box */}
            {paymentMethod === 'ONLINE' && (
              <div className="stripe-test-notice-box" style={{ marginTop: '1rem' }}>
                <div className="stripe-badge-header">
                  <span className="stripe-icon">🧪</span>
                  <strong>Stripe Test Mode — No real money will be charged</strong>
                </div>
                <p className="stripe-test-desc">
                  You will be redirected to the secure Stripe Checkout gateway to complete test payment.
                </p>
                <div className="stripe-test-instructions">
                  <div className="instructions-title">🧪 Simple Test Payment Instructions:</div>
                  <div className="test-card-details">
                    <div>• <strong>Card Number:</strong> <code>4242 4242 4242 4242</code></div>
                    <div>• <strong>Expiry Date:</strong> Any future date (e.g. <code>12/34</code>)</div>
                    <div>• <strong>CVC:</strong> Any 3 digits (e.g. <code>123</code>)</div>
                    <div>• <strong>PIN / OTP:</strong> Any 6 digits (if prompted)</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ------------------------------------------------------------- */}
          {/* 4. Items Review Section                                       */}
          {/* ------------------------------------------------------------- */}
          <div className="checkout-card">
            <div className="checkout-card-header">
              <div className="checkout-step-badge">4</div>
              <div style={{ flex: 1 }}>
                <h3 className="checkout-section-title">Items in Order ({items.length})</h3>
                {shop && (
                  <p className="checkout-section-subtitle">
                    Fulfilling store: <strong>{shop.name}</strong> • {shop.city}
                  </p>
                )}
              </div>
            </div>

            <div className="checkout-items-list">
              {items.map((item) => {
                const prod = item.product;
                return (
                  <div key={item.id} className="checkout-item-row">
                    <div className="checkout-item-details">
                      <span className="checkout-item-name">{prod?.name || 'Grocery Item'}</span>
                      <span className="checkout-item-unit">
                        {prod?.unit_label || 'piece'} • ₹{Number(item.unit_price).toFixed(2)} each
                      </span>
                    </div>
                    <div className="checkout-item-qty">
                      Qty: <strong>{item.quantity}</strong>
                    </div>
                    <div className="checkout-item-subtotal">
                      ₹{Number(item.subtotal).toFixed(2)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Sticky Order Summary & Authoritative Total */}
        <div className="checkout-summary-col">
          <div className="checkout-summary-card">
            <h3 className="summary-card-title">Order Total</h3>

            {shop && (
              <div className="summary-shop-info">
                <div className="summary-shop-name">{shop.name}</div>
                <div className="summary-shop-sub">📍 {shop.address}</div>
                {shop.business_phone && (
                  <div className="summary-shop-phone">📞 {shop.business_phone}</div>
                )}
              </div>
            )}

            <div className="summary-rows-group">
              <div className="summary-row">
                <span>Items Subtotal</span>
                <span className="summary-value">₹{Number(subtotal).toFixed(2)}</span>
              </div>
              <div className="summary-row">
                <span>Delivery Method</span>
                <span className="summary-value" style={{ fontWeight: 600 }}>
                  {deliveryMethod === 'LEAVE_AT_DOOR' ? '🚪 Contactless delivery' : '🤝 Personal handover'}
                </span>
              </div>
              <div className="summary-row">
                <span>Local Neighborhood Delivery</span>
                <span className="summary-value summary-free">Free</span>
              </div>
              <div className="summary-row">
                <span>Estimated Packaging & Taxes</span>
                <span className="summary-value">Included</span>
              </div>
              <div className="summary-row">
                <span>Payment Mode</span>
                <span className="summary-value" style={{ fontWeight: 600 }}>
                  {paymentMethod === 'ONLINE' ? '💳 Online (Stripe Test)' : '💵 Cash on Delivery'}
                </span>
              </div>
            </div>

            <div className="summary-divider"></div>

            <div className="summary-total-row">
              <span className="summary-total-label">Grand Total</span>
              <span className="summary-total-amount">₹{Number(total).toFixed(2)}</span>
            </div>

            {/* Incomplete Address Warning in Summary */}
            {!isAddressComplete && (
              <div className="summary-address-alert">
                <span className="alert-icon">⚠️</span>
                <span>Complete your delivery address in Profile to enable order placement.</span>
              </div>
            )}

            {/* Place Order CTA Button */}
            <button
              type="button"
              onClick={handlePlaceOrder}
              disabled={isPlacing || !isAddressComplete || items.length === 0}
              className="button button-primary checkout-place-order-btn"
              title={
                !isAddressComplete
                  ? 'Please update your delivery profile before placing an order'
                  : paymentMethod === 'ONLINE'
                  ? 'Proceed to Stripe Checkout'
                  : 'Place order with Cash on Delivery'
              }
            >
              {isPlacing ? (
                <>
                  <span className="spinner" style={{ width: '18px', height: '18px', borderWidth: '2px', borderTopColor: '#fff' }}></span>
                  <span>{paymentMethod === 'ONLINE' ? 'Redirecting to Stripe...' : 'Placing Order...'}</span>
                </>
              ) : paymentMethod === 'ONLINE' ? (
                `Pay with Stripe Test Mode • ₹${Number(total).toFixed(2)}`
              ) : (
                `Place COD Order • ₹${Number(total).toFixed(2)}`
              )}
            </button>

            {/* Trust and Authoritative Note */}
            <div className="checkout-trust-box">
              <div className="trust-item">
                <span className="trust-icon">🛡️</span>
                <span>Backend authoritative price & inventory verification</span>
              </div>
              <div className="trust-item">
                <span className="trust-icon">{paymentMethod === 'ONLINE' ? '🔒' : '💵'}</span>
                <span>
                  {paymentMethod === 'ONLINE'
                    ? '256-bit SSL encrypted Stripe Test Mode checkout'
                    : 'Zero pre-payment required. Pay upon delivery.'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
