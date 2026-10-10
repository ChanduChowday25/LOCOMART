import React, { useEffect, useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  fetchMyShop,
  updateMyShop,
  fetchMyShopProducts,
  createShopProduct,
  updateShopProduct,
  updateShopProductStock,
  toggleShopProductAvailability,
  archiveShopProduct,
  uploadShopkeeperImage,
  fetchShopkeeperOrders,
  acceptShopkeeperOrder,
  cancelShopkeeperOrder,
  prepareShopkeeperOrder,
  outForDeliveryShopkeeperOrder,
  verifyShopkeeperDeliveryOtp,
  markDeliveredShopkeeperOrder,
  viewOrDownloadInvoice,
} from '../api/client';
import type { Shop, Product, ProductPayload, ShopkeeperOrder } from '../api/client';

export const ShopkeeperPage: React.FC = () => {
  const { token, signOut } = useAuth();

  // Navigation tab (Default to orders for M5 Final Shopkeeper Dashboard)
  const [activeTab, setActiveTab] = useState<'orders' | 'products' | 'shop'>('orders');

  // Shop data state
  const [shop, setShop] = useState<Shop | null>(null);
  const [loadingShop, setLoadingShop] = useState<boolean>(true);
  const [shopError, setShopError] = useState<string | null>(null);
  const [shopFeedback, setShopFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [savingShop, setSavingShop] = useState<boolean>(false);

  // Shop form fields
  const [shopName, setShopName] = useState<string>('');
  const [shopDesc, setShopDesc] = useState<string>('');
  const [shopPhone, setShopPhone] = useState<string>('');
  const [shopAddress, setShopAddress] = useState<string>('');
  const [shopCity, setShopCity] = useState<string>('');
  const [shopState, setShopState] = useState<string>('');
  const [shopPincode, setShopPincode] = useState<string>('');
  const [shopPhotoUrl, setShopPhotoUrl] = useState<string>('');
  const [shopIsOpen, setShopIsOpen] = useState<boolean>(true);
  const [uploadingShopPhoto, setUploadingShopPhoto] = useState<boolean>(false);

  // Orders state (Milestone M5 Final)
  const [orders, setOrders] = useState<ShopkeeperOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState<boolean>(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('PENDING'); // Initially show orders with status PENDING
  const [orderSearchQuery, setOrderSearchQuery] = useState<string>('');
  const [selectedOrder, setSelectedOrder] = useState<ShopkeeperOrder | null>(null);
  const [pendingOrdersCount, setPendingOrdersCount] = useState<number>(0);

  // M7.1: Order Actions & Cancellation Modal State
  const [orderActionFeedback, setOrderActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(null);
  const [cancelModalOrder, setCancelModalOrder] = useState<ShopkeeperOrder | null>(null);
  const [cancelReasonInput, setCancelReasonInput] = useState<string>('');
  const [cancelReasonError, setCancelReasonError] = useState<string | null>(null);

  // M8: Delivery & OTP Verification State
  const [deliveryOtpInput, setDeliveryOtpInput] = useState<{ [orderId: string]: string }>({});
  const [verifyingOtpOrderId, setVerifyingOtpOrderId] = useState<string | null>(null);
  const [otpVerifyError, setOtpVerifyError] = useState<{ [orderId: string]: string | null }>({});

  // M9: Invoice actions
  const [downloadingInvoiceOrderId, setDownloadingInvoiceOrderId] = useState<string | null>(null);

  const handleShopkeeperInvoiceAction = async (orderId: string, action: 'view' | 'download' = 'view') => {
    if (!token) return;
    setDownloadingInvoiceOrderId(orderId);
    try {
      await viewOrDownloadInvoice(token, orderId, action);
    } catch (err: any) {
      alert(err?.message || 'Failed to download invoice.');
    } finally {
      setDownloadingInvoiceOrderId(null);
    }
  };

  // Products state
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState<boolean>(true);
  const [productError, setProductError] = useState<string | null>(null);
  const [productFeedback, setProductFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Filter / Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');

  // Product modal state
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [modalSubmitting, setModalSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Modal form fields
  const [prodName, setProdName] = useState<string>('');
  const [prodDesc, setProdDesc] = useState<string>('');
  const [prodCategory, setProdCategory] = useState<string>('General');
  const [prodUnit, setProdUnit] = useState<string>('piece');
  const [prodPrice, setProdPrice] = useState<string>('0');
  const [prodStock, setProdStock] = useState<string>('0');
  const [prodImageUrl, setProdImageUrl] = useState<string>('');
  const [prodIsAvailable, setProdIsAvailable] = useState<boolean>(true);
  const [uploadingProdImage, setUploadingProdImage] = useState<boolean>(false);

  // Load shop and products on token availability
  useEffect(() => {
    if (!token) return;
    loadShopData();
    loadProductsData();
  }, [token]);

  // Load orders and maintain pending count whenever token or statusFilter changes
  useEffect(() => {
    if (!token) return;
    loadOrdersData(statusFilter);
    // When viewing non-pending orders (e.g. ALL, CONFIRMED, DELIVERED),
    // fetch the pending count separately so the badge remains accurate.
    // When viewing PENDING, loadOrdersData already sets pendingOrdersCount from res.count.
    if (statusFilter !== 'PENDING') {
      refreshPendingCount();
    }
  }, [token, statusFilter]);

  async function loadShopData() {
    if (!token) return;
    setLoadingShop(true);
    setShopError(null);
    try {
      const res = await fetchMyShop(token);
      if (res.shop) {
        setShop(res.shop);
        setShopName(res.shop.name || '');
        setShopDesc(res.shop.description || '');
        setShopPhone(res.shop.business_phone || '');
        setShopAddress(res.shop.address || '');
        setShopCity(res.shop.city || '');
        setShopState(res.shop.state || '');
        setShopPincode(res.shop.pincode || '');
        setShopPhotoUrl(res.shop.photo_url || '');
        setShopIsOpen(res.shop.is_open ?? true);
      }
    } catch (err: any) {
      setShopError(err.message || 'Could not load your shop details.');
    } finally {
      setLoadingShop(false);
    }
  }

  async function loadProductsData() {
    if (!token) return;
    setLoadingProducts(true);
    setProductError(null);
    try {
      const res = await fetchMyShopProducts(token);
      setProducts(res.products || []);
    } catch (err: any) {
      setProductError(err.message || 'Could not load products.');
    } finally {
      setLoadingProducts(false);
    }
  }

  // Quick toggle shop open status
  const handleQuickToggleShopOpen = async () => {
    if (!token || !shop) return;
    const newStatus = !shop.is_open;
    try {
      const res = await updateMyShop(token, { is_open: newStatus });
      setShop(res.shop);
      setShopIsOpen(res.shop.is_open);
      setShopFeedback({
        type: 'success',
        message: `Store is now ${res.shop.is_open ? 'open for customer orders' : 'closed'}.`,
      });
    } catch (err: any) {
      setShopFeedback({ type: 'error', message: err.message || 'Failed to update shop status.' });
    }
  };

  // Save full shop settings
  const handleSaveShopSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSavingShop(true);
    setShopFeedback(null);
    try {
      const res = await updateMyShop(token, {
        name: shopName.trim(),
        description: shopDesc.trim(),
        business_phone: shopPhone.trim(),
        address: shopAddress.trim(),
        city: shopCity.trim(),
        state: shopState.trim(),
        pincode: shopPincode.trim(),
        photo_url: shopPhotoUrl.trim(),
        is_open: shopIsOpen,
      });
      setShop(res.shop);
      setShopFeedback({ type: 'success', message: 'Shop details saved successfully!' });
    } catch (err: any) {
      setShopFeedback({ type: 'error', message: err.message || 'Failed to update shop.' });
    } finally {
      setSavingShop(false);
    }
  };

  // Upload shop photo
  const handleUploadShopPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    setUploadingShopPhoto(true);
    try {
      const res = await uploadShopkeeperImage(token, file);
      setShopPhotoUrl(res.url);
      setShopFeedback({ type: 'success', message: 'Shop photo uploaded successfully. Click Save Changes to commit.' });
    } catch (err: any) {
      setShopFeedback({ type: 'error', message: err.message || 'Image upload failed.' });
    } finally {
      setUploadingShopPhoto(false);
    }
  };

  // Upload product image
  const handleUploadProductImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    setUploadingProdImage(true);
    setModalError(null);
    try {
      const res = await uploadShopkeeperImage(token, file);
      setProdImageUrl(res.url);
    } catch (err: any) {
      setModalError(err.message || 'Product image upload failed.');
    } finally {
      setUploadingProdImage(false);
    }
  };

  // Quick adjust stock
  const handleStockDelta = async (productId: string, currentStock: number, delta: number) => {
    if (!token) return;
    const newStock = Math.max(0, currentStock + delta);
    try {
      const res = await updateShopProductStock(token, productId, newStock);
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, stock: res.product.stock } : p))
      );
    } catch (err: any) {
      setProductFeedback({ type: 'error', message: err.message || 'Failed to update stock.' });
    }
  };

  // Quick toggle availability
  const handleToggleAvailability = async (productId: string, currentAvail: boolean) => {
    if (!token) return;
    try {
      const res = await toggleShopProductAvailability(token, productId, !currentAvail);
      setProducts((prev) =>
        prev.map((p) => (p.id === productId ? { ...p, is_available: res.product.is_available } : p))
      );
    } catch (err: any) {
      setProductFeedback({ type: 'error', message: err.message || 'Failed to toggle availability.' });
    }
  };

  // Archive product
  const handleArchiveProduct = async (productId: string, prodName: string) => {
    if (!token) return;
    if (!window.confirm(`Are you sure you want to remove "${prodName}" from your shop catalog?`)) {
      return;
    }
    try {
      await archiveShopProduct(token, productId);
      setProducts((prev) => prev.filter((p) => p.id !== productId));
      setProductFeedback({ type: 'success', message: `Product "${prodName}" archived.` });
    } catch (err: any) {
      setProductFeedback({ type: 'error', message: err.message || 'Failed to archive product.' });
    }
  };

  // Open modal for Create
  const handleOpenCreateModal = () => {
    setModalMode('create');
    setEditingProductId(null);
    setProdName('');
    setProdDesc('');
    setProdCategory('Rice & Grains');
    setProdUnit('1 kg');
    setProdPrice('0');
    setProdStock('10');
    setProdImageUrl('');
    setProdIsAvailable(true);
    setModalError(null);
  };

  // Open modal for Edit
  const handleOpenEditModal = (p: Product) => {
    setModalMode('edit');
    setEditingProductId(p.id);
    setProdName(p.name || '');
    setProdDesc(p.description || '');
    setProdCategory(p.category || 'General');
    setProdUnit(p.unit_label || 'piece');
    setProdPrice(String(p.price));
    setProdStock(String(p.stock));
    setProdImageUrl(p.image_url || '');
    setProdIsAvailable(p.is_available);
    setModalError(null);
  };

  // Submit modal (Create or Edit)
  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (!prodName.trim()) {
      setModalError('Product name is required.');
      return;
    }
    const priceNum = parseFloat(prodPrice);
    if (isNaN(priceNum) || priceNum < 0) {
      setModalError('Price must be a valid positive number.');
      return;
    }
    const stockNum = parseInt(prodStock, 10);
    if (isNaN(stockNum) || stockNum < 0) {
      setModalError('Stock must be a valid non-negative integer.');
      return;
    }

    setModalSubmitting(true);
    setModalError(null);

    const payload: ProductPayload = {
      name: prodName.trim(),
      description: prodDesc.trim(),
      category: prodCategory.trim() || 'General',
      unit_label: prodUnit.trim() || 'piece',
      price: priceNum,
      stock: stockNum,
      image_url: prodImageUrl.trim(),
      is_available: prodIsAvailable,
    };

    try {
      if (modalMode === 'create') {
        const res = await createShopProduct(token, payload);
        setProducts((prev) => [res.product, ...prev]);
        setProductFeedback({ type: 'success', message: `Product "${res.product.name}" created successfully!` });
      } else if (modalMode === 'edit' && editingProductId) {
        const res = await updateShopProduct(token, editingProductId, payload);
        setProducts((prev) =>
          prev.map((p) => (p.id === editingProductId ? res.product : p))
        );
        setProductFeedback({ type: 'success', message: `Product "${res.product.name}" updated successfully!` });
      }
      setModalMode(null);
    } catch (err: any) {
      setModalError(err.message || 'Failed to save product.');
    } finally {
      setModalSubmitting(false);
    }
  };

  // Derive categories for filter
  const productCategories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return ['All', ...Array.from(set).sort()];
  }, [products]);

  // Filtered products list
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesCat =
        categoryFilter === 'All' ||
        p.category?.toLowerCase() === categoryFilter.toLowerCase();
      const matchesSearch =
        !searchQuery.trim() ||
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.description && p.description.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchesCat && matchesSearch;
    });
  }, [products, categoryFilter, searchQuery]);

  // Format order date & time
  function formatOrderDateTime(dateStr?: string): string {
    if (!dateStr) return 'N/A';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return dateStr;
    }
  }

  async function loadOrdersData(filter: string = statusFilter) {
    if (!token) return;
    setLoadingOrders(true);
    setOrdersError(null);
    try {
      const res = await fetchShopkeeperOrders(token, filter);
      setOrders(res.orders || []);
      if (filter === 'PENDING') {
        setPendingOrdersCount(res.count ?? (res.orders ? res.orders.length : 0));
      }
    } catch (err: any) {
      setOrdersError(err.message || 'Could not load orders for your shop.');
    } finally {
      setLoadingOrders(false);
    }
  }

  async function refreshPendingCount() {
    if (!token) return;
    try {
      const res = await fetchShopkeeperOrders(token, 'PENDING');
      setPendingOrdersCount(res.count ?? (res.orders ? res.orders.length : 0));
    } catch {
      // ignore
    }
  }

  // Filtered orders list (searches order ID, customer name, phone, address, items)
  const filteredOrders = useMemo(() => {
    if (!orderSearchQuery.trim()) return orders;
    const q = orderSearchQuery.toLowerCase().trim();
    return orders.filter((o) => {
      const idMatch = o.id.toLowerCase().includes(q);
      const nameMatch = (o.customer?.name || o.delivery_address?.name || '').toLowerCase().includes(q);
      const phoneMatch = (o.customer?.phone || o.delivery_address?.phone || '').toLowerCase().includes(q);
      const addrMatch = (o.delivery_address?.address || '').toLowerCase().includes(q);
      const cityMatch = (o.delivery_address?.city || '').toLowerCase().includes(q);
      const pinMatch = (o.delivery_address?.pincode || '').toLowerCase().includes(q);
      const itemMatch = (o.items || []).some((item) => item.product_name.toLowerCase().includes(q));
      return idMatch || nameMatch || phoneMatch || addrMatch || cityMatch || pinMatch || itemMatch;
    });
  }, [orders, orderSearchQuery]);

  const totalOrdersRevenue = useMemo(() => {
    return filteredOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  }, [filteredOrders]);

  async function handleAcceptOrder(orderId: string) {
    if (!token) return;
    setProcessingOrderId(orderId);
    setOrderActionFeedback(null);
    try {
      const res = await acceptShopkeeperOrder(token, orderId);
      setOrderActionFeedback({
        type: 'success',
        message: `Order #${orderId} accepted successfully! It now appears under Confirmed.`,
      });
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(res.order);
      }
      await loadOrdersData(statusFilter);
      await refreshPendingCount();
    } catch (err: any) {
      setOrderActionFeedback({
        type: 'error',
        message: err.message || 'Failed to accept order. Please try again.',
      });
    } finally {
      setProcessingOrderId(null);
    }
  }

  async function handlePrepareOrder(orderId: string) {
    if (!token) return;
    setProcessingOrderId(orderId);
    setOrderActionFeedback(null);
    try {
      const res = await prepareShopkeeperOrder(token, orderId);
      setOrderActionFeedback({
        type: 'success',
        message: `Order #${orderId} status is now PREPARING! Store team can pack items.`,
      });
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(res.order);
      }
      await loadOrdersData(statusFilter);
      await refreshPendingCount();
    } catch (err: any) {
      setOrderActionFeedback({
        type: 'error',
        message: err.message || 'Failed to start preparing order.',
      });
    } finally {
      setProcessingOrderId(null);
    }
  }

  async function handleOutForDeliveryOrder(orderId: string) {
    if (!token) return;
    setProcessingOrderId(orderId);
    setOrderActionFeedback(null);
    try {
      const res = await outForDeliveryShopkeeperOrder(token, orderId);
      setOrderActionFeedback({
        type: 'success',
        message: `Order #${orderId} is now OUT FOR DELIVERY! Dispatched for customer delivery.`,
      });
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(res.order);
      }
      await loadOrdersData(statusFilter);
      await refreshPendingCount();
    } catch (err: any) {
      setOrderActionFeedback({
        type: 'error',
        message: err.message || 'Failed to mark order out for delivery.',
      });
    } finally {
      setProcessingOrderId(null);
    }
  }

  async function handleVerifyDeliveryOtp(orderId: string) {
    if (!token) return;
    const otp = (deliveryOtpInput[orderId] || '').trim();
    if (otp.length !== 6) {
      setOtpVerifyError((prev) => ({ ...prev, [orderId]: 'Please enter a 6-digit delivery OTP.' }));
      return;
    }
    setVerifyingOtpOrderId(orderId);
    setOtpVerifyError((prev) => ({ ...prev, [orderId]: null }));
    try {
      const res = await verifyShopkeeperDeliveryOtp(token, orderId, otp);
      setOrderActionFeedback({
        type: 'success',
        message: `Order #${orderId} verified with OTP and marked DELIVERED! Handover completed.`,
      });
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(res.order);
      }
      setDeliveryOtpInput((prev) => ({ ...prev, [orderId]: '' }));
      await loadOrdersData(statusFilter);
      await refreshPendingCount();
    } catch (err: any) {
      setOtpVerifyError((prev) => ({
        ...prev,
        [orderId]: err.message || 'OTP verification failed.',
      }));
    } finally {
      setVerifyingOtpOrderId(null);
    }
  }

  async function handleMarkDeliveredLeaveAtDoor(orderId: string) {
    if (!token) return;
    setProcessingOrderId(orderId);
    setOrderActionFeedback(null);
    try {
      const res = await markDeliveredShopkeeperOrder(token, orderId);
      setOrderActionFeedback({
        type: 'success',
        message: `Leave-at-Door Order #${orderId} marked as DELIVERED!`,
      });
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder(res.order);
      }
      await loadOrdersData(statusFilter);
      await refreshPendingCount();
    } catch (err: any) {
      setOrderActionFeedback({
        type: 'error',
        message: err.message || 'Failed to mark order as delivered.',
      });
    } finally {
      setProcessingOrderId(null);
    }
  }

  function promptCancelOrder(order: ShopkeeperOrder) {
    setCancelModalOrder(order);
    setCancelReasonInput('');
    setCancelReasonError(null);
  }

  async function handleConfirmCancelOrder() {
    if (!token || !cancelModalOrder) return;
    const reason = cancelReasonInput.trim();
    if (!reason) {
      setCancelReasonError('Please provide a reason for cancelling this order.');
      return;
    }

    setProcessingOrderId(cancelModalOrder.id);
    setOrderActionFeedback(null);
    try {
      const res = await cancelShopkeeperOrder(token, cancelModalOrder.id, reason);
      setOrderActionFeedback({
        type: 'success',
        message: `Order #${cancelModalOrder.id} cancelled. It now appears under Cancelled.`,
      });
      if (selectedOrder && selectedOrder.id === cancelModalOrder.id) {
        setSelectedOrder(res.order);
      }
      setCancelModalOrder(null);
      setCancelReasonInput('');
      setCancelReasonError(null);
      await loadOrdersData(statusFilter);
      await refreshPendingCount();
    } catch (err: any) {
      setCancelReasonError(err.message || 'Failed to cancel order.');
    } finally {
      setProcessingOrderId(null);
    }
  }

  const renderStatusBadge = (status: string) => {
    const s = (status || 'PENDING').toUpperCase();
    let badgeClass = 'badge-pending';
    let icon = '⏳';
    if (s === 'DELIVERED') {
      badgeClass = 'badge-approved';
      icon = '✓';
    } else if (s === 'CANCELLED') {
      badgeClass = 'badge-rejected';
      icon = '✕';
    } else if (s === 'ACCEPTED' || s === 'CONFIRMED') {
      badgeClass = 'badge-active';
      icon = '✓';
    } else if (s === 'PREPARING') {
      badgeClass = 'badge-active';
      icon = '👨‍🍳';
    } else if (s === 'OUT_FOR_DELIVERY') {
      badgeClass = 'badge-active';
      icon = '🚚';
    }
    return (
      <span className={`badge-status ${badgeClass}`}>
        <span>{icon}</span>
        <span>{s.replace(/_/g, ' ')}</span>
      </span>
    );
  };

  const renderOrderDetailView = (order: ShopkeeperOrder) => (
    <div className="shopkeeper-order-detail-page">
      {/* Top Navigation */}
      <div
        className="order-detail-top-nav"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1.25rem',
        }}
      >
        <button
          type="button"
          className="button button-sm button-secondary"
          onClick={() => {
            setSelectedOrder(null);
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        >
          ← Back to Orders List
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span className="order-detail-full-id" style={{ fontSize: '0.9rem', fontWeight: 600 }}>
            Order #{order.id}
          </span>
          {renderStatusBadge(order.status)}
          {(order.payment_method === 'COD' || order.payment_status === 'PAID') && (
            <div style={{ display: 'flex', gap: '0.4rem', marginLeft: '0.5rem' }}>
              <button
                type="button"
                className="button button-sm button-ghost"
                style={{ border: '1px solid #CBD5E1', fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                disabled={downloadingInvoiceOrderId === order.id}
                onClick={() => handleShopkeeperInvoiceAction(order.id, 'view')}
                title="View Invoice PDF"
              >
                {downloadingInvoiceOrderId === order.id ? 'Loading...' : '📄 View Invoice'}
              </button>
              <button
                type="button"
                className="button button-sm button-secondary"
                style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem' }}
                disabled={downloadingInvoiceOrderId === order.id}
                onClick={() => handleShopkeeperInvoiceAction(order.id, 'download')}
                title="Download Invoice PDF"
              >
                ⬇️ Download
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Order Details Card */}
      <div
        className="shopkeeper-order-detail-card"
        style={{
          background: '#fff',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg, 12px)',
          padding: '1.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
        }}
      >
        {/* M7.1 Decision Banner or Status Banner */}
        {((order.status || '').toUpperCase() === 'PENDING' || (order.status || '').toUpperCase() === 'CREATED') ? (
          <div
            className="order-m7-action-banner"
            style={{
              background: '#F0FDF4',
              border: '2px solid #10B981',
              borderRadius: 'var(--radius-md, 8px)',
              padding: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1rem',
            }}
          >
            <div>
              <h4 style={{ margin: 0, color: '#065F46', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>⚡</span>
                <span>Pending Order Actions</span>
              </h4>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.9rem', color: '#047857' }}>
                Review customer items and choose to accept the order for fulfillment or cancel with a reason.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <button
                type="button"
                className="button button-success accept-order-btn"
                onClick={() => handleAcceptOrder(order.id)}
                disabled={processingOrderId === order.id}
                style={{
                  background: '#10B981',
                  color: '#fff',
                  borderColor: '#059669',
                  fontWeight: 700,
                  padding: '0.6rem 1.25rem',
                  fontSize: '0.9rem',
                }}
              >
                {processingOrderId === order.id ? 'Accepting...' : 'ACCEPT ORDER'}
              </button>
              <button
                type="button"
                className="button button-danger cancel-order-btn"
                onClick={() => promptCancelOrder(order)}
                disabled={processingOrderId === order.id}
                style={{
                  background: '#EF4444',
                  color: '#fff',
                  borderColor: '#DC2626',
                  fontWeight: 700,
                  padding: '0.6rem 1.25rem',
                  fontSize: '0.9rem',
                }}
              >
                CANCEL ORDER
              </button>
            </div>
          </div>
        ) : (order.status || '').toUpperCase() === 'ACCEPTED' ? (
          <div
            className="order-m7-accepted-banner"
            style={{
              background: '#ECFDF5',
              border: '1px solid #A7F3D0',
              borderRadius: 'var(--radius-md, 8px)',
              padding: '1rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1rem',
              color: '#065F46',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.25rem' }}>✓</span>
              <div>
                <strong style={{ display: 'block' }}>Order ACCEPTED</strong>
                <span style={{ fontSize: '0.9rem' }}>
                  This order is accepted and ready to be prepared.
                </span>
              </div>
            </div>
            <button
              type="button"
              className="button button-primary start-preparing-btn"
              onClick={() => handlePrepareOrder(order.id)}
              disabled={processingOrderId === order.id}
              style={{
                fontWeight: 700,
                padding: '0.6rem 1.25rem',
                fontSize: '0.9rem',
              }}
            >
              {processingOrderId === order.id ? 'Starting...' : '👨‍🍳 START PREPARING'}
            </button>
          </div>
        ) : (order.status || '').toUpperCase() === 'PREPARING' ? (
          <div
            className="order-m7-preparing-banner"
            style={{
              background: '#FEF3C7',
              border: '1px solid #FDE68A',
              borderRadius: 'var(--radius-md, 8px)',
              padding: '1rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '1rem',
              color: '#92400E',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.25rem' }}>👨‍🍳</span>
              <div>
                <strong style={{ display: 'block' }}>Order PREPARING</strong>
                <span style={{ fontSize: '0.9rem' }}>
                  Items are currently being packed. Once ready for delivery, mark Out for Delivery.
                </span>
              </div>
            </div>
            <button
              type="button"
              className="button button-primary out-for-delivery-btn"
              onClick={() => handleOutForDeliveryOrder(order.id)}
              disabled={processingOrderId === order.id}
              style={{
                background: '#4F46E5',
                borderColor: '#4338CA',
                color: '#fff',
                fontWeight: 700,
                padding: '0.6rem 1.25rem',
                fontSize: '0.9rem',
              }}
            >
              {processingOrderId === order.id ? 'Dispatching...' : '🚚 OUT FOR DELIVERY'}
            </button>
          </div>
        ) : (order.status || '').toUpperCase() === 'OUT_FOR_DELIVERY' ? (
          <div
            className="order-m8-delivery-action-card"
            style={{
              background: '#F8FAFC',
              border: '2px solid #6366F1',
              borderRadius: 'var(--radius-md, 10px)',
              padding: '1.25rem 1.5rem',
              marginBottom: '1.5rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.75rem',
                marginBottom: '1rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontSize: '1.5rem' }}>🚚</span>
                <div>
                  <strong style={{ fontSize: '1.05rem', color: '#1E1B4B' }}>Order Out for Delivery</strong>
                  <div style={{ fontSize: '0.85rem', color: '#64748B' }}>
                    Delivery Mode:{' '}
                    <strong>
                      {(order.delivery_method || 'HAND_TO_CUSTOMER') === 'LEAVE_AT_DOOR'
                        ? '🚪 Leave at Door (Contactless)'
                        : '🤝 Hand to Customer (OTP Required)'}
                    </strong>
                  </div>
                </div>
              </div>
              <span
                style={{
                  background:
                    (order.delivery_method || 'HAND_TO_CUSTOMER') === 'LEAVE_AT_DOOR'
                      ? '#F1F5F9'
                      : '#EEF2FF',
                  color:
                    (order.delivery_method || 'HAND_TO_CUSTOMER') === 'LEAVE_AT_DOOR'
                      ? '#475569'
                      : '#4338CA',
                  padding: '0.3rem 0.75rem',
                  borderRadius: '20px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                }}
              >
                {(order.delivery_method || 'HAND_TO_CUSTOMER') === 'LEAVE_AT_DOOR'
                  ? 'NO OTP REQUIRED'
                  : 'OTP VERIFICATION REQUIRED'}
              </span>
            </div>

            {(order.delivery_method || 'HAND_TO_CUSTOMER') === 'LEAVE_AT_DOOR' ? (
              /* LEAVE AT DOOR: Direct Mark as Delivered */
              <div>
                <p style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: '#334155' }}>
                  The customer requested contactless delivery. Once the grocery package has been placed at their doorstep, click below to mark this order as delivered.
                </p>
                <button
                  type="button"
                  className="button button-primary mark-delivered-btn"
                  onClick={() => handleMarkDeliveredLeaveAtDoor(order.id)}
                  disabled={processingOrderId === order.id}
                  style={{
                    background: '#059669',
                    borderColor: '#047857',
                    color: '#fff',
                    fontWeight: 700,
                    padding: '0.65rem 1.5rem',
                    fontSize: '0.95rem',
                  }}
                >
                  {processingOrderId === order.id ? 'Updating...' : '✅ Mark as Delivered'}
                </button>
              </div>
            ) : (
              /* HAND TO CUSTOMER: 6-digit OTP verification */
              <div>
                <p style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: '#334155' }}>
                  Ask the customer for the 6-digit delivery OTP displayed on their order screen to confirm handover.
                </p>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={6}
                      placeholder="Enter 6-digit OTP"
                      value={deliveryOtpInput[order.id] || ''}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                        setDeliveryOtpInput((prev) => ({ ...prev, [order.id]: val }));
                        setOtpVerifyError((prev) => ({ ...prev, [order.id]: null }));
                      }}
                      style={{
                        padding: '0.6rem 1rem',
                        fontSize: '1.25rem',
                        fontWeight: 700,
                        letterSpacing: '4px',
                        fontFamily: 'monospace',
                        textAlign: 'center',
                        width: '210px',
                        border: '2px solid #CBD5E1',
                        borderRadius: '8px',
                        background: '#FFFFFF',
                      }}
                    />
                  </div>

                  <button
                    type="button"
                    className="button button-primary verify-otp-btn"
                    onClick={() => handleVerifyDeliveryOtp(order.id)}
                    disabled={
                      verifyingOtpOrderId === order.id ||
                      (deliveryOtpInput[order.id] || '').length !== 6
                    }
                    style={{
                      background: '#4F46E5',
                      borderColor: '#4338CA',
                      color: '#fff',
                      fontWeight: 700,
                      padding: '0.65rem 1.35rem',
                      fontSize: '0.9rem',
                    }}
                  >
                    {verifyingOtpOrderId === order.id ? 'Verifying OTP...' : '🔐 Verify Delivery OTP'}
                  </button>
                </div>

                {otpVerifyError[order.id] && (
                  <div
                    style={{
                      marginTop: '0.75rem',
                      padding: '0.5rem 0.75rem',
                      background: '#FEF2F2',
                      border: '1px solid #FECACA',
                      borderRadius: '6px',
                      color: '#DC2626',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                    }}
                  >
                    ⚠️ {otpVerifyError[order.id]}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (order.status || '').toUpperCase() === 'DELIVERED' ? (
          <div
            className="order-m8-delivered-banner"
            style={{
              background: '#ECFDF5',
              border: '1px solid #A7F3D0',
              borderRadius: 'var(--radius-md, 8px)',
              padding: '1rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              color: '#065F46',
              marginBottom: '1.5rem',
            }}
          >
            <span style={{ fontSize: '1.5rem' }}>✓</span>
            <div>
              <strong style={{ display: 'block' }}>Order DELIVERED</strong>
              <span style={{ fontSize: '0.9rem' }}>
                This order has been verified and successfully delivered to the customer.
              </span>
            </div>
          </div>
        ) : (order.status || '').toUpperCase() === 'CANCELLED' ? (
          <div
            className="order-m7-cancelled-banner"
            style={{
              background: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: 'var(--radius-md, 8px)',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.75rem',
              color: '#991B1B',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '1.25rem' }}>✕</span>
              <div>
                <strong style={{ display: 'block' }}>Order CANCELLED</strong>
                <span style={{ fontSize: '0.9rem' }}>
                  {order.cancellation_reason
                    ? `Cancellation Reason: ${order.cancellation_reason}`
                    : 'This order was cancelled. Reserved inventory was restored.'}
                </span>
              </div>
            </div>
            {order.payment_method === 'ONLINE' &&
              (order.payment_status === 'PAID' || order.refund_status === 'REFUND_INITIATED') && (
                <div
                  style={{
                    padding: '0.75rem 1rem',
                    background: '#FFFBEB',
                    border: '1px solid #FCD34D',
                    borderRadius: '6px',
                    color: '#92400E',
                    fontSize: '0.85rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem',
                  }}
                >
                  <strong style={{ color: '#B45309' }}>💳 Online Payment Refund Status:</strong>
                  <span>Customer payment was verified. Demo refund has been marked as <strong>REFUND_INITIATED</strong> (1–2 business days).</span>
                  <span style={{ fontSize: '0.75rem', color: '#A16207', fontStyle: 'italic' }}>
                    * Portfolio/Test-mode simulation: Stripe test payment reference preserved without real money deduction.
                  </span>
                </div>
              )}
          </div>
        ) : null}

        {/* 2-Column Info Grid */}
        <div className="order-detail-grid">
          {/* Customer Information */}
          <div className="detail-card-panel">
            <h4>👤 Customer Information</h4>
            <div className="detail-info-row">
              <span className="detail-label">Name:</span>
              <strong className="detail-value">
                {order.customer?.name || order.delivery_address?.name || 'Customer'}
              </strong>
            </div>
            <div className="detail-info-row">
              <span className="detail-label">Phone:</span>
              <span className="detail-value">
                {order.customer?.phone || order.delivery_address?.phone ? (
                  <a
                    href={`tel:${order.customer?.phone || order.delivery_address?.phone}`}
                    className="order-phone-link"
                  >
                    📞 {order.customer?.phone || order.delivery_address?.phone}
                  </a>
                ) : (
                  'N/A'
                )}
              </span>
            </div>
            {order.customer?.email && (
              <div className="detail-info-row">
                <span className="detail-label">Email:</span>
                <span className="detail-value">{order.customer.email}</span>
              </div>
            )}
          </div>

          {/* Delivery Address */}
          <div className="detail-card-panel">
            <h4>📍 Delivery Address</h4>
            <div className="detail-info-row">
              <span className="detail-label">Recipient:</span>
              <span className="detail-value">
                {order.delivery_address?.name || order.customer?.name || 'Customer'}
              </span>
            </div>
            <div className="detail-info-row">
              <span className="detail-label">Address:</span>
              <span className="detail-value">
                {order.delivery_address?.address || 'N/A'}
              </span>
            </div>
            <div className="detail-info-row">
              <span className="detail-label">City, State:</span>
              <span className="detail-value">
                {[order.delivery_address?.city, order.delivery_address?.state]
                  .filter(Boolean)
                  .join(', ') || 'N/A'}
              </span>
            </div>
            <div className="detail-info-row">
              <span className="detail-label">Pincode:</span>
              <span className="detail-value">
                {order.delivery_address?.pincode || 'N/A'}
              </span>
            </div>
          </div>
        </div>

        {/* Order Items Table */}
        <div className="order-detail-items-panel">
          <h4>📦 Items in Order ({order.item_count || order.items?.length || 0})</h4>
          <div className="order-items-table-wrapper">
            <table className="order-items-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Unit Price</th>
                  <th>Qty</th>
                  <th style={{ textAlign: 'right' }}>Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {(order.items || []).map((item, index) => {
                  const price = Number(item.unit_price) || 0;
                  const qty = Number(item.quantity) || 1;
                  const sub = Number(item.subtotal) || price * qty;
                  return (
                    <tr key={item.id || index}>
                      <td>
                        <strong>{item.product_name}</strong>
                        {item.unit_label && (
                          <span className="item-unit-label"> ({item.unit_label})</span>
                        )}
                      </td>
                      <td>₹{price.toFixed(2)}</td>
                      <td>{qty}</td>
                      <td style={{ textAlign: 'right' }}>₹{sub.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ textAlign: 'right' }}>Items Subtotal:</td>
                  <td style={{ textAlign: 'right' }}>₹{Number(order.subtotal || order.total).toFixed(2)}</td>
                </tr>
                <tr>
                  <td colSpan={3} style={{ textAlign: 'right' }}>Delivery Fee:</td>
                  <td style={{ textAlign: 'right', color: 'var(--color-success-text)' }}>FREE (Local Delivery)</td>
                </tr>
                <tr className="order-total-row">
                  <td colSpan={3} style={{ textAlign: 'right', fontWeight: 'bold' }}>
                    {order.payment_method === 'ONLINE' ? 'Total (Online Paid):' : 'Total to Collect (COD):'}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 'bold', color: 'var(--color-primary)' }}>
                    ₹{Number(order.total).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Payment & Timestamps */}
        <div className="order-detail-meta-panel">
          <div className="meta-box">
            <span className="meta-label">Payment Method:</span>
            <span className="meta-val">
              {order.payment_method === 'ONLINE' ? '💳 Online Payment (Stripe)' : '💵 Cash on Delivery (COD)'}
            </span>
          </div>
          <div className="meta-box">
            <span className="meta-label">Payment Status:</span>
            <span className="meta-val">
              <span className={`badge-status ${order.payment_status === 'PAID' ? 'badge-approved' : 'badge-pending'}`}>
                {order.payment_status === 'PAID' ? 'PAID ✅' : (order.payment_status || 'PENDING')}
              </span>
            </span>
          </div>
          {order.stripe_payment_intent_id && (
            <div className="meta-box">
              <span className="meta-label">Stripe Ref:</span>
              <span className="meta-val" style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                {order.stripe_payment_intent_id}
              </span>
            </div>
          )}
          <div className="meta-box">
            <span className="meta-label">Order Placed At:</span>
            <span className="meta-val">🕒 {formatOrderDateTime(order.created_at)}</span>
          </div>
          <div className="meta-box">
            <span className="meta-label">Current Status:</span>
            <span className="meta-val">{order.status}</span>
          </div>
        </div>

        {/* Bottom Back Button */}
        <div style={{ display: 'flex', justifyContent: 'flex-start', paddingTop: '0.5rem' }}>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => {
              setSelectedOrder(null);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            ← Back to Orders List
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="shopkeeper-portal-container">
      {/* Top Banner / Navbar */}
      <div className="shopkeeper-top-bar">
        <div className="shopkeeper-top-left">
          <span className="shopkeeper-brand-icon">🏪</span>
          <div>
            <h1 className="shopkeeper-brand-title">Shopkeeper Portal</h1>
            <div className="shopkeeper-brand-subtitle">
              {shop ? (
                <span>
                  Store: <strong>{shop.name}</strong> • {shop.city}
                </span>
              ) : (
                <span>Manage your neighborhood grocery store</span>
              )}
            </div>
          </div>
        </div>

        <div className="shopkeeper-top-actions">
          {shop && (
            <button
              type="button"
              onClick={handleQuickToggleShopOpen}
              className={`shop-status-toggle-btn ${shop.is_open ? 'is-open' : 'is-closed'}`}
              title="Click to toggle your store's ordering status"
            >
              <span className="toggle-dot"></span>
              <span>{shop.is_open ? 'Accepting Orders' : 'Store Closed'}</span>
            </button>
          )}

          <button onClick={signOut} className="button button-sm button-secondary">
            Sign Out
          </button>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div className="shopkeeper-tabs-nav">
        <button
          type="button"
          className={`shopkeeper-tab-item ${activeTab === 'orders' ? 'active' : ''}`}
          onClick={() => setActiveTab('orders')}
        >
          <span className="tab-icon">📋</span>
          <span>Orders</span>
          {pendingOrdersCount > 0 ? (
            <span className="tab-badge badge-warning-count" title={`${pendingOrdersCount} pending orders`}>
              {pendingOrdersCount}
            </span>
          ) : (
            <span className="tab-badge">0</span>
          )}
        </button>

        <button
          type="button"
          className={`shopkeeper-tab-item ${activeTab === 'products' ? 'active' : ''}`}
          onClick={() => setActiveTab('products')}
        >
          <span className="tab-icon">📦</span>
          <span>Products & Inventory</span>
          <span className="tab-badge">{products.length}</span>
        </button>

        <button
          type="button"
          className={`shopkeeper-tab-item ${activeTab === 'shop' ? 'active' : ''}`}
          onClick={() => setActiveTab('shop')}
        >
          <span className="tab-icon">⚙️</span>
          <span>My Shop Settings</span>
        </button>
      </div>

      {/* TAB 0: SHOPKEEPER ORDERS DASHBOARD (Milestone M5 & M7.1) */}
      {activeTab === 'orders' && (
        <div className="orders-action-feedback-wrap">
          {orderActionFeedback && (
            <div
              className={`alert ${orderActionFeedback.type === 'success' ? 'alert-success' : 'alert-error'}`}
              style={{ marginBottom: '1.25rem' }}
            >
              <span className="alert-icon">{orderActionFeedback.type === 'success' ? '✓' : '⚠️'}</span>
              <span>{orderActionFeedback.message}</span>
              <button
                type="button"
                className="alert-dismiss"
                onClick={() => setOrderActionFeedback(null)}
              >
                ✕
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'orders' && (
        selectedOrder ? (
          renderOrderDetailView(selectedOrder)
        ) : (
          <div className="shopkeeper-orders-view">
          {/* Header & Metrics */}
          <div className="shopkeeper-metrics-row">
            <div className="metric-box">
              <span className="metric-num text-warning">{pendingOrdersCount}</span>
              <span className="metric-label">Pending Orders</span>
            </div>
            <div className="metric-box">
              <span className="metric-num">{filteredOrders.length}</span>
              <span className="metric-label">
                {statusFilter === 'ALL' ? 'Total Orders' : `${statusFilter} Orders`}
              </span>
            </div>
            <div className="metric-box">
              <span className="metric-num text-primary">₹{totalOrdersRevenue.toFixed(2)}</span>
              <span className="metric-label">Order Volume Total</span>
            </div>
          </div>

          {/* Orders Filter & Search Controls */}
          <div className="shopkeeper-orders-controls">
            <div className="orders-filter-pills" role="tablist" aria-label="Order status filters">
              <button
                type="button"
                className={`filter-pill ${statusFilter === 'PENDING' ? 'active' : ''}`}
                onClick={() => setStatusFilter('PENDING')}
              >
                Pending (New)
                {statusFilter === 'PENDING' && pendingOrdersCount > 0 && ` (${pendingOrdersCount})`}
              </button>
              <button
                type="button"
                className={`filter-pill ${statusFilter === 'ALL' ? 'active' : ''}`}
                onClick={() => setStatusFilter('ALL')}
              >
                All Orders
              </button>
              <button
                type="button"
                className={`filter-pill ${statusFilter === 'CONFIRMED' ? 'active' : ''}`}
                onClick={() => setStatusFilter('CONFIRMED')}
              >
                Confirmed
              </button>
              <button
                type="button"
                className={`filter-pill ${statusFilter === 'DELIVERED' ? 'active' : ''}`}
                onClick={() => setStatusFilter('DELIVERED')}
              >
                Delivered
              </button>
              <button
                type="button"
                className={`filter-pill ${statusFilter === 'CANCELLED' ? 'active' : ''}`}
                onClick={() => setStatusFilter('CANCELLED')}
              >
                Cancelled
              </button>
            </div>

            <div className="orders-search-and-refresh">
              <div className="orders-search-box">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  placeholder="Search by Order ID, customer, phone, address, or item..."
                  value={orderSearchQuery}
                  onChange={(e) => setOrderSearchQuery(e.target.value)}
                />
                {orderSearchQuery && (
                  <button
                    type="button"
                    className="clear-search-btn"
                    onClick={() => setOrderSearchQuery('')}
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
              <button
                type="button"
                className="button button-sm button-secondary refresh-orders-btn"
                onClick={() => {
                  loadOrdersData(statusFilter);
                  if (statusFilter !== 'PENDING') {
                    refreshPendingCount();
                  }
                }}
                disabled={loadingOrders}
                title="Refresh latest orders"
              >
                🔄 Refresh
              </button>
            </div>
          </div>

          {/* Orders List / Content */}
          {loadingOrders ? (
            <div className="loading-state-box">
              <div className="spinner"></div>
              <p>Loading orders for your store...</p>
            </div>
          ) : ordersError ? (
            <div className="alert alert-error">
              <span className="alert-icon">⚠️</span>
              <span>{ordersError}</span>
              <button
                type="button"
                className="button button-sm button-secondary"
                style={{ marginLeft: 'auto' }}
                onClick={() => loadOrdersData(statusFilter)}
              >
                Retry
              </button>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="empty-state-box">
              <span className="empty-state-icon">📋</span>
              <h3>No {statusFilter !== 'ALL' ? statusFilter.toLowerCase() : ''} orders found</h3>
              <p>
                {statusFilter === 'PENDING'
                  ? 'There are currently no new pending customer orders waiting for your shop. New orders will appear here automatically.'
                  : `No orders matching status "${statusFilter}" were found for your store.`}
              </p>
              {orderSearchQuery && (
                <button
                  type="button"
                  className="button button-secondary button-sm"
                  onClick={() => setOrderSearchQuery('')}
                >
                  Clear Search Filter
                </button>
              )}
            </div>
          ) : (
            <div className="shopkeeper-orders-list">
              {filteredOrders.map((ord) => {
                const customerName =
                  ord.customer?.name || ord.delivery_address?.name || 'Customer';
                const customerPhone =
                  ord.customer?.phone || ord.delivery_address?.phone || 'N/A';
                const fullAddress = [
                  ord.delivery_address?.address,
                  ord.delivery_address?.city,
                  ord.delivery_address?.state,
                  ord.delivery_address?.pincode ? `- ${ord.delivery_address.pincode}` : '',
                ]
                  .filter(Boolean)
                  .join(', ');

                return (
                  <div key={ord.id} className="shopkeeper-order-card">
                    {/* Top Row: ID, Date, Status */}
                    <div className="order-card-header">
                      <div className="order-id-and-date">
                        <span className="order-id-badge" title={ord.id}>
                          Order #{ord.id.slice(0, 8)}...
                        </span>
                        <span className="order-time-stamp">
                          🕒 {formatOrderDateTime(ord.created_at)}
                        </span>
                      </div>
                      <div className="order-status-wrap">
                        {renderStatusBadge(ord.status)}
                      </div>
                    </div>

                    {/* Card Body: 2 Columns */}
                    <div className="order-card-body">
                      {/* Left: Customer & Delivery details */}
                      <div className="order-customer-section">
                        <div className="order-info-line">
                          <span className="info-icon">👤</span>
                          <span className="customer-name-text">{customerName}</span>
                        </div>
                        <div className="order-info-line">
                          <span className="info-icon">📞</span>
                          {customerPhone !== 'N/A' ? (
                            <a
                              href={`tel:${customerPhone}`}
                              className="order-phone-link"
                              title="Click to call customer"
                            >
                              {customerPhone}
                            </a>
                          ) : (
                            <span className="text-muted">No phone provided</span>
                          )}
                        </div>
                        <div className="order-info-line address-line">
                          <span className="info-icon">📍</span>
                          <span className="order-address-text">
                            {fullAddress || 'Address on file'}
                          </span>
                        </div>
                      </div>

                      {/* Right: Items snapshot */}
                      <div className="order-items-summary-section">
                        <div className="items-summary-header">
                          <span className="items-count-tag">
                            📦 {ord.item_count || ord.items?.length || 0} items
                          </span>
                        </div>
                        <div className="order-items-chips-list">
                          {(ord.items || []).slice(0, 3).map((item, idx) => (
                            <div key={item.id || idx} className="order-item-chip">
                              <span className="item-qty-badge">{item.quantity}x</span>
                              <span className="item-chip-name">{item.product_name}</span>
                              <span className="item-chip-price">₹{Number(item.subtotal || (item.unit_price * item.quantity)).toFixed(2)}</span>
                            </div>
                          ))}
                          {(ord.items || []).length > 3 && (
                            <span className="items-more-chip">
                              +{ord.items.length - 3} more items
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Card Footer: COD, Total, Action */}
                    <div className="order-card-footer">
                      <div className="order-payment-badge-wrap">
                        {ord.payment_method === 'ONLINE' ? (
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <span className="order-payment-method-pill payment-pill-online">
                              💳 Online Payment
                            </span>
                            <span className={`payment-status-tag ${ord.payment_status === 'PAID' ? 'status-paid' : 'status-pending'}`}>
                              {ord.payment_status === 'PAID' ? 'PAID ✅' : 'PENDING ⏳'}
                            </span>
                          </div>
                        ) : (
                          <span className="order-payment-method-pill">
                            💵 Cash on Delivery (COD)
                          </span>
                        )}
                        <span
                          className="order-delivery-method-pill"
                          style={{
                            background:
                              (ord.delivery_method || 'HAND_TO_CUSTOMER') === 'LEAVE_AT_DOOR'
                                ? '#F1F5F9'
                                : '#EEF2FF',
                            color:
                              (ord.delivery_method || 'HAND_TO_CUSTOMER') === 'LEAVE_AT_DOOR'
                                ? '#475569'
                                : '#4338CA',
                            padding: '0.2rem 0.6rem',
                            borderRadius: '12px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                          }}
                        >
                          {(ord.delivery_method || 'HAND_TO_CUSTOMER') === 'LEAVE_AT_DOOR'
                            ? '🚪 Leave at Door'
                            : '🤝 Hand to Customer'}
                        </span>
                        <div className="order-total-display">
                          <span className="total-label">Total:</span>
                          <span className="total-amount-val">
                            ₹{Number(ord.total).toFixed(2)}
                          </span>
                        </div>
                      </div>

                      <div className="order-card-actions" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                        {((ord.status || '').toUpperCase() === 'PENDING' || (ord.status || '').toUpperCase() === 'CREATED') && (
                          <>
                            <button
                              type="button"
                              className="button button-sm button-success accept-order-btn"
                              onClick={() => handleAcceptOrder(ord.id)}
                              disabled={processingOrderId === ord.id}
                              style={{
                                background: '#10B981',
                                color: '#fff',
                                borderColor: '#059669',
                                fontWeight: 700,
                              }}
                            >
                              {processingOrderId === ord.id ? 'Accepting...' : 'ACCEPT ORDER'}
                            </button>
                            <button
                              type="button"
                              className="button button-sm button-danger cancel-order-btn"
                              onClick={() => promptCancelOrder(ord)}
                              disabled={processingOrderId === ord.id}
                              style={{
                                background: '#EF4444',
                                color: '#fff',
                                borderColor: '#DC2626',
                                fontWeight: 700,
                              }}
                            >
                              CANCEL ORDER
                            </button>
                          </>
                        )}
                        {(ord.status || '').toUpperCase() === 'ACCEPTED' && (
                          <button
                            type="button"
                            className="button button-sm button-primary start-preparing-btn"
                            onClick={() => handlePrepareOrder(ord.id)}
                            disabled={processingOrderId === ord.id}
                            style={{ fontWeight: 700 }}
                          >
                            {processingOrderId === ord.id ? 'Starting...' : '👨‍🍳 START PREPARING'}
                          </button>
                        )}
                        {(ord.status || '').toUpperCase() === 'PREPARING' && (
                          <button
                            type="button"
                            className="button button-sm out-for-delivery-btn"
                            onClick={() => handleOutForDeliveryOrder(ord.id)}
                            disabled={processingOrderId === ord.id}
                            style={{
                              background: '#4F46E5',
                              borderColor: '#4338CA',
                              color: '#fff',
                              fontWeight: 700,
                            }}
                          >
                            {processingOrderId === ord.id ? 'Dispatching...' : '🚚 OUT FOR DELIVERY'}
                          </button>
                        )}
                        {(ord.status || '').toUpperCase() === 'OUT_FOR_DELIVERY' && (
                          (ord.delivery_method || 'HAND_TO_CUSTOMER') === 'LEAVE_AT_DOOR' ? (
                            <button
                              type="button"
                              className="button button-sm mark-delivered-btn"
                              onClick={() => handleMarkDeliveredLeaveAtDoor(ord.id)}
                              disabled={processingOrderId === ord.id}
                              style={{
                                background: '#059669',
                                borderColor: '#047857',
                                color: '#fff',
                                fontWeight: 700,
                              }}
                            >
                              {processingOrderId === ord.id ? 'Marking Delivered...' : '🚪 MARK AS DELIVERED'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="button button-sm"
                              onClick={() => {
                                setSelectedOrder(ord);
                                window.scrollTo({ top: 0, behavior: 'smooth' });
                              }}
                              style={{
                                background: '#4F46E5',
                                borderColor: '#4338CA',
                                color: '#fff',
                                fontWeight: 700,
                              }}
                            >
                              🔐 VERIFY DELIVERY OTP
                            </button>
                          )
                        )}
                        {(ord.payment_method === 'COD' || ord.payment_status === 'PAID') && (
                          <button
                            type="button"
                            className="button button-sm button-ghost"
                            style={{ border: '1px solid #CBD5E1', fontSize: '0.8rem', padding: '0.35rem 0.65rem' }}
                            disabled={downloadingInvoiceOrderId === ord.id}
                            onClick={() => handleShopkeeperInvoiceAction(ord.id, 'view')}
                            title="View Invoice PDF"
                          >
                            {downloadingInvoiceOrderId === ord.id ? '...' : '📄 Invoice'}
                          </button>
                        )}
                        <button
                          type="button"
                          className="button button-sm button-secondary view-order-btn"
                          onClick={() => {
                            setSelectedOrder(ord);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
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
        )
      )}

      {/* Feedback Messages */}
      {productFeedback && activeTab === 'products' && (
        <div className={`alert ${productFeedback.type === 'success' ? 'alert-success' : 'alert-error'}`}>
          <span className="alert-icon">{productFeedback.type === 'success' ? '✓' : '⚠️'}</span>
          <span>{productFeedback.message}</span>
          <button
            type="button"
            className="alert-dismiss"
            onClick={() => setProductFeedback(null)}
          >
            ✕
          </button>
        </div>
      )}

      {shopFeedback && activeTab === 'shop' && (
        <div className={`alert ${shopFeedback.type === 'success' ? 'alert-success' : 'alert-error'}`}>
          <span className="alert-icon">{shopFeedback.type === 'success' ? '✓' : '⚠️'}</span>
          <span>{shopFeedback.message}</span>
          <button
            type="button"
            className="alert-dismiss"
            onClick={() => setShopFeedback(null)}
          >
            ✕
          </button>
        </div>
      )}

      {/* TAB 1: PRODUCTS & INVENTORY */}
      {activeTab === 'products' && (
        <div className="shopkeeper-products-view">
          {/* Quick Metrics */}
          <div className="shopkeeper-metrics-row">
            <div className="metric-box">
              <span className="metric-num">{products.length}</span>
              <span className="metric-label">Total Products</span>
            </div>
            <div className="metric-box">
              <span className="metric-num text-success">
                {products.filter((p) => p.is_available && p.stock > 0).length}
              </span>
              <span className="metric-label">In Stock & Available</span>
            </div>
            <div className="metric-box">
              <span className="metric-num text-warning">
                {products.filter((p) => !p.is_available || p.stock === 0).length}
              </span>
              <span className="metric-label">Out of Stock / Unavailable</span>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="shopkeeper-toolbar">
            <div className="toolbar-search-box">
              <input
                type="text"
                placeholder="Search products in catalog..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="toolbar-search-input"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="clear-search-btn"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="toolbar-category-filter">
              <label htmlFor="cat-filter" style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                Category:
              </label>
              <select
                id="cat-filter"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="category-dropdown"
              >
                {productCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="button button-primary add-product-btn"
            >
              <span>+</span>
              <span>Add New Product</span>
            </button>
          </div>

          {/* Products List / Table */}
          {loadingProducts ? (
            <div className="loading-state-box">
              <div className="spinner"></div>
              <p>Loading your store's inventory...</p>
            </div>
          ) : productError ? (
            <div className="alert alert-error">
              <span className="alert-icon">⚠️</span>
              <span>{productError}</span>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="empty-catalog-box">
              <span className="empty-icon">🛒</span>
              <h3>No products in this view</h3>
              <p>
                {searchQuery || categoryFilter !== 'All'
                  ? 'Try changing your search or category filter.'
                  : 'Start adding items to your store inventory.'}
              </p>
              <button
                type="button"
                onClick={handleOpenCreateModal}
                className="button button-primary"
                style={{ marginTop: '0.75rem' }}
              >
                + Add Your First Product
              </button>
            </div>
          ) : (
            <div className="shopkeeper-products-table-wrapper">
              <table className="shopkeeper-products-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Category</th>
                    <th>Price</th>
                    <th>Stock Quantity</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <div className="table-product-cell">
                          <div className="table-product-thumb">
                            {p.image_url ? (
                              <img
                                src={p.image_url}
                                alt={p.name}
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <span>📦</span>
                            )}
                          </div>
                          <div>
                            <div className="table-product-name">{p.name}</div>
                            <div className="table-product-unit">{p.unit_label || 'piece'}</div>
                          </div>
                        </div>
                      </td>

                      <td>
                        <span className="table-category-tag">{p.category || 'General'}</span>
                      </td>

                      <td>
                        <strong className="table-price">₹{Number(p.price).toFixed(2)}</strong>
                      </td>

                      <td>
                        <div className="stock-control-group">
                          <button
                            type="button"
                            className="stock-btn stock-minus"
                            onClick={() => handleStockDelta(p.id, p.stock, -1)}
                            disabled={p.stock <= 0}
                            title="Decrease stock"
                          >
                            −
                          </button>
                          <span className={`stock-value ${p.stock === 0 ? 'stock-zero' : ''}`}>
                            {p.stock}
                          </span>
                          <button
                            type="button"
                            className="stock-btn stock-plus"
                            onClick={() => handleStockDelta(p.id, p.stock, 1)}
                            title="Increase stock"
                          >
                            +
                          </button>
                        </div>
                      </td>

                      <td>
                        <button
                          type="button"
                          className={`table-status-pill ${p.is_available ? 'pill-available' : 'pill-unavailable'}`}
                          onClick={() => handleToggleAvailability(p.id, p.is_available)}
                          title="Click to toggle availability"
                        >
                          <span className="pill-dot"></span>
                          <span>{p.is_available ? 'Available' : 'Unavailable'}</span>
                        </button>
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <div className="table-actions">
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(p)}
                            className="button button-sm button-secondary"
                            title="Edit Product Details"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleArchiveProduct(p.id, p.name)}
                            className="button button-sm button-danger-subtle"
                            title="Archive / Remove Product"
                          >
                            Archive
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MY SHOP SETTINGS */}
      {activeTab === 'shop' && (
        <div className="shopkeeper-settings-card">
          <div className="settings-header">
            <h2>My Store Settings & Public Profile</h2>
            <p>
              Information displayed to customers browsing neighborhood stores.
            </p>
          </div>

          {loadingShop ? (
            <div className="loading-state-box">
              <div className="spinner"></div>
              <p>Loading your shop configuration...</p>
            </div>
          ) : shopError ? (
            <div className="alert alert-error">
              <span className="alert-icon">⚠️</span>
              <span>{shopError}</span>
            </div>
          ) : (
            <form onSubmit={handleSaveShopSettings} className="shop-settings-form">
              {/* Store Status Toggle */}
              <div className="form-group-status-toggle">
                <div className="toggle-info">
                  <strong style={{ fontSize: '1rem', color: 'var(--color-brown-900)' }}>
                    Store Ordering Status
                  </strong>
                  <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                    {shopIsOpen
                      ? 'Store is currently accepting new customer orders.'
                      : 'Store is temporarily closed for orders.'}
                  </p>
                </div>
                <label className="switch-toggle-label">
                  <input
                    type="checkbox"
                    checked={shopIsOpen}
                    onChange={(e) => setShopIsOpen(e.target.checked)}
                  />
                  <span className="switch-slider"></span>
                </label>
              </div>

              {/* Store Identity */}
              <div className="form-row">
                <div className="form-group flex-2">
                  <label htmlFor="shop-name">Store Name *</label>
                  <input
                    id="shop-name"
                    type="text"
                    required
                    value={shopName}
                    onChange={(e) => setShopName(e.target.value)}
                    placeholder="e.g. FreshMart Groceries"
                  />
                </div>

                <div className="form-group flex-1">
                  <label htmlFor="shop-phone">Business Contact Phone *</label>
                  <input
                    id="shop-phone"
                    type="tel"
                    required
                    value={shopPhone}
                    onChange={(e) => setShopPhone(e.target.value)}
                    placeholder="e.g. +91 98765 00001"
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="shop-desc">Shop Description</label>
                <textarea
                  id="shop-desc"
                  rows={3}
                  value={shopDesc}
                  onChange={(e) => setShopDesc(e.target.value)}
                  placeholder="Describe your store specialties, grocery staples, or neighborhood delivery promise..."
                />
              </div>

              {/* Shop Photo */}
              <div className="form-group">
                <label>Shop Front / Logo Photo</label>
                <div className="photo-upload-row">
                  <div className="photo-preview-box">
                    {shopPhotoUrl ? (
                      <img
                        src={shopPhotoUrl}
                        alt="Shop preview"
                        className="photo-preview-img"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <span className="photo-preview-empty">🏪</span>
                    )}
                  </div>
                  <div className="photo-upload-inputs">
                    <label className="button button-sm button-secondary file-input-label">
                      <span>{uploadingShopPhoto ? 'Uploading...' : 'Upload New Photo'}</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleUploadShopPhoto}
                        disabled={uploadingShopPhoto}
                        style={{ display: 'none' }}
                      />
                    </label>
                    <input
                      type="url"
                      placeholder="Or paste photo URL..."
                      value={shopPhotoUrl}
                      onChange={(e) => setShopPhotoUrl(e.target.value)}
                      style={{ fontSize: '0.875rem' }}
                    />
                  </div>
                </div>
              </div>

              {/* Physical Location */}
              <div className="form-group">
                <label htmlFor="shop-address">Store Street Address *</label>
                <textarea
                  id="shop-address"
                  rows={2}
                  required
                  value={shopAddress}
                  onChange={(e) => setShopAddress(e.target.value)}
                  placeholder="e.g. 12 Market Road, T. Nagar"
                />
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label htmlFor="shop-city">City *</label>
                  <input
                    id="shop-city"
                    type="text"
                    required
                    value={shopCity}
                    onChange={(e) => setShopCity(e.target.value)}
                    placeholder="e.g. Chennai"
                  />
                </div>

                <div className="form-group flex-1">
                  <label htmlFor="shop-state">State *</label>
                  <input
                    id="shop-state"
                    type="text"
                    required
                    value={shopState}
                    onChange={(e) => setShopState(e.target.value)}
                    placeholder="e.g. Tamil Nadu"
                  />
                </div>

                <div className="form-group flex-1">
                  <label htmlFor="shop-pincode">Pincode *</label>
                  <input
                    id="shop-pincode"
                    type="text"
                    required
                    value={shopPincode}
                    onChange={(e) => setShopPincode(e.target.value)}
                    placeholder="e.g. 600017"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="settings-actions-bar">
                <button
                  type="submit"
                  disabled={savingShop}
                  className="button button-primary"
                >
                  {savingShop ? (
                    <>
                      <span className="spinner" style={{ width: '16px', height: '16px', borderWidth: '2px', borderTopColor: '#fff' }}></span>
                      <span>Saving Changes...</span>
                    </>
                  ) : (
                    'Save Shop Details'
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* CREATE / EDIT PRODUCT MODAL */}
      {modalMode && (
        <div className="modal-backdrop" onClick={() => setModalMode(null)}>
          <div className="modal-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{modalMode === 'create' ? 'Add New Product' : 'Edit Product Details'}</h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setModalMode(null)}
              >
                ✕
              </button>
            </div>

            {modalError && (
              <div className="alert alert-error" style={{ margin: '1rem 1.5rem 0' }}>
                <span className="alert-icon">⚠️</span>
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleModalSubmit} className="modal-form">
              <div className="form-group">
                <label htmlFor="modal-pname">Product Name *</label>
                <input
                  id="modal-pname"
                  type="text"
                  required
                  placeholder="e.g. Basmati Rice (5kg)"
                  value={prodName}
                  onChange={(e) => setProdName(e.target.value)}
                />
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label htmlFor="modal-pcat">Category</label>
                  <input
                    id="modal-pcat"
                    type="text"
                    list="cat-suggestions"
                    placeholder="e.g. Rice & Grains"
                    value={prodCategory}
                    onChange={(e) => setProdCategory(e.target.value)}
                  />
                  <datalist id="cat-suggestions">
                    <option value="Rice & Grains" />
                    <option value="Pulses & Lentils" />
                    <option value="Cooking Oil" />
                    <option value="Spices" />
                    <option value="Sweeteners" />
                    <option value="Dairy" />
                    <option value="Beverages" />
                    <option value="Biscuits & Snacks" />
                    <option value="Household" />
                    <option value="Essentials" />
                  </datalist>
                </div>

                <div className="form-group flex-1">
                  <label htmlFor="modal-punit">Unit Label</label>
                  <input
                    id="modal-punit"
                    type="text"
                    placeholder="e.g. 5 kg bag, 1 litre, 500g"
                    value={prodUnit}
                    onChange={(e) => setProdUnit(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group flex-1">
                  <label htmlFor="modal-pprice">Price (₹) *</label>
                  <input
                    id="modal-pprice"
                    type="number"
                    step="0.5"
                    min="0"
                    required
                    placeholder="0.00"
                    value={prodPrice}
                    onChange={(e) => setProdPrice(e.target.value)}
                  />
                </div>

                <div className="form-group flex-1">
                  <label htmlFor="modal-pstock">Available Stock *</label>
                  <input
                    id="modal-pstock"
                    type="number"
                    step="1"
                    min="0"
                    required
                    placeholder="0"
                    value={prodStock}
                    onChange={(e) => setProdStock(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="modal-pdesc">Short Description</label>
                <textarea
                  id="modal-pdesc"
                  rows={2}
                  placeholder="e.g. Premium aged grains, cleaned and packed..."
                  value={prodDesc}
                  onChange={(e) => setProdDesc(e.target.value)}
                />
              </div>

              {/* Product Image */}
              <div className="form-group">
                <label>Product Image</label>
                <div className="photo-upload-row">
                  <div className="photo-preview-box">
                    {prodImageUrl ? (
                      <img
                        src={prodImageUrl}
                        alt="Product preview"
                        className="photo-preview-img"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <span className="photo-preview-empty">📦</span>
                    )}
                  </div>
                  <div className="photo-upload-inputs">
                    <label className="button button-sm button-secondary file-input-label">
                      <span>{uploadingProdImage ? 'Uploading...' : 'Upload Image'}</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleUploadProductImage}
                        disabled={uploadingProdImage}
                        style={{ display: 'none' }}
                      />
                    </label>
                    <input
                      type="url"
                      placeholder="Or paste image URL..."
                      value={prodImageUrl}
                      onChange={(e) => setProdImageUrl(e.target.value)}
                      style={{ fontSize: '0.875rem' }}
                    />
                  </div>
                </div>
              </div>

              {/* Availability checkbox */}
              <div className="modal-checkbox-row">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={prodIsAvailable}
                    onChange={(e) => setProdIsAvailable(e.target.checked)}
                  />
                  <span>Mark as Available for Customers</span>
                </label>
              </div>

              {/* Modal Actions */}
              <div className="modal-actions">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="button button-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting || uploadingProdImage}
                  className="button button-primary"
                >
                  {modalSubmitting ? (
                    <>
                      <span className="spinner" style={{ width: '14px', height: '14px', borderWidth: '2px', borderTopColor: '#fff' }}></span>
                      <span>Saving Product...</span>
                    </>
                  ) : modalMode === 'create' ? (
                    'Add Product'
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* M7.1 CANCEL ORDER MODAL */}
      {cancelModalOrder && (
        <div
          className="modal-backdrop"
          onClick={() => {
            if (processingOrderId !== cancelModalOrder.id) {
              setCancelModalOrder(null);
            }
          }}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '1rem',
          }}
        >
          <div
            className="modal-dialog"
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#fff',
              borderRadius: 'var(--radius-lg, 12px)',
              maxWidth: '480px',
              width: '100%',
              padding: '1.75rem',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ margin: 0, color: '#991B1B', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.2rem' }}>
                <span>⚠️</span>
                <span>Cancel Order</span>
              </h3>
              <button
                type="button"
                className="button button-ghost button-sm"
                onClick={() => setCancelModalOrder(null)}
                disabled={processingOrderId === cancelModalOrder.id}
                style={{ fontSize: '1.1rem', padding: '0.25rem 0.5rem' }}
              >
                ✕
              </button>
            </div>

            <p style={{ margin: 0, fontSize: '0.925rem', color: '#475569', lineHeight: 1.5 }}>
              Are you sure you want to cancel Order <strong>#{cancelModalOrder.id}</strong> placed by{' '}
              <strong>{cancelModalOrder.customer?.name || cancelModalOrder.delivery_address?.name || 'Customer'}</strong>?
              Reserved product inventory will be automatically restored.
            </p>

            {cancelModalOrder.payment_method === 'ONLINE' && cancelModalOrder.payment_status === 'PAID' && (
              <div
                style={{
                  background: '#FFFBEB',
                  border: '1px solid #FCD34D',
                  padding: '0.75rem',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  color: '#92400E',
                  lineHeight: 1.4,
                }}
              >
                💳 <strong>Online Paid Order:</strong> Cancelling this order will initiate customer refund status (expected: 1–2 business days). Original Stripe reference will be preserved.
              </div>
            )}

            <div>
              <label
                htmlFor="shopkeeper-cancellation-reason"
                style={{
                  display: 'block',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  marginBottom: '0.375rem',
                  color: '#1E293B',
                }}
              >
                Cancellation Reason <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <textarea
                id="shopkeeper-cancellation-reason"
                rows={3}
                placeholder="e.g. Items out of stock, Store closing early, Delivery address not reachable..."
                value={cancelReasonInput}
                onChange={(e) => {
                  setCancelReasonInput(e.target.value);
                  if (cancelReasonError) setCancelReasonError(null);
                }}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-md, 8px)',
                  border: cancelReasonError ? '2px solid #EF4444' : '1px solid #CBD5E1',
                  fontFamily: 'inherit',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                }}
                autoFocus
              />
              {cancelReasonError && (
                <p style={{ margin: '0.375rem 0 0 0', color: '#EF4444', fontSize: '0.825rem', fontWeight: 500 }}>
                  {cancelReasonError}
                </p>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.25rem' }}>
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setCancelModalOrder(null)}
                disabled={processingOrderId === cancelModalOrder.id}
              >
                Keep Order
              </button>
              <button
                type="button"
                className="button button-danger"
                onClick={handleConfirmCancelOrder}
                disabled={processingOrderId === cancelModalOrder.id}
                style={{
                  background: '#EF4444',
                  color: '#fff',
                  borderColor: '#DC2626',
                  fontWeight: 700,
                }}
              >
                {processingOrderId === cancelModalOrder.id ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
