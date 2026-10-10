import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';
import {
  fetchCart,
  addToCart,
  updateCartItemQuantity,
  removeCartItem,
  clearCart,
} from '../api/client';
import type { CartResponse, CartItem, Product, Shop } from '../api/client';

interface CartContextType {
  cart: CartResponse | null;
  loading: boolean;
  itemCount: number;
  error: string | null;
  conflictError: string | null;
  actionLoading: { [key: string]: boolean };
  refreshCart: () => Promise<CartResponse | null>;
  resetCart: () => void;
  cancelPendingUpdates: () => void;
  addItem: (
    productId: string,
    quantity?: number,
    shopId?: string,
    productData?: Product,
    shopData?: Shop
  ) => Promise<{ success: boolean; error?: string; isConflict?: boolean }>;
  updateQuantity: (
    itemId: string,
    quantity: number
  ) => Promise<{ success: boolean; error?: string }>;
  removeItem: (itemId: string) => Promise<{ success: boolean; error?: string }>;
  clearCurrentCart: () => Promise<{ success: boolean; error?: string }>;
  clearConflict: () => void;
  clearError: () => void;
  getCartItem: (productId: string) => CartItem | undefined;
  getItemQuantity: (productId: string) => number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { token } = useAuth();
  const [cart, setCart] = useState<CartResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [actionLoading] = useState<{ [key: string]: boolean }>({});

  // Map to hold in-flight Add-To-Cart promises by productId
  const inFlightAddRef = useRef<Map<string, Promise<CartResponse>>>(new Map());
  // Map to debounce rapid updateQuantity calls by productId
  const pendingUpdatesRef = useRef<
    Map<
      string,
      {
        timer: any;
        targetQty: number;
        snapshotCart: CartResponse | null;
      }
    >
  >(new Map());

  const cancelPendingUpdates = useCallback(() => {
    for (const [, item] of pendingUpdatesRef.current.entries()) {
      if (item.timer) {
        clearTimeout(item.timer);
      }
    }
    pendingUpdatesRef.current.clear();
  }, []);

  const resetCart = useCallback(() => {
    cancelPendingUpdates();
    setCart({
      status: 'ok',
      cart: null,
      shop: null,
      items: [],
      item_count: 0,
      subtotal: 0,
      total: 0,
    });
  }, [cancelPendingUpdates]);

  const clearConflict = useCallback(() => setConflictError(null), []);
  const clearError = useCallback(() => setError(null), []);

  const refreshCart = useCallback(async (): Promise<CartResponse | null> => {
    // Await any in-flight add operations so backend has committed items before we fetch
    if (inFlightAddRef.current.size > 0) {
      try {
        await Promise.allSettled(Array.from(inFlightAddRef.current.values()));
      } catch {
        // ignore
      }
    }

    cancelPendingUpdates();
    if (!token) {
      setCart(null);
      return null;
    }
    try {
      const data = await fetchCart(token);
      setCart(data);
      return data;
    } catch (err: any) {
      console.warn('Failed to refresh cart:', err.message);
      return null;
    }
  }, [token, cancelPendingUpdates]);

  // Load cart on mount or token change
  useEffect(() => {
    if (token) {
      setLoading(true);
      fetchCart(token)
        .then((res) => setCart(res))
        .catch((err) => console.warn('Initial cart load failed:', err.message))
        .finally(() => setLoading(false));
    } else {
      setCart(null);
    }
  }, [token]);

  /**
   * Optimistic Add to Cart:
   * 1. Check one-shop rule immediately (0ms).
   * 2. Updates UI state immediately (0ms).
   * 3. Runs backend API call in background.
   * 4. On success: Reconciles with authoritative backend response.
   * 5. On failure: Rolls back to previous snapshot and displays clear error.
   */
  const addItem = async (
    productId: string,
    quantity: number = 1,
    shopId?: string,
    productData?: Product,
    shopData?: Shop
  ): Promise<{ success: boolean; error?: string; isConflict?: boolean }> => {
    if (!token) {
      const msg = 'Please sign in to add items to your cart.';
      setError(msg);
      return { success: false, error: msg };
    }

    // Immediate client-side check: One-Shop Policy
    const existingItems = cart?.items || [];
    const currentShopId = cart?.cart?.shop_id || cart?.shop?.id;
    if (existingItems.length > 0 && currentShopId && shopId && currentShopId !== shopId) {
      const currentShopName = cart?.shop?.name || 'another shop';
      const targetShopName = shopData?.name || 'this shop';
      const conflictMsg = `Your cart already contains items from '${currentShopName}'. LOCOMART only supports ordering from one shop at a time. Please clear your current cart first if you wish to shop from '${targetShopName}'.`;
      setConflictError(conflictMsg);
      return { success: false, error: conflictMsg, isConflict: true };
    }

    const previousCart = cart;
    setError(null);
    setConflictError(null);

    // Prepare optimistic cart state immediately
    const existingItem = existingItems.find((i) => i.product_id === productId);
    const targetQty = (existingItem ? existingItem.quantity : 0) + quantity;
    const unitPrice = productData
      ? Number(productData.price)
      : existingItem
      ? Number(existingItem.unit_price)
      : 0;

    let optimisticItems: CartItem[] = [];
    if (existingItem) {
      optimisticItems = existingItems.map((i) =>
        i.id === existingItem.id
          ? {
              ...i,
              quantity: targetQty,
              subtotal: Math.round(targetQty * unitPrice * 100) / 100,
            }
          : i
      );
    } else {
      const optimisticProduct: Product = productData || {
        id: productId,
        shop_id: shopId || '',
        name: 'Product',
        price: unitPrice,
        stock: 99,
        is_available: true,
        description: '',
        category: 'General',
        unit_label: 'piece',
        image_url: '',
      };
      const optimisticItem: CartItem = {
        id: `temp-${productId}`,
        cart_id: cart?.cart?.id || 'temp-cart',
        product_id: productId,
        quantity: targetQty,
        unit_price: unitPrice,
        subtotal: Math.round(targetQty * unitPrice * 100) / 100,
        product: optimisticProduct,
      };
      optimisticItems = [...existingItems, optimisticItem];
    }

    const optimisticSubtotal = Math.round(
      optimisticItems.reduce((acc, i) => acc + i.subtotal, 0) * 100
    ) / 100;
    const optimisticCount = optimisticItems.reduce((acc, i) => acc + i.quantity, 0);

    // Update UI immediately (0ms delay)
    setCart({
      status: 'ok',
      cart: cart?.cart || {
        id: 'temp-cart',
        customer_id: '',
        shop_id: shopId || '',
        status: 'ACTIVE',
      },
      shop: cart?.shop || shopData || null,
      items: optimisticItems,
      item_count: optimisticCount,
      subtotal: optimisticSubtotal,
      total: optimisticSubtotal,
    });

    // Run API call in the background
    const addPromise = addToCart(token, productId, quantity, shopId);
    inFlightAddRef.current.set(productId, addPromise);

    try {
      const updated = await addPromise;
      // Reconcile with authoritative backend response
      setCart((current) => {
        // If current in-memory quantity is different, keep the latest user quantity
        const inMem = current?.items?.find((i) => i.product_id === productId);
        if (inMem && inMem.quantity !== targetQty) {
          const backendItem = updated.items?.find((i) => i.product_id === productId);
          if (backendItem) {
            return {
              ...current!,
              items: (current?.items || []).map((i) =>
                i.product_id === productId ? { ...i, id: backendItem.id } : i
              ),
              cart: updated.cart,
              shop: updated.shop || current?.shop || null,
            };
          }
        }
        return updated;
      });
      return { success: true };
    } catch (err: any) {
      // Rollback on failure
      setCart(previousCart);
      const errMsg = err.message || 'Failed to add item to cart.';
      if (
        errMsg.toLowerCase().includes('one shop') ||
        errMsg.toLowerCase().includes('already contains items from') ||
        errMsg.toLowerCase().includes('conflict')
      ) {
        setConflictError(errMsg);
        return { success: false, error: errMsg, isConflict: true };
      }
      setError(errMsg);
      return { success: false, error: errMsg };
    } finally {
      inFlightAddRef.current.delete(productId);
    }
  };

  /**
   * Optimistic Quantity Update (+ / -):
   * 1. Updates item quantity, totals, and badge immediately in UI (0ms).
   * 2. Batches/debounces background PATCH request.
   * 3. Rolls back ONLY affected item on backend rejection.
   */
  const updateQuantity = async (
    itemIdOrProductId: string,
    quantity: number
  ): Promise<{ success: boolean; error?: string }> => {
    if (!token) return { success: false, error: 'Not authenticated' };

    if (quantity < 1) {
      return removeItem(itemIdOrProductId);
    }

    const currentItem = cart?.items?.find(
      (i) => i.id === itemIdOrProductId || i.product_id === itemIdOrProductId
    );
    if (!currentItem) {
      return { success: false, error: 'Item not found in cart' };
    }

    // Local stock check if known
    if (currentItem.product && quantity > currentItem.product.stock) {
      const msg = `Cannot increase. Maximum stock available is ${currentItem.product.stock}.`;
      setError(msg);
      return { success: false, error: msg };
    }

    setError(null);
    setConflictError(null);

    const productKey = currentItem.product_id;
    const existingPending = pendingUpdatesRef.current.get(productKey);
    const snapshotCart = existingPending?.snapshotCart || cart;

    if (existingPending?.timer) {
      clearTimeout(existingPending.timer);
    }

    // Apply optimistic update immediately in React state (0ms latency)
    const updatedItems = (cart?.items || []).map((i) =>
      i.product_id === productKey
        ? {
            ...i,
            quantity,
            subtotal: Math.round(quantity * i.unit_price * 100) / 100,
          }
        : i
    );
    const optimisticSubtotal = Math.round(
      updatedItems.reduce((acc, i) => acc + i.subtotal, 0) * 100
    ) / 100;
    const optimisticCount = updatedItems.reduce((acc, i) => acc + i.quantity, 0);

    setCart({
      ...(cart as CartResponse),
      items: updatedItems,
      subtotal: optimisticSubtotal,
      total: optimisticSubtotal,
      item_count: optimisticCount,
    });

    // Send background sync request after a small debounce (200ms) to consolidate rapid clicks
    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      const timer = setTimeout(async () => {
        pendingUpdatesRef.current.delete(productKey);
        try {
          // If an addToCart is in flight for this product, wait for it to get the real backend ID
          if (inFlightAddRef.current.has(productKey)) {
            await inFlightAddRef.current.get(productKey);
          }

          let realItemId = currentItem.id;
          if (realItemId.startsWith('temp-')) {
            const fresh = await fetchCart(token);
            const found = fresh.items?.find((i) => i.product_id === productKey);
            if (found) {
              realItemId = found.id;
            } else {
              setCart(fresh);
              resolve({ success: false, error: 'Item no longer exists in cart.' });
              return;
            }
          }

          const updated = await updateCartItemQuantity(token, realItemId, quantity);
          // Keep current in-memory quantity if user modified it again while request was in-flight
          setCart((curr) => {
            const inMem = curr?.items?.find((i) => i.product_id === productKey);
            if (inMem && inMem.quantity === quantity) {
              return updated;
            }
            return curr;
          });
          resolve({ success: true });
        } catch (err: any) {
          const errMsg = err.message || 'Failed to update item quantity.';
          if (
            errMsg.toLowerCase().includes('not found') ||
            err.status === 404
          ) {
            // Cart item or cart no longer exists in DB — do NOT rollback to stale snapshotCart
            try {
              const fresh = await fetchCart(token);
              setCart(fresh);
            } catch {
              // ignore
            }
            setError('This item is no longer in your cart. Please add it again.');
            resolve({ success: false, error: errMsg });
          } else {
            // Rollback ONLY this affected item to its previous confirmed state
            setCart(snapshotCart);
            setError(errMsg);
            resolve({ success: false, error: errMsg });
          }
        }
      }, 200);

      pendingUpdatesRef.current.set(productKey, {
        timer,
        targetQty: quantity,
        snapshotCart,
      });
    });
  };

  /**
   * Optimistic Remove Item:
   * 1. Removes item from visible cart immediately (0ms).
   * 2. Runs DELETE in background.
   * 3. Restores item snapshot if backend fails.
   */
  const removeItem = async (
    itemIdOrProductId: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!token) return { success: false, error: 'Not authenticated' };

    const currentItem = cart?.items?.find(
      (i) => i.id === itemIdOrProductId || i.product_id === itemIdOrProductId
    );
    if (!currentItem) {
      return { success: false };
    }

    const productKey = currentItem.product_id;
    const existingPending = pendingUpdatesRef.current.get(productKey);
    if (existingPending?.timer) {
      clearTimeout(existingPending.timer);
      pendingUpdatesRef.current.delete(productKey);
    }

    const previousCart = cart;
    const optimisticItems = (cart?.items || []).filter((i) => i.product_id !== productKey);
    const optimisticSubtotal = Math.max(
      0,
      Math.round(optimisticItems.reduce((acc, i) => acc + i.subtotal, 0) * 100) / 100
    );
    const optimisticCount = Math.max(
      0,
      optimisticItems.reduce((acc, i) => acc + i.quantity, 0)
    );

    // Apply optimistic removal immediately (0ms)
    setCart({
      ...(cart as CartResponse),
      items: optimisticItems,
      subtotal: optimisticSubtotal,
      total: optimisticSubtotal,
      item_count: optimisticCount,
      cart: optimisticItems.length === 0 ? null : cart?.cart || null,
      shop: optimisticItems.length === 0 ? null : cart?.shop || null,
    });

    setError(null);
    setConflictError(null);

    try {
      if (inFlightAddRef.current.has(productKey)) {
        await inFlightAddRef.current.get(productKey);
      }

      let realItemId = currentItem.id;
      if (realItemId.startsWith('temp-')) {
        const fresh = await fetchCart(token);
        const match = fresh.items?.find((i) => i.product_id === productKey);
        if (match) {
          realItemId = match.id;
        } else {
          return { success: true };
        }
      }

      const updated = await removeCartItem(token, realItemId);
      setCart(updated);
      return { success: true };
    } catch (err: any) {
      // Rollback on failure
      setCart(previousCart);
      const errMsg = err.message || 'Failed to remove item from cart.';
      setError(errMsg);
      return { success: false, error: errMsg };
    }
  };

  /**
   * Optimistic Clear Cart
   */
  const clearCurrentCart = async (): Promise<{ success: boolean; error?: string }> => {
    if (!token) return { success: false, error: 'Not authenticated' };

    cancelPendingUpdates();
    const previousCart = cart;
    // Optimistically empty
    setCart({
      status: 'ok',
      cart: null,
      shop: null,
      items: [],
      item_count: 0,
      subtotal: 0,
      total: 0,
    });

    setError(null);
    setConflictError(null);

    try {
      const cleared = await clearCart(token);
      setCart(cleared);
      return { success: true };
    } catch (err: any) {
      setCart(previousCart);
      const errMsg = err.message || 'Failed to clear cart.';
      setError(errMsg);
      return { success: false, error: errMsg };
    }
  };

  const getCartItem = useCallback(
    (productId: string): CartItem | undefined => {
      return cart?.items?.find((item) => item.product_id === productId);
    },
    [cart]
  );

  const getItemQuantity = useCallback(
    (productId: string): number => {
      const item = getCartItem(productId);
      return item ? item.quantity : 0;
    },
    [getCartItem]
  );

  const itemCount = cart?.item_count || 0;

  return (
    <CartContext.Provider
      value={{
        cart,
        loading,
        itemCount,
        error,
        conflictError,
        actionLoading,
        refreshCart,
        resetCart,
        cancelPendingUpdates,
        addItem,
        updateQuantity,
        removeItem,
        clearCurrentCart,
        clearConflict,
        clearError,
        getCartItem,
        getItemQuantity,
      }}
    >
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
