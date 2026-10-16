export interface Category {
  id: number;
  name: string;
  slug: string;
  icon: string;
}

export interface Product {
  id: number;
  name: string;
  slug: string;
  description: string;
  price: number;
  stock: number;
  is_digital: boolean;
  digital_file_url?: string;
  weight_grams: number;
  image_url: string;
  category_id?: number;
  category_name?: string;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: number;
  order_id: number;
  product_id: number;
  product_name: string;
  price: number;
  quantity: number;
  is_digital: boolean;
  digital_file_url?: string;
}

export interface Order {
  id: number;
  user_id?: number;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  shipping_address: string;
  city: string;
  postal_code: string;
  total_amount: number;
  shipping_cost: number;
  grand_total: number;
  status: "pending" | "paid" | "processing" | "shipped" | "completed" | "cancelled";
  payment_method: "manual_transfer" | "qris" | "midtrans";
  payment_proof_url?: string;
  tracking_number?: string;
  is_digital_only: boolean;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
}

export interface BankAccount {
  bank_name: string;
  account_number: string;
  account_holder: string;
}

export interface PaymentMethods {
  manual_banks: BankAccount[];
  qris_image_url: string;
  midtrans_active: boolean;
  midtrans_client_key?: string;
}

export interface User {
  id: number;
  name: string;
  email: string;
  phone: string;
  role: "customer" | "admin";
  created_at: string;
}

const API_BASE = "";

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errorMsg = `Request failed: ${res.statusText}`;
    try {
      const text = await res.text();
      if (text) {
        const errJson = JSON.parse(text);
        errorMsg = errJson.message || errJson.error || errorMsg;
      }
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }

  const text = await res.text();
  if (!text || text.trim() === "") {
    return {} as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return {} as T;
  }
}

export const api = {
  // Products
  async getProducts(params?: { search?: string; category_slug?: string; is_digital?: string }) {
    const qs = new URLSearchParams();
    if (params?.search) qs.set("search", params.search);
    if (params?.category_slug) qs.set("category_slug", params.category_slug);
    if (params?.is_digital) qs.set("is_digital", params.is_digital);
    return request<{ products: Product[]; total: number }>(`/products?${qs.toString()}`);
  },

  async getProduct(identifier: string | number) {
    return request<Product>(`/products/${identifier}`);
  },

  async getCategories() {
    return request<{ categories: Category[] }>("/categories");
  },

  async createProduct(data: Partial<Product>) {
    return request<Product>("/products", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async deleteProduct(id: number) {
    return request<void>(`/products/${id}`, {
      method: "DELETE",
    });
  },

  // Orders
  async createOrder(data: {
    customer_name: string;
    customer_email: string;
    customer_phone: string;
    shipping_address?: string;
    city?: string;
    postal_code?: string;
    payment_method: string;
    items: { product_id: number; quantity: number }[];
  }) {
    return request<Order>("/orders", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async getOrder(id: number | string) {
    return request<Order>(`/orders/${id}`);
  },

  async getOrders() {
    return request<{ orders: Order[] }>("/orders");
  },

  async uploadProof(orderId: number, proofUrl: string) {
    return request<void>(`/orders/${orderId}/proof`, {
      method: "POST",
      body: JSON.stringify({ proof_url: proofUrl }),
    });
  },

  async uploadProofFile(orderId: number, data: { data: string; file_name: string }) {
    return request<{ proof_url: string; file_name: string }>(`/orders/${orderId}/upload-proof`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async updateOrderStatus(orderId: number, status: string, trackingNumber?: string) {
    return request<void>(`/orders/${orderId}/status`, {
      method: "POST",
      body: JSON.stringify({ status, tracking_number: trackingNumber }),
    });
  },

  // Payments
  async getPaymentMethods() {
    return request<PaymentMethods>("/payment/methods");
  },

  async createSnapToken(data: {
    order_id: number;
    gross_amount: number;
    customer_name: string;
    customer_email: string;
  }) {
    return request<{ token: string; redirect_url: string }>("/payment/midtrans/token", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async confirmManualPayment(orderId: number, amount: number, transactionId: string) {
    return request<void>("/payment/manual/confirm", {
      method: "POST",
      body: JSON.stringify({ order_id: orderId, amount, transaction_id: transactionId }),
    });
  },

  // Auth
  async register(data: { name: string; email: string; password: string; phone?: string; admin_key?: string }) {
    return request<{ token: string; user: User }>("/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async login(data: { email: string; password: string }) {
    return request<{ token: string; user: User }>("/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async adminLogin(data?: { email?: string; password?: string }) {
    return request<{ token: string; user: User }>("/auth/admin-login", {
      method: "POST",
      body: JSON.stringify(data || {}),
    });
  },

  async googleLogin(data: { email: string; name?: string; credential?: string }) {
    return request<{ token: string; user: User }>("/auth/google", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async getMe() {
    return request<User>("/auth/me");
  },

  // CMS & Admin Management
  async updateProduct(id: number, data: Partial<Product>) {
    return request<Product>(`/products/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  async setStock(id: number, stock: number) {
    return request<void>(`/products/${id}/stock`, {
      method: "POST",
      body: JSON.stringify({ stock }),
    });
  },

  async getProductStats() {
    return request<{
      total_products: number;
      out_of_stock_count: number;
      low_stock_count: number;
      digital_count: number;
      physical_count: number;
    }>("/admin/product-stats");
  },

  async getAdminDashboard() {
    return request<{
      total_revenue: number;
      today_revenue: number;
      this_month_revenue: number;
      pending_revenue: number;
      total_orders: number;
      pending_orders: number;
      paid_orders: number;
      shipped_orders: number;
      completed_orders: number;
      cancelled_orders: number;
      recent_orders: Order[];
      daily_revenue: { date: string; revenue: number; orders: number }[];
      payment_breakdown: { method: string; total: number; count: number }[];
    }>("/admin/dashboard");
  },

  async getAdminFinance() {
    return request<{
      total_settled_revenue: number;
      total_pending_revenue: number;
      total_transactions: number;
      method_breakdown: { method: string; total: number; count: number }[];
      recent_transactions: {
        id: number;
        customer_name: string;
        customer_email: string;
        payment_method: string;
        amount: number;
        shipping_cost: number;
        status: string;
        proof_url?: string;
        created_at: string;
      }[];
    }>("/admin/finance");
  },

  async uploadProductImage(data: { file_name: string; content_type: string; data: string }) {
    return request<{ url: string; file_name: string }>("/upload/image", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async getAuthSettings() {
    return request<{ google_client_id: string; google_enabled: boolean }>("/auth/settings");
  },

  async updateAuthSettings(data: { google_client_id: string; google_enabled: boolean }) {
    return request<void>("/auth/settings", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
};


