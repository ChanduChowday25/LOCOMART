import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { syncStripeSession, cancelStripeCheckout, fetchOrderById } from '../api/client';
import type { ProfileUpdatePayload, OrderDetails } from '../api/client';
import { ShopkeeperApplicationView } from '../components/ShopkeeperApplicationView';
import { CustomerShopsView } from '../components/CustomerShopsView';
import { CustomerCartView } from '../components/CustomerCartView';
import { CustomerCheckoutView } from '../components/CustomerCheckoutView';
import { CustomerOrderSuccessView } from '../components/CustomerOrderSuccessView';
import { CustomerOrdersView } from '../components/CustomerOrdersView';
import { CustomerOrderDetailView } from '../components/CustomerOrderDetailView';
import { useCart } from '../context/CartContext';

type SidebarTab = 'overview' | 'shops' | 'cart' | 'checkout' | 'orders' | 'order-detail' | 'order-success' | 'profile' | 'apply' | 'notifications';
const VALID_TABS: SidebarTab[] = ['overview', 'shops', 'cart', 'checkout', 'orders', 'order-detail', 'order-success', 'profile', 'apply', 'notifications'];

export const CustomerPage: React.FC = () => {
  const { user, token, updateCustomerProfile, signOut } = useAuth();
  const { itemCount, refreshCart } = useCart();
  const [searchParams, setSearchParams] = useSearchParams();

  const tabParam = searchParams.get('tab') as SidebarTab | null;
  const [activeTab, setActiveTab] = useState<SidebarTab>(
    tabParam && VALID_TABS.includes(tabParam) ? tabParam : 'profile'
  );
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(
    searchParams.get('orderId') || null
  );
  const [placedOrder, setPlacedOrder] = useState<OrderDetails | null>(null);

  // Synchronize state if URL search params change
  useEffect(() => {
    if (tabParam && VALID_TABS.includes(tabParam)) {
      setActiveTab(tabParam);
    }
    const orderIdParam = searchParams.get('orderId');
    if (orderIdParam) {
      setSelectedOrderId(orderIdParam);
    }
  }, [tabParam, searchParams]);

  // Handle return from Stripe Checkout (success or cancelled)
  useEffect(() => {
    const orderIdParam = searchParams.get('orderId');
    const sessionIdParam = searchParams.get('session_id') || undefined;
    const isCancelled = searchParams.get('cancelled') === 'true';

    if (token && orderIdParam) {
      if (tabParam === 'order-success') {
        // Customer returned from successful Stripe payment
        if (!placedOrder || placedOrder.id !== orderIdParam) {
          syncStripeSession(token, orderIdParam, sessionIdParam)
            .then((res) => {
              if (res.order) {
                setPlacedOrder(res.order);
              }
            })
            .catch(() => {
              fetchOrderById(token, orderIdParam)
                .then((res) => {
                  if (res.order) {
                    setPlacedOrder(res.order);
                  }
                })
                .catch(console.error);
            });
        }
      } else if (tabParam === 'checkout' && isCancelled) {
        // Customer cancelled Stripe checkout
        cancelStripeCheckout(token, orderIdParam)
          .then(() => refreshCart())
          .catch(console.error);
      }
    }
  }, [tabParam, searchParams, token, placedOrder]);

  const handleTabSwitch = (tab: SidebarTab, orderId?: string) => {
    setActiveTab(tab);
    const newParams: Record<string, string> = { tab };
    if (orderId) {
      newParams.orderId = orderId;
      setSelectedOrderId(orderId);
    }
    setSearchParams(newParams);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleRefreshOrder = async (orderId: string) => {
    if (!token) return;
    const sessionIdParam = searchParams.get('session_id') || undefined;
    try {
      const res = await syncStripeSession(token, orderId, sessionIdParam);
      if (res.order) {
        setPlacedOrder(res.order);
      }
    } catch {
      const res2 = await fetchOrderById(token, orderId);
      if (res2.order) {
        setPlacedOrder(res2.order);
      }
    }
  };

  // Profile Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');

  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Populate form with existing user data
  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setPhone(user.phone || '');
      setAddress(user.address || '');
      setCity(user.city || '');
      setState(user.state || '');
      setPincode(user.pincode || '');
    }
  }, [user]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    setSaving(true);

    const payload: ProfileUpdatePayload = {
      name: name.trim(),
      phone: phone.trim(),
      address: address.trim(),
      city: city.trim(),
      state: state.trim(),
      pincode: pincode.trim(),
    };

    const res = await updateCustomerProfile(payload);
    setSaving(false);

    if (res.success) {
      setFeedback({
        type: 'success',
        message: 'Your profile and delivery details have been saved successfully.',
      });
      setTimeout(() => setFeedback(null), 5000);
    } else {
      setFeedback({
        type: 'error',
        message: res.error || 'Failed to update profile. Please try again.',
      });
    }
  };

  const userDisplayName = user?.name?.trim() || user?.email?.split('@')[0] || 'Customer';

  return (
    <div className="dashboard-layout">
      {/* ------------------------------------------------------------- */}
      {/* Customer Sidebar (STRICTLY Customer Navigation Only)           */}
      {/* ------------------------------------------------------------- */}
      <aside className="dashboard-sidebar" aria-label="Customer Navigation">
        <div className="sidebar-customer-header">
          <div className="sidebar-avatar">
            {userDisplayName.charAt(0).toUpperCase()}
          </div>
          <div className="sidebar-user-details">
            <h3>{userDisplayName}</h3>
            <p title={user?.email}>{user?.email}</p>
            <span className="user-role-tag" style={{ marginTop: '0.25rem', display: 'inline-block' }}>
              Customer
            </span>
          </div>
        </div>

        {/* The 6 Customer Navigation Items (Strictly Customer Only) */}
        <nav className="sidebar-nav">
          <button
            type="button"
            className={`sidebar-nav-item ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => handleTabSwitch('overview')}
          >
            <span className="item-icon">📊</span>
            <span className="item-text">Overview</span>
          </button>

          <button
            type="button"
            className={`sidebar-nav-item ${activeTab === 'shops' ? 'active' : ''}`}
            onClick={() => handleTabSwitch('shops')}
          >
            <span className="item-icon">🏪</span>
            <span className="item-text">Shops</span>
            <span className="sidebar-tag-live">Active</span>
          </button>

          <button
            type="button"
            className={`sidebar-nav-item ${activeTab === 'cart' ? 'active' : ''}`}
            onClick={() => handleTabSwitch('cart')}
          >
            <span className="item-icon">🛒</span>
            <span className="item-text">Cart</span>
            {itemCount > 0 ? (
              <span className="sidebar-cart-badge">{itemCount}</span>
            ) : (
              <span className="sidebar-tag-live">Active</span>
            )}
          </button>

          <button
            type="button"
            className={`sidebar-nav-item ${activeTab === 'orders' || activeTab === 'order-detail' ? 'active' : ''}`}
            onClick={() => handleTabSwitch('orders')}
          >
            <span className="item-icon">📦</span>
            <span className="item-text">My Orders</span>
            <span className="sidebar-tag-live">Active</span>
          </button>

          <button
            type="button"
            className={`sidebar-nav-item ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => handleTabSwitch('profile')}
          >
            <span className="item-icon">👤</span>
            <span className="item-text">Profile</span>
            <span className="sidebar-tag-live">Active</span>
          </button>

          <button
            type="button"
            className={`sidebar-nav-item ${activeTab === 'apply' ? 'active' : ''}`}
            onClick={() => handleTabSwitch('apply')}
          >
            <span className="item-icon">🏪</span>
            <span className="item-text">Become a Shopkeeper</span>
          </button>

          <button
            type="button"
            className={`sidebar-nav-item ${activeTab === 'notifications' ? 'active' : ''}`}
            onClick={() => handleTabSwitch('notifications')}
          >
            <span className="item-icon">🔔</span>
            <span className="item-text">Notifications</span>
          </button>
        </nav>

        {/* 7th item: Logout */}
        <div className="sidebar-footer">
          <button
            type="button"
            onClick={signOut}
            className="sidebar-logout-btn"
          >
            <span className="item-icon">🚪</span>
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ------------------------------------------------------------- */}
      {/* Main Content Area                                             */}
      {/* ------------------------------------------------------------- */}
      <main className="dashboard-content">
        {/* ========================================================= */}
        {/* TAB 1: OVERVIEW (Real Local-Commerce Customer Hub)        */}
        {/* ========================================================= */}
        {activeTab === 'overview' && (
          <div>
            <div className="content-header">
              <h1>Welcome back, {userDisplayName}! 👋</h1>
              <p>
                Your neighborhood grocery portal. Manage your saved delivery address, browse connected local shops, and prepare for daily orders.
              </p>
            </div>

            <div className="overview-grid">
              {/* Delivery Address Card */}
              <div className="overview-card">
                <div>
                  <div className="overview-card-header">
                    <div className="overview-card-icon">📍</div>
                    <h3 className="overview-card-title">Delivery Address</h3>
                  </div>
                  <div className="overview-card-content">
                    {user?.address ? (
                      <div>
                        <strong>{user.address}</strong>
                        <div>{user.city ? `${user.city}, ` : ''}{user.state || ''} {user.pincode ? `- ${user.pincode}` : ''}</div>
                      </div>
                    ) : (
                      <p style={{ color: 'var(--color-text-muted)' }}>
                        No delivery address saved yet. Add your address to enable fast local checkout.
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleTabSwitch('profile')}
                  className="button button-sm button-secondary"
                  style={{ alignSelf: 'flex-start' }}
                >
                  {user?.address ? 'Update Address →' : '+ Add Address'}
                </button>
              </div>

              {/* Contact Information Card */}
              <div className="overview-card">
                <div>
                  <div className="overview-card-header">
                    <div className="overview-card-icon">📞</div>
                    <h3 className="overview-card-title">Contact Details</h3>
                  </div>
                  <div className="overview-card-content">
                    <p><strong>Email:</strong> {user?.email}</p>
                    <p>
                      <strong>Phone:</strong>{' '}
                      {user?.phone ? (
                        <span>{user.phone}</span>
                      ) : (
                        <span style={{ color: 'var(--color-text-muted)' }}>Not configured</span>
                      )}
                    </p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '0.35rem' }}>
                      Required for delivery coordination & order OTP.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleTabSwitch('profile')}
                  className="button button-sm button-secondary"
                  style={{ alignSelf: 'flex-start' }}
                >
                  Edit Profile →
                </button>
              </div>

              {/* Connected Local Stores Card */}
              <div className="overview-card">
                <div>
                  <div className="overview-card-header">
                    <div className="overview-card-icon">🏪</div>
                    <h3 className="overview-card-title">Local Neighborhood Shops</h3>
                  </div>
                  <div className="overview-card-content">
                    <p style={{ fontWeight: 600, color: 'var(--color-brown-900)' }}>4 Verified Local Stores</p>
                    <p style={{ fontSize: '0.825rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
                      FreshMart, Green Valley Groceries, Sri Lakshmi Stores, Daily Needs Mart.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleTabSwitch('shops')}
                  className="button button-sm button-primary"
                  style={{ alignSelf: 'flex-start' }}
                >
                  Explore Shops →
                </button>
              </div>

              {/* Become a Shopkeeper Card */}
              <div className="overview-card" style={{ border: '1px solid var(--color-primary-subtle)', background: 'linear-gradient(135deg, #FFFDF9 0%, #FFF5ED 100%)' }}>
                <div>
                  <div className="overview-card-header">
                    <div className="overview-card-icon" style={{ background: 'var(--color-primary-light)', color: 'var(--color-primary)' }}>📝</div>
                    <h3 className="overview-card-title">Become a Shopkeeper</h3>
                  </div>
                  <div className="overview-card-content">
                    <p style={{ fontWeight: 600, color: 'var(--color-brown-900)' }}>Sell to your local neighborhood</p>
                    <p style={{ fontSize: '0.825rem', color: 'var(--color-text-muted)', marginTop: '0.2rem' }}>
                      Register your grocery store on LOCOMART to reach nearby families, manage products, and fulfill grocery orders directly.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleTabSwitch('apply')}
                  className="button button-sm button-primary"
                  style={{ alignSelf: 'flex-start' }}
                >
                  Apply to Sell on LOCOMART →
                </button>
              </div>
            </div>

            {/* Local Shopping Banner */}
            <div
              style={{
                background: 'linear-gradient(135deg, #FFF9F2 0%, #F5EFEB 100%)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-lg)',
                padding: '1.75rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '1.25rem',
              }}
            >
              <div style={{ maxWidth: '600px' }}>
                <h3 style={{ fontSize: '1.15rem', color: 'var(--color-brown-900)', marginBottom: '0.35rem' }}>
                  Support your local neighborhood store owners
                </h3>
                <p style={{ fontSize: '0.9rem', color: 'var(--color-text-body)', lineHeight: 1.5 }}>
                  LOCOMART empowers local neighborhood grocery stores to deliver directly to your doorstep. Keep your profile and address updated for smooth order fulfillment.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleTabSwitch('profile')}
                className="button button-secondary"
              >
                Review Saved Details
              </button>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB 2: PROFILE (Clean Professional Production Form)       */}
        {/* ========================================================= */}
        {activeTab === 'profile' && (
          <div>
            <div className="content-header">
              <h1>Customer Profile & Delivery Details</h1>
              <p>
                Keep your delivery address and contact information up-to-date so local grocery orders reach you promptly.
              </p>
            </div>

            {feedback && (
              <div className={`alert ${feedback.type === 'success' ? 'alert-success' : 'alert-error'}`} role="alert">
                <span className="alert-icon">{feedback.type === 'success' ? '✓' : '⚠️'}</span>
                <span>{feedback.message}</span>
              </div>
            )}

            <div className="profile-card">
              <form onSubmit={handleSaveProfile} noValidate>
                {/* Section 1: Personal & Contact Information */}
                <div className="profile-section-title">
                  <span>👤</span>
                  <span>Personal & Contact Information</span>
                </div>

                <div className="form-row">
                  <div className="form-group flex-1">
                    <label htmlFor="prof-name">Full Name</label>
                    <input
                      id="prof-name"
                      type="text"
                      placeholder="e.g. Chandu Chowdary"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                    <span className="field-hint">Your name as shown on order deliveries.</span>
                  </div>

                  <div className="form-group flex-1">
                    <label htmlFor="prof-phone">Phone Number</label>
                    <input
                      id="prof-phone"
                      type="tel"
                      placeholder="e.g. 9876543210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                    />
                    <span className="field-hint">Used for delivery arrival updates and order OTP.</span>
                  </div>
                </div>

                <hr className="profile-section-divider" />

                {/* Section 2: Delivery Address */}
                <div className="profile-section-title">
                  <span>📍</span>
                  <span>Delivery Address</span>
                </div>

                <div className="form-group">
                  <label htmlFor="prof-address">Street Address / House / Flat No.</label>
                  <textarea
                    id="prof-address"
                    rows={3}
                    placeholder="e.g. Flat 302, Green Orchid Apartments, 14 Main Road"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                  <span className="field-hint">Complete street address for grocery delivery.</span>
                </div>

                <div className="form-row">
                  <div className="form-group flex-1">
                    <label htmlFor="prof-city">City</label>
                    <input
                      id="prof-city"
                      type="text"
                      placeholder="e.g. Chennai"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                    />
                  </div>

                  <div className="form-group flex-1">
                    <label htmlFor="prof-state">State</label>
                    <input
                      id="prof-state"
                      type="text"
                      placeholder="e.g. Tamil Nadu"
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                    />
                  </div>

                  <div className="form-group flex-1">
                    <label htmlFor="prof-pincode">Pincode</label>
                    <input
                      id="prof-pincode"
                      type="text"
                      placeholder="e.g. 600001"
                      value={pincode}
                      onChange={(e) => setPincode(e.target.value)}
                    />
                  </div>
                </div>

                <hr className="profile-section-divider" />

                {/* Section 3: Account & Security Identity */}
                <div className="profile-section-title">
                  <span>🔒</span>
                  <span>Account & Authentication Identity</span>
                </div>

                <div className="form-row">
                  <div className="form-group flex-1">
                    <label htmlFor="prof-email">Email Address</label>
                    <input
                      id="prof-email"
                      type="email"
                      value={user?.email || ''}
                      disabled
                      className="input-disabled"
                    />
                    <span className="field-hint">Linked to your InsForge Auth login.</span>
                  </div>

                  <div className="form-group flex-1">
                    <label>Assigned Application Role</label>
                    <input
                      type="text"
                      value={user?.role || 'CUSTOMER'}
                      disabled
                      className="input-disabled"
                    />
                    <span className="field-hint">Role enforced securely by FastAPI backend.</span>
                  </div>
                </div>

                {/* Action Bar */}
                <div className="profile-actions-bar">
                  <button
                    type="submit"
                    className="button button-primary"
                    disabled={saving}
                  >
                    {saving ? (
                      <>
                        <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', borderTopColor: '#fff' }}></span>
                        <span>Saving Profile Changes...</span>
                      </>
                    ) : (
                      'Save Changes'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* TAB: BECOME A SHOPKEEPER (Milestone M2 Application & Status) */}
        {/* ========================================================= */}
        {activeTab === 'apply' && (
          <ShopkeeperApplicationView user={user} token={token} />
        )}

        {/* ========================================================= */}
        {/* TAB: SHOPS (Milestone M3 Real Database Shops & Products)  */}
        {/* ========================================================= */}
        {activeTab === 'shops' && (
          <CustomerShopsView
            onNavigateToCart={() => handleTabSwitch('cart')}
            onNavigateToCheckout={() => handleTabSwitch('checkout')}
          />
        )}

        {/* ========================================================= */}
        {/* TAB: CART (Milestone M4 Real Shopping Cart)               */}
        {/* ========================================================= */}
        {activeTab === 'cart' && (
          <CustomerCartView
            onNavigateToShops={() => handleTabSwitch('shops')}
            onNavigateToCheckout={() => handleTabSwitch('checkout')}
          />
        )}

        {/* ========================================================= */}
        {/* TAB: CHECKOUT (Milestone M5.2 Customer Checkout & COD)    */}
        {/* ========================================================= */}
        {activeTab === 'checkout' && (
          <CustomerCheckoutView
            onNavigateToCart={() => handleTabSwitch('cart')}
            onNavigateToProfile={() => handleTabSwitch('profile')}
            onOrderSuccess={(order) => {
              setPlacedOrder(order);
              setSelectedOrderId(order.id);
              handleTabSwitch('order-success', order.id);
            }}
          />
        )}

        {/* ========================================================= */}
        {/* TAB: ORDER SUCCESS (Milestone M5.2 Placed Confirmation)   */}
        {/* ========================================================= */}
        {activeTab === 'order-success' && (
          placedOrder ? (
            <CustomerOrderSuccessView
              order={placedOrder}
              onViewAllOrders={() => handleTabSwitch('orders')}
              onViewOrderDetail={(oid) => handleTabSwitch('order-detail', oid)}
              onContinueShopping={() => handleTabSwitch('shops')}
              onReturnToCart={() => handleTabSwitch('cart')}
              onRefreshOrderStatus={handleRefreshOrder}
            />
          ) : (
            <CustomerOrderDetailView
              orderId={selectedOrderId || searchParams.get('orderId') || ''}
              onBack={() => handleTabSwitch('orders')}
              onNavigateToShops={() => handleTabSwitch('shops')}
            />
          )
        )}

        {/* ========================================================= */}
        {/* TAB: MY ORDERS (Milestone M5.2 Customer Order History)    */}
        {/* ========================================================= */}
        {activeTab === 'orders' && (
          <CustomerOrdersView
            onViewOrderDetail={(oid) => handleTabSwitch('order-detail', oid)}
            onNavigateToShops={() => handleTabSwitch('shops')}
          />
        )}

        {/* ========================================================= */}
        {/* TAB: ORDER DETAIL (Milestone M5.2 Price Snapshots)       */}
        {/* ========================================================= */}
        {activeTab === 'order-detail' && (
          <CustomerOrderDetailView
            orderId={selectedOrderId || searchParams.get('orderId') || ''}
            onBack={() => handleTabSwitch('orders')}
            onNavigateToShops={() => handleTabSwitch('shops')}
          />
        )}

        {/* ========================================================= */}
        {/* PLACEHOLDERS FOR SUBSEQUENT MILESTONES (Notifications)   */}
        {/* ========================================================= */}
        {activeTab === 'notifications' && (
          <div className="placeholder-card">
            <div className="placeholder-icon">🔔</div>
            <h3>Order Notifications</h3>
            <p className="placeholder-text">
              Real-time status alerts for order confirmation, dispatch, and delivery updates.
            </p>
            <button
              type="button"
              onClick={() => handleTabSwitch('profile')}
              className="button button-secondary"
            >
              Back to My Profile
            </button>
          </div>
        )}
      </main>
    </div>
  );
};
