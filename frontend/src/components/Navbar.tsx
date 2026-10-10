import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';

export const Navbar: React.FC = () => {
  const { user, signOut } = useAuth();
  const { itemCount } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    setMobileMenuOpen(false);
    await signOut();
    navigate('/login');
  };

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  const isCustomer = user?.role === 'CUSTOMER';
  const isShopkeeper = user?.role === 'SHOPKEEPER';
  const isAdmin = user?.role === 'ADMIN';

  return (
    <header className="navbar">
      <div className="nav-container">
        {/* Brand Logo & Title */}
        <Link to="/" className="nav-brand" onClick={closeMobileMenu}>
          <img
            src="/assets/locomart-logo.png"
            alt="LOCOMART Logo"
            className="brand-logo-img"
          />
          <div className="brand-text-wrapper">
            <span className="brand-text">LOCOMART</span>
            <span className="brand-subtext">Local Grocery Platform</span>
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <nav className="nav-links" aria-label="Main Navigation">
          {/* Unauthenticated Navigation */}
          {!user && (
            <>
              <Link
                to="/"
                className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}
              >
                Home
              </Link>
              <Link
                to="/login?portal=customer"
                className="nav-link"
              >
                Browse Shops
              </Link>
            </>
          )}

          {/* Authenticated Customer Navigation — STRICTLY CUSTOMER ONLY */}
          {isCustomer && (
            <>
              <Link
                to="/customer?tab=overview"
                className={`nav-link ${location.pathname === '/customer' && (!location.search || location.search.includes('overview')) ? 'active' : ''}`}
              >
                Overview
              </Link>
              <Link
                to="/customer?tab=shops"
                className={`nav-link ${location.search.includes('shops') ? 'active' : ''}`}
              >
                Shops
              </Link>
              <Link
                to="/customer?tab=cart"
                className={`nav-link ${location.search.includes('cart') ? 'active' : ''}`}
              >
                Cart {itemCount > 0 ? (
                  <span className="nav-cart-badge">{itemCount}</span>
                ) : (
                  <span className="nav-tag-live">Active</span>
                )}
              </Link>
              <Link
                to="/customer?tab=orders"
                className={`nav-link ${location.search.includes('orders') ? 'active' : ''}`}
              >
                My Orders <span className="nav-tag-live">Active</span>
              </Link>
              <Link
                to="/customer?tab=notifications"
                className={`nav-link ${location.search.includes('notifications') ? 'active' : ''}`}
              >
                Notifications
              </Link>
              <Link
                to="/customer?tab=profile"
                className={`nav-link ${location.search.includes('profile') ? 'active' : ''}`}
              >
                Profile
              </Link>
            </>
          )}

          {/* Authenticated Shopkeeper Navigation */}
          {isShopkeeper && (
            <Link
              to="/shopkeeper"
              className={`nav-link ${location.pathname === '/shopkeeper' ? 'active' : ''}`}
            >
              Shopkeeper Portal
            </Link>
          )}

          {/* Authenticated Admin Navigation */}
          {isAdmin && (
            <Link
              to="/admin"
              className={`nav-link ${location.pathname === '/admin' ? 'active' : ''}`}
            >
              Admin Governance
            </Link>
          )}
        </nav>

        {/* Right Actions: Cart, User Badge, or Auth Buttons */}
        <div className="nav-actions">
          {/* Quick Cart Shortcut (Customer or Guest) */}
          {(isCustomer || !user) && (
            <Link
              to={isCustomer ? "/customer?tab=cart" : "/login?portal=customer"}
              className="nav-cart-btn"
              title="Shopping Cart"
              onClick={closeMobileMenu}
            >
              🛒
              <span className="cart-count-badge">{itemCount}</span>
            </Link>
          )}

          {user ? (
            <div className="user-profile-badge desktop-only">
              <div className="user-avatar-circle">
                {(user.name || user.email || 'U').charAt(0).toUpperCase()}
              </div>
              <span className="user-name" title={user.name || user.email}>
                {user.name || user.email.split('@')[0]}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="button-logout"
                title="Sign out of account"
              >
                Logout
              </button>
            </div>
          ) : (
            <div className="auth-buttons desktop-only" style={{ display: 'flex', gap: '0.65rem' }}>
              <Link to="/login" className="button button-sm button-secondary">
                Sign In
              </Link>
              <Link to="/register" className="button button-sm button-primary">
                Register
              </Link>
            </div>
          )}

          {/* Mobile Menu Button */}
          <button
            type="button"
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Close Menu' : 'Open Menu'}
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      <div className={`mobile-nav-drawer ${mobileMenuOpen ? 'open' : ''}`}>
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', paddingBottom: '1rem', borderBottom: '1px solid var(--color-border)' }}>
            <div className="user-avatar-circle" style={{ width: '40px', height: '40px', fontSize: '1rem' }}>
              {(user.name || user.email || 'U').charAt(0).toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--color-brown-900)' }}>{user.name || 'User'}</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{user.email}</div>
              <span className="user-role-tag" style={{ marginTop: '0.25rem', display: 'inline-block' }}>{user.role}</span>
            </div>
          </div>
        )}

        <div className="mobile-drawer-links">
          {!user && (
            <>
              <Link to="/" className="mobile-drawer-link" onClick={closeMobileMenu}>
                <span>Home</span>
                <span>→</span>
              </Link>
              <Link to="/login" className="mobile-drawer-link" onClick={closeMobileMenu}>
                <span>Sign In</span>
                <span>→</span>
              </Link>
              <Link to="/register" className="mobile-drawer-link" onClick={closeMobileMenu}>
                <span>Create Customer Account</span>
                <span>→</span>
              </Link>
            </>
          )}

          {isCustomer && (
            <>
              <Link
                to="/customer?tab=overview"
                className={`mobile-drawer-link ${location.search.includes('overview') ? 'active' : ''}`}
                onClick={closeMobileMenu}
              >
                <span>📊 Overview</span>
                <span>→</span>
              </Link>
              <Link
                to="/customer?tab=shops"
                className={`mobile-drawer-link ${location.search.includes('shops') ? 'active' : ''}`}
                onClick={closeMobileMenu}
              >
                <span>🏪 Local Shops</span>
                <span>→</span>
              </Link>
              <Link
                to="/customer?tab=cart"
                className={`mobile-drawer-link ${location.search.includes('cart') ? 'active' : ''}`}
                onClick={closeMobileMenu}
              >
                <span>🛒 Cart ({itemCount})</span>
                <span className="nav-tag-live">Active</span>
              </Link>
              <Link
                to="/customer?tab=orders"
                className={`mobile-drawer-link ${location.search.includes('orders') ? 'active' : ''}`}
                onClick={closeMobileMenu}
              >
                <span>📦 My Orders</span>
                <span className="nav-tag-live">Active</span>
              </Link>
              <Link
                to="/customer?tab=notifications"
                className={`mobile-drawer-link ${location.search.includes('notifications') ? 'active' : ''}`}
                onClick={closeMobileMenu}
              >
                <span>🔔 Notifications</span>
                <span>→</span>
              </Link>
              <Link
                to="/customer?tab=profile"
                className={`mobile-drawer-link ${location.search.includes('profile') ? 'active' : ''}`}
                onClick={closeMobileMenu}
              >
                <span>👤 My Profile</span>
                <span className="sidebar-tag-live">Active</span>
              </Link>
            </>
          )}

          {isShopkeeper && (
            <Link to="/shopkeeper" className="mobile-drawer-link" onClick={closeMobileMenu}>
              <span>🏪 Shopkeeper Portal</span>
              <span>→</span>
            </Link>
          )}

          {isAdmin && (
            <Link to="/admin" className="mobile-drawer-link" onClick={closeMobileMenu}>
              <span>🛡️ Admin Portal</span>
              <span>→</span>
            </Link>
          )}
        </div>

        {user && (
          <button
            type="button"
            onClick={handleLogout}
            className="button button-block button-secondary"
            style={{ marginTop: 'auto', color: 'var(--color-error)' }}
          >
            Sign Out
          </button>
        )}
      </div>
    </header>
  );
};
