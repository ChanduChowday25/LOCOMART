import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const HomePage: React.FC = () => {
  const { user } = useAuth();

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2.5rem 1.5rem', width: '100%' }}>
      {/* Hero Section */}
      <section
        style={{
          background: 'linear-gradient(135deg, #FFF9F2 0%, #F5EFEB 100%)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-xl)',
          padding: '3rem 2.5rem',
          marginBottom: '2.5rem',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '2rem',
        }}
      >
        <div style={{ maxWidth: '640px' }}>
          <h1
            style={{
              fontSize: 'clamp(2rem, 4vw, 2.75rem)',
              fontWeight: 800,
              color: 'var(--color-brown-900)',
              lineHeight: 1.18,
              marginBottom: '1rem',
              letterSpacing: '-0.02em',
            }}
          >
            Your trusted local shops, delivered to your doorstep.
          </h1>

          <p
            style={{
              fontSize: '1.05rem',
              color: 'var(--color-text-body)',
              lineHeight: 1.6,
              marginBottom: '1.75rem',
            }}
          >
            Shop your neighborhood stores for everyday groceries, enjoy transparent prices, and get your essentials delivered with convenience and care.
          </p>

          <div style={{ display: 'flex', gap: '0.85rem', flexWrap: 'wrap' }}>
            {user?.role === 'CUSTOMER' ? (
              <Link to="/customer" className="button button-primary">
                Open Customer Dashboard →
              </Link>
            ) : user?.role === 'SHOPKEEPER' ? (
              <Link to="/shopkeeper" className="button button-primary">
                Open Shopkeeper Portal →
              </Link>
            ) : user?.role === 'ADMIN' ? (
              <Link to="/admin" className="button button-primary">
                Open Admin Portal →
              </Link>
            ) : (
              <>
                <Link to="/login" className="button button-primary">
                  Sign In to LOCOMART
                </Link>
                <Link to="/register" className="button button-secondary">
                  Create Customer Account
                </Link>
              </>
            )}
          </div>
        </div>

        <div style={{ flex: '1', minWidth: '280px', maxWidth: '420px' }}>
          <img
            src="/assets/grocery-store-hero.jpg"
            alt="Neighborhood grocery store with rice, flour, cooking oil, packaged foods, and household essentials"
            style={{
              width: '100%',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-md)',
              border: '1px solid var(--color-border)',
              objectFit: 'cover',
              maxHeight: '280px',
            }}
          />
        </div>
      </section>

      {/* Slim Continuously Scrolling Grocery Ticker */}
      <section className="grocery-ticker" aria-label="LOCOMART Highlights">
        <div className="grocery-ticker-mask">
          <div className="grocery-ticker-track">
            {/* Primary Track */}
            <div className="grocery-ticker-group">
              <span className="ticker-item"><span className="ticker-icon">🛒</span> Good groceries. Great neighbors.</span>
              <span className="ticker-separator" aria-hidden="true">•</span>
              <span className="ticker-item"><span className="ticker-icon">🍞</span> Everyday essentials, closer to home.</span>
              <span className="ticker-separator" aria-hidden="true">•</span>
              <span className="ticker-item"><span className="ticker-icon">🏪</span> Your neighborhood shops, one convenient place.</span>
              <span className="ticker-separator" aria-hidden="true">•</span>
              <span className="ticker-item"><span className="ticker-icon">🛍️</span> Shop local. Live easy.</span>
              <span className="ticker-separator" aria-hidden="true">•</span>
              <span className="ticker-item"><span className="ticker-icon">🚚</span> Local stores, delivered with care.</span>
              <span className="ticker-separator" aria-hidden="true">•</span>
            </div>

            {/* Seamless Infinite Loop Duplicate */}
            <div className="grocery-ticker-group" aria-hidden="true">
              <span className="ticker-item"><span className="ticker-icon">🛒</span> Good groceries. Great neighbors.</span>
              <span className="ticker-separator" aria-hidden="true">•</span>
              <span className="ticker-item"><span className="ticker-icon">🍞</span> Everyday essentials, closer to home.</span>
              <span className="ticker-separator" aria-hidden="true">•</span>
              <span className="ticker-item"><span className="ticker-icon">🏪</span> Your neighborhood shops, one convenient place.</span>
              <span className="ticker-separator" aria-hidden="true">•</span>
              <span className="ticker-item"><span className="ticker-icon">🛍️</span> Shop local. Live easy.</span>
              <span className="ticker-separator" aria-hidden="true">•</span>
              <span className="ticker-item"><span className="ticker-icon">🚚</span> Local stores, delivered with care.</span>
              <span className="ticker-separator" aria-hidden="true">•</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
