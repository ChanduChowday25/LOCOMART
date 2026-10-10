import React, { useEffect, useState, useMemo, useRef } from 'react';
import { fetchActiveShops, fetchShopProducts } from '../api/client';
import type { Shop, Product } from '../api/client';
import { useCart } from '../context/CartContext';

interface CustomerShopsViewProps {
  onNavigateToCart?: () => void;
  onNavigateToCheckout?: () => void;
}

export const CustomerShopsView: React.FC<CustomerShopsViewProps> = ({
  onNavigateToCart,
  onNavigateToCheckout,
}) => {
  const {
    cart,
    itemCount,
    addItem,
    updateQuantity,
    removeItem,
    getCartItem,
    conflictError,
    clearConflict,
    error: cartError,
    clearError: clearCartError,
  } = useCart();

  const conflictAlertRef = useRef<HTMLDivElement>(null);
  const cartErrorAlertRef = useRef<HTMLDivElement>(null);

  // Auto-scroll conflict alert into view immediately when triggered
  useEffect(() => {
    if (conflictError && conflictAlertRef.current) {
      conflictAlertRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [conflictError]);

  // Auto-scroll general cart error into view immediately when triggered
  useEffect(() => {
    if (cartError && cartErrorAlertRef.current) {
      cartErrorAlertRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [cartError]);

  const [shops, setShops] = useState<Shop[]>([]);
  const [loadingShops, setLoadingShops] = useState<boolean>(true);
  const [shopError, setShopError] = useState<string | null>(null);

  // Detail view state
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState<boolean>(false);
  const [productError, setProductError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Load shops on mount
  useEffect(() => {
    async function loadShops() {
      setLoadingShops(true);
      setShopError(null);
      try {
        const res = await fetchActiveShops();
        setShops(res.shops || []);
      } catch (err: any) {
        setShopError(err.message || 'Failed to load neighborhood shops.');
      } finally {
        setLoadingShops(false);
      }
    }
    loadShops();
  }, []);

  // Load products when a shop is selected
  useEffect(() => {
    if (!selectedShop) return;

    async function loadProducts() {
      setLoadingProducts(true);
      setProductError(null);
      try {
        const res = await fetchShopProducts(selectedShop!.id);
        setProducts(res.products || []);
      } catch (err: any) {
        setProductError(err.message || 'Failed to load shop products.');
      } finally {
        setLoadingProducts(false);
      }
    }
    loadProducts();
    setSelectedCategory('All');
    setSearchQuery('');
  }, [selectedShop]);

  // Derive categories from loaded products
  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return ['All', ...Array.from(set).sort()];
  }, [products]);

  // Filter products by category and search
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesCat =
        selectedCategory === 'All' ||
        p.category?.toLowerCase() === selectedCategory.toLowerCase();
      const matchesSearch =
        !searchQuery.trim() ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCat && matchesSearch;
    });
  }, [products, selectedCategory, searchQuery]);

  const hasItemsInCart = Boolean(cart && itemCount > 0 && cart.items && cart.items.length > 0);

  const renderStickyCartBar = () => {
    if (!hasItemsInCart) return null;

    return (
      <div className="sticky-cart-bar-wrapper" role="region" aria-label="Cart Summary & Quick Checkout">
        <div className="sticky-cart-bar">
          <div className="sticky-cart-bar-left">
            <span className="sticky-cart-icon">🛒</span>
            <div className="sticky-cart-info">
              <span className="sticky-cart-count">
                {itemCount} {itemCount === 1 ? 'item' : 'items'}
              </span>
              {cart?.shop?.name && (
                <span className="sticky-cart-shop-name">
                  • {cart.shop.name}
                </span>
              )}
            </div>
            <div className="sticky-cart-divider"></div>
            <div className="sticky-cart-total">
              <span className="sticky-cart-total-label">Total:</span>
              <span className="sticky-cart-total-amount">
                ₹{Number(cart?.total || 0).toFixed(2)}
              </span>
            </div>
          </div>

          <div className="sticky-cart-bar-actions">
            {onNavigateToCart && (
              <button
                type="button"
                onClick={onNavigateToCart}
                className="button button-secondary sticky-cart-view-btn"
              >
                View Cart
              </button>
            )}
            {onNavigateToCheckout && (
              <button
                type="button"
                onClick={onNavigateToCheckout}
                className="button button-primary sticky-cart-checkout-btn"
              >
                <span>Proceed to Checkout</span>
                <span className="checkout-btn-arrow">→</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // View 1: Shop Detail & Product Catalog
  // ---------------------------------------------------------------------------
  if (selectedShop) {
    return (
      <div className={`customer-shop-detail-container ${hasItemsInCart ? 'has-sticky-cart' : ''}`}>
        {/* Back navigation */}
        <button
          type="button"
          onClick={() => setSelectedShop(null)}
          className="button button-sm button-secondary back-to-shops-btn"
          style={{ marginBottom: '1.25rem', display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <span>←</span>
          <span>Back to All Shops</span>
        </button>

        {/* One-Shop Conflict Red Inline Alert */}
        {conflictError && (
          <div
            ref={conflictAlertRef}
            className="cart-inline-conflict-banner"
            role="alert"
            aria-live="assertive"
          >
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
              {onNavigateToCart && (
                <button
                  type="button"
                  onClick={onNavigateToCart}
                  className="button button-sm button-secondary"
                >
                  View Existing Cart
                </button>
              )}
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

        {/* Stock / Availability / General Error Alert */}
        {cartError && (
          <div
            ref={cartErrorAlertRef}
            className="cart-inline-error-banner"
            role="alert"
            aria-live="assertive"
          >
            <div className="error-banner-main">
              <span className="error-banner-icon">❌</span>
              <div className="error-banner-text">
                <strong>Cart Update Failed</strong>
                <p>{cartError}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={clearCartError}
              className="button button-sm button-ghost"
              title="Dismiss error"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Shop Info Header Card */}
        <div className="shop-header-card">
          <div className="shop-header-left">
            <div className="shop-header-avatar">
              {selectedShop.photo_url ? (
                <img
                  src={selectedShop.photo_url}
                  alt={selectedShop.name}
                  className="shop-header-img"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <span className="shop-header-avatar-fallback">🏪</span>
              )}
            </div>
            <div className="shop-header-details">
              <div className="shop-header-title-row">
                <h1 className="shop-header-name">{selectedShop.name}</h1>
                <span
                  className={`shop-status-badge ${
                    selectedShop.is_open ? 'status-open' : 'status-closed'
                  }`}
                >
                  <span className="status-dot"></span>
                  {selectedShop.is_open ? 'Accepting Orders' : 'Currently Closed'}
                </span>
              </div>
              <p className="shop-header-description">{selectedShop.description}</p>
              <div className="shop-header-meta">
                <span className="meta-item">
                  📍 {selectedShop.address}, {selectedShop.city}, {selectedShop.state} - {selectedShop.pincode}
                </span>
                {selectedShop.business_phone && (
                  <span className="meta-item">
                    📞 {selectedShop.business_phone}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="catalog-toolbar">
          <div className="category-chips">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`category-chip ${selectedCategory === cat ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="catalog-search">
            <input
              type="text"
              placeholder="Search products in this store..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="catalog-search-input"
            />
            {searchQuery && (
              <button
                type="button"
                className="clear-search-btn"
                onClick={() => setSearchQuery('')}
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Products List Section */}
        {loadingProducts ? (
          <div className="loading-state-box">
            <div className="spinner"></div>
            <p>Loading products from {selectedShop.name}...</p>
          </div>
        ) : productError ? (
          <div className="alert alert-error">
            <span className="alert-icon">⚠️</span>
            <span>{productError}</span>
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="empty-catalog-box">
            <span className="empty-icon">📦</span>
            <h3>No products found</h3>
            <p>
              {searchQuery
                ? `No products matching "${searchQuery}" in ${selectedShop.name}.`
                : `No products listed under "${selectedCategory}".`}
            </p>
            {(searchQuery || selectedCategory !== 'All') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setSelectedCategory('All');
                }}
                className="button button-sm button-secondary"
                style={{ marginTop: '0.75rem' }}
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          <div>
            <div className="products-count-label">
              Showing {filteredProducts.length} product{filteredProducts.length === 1 ? '' : 's'}
            </div>

            <div className="products-grid">
              {filteredProducts.map((p) => {
                const isAvailable = p.is_available && p.stock > 0;
                const cartItem = getCartItem(p.id);

                return (
                  <div key={p.id} className={`product-card ${!isAvailable ? 'product-unavailable' : ''}`}>
                    <div className="product-image-container">
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt={p.name}
                          className="product-image"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="product-image-placeholder">🛒</div>
                      )}
                      <span className="product-category-tag">{p.category || 'General'}</span>
                    </div>

                    <div className="product-info">
                      <div className="product-unit">{p.unit_label || 'piece'}</div>
                      <h3 className="product-name">{p.name}</h3>
                      {p.description && <p className="product-desc">{p.description}</p>}

                      <div className="product-footer">
                        <div className="product-price">
                          <span className="price-currency">₹</span>
                          <span className="price-value">{Number(p.price).toFixed(2)}</span>
                        </div>

                        <div className="product-availability-status">
                          {isAvailable ? (
                            <span className="badge-available">
                              <span className="badge-dot dot-green"></span>
                              In Stock
                            </span>
                          ) : (
                            <span className="badge-unavailable">
                              <span className="badge-dot dot-red"></span>
                              Unavailable
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Product Cart Action: Add to Cart or Quantity Stepper */}
                      <div className="product-cart-action-row">
                        {!isAvailable ? (
                          <button
                            type="button"
                            className="button button-sm button-disabled product-cart-btn"
                            disabled
                          >
                            Out of Stock
                          </button>
                        ) : cartItem ? (
                          <div className="product-stepper-box">
                            <div className="product-qty-stepper" aria-label={`Quantity for ${p.name}`}>
                              <button
                                type="button"
                                className="product-step-btn btn-step-minus"
                                onClick={() => {
                                  if (cartItem.quantity > 1) {
                                    updateQuantity(cartItem.id, cartItem.quantity - 1);
                                  } else {
                                    removeItem(cartItem.id);
                                  }
                                }}
                                disabled={cartItem.quantity < 1}
                                title={cartItem.quantity === 1 ? 'Remove from cart' : 'Decrease quantity'}
                              >
                                {cartItem.quantity === 1 ? '🗑️' : '−'}
                              </button>
                              <span className="product-step-qty">
                                {cartItem.quantity}
                              </span>
                              <button
                                type="button"
                                className="product-step-btn btn-step-plus"
                                onClick={() => updateQuantity(cartItem.id, cartItem.quantity + 1)}
                                disabled={cartItem.quantity >= p.stock}
                                title={cartItem.quantity >= p.stock ? `Max stock (${p.stock}) reached` : 'Increase quantity'}
                              >
                                +
                              </button>
                            </div>
                            <span className="in-cart-indicator">✓ In Cart</span>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="button button-sm button-primary product-cart-btn"
                            onClick={() => addItem(p.id, 1, selectedShop.id, p, selectedShop)}
                          >
                            <span>🛒</span>
                            <span>Add to Cart</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {renderStickyCartBar()}
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // View 2: Shops List View
  // ---------------------------------------------------------------------------
  return (
    <div className={`customer-shops-container ${hasItemsInCart ? 'has-sticky-cart' : ''}`}>
      <div className="content-header">
        <h1>Neighborhood Grocery Stores 🏪</h1>
        <p>
          Discover approved local provision stores delivering authentic daily staples and fresh supplies in your community.
        </p>
      </div>

      {/* One-Shop Conflict Red Inline Alert */}
      {conflictError && (
        <div
          ref={conflictAlertRef}
          className="cart-inline-conflict-banner"
          role="alert"
          aria-live="assertive"
        >
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
            {onNavigateToCart && (
              <button
                type="button"
                onClick={onNavigateToCart}
                className="button button-sm button-secondary"
              >
                View Existing Cart
              </button>
            )}
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

      {/* Stock / Availability Error Alert */}
      {cartError && (
        <div
          ref={cartErrorAlertRef}
          className="cart-inline-error-banner"
          role="alert"
          aria-live="assertive"
        >
          <div className="error-banner-main">
            <span className="error-banner-icon">❌</span>
            <div className="error-banner-text">
              <strong>Cart Update Failed</strong>
              <p>{cartError}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={clearCartError}
            className="button button-sm button-ghost"
            title="Dismiss error"
          >
            Dismiss
          </button>
        </div>
      )}

      {loadingShops ? (
        <div className="loading-state-box">
          <div className="spinner"></div>
          <p>Connecting to neighborhood grocery stores...</p>
        </div>
      ) : shopError ? (
        <div className="alert alert-error">
          <span className="alert-icon">⚠️</span>
          <span>{shopError}</span>
        </div>
      ) : shops.length === 0 ? (
        <div className="empty-catalog-box">
          <span className="empty-icon">🏪</span>
          <h3>No active shops currently available</h3>
          <p>Check back shortly as neighborhood stores complete verification.</p>
        </div>
      ) : (
        <div className="shops-directory-grid">
          {shops.map((shop) => (
            <div key={shop.id} className="shop-card">
              <div className="shop-card-image-box">
                {shop.photo_url ? (
                  <img
                    src={shop.photo_url}
                    alt={shop.name}
                    className="shop-card-img"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                ) : (
                  <div className="shop-card-img-placeholder">🏪</div>
                )}
                <span
                  className={`shop-card-badge ${
                    shop.is_open ? 'badge-open' : 'badge-closed'
                  }`}
                >
                  <span className="status-dot"></span>
                  {shop.is_open ? 'Accepting Orders' : 'Closed'}
                </span>
              </div>

              <div className="shop-card-body">
                <h3 className="shop-card-title">{shop.name}</h3>
                <p className="shop-card-desc">{shop.description}</p>

                <div className="shop-card-details">
                  <div className="shop-detail-row">
                    <span className="detail-icon">📍</span>
                    <span className="detail-text">
                      {shop.address}, {shop.city}
                    </span>
                  </div>
                  {shop.business_phone && (
                    <div className="shop-detail-row">
                      <span className="detail-icon">📞</span>
                      <span className="detail-text">{shop.business_phone}</span>
                    </div>
                  )}
                </div>

                <div className="shop-card-action">
                  <button
                    type="button"
                    onClick={() => setSelectedShop(shop)}
                    className="button button-primary view-products-btn"
                    style={{ width: '100%', justifyContent: 'center' }}
                  >
                    <span>Browse Products</span>
                    <span>→</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {renderStickyCartBar()}
    </div>
  );
};
