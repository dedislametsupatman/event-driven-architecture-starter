import React, { useState, useEffect, useRef } from "react";
import {
  api,
  Product,
  Category,
  PaymentMethods,
  User,
  InAppNotification,
} from "./api";
import { AdminCMS } from "./AdminCMS";
import { OrdersPage } from "./OrdersPage";
import { CartPage, CartItem } from "./CartPage";
import { ProfilePage } from "./ProfilePage";
import {
  ShoppingBagIcon,
  XMarkIcon,
  PlusIcon,
  MinusIcon,
  TruckIcon,
  UserIcon,
  ArrowPathIcon,
  CubeIcon,
  DocumentArrowDownIcon,
  ArrowDownTrayIcon,
  ShieldCheckIcon,
  EyeIcon,
  MagnifyingGlassIcon,
  TagIcon,
  BellIcon,
} from "@heroicons/react/24/outline";

export type ViewMode = "store" | "cart" | "orders" | "profile" | "cms";

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      if (path.startsWith("/cms") || hash === "#/cms" || hash === "#cms") return "cms";
      if (path.startsWith("/cart") || hash === "#/cart" || hash === "#cart") return "cart";
      if (path.startsWith("/orders") || hash === "#/orders" || hash === "#orders") return "orders";
      if (path.startsWith("/profile") || hash === "#/profile" || hash === "#profile") return "profile";
    }
    return "store";
  });

  const [activeOrderId, setActiveOrderId] = useState<number | string | null>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const id = params.get("id");
      return id ? id : null;
    }
    return null;
  });

  // Synchronize route changes via popstate and hashchange
  useEffect(() => {
    const handleUrlChange = () => {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      if (path.startsWith("/cms") || hash === "#/cms" || hash === "#cms") {
        setViewMode("cms");
      } else if (path.startsWith("/cart") || hash === "#/cart" || hash === "#cart") {
        setViewMode("cart");
      } else if (path.startsWith("/orders") || hash === "#/orders" || hash === "#orders") {
        setViewMode("orders");
        const params = new URLSearchParams(window.location.search);
        const id = params.get("id");
        if (id) setActiveOrderId(id);
      } else if (path.startsWith("/profile") || hash === "#/profile" || hash === "#profile") {
        setViewMode("profile");
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

  const navigateTo = (view: ViewMode, path: string) => {
    window.history.pushState({}, "", path);
    setViewMode(view);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [digitalFilter, setDigitalFilter] = useState<string>("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Cart State (Persisted in localStorage)
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem("cart");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Product Detail Quick View Modal State
  const [detailProduct, setDetailProduct] = useState<Product | null>(null);
  const [detailQuantity, setDetailQuantity] = useState(1);

  // Payment Methods & User Auth
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethods | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  useEffect(() => {
    localStorage.setItem("cart", JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    loadProducts();
    loadCategories();
    loadPaymentMethods();
    checkCurrentUser();
  }, [search, selectedCategory, digitalFilter]);

  // Handle ESC key for detail modal closing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDetailProduct(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function triggerToast(message: string) {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3500);
  }

  // Realtime In-App Notifications
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [unreadNotificationsCount, setUnreadNotificationsCount] = useState(0);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const prevNotificationIds = useRef<Set<number>>(new Set());
  const isInitialNotificationsLoad = useRef(true);

  // Close notification popover on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(e.target as Node)) {
        setIsNotificationsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loadNotifications = async () => {
    try {
      const email = currentUser?.email || localStorage.getItem("customer_email") || undefined;
      const res = await api.getNotifications(email ? { email } : undefined);
      const notifs = res.notifications || [];

      // Detect new unread notification for realtime toast
      if (!isInitialNotificationsLoad.current) {
        for (const n of notifs) {
          if (!n.is_read && !prevNotificationIds.current.has(n.id)) {
            triggerToast(`🔔 ${n.title}: ${n.message}`);
          }
        }
      } else {
        isInitialNotificationsLoad.current = false;
      }

      const idSet = new Set<number>();
      notifs.forEach((n) => idSet.add(n.id));
      prevNotificationIds.current = idSet;

      setNotifications(notifs);
      setUnreadNotificationsCount(res.unread_count || 0);
    } catch {
      // Background polling silent fail
    }
  };

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 5000);
    return () => clearInterval(interval);
  }, [currentUser]);

  const handleNotificationClick = async (n: InAppNotification) => {
    try {
      if (!n.is_read) {
        await api.markNotificationRead(n.id);
        setNotifications((prev) =>
          prev.map((item) => (item.id === n.id ? { ...item, is_read: true } : item))
        );
        setUnreadNotificationsCount((prev) => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error(err);
    }
    setIsNotificationsOpen(false);
    setActiveOrderId(n.order_id);
    navigateTo("orders", `/orders?id=${n.order_id}`);
  };

  const handleMarkAllRead = async () => {
    try {
      const email = currentUser?.email || localStorage.getItem("customer_email") || undefined;
      await api.markAllNotificationsRead(email);
      setNotifications((prev) => prev.map((item) => ({ ...item, is_read: true })));
      setUnreadNotificationsCount(0);
      triggerToast("Semua notifikasi ditandai sudah dibaca.");
    } catch (err) {
      console.error(err);
    }
  };

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
  function addToCart(product: Product, quantity = 1, openCartPage = false) {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...prev, { product, quantity }];
    });
    triggerToast(`"${product.name}" ditambahkan ke keranjang.`);
    if (openCartPage) {
      navigateTo("cart", "/cart");
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

  function handleLogout() {
    localStorage.removeItem("token");
    setCurrentUser(null);
    triggerToast("Anda telah keluar dari akun.");
    navigateTo("store", "/");
  }

  const formatIDR = (val: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(val);
  };

  const totalCartCount = cart.reduce((total, i) => total + i.quantity, 0);

  // Jika URL adalah /cms, tampilkan Admin CMS langsung
  if (viewMode === "cms") {
    return (
      <AdminCMS
        onBackToStore={() => navigateTo("store", "/")}
        userRole={currentUser?.role}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-800 antialiased font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs font-semibold px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 border border-slate-700 animate-slide-up">
          <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Banner Promosi */}
      <div className="bg-slate-900 text-white py-2 px-4 text-xs font-medium text-center flex items-center justify-center gap-2">
        <span className="bg-blue-600 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded">
          Promo
        </span>
        <span>Gratis Ongkir Pulau Jawa untuk barang fisik &amp; Akses Unduhan Instan untuk aset digital!</span>
      </div>

      {/* Navigation Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          {/* Logo & Brand */}
          <div
            onClick={() => navigateTo("store", "/")}
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-lg text-white shadow-sm group-hover:bg-blue-700 transition-colors">
              <CubeIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-xl tracking-tight text-slate-900 group-hover:text-blue-600 transition-colors">
                  SUPATMAN STORE
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                  Official
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">Hardware Setup &amp; Digital Assets</p>
            </div>
          </div>

          {/* Search Bar (Katalog) */}
          <div className="flex-1 max-w-md hidden md:block">
            <div className="relative">
              <label htmlFor="search-input" className="sr-only">Cari produk</label>
              <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                id="search-input"
                type="text"
                placeholder="Cari produk fisik atau digital..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  if (viewMode !== "store") {
                    navigateTo("store", "/");
                  }
                }}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all shadow-sm"
              />
            </div>
          </div>

          {/* Navigation Menu Buttons */}
          <nav className="flex items-center gap-2" aria-label="Navigasi Utama">
            {/* Belanja Link */}
            <button
              onClick={() => navigateTo("store", "/")}
              className={`text-xs font-semibold px-3 py-2 rounded-xl transition-all hidden sm:flex items-center gap-1.5 ${
                viewMode === "store"
                  ? "bg-slate-100 text-slate-900 font-bold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              <ShoppingBagIcon className="w-4 h-4" />
              <span>Belanja</span>
            </button>

            {/* Riwayat & Pelacakan Pesanan */}
            <button
              onClick={() => navigateTo("orders", "/orders")}
              className={`text-xs font-semibold px-3 py-2 rounded-xl border transition-all flex items-center gap-1.5 ${
                viewMode === "orders"
                  ? "bg-blue-50 text-blue-700 border-blue-300 font-bold"
                  : "text-slate-700 hover:text-slate-900 border-slate-200 hover:bg-slate-100"
              }`}
            >
              <TruckIcon className="w-4 h-4 text-blue-600" />
              <span className="hidden sm:inline">Riwayat Pesanan</span>
            </button>

            {/* Realtime In-App Notifications Bell */}
            <div className="relative" ref={notificationRef}>
              <button
                onClick={() => setIsNotificationsOpen((prev) => !prev)}
                aria-label={`Notifikasi pesanan (${unreadNotificationsCount} belum dibaca)`}
                className={`relative p-2 rounded-xl border transition-all flex items-center justify-center ${
                  isNotificationsOpen
                    ? "bg-blue-50 text-blue-700 border-blue-300 ring-2 ring-blue-100"
                    : "text-slate-700 hover:text-slate-900 border-slate-200 hover:bg-slate-100"
                }`}
              >
                <BellIcon className="w-4 h-4 text-slate-600" />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-600 text-white font-bold text-[10px] min-w-[18px] h-[18px] px-1 rounded-full flex items-center justify-center ring-2 ring-white animate-pulse shadow-sm">
                    {unreadNotificationsCount > 9 ? "9+" : unreadNotificationsCount}
                  </span>
                )}
              </button>

              {/* Notification Dropdown Popover */}
              {isNotificationsOpen && (
                <div className="absolute right-0 sm:right-auto sm:left-1/2 sm:-translate-x-1/2 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-800">Notifikasi Pesanan</span>
                      {unreadNotificationsCount > 0 && (
                        <span className="bg-blue-100 text-blue-700 font-bold text-[10px] px-2 py-0.5 rounded-full">
                          {unreadNotificationsCount} baru
                        </span>
                      )}
                    </div>
                    {unreadNotificationsCount > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        Tandai semua dibaca
                      </button>
                    )}
                  </div>

                  <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <div className="py-8 px-4 text-center">
                        <BellIcon className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                        <p className="text-xs text-slate-600 font-semibold">Belum ada notifikasi pesanan</p>
                        <p className="text-[11px] text-slate-400 mt-1 max-w-xs mx-auto">
                          Setiap ada perubahan status pesanan Anda (pembayaran diverifikasi, pesanan dikirim, resi diterbitkan), notifikasi realtime akan muncul di sini.
                        </p>
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => handleNotificationClick(n)}
                          className={`w-full text-left p-3.5 hover:bg-blue-50/50 transition-colors flex items-start gap-3 ${
                            !n.is_read ? "bg-blue-50/30" : ""
                          }`}
                        >
                          <div className="mt-1 shrink-0">
                            {!n.is_read ? (
                              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 block ring-4 ring-blue-100"></span>
                            ) : (
                              <span className="w-2.5 h-2.5 rounded-full bg-slate-200 block"></span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <span className="font-bold text-xs text-slate-800 truncate">{n.title}</span>
                              <span className="text-[10px] text-slate-400 shrink-0">
                                {new Date(n.created_at).toLocaleDateString("id-ID", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  day: "numeric",
                                  month: "short",
                                })}
                              </span>
                            </div>
                            <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">{n.message}</p>
                            {n.tracking_number && (
                              <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-mono text-slate-700">
                                <TruckIcon className="w-3 h-3 text-slate-500" />
                                <span>Resi: {n.tracking_number}</span>
                              </div>
                            )}
                          </div>
                        </button>
                      ))
                    )}
                  </div>

                  <div className="p-2.5 bg-slate-50 border-t border-slate-100 text-center">
                    <button
                      onClick={() => {
                        setIsNotificationsOpen(false);
                        navigateTo("orders", "/orders");
                      }}
                      className="text-xs font-semibold text-slate-600 hover:text-blue-600"
                    >
                      Buka Riwayat Pesanan &rarr;
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Profil / Akun Pengguna */}
            <button
              onClick={() => navigateTo("profile", "/profile")}
              className={`text-xs font-semibold px-3.5 py-2 rounded-xl border transition-all flex items-center gap-1.5 ${
                viewMode === "profile"
                  ? "bg-blue-50 text-blue-700 border-blue-300 font-bold"
                  : "text-slate-700 hover:text-slate-900 border-slate-200 hover:bg-slate-100"
              }`}
            >
              <UserIcon className="w-4 h-4 text-slate-600" />
              <span className="hidden sm:inline">
                {currentUser ? currentUser.name.split(" ")[0] : "Akun"}
              </span>
            </button>

            {/* Admin CMS Button (jika role admin) */}
            {currentUser?.role === "admin" && (
              <button
                onClick={() => navigateTo("cms", "/cms")}
                className="text-xs font-bold px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-all flex items-center gap-1 shadow-2xs"
              >
                <span>Admin CMS</span>
              </button>
            )}

            {/* Cart Page Button with Badge */}
            <button
              onClick={() => navigateTo("cart", "/cart")}
              aria-label={`Buka keranjang belanja (${totalCartCount} item)`}
              className={`relative p-2.5 rounded-xl transition-all shadow-xs ${
                viewMode === "cart"
                  ? "bg-blue-700 text-white ring-2 ring-blue-400"
                  : "bg-blue-600 hover:bg-blue-700 text-white"
              }`}
            >
              <ShoppingBagIcon className="w-5 h-5" />
              {totalCartCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white font-bold text-[10px] w-5 h-5 rounded-full flex items-center justify-center ring-2 ring-white">
                  {totalCartCount}
                </span>
              )}
            </button>
          </nav>
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
              onChange={(e) => {
                setSearch(e.target.value);
                if (viewMode !== "store") {
                  navigateTo("store", "/");
                }
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-600"
            />
          </div>
        </div>
      </header>

      {/* ================= BODY CONTENT ROUTING ================= */}
      {viewMode === "orders" ? (
        /* Dedicated Orders & Tracking Page */
        <main className="flex-1">
          <OrdersPage
            currentUser={currentUser}
            paymentMethods={paymentMethods}
            initialOrderId={activeOrderId}
            onNavigate={navigateTo}
            showToast={triggerToast}
          />
        </main>
      ) : viewMode === "cart" ? (
        /* Dedicated Cart & Checkout Page */
        <main className="flex-1">
          <CartPage
            cart={cart}
            currentUser={currentUser}
            paymentMethods={paymentMethods}
            onUpdateQuantity={updateQuantity}
            onRemoveItem={removeFromCart}
            onClearCart={() => setCart([])}
            onOrderCreated={(order) => {
              setActiveOrderId(order.id);
              navigateTo("orders", `/orders?id=${order.id}`);
            }}
            onNavigate={navigateTo}
            showToast={triggerToast}
          />
        </main>
      ) : viewMode === "profile" ? (
        /* Dedicated Profile & Auth Page */
        <main className="flex-1">
          <ProfilePage
            currentUser={currentUser}
            onLoginSuccess={(u) => {
              setCurrentUser(u);
            }}
            onLogout={handleLogout}
            onNavigate={navigateTo}
            showToast={triggerToast}
          />
        </main>
      ) : (
        /* Dedicated Storefront Catalog Page */
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
                  className="group surface-card rounded-2xl overflow-hidden flex flex-col justify-between bg-white border border-slate-200 shadow-xs hover:shadow-md transition-shadow"
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
                            navigateTo("cart", "/cart");
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
      )}

      {/* Product Detail Quick View Modal */}
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

              {/* Product Info */}
              <div className="flex flex-col justify-between h-full space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        detailProduct.is_digital
                          ? "bg-purple-100 text-purple-700"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {detailProduct.is_digital ? "Produk Digital" : "Barang Fisik"}
                    </span>
                    {detailProduct.category_name && (
                      <span className="text-xs text-slate-500 font-medium">
                        • {detailProduct.category_name}
                      </span>
                    )}
                  </div>

                  <h2 className="text-xl sm:text-2xl font-bold text-slate-900 leading-snug">
                    {detailProduct.name}
                  </h2>

                  <div className="my-3">
                    <span className="text-2xl font-black text-blue-600 num-tabular">
                      {formatIDR(detailProduct.price)}
                    </span>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed max-h-40 overflow-y-auto">
                    {detailProduct.description || "Tidak ada deskripsi detail untuk produk ini."}
                  </p>

                  <div className="pt-3 border-t border-slate-100 text-xs text-slate-500 space-y-1">
                    <div>
                      Tipe Pengiriman:{" "}
                      <span className="font-semibold text-slate-800">
                        {detailProduct.is_digital ? "Download Instan" : "Ekspedisi / Kurir"}
                      </span>
                    </div>
                    <div>
                      Ketersediaan:{" "}
                      <span className="font-semibold text-slate-800">
                        {detailProduct.is_digital ? "Selalu Tersedia" : `Stok ${detailProduct.stock} unit`}
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
                        navigateTo("cart", "/cart");
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

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-10 mt-16 text-xs text-slate-500 text-center">
        <p className="mb-2">© {new Date().getFullYear()} Supatman Online Store. All Rights Reserved.</p>
        <p>Built with Go (Encore.dev) &amp; React 18 + Tailwind CSS.</p>
      </footer>
    </div>
  );
}
