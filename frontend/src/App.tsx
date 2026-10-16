import React, { useState, useEffect } from "react";
import {
  api,
  Product,
  Category,
  Order,
  PaymentMethods,
  User,
} from "./api";
import { AdminCMS } from "./AdminCMS";
import {
  ShoppingBagIcon,
  XMarkIcon,
  PlusIcon,
  MinusIcon,
  TrashIcon,
  CheckCircleIcon,
  MagnifyingGlassIcon,
  ArrowDownTrayIcon,
  ShieldCheckIcon,
  TruckIcon,
  UserIcon,
  ArrowPathIcon,
  CubeIcon,
  DocumentArrowDownIcon,
  BanknotesIcon,
  QrCodeIcon,
  CreditCardIcon,
  ArrowRightIcon,
  EyeIcon,
  CheckBadgeIcon,
  ClockIcon,
  TagIcon,
} from "@heroicons/react/24/outline";

interface CartItem {
  product: Product;
  quantity: number;
}

export default function App() {
  const [viewMode, setViewMode] = useState<"store" | "cms">(() => {
    if (typeof window !== "undefined") {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      if (path === "/cms" || path.startsWith("/cms/") || hash === "#/cms" || hash === "#cms") {
        return "cms";
      }
    }
    return "store";
  });

  // Synchronize route changes between / and /cms
  useEffect(() => {
    const handleUrlChange = () => {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      if (path === "/cms" || path.startsWith("/cms/") || hash === "#/cms" || hash === "#cms") {
        setViewMode("cms");
      } else {
        setViewMode("store");
      }
    };

    window.addEventListener("popstate", handleUrlChange);
    window.addEventListener("hashchange", handleUrlChange);
    return () => {
      window.removeEventListener("popstate", handleUrlChange);
      window.removeEventListener("hashchange", handleUrlChange);
    };
  }, []);

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [digitalFilter, setDigitalFilter] = useState<string>("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Cart State
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem("cart");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isCartOpen, setIsCartOpen] = useState(false);

  // Product Detail Modal State
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [detailQuantity, setDetailQuantity] = useState(1);

  // Checkout State
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState({
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    shipping_address: "",
    city: "",
    postal_code: "",
    payment_method: "manual_transfer",
  });

  // Current Order / Tracking Modal
  const [activeOrder, setActiveOrder] = useState<Order | null>(null);
  const [trackingIdInput, setTrackingIdInput] = useState("");
  const [isTrackingModalOpen, setIsTrackingModalOpen] = useState(false);
  const [proofInput, setProofInput] = useState("");
  const [proofLoading, setProofLoading] = useState(false);

  // Payment Methods
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethods | null>(null);

  // Auth & Admin State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authForm, setAuthForm] = useState({ name: "", email: "", password: "", phone: "", admin_key: "" });
  const [googleLoading, setGoogleLoading] = useState(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [adminOrders, setAdminOrders] = useState<Order[]>([]);
  const [adminOrdersLoading, setAdminOrdersLoading] = useState(false);

  // New Product Modal
  const [newProductForm, setNewProductForm] = useState({
    name: "",
    description: "",
    price: 99000,
    stock: 20,
    is_digital: false,
    digital_file_url: "",
    weight_grams: 500,
    image_url: "",
  });

  useEffect(() => {
    localStorage.setItem("cart", JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    loadProducts();
    loadCategories();
    loadPaymentMethods();
    checkCurrentUser();
  }, [search, selectedCategory, digitalFilter]);

  // Handle ESC key for modal closing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsCartOpen(false);
        setDetailProduct(null);
        setIsCheckoutOpen(false);
        setIsTrackingModalOpen(false);
        setIsAuthModalOpen(false);
        setIsAdminPanelOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function triggerToast(message: string) {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3000);
  }

  async function loadProducts() {
    setLoading(true);
    try {
      const res = await api.getProducts({
        search: search || undefined,
        category_slug: selectedCategory || undefined,
        is_digital: digitalFilter || undefined,
      });
      setProducts(res.products || []);
    } catch (err) {
      console.error("Gagal memuat produk:", err);
    } finally {
      setLoading(false);
    }
  }

  async function loadCategories() {
    try {
      const res = await api.getCategories();
      setCategories(res.categories || []);
    } catch (err) {
      console.error("Gagal memuat kategori:", err);
    }
  }

  async function loadPaymentMethods() {
    try {
      const res = await api.getPaymentMethods();
      setPaymentMethods(res);
    } catch (err) {
      console.error("Gagal memuat metode pembayaran:", err);
    }
  }

  async function checkCurrentUser() {
    const token = localStorage.getItem("token");
    if (token) {
      try {
        const user = await api.getMe();
        setCurrentUser(user);
      } catch {
        localStorage.removeItem("token");
        setCurrentUser(null);
      }
    }
  }

  // Cart operations
  function addToCart(product: Product, quantity = 1, openDrawer = false) {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + quantity } : item
        );
      }
      return [...prev, { product, quantity }];
    });
    triggerToast(`"${product.name}" ditambahkan ke keranjang.`);
    if (openDrawer) {
      setIsCartOpen(true);
    }
  }

  function updateQuantity(productId: number, delta: number) {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  }

  function removeFromCart(productId: number) {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  }

  const hasPhysicalItems = cart.some((item) => !item.product.is_digital);
  const cartSubtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const shippingEstimate = hasPhysicalItems ? 15000 : 0;
  const cartGrandTotal = cartSubtotal + shippingEstimate;

  // Checkout handling
  async function handleCheckout(e: React.FormEvent) {
    e.preventDefault();
    if (cart.length === 0) return;

    setCheckoutLoading(true);
    try {
      const order = await api.createOrder({
        customer_name: checkoutForm.customer_name,
        customer_email: checkoutForm.customer_email,
        customer_phone: checkoutForm.customer_phone,
        shipping_address: hasPhysicalItems ? checkoutForm.shipping_address : undefined,
        city: hasPhysicalItems ? checkoutForm.city : undefined,
        postal_code: hasPhysicalItems ? checkoutForm.postal_code : undefined,
        payment_method: checkoutForm.payment_method,
        items: cart.map((i) => ({ product_id: i.product.id, quantity: i.quantity })),
      });

      // Clear cart
      setCart([]);
      setIsCheckoutOpen(false);
      setIsCartOpen(false);

      // Open order details modal
      setActiveOrder(order);
      setIsTrackingModalOpen(true);
    } catch (err: any) {
      alert(err.message || "Gagal membuat pesanan.");
    } finally {
      setCheckoutLoading(false);
    }
  }

  // Upload payment proof
  async function handleUploadProof(e: React.FormEvent) {
    e.preventDefault();
    if (!activeOrder || !proofInput) return;

    setProofLoading(true);
    try {
      await api.uploadProof(activeOrder.id, proofInput);
      alert("Bukti pembayaran berhasil diunggah! Penjual akan segera memverifikasi pesanan Anda.");
      const updated = await api.getOrder(activeOrder.id);
      setActiveOrder(updated);
      setProofInput("");
    } catch (err: any) {
      alert(err.message || "Gagal mengunggah bukti.");
    } finally {
      setProofLoading(false);
    }
  }

  // Search order by ID
  async function handleSearchOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!trackingIdInput.trim()) return;
    try {
      const order = await api.getOrder(trackingIdInput.trim());
      setActiveOrder(order);
    } catch {
      alert("Pesanan tidak ditemukan. Pastikan nomor ID pesanan benar.");
    }
  }

  // Auth Handling
  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (authMode === "login") {
        const res = await api.login({ email: authForm.email, password: authForm.password });
        localStorage.setItem("token", res.token);
        setCurrentUser(res.user);
      } else {
        const res = await api.register({
          name: authForm.name,
          email: authForm.email,
          password: authForm.password,
          phone: authForm.phone,
          admin_key: authForm.admin_key || undefined,
        });
        localStorage.setItem("token", res.token);
        setCurrentUser(res.user);
      }
      setIsAuthModalOpen(false);
      triggerToast(`Selamat datang, ${authMode === "login" ? "kembali!" : "akun berhasil dibuat!"}`);
    } catch (err: any) {
      alert(err.message || "Gagal otentikasi");
    }
  }

  // Google Sign-In
  async function handleGoogleSignIn() {
    setGoogleLoading(true);
    try {
      const settings = await api.getAuthSettings().catch(() => null);

      // Jika Google Client ID sudah disetting dan Google SDK aktif di window
      if (settings?.google_enabled && settings?.google_client_id && (window as any).google?.accounts?.id) {
        (window as any).google.accounts.id.initialize({
          client_id: settings.google_client_id,
          callback: async (response: any) => {
            try {
              const base64Url = response.credential.split(".")[1];
              const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
              const jsonPayload = decodeURIComponent(
                atob(base64)
                  .split("")
                  .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
                  .join("")
              );
              const payload = JSON.parse(jsonPayload);
              const res = await api.googleLogin({
                email: payload.email,
                name: payload.name || payload.email.split("@")[0],
                credential: response.credential,
              });
              localStorage.setItem("token", res.token);
              setCurrentUser(res.user);
              setIsAuthModalOpen(false);
              triggerToast(`Berhasil masuk dengan Google: ${res.user.email}`);
            } catch (err: any) {
              alert(err.message || "Gagal memproses login Google");
            }
          },
        });
        (window as any).google.accounts.id.prompt();
        setGoogleLoading(false);
        return;
      }

      // Fallback jika Google Client ID belum disetel di /cms > Pengaturan
      const emailInput = prompt(
        "Tips: Anda dapat memasang Google Client ID resmi di /cms > Pengaturan.\n\nMasukkan email Google Anda untuk masuk instan:",
        "user.google@gmail.com"
      );
      if (emailInput === null) {
        setGoogleLoading(false);
        return;
      }
      const email = emailInput.trim() || "user.google@gmail.com";
      const name = email.split("@")[0].replace(".", " ");

      const res = await api.googleLogin({
        email,
        name: name.charAt(0).toUpperCase() + name.slice(1),
      });

      localStorage.setItem("token", res.token);
      setCurrentUser(res.user);
      setIsAuthModalOpen(false);
      triggerToast(`Berhasil masuk dengan akun Google: ${res.user.email}`);
    } catch (err: any) {
      alert(err.message || "Gagal masuk dengan Google.");
    } finally {
      setGoogleLoading(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem("token");
    setCurrentUser(null);
    setIsAdminPanelOpen(false);
    triggerToast("Anda telah keluar dari akun.");
  }

  // Admin orders
  async function loadAdminOrders() {
    setAdminOrdersLoading(true);
    try {
      const res = await api.getOrders();
      setAdminOrders(res.orders || []);
    } catch (err) {
      console.error(err);
    } finally {
      setAdminOrdersLoading(false);
    }
  }

  async function handleCreateProduct(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.createProduct(newProductForm);
      triggerToast("Produk baru berhasil ditambahkan!");
      loadProducts();
      setNewProductForm({
        name: "",
        description: "",
        price: 99000,
        stock: 20,
        is_digital: false,
        digital_file_url: "",
        weight_grams: 500,
        image_url: "",
      });
    } catch (err: any) {
      alert(err.message || "Gagal menambah produk");
    }
  }

  async function handleUpdateStatus(orderId: number, status: string, trackingNum?: string) {
    try {
      await api.updateOrderStatus(orderId, status, trackingNum);
      triggerToast(`Status order #${orderId} diperbarui: ${status}`);
      loadAdminOrders();
      if (activeOrder && activeOrder.id === orderId) {
        const updated = await api.getOrder(orderId);
        setActiveOrder(updated);
      }
    } catch (err: any) {
      alert(err.message || "Gagal update status");
    }
  }

  function formatIDR(amount: number) {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(amount);
  }

  if (viewMode === "cms") {
    return (
      <AdminCMS
        onBackToStore={() => {
          window.history.pushState({}, "", "/");
          setViewMode("store");
        }}
        userRole={currentUser?.role}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#f8fafc] text-slate-900 antialiased">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-xl flex items-center gap-3 text-sm animate-fade-in border border-slate-800">
          <CheckCircleIcon className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          <span className="font-medium">{toastMessage}</span>
        </div>
      )}

      {/* Top Banner Promosi */}
      <div className="bg-slate-900 text-white py-2.5 px-4 text-xs font-medium text-center flex items-center justify-center gap-2">
        <span className="bg-blue-600 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded">
          Promo
        </span>
        <span>Gratis Ongkir Pulau Jawa untuk barang fisik &amp; Akses Unduhan Instan untuk aset digital!</span>
      </div>

      {/* Navigation Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-lg text-white shadow-sm">
              <CubeIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-xl tracking-tight text-slate-900">
                  SUPATMAN STORE
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                  Official
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">Hardware Setup &amp; Digital Assets</p>
            </div>
          </div>

          {/* Search Bar */}
          <div className="flex-1 max-w-md hidden md:block">
            <div className="relative">
              <label htmlFor="search-input" className="sr-only">Cari produk</label>
              <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                id="search-input"
                type="text"
                placeholder="Cari produk fisik atau digital..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all shadow-sm"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5">
            {/* Track Order Button */}
            <button
              onClick={() => setIsTrackingModalOpen(true)}
              className="text-xs font-semibold text-slate-700 hover:text-slate-900 px-3 py-2 rounded-xl hover:bg-slate-100 border border-slate-200 transition-all flex items-center gap-1.5"
            >
              <TruckIcon className="w-4 h-4 text-blue-600" />
              <span className="hidden sm:inline">Lacak Pesanan</span>
            </button>

            {/* Admin / Login Profile */}
            {currentUser ? (
              <div className="flex items-center gap-2">
                {currentUser.role === "admin" && (
                  <button
                    onClick={() => {
                      window.history.pushState({}, "", "/cms");
                      setViewMode("cms");
                    }}
                    className="text-xs font-bold px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-all flex items-center gap-1 shadow-xs"
                  >
                    <span>Admin Panel</span>
                  </button>
                )}
                <button
                  onClick={handleLogout}
                  title="Klik untuk Logout"
                  className="text-xs text-slate-500 hover:text-rose-600 px-2 py-1 font-medium transition-all"
                >
                  Keluar ({currentUser.name})
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setAuthMode("login");
                  setIsAuthModalOpen(true);
                }}
                className="text-xs font-semibold text-slate-700 hover:text-slate-900 px-3.5 py-2 rounded-xl hover:bg-slate-100 border border-slate-200 transition-all flex items-center gap-1.5"
              >
                <UserIcon className="w-4 h-4" />
                <span>Masuk / Daftar</span>
              </button>
            )}

            {/* Cart Button */}
            <button
              onClick={() => setIsCartOpen(true)}
              aria-label={`Buka keranjang belanja (${cart.reduce((t, i) => t + i.quantity, 0)} item)`}
              className="relative p-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all duration-150"
            >
              <ShoppingBagIcon className="w-5 h-5" />
              {cart.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white font-bold text-[10px] w-5 h-5 rounded-full flex items-center justify-center ring-2 ring-white">
                  {cart.reduce((total, i) => total + i.quantity, 0)}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Search */}
        <div className="px-4 pb-3 md:hidden">
          <div className="relative">
            <label htmlFor="search-input-mobile" className="sr-only">Cari produk mobile</label>
            <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              id="search-input-mobile"
              type="text"
              placeholder="Cari produk fisik atau digital..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-600"
            />
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        {/* Banner Hero yang Menarik */}
        <section className="relative rounded-3xl overflow-hidden mb-10 border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 p-8 sm:p-12 items-center">
            <div className="lg:col-span-7">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold mb-4">
                <TagIcon className="w-3.5 h-3.5" />
                <span>Koleksi Eksklusif Pilihan</span>
              </span>
              <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 leading-tight mb-4 tracking-tight">
                Peralatan Setup Kerja &amp; Aset Digital Terbaik
              </h1>
              <p className="text-slate-600 text-sm sm:text-base leading-relaxed mb-6">
                Tingkatkan produktivitas meja kerja Anda dengan hardware fisik berdesain minimalis serta akses langsung e-book dan template digital berkualitas tinggi.
              </p>

              {/* 3 Keunggulan */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-2.5 text-xs text-slate-700 font-medium">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                    <TruckIcon className="w-4 h-4" />
                  </div>
                  <span>Pengiriman Aman &amp; Lacak Resi</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs text-slate-700 font-medium">
                  <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0">
                    <ArrowDownTrayIcon className="w-4 h-4" />
                  </div>
                  <span>File Digital Instan Terbuka</span>
                </div>
                <div className="flex items-center gap-2.5 text-xs text-slate-700 font-medium">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                    <ShieldCheckIcon className="w-4 h-4" />
                  </div>
                  <span>Pembayaran Terverifikasi Otomatis</span>
                </div>
              </div>
            </div>

            {/* Banner Ilustrasi Visual */}
            <div className="lg:col-span-5 hidden lg:block">
              <div className="relative rounded-2xl overflow-hidden shadow-lg border border-slate-100 aspect-video lg:aspect-[4/3] bg-slate-100">
                <img
                  src="https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=800&q=80"
                  alt="Minimal Workspace Setup"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 via-transparent to-transparent flex items-end p-6">
                  <span className="text-xs font-semibold text-white bg-slate-900/80 px-3 py-1.5 rounded-lg backdrop-blur-md">
                    Inspirasi Setup Minimalis Modern
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Filter Bar */}
        <section className="flex flex-wrap items-center gap-2 mb-8" aria-label="Filter kategori">
          <button
            onClick={() => {
              setDigitalFilter("");
              setSelectedCategory("");
            }}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
              digitalFilter === "" && selectedCategory === ""
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-white text-slate-600 hover:text-slate-900 border border-slate-200"
            }`}
          >
            Semua Produk
          </button>
          <button
            onClick={() => setDigitalFilter("false")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              digitalFilter === "false"
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-white text-slate-600 hover:text-slate-900 border border-slate-200"
            }`}
          >
            <CubeIcon className="w-4 h-4" />
            <span>Barang Fisik</span>
          </button>
          <button
            onClick={() => setDigitalFilter("true")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              digitalFilter === "true"
                ? "bg-slate-900 text-white shadow-sm"
                : "bg-white text-slate-600 hover:text-slate-900 border border-slate-200"
            }`}
          >
            <DocumentArrowDownIcon className="w-4 h-4" />
            <span>Produk Digital</span>
          </button>

          {/* Categories */}
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCategory(selectedCategory === c.slug ? "" : c.slug)}
              className={`px-4 py-2 rounded-xl text-xs font-medium transition-all ${
                selectedCategory === c.slug
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-white text-slate-600 hover:text-slate-900 border border-slate-200"
              }`}
            >
              {c.name}
            </button>
          ))}
        </section>

        {/* Product Grid */}
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-500">
            <ArrowPathIcon className="w-7 h-7 animate-spin text-blue-600" />
            <p className="text-sm">Memuat katalog produk...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="py-20 text-center rounded-2xl border border-slate-200 bg-white p-8">
            <p className="text-slate-600 text-base mb-2">Tidak ada produk yang cocok dengan pencarian.</p>
            <button
              onClick={() => {
                setSearch("");
                setDigitalFilter("");
                setSelectedCategory("");
              }}
              className="text-xs text-blue-600 hover:underline font-semibold"
            >
              Reset filter pencarian
            </button>
          </div>
        ) : (
          <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {products.map((product) => (
              <div
                key={product.id}
                className="group surface-card rounded-2xl overflow-hidden flex flex-col justify-between bg-white border border-slate-200"
              >
                {/* Image Container */}
                <div
                  className="relative aspect-video sm:aspect-square w-full overflow-hidden bg-slate-100 cursor-pointer"
                  onClick={() => {
                    setDetailProduct(product);
                    setDetailQuantity(1);
                  }}
                >
                  <img
                    src={product.image_url || "https://images.unsplash.com/photo-1526738549149-8e07eca6c147?auto=format&fit=crop&w=600&q=80"}
                    alt={product.name}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  {/* Badge */}
                  <div className="absolute top-3 left-3 flex gap-2">
                    {product.is_digital ? (
                      <span className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-purple-700 text-white shadow-sm">
                        Digital
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-700 text-white shadow-sm">
                        Fisik
                      </span>
                    )}
                  </div>
                  {/* Quick Detail Hover Action */}
                  <div className="absolute inset-0 bg-slate-900/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="px-3.5 py-1.5 rounded-xl bg-white/95 text-slate-900 text-xs font-bold shadow-md flex items-center gap-1.5">
                      <EyeIcon className="w-4 h-4" /> Lihat Detail
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <h2
                      onClick={() => {
                        setDetailProduct(product);
                        setDetailQuantity(1);
                      }}
                      className="font-bold text-base text-slate-900 hover:text-blue-600 transition-colors line-clamp-1 mb-1 cursor-pointer"
                    >
                      {product.name}
                    </h2>
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed mb-4">
                      {product.description || "Produk berkualitas siap diproses."}
                    </p>
                  </div>

                  <div>
                    <div className="flex items-baseline justify-between mb-4">
                      <div>
                        <span className="text-[11px] text-slate-500 block font-medium">Harga</span>
                        <span className="text-lg font-bold text-slate-900 num-tabular">
                          {formatIDR(product.price)}
                        </span>
                      </div>
                      <span className="text-xs text-slate-500 font-medium">
                        {product.is_digital ? "Akses Langsung" : `Stok: ${product.stock}`}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => addToCart(product, 1, false)}
                        className="w-full py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-800 transition-all border border-slate-200"
                      >
                        + Keranjang
                      </button>
                      <button
                        onClick={() => {
                          addToCart(product, 1, false);
                          setIsCheckoutOpen(true);
                        }}
                        className="w-full py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white shadow-sm transition-all"
                      >
                        Beli Langsung
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </section>
        )}
      </main>

      {/* Product Detail Modal */}
      {detailProduct && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label={`Detail produk ${detailProduct.name}`}
        >
          <div className="bg-white border border-slate-200 rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl relative my-8">
            <button
              onClick={() => setDetailProduct(null)}
              aria-label="Tutup detail produk"
              className="absolute top-6 right-6 p-1.5 rounded-full text-slate-400 hover:text-slate-800 hover:bg-slate-100"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-start">
              {/* Image Preview */}
              <div className="rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 aspect-square">
                <img
                  src={detailProduct.image_url || "https://images.unsplash.com/photo-1526738549149-8e07eca6c147?auto=format&fit=crop&w=600&q=80"}
                  alt={detailProduct.name}
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Details & Specs */}
              <div className="flex flex-col justify-between h-full">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    {detailProduct.is_digital ? (
                      <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-700 border border-purple-200">
                        ⚡ Produk Digital
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700 border border-emerald-200">
                        📦 Barang Fisik
                      </span>
                    )}
                    {detailProduct.category_name && (
                      <span className="text-xs text-slate-500 font-medium">{detailProduct.category_name}</span>
                    )}
                  </div>

                  <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-2 leading-snug">
                    {detailProduct.name}
                  </h2>

                  <div className="text-2xl font-extrabold text-blue-600 mb-4 num-tabular">
                    {formatIDR(detailProduct.price)}
                  </div>

                  <p className="text-sm text-slate-600 leading-relaxed mb-6">
                    {detailProduct.description || "Produk resmi dengan garansi kualitas terbaik."}
                  </p>

                  {/* Spesifikasi Lengkap */}
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs space-y-2 mb-6">
                    <div className="flex justify-between py-1 border-b border-slate-200/80">
                      <span className="text-slate-500">Ketersediaan</span>
                      <span className="font-semibold text-slate-900">
                        {detailProduct.is_digital ? "Tersedia Selalu (Instant Download)" : `Tersedia (${detailProduct.stock} unit)`}
                      </span>
                    </div>
                    {!detailProduct.is_digital && (
                      <div className="flex justify-between py-1 border-b border-slate-200/80">
                        <span className="text-slate-500">Estimasi Berat</span>
                        <span className="font-semibold text-slate-900 num-tabular">{detailProduct.weight_grams} gram</span>
                      </div>
                    )}
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Garansi &amp; Layanan</span>
                      <span className="font-semibold text-emerald-600 flex items-center gap-1">
                        <CheckBadgeIcon className="w-4 h-4" /> 100% Produk Terverifikasi
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="space-y-3 pt-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-slate-600">Jumlah:</span>
                    <div className="flex items-center border border-slate-300 rounded-xl bg-slate-50">
                      <button
                        onClick={() => setDetailQuantity(Math.max(1, detailQuantity - 1))}
                        aria-label="Kurangi jumlah detail"
                        className="p-2 text-slate-600 hover:text-slate-900"
                      >
                        <MinusIcon className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-xs font-bold px-3 num-tabular">{detailQuantity}</span>
                      <button
                        onClick={() => setDetailQuantity(detailQuantity + 1)}
                        aria-label="Tambah jumlah detail"
                        className="p-2 text-slate-600 hover:text-slate-900"
                      >
                        <PlusIcon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <button
                      onClick={() => {
                        addToCart(detailProduct, detailQuantity, false);
                        setDetailProduct(null);
                      }}
                      className="py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-800 border border-slate-300 transition-all"
                    >
                      + Ke Keranjang
                    </button>
                    <button
                      onClick={() => {
                        addToCart(detailProduct, detailQuantity, false);
                        setDetailProduct(null);
                        setIsCheckoutOpen(true);
                      }}
                      className="py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white shadow-md transition-all"
                    >
                      Beli Sekarang
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cart Drawer */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true" aria-label="Keranjang Belanja">
          <div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity"
            onClick={() => setIsCartOpen(false)}
          />
          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md bg-white border-l border-slate-200 p-6 flex flex-col justify-between shadow-2xl">
              {/* Drawer Header */}
              <div>
                <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <ShoppingBagIcon className="w-5 h-5 text-blue-600" />
                    <h2 className="font-bold text-lg text-slate-900">Keranjang Belanja</h2>
                    <span className="text-xs bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded-full border border-blue-200">
                      {cart.reduce((t, i) => t + i.quantity, 0)} item
                    </span>
                  </div>
                  <button
                    onClick={() => setIsCartOpen(false)}
                    aria-label="Tutup keranjang"
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                  >
                    <XMarkIcon className="w-6 h-6" />
                  </button>
                </div>

                {/* Cart Items List */}
                <div className="mt-6 space-y-4 max-h-[55vh] overflow-y-auto pr-1">
                  {cart.length === 0 ? (
                    <div className="py-16 text-center text-slate-400">
                      <p>Keranjang Anda masih kosong.</p>
                    </div>
                  ) : (
                    cart.map(({ product, quantity }) => (
                      <div
                        key={product.id}
                        className="flex gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 items-center justify-between"
                      >
                        <img
                          src={product.image_url || "https://images.unsplash.com/photo-1526738549149-8e07eca6c147?auto=format&fit=crop&w=150&q=80"}
                          alt={product.name}
                          className="w-14 h-14 object-cover rounded-xl bg-slate-200 flex-shrink-0"
                        />
                        <div className="flex-1 min-w-0 px-2">
                          <h4 className="text-xs font-bold text-slate-900 truncate">{product.name}</h4>
                          <span className="text-xs text-blue-600 font-bold block mb-2 num-tabular">
                            {formatIDR(product.price)}
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => updateQuantity(product.id, -1)}
                              aria-label="Kurangi jumlah"
                              className="p-1 rounded bg-white hover:bg-slate-200 text-slate-600 border border-slate-200"
                            >
                              <MinusIcon className="w-3 h-3" />
                            </button>
                            <span className="text-xs font-bold px-2 num-tabular">{quantity}</span>
                            <button
                              onClick={() => updateQuantity(product.id, 1)}
                              aria-label="Tambah jumlah"
                              className="p-1 rounded bg-white hover:bg-slate-200 text-slate-600 border border-slate-200"
                            >
                              <PlusIcon className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        <button
                          onClick={() => removeFromCart(product.id)}
                          aria-label={`Hapus ${product.name} dari keranjang`}
                          className="p-2 text-slate-400 hover:text-rose-600 transition-colors"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Drawer Footer */}
              {cart.length > 0 && (
                <div className="border-t border-slate-200 pt-5 space-y-3">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Subtotal Produk</span>
                    <span className="text-slate-900 font-semibold num-tabular">{formatIDR(cartSubtotal)}</span>
                  </div>
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>Ongkos Kirim {hasPhysicalItems ? "(Flat Ekspedisi)" : "(Digital Free)"}</span>
                    <span className="text-slate-900 font-semibold num-tabular">{formatIDR(shippingEstimate)}</span>
                  </div>
                  <div className="flex justify-between text-base font-bold text-slate-900 pt-2 border-t border-slate-200">
                    <span>Total Pembayaran</span>
                    <span className="text-blue-600 num-tabular">{formatIDR(cartGrandTotal)}</span>
                  </div>

                  <button
                    onClick={() => {
                      setIsCartOpen(false);
                      setIsCheckoutOpen(true);
                    }}
                    className="w-full py-3.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-sm transition-all flex items-center justify-center gap-2"
                  >
                    <span>Lanjut ke Pembayaran</span>
                    <ArrowRightIcon className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Checkout Modal */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto" role="dialog" aria-modal="true" aria-label="Form Checkout">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative my-8">
            <button
              onClick={() => setIsCheckoutOpen(false)}
              aria-label="Tutup checkout"
              className="absolute top-6 right-6 text-slate-400 hover:text-slate-800"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>

            <h2 className="text-xl font-bold text-slate-900 mb-1">Informasi Pemesanan</h2>
            <p className="text-xs text-slate-500 mb-6">Lengkapi data kontak untuk proses konfirmasi pesanan.</p>

            <form onSubmit={handleCheckout} className="space-y-4">
              <div>
                <label htmlFor="customer-name" className="text-xs font-semibold text-slate-700 block mb-1">Nama Lengkap *</label>
                <input
                  id="customer-name"
                  type="text"
                  required
                  placeholder="Dedi Supatman"
                  value={checkoutForm.customer_name}
                  onChange={(e) => setCheckoutForm({ ...checkoutForm, customer_name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="customer-email" className="text-xs font-semibold text-slate-700 block mb-1">Email Aktif *</label>
                  <input
                    id="customer-email"
                    type="email"
                    required
                    placeholder="email@domain.com"
                    value={checkoutForm.customer_email}
                    onChange={(e) => setCheckoutForm({ ...checkoutForm, customer_email: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                  />
                </div>
                <div>
                  <label htmlFor="customer-phone" className="text-xs font-semibold text-slate-700 block mb-1">No. WhatsApp *</label>
                  <input
                    id="customer-phone"
                    type="tel"
                    required
                    placeholder="08123456789"
                    value={checkoutForm.customer_phone}
                    onChange={(e) => setCheckoutForm({ ...checkoutForm, customer_phone: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                  />
                </div>
              </div>

              {/* Physical shipping fields */}
              {hasPhysicalItems && (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <span className="text-xs font-bold text-blue-700 flex items-center gap-1.5">
                    <TruckIcon className="w-4 h-4" /> Alamat Pengiriman Barang Fisik
                  </span>
                  <div>
                    <label htmlFor="shipping-address" className="sr-only">Alamat Lengkap</label>
                    <input
                      id="shipping-address"
                      type="text"
                      required
                      placeholder="Alamat lengkap (Jalan, No. Rumah, RT/RW, Kelurahan, Kecamatan)"
                      value={checkoutForm.shipping_address}
                      onChange={(e) => setCheckoutForm({ ...checkoutForm, shipping_address: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-600"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="shipping-city" className="sr-only">Kota</label>
                      <input
                        id="shipping-city"
                        type="text"
                        required
                        placeholder="Kota / Kabupaten"
                        value={checkoutForm.city}
                        onChange={(e) => setCheckoutForm({ ...checkoutForm, city: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-600"
                      />
                    </div>
                    <div>
                      <label htmlFor="shipping-postal" className="sr-only">Kode Pos</label>
                      <input
                        id="shipping-postal"
                        type="text"
                        placeholder="Kode Pos"
                        value={checkoutForm.postal_code}
                        onChange={(e) => setCheckoutForm({ ...checkoutForm, postal_code: e.target.value })}
                        className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Payment Method Selector */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-2">Pilihan Pembayaran</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setCheckoutForm({ ...checkoutForm, payment_method: "manual_transfer" })}
                    className={`p-3 rounded-xl border text-left text-xs font-semibold transition-all flex flex-col gap-1 ${
                      checkoutForm.payment_method === "manual_transfer"
                        ? "border-blue-600 bg-blue-50 text-blue-800"
                        : "border-slate-200 bg-slate-50 text-slate-600"
                    }`}
                  >
                    <BanknotesIcon className="w-4 h-4 text-blue-600" />
                    <span>Transfer Bank</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCheckoutForm({ ...checkoutForm, payment_method: "qris" })}
                    className={`p-3 rounded-xl border text-left text-xs font-semibold transition-all flex flex-col gap-1 ${
                      checkoutForm.payment_method === "qris"
                        ? "border-blue-600 bg-blue-50 text-blue-800"
                        : "border-slate-200 bg-slate-50 text-slate-600"
                    }`}
                  >
                    <QrCodeIcon className="w-4 h-4 text-emerald-600" />
                    <span>QRIS Scan</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setCheckoutForm({ ...checkoutForm, payment_method: "midtrans" })}
                    className={`p-3 rounded-xl border text-left text-xs font-semibold transition-all flex flex-col gap-1 ${
                      checkoutForm.payment_method === "midtrans"
                        ? "border-blue-600 bg-blue-50 text-blue-800"
                        : "border-slate-200 bg-slate-50 text-slate-600"
                    }`}
                  >
                    <CreditCardIcon className="w-4 h-4 text-purple-600" />
                    <span>Midtrans</span>
                  </button>
                </div>
              </div>

              {/* Order Summary in Checkout */}
              <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-sm">
                <span className="text-slate-500">Total Tagihan:</span>
                <span className="font-extrabold text-blue-600 text-base num-tabular">{formatIDR(cartGrandTotal)}</span>
              </div>

              <button
                type="submit"
                disabled={checkoutLoading}
                className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-sm transition-all flex items-center justify-center gap-2"
              >
                {checkoutLoading ? (
                  <>
                    <ArrowPathIcon className="w-4 h-4 animate-spin" />
                    <span>Memproses Pesanan...</span>
                  </>
                ) : (
                  <span>Konfirmasi Pesanan</span>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Order Tracking Modal */}
      {isTrackingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto" role="dialog" aria-modal="true" aria-label="Pelacakan Pesanan">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-xl w-full p-6 sm:p-8 shadow-2xl relative my-8">
            <button
              onClick={() => setIsTrackingModalOpen(false)}
              aria-label="Tutup pelacakan"
              className="absolute top-6 right-6 text-slate-400 hover:text-slate-800"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>

            {/* Tracking Search Input */}
            <div className="mb-6">
              <h2 className="text-xl font-bold text-slate-900 mb-2">Detail &amp; Pelacakan Pesanan</h2>
              <form onSubmit={handleSearchOrder} className="flex gap-2">
                <label htmlFor="tracking-order-id" className="sr-only">ID Pesanan</label>
                <input
                  id="tracking-order-id"
                  type="text"
                  placeholder="Masukkan Nomor ID Pesanan (contoh: 1)"
                  value={trackingIdInput}
                  onChange={(e) => setTrackingIdInput(e.target.value)}
                  className="flex-1 bg-slate-50 border border-slate-300 rounded-xl px-4 py-2 text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-white rounded-xl transition-all"
                >
                  Cari Pesanan
                </button>
              </form>
            </div>

            {/* Active Order Details */}
            {activeOrder && (
              <div className="space-y-5 border-t border-slate-200 pt-5">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-500">Nomor Pesanan</span>
                    <h3 className="text-lg font-bold text-slate-900 num-tabular">#ORDER-{activeOrder.id}</h3>
                  </div>
                  <div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                        activeOrder.status === "paid" || activeOrder.status === "completed"
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                          : activeOrder.status === "shipped"
                          ? "bg-sky-100 text-sky-800 border border-sky-200"
                          : "bg-amber-100 text-amber-800 border border-amber-200"
                      }`}
                    >
                      {activeOrder.status}
                    </span>
                  </div>
                </div>

                {/* Items in order */}
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2">
                  <h4 className="text-xs font-bold text-slate-700">Rincian Produk</h4>
                  {activeOrder.items?.map((item) => (
                    <div key={item.id} className="flex justify-between items-center text-xs py-1.5 border-b border-slate-200 last:border-0">
                      <div>
                        <span className="font-semibold text-slate-900">{item.product_name}</span>
                        <span className="text-slate-500 ml-2 num-tabular">x{item.quantity}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-slate-700 num-tabular">{formatIDR(item.price * item.quantity)}</span>
                        {/* Digital Link if Paid */}
                        {item.is_digital && (activeOrder.status === "paid" || activeOrder.status === "completed") && (
                          <a
                            href={item.digital_file_url || "#"}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all"
                          >
                            <ArrowDownTrayIcon className="w-3.5 h-3.5" /> Unduh File
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between text-xs font-bold text-slate-900 pt-2">
                    <span>Total Tagihan:</span>
                    <span className="text-blue-600 text-sm num-tabular">{formatIDR(activeOrder.grand_total)}</span>
                  </div>
                </div>

                {/* Tracking info if shipped */}
                {activeOrder.tracking_number && (
                  <div className="p-4 rounded-2xl bg-sky-50 border border-sky-200 text-xs">
                    <span className="font-bold text-sky-800 block mb-1">Nomor Resi Ekspedisi:</span>
                    <span className="font-mono text-sm text-slate-900 select-all font-semibold">{activeOrder.tracking_number}</span>
                  </div>
                )}

                {/* Payment Instructions if Pending */}
                {activeOrder.status === "pending" && (
                  <div className="p-5 rounded-2xl bg-blue-50/50 border border-blue-200 space-y-4">
                    <h4 className="text-xs font-bold text-blue-900">
                      Instruksi Pembayaran ({activeOrder.payment_method})
                    </h4>

                    {activeOrder.payment_method === "manual_transfer" && paymentMethods?.manual_banks && (
                      <div className="space-y-2 text-xs">
                        <p className="text-slate-700">
                          Silakan transfer sejumlah <b className="text-slate-900 num-tabular">{formatIDR(activeOrder.grand_total)}</b> ke rekening:
                        </p>
                        {paymentMethods.manual_banks.map((b, idx) => (
                          <div key={idx} className="p-3 bg-white rounded-xl border border-slate-200 flex justify-between items-center shadow-sm">
                            <div>
                              <span className="font-bold text-slate-900 block">{b.bank_name}</span>
                              <span className="font-mono text-blue-600 text-sm select-all font-bold">{b.account_number}</span>
                              <span className="text-slate-500 block text-[11px]">a.n. {b.account_holder}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {activeOrder.payment_method === "qris" && paymentMethods?.qris_image_url && (
                      <div className="text-center space-y-2">
                        <p className="text-xs text-slate-700">Scan QRIS menggunakan mobile banking atau e-wallet:</p>
                        <img
                          src={paymentMethods.qris_image_url}
                          alt="QRIS Payment"
                          className="w-48 h-48 mx-auto rounded-xl border border-slate-200 p-2 bg-white shadow-sm"
                        />
                      </div>
                    )}

                    {/* Upload Proof */}
                    <form onSubmit={handleUploadProof} className="pt-2 border-t border-slate-200 space-y-2">
                      <label htmlFor="proof-url" className="text-xs font-semibold text-slate-700 block">
                        Sudah transfer? Masukkan URL link bukti transfer Anda:
                      </label>
                      <div className="flex gap-2">
                        <input
                          id="proof-url"
                          type="url"
                          required
                          placeholder="https://... atau link foto bukti"
                          value={proofInput}
                          onChange={(e) => setProofInput(e.target.value)}
                          className="flex-1 bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-blue-600"
                        />
                        <button
                          type="submit"
                          disabled={proofLoading}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white rounded-xl transition-all shadow-sm"
                        >
                          {proofLoading ? "Mengunggah..." : "Kirim Bukti"}
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Auth Modal (Login / Register / Google Sign-In) */}
      {isAuthModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Autentikasi Akun">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-sm w-full p-6 sm:p-8 shadow-2xl relative">
            <button
              onClick={() => setIsAuthModalOpen(false)}
              aria-label="Tutup form akun"
              className="absolute top-6 right-6 text-slate-400 hover:text-slate-800"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>

            <h2 className="text-xl font-bold text-slate-900 mb-1">
              {authMode === "login" ? "Masuk ke Akun" : "Daftar Akun Baru"}
            </h2>
            <p className="text-xs text-slate-500 mb-6">
              {authMode === "login" ? "Akses riwayat pesanan & produk digital Anda." : "Buat akun untuk belanja lebih mudah."}
            </p>

            {/* Google Sign-in Button */}
            <div className="mb-5">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleLoading}
                className="w-full py-3 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-all shadow-sm flex items-center justify-center gap-3"
              >
                {/* Official Google multicolored G logo */}
                <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>{googleLoading ? "Menghubungkan..." : "Lanjutkan dengan Google"}</span>
              </button>
            </div>

            {/* Divider */}
            <div className="relative flex py-2 items-center mb-5">
              <div className="flex-grow border-t border-slate-200"></div>
              <span className="flex-shrink mx-3 text-slate-400 text-[11px] font-medium">atau dengan email</span>
              <div className="flex-grow border-t border-slate-200"></div>
            </div>

            <form onSubmit={handleAuth} className="space-y-4">
              {authMode === "register" && (
                <div>
                  <label htmlFor="auth-name" className="text-xs font-semibold text-slate-700 block mb-1">Nama Lengkap</label>
                  <input
                    id="auth-name"
                    type="text"
                    required
                    value={authForm.name}
                    onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                  />
                </div>
              )}

              <div>
                <label htmlFor="auth-email" className="text-xs font-semibold text-slate-700 block mb-1">Email</label>
                <input
                  id="auth-email"
                  type="email"
                  required
                  value={authForm.email}
                  onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                />
              </div>

              <div>
                <label htmlFor="auth-password" className="text-xs font-semibold text-slate-700 block mb-1">Password</label>
                <input
                  id="auth-password"
                  type="password"
                  required
                  placeholder="Min 6 karakter"
                  value={authForm.password}
                  onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                />
              </div>

              {authMode === "register" && (
                <div>
                  <label htmlFor="auth-adminkey" className="text-xs font-semibold text-slate-700 block mb-1">
                    Kode Rahasia Admin (Opsional)
                  </label>
                  <input
                    id="auth-adminkey"
                    type="password"
                    placeholder="Masukkan admin123 untuk role admin"
                    value={authForm.admin_key}
                    onChange={(e) => setAuthForm({ ...authForm, admin_key: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                  />
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-sm transition-all"
              >
                {authMode === "login" ? "Masuk dengan Email" : "Daftar Akun Baru"}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => setAuthMode(authMode === "login" ? "register" : "login")}
                  className="text-xs text-blue-600 hover:underline font-semibold"
                >
                  {authMode === "login" ? "Belum punya akun? Daftar sekarang" : "Sudah punya akun? Masuk"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Panel Modal */}
      {isAdminPanelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md overflow-y-auto" role="dialog" aria-modal="true" aria-label="Portal Manajemen Admin">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-4xl w-full p-6 sm:p-8 shadow-2xl relative my-8 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsAdminPanelOpen(false)}
              aria-label="Tutup panel admin"
              className="absolute top-6 right-6 text-slate-400 hover:text-slate-800"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>

            <h2 className="text-2xl font-bold text-slate-900 mb-6">
              Portal Manajemen Toko
            </h2>

            {/* Quick Add Product Form */}
            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 mb-8 space-y-4">
              <h3 className="text-sm font-bold text-blue-700 uppercase tracking-wider">
                + Tambah Produk Baru
              </h3>
              <form onSubmit={handleCreateProduct} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="prod-name" className="text-xs text-slate-600 block mb-1">Nama Produk *</label>
                  <input
                    id="prod-name"
                    type="text"
                    required
                    value={newProductForm.name}
                    onChange={(e) => setNewProductForm({ ...newProductForm, name: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900"
                  />
                </div>
                <div>
                  <label htmlFor="prod-price" className="text-xs text-slate-600 block mb-1">Harga (IDR) *</label>
                  <input
                    id="prod-price"
                    type="number"
                    required
                    value={newProductForm.price}
                    onChange={(e) => setNewProductForm({ ...newProductForm, price: Number(e.target.value) })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 num-tabular"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="prod-desc" className="text-xs text-slate-600 block mb-1">Deskripsi Singkat</label>
                  <input
                    id="prod-desc"
                    type="text"
                    value={newProductForm.description}
                    onChange={(e) => setNewProductForm({ ...newProductForm, description: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900"
                  />
                </div>
                <div>
                  <label htmlFor="prod-img" className="text-xs text-slate-600 block mb-1">URL Gambar Produk</label>
                  <input
                    id="prod-img"
                    type="url"
                    placeholder="https://..."
                    value={newProductForm.image_url}
                    onChange={(e) => setNewProductForm({ ...newProductForm, image_url: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900"
                  />
                </div>
                <div>
                  <label htmlFor="prod-type" className="text-xs text-slate-600 block mb-1">Tipe Produk</label>
                  <select
                    id="prod-type"
                    value={newProductForm.is_digital ? "digital" : "physical"}
                    onChange={(e) => setNewProductForm({ ...newProductForm, is_digital: e.target.value === "digital" })}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900"
                  >
                    <option value="physical">Barang Fisik (Kirim via Ekspedisi)</option>
                    <option value="digital">Produk Digital (Download / Akses File)</option>
                  </select>
                </div>
                {newProductForm.is_digital ? (
                  <div className="sm:col-span-2">
                    <label htmlFor="prod-file" className="text-xs text-slate-600 block mb-1">URL File Download Digital *</label>
                    <input
                      id="prod-file"
                      type="url"
                      placeholder="https://... atau link file cloud"
                      value={newProductForm.digital_file_url}
                      onChange={(e) => setNewProductForm({ ...newProductForm, digital_file_url: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900"
                    />
                  </div>
                ) : (
                  <div>
                    <label htmlFor="prod-stock" className="text-xs text-slate-600 block mb-1">Stok Tersedia *</label>
                    <input
                      id="prod-stock"
                      type="number"
                      value={newProductForm.stock}
                      onChange={(e) => setNewProductForm({ ...newProductForm, stock: Number(e.target.value) })}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-900 num-tabular"
                    />
                  </div>
                )}
                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl transition-all shadow-sm"
                  >
                    Simpan Produk
                  </button>
                </div>
              </form>
            </div>

            {/* Manage Incoming Orders */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                  Daftar Pesanan Masuk ({adminOrders.length})
                </h3>
                <button
                  onClick={loadAdminOrders}
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1 font-semibold"
                >
                  <ArrowPathIcon className="w-3.5 h-3.5" /> Refresh
                </button>
              </div>

              {adminOrdersLoading ? (
                <p className="text-xs text-slate-500 py-6 text-center">Memuat pesanan...</p>
              ) : adminOrders.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">Belum ada pesanan masuk.</p>
              ) : (
                <div className="space-y-3">
                  {adminOrders.map((ord) => (
                    <div
                      key={ord.id}
                      className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-wrap justify-between items-center gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-900 text-sm num-tabular">#ORDER-{ord.id}</span>
                          <span className="text-xs text-slate-500">({ord.customer_name} - {ord.customer_phone})</span>
                          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                            {ord.status}
                          </span>
                        </div>
                        <span className="text-xs text-blue-600 font-semibold block mt-1 num-tabular">
                          {formatIDR(ord.grand_total)} via {ord.payment_method}
                        </span>
                        {ord.payment_proof_url && (
                          <a
                            href={ord.payment_proof_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-amber-700 hover:underline block mt-0.5 font-medium"
                          >
                            Lihat Bukti Bayar ↗
                          </a>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {ord.status === "pending" && (
                          <button
                            onClick={() => handleUpdateStatus(ord.id, "paid")}
                            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-bold text-white transition-all shadow-sm"
                          >
                            Verifikasi Lunas
                          </button>
                        )}
                        {ord.status === "paid" && !ord.is_digital_only && (
                          <button
                            onClick={() => {
                              const resi = prompt("Masukkan nomor resi ekspedisi:");
                              if (resi) handleUpdateStatus(ord.id, "shipped", resi);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-xs font-bold text-white transition-all shadow-sm"
                          >
                            Input Resi (Kirim)
                          </button>
                        )}
                        {ord.status !== "completed" && ord.status !== "cancelled" && (
                          <button
                            onClick={() => handleUpdateStatus(ord.id, "completed")}
                            className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-xs font-semibold text-slate-700"
                          >
                            Selesai
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-10 mt-16 text-xs text-slate-500 text-center">
        <p className="mb-2">© {new Date().getFullYear()} Supatman Online Store. All Rights Reserved.</p>
        <p>Built with Go (Encore.dev) &amp; React 18 + Tailwind CSS.</p>
      </footer>
    </div>
  );
}
