import React, { useState, useEffect, useRef } from "react";
import {
  api,
  Product,
  Category,
  PaymentMethods,
  User,
  InAppNotification,
  StoreSettings,
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

  // Store Profile & Branding Config
  const [storeSettings, setStoreSettings] = useState<StoreSettings>({
    store_name: "SUPATMAN STORE",
    store_tagline: "Hardware Setup & Digital Atelier",
    store_logo_url: "",
    store_badge: "OFFICIAL",
    store_phone: "08123456789",
    store_address: "Jl. Merdeka No. 45, Bandung, Jawa Barat",
    store_announcement: "Pengiriman Kilat Pulau Jawa & Akses Unduhan Instan Seluruh Aset Digital",
  });

  const loadStoreSettings = async () => {
    try {
      const s = await api.getStoreSettings();
      if (s) {
        setStoreSettings(s);
      }
    } catch (err) {
      console.error("Gagal memuat profil toko:", err);
    }
  };

  useEffect(() => {
    localStorage.setItem("cart", JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    loadProducts();
    loadCategories();
    loadPaymentMethods();
    checkCurrentUser();
    loadStoreSettings();
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

      {/* Editorial Announcement Bar */}
      <div className="bg-slate-900 text-slate-300 py-2.5 px-4 text-xs font-medium border-b border-slate-800">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-center sm:text-left">
          <div className="flex items-center gap-2.5 mx-auto sm:mx-0">
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-800/80 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              {storeSettings.store_badge || "RESMI"}
            </span>
            <span className="text-slate-200">
              {storeSettings.store_announcement || "Pengiriman Kilat Pulau Jawa & Akses Unduhan Instan Seluruh Aset Digital"}
            </span>
          </div>
          <div className="hidden lg:flex items-center gap-4 text-[11px] text-slate-400 font-mono">
            <span>GARANSI KEASLIAN</span>
            <span>•</span>
            <span>PEMBAYARAN OTOMATIS</span>
          </div>
        </div>
      </div>

      {/* Navigation Header with Glassmorphism */}
      <header className="sticky top-0 z-30 glass-nav transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-4">
          {/* Logo & Brand */}
          <div
            onClick={() => navigateTo("store", "/")}
            className="flex items-center gap-3 cursor-pointer group select-none"
          >
            {storeSettings.store_logo_url ? (
              <img
                src={storeSettings.store_logo_url}
                alt={storeSettings.store_name}
                className="w-11 h-11 rounded-2xl object-contain border border-slate-200/80 p-1 bg-white shadow-md shadow-blue-500/10 group-hover:scale-105 transition-transform"
              />
            ) : (
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center font-bold text-white shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
                <CubeIcon className="w-6 h-6" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="font-heading font-black text-xl tracking-tight text-slate-900 group-hover:text-blue-600 transition-colors">
                  {storeSettings.store_name || "SUPATMAN STORE"}
                </span>
                {storeSettings.store_badge && (
                  <span className="text-[10px] font-mono uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200/80">
                    {storeSettings.store_badge}
                  </span>
                )}
              </div>
              {storeSettings.store_tagline && (
                <p className="text-[11px] font-medium text-slate-500 hidden sm:block tracking-wide">
                  {storeSettings.store_tagline}
                </p>
              )}
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
                className="w-full bg-slate-100/80 hover:bg-slate-100 border border-slate-200/90 rounded-xl pl-10 pr-12 py-2.5 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-100 transition-all"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] font-semibold text-slate-400 border border-slate-200 px-1.5 py-0.5 rounded bg-white">
                /
              </span>
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
            storeSettings={storeSettings}
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
          {/* Editorial Hero Banner (Taste-Skill Studio Showcase) */}
          <section className="relative rounded-3xl overflow-hidden mb-12 border border-slate-200/90 bg-gradient-to-br from-white via-slate-50 to-blue-50/30 shadow-xs">
            <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl pointer-events-none"></div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 p-8 sm:p-12 items-center relative z-10">
              <div className="lg:col-span-7">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900 text-slate-100 text-[11px] font-mono tracking-wider mb-5 shadow-xs">
                  <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                  <span>EST. 2026 • HARDWARE &amp; DIGITAL ATELIER</span>
                </div>
                <h1 className="font-heading text-3xl sm:text-5xl font-black text-slate-900 leading-[1.1] mb-5 tracking-tight">
                  Peralatan Setup Meja Kerja <span className="text-blue-600">&amp; Aset Digital.</span>
                </h1>
                <p className="text-slate-600 text-sm sm:text-base leading-relaxed mb-8 max-w-xl">
                  Tingkatkan kenyamanan &amp; estetika ruang kerja Anda dengan kurasi hardware fisik minimalis dan koleksi aset digital siap unduh berkualitas tinggi.
                </p>

                {/* 3 Keunggulan Atelier */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-6 border-t border-slate-200/80">
                  <div className="flex items-center gap-2.5 text-xs text-slate-700 font-semibold">
                    <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0 border border-blue-100">
                      <TruckIcon className="w-4 h-4" />
                    </div>
                    <span>Ekspedisi Kilat &amp; Resi</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs text-slate-700 font-semibold">
                    <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center flex-shrink-0 border border-indigo-100">
                      <ArrowDownTrayIcon className="w-4 h-4" />
                    </div>
                    <span>Akses Unduh Instan</span>
                  </div>
                  <div className="flex items-center gap-2.5 text-xs text-slate-700 font-semibold">
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0 border border-emerald-100">
                      <ShieldCheckIcon className="w-4 h-4" />
                    </div>
                    <span>Verifikasi Lunas Realtime</span>
                  </div>
                </div>
              </div>

              {/* Asymmetrical Showcase Card */}
              <div className="lg:col-span-5 hidden lg:block">
                <div className="relative rounded-3xl overflow-hidden shadow-xl border border-slate-200/90 aspect-[4/3] bg-slate-900 group">
                  <img
                    src="https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=800&q=80"
                    alt="Minimal Workspace Setup"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 opacity-90"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent flex flex-col justify-end p-6">
                    <span className="font-mono text-[10px] text-blue-300 tracking-widest uppercase mb-1">
                      INSPIRASI SETUP MINIMALIS
                    </span>
                    <h3 className="font-heading text-white font-bold text-base leading-snug">
                      Hardware Setup Ergonomis &amp; Terorganisir
                    </h3>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Filter Bar (Segmented Control & Tags) */}
          <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8" aria-label="Filter kategori">
            <div className="inline-flex p-1 bg-slate-200/70 rounded-2xl border border-slate-200/80">
              <button
                onClick={() => {
                  setDigitalFilter("");
                  setSelectedCategory("");
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all tap-effect ${
                  digitalFilter === "" && selectedCategory === ""
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Semua Koleksi
              </button>
              <button
                onClick={() => setDigitalFilter("false")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 tap-effect ${
                  digitalFilter === "false"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <CubeIcon className="w-4 h-4 text-blue-600" />
                <span>Barang Fisik</span>
              </button>
              <button
                onClick={() => setDigitalFilter("true")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 tap-effect ${
                  digitalFilter === "true"
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <DocumentArrowDownIcon className="w-4 h-4 text-indigo-600" />
                <span>Aset Digital</span>
              </button>
            </div>

            {/* Category Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCategory(selectedCategory === c.slug ? "" : c.slug)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all tap-effect ${
                    selectedCategory === c.slug
                      ? "bg-slate-900 text-white shadow-xs"
                      : "bg-white text-slate-600 hover:text-slate-900 border border-slate-200/90 hover:bg-slate-50"
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </section>

          {/* Product Grid */}
          {loading ? (
            <div className="py-24 flex flex-col items-center justify-center gap-3 text-slate-500">
              <ArrowPathIcon className="w-7 h-7 animate-spin text-blue-600" />
              <p className="text-xs font-mono tracking-wide">MEMUAT KATALOG...</p>
            </div>
          ) : products.length === 0 ? (
            <div className="py-20 text-center rounded-3xl border border-slate-200 bg-white p-8 max-w-md mx-auto">
              <CubeIcon className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-800 font-bold text-sm mb-1">Tidak ada produk yang cocok</p>
              <p className="text-xs text-slate-500 mb-4">Coba ganti kata kunci pencarian atau ubah filter kategori.</p>
              <button
                onClick={() => {
                  setSearch("");
                  setDigitalFilter("");
                  setSelectedCategory("");
                }}
                className="text-xs text-blue-600 hover:underline font-bold"
              >
                Reset Semua Filter &rarr;
              </button>
            </div>
          ) : (
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {products.map((product) => (
                <div
                  key={product.id}
                  className="group surface-card rounded-2xl overflow-hidden flex flex-col justify-between"
                >
                  {/* Image Container with Inner Vignette & Tag */}
                  <div
                    className="relative aspect-[4/3] w-full overflow-hidden bg-slate-100 cursor-pointer"
                    onClick={() => {
                      setDetailProduct(product);
                      setDetailQuantity(1);
                    }}
                  >
                    <img
                      src={product.image_url || "https://images.unsplash.com/photo-1526738549149-8e07eca6c147?auto=format&fit=crop&w=600&q=80"}
                      alt={product.name}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out"
                    />
                    {/* Badge */}
                    <div className="absolute top-3 left-3 flex gap-2">
                      {product.is_digital ? (
                        <span className="badge-pill bg-slate-900/85 backdrop-blur-md text-white border-white/20 shadow-xs">
                          <DocumentArrowDownIcon className="w-3 h-3 text-indigo-400" />
                          <span>DIGITAL</span>
                        </span>
                      ) : (
                        <span className="badge-pill bg-white/90 backdrop-blur-md text-slate-900 border-slate-200 shadow-xs">
                          <CubeIcon className="w-3 h-3 text-blue-600" />
                          <span>FISIK</span>
                        </span>
                      )}
                    </div>
                    {/* Quick Detail Hover Action */}
                    <div className="absolute inset-0 bg-slate-950/20 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <span className="px-4 py-2 rounded-xl bg-white text-slate-900 text-xs font-bold shadow-lg flex items-center gap-1.5 transform translate-y-2 group-hover:translate-y-0 transition-transform">
                        <EyeIcon className="w-4 h-4 text-blue-600" /> Lihat Detail
                      </span>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-5 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mb-1.5">
                        <span>{product.category_name || "Koleksi"}</span>
                        <span>{product.is_digital ? "INSTANT" : `STOK: ${product.stock}`}</span>
                      </div>
                      <h2
                        onClick={() => {
                          setDetailProduct(product);
                          setDetailQuantity(1);
                        }}
                        className="font-heading font-bold text-sm text-slate-900 hover:text-blue-600 transition-colors line-clamp-1 mb-2 cursor-pointer"
                      >
                        {product.name}
                      </h2>
                      <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed mb-4">
                        {product.description || "Perlengkapan kerja berkualitas tinggi siap dikirim ke seluruh Indonesia."}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-slate-100">
                      <div className="flex items-baseline justify-between mb-3.5">
                        <div>
                          <span className="text-[10px] text-slate-400 block font-mono uppercase tracking-wider">Harga Resmi</span>
                          <span className="text-base font-extrabold text-slate-900 num-tabular tracking-tight">
                            {formatIDR(product.price)}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => addToCart(product, 1, false)}
                          className="w-full py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-800 transition-all border border-slate-200/80 tap-effect"
                        >
                          + Keranjang
                        </button>
                        <button
                          onClick={() => {
                            addToCart(product, 1, false);
                            navigateTo("cart", "/cart");
                          }}
                          className="w-full py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white shadow-xs transition-all tap-effect"
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
                      className="py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-800 border border-slate-200/90 transition-all tap-effect"
                    >
                      + Ke Keranjang
                    </button>
                    <button
                      onClick={() => {
                        addToCart(detailProduct, detailQuantity, false);
                        setDetailProduct(null);
                        navigateTo("cart", "/cart");
                      }}
                      className="py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-xs font-bold text-white shadow-xs transition-all tap-effect"
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

      {/* Editorial Atelier Footer */}
      <footer className="border-t border-slate-200/80 bg-white mt-20 pt-16 pb-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 pb-12 border-b border-slate-100">
            <div className="md:col-span-6">
              <div className="flex items-center gap-2.5 mb-3">
                {storeSettings.store_logo_url ? (
                  <img
                    src={storeSettings.store_logo_url}
                    alt={storeSettings.store_name}
                    className="w-8 h-8 rounded-xl object-contain border border-slate-200 p-0.5 bg-white"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center font-bold">
                    <CubeIcon className="w-4 h-4" />
                  </div>
                )}
                <span className="font-heading font-black text-base text-slate-900 tracking-tight">
                  {storeSettings.store_name || "SUPATMAN STORE"}
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  {storeSettings.store_badge || "ATELIER"}
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed max-w-md mb-3">
                {storeSettings.store_tagline || "Kurasi perlengkapan meja kerja berdesain minimalis dan koleksi aset digital berkualitas tinggi. Dirancang untuk developer, kreator, dan profesional modern."}
              </p>
              {storeSettings.store_address && (
                <p className="text-[11px] text-slate-400 font-mono">
                  📍 {storeSettings.store_address}
                </p>
              )}
            </div>

            <div className="md:col-span-3">
              <h4 className="font-mono text-[11px] font-bold text-slate-900 uppercase tracking-wider mb-3">
                Navigasi Cepat
              </h4>
              <ul className="space-y-2 text-xs text-slate-600">
                <li>
                  <button onClick={() => navigateTo("store", "/")} className="hover:text-blue-600 transition-colors">
                    Katalog Produk
                  </button>
                </li>
                <li>
                  <button onClick={() => navigateTo("orders", "/orders")} className="hover:text-blue-600 transition-colors">
                    Pelacakan &amp; Resi Pesanan
                  </button>
                </li>
                <li>
                  <button onClick={() => navigateTo("cart", "/cart")} className="hover:text-blue-600 transition-colors">
                    Keranjang Belanja
                  </button>
                </li>
              </ul>
            </div>

            <div className="md:col-span-3">
              <h4 className="font-mono text-[11px] font-bold text-slate-900 uppercase tracking-wider mb-3">
                Hubungi Kami
              </h4>
              <div className="space-y-2 text-xs text-slate-500">
                {storeSettings.store_phone && (
                  <p className="text-xs font-mono font-semibold text-slate-700">
                    WA/Telp: {storeSettings.store_phone}
                  </p>
                )}
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] font-mono text-slate-700">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>ENCORE CLOUD MICROSERVICES</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Didukung enkripsi TLS &amp; validasi pembayaran otomatis.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400 font-mono">
            <p>© {new Date().getFullYear()} {storeSettings.store_name || "Supatman Store"}. All Rights Reserved.</p>
            <p className="text-[11px]">Crafted with Go (Encore.dev) &amp; React 18 + Tailwind CSS</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
