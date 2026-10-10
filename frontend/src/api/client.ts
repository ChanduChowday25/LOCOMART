/**
 * LOCOMART — Backend API Client
 * Connects the frontend to FastAPI endpoints.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface UserProfile {
  id: string;
  email: string;
  role: 'CUSTOMER' | 'SHOPKEEPER' | 'ADMIN';
  name: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  created_at?: string;
  updated_at?: string;
}

export interface ProfileUpdatePayload {
  name: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
}

export interface HealthResponse {
  status: string;
  service: string;
  milestone: string;
}

export interface DbHealthResponse {
  status: string;
  database: string;
  version?: string;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (networkError: any) {
    throw new Error(
      'Unable to connect to the LOCOMART backend. Please check your connection and try again.'
    );
  }

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`;
    try {
      const errData = await response.json();
      if (typeof errData.detail === 'string') {
        errorMessage = errData.detail;
      } else if (Array.isArray(errData.detail)) {
        errorMessage = errData.detail.map((item: any) => item.msg || JSON.stringify(item)).join(', ');
      } else if (errData.detail || errData.message) {
        errorMessage = errData.detail || errData.message || errorMessage;
      }
    } catch {
      // Use fallback
    }
    throw new Error(errorMessage);
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Health Checks (M0)
// ---------------------------------------------------------------------------
export async function checkBackendHealth(): Promise<HealthResponse> {
  return request<HealthResponse>('/health');
}

export async function checkDatabaseHealth(): Promise<DbHealthResponse> {
  return request<DbHealthResponse>('/health/db');
}

// ---------------------------------------------------------------------------
// Authentication & User Synchronization (M1)
// ---------------------------------------------------------------------------
export async function syncUserWithBackend(token: string): Promise<{ status: string; user: UserProfile }> {
  return request<{ status: string; user: UserProfile }>('/api/v1/auth/sync', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function getCurrentUserFromBackend(token: string): Promise<{ status: string; user: UserProfile }> {
  return request<{ status: string; user: UserProfile }>('/api/v1/auth/me', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function verifyRoleWithBackend(
  token: string,
  expectedRole: 'CUSTOMER' | 'SHOPKEEPER' | 'ADMIN'
): Promise<{
  allowed: boolean;
  actual_role: string;
  expected_role: string;
  message: string;
  user?: UserProfile;
}> {
  return request('/api/v1/auth/verify-role', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ expected_role: expectedRole }),
  });
}

// ---------------------------------------------------------------------------
// Profile Management (M1)
// ---------------------------------------------------------------------------
export async function fetchProfile(token: string): Promise<{ status: string; profile: UserProfile }> {
  return request<{ status: string; profile: UserProfile }>('/api/v1/users/profile', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function updateProfile(
  token: string,
  payload: ProfileUpdatePayload
): Promise<{ status: string; message: string; profile: UserProfile }> {
  return request<{ status: string; message: string; profile: UserProfile }>('/api/v1/users/profile', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

// ---------------------------------------------------------------------------
// Role-Protected Overviews (M1)
// ---------------------------------------------------------------------------
export async function fetchCustomerOverview(token: string): Promise<any> {
  return request('/api/v1/customer/overview', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function fetchShopkeeperOverview(token: string): Promise<any> {
  return request('/api/v1/shopkeeper/overview', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function fetchAdminOverview(token: string): Promise<any> {
  return request('/api/v1/admin/overview', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ---------------------------------------------------------------------------
// Shopkeeper Applications & Admin Approval (M2)
// ---------------------------------------------------------------------------
export interface ShopkeeperApplication {
  id: string;
  user_id: string;
  applicant_name: string;
  applicant_email: string;
  applicant_phone: string;
  shop_name: string;
  shop_description: string;
  shop_phone: string;
  shop_address: string;
  city: string;
  state: string;
  pincode: string;
  shop_photo_url: string;
  document_url: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejection_reason?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  authorized_photo_url?: string;
  authorized_document_url?: string;
  created_at: string;
  updated_at: string;
}

export interface ApplicationSubmitPayload {
  shop_name: string;
  shop_description?: string;
  shop_phone: string;
  shop_address: string;
  city: string;
  state: string;
  pincode: string;
  shop_photo_url?: string;
  document_url?: string;
  applicant_name?: string;
  applicant_phone?: string;
}

export interface ApplicationStatusResponse {
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'NONE';
  application: ShopkeeperApplication | null;
  can_apply: boolean;
}

export async function uploadApplicationFile(
  token: string,
  file: File,
  category: 'photo' | 'document' = 'document'
): Promise<{ status: string; key: string; filename: string }> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('category', category);

  return request<{ status: string; key: string; filename: string }>('/api/v1/applications/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });
}

export async function submitShopkeeperApplication(
  token: string,
  payload: ApplicationSubmitPayload
): Promise<{ status: string; message: string; application: ShopkeeperApplication }> {
  return request<{ status: string; message: string; application: ShopkeeperApplication }>('/api/v1/applications/submit', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export async function fetchMyApplicationStatus(token: string): Promise<ApplicationStatusResponse> {
  return request<ApplicationStatusResponse>('/api/v1/applications/my-status', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export function getApplicationFileUrl(applicationId: string, fileType: 'photo' | 'document'): string {
  return `${API_BASE}/api/v1/applications/${applicationId}/files/${fileType}`;
}

// ---------------------------------------------------------------------------
// Admin APIs (M2)
// ---------------------------------------------------------------------------
export async function fetchAdminApplications(
  token: string,
  statusFilter?: string
): Promise<{ status: string; count: number; applications: ShopkeeperApplication[] }> {
  const query = statusFilter && statusFilter !== 'ALL' ? `?status=${encodeURIComponent(statusFilter)}` : '';
  return request<{ status: string; count: number; applications: ShopkeeperApplication[] }>(
    `/api/v1/admin/applications${query}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }
  );
}

export async function fetchAdminApplication(
  token: string,
  applicationId: string
): Promise<{ status: string; application: ShopkeeperApplication }> {
  return request<{ status: string; application: ShopkeeperApplication }>(
    `/api/v1/admin/applications/${applicationId}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }
  );
}

export async function approveAdminApplication(
  token: string,
  applicationId: string
): Promise<{ status: string; message: string; application: ShopkeeperApplication; shop: any }> {
  return request(`/api/v1/admin/applications/${applicationId}/approve`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function rejectAdminApplication(
  token: string,
  applicationId: string,
  rejectionReason: string
): Promise<{ status: string; message: string; application: ShopkeeperApplication }> {
  return request(`/api/v1/admin/applications/${applicationId}/reject`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ rejection_reason: rejectionReason }),
  });
}

export async function seedAdminDemoShops(
  token: string
): Promise<{ status: string; message: string; shops: string[] }> {
  return request(`/api/v1/admin/seed-demo-shops`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function fetchAdminShops(
  token: string
): Promise<{ status: string; count: number; shops: any[] }> {
  return request(`/api/v1/admin/shops`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ---------------------------------------------------------------------------
// Milestone M3: Shops & Products APIs
// ---------------------------------------------------------------------------

export interface Shop {
  id: string;
  owner_id?: string;
  name: string;
  description: string;
  business_phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  photo_url: string;
  is_active: boolean;
  is_open: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Product {
  id: string;
  shop_id: string;
  name: string;
  description: string;
  category: string;
  unit_label: string;
  price: number;
  stock: number;
  image_url: string;
  is_available: boolean;
  is_archived?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface ShopUpdatePayload {
  name?: string;
  description?: string;
  business_phone?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  photo_url?: string;
  is_open?: boolean;
}

export interface ProductPayload {
  name: string;
  description?: string;
  category?: string;
  unit_label?: string;
  price: number;
  stock: number;
  image_url?: string;
  is_available?: boolean;
}

// Customer / Public APIs
export async function fetchActiveShops(): Promise<{ status: string; count: number; shops: Shop[] }> {
  return request<{ status: string; count: number; shops: Shop[] }>('/api/v1/shops', {
    method: 'GET',
  });
}

export async function fetchShopDetails(shopId: string): Promise<{ status: string; shop: Shop }> {
  return request<{ status: string; shop: Shop }>(`/api/v1/shops/${shopId}`, {
    method: 'GET',
  });
}

export async function fetchShopProducts(
  shopId: string,
  category?: string,
  search?: string
): Promise<{ status: string; shop_id: string; count: number; products: Product[] }> {
  const params = new URLSearchParams();
  if (category && category !== 'All') params.append('category', category);
  if (search && search.trim()) params.append('search', search.trim());
  const query = params.toString() ? `?${params.toString()}` : '';
  return request<{ status: string; shop_id: string; count: number; products: Product[] }>(
    `/api/v1/shops/${shopId}/products${query}`,
    { method: 'GET' }
  );
}

// Shopkeeper APIs
export async function fetchMyShop(token: string): Promise<{ status: string; shop: Shop }> {
  return request<{ status: string; shop: Shop }>('/api/v1/shopkeeper/shop', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function updateMyShop(
  token: string,
  payload: ShopUpdatePayload
): Promise<{ status: string; message: string; shop: Shop }> {
  return request<{ status: string; message: string; shop: Shop }>('/api/v1/shopkeeper/shop', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export async function fetchMyShopProducts(
  token: string
): Promise<{ status: string; shop_id: string; count: number; products: Product[] }> {
  return request<{ status: string; shop_id: string; count: number; products: Product[] }>(
    '/api/v1/shopkeeper/products',
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }
  );
}

export async function createShopProduct(
  token: string,
  payload: ProductPayload
): Promise<{ status: string; message: string; product: Product }> {
  return request<{ status: string; message: string; product: Product }>('/api/v1/shopkeeper/products', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
}

export async function updateShopProduct(
  token: string,
  productId: string,
  payload: Partial<ProductPayload>
): Promise<{ status: string; message: string; product: Product }> {
  return request<{ status: string; message: string; product: Product }>(
    `/api/v1/shopkeeper/products/${productId}`,
    {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
    }
  );
}

export async function updateShopProductStock(
  token: string,
  productId: string,
  stock: number
): Promise<{ status: string; message: string; product: Product }> {
  return request<{ status: string; message: string; product: Product }>(
    `/api/v1/shopkeeper/products/${productId}/stock`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ stock }),
    }
  );
}

export async function toggleShopProductAvailability(
  token: string,
  productId: string,
  isAvailable: boolean
): Promise<{ status: string; message: string; product: Product }> {
  return request<{ status: string; message: string; product: Product }>(
    `/api/v1/shopkeeper/products/${productId}/availability`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ is_available: isAvailable }),
    }
  );
}

export async function archiveShopProduct(
  token: string,
  productId: string
): Promise<{ status: string; message: string; product_id: string }> {
  return request<{ status: string; message: string; product_id: string }>(
    `/api/v1/shopkeeper/products/${productId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }
  );
}

export async function uploadShopkeeperImage(
  token: string,
  file: File
): Promise<{ status: string; key: string; url: string }> {
  const formData = new FormData();
  formData.append('file', file);
  return request<{ status: string; key: string; url: string }>('/api/v1/shopkeeper/upload-image', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
}

// ---------------------------------------------------------------------------
// Milestone M4.1: Customer Cart APIs
// ---------------------------------------------------------------------------

export interface CartItem {
  id: string;
  cart_id: string;
  product_id: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  product: Product;
  created_at?: string;
  updated_at?: string;
}

export interface CartData {
  id: string;
  customer_id: string;
  shop_id: string;
  status: string;
  created_at?: string;
  updated_at?: string;
}

export interface CartResponse {
  status: string;
  message?: string;
  cart: CartData | null;
  shop: Shop | null;
  items: CartItem[];
  item_count: number;
  subtotal: number;
  total: number;
}

export async function fetchCart(token: string): Promise<CartResponse> {
  return request<CartResponse>('/api/v1/cart', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function addToCart(
  token: string,
  productId: string,
  quantity: number = 1,
  shopId?: string
): Promise<CartResponse> {
  return request<CartResponse>('/api/v1/cart/items', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      product_id: productId,
      quantity,
      shop_id: shopId,
    }),
  });
}

export async function updateCartItemQuantity(
  token: string,
  itemId: string,
  quantity: number
): Promise<CartResponse> {
  return request<CartResponse>(`/api/v1/cart/items/${itemId}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ quantity }),
  });
}

export async function removeCartItem(token: string, itemId: string): Promise<CartResponse> {
  return request<CartResponse>(`/api/v1/cart/items/${itemId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function clearCart(token: string): Promise<CartResponse> {
  return request<CartResponse>('/api/v1/cart', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ===========================================================================
// Milestone M5.1: Orders & Transactional Inventory Client Layer
// ===========================================================================

export interface DeliveryAddressSnapshot {
  name: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
}

export interface OrderItemSnapshot {
  id: string;
  product_id: string;
  product_name: string;
  product_description?: string;
  unit_label?: string;
  unit_price: number;
  quantity: number;
  subtotal: number;
  created_at?: string;
}

export interface DeliveryOtpInfo {
  code?: string | null;
  expires_at?: string;
  seconds_remaining?: number;
  attempt_count?: number;
  max_attempts?: number;
  is_expired?: boolean;
  is_locked?: boolean;
  status?: string;
  cooldown_seconds_remaining?: number;
  regenerations_used?: number;
  regenerations_remaining?: number;
  max_regenerations?: number;
}

export interface InvoiceInfo {
  id: string;
  order_id: string;
  invoice_number: string;
  storage_key: string;
  created_at: string;
  updated_at: string;
}

export interface InvoiceResponse {
  status: string;
  available: boolean;
  message?: string;
  order_id?: string;
  invoice?: InvoiceInfo | null;
  download_url?: string;
}

export interface OrderDetails {
  id: string;
  customer_id: string;
  shop_id: string;
  status: string;
  subtotal: number;
  total: number;
  delivery_method?: 'HAND_TO_CUSTOMER' | 'LEAVE_AT_DOOR' | string;
  delivery_otp?: DeliveryOtpInfo | null;
  invoice?: InvoiceInfo | null;
  payment_method?: 'COD' | 'ONLINE' | string;
  payment_status?: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED' | string;
  stripe_session_id?: string | null;
  stripe_payment_intent_id?: string | null;
  cancellation_reason?: string | null;
  refund_status?: string | null;
  delivery_address: DeliveryAddressSnapshot;
  customer: {
    id: string;
    name?: string;
    email?: string;
    phone?: string;
  };
  shop: {
    id: string;
    name: string;
    address: string;
    city: string;
    phone?: string;
    photo_url?: string;
  };
  items: OrderItemSnapshot[];
  item_count: number;
  created_at: string;
  updated_at: string;
}

export interface OrderResponse {
  status: string;
  message?: string;
  id: string;
  customer_id: string;
  shop_id: string;
  subtotal: number;
  total: number;
  delivery_method?: 'HAND_TO_CUSTOMER' | 'LEAVE_AT_DOOR' | string;
  delivery_otp?: DeliveryOtpInfo | null;
  invoice?: InvoiceInfo | null;
  payment_method?: 'COD' | 'ONLINE' | string;
  payment_status?: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED' | string;
  stripe_session_id?: string | null;
  stripe_payment_intent_id?: string | null;
  cancellation_reason?: string | null;
  refund_status?: string | null;
  delivery_address: DeliveryAddressSnapshot;
  customer: {
    id: string;
    name?: string;
    email?: string;
    phone?: string;
  };
  shop: {
    id: string;
    name: string;
    address: string;
    city: string;
    phone?: string;
    photo_url?: string;
  };
  items: OrderItemSnapshot[];
  item_count: number;
  created_at: string;
  updated_at: string;
  order: OrderDetails;
}

export async function createOrder(
  token: string,
  deliveryMethod: 'HAND_TO_CUSTOMER' | 'LEAVE_AT_DOOR' = 'HAND_TO_CUSTOMER',
  paymentMethod: 'COD' | 'ONLINE' = 'COD'
): Promise<OrderResponse> {
  return request<OrderResponse>('/api/v1/orders', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      delivery_method: deliveryMethod,
      payment_method: paymentMethod,
    }),
  });
}

export async function regenerateDeliveryOtp(
  token: string,
  orderId: string
): Promise<{ status: string; message: string; delivery_otp: DeliveryOtpInfo }> {
  return request<{ status: string; message: string; delivery_otp: DeliveryOtpInfo }>(
    `/api/v1/orders/${orderId}/regenerate-otp`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }
  );
}

export async function fetchOrderById(token: string, orderId: string): Promise<OrderResponse> {
  return request<OrderResponse>(`/api/v1/orders/${orderId}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function fetchOrderInvoice(
  token: string,
  orderId: string
): Promise<InvoiceResponse> {
  return request<InvoiceResponse>(`/api/v1/orders/${orderId}/invoice`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export async function downloadOrderInvoiceBlob(
  token: string,
  orderId: string,
  download: boolean = false
): Promise<{ blob: Blob; filename: string }> {
  const url = `${API_BASE}/api/v1/orders/${orderId}/invoice/download${download ? '?download=true' : ''}`;
  const resp = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) {
    let msg = 'Failed to retrieve invoice PDF.';
    try {
      const errJson = await resp.json();
      if (errJson.detail) msg = errJson.detail;
    } catch {}
    throw new Error(msg);
  }
  const disposition = resp.headers.get('content-disposition');
  let filename = `invoice_${orderId}.pdf`;
  if (disposition && disposition.includes('filename=')) {
    const match = disposition.match(/filename="?([^"]+)"?/);
    if (match && match[1]) filename = match[1];
  }
  const blob = await resp.blob();
  return { blob, filename };
}

export async function viewOrDownloadInvoice(
  token: string,
  orderId: string,
  action: 'view' | 'download' = 'view'
): Promise<void> {
  if (action === 'download') {
    const { blob, filename } = await downloadOrderInvoiceBlob(token, orderId, true);
    const pdfBlob = new Blob([blob], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    return;
  }

  // Action is 'view' (inline viewing in a new tab)
  // Pre-open blank tab synchronously in user click handler to avoid browser popup blockers
  let targetWindow: Window | null = null;
  try {
    targetWindow = window.open('about:blank', '_blank');
    if (targetWindow && !targetWindow.closed) {
      targetWindow.document.write(
        '<!DOCTYPE html><html><head><title>LOCOMART Invoice</title>' +
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
        '<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#F8FAFC;color:#334155;}' +
        '.box{text-align:center;padding:24px;background:#fff;border-radius:12px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);border:1px solid #E2E8F0;}' +
        '.spin{display:inline-block;width:28px;height:28px;border:3px solid #CBD5E1;border-top-color:#4F46E5;border-radius:50%;animation:sp 0.8s linear infinite;margin-bottom:12px;}' +
        '@keyframes sp{to{transform:rotate(360deg)}}' +
        '</style></head>' +
        '<body><div class="box"><div class="spin"></div><div style="font-weight:600;font-size:15px;">Loading Order Invoice...</div><div style="font-size:12px;color:#64748B;margin-top:4px;">Retrieving verified PDF from LOCOMART storage</div></div></body></html>'
      );
    }
  } catch {
    targetWindow = null;
  }

  try {
    const { blob } = await downloadOrderInvoiceBlob(token, orderId, false);
    const pdfBlob = new Blob([blob], { type: 'application/pdf' });
    const blobUrl = URL.createObjectURL(pdfBlob);

    if (targetWindow && !targetWindow.closed) {
      targetWindow.location.replace(blobUrl);
    } else {
      // Fallback if popup blocker prevented pre-opening
      const a = document.createElement('a');
      a.href = blobUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    // Revoke object URL after 2 minutes so user has plenty of time to view/print
    setTimeout(() => {
      try {
        URL.revokeObjectURL(blobUrl);
      } catch {}
    }, 120000);
  } catch (err) {
    if (targetWindow && !targetWindow.closed) {
      targetWindow.close();
    }
    throw err;
  }
}

export interface OrderListResponse {
  status: string;
  orders: OrderDetails[];
  count: number;
}

export async function fetchOrders(token: string): Promise<OrderListResponse> {
  return request<OrderListResponse>('/api/v1/orders', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export interface ShopkeeperOrder extends OrderDetails {
  raw_status?: string;
  payment_method?: string;
  payment_status?: string;
  refund_status?: string | null;
}

export async function fetchShopkeeperOrders(
  token: string,
  statusFilter?: string
): Promise<{ status: string; shop_id: string; count: number; orders: ShopkeeperOrder[] }> {
  const query = statusFilter && statusFilter !== 'ALL' ? `?status=${encodeURIComponent(statusFilter)}` : '';
  return request<{ status: string; shop_id: string; count: number; orders: ShopkeeperOrder[] }>(
    `/api/v1/shopkeeper/orders${query}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }
  );
}

export async function fetchShopkeeperOrderById(
  token: string,
  orderId: string
): Promise<{ status: string; order: ShopkeeperOrder }> {
  return request<{ status: string; order: ShopkeeperOrder }>(
    `/api/v1/shopkeeper/orders/${orderId}`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }
  );
}

export async function acceptShopkeeperOrder(
  token: string,
  orderId: string
): Promise<{ status: string; message: string; order: ShopkeeperOrder }> {
  return request<{ status: string; message: string; order: ShopkeeperOrder }>(
    `/api/v1/shopkeeper/orders/${orderId}/accept`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }
  );
}

export async function cancelShopkeeperOrder(
  token: string,
  orderId: string,
  reason: string
): Promise<{ status: string; message: string; order: ShopkeeperOrder }> {
  return request<{ status: string; message: string; order: ShopkeeperOrder }>(
    `/api/v1/shopkeeper/orders/${orderId}/cancel`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason }),
    }
  );
}

export async function prepareShopkeeperOrder(
  token: string,
  orderId: string
): Promise<{ status: string; message: string; order: ShopkeeperOrder }> {
  return request<{ status: string; message: string; order: ShopkeeperOrder }>(
    `/api/v1/shopkeeper/orders/${orderId}/prepare`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }
  );
}

export async function outForDeliveryShopkeeperOrder(
  token: string,
  orderId: string
): Promise<{ status: string; message: string; order: ShopkeeperOrder }> {
  return request<{ status: string; message: string; order: ShopkeeperOrder }>(
    `/api/v1/shopkeeper/orders/${orderId}/out-for-delivery`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }
  );
}

export interface StripeCheckoutSessionResponse {
  status: string;
  checkout_url: string;
  session_id: string;
  order_id: string;
  order?: OrderDetails;
}

export async function createStripeCheckoutSession(
  token: string,
  deliveryMethod: 'HAND_TO_CUSTOMER' | 'LEAVE_AT_DOOR' = 'HAND_TO_CUSTOMER',
  paymentMethod: 'ONLINE' = 'ONLINE'
): Promise<StripeCheckoutSessionResponse> {
  return request<StripeCheckoutSessionResponse>('/api/v1/checkout/stripe/create-session', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      delivery_method: deliveryMethod,
      payment_method: paymentMethod,
    }),
  });
}

export async function verifyShopkeeperDeliveryOtp(
  token: string,
  orderId: string,
  otp: string
): Promise<{ status: string; message: string; order: ShopkeeperOrder }> {
  return request<{ status: string; message: string; order: ShopkeeperOrder }>(
    `/api/v1/shopkeeper/orders/${orderId}/verify-delivery-otp`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ otp }),
    }
  );
}

export async function markDeliveredShopkeeperOrder(
  token: string,
  orderId: string
): Promise<{ status: string; message: string; order: ShopkeeperOrder }> {
  return request<{ status: string; message: string; order: ShopkeeperOrder }>(
    `/api/v1/shopkeeper/orders/${orderId}/mark-delivered`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }
  );
}

export async function syncStripeSession(
  token: string,
  orderId: string,
  sessionId?: string
): Promise<{ status: string; payment_status: string; order: OrderDetails }> {
  const query = sessionId ? `?session_id=${encodeURIComponent(sessionId)}` : '';
  return request<{ status: string; payment_status: string; order: OrderDetails }>(
    `/api/v1/orders/${orderId}/sync-stripe-session${query}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }
  );
}

export async function cancelStripeCheckout(
  token: string,
  orderId: string
): Promise<{ status: string; message: string; order?: OrderDetails }> {
  return request<{ status: string; message: string; order?: OrderDetails }>(
    `/api/v1/orders/${orderId}/cancel-checkout`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    }
  );
}




