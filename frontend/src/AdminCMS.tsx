import React, { useState, useEffect } from "react";
import { api, Product, Order, Category } from "./api";

interface AdminCMSProps {
  onBackToStore: () => void;
  userRole?: string;
}

export const AdminCMS: React.FC<AdminCMSProps> = ({ onBackToStore, userRole }) => {
  const [activeTab, setActiveTab] = useState<"dashboard" | "products" | "orders" | "finance">("dashboard");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Admin Auth State
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(userRole === "admin");
  const [adminEmail, setAdminEmail] = useState("admin@store.com");
  const [adminPassword, setAdminPassword] = useState("admin123");

  // Dashboard Data State
  const [dashData, setDashData] = useState<{
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
  } | null>(null);

  // Products State
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [isEditingProduct, setIsEditingProduct] = useState(false);
  const [isCreatingProduct, setIsCreatingProduct] = useState(false);

  // Product Form State
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPrice, setFormPrice] = useState<number>(0);
  const [formStock, setFormStock] = useState<number>(0);
  const [formIsDigital, setFormIsDigital] = useState(false);
  const [formDigitalUrl, setFormDigitalUrl] = useState("");
  const [formWeightGrams, setFormWeightGrams] = useState(500);
  const [formImageUrl, setFormImageUrl] = useState("");
  const [formCategoryId, setFormCategoryId] = useState<number | undefined>(undefined);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showManualUrl, setShowManualUrl] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Orders State
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>("all");
  const [orderSearch, setOrderSearch] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [trackingInput, setTrackingInput] = useState("");

  // Finance State
  const [financeData, setFinanceData] = useState<{
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
  } | null>(null);

  // Notification helper
  const showNotification = (msg: string, isErr = false) => {
    if (isErr) {
      setErrorMsg(msg);
      setTimeout(() => setErrorMsg(""), 5000);
    } else {
      setSuccessMsg(msg);
      setTimeout(() => setSuccessMsg(""), 4000);
    }
  };

  // Format IDR Currency
  const formatIDR = (num: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(num);
  };

  // Check login on mount
  useEffect(() => {
    const token = localStorage.getItem("token");
    if (token) {
      api.getMe()
        .then((user) => {
          if (user.role === "admin") {
            setIsAdminLoggedIn(true);
          }
        })
        .catch(() => {
          // not logged in
        });
    }
  }, []);

  // Fetch data on tab change
  useEffect(() => {
    if (!isAdminLoggedIn) return;
    if (activeTab === "dashboard") {
      fetchDashboard();
    } else if (activeTab === "products") {
      fetchProducts();
      fetchCategories();
    } else if (activeTab === "orders") {
      fetchOrders();
    } else if (activeTab === "finance") {
      fetchFinance();
    }
  }, [activeTab, isAdminLoggedIn]);

  const handleAdminLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    try {
      const res = await api.adminLogin({ email: adminEmail, password: adminPassword });
      localStorage.setItem("token", res.token);
      setIsAdminLoggedIn(true);
      showNotification("Selamat datang di Admin CMS!");
      fetchDashboard();
    } catch (err: any) {
      showNotification(err.message || "Gagal masuk admin", true);
    } finally {
      setLoading(false);
    }
  };

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const data = await api.getAdminDashboard();
      setDashData(data);
    } catch (err: any) {
      showNotification(err.message || "Gagal memuat dashboard", true);
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const data = await api.getProducts();
      setProducts(data.products || []);
    } catch (err: any) {
      showNotification(err.message || "Gagal memuat produk", true);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const data = await api.getCategories();
      setCategories(data.categories || []);
    } catch {
      // ignore
    }
  };

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const data = await api.getOrders();
      setOrders(data.orders || []);
    } catch (err: any) {
      showNotification(err.message || "Gagal memuat order", true);
    } finally {
      setLoading(false);
    }
  };

  const fetchFinance = async () => {
    setLoading(true);
    try {
      const data = await api.getAdminFinance();
      setFinanceData(data);
    } catch (err: any) {
      showNotification(err.message || "Gagal memuat data keuangan", true);
    } finally {
      setLoading(false);
    }
  };

  // Stock quick adjustment
  const handleQuickStock = async (product: Product, delta: number) => {
    const nextStock = Math.max(0, product.stock + delta);
    try {
      await api.setStock(product.id, nextStock);
      setProducts((prev) =>
        prev.map((p) => (p.id === product.id ? { ...p, stock: nextStock } : p))
      );
      showNotification(`Stok ${product.name} diperbarui ke ${nextStock}`);
    } catch (err: any) {
      showNotification(err.message || "Gagal update stok", true);
    }
  };

  // Open edit modal
  const openEditModal = (p: Product) => {
    setSelectedProduct(p);
    setFormName(p.name);
    setFormDescription(p.description);
    setFormPrice(p.price);
    setFormStock(p.stock);
    setFormIsDigital(p.is_digital);
    setFormDigitalUrl(p.digital_file_url || "");
    setFormWeightGrams(p.weight_grams);
    setFormImageUrl(p.image_url);
    setFormCategoryId(p.category_id);
    setIsEditingProduct(true);
  };

  // Open create modal
  const openCreateModal = () => {
    setSelectedProduct(null);
    setFormName("");
    setFormDescription("");
    setFormPrice(100000);
    setFormStock(10);
    setFormIsDigital(false);
    setFormDigitalUrl("");
    setFormWeightGrams(500);
    setFormImageUrl("https://images.unsplash.com/photo-1546868871-7041f2a55e12?auto=format&fit=crop&w=800&q=80");
    setFormCategoryId(categories[0]?.id || 1);
    setIsCreatingProduct(true);
  };

  const handleImageFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showNotification("Format file harus berupa gambar (JPG, PNG, WebP, GIF)", true);
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      showNotification("Ukuran file maksimal 10MB", true);
      return;
    }

    setUploadingImage(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = reader.result as string;
          const res = await api.uploadProductImage({
            file_name: file.name,
            content_type: file.type || "image/jpeg",
            data: base64Data,
          });
          setFormImageUrl(res.url);
          showNotification("Gambar produk berhasil di-upload ke bucket!");
        } catch (err: any) {
          showNotification(err.message || "Gagal meng-upload gambar ke bucket", true);
        } finally {
          setUploadingImage(false);
        }
      };
      reader.onerror = () => {
        showNotification("Gagal membaca file gambar", true);
        setUploadingImage(false);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      showNotification(err.message || "Gagal upload", true);
      setUploadingImage(false);
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || formPrice <= 0) {
      showNotification("Nama dan harga produk harus valid", true);
      return;
    }

    setLoading(true);
    const payload = {
      name: formName,
      description: formDescription,
      price: formPrice,
      stock: formStock,
      is_digital: formIsDigital,
      digital_file_url: formDigitalUrl,
      weight_grams: formWeightGrams,
      image_url: formImageUrl,
      category_id: formCategoryId,
    };

    try {
      if (isEditingProduct && selectedProduct) {
        await api.updateProduct(selectedProduct.id, payload);
        showNotification(`Produk "${formName}" berhasil diperbarui`);
        setIsEditingProduct(false);
      } else {
        await api.createProduct(payload);
        showNotification(`Produk baru "${formName}" berhasil ditambahkan`);
        setIsCreatingProduct(false);
      }
      fetchProducts();
    } catch (err: any) {
      showNotification(err.message || "Gagal menyimpan produk", true);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProduct = async (id: number, name: string) => {
    if (!window.confirm(`Apakah Anda yakin ingin menghapus produk "${name}"?`)) return;
    setLoading(true);
    try {
      await api.deleteProduct(id);
      showNotification(`Produk "${name}" telah dihapus`);
      fetchProducts();
    } catch (err: any) {
      showNotification(err.message || "Gagal menghapus produk", true);
    } finally {
      setLoading(false);
    }
  };

  // Update order status & tracking
  const handleUpdateOrderStatus = async (orderId: number, nextStatus: string, tracking?: string) => {
    try {
      await api.updateOrderStatus(orderId, nextStatus, tracking);
      showNotification(`Status Order #${orderId} diperbarui ke "${nextStatus}"`);
      fetchOrders();
      if (selectedOrder && selectedOrder.id === orderId) {
        setSelectedOrder((prev) => prev ? { ...prev, status: nextStatus as any, tracking_number: tracking || prev.tracking_number } : null);
      }
    } catch (err: any) {
      showNotification(err.message || "Gagal memperbarui status order", true);
    }
  };

  // Filtered lists
  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
      p.slug.toLowerCase().includes(productSearch.toLowerCase())
  );

  const filteredOrders = orders.filter((o) => {
    const matchStatus = orderStatusFilter === "all" || o.status === orderStatusFilter;
    const matchSearch =
      orderSearch === "" ||
      o.id.toString().includes(orderSearch) ||
      o.customer_name.toLowerCase().includes(orderSearch.toLowerCase()) ||
      o.customer_email.toLowerCase().includes(orderSearch.toLowerCase());
    return matchStatus && matchSearch;
  });

  // Calculate highest revenue point for chart normalization
  const maxDayRevenue = Math.max(...(dashData?.daily_revenue.map((d) => d.revenue) || [1000000]));

  // If not logged in as admin, show elegant Admin Login Gateway
  if (!isAdminLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center px-4 py-12">
        <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-xl p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
                ⚙️
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900">Portal CMS Toko</h1>
                <p className="text-xs text-slate-500">Akses Administrator Terverifikasi</p>
              </div>
            </div>
            <button
              onClick={onBackToStore}
              className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 font-medium bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg transition"
            >
              ← Ke Toko
            </button>
          </div>

          {errorMsg && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Email Administrator
              </label>
              <input
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                Password Admin
              </label>
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm shadow-md transition disabled:opacity-50"
            >
              {loading ? "Memverifikasi..." : "Masuk ke Panel CMS"}
            </button>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => handleAdminLogin()}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-medium rounded-xl border border-slate-200 transition"
              >
                ⚡ Masuk Cepat Mode Demo Admin (1-Klik)
              </button>
            </div>
          </form>

          <p className="mt-6 text-center text-xs text-slate-400">
            Kredensial Default: <span className="font-mono text-slate-600">admin@store.com</span> / <span className="font-mono text-slate-600">admin123</span>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Top Banner Navigation */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Left: Brand & Mode Badge */}
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-base shadow-sm">
                🛍️
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 tracking-tight">Supatman Store</span>
                  <span className="px-2 py-0.5 text-[10px] font-bold tracking-wider uppercase bg-blue-100 text-blue-700 rounded-full border border-blue-200">
                    CMS Admin
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">Pusat Kendali Toko & Keuangan</p>
              </div>
            </div>

            {/* Middle: Tab Navigation */}
            <nav className="hidden md:flex items-center space-x-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                onClick={() => setActiveTab("dashboard")}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition ${
                  activeTab === "dashboard"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                📊 Dashboard
              </button>
              <button
                onClick={() => setActiveTab("products")}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition ${
                  activeTab === "products"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                📦 Produk & Stok
              </button>
              <button
                onClick={() => setActiveTab("orders")}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition ${
                  activeTab === "orders"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                📑 Pesanan ({orders.length})
              </button>
              <button
                onClick={() => setActiveTab("finance")}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition ${
                  activeTab === "finance"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                💳 Keuangan
              </button>
            </nav>

            {/* Right: Actions */}
            <div className="flex items-center space-x-2">
              <button
                onClick={onBackToStore}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 transition flex items-center gap-1.5"
              >
                <span>🌐</span>
                <span className="hidden sm:inline">Lihat Toko Publik</span>
              </button>
              <button
                onClick={() => {
                  localStorage.removeItem("token");
                  setIsAdminLoggedIn(false);
                }}
                className="px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 rounded-lg transition"
              >
                Keluar
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation bar */}
        <div className="md:hidden flex border-t border-slate-100 px-2 py-1 bg-slate-50 overflow-x-auto space-x-1">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap ${
              activeTab === "dashboard" ? "bg-white text-blue-600 shadow-sm" : "text-slate-600"
            }`}
          >
            📊 Dashboard
          </button>
          <button
            onClick={() => setActiveTab("products")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap ${
              activeTab === "products" ? "bg-white text-blue-600 shadow-sm" : "text-slate-600"
            }`}
          >
            📦 Produk & Stok
          </button>
          <button
            onClick={() => setActiveTab("orders")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap ${
              activeTab === "orders" ? "bg-white text-blue-600 shadow-sm" : "text-slate-600"
            }`}
          >
            📑 Pesanan
          </button>
          <button
            onClick={() => setActiveTab("finance")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap ${
              activeTab === "finance" ? "bg-white text-blue-600 shadow-sm" : "text-slate-600"
            }`}
          >
            💳 Keuangan
          </button>
        </div>
      </header>

      {/* Toast Notification */}
      {successMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-xl shadow-xl text-xs font-semibold flex items-center gap-2 transition-all duration-200">
          <span>✓</span> {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="fixed bottom-6 right-6 z-50 bg-rose-600 text-white px-4 py-2.5 rounded-xl shadow-lg text-xs font-semibold flex items-center gap-2">
          <span>⚠</span> {errorMsg}
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* ======================= TAB: DASHBOARD ======================= */}
        {activeTab === "dashboard" && (
          <div className="space-y-8">
            {/* Top Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Stat 1: Total Omset */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Total Pendapatan
                  </span>
                  <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center text-sm">
                    💰
                  </span>
                </div>
                <div className="mt-3">
                  <div className="text-2xl font-bold text-slate-900 font-mono tracking-tight">
                    {formatIDR(dashData?.total_revenue || 0)}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                    <span>Hari ini:</span>
                    <span className="font-semibold text-emerald-600 font-mono">
                      {formatIDR(dashData?.today_revenue || 0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Stat 2: Total Pesanan */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Total Pesanan
                  </span>
                  <span className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center text-sm">
                    📑
                  </span>
                </div>
                <div className="mt-3">
                  <div className="text-2xl font-bold text-slate-900 font-mono tracking-tight">
                    {dashData?.total_orders || 0}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                    <span>Perlu diproses:</span>
                    <span className="font-semibold text-amber-600 font-mono">
                      {(dashData?.paid_orders || 0) + (dashData?.pending_orders || 0)} order
                    </span>
                  </div>
                </div>
              </div>

              {/* Stat 3: Bulan Ini */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Omset Bulan Ini
                  </span>
                  <span className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center text-sm">
                    📈
                  </span>
                </div>
                <div className="mt-3">
                  <div className="text-2xl font-bold text-slate-900 font-mono tracking-tight">
                    {formatIDR(dashData?.this_month_revenue || 0)}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                    <span>Pending:</span>
                    <span className="font-semibold text-slate-600 font-mono">
                      {formatIDR(dashData?.pending_revenue || 0)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Stat 4: Selesai & Berhasil */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Terkirim & Selesai
                  </span>
                  <span className="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center text-sm">
                    🚚
                  </span>
                </div>
                <div className="mt-3">
                  <div className="text-2xl font-bold text-slate-900 font-mono tracking-tight">
                    {(dashData?.shipped_orders || 0) + (dashData?.completed_orders || 0)}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                    <span>Dibatalkan:</span>
                    <span className="font-semibold text-rose-500 font-mono">
                      {dashData?.cancelled_orders || 0} order
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Daily Revenue Chart & Payment Methods */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Daily Sales Bar Chart */}
              <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-base font-bold text-slate-900">Tren Penjualan 7 Hari Terakhir</h2>
                    <p className="text-xs text-slate-500">Volume pendapatan harian yang telah terkonfirmasi lunas</p>
                  </div>
                  <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-lg font-medium">
                    Auto-Sync
                  </span>
                </div>

                <div className="h-48 flex items-end justify-between gap-2 sm:gap-4 pt-6 border-b border-slate-100 pb-2">
                  {dashData?.daily_revenue && dashData.daily_revenue.length > 0 ? (
                    dashData.daily_revenue.map((dp, idx) => {
                      const heightPercent = Math.max(10, Math.round((dp.revenue / maxDayRevenue) * 100));
                      return (
                        <div key={idx} className="flex-1 flex flex-col items-center gap-2 group relative">
                          {/* Tooltip on hover */}
                          <div className="opacity-0 group-hover:opacity-100 transition absolute -top-10 bg-slate-900 text-white text-[10px] py-1 px-2 rounded-lg pointer-events-none whitespace-nowrap z-20 font-mono">
                            {formatIDR(dp.revenue)} ({dp.orders} order)
                          </div>
                          <div className="w-full bg-slate-100 rounded-t-lg overflow-hidden flex items-end h-36">
                            <div
                              style={{ height: `${heightPercent}%` }}
                              className="w-full bg-blue-600 group-hover:bg-blue-500 transition-all rounded-t-lg"
                            />
                          </div>
                          <span className="text-[10px] font-mono text-slate-500 whitespace-nowrap">
                            {dp.date.slice(5)}
                          </span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="w-full text-center py-12 text-xs text-slate-400">
                      Belum ada rekapan transaksi harian
                    </div>
                  )}
                </div>
              </div>

              {/* Payment Methods Breakdown */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900 mb-1">Metode Pembayaran</h2>
                  <p className="text-xs text-slate-500 mb-5">Distribusi penerimaan dana berdasarkan gateway</p>

                  <div className="space-y-4">
                    {dashData?.payment_breakdown && dashData.payment_breakdown.length > 0 ? (
                      dashData.payment_breakdown.map((pm, i) => {
                        const totalRev = dashData.total_revenue || 1;
                        const pct = Math.round((pm.total / totalRev) * 100);
                        return (
                          <div key={i} className="space-y-1.5">
                            <div className="flex justify-between text-xs">
                              <span className="font-medium text-slate-700 capitalize">
                                {pm.method.replace("_", " ")}
                              </span>
                              <span className="font-mono font-semibold text-slate-900">
                                {formatIDR(pm.total)} ({pct}%)
                              </span>
                            </div>
                            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                style={{ width: `${pct}%` }}
                                className={`h-full rounded-full ${
                                  i === 0 ? "bg-blue-600" : i === 1 ? "bg-emerald-500" : "bg-purple-500"
                                }`}
                              />
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-xs text-slate-400 py-6 text-center">Belum ada data pembayaran</p>
                    )}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 mt-4">
                  <button
                    onClick={() => setActiveTab("finance")}
                    className="w-full py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold rounded-xl text-xs border border-slate-200 transition"
                  >
                    Buka Rincian Keuangan →
                  </button>
                </div>
              </div>
            </div>

            {/* Recent Orders in Dashboard */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Pesanan Masuk Terbaru</h2>
                  <p className="text-xs text-slate-500">10 transaksi terakhir yang membutuhkan perhatian</p>
                </div>
                <button
                  onClick={() => setActiveTab("orders")}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                >
                  Lihat Semua Pesanan →
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-3">Order ID</th>
                      <th className="py-3 px-3">Pelanggan</th>
                      <th className="py-3 px-3">Total Belanja</th>
                      <th className="py-3 px-3">Metode</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {dashData?.recent_orders && dashData.recent_orders.length > 0 ? (
                      dashData.recent_orders.map((ord) => (
                        <tr key={ord.id} className="hover:bg-slate-50/80 transition">
                          <td className="py-3 px-3 font-mono font-medium text-slate-900">#{ord.id}</td>
                          <td className="py-3 px-3">
                            <div className="font-semibold text-slate-800">{ord.customer_name}</div>
                            <div className="text-[11px] text-slate-400">{ord.customer_email}</div>
                          </td>
                          <td className="py-3 px-3 font-mono font-semibold text-slate-900">
                            {formatIDR(ord.grand_total)}
                          </td>
                          <td className="py-3 px-3 capitalize text-slate-600">{ord.payment_method.replace("_", " ")}</td>
                          <td className="py-3 px-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide capitalize ${
                                ord.status === "paid"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : ord.status === "shipped"
                                  ? "bg-purple-50 text-purple-700 border border-purple-200"
                                  : ord.status === "completed"
                                  ? "bg-blue-50 text-blue-700 border border-blue-200"
                                  : ord.status === "cancelled"
                                  ? "bg-rose-50 text-rose-700 border border-rose-200"
                                  : "bg-amber-50 text-amber-700 border border-amber-200"
                              }`}
                            >
                              {ord.status}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <button
                              onClick={() => {
                                setSelectedOrder(ord);
                                setActiveTab("orders");
                              }}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-[11px] transition"
                            >
                              Detail
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          Belum ada transaksi pesanan
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ======================= TAB: PRODUK & STOK ======================= */}
        {activeTab === "products" && (
          <div className="space-y-6">
            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <input
                  type="text"
                  placeholder="Cari produk / slug..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  className="w-full sm:w-72 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
                <span className="text-xs text-slate-500 font-mono whitespace-nowrap">
                  Total: {filteredProducts.length} Produk
                </span>
              </div>

              <button
                onClick={openCreateModal}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs shadow-sm transition flex items-center justify-center gap-1.5"
              >
                <span>+</span> Tambah Produk Baru
              </button>
            </div>

            {/* Products Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-3.5 px-4">Foto & Nama</th>
                      <th className="py-3.5 px-4">Kategori / Tipe</th>
                      <th className="py-3.5 px-4">Harga</th>
                      <th className="py-3.5 px-4">Stok & Quick Update</th>
                      <th className="py-3.5 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredProducts.length > 0 ? (
                      filteredProducts.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/70 transition">
                          {/* Image & Name */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center space-x-3">
                              <img
                                src={p.image_url}
                                alt={p.name}
                                className="w-12 h-12 rounded-xl object-cover border border-slate-200 bg-slate-100 flex-shrink-0"
                              />
                              <div>
                                <div className="font-bold text-slate-900 text-sm leading-snug">{p.name}</div>
                                <div className="text-[11px] text-slate-400 font-mono">/{p.slug}</div>
                              </div>
                            </div>
                          </td>

                          {/* Category & Type */}
                          <td className="py-3.5 px-4">
                            <div className="space-y-1">
                              <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md text-[11px] font-medium border border-slate-200">
                                {p.category_name || "Umum"}
                              </span>
                              <div>
                                {p.is_digital ? (
                                  <span className="text-[10px] font-semibold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                                    Digital Item
                                  </span>
                                ) : (
                                  <span className="text-[10px] font-semibold text-sky-600 bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">
                                    Fisik ({p.weight_grams}g)
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Price */}
                          <td className="py-3.5 px-4 font-mono font-bold text-slate-900">
                            {formatIDR(p.price)}
                          </td>

                          {/* Stock with quick +/- buttons */}
                          <td className="py-3.5 px-4">
                            {p.is_digital ? (
                              <span className="text-slate-400 text-xs font-medium">∞ (Unlimited)</span>
                            ) : (
                              <div className="flex items-center space-x-2">
                                <span
                                  className={`font-mono font-bold px-2 py-0.5 rounded text-xs ${
                                    p.stock === 0
                                      ? "bg-rose-50 text-rose-700 border border-rose-200"
                                      : p.stock <= 5
                                      ? "bg-amber-50 text-amber-700 border border-amber-200"
                                      : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  }`}
                                >
                                  {p.stock}
                                </span>
                                <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white shadow-xs">
                                  <button
                                    onClick={() => handleQuickStock(p, -1)}
                                    title="Kurangi 1"
                                    className="px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold border-r border-slate-200"
                                  >
                                    -
                                  </button>
                                  <button
                                    onClick={() => handleQuickStock(p, 1)}
                                    title="Tambah 1"
                                    className="px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold border-r border-slate-200"
                                  >
                                    +
                                  </button>
                                  <button
                                    onClick={() => handleQuickStock(p, 10)}
                                    title="Restock +10"
                                    className="px-2 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 text-[10px] font-semibold"
                                  >
                                    +10
                                  </button>
                                </div>
                              </div>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end space-x-2">
                              <button
                                onClick={() => openEditModal(p)}
                                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteProduct(p.id, p.name)}
                                className="px-3 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 font-semibold rounded-lg text-xs transition"
                              >
                                Hapus
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-slate-400">
                          Tidak ada produk yang cocok dengan pencarian
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ======================= TAB: PESANAN (ORDERS) ======================= */}
        {activeTab === "orders" && (
          <div className="space-y-6">
            {/* Filter and Search Bar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <input
                  type="text"
                  placeholder="Cari no order, nama pelanggan, email..."
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  className="w-full sm:w-80 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />

                <span className="text-xs text-slate-500 font-mono">
                  Menampilkan {filteredOrders.length} dari {orders.length} pesanan
                </span>
              </div>

              {/* Status Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                {[
                  { key: "all", label: "Semua" },
                  { key: "pending", label: "Menunggu Bayar" },
                  { key: "paid", label: "Perlu Diproses" },
                  { key: "shipped", label: "Sedang Dikirim" },
                  { key: "completed", label: "Selesai" },
                  { key: "cancelled", label: "Dibatalkan" },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setOrderStatusFilter(tab.key)}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition whitespace-nowrap ${
                      orderStatusFilter === tab.key
                        ? "bg-blue-600 text-white shadow-sm"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Orders List Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-3.5 px-4">Order ID & Waktu</th>
                      <th className="py-3.5 px-4">Pelanggan</th>
                      <th className="py-3.5 px-4">Alamat Pengiriman</th>
                      <th className="py-3.5 px-4">Total & Metode</th>
                      <th className="py-3.5 px-4">Status & Resi</th>
                      <th className="py-3.5 px-4 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOrders.length > 0 ? (
                      filteredOrders.map((ord) => (
                        <tr key={ord.id} className="hover:bg-slate-50/70 transition">
                          {/* Order ID & Time */}
                          <td className="py-3.5 px-4">
                            <div className="font-mono font-bold text-slate-900 text-sm">#{ord.id}</div>
                            <div className="text-[11px] text-slate-400">
                              {new Date(ord.created_at).toLocaleDateString("id-ID", {
                                day: "numeric",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          </td>

                          {/* Customer */}
                          <td className="py-3.5 px-4">
                            <div className="font-semibold text-slate-900">{ord.customer_name}</div>
                            <div className="text-[11px] text-slate-500">{ord.customer_email}</div>
                            <div className="text-[11px] text-slate-400 font-mono">{ord.customer_phone}</div>
                          </td>

                          {/* Address */}
                          <td className="py-3.5 px-4 max-w-xs">
                            {ord.is_digital_only ? (
                              <span className="text-[11px] text-purple-600 bg-purple-50 px-2 py-0.5 rounded font-medium border border-purple-200">
                                Digital Download Unlock
                              </span>
                            ) : (
                              <div className="text-slate-600 text-[11px] truncate" title={ord.shipping_address}>
                                {ord.city ? `${ord.city}, ` : ""}
                                {ord.shipping_address}
                              </div>
                            )}
                          </td>

                          {/* Total & Payment */}
                          <td className="py-3.5 px-4">
                            <div className="font-mono font-bold text-slate-900">{formatIDR(ord.grand_total)}</div>
                            <div className="text-[10px] text-slate-500 uppercase tracking-wide">
                              {ord.payment_method.replace("_", " ")}
                            </div>
                            {ord.payment_proof_url && (
                              <a
                                href={ord.payment_proof_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-block mt-1 text-[10px] text-blue-600 font-semibold hover:underline"
                              >
                                [Lihat Bukti Bayar]
                              </a>
                            )}
                          </td>

                          {/* Status & Tracking */}
                          <td className="py-3.5 px-4">
                            <div className="space-y-1">
                              <select
                                value={ord.status}
                                onChange={(e) => handleUpdateOrderStatus(ord.id, e.target.value)}
                                className={`text-[11px] font-semibold rounded-lg px-2 py-1 border focus:outline-none ${
                                  ord.status === "paid"
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-300"
                                    : ord.status === "shipped"
                                    ? "bg-purple-50 text-purple-700 border-purple-300"
                                    : ord.status === "completed"
                                    ? "bg-blue-50 text-blue-700 border-blue-300"
                                    : ord.status === "cancelled"
                                    ? "bg-rose-50 text-rose-700 border-rose-300"
                                    : "bg-amber-50 text-amber-700 border-amber-300"
                                }`}
                              >
                                <option value="pending">pending (Menunggu)</option>
                                <option value="paid">paid (Lunas)</option>
                                <option value="processing">processing (Diproses)</option>
                                <option value="shipped">shipped (Dikirim)</option>
                                <option value="completed">completed (Selesai)</option>
                                <option value="cancelled">cancelled (Batal)</option>
                              </select>

                              {ord.tracking_number ? (
                                <div className="text-[10px] font-mono text-slate-500">
                                  Resi: <span className="font-bold text-slate-700">{ord.tracking_number}</span>
                                </div>
                              ) : null}
                            </div>
                          </td>

                          {/* Action Button */}
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => {
                                setSelectedOrder(ord);
                                setTrackingInput(ord.tracking_number || "");
                              }}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition"
                            >
                              Kelola Resi & Detail
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-slate-400">
                          Tidak ada pesanan pada filter ini
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ======================= TAB: KEUANGAN (FINANCE) ======================= */}
        {activeTab === "finance" && (
          <div className="space-y-6">
            {/* Top Revenue Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Total Dana Masuk Bersih
                </span>
                <div className="mt-2 text-2xl font-bold text-emerald-600 font-mono">
                  {formatIDR(financeData?.total_settled_revenue || 0)}
                </div>
                <p className="mt-1 text-xs text-slate-400">Telah diverifikasi & lunas</p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Total Tagihan Pending
                </span>
                <div className="mt-2 text-2xl font-bold text-amber-600 font-mono">
                  {formatIDR(financeData?.total_pending_revenue || 0)}
                </div>
                <p className="mt-1 text-xs text-slate-400">Menunggu pembayaran pelanggan</p>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Jumlah Transaksi Sukses
                </span>
                <div className="mt-2 text-2xl font-bold text-slate-900 font-mono">
                  {financeData?.total_transactions || 0} Trx
                </div>
                <p className="mt-1 text-xs text-slate-400">Tercatat di sistem</p>
              </div>
            </div>

            {/* Methods Breakdown Box */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <h2 className="text-base font-bold text-slate-900 mb-1">Rincian Per Saluran Pembayaran</h2>
              <p className="text-xs text-slate-500 mb-6">Rekapitulasi total dana berdasarkan metode transfer / QRIS</p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {financeData?.method_breakdown && financeData.method_breakdown.length > 0 ? (
                  financeData.method_breakdown.map((mb, i) => (
                    <div key={i} className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="text-xs font-semibold text-slate-600 uppercase tracking-wider capitalize">
                        {mb.method.replace("_", " ")}
                      </div>
                      <div className="text-lg font-bold text-slate-900 font-mono mt-2">
                        {formatIDR(mb.total)}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">{mb.count} kali transaksi</div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400">Belum ada transaksi</p>
                )}
              </div>
            </div>

            {/* Ledger Transactions Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <h2 className="text-base font-bold text-slate-900 mb-1">Buku Kas & Riwayat Transaksi</h2>
              <p className="text-xs text-slate-500 mb-4">Catatan penerimaan uang per order</p>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="py-3 px-3">Order #</th>
                      <th className="py-3 px-3">Tanggal</th>
                      <th className="py-3 px-3">Pembeli</th>
                      <th className="py-3 px-3">Metode</th>
                      <th className="py-3 px-3">Nominal Masuk</th>
                      <th className="py-3 px-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {financeData?.recent_transactions && financeData.recent_transactions.length > 0 ? (
                      financeData.recent_transactions.map((tx) => (
                        <tr key={tx.id} className="hover:bg-slate-50/70 transition">
                          <td className="py-3 px-3 font-mono font-bold text-slate-900">#{tx.id}</td>
                          <td className="py-3 px-3 text-slate-500">
                            {new Date(tx.created_at).toLocaleDateString("id-ID", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })}
                          </td>
                          <td className="py-3 px-3">
                            <div className="font-semibold text-slate-800">{tx.customer_name}</div>
                            <div className="text-[11px] text-slate-400">{tx.customer_email}</div>
                          </td>
                          <td className="py-3 px-3 capitalize font-medium text-slate-700">
                            {tx.payment_method.replace("_", " ")}
                          </td>
                          <td className="py-3 px-3 font-mono font-bold text-slate-900">
                            {formatIDR(tx.amount)}
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold capitalize ${
                                tx.status === "paid" || tx.status === "completed"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-amber-50 text-amber-700"
                              }`}
                            >
                              {tx.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          Belum ada catatan kas
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ======================= MODAL: EDIT / CREATE PRODUCT ======================= */}
      {(isEditingProduct || isCreatingProduct) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-900">
                {isEditingProduct ? "Edit Informasi Produk" : "Tambah Produk Baru"}
              </h2>
              <button
                onClick={() => {
                  setIsEditingProduct(false);
                  setIsCreatingProduct(false);
                }}
                className="text-slate-400 hover:text-slate-700 text-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Nama Produk
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Contoh: Mechanical Keyboard TKL"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Deskripsi Lengkap
                </label>
                <textarea
                  rows={3}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Deskripsi fitur, keunggulan, spesifikasi teknis..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Harga (IDR)
                  </label>
                  <input
                    type="number"
                    min="1000"
                    step="1000"
                    required
                    value={formPrice}
                    onChange={(e) => setFormPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Kategori
                  </label>
                  <select
                    value={formCategoryId || ""}
                    onChange={(e) => setFormCategoryId(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Stok Tersedia
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formStock}
                    onChange={(e) => setFormStock(Number(e.target.value))}
                    disabled={formIsDigital}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    Berat (Gram)
                  </label>
                  <input
                    type="number"
                    min="10"
                    value={formWeightGrams}
                    onChange={(e) => setFormWeightGrams(Number(e.target.value))}
                    disabled={formIsDigital}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-slate-100 disabled:text-slate-400"
                  />
                </div>
              </div>

              {/* Digital Checkbox */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formIsDigital}
                    onChange={(e) => setFormIsDigital(e.target.checked)}
                    className="rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-xs font-semibold text-slate-800">
                    Produk Digital (Download Instan, Bebas Ongkos Kirim)
                  </span>
                </label>
                {formIsDigital && (
                  <div className="mt-2.5">
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">
                      URL File Download
                    </label>
                    <input
                      type="url"
                      value={formDigitalUrl}
                      onChange={(e) => setFormDigitalUrl(e.target.value)}
                      placeholder="https://drive.google.com/... atau https://cdn.../file.zip"
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Product Image Upload Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                    Foto Produk (Bucket Storage)
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowManualUrl(!showManualUrl)}
                    className="text-[11px] font-semibold text-blue-600 hover:text-blue-800"
                  >
                    {showManualUrl ? "← Gunakan Upload File" : "Tulis URL Manual"}
                  </button>
                </div>

                {/* Hidden File Input */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageFileSelect}
                  accept="image/png, image/jpeg, image/webp, image/gif"
                  className="hidden"
                />

                {!showManualUrl ? (
                  <div className="space-y-3">
                    {/* Preview Area if Image Exists */}
                    {formImageUrl ? (
                      <div className="flex items-center gap-4 p-3.5 bg-slate-50 border border-slate-200 rounded-2xl">
                        <img
                          src={formImageUrl}
                          alt="Preview Produk"
                          className="w-16 h-16 rounded-xl object-cover border border-slate-200 bg-white shadow-xs flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                            <span>✓</span>
                            <span>Foto Siap Digunakan</span>
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono truncate mt-0.5" title={formImageUrl}>
                            {formImageUrl}
                          </div>
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              type="button"
                              onClick={() => fileInputRef.current?.click()}
                              disabled={uploadingImage}
                              className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 font-semibold rounded-lg text-[11px] border border-slate-200 shadow-xs transition"
                            >
                              Ganti Foto
                            </button>
                            <button
                              type="button"
                              onClick={() => setFormImageUrl("")}
                              className="px-2.5 py-1 text-rose-600 hover:bg-rose-50 font-semibold rounded-lg text-[11px] transition"
                            >
                              Hapus
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Drag & Drop / Click to Upload Box */
                      <div
                        onClick={() => fileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                          uploadingImage
                            ? "border-blue-400 bg-blue-50/50"
                            : "border-slate-300 hover:border-blue-500 bg-slate-50/70 hover:bg-blue-50/30"
                        }`}
                      >
                        {uploadingImage ? (
                          <div className="flex flex-col items-center justify-center py-2">
                            <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mb-2" />
                            <p className="text-xs font-bold text-blue-700">Mengunggah ke Bucket Storage...</p>
                            <p className="text-[11px] text-slate-400 mt-0.5">Memproses dan menyimpan file secara cloud</p>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center">
                            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center text-lg mb-2 shadow-xs">
                              📸
                            </div>
                            <p className="text-xs font-bold text-slate-800">
                              Klik untuk Upload Foto dari Komputer
                            </p>
                            <p className="text-[11px] text-slate-500 mt-1">
                              File otomatis tersimpan di Encore Object Storage Bucket (PNG, JPG, WebP max 10MB)
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Manual URL fallback */
                  <div>
                    <input
                      type="url"
                      required
                      value={formImageUrl}
                      onChange={(e) => setFormImageUrl(e.target.value)}
                      placeholder="https://images.unsplash.com/... atau https://cdn.../foto.jpg"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      Masukkan URL gambar publik langsung jika tidak ingin meng-upload file baru.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingProduct(false);
                    setIsCreatingProduct(false);
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs shadow-md transition disabled:opacity-50"
                >
                  {loading ? "Menyimpan..." : "Simpan Produk"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================= MODAL: ORDER DETAIL & TRACKING ======================= */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Kelola Pesanan #{selectedOrder.id}
                </h2>
                <p className="text-xs text-slate-500">
                  {new Date(selectedOrder.created_at).toLocaleString("id-ID")}
                </p>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="text-slate-400 hover:text-slate-700 text-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 pt-4 text-xs">
              {/* Customer Box */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  Informasi Pembeli
                </div>
                <div className="font-bold text-slate-900 text-sm">{selectedOrder.customer_name}</div>
                <div className="text-slate-600">{selectedOrder.customer_email}</div>
                <div className="text-slate-600 font-mono">{selectedOrder.customer_phone}</div>
                {!selectedOrder.is_digital_only && (
                  <div className="text-slate-700 pt-1 border-t border-slate-200 mt-1">
                    <span className="font-semibold">Alamat Kirim: </span>
                    {selectedOrder.shipping_address}, {selectedOrder.city} ({selectedOrder.postal_code})
                  </div>
                )}
              </div>

              {/* Items List */}
              <div>
                <div className="font-semibold text-slate-800 mb-2">Daftar Produk:</div>
                <div className="space-y-2">
                  {selectedOrder.items && selectedOrder.items.length > 0 ? (
                    selectedOrder.items.map((item, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-200"
                      >
                        <div>
                          <div className="font-semibold text-slate-900">{item.product_name}</div>
                          <div className="text-[11px] text-slate-500">
                            {item.quantity} x {formatIDR(item.price)}
                          </div>
                        </div>
                        <div className="font-mono font-bold text-slate-900">
                          {formatIDR(item.price * item.quantity)}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-slate-400 py-2">Rincian item order #{selectedOrder.id}</div>
                  )}
                </div>
              </div>

              {/* Total Calculation */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Subtotal Barang:</span>
                  <span className="font-mono font-semibold">{formatIDR(selectedOrder.total_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Ongkos Kirim:</span>
                  <span className="font-mono font-semibold">{formatIDR(selectedOrder.shipping_cost)}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200 font-bold text-sm text-slate-900">
                  <span>Grand Total:</span>
                  <span className="font-mono text-blue-600">{formatIDR(selectedOrder.grand_total)}</span>
                </div>
              </div>

              {/* Resi Tracking Input */}
              {!selectedOrder.is_digital_only && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                    No. Resi Pengiriman (JNE / J&T / SiCepat)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={trackingInput}
                      onChange={(e) => setTrackingInput(e.target.value)}
                      placeholder="Contoh: JNE8892102919"
                      className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    />
                    <button
                      onClick={() => handleUpdateOrderStatus(selectedOrder.id, "shipped", trackingInput)}
                      className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-xl text-xs transition"
                    >
                      Simpan & Tandai Dikirim
                    </button>
                  </div>
                </div>
              )}

              {/* Quick Status Buttons */}
              <div className="pt-2 flex flex-wrap gap-2">
                {selectedOrder.status === "pending" && (
                  <button
                    onClick={() => handleUpdateOrderStatus(selectedOrder.id, "paid")}
                    className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs transition"
                  >
                    ✓ Konfirmasi Bayar Lunas
                  </button>
                )}
                {selectedOrder.status === "shipped" && (
                  <button
                    onClick={() => handleUpdateOrderStatus(selectedOrder.id, "completed")}
                    className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs transition"
                  >
                    ✓ Tandai Pesanan Selesai
                  </button>
                )}
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
