import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  ArrowPathIcon,
  CubeIcon,
  DocumentArrowDownIcon,
  ArrowDownTrayIcon,
  ShieldCheckIcon,
  EyeIcon,
  MagnifyingGlassIcon,
  TagIcon,
  BellIcon,
  ArrowTopRightOnSquareIcon,
  VideoCameraIcon,
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
  const [detailActiveMedia, setDetailActiveMedia] = useState<"image" | "video">("image");

  const openProductDetail = (p: Product) => {
    setDetailProduct(p);
    setDetailQuantity(1);
    setDetailActiveMedia(p.video_url ? "video" : "image");
  };

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
    <div className="min-h-screen flex flex-col bg-[#ebe9e5] text-[#151514] antialiased font-sans selection:bg-[#151514] selection:text-[#ebe9e5]">
      {/* Toast Notification */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            key="toast"
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 450, damping: 25 }}
            className="fixed bottom-6 right-6 z-50 bg-[#151514] text-[#ebe9e5] text-xs font-semibold px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2 border border-[#2d2a25]"
          >
            <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ================= NOTCHED ARCHITECTURAL HEADER (SUB-PAGES) ================= */}
      {viewMode !== "store" && (
        <header className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 w-full z-30">
          <div className="bg-white rounded-[28px] p-2.5 shadow-md border border-[#ddd9d2]/80">
            <div className="bg-[#18191b] rounded-[20px] px-4 sm:px-6 py-3 flex items-center justify-between gap-4 relative">
              {/* Brand Left */}
              <div
                onClick={() => navigateTo("store", "/")}
                className="bg-white text-[#151514] px-4 py-2 rounded-2xl flex items-center gap-3 cursor-pointer group select-none shadow-xs"
              >
                {storeSettings.store_logo_url ? (
                  <img
                    src={storeSettings.store_logo_url}
                    alt={storeSettings.store_name}
                    className="w-9 h-9 rounded-xl object-contain"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-xl bg-[#151514] text-white flex items-center justify-center font-black text-lg tracking-tighter">
                    S
                  </div>
                )}
                <div className="leading-none">
                  <span className="block text-[10px] font-bold tracking-[0.2em] text-[#57534e] uppercase">
                    {(storeSettings.store_name || "SUPATMAN STORE").split(" ")[0]}
                  </span>
                  <span className="block text-sm font-black tracking-tight text-[#151514] uppercase">
                    {(storeSettings.store_name || "SUPATMAN STORE").split(" ").slice(1).join(" ") || "STORE"}
                  </span>
                </div>
              </div>

              {/* Center Links */}
              <nav className="hidden md:flex items-center gap-7 text-xs font-medium text-white/80" aria-label="Navigasi Utama">
                <button
                  onClick={() => navigateTo("store", "/")}
                  className="hover:text-white transition-colors"
                >
                  Shop
                </button>
                <button
                  onClick={() => navigateTo("store", "/")}
                  className="hover:text-white transition-colors"
                >
                  Katalog
                </button>
                <button
                  onClick={() => navigateTo("orders", "/orders")}
                  className={`transition-colors ${viewMode === "orders" ? "text-white font-bold underline underline-offset-4" : "hover:text-white"}`}
                >
                  Riwayat Pesanan
                </button>
                <button
                  onClick={() => navigateTo("profile", "/profile")}
                  className={`transition-colors ${viewMode === "profile" ? "text-white font-bold underline underline-offset-4" : "hover:text-white"}`}
                >
                  {currentUser ? currentUser.name.split(" ")[0] : "Akun"}
                </button>
                {currentUser?.role === "admin" && (
                  <button
                    onClick={() => navigateTo("cms", "/cms")}
                    className="text-amber-300 hover:text-amber-200 font-bold transition-colors"
                  >
                    Admin CMS
                  </button>
                )}
              </nav>

              {/* Right Pill Actions */}
              <div className="bg-white px-2.5 py-1.5 rounded-full flex items-center gap-1.5">
                <button
                  onClick={() => navigateTo("orders", "/orders")}
                  className="md:hidden text-[11px] font-bold px-2.5 py-1.5 rounded-full text-[#151514] hover:bg-slate-100"
                >
                  Pesanan
                </button>
                <button
                  onClick={() => navigateTo("cart", "/cart")}
                  className="bg-[#18191b] hover:bg-[#2a2c30] text-white text-xs font-semibold px-4 py-2 rounded-full transition-all flex items-center gap-2"
                >
                  <span>Keranjang</span>
                  {totalCartCount > 0 && (
                    <span className="bg-[#ff5a52] text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                      {totalCartCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => navigateTo("cart", "/cart")}
                  aria-label="Buka Keranjang"
                  className="w-8 h-8 rounded-full bg-[#18191b] hover:bg-[#2a2c30] text-white flex items-center justify-center transition-transform hover:rotate-12"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="7" y1="17" x2="17" y2="7" />
                    <polyline points="7 7 17 7 17 17" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </header>
      )}

      {/* ================= BODY CONTENT ROUTING ================= */}
      <AnimatePresence mode="wait">
        <motion.div
          key={viewMode}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="flex-1 flex flex-col"
        >
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
        <main className="flex-1 max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-7 w-full">
          {/* ================= NOTCHED ARCHITECTURAL HERO & INTEGRATED TOP HEADER ================= */}
          <div className="mb-10">
            {/* Outer White Architectural Frame */}
            <div className="bg-white rounded-[32px] sm:rounded-[42px] p-3 sm:p-4 shadow-2xl border border-[#ddd9d2]/80">
              {/* Inner Dark Studio Canvas */}
              <div className="relative rounded-[24px] sm:rounded-[30px] overflow-hidden bg-[#18191b] min-h-[540px] sm:min-h-[620px] flex flex-col justify-between select-none">
                
                {/* 1. BACKGROUND: Dark Vertical Architectural Wall Panels */}
                <div className="absolute inset-0 grid grid-cols-4 sm:grid-cols-8 pointer-events-none">
                  {Array.from({ length: 8 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="h-full border-r border-white/[0.04] bg-gradient-to-b from-[#202225] via-[#18191b] to-[#121315] relative"
                    >
                      <div className="absolute inset-y-0 left-0 w-[1px] bg-black/50" />
                    </div>
                  ))}
                </div>

                {/* Ambient Warm Studio Spotlight Glows */}
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background:
                      "radial-gradient(circle at 78% 36%, rgba(255, 190, 110, 0.16) 0%, rgba(255, 160, 70, 0.05) 28%, transparent 60%), radial-gradient(circle at 50% 45%, rgba(255, 255, 255, 0.05) 0%, transparent 55%)",
                  }}
                />

                {/* 2. TOP-LEFT CUTOUT NOTCH: Brand Logo ("STYLECRAFT DESIGN" style) */}
                <div
                  onClick={() => navigateTo("store", "/")}
                  className="absolute top-0 left-0 z-30 bg-white rounded-br-[28px] sm:rounded-br-[34px] pr-5 sm:pr-8 pb-3.5 sm:pb-4 pt-1.5 sm:pt-2 pl-2 sm:pl-3 flex items-center gap-3 cursor-pointer group"
                >
                  {/* Inverted Concave Fillet: Top-Right of Left Notch */}
                  <svg
                    className="absolute top-0 -right-7 w-7 h-7 text-white pointer-events-none"
                    viewBox="0 0 28 28"
                    fill="none"
                  >
                    <path d="M0 0H28C12.536 0 0 12.536 0 28V0Z" fill="currentColor" />
                  </svg>
                  {/* Inverted Concave Fillet: Bottom-Left of Left Notch */}
                  <svg
                    className="absolute -bottom-7 left-0 w-7 h-7 text-white pointer-events-none"
                    viewBox="0 0 28 28"
                    fill="none"
                  >
                    <path d="M0 0H28C12.536 0 0 12.536 0 28V0Z" fill="currentColor" />
                  </svg>

                  {/* Monogram / Logo Icon */}
                  {storeSettings.store_logo_url ? (
                    <img
                      src={storeSettings.store_logo_url}
                      alt={storeSettings.store_name}
                      className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl object-contain p-0.5 bg-white group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-[#151514] text-white flex items-center justify-center font-black text-2xl tracking-tighter shadow-sm group-hover:scale-105 transition-transform">
                      S
                    </div>
                  )}

                  {/* Two-line Stacked Typography */}
                  <div className="leading-none">
                    <span className="block text-[10px] sm:text-[11px] font-bold tracking-[0.22em] text-[#292524] uppercase">
                      {(storeSettings.store_name || "SUPATMAN STORE").split(" ")[0]}
                    </span>
                    <span className="block text-base sm:text-xl font-black tracking-tight text-[#151514] uppercase mt-0.5">
                      {(storeSettings.store_name || "SUPATMAN STORE").split(" ").slice(1).join(" ") || "DESIGN"}
                    </span>
                  </div>
                </div>

                {/* 3. TOP-CENTER FLOATING NAVIGATION LINKS */}
                <div className="relative z-20 pt-4 sm:pt-6 px-4 flex items-center justify-center">
                  <nav
                    className="hidden lg:flex items-center gap-10 text-xs sm:text-[13px] font-medium text-white/85"
                    aria-label="Navigasi Utama"
                  >
                    <button
                      onClick={() => navigateTo("store", "/")}
                      className="text-white font-semibold hover:text-[#ff5a52] transition-colors"
                    >
                      Shop
                    </button>
                    <a
                      href="#katalog"
                      className="hover:text-white transition-colors"
                    >
                      Katalog
                    </a>
                    <button
                      onClick={() => navigateTo("orders", "/orders")}
                      className="hover:text-white transition-colors flex items-center gap-1.5"
                    >
                      <span>Riwayat Pesanan</span>
                    </button>
                    <button
                      onClick={() => navigateTo("profile", "/profile")}
                      className="hover:text-white transition-colors"
                    >
                      {currentUser ? currentUser.name.split(" ")[0] : "Akun Saya"}
                    </button>
                    {currentUser?.role === "admin" && (
                      <button
                        onClick={() => navigateTo("cms", "/cms")}
                        className="px-2.5 py-1 rounded-full bg-white/10 text-amber-300 hover:bg-white/20 font-bold text-[11px] transition-all"
                      >
                        Admin CMS
                      </button>
                    )}
                  </nav>
                </div>

                {/* 4. TOP-RIGHT CUTOUT NOTCH: Action Pill + Circle Arrow ("Connect with us ↗" style) */}
                <div className="absolute top-0 right-0 z-30 bg-white rounded-bl-[28px] sm:rounded-bl-[34px] pl-4 sm:pl-6 pb-3.5 sm:pb-4 pt-1.5 sm:pt-2 pr-1.5 sm:pr-2 flex items-center gap-2">
                  {/* Inverted Concave Fillet: Top-Left of Right Notch */}
                  <svg
                    className="absolute top-0 -left-7 w-7 h-7 text-white pointer-events-none"
                    viewBox="0 0 28 28"
                    fill="none"
                  >
                    <path d="M28 0H0C15.464 0 28 12.536 28 28V0Z" fill="currentColor" />
                  </svg>
                  {/* Inverted Concave Fillet: Bottom-Right of Right Notch */}
                  <svg
                    className="absolute -bottom-7 right-0 w-7 h-7 text-white pointer-events-none"
                    viewBox="0 0 28 28"
                    fill="none"
                  >
                    <path d="M28 0H0C15.464 0 28 12.536 28 28V0Z" fill="currentColor" />
                  </svg>

                  {/* Realtime In-App Notifications Bell */}
                  <div className="relative" ref={notificationRef}>
                    <button
                      onClick={() => setIsNotificationsOpen((prev) => !prev)}
                      aria-label={`Notifikasi pesanan (${unreadNotificationsCount} belum dibaca)`}
                      className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-slate-200 hover:bg-slate-100 text-[#151514] flex items-center justify-center transition-all"
                    >
                      <BellIcon className="w-4 h-4" />
                      {unreadNotificationsCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 bg-[#ff5a52] text-white font-bold text-[9px] min-w-[16px] h-[16px] px-1 rounded-full flex items-center justify-center ring-2 ring-white">
                          {unreadNotificationsCount > 9 ? "9+" : unreadNotificationsCount}
                        </span>
                      )}
                    </button>

                    {/* Notification Dropdown Popover */}
                    <AnimatePresence>
                      {isNotificationsOpen && (
                        <motion.div
                          key="notif-dropdown"
                          initial={{ opacity: 0, y: -6, scale: 0.96 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -6, scale: 0.96 }}
                          transition={{ duration: 0.15, ease: "easeOut" }}
                          className="absolute right-0 mt-3 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden"
                        >
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

                          <div className="max-h-[340px] overflow-y-auto divide-y divide-slate-100">
                            {notifications.length === 0 ? (
                              <div className="py-8 px-4 text-center">
                                <BellIcon className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                <p className="text-xs text-slate-600 font-semibold">Belum ada notifikasi pesanan</p>
                                <p className="text-[11px] text-slate-400 mt-1 max-w-xs mx-auto">
                                  Setiap ada perubahan status pesanan Anda, notifikasi realtime akan muncul di sini.
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
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Dark Pill CTA Button ("Connect with us" / Cart) */}
                  <button
                    onClick={() => navigateTo("cart", "/cart")}
                    className="bg-[#1b1c1f] hover:bg-[#2c2e33] text-white text-xs font-semibold px-4 sm:px-5 py-2.5 sm:py-3 rounded-full transition-all flex items-center gap-2 shadow-sm"
                  >
                    <ShoppingBagIcon className="w-4 h-4" />
                    <span className="hidden sm:inline">Keranjang</span>
                    {totalCartCount > 0 && (
                      <span className="bg-[#ff5a52] text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full">
                        {totalCartCount}
                      </span>
                    )}
                  </button>

                  {/* Circular Diagonal Arrow Button (↗) */}
                  <button
                    onClick={() => {
                      if (storeSettings.store_phone) {
                        const cleanPhone = storeSettings.store_phone.replace(/[^0-9]/g, "");
                        const waPhone = cleanPhone.startsWith("0") ? "62" + cleanPhone.slice(1) : cleanPhone;
                        window.open(`https://wa.me/${waPhone}`, "_blank");
                      } else {
                        navigateTo("cart", "/cart");
                      }
                    }}
                    title="Hubungi Kami / Checkout"
                    className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#1b1c1f] hover:bg-[#ff5a52] text-white flex items-center justify-center transition-all hover:rotate-12 shadow-sm"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="7" y1="17" x2="17" y2="7" />
                      <polyline points="7 7 17 7 17 17" />
                    </svg>
                  </button>
                </div>

                {/* 5. HANGING INDUSTRIAL PENDANT LAMPS (Top Right Decorative Studio Lighting) */}
                <div className="hidden md:block absolute top-0 right-[18%] z-10 pointer-events-none">
                  {/* Lamp 1 (Higher, Larger Bronze Dome) */}
                  <div className="flex flex-col items-center">
                    <div className="w-[2px] h-28 bg-gradient-to-b from-black via-zinc-700 to-zinc-800" />
                    <div className="w-3 h-2.5 bg-zinc-800 rounded-t-sm" />
                    <div
                      className="w-24 h-11 rounded-t-full border-b-2 border-amber-200/60 shadow-2xl relative"
                      style={{
                        background: "linear-gradient(135deg, #27272a 0%, #52525b 45%, #78350f 85%, #18181b 100%)",
                      }}
                    >
                      {/* Warm Bulb Glow Underneath */}
                      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-8 h-3 rounded-full bg-amber-200 blur-[4px]" />
                      <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 w-40 h-28 rounded-full bg-amber-400/15 blur-2xl" />
                    </div>
                  </div>
                </div>

                <div className="hidden md:block absolute top-0 right-[11%] z-10 pointer-events-none">
                  {/* Lamp 2 (Lower, Conical Brass Shade) */}
                  <div className="flex flex-col items-center">
                    <div className="w-[1.5px] h-40 bg-gradient-to-b from-black via-zinc-700 to-zinc-800" />
                    <div className="w-2.5 h-3 bg-amber-700/80 rounded-t-sm" />
                    <div
                      className="w-20 h-8 relative"
                      style={{
                        clipPath: "polygon(25% 0%, 75% 0%, 100% 100%, 0% 100%)",
                        background: "linear-gradient(135deg, #78350f 0%, #b45309 45%, #27272a 90%)",
                      }}
                    />
                    <div className="w-6 h-2 rounded-full bg-amber-100 blur-[3px] -mt-0.5" />
                  </div>
                </div>

                {/* 6. CENTER HERO HEADLINE, SUBTITLE & CORAL PILL CTA */}
                <div className="relative z-20 px-5 sm:px-10 pt-16 sm:pt-12 pb-52 sm:pb-60 text-center max-w-3xl mx-auto my-auto">
                  <motion.h1
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4 }}
                    className="text-3xl sm:text-5xl lg:text-[52px] font-extrabold text-white tracking-tight leading-[1.14]"
                    style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}
                  >
                    Modern Setup &amp; Digital
                    <br />
                    for Minimalist Lovers
                  </motion.h1>

                  <motion.p
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, delay: 0.08 }}
                    className="mt-4 text-xs sm:text-sm text-white/75 max-w-md mx-auto leading-relaxed font-sans"
                  >
                    {storeSettings.store_announcement ||
                      "Experience the ultimate relaxation and productivity with our curated collection of serene minimalist hardware & digital designs"}
                  </motion.p>

                  <motion.div
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.15 }}
                    className="mt-7 flex items-center justify-center gap-3"
                  >
                    <a
                      href="#katalog"
                      className="inline-flex items-center gap-3.5 bg-[#ff5a52] hover:bg-[#ff4238] text-white font-semibold text-xs sm:text-sm pl-6 pr-2 py-2 rounded-full shadow-xl shadow-[#ff5a52]/30 transition-all hover:scale-105 active:scale-95 font-sans"
                    >
                      <span>Explore More</span>
                      <span className="w-8 h-8 rounded-full bg-white text-[#151514] flex items-center justify-center shadow-xs">
                        <svg
                          className="w-4 h-4"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <line x1="7" y1="17" x2="17" y2="7" />
                          <polyline points="7 7 17 7 17 17" />
                        </svg>
                      </span>
                    </a>
                  </motion.div>

                  {/* Mobile Quick Navigation Links */}
                  <div className="mt-5 flex lg:hidden items-center justify-center gap-4 text-[11px] font-semibold text-white/75">
                    <a href="#katalog" className="hover:text-white underline underline-offset-4">Katalog</a>
                    <span>•</span>
                    <button onClick={() => navigateTo("orders", "/orders")} className="hover:text-white">Riwayat Pesanan</button>
                    <span>•</span>
                    <button onClick={() => navigateTo("profile", "/profile")} className="hover:text-white">
                      {currentUser ? currentUser.name.split(" ")[0] : "Akun"}
                    </button>
                  </div>
                </div>

                {/* 7. BOTTOM ARCHITECTURAL STUDIO SCENE: Plants, Minimalist Dark Sofa & Wooden Floor */}
                <div className="absolute inset-x-0 bottom-0 z-10 pointer-events-none flex flex-col justify-end">
                  <div className="relative w-full max-w-5xl mx-auto px-4 sm:px-10 flex items-end justify-between -mb-3">
                    {/* Left Indoor Botanical Plants & Planter Pots */}
                    <div className="hidden sm:flex items-end -space-x-4 z-10">
                      {/* Tall Fiddle Leaf Plant */}
                      <div className="flex flex-col items-center">
                        <svg className="w-28 lg:w-36 h-44 lg:h-56 -mb-4 drop-shadow-2xl" viewBox="0 0 140 220" fill="none">
                          <path d="M70 210 C68 150, 65 90, 72 30" stroke="#3f2e21" strokeWidth="3.5" strokeLinecap="round" />
                          <path d="M70 150 C50 135, 30 125, 22 105 C38 100, 58 115, 70 140" fill="#2d5a27" />
                          <path d="M70 130 C92 115, 112 100, 118 80 C100 78, 82 95, 70 120" fill="#3a7033" />
                          <path d="M71 100 C45 85, 20 75, 15 52 C35 48, 58 68, 71 92" fill="#47823d" />
                          <path d="M72 80 C95 62, 118 50, 122 28 C100 30, 82 48, 72 72" fill="#2d5a27" />
                          <path d="M72 52 C55 35, 42 20, 48 6 C65 10, 75 28, 72 48" fill="#529447" />
                          <path d="M72 45 C85 28, 102 18, 98 5 C82 8, 74 25, 72 42" fill="#3a7033" />
                        </svg>
                        <div className="w-16 lg:w-20 h-16 lg:h-20 rounded-b-2xl rounded-t-sm bg-gradient-to-r from-[#232528] via-[#2e3136] to-[#18191b] border-t border-white/10 shadow-2xl" />
                      </div>
                      {/* Medium Green Plant + Warm Wood Side Drum */}
                      <div className="flex items-end gap-2">
                        <div className="flex flex-col items-center">
                          <svg className="w-20 lg:w-24 h-28 lg:h-32 -mb-3 drop-shadow-xl" viewBox="0 0 100 130" fill="none">
                            <path d="M50 120 Q30 80 15 45 Q40 55 50 110" fill="#3a7033" />
                            <path d="M50 120 Q72 75 88 40 Q62 52 50 110" fill="#4d8c42" />
                            <path d="M50 120 Q48 65 50 20 Q60 60 50 115" fill="#5da150" />
                            <path d="M50 120 Q25 95 10 75 Q35 80 50 115" fill="#2d5a27" />
                          </svg>
                          <div className="w-12 lg:w-14 h-14 lg:h-16 rounded-b-xl bg-gradient-to-r from-[#27292d] to-[#1a1c1f] border-t border-white/10 shadow-xl" />
                        </div>
                        <div className="w-10 lg:w-12 h-9 lg:h-11 rounded-lg bg-gradient-to-b from-[#9c6b3b] to-[#6e4720] shadow-xl border-t border-amber-200/30" />
                      </div>
                    </div>

                    {/* Centerpiece Minimalist Charcoal Tufted Studio Sofa */}
                    <div className="mx-auto w-full max-w-md sm:max-w-lg lg:max-w-xl z-20 px-2">
                      <div className="relative flex flex-col items-center">
                        {/* Backrest Cushions */}
                        <div className="w-[84%] flex items-end justify-center gap-2 -mb-3 z-10">
                          <div className="w-1/2 h-14 sm:h-20 rounded-t-2xl bg-gradient-to-b from-[#35373c] via-[#282a2e] to-[#1d1e22] border-t border-white/15 shadow-lg relative">
                            {/* Throw Pillow Left */}
                            <div className="absolute -left-3 bottom-0 w-12 sm:w-14 h-11 sm:h-13 rounded-xl bg-gradient-to-br from-[#3e4046] to-[#222428] -rotate-6 shadow-md border-t border-white/10" />
                          </div>
                          <div className="w-1/2 h-16 sm:h-22 rounded-t-2xl bg-gradient-to-b from-[#383a40] via-[#2a2c30] to-[#1d1e22] border-t border-white/15 shadow-lg relative">
                            {/* Throw Pillow Right */}
                            <div className="absolute left-3 bottom-0 w-14 sm:w-16 h-10 sm:h-12 rounded-xl bg-gradient-to-bl from-[#42454b] to-[#24262a] rotate-3 shadow-md border-t border-white/10" />
                          </div>
                        </div>

                        {/* Sofa Armrests + Deep Low-Profile Seat Base */}
                        <div className="w-full flex items-end">
                          {/* Left Armrest */}
                          <div className="w-10 sm:w-14 h-16 sm:h-20 rounded-tl-3xl rounded-bl-xl bg-gradient-to-r from-[#24262a] via-[#313338] to-[#202226] border-t border-white/10 shadow-2xl -mr-2 z-20" />
                          {/* Main Double Seat Cushion */}
                          <div className="flex-1 grid grid-cols-2 gap-0.5 bg-[#141517] rounded-t-xl overflow-hidden shadow-2xl border-t border-white/10">
                            <div className="h-14 sm:h-18 bg-gradient-to-b from-[#32343a] via-[#26282c] to-[#1b1c20] relative">
                              <div className="absolute inset-x-4 top-2 h-[1px] bg-white/10" />
                            </div>
                            <div className="h-14 sm:h-18 bg-gradient-to-b from-[#34363c] via-[#26282c] to-[#1b1c20] relative">
                              <div className="absolute inset-x-4 top-2 h-[1px] bg-white/10" />
                            </div>
                          </div>
                          {/* Right Armrest */}
                          <div className="w-10 sm:w-14 h-16 sm:h-20 rounded-tr-3xl rounded-br-xl bg-gradient-to-l from-[#24262a] via-[#313338] to-[#202226] border-t border-white/10 shadow-2xl -ml-2 z-20" />
                        </div>
                      </div>
                    </div>

                    {/* Right Indoor Plant & Warm Wood Ottoman */}
                    <div className="hidden sm:flex items-end gap-2 z-10">
                      <div className="w-10 lg:w-12 h-9 lg:h-11 rounded-lg bg-gradient-to-b from-[#b8864c] to-[#7c5325] shadow-xl border-t border-amber-100/40" />
                      <div className="flex flex-col items-center">
                        <svg className="w-24 lg:w-28 h-32 lg:h-40 -mb-3 drop-shadow-2xl" viewBox="0 0 120 160" fill="none">
                          <path d="M60 150 C58 110, 55 75, 60 35" stroke="#3f2e21" strokeWidth="3" />
                          <path d="M60 120 C35 105, 18 90, 15 68 C35 68, 50 85, 60 112" fill="#3a7033" />
                          <path d="M60 105 C85 90, 102 75, 105 52 C85 52, 70 72, 60 98" fill="#4d8c42" />
                          <path d="M60 80 C40 62, 28 45, 32 24 C50 28, 58 50, 60 75" fill="#5da150" />
                          <path d="M60 65 C78 48, 92 35, 88 16 C72 20, 64 42, 60 60" fill="#2d5a27" />
                        </svg>
                        <div className="w-14 lg:w-16 h-14 lg:h-16 rounded-b-2xl bg-gradient-to-r from-[#2c2e33] via-[#383b42] to-[#1e2024] border-t border-white/15 shadow-2xl" />
                      </div>
                    </div>
                  </div>

                  {/* Warm Wooden Slatted Studio Floor */}
                  <div
                    className="h-9 sm:h-12 w-full border-t border-amber-900/40 relative overflow-hidden"
                    style={{
                      background:
                        "linear-gradient(180deg, #3d2817 0%, #5c3d24 35%, #785130 70%, #4a301b 100%)",
                    }}
                  >
                    {/* Perspective Wood Plank Lines */}
                    <div
                      className="absolute inset-0 opacity-35"
                      style={{
                        backgroundImage:
                          "repeating-linear-gradient(90deg, transparent, transparent 48px, rgba(0,0,0,0.45) 48px, rgba(0,0,0,0.45) 50px)",
                      }}
                    />
                    {/* Floor Ambient Shadow under Sofa */}
                    <div className="absolute inset-x-1/4 top-0 h-5 bg-black/60 blur-md" />
                  </div>
                </div>
              </div>
            </div>

            {/* 3 Keunggulan Atelier Badges */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-5 mt-5">
              <div className="flex items-center gap-2.5 text-xs text-[#151514] font-semibold p-3.5 rounded-2xl bg-white border border-[#ddd9d2] shadow-2xs">
                <div className="w-8 h-8 rounded-xl bg-[#ebe9e5] text-[#151514] flex items-center justify-center flex-shrink-0 border border-[#ddd9d2]">
                  <TruckIcon className="w-4 h-4" />
                </div>
                <span>Ekspedisi Kilat &amp; Resi</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-[#151514] font-semibold p-3.5 rounded-2xl bg-white border border-[#ddd9d2] shadow-2xs">
                <div className="w-8 h-8 rounded-xl bg-[#ebe9e5] text-[#151514] flex items-center justify-center flex-shrink-0 border border-[#ddd9d2]">
                  <ArrowDownTrayIcon className="w-4 h-4" />
                </div>
                <span>Akses Unduh Instan</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-[#151514] font-semibold p-3.5 rounded-2xl bg-white border border-[#ddd9d2] shadow-2xs">
                <div className="w-8 h-8 rounded-xl bg-[#ebe9e5] text-[#151514] flex items-center justify-center flex-shrink-0 border border-[#ddd9d2]">
                  <ShieldCheckIcon className="w-4 h-4" />
                </div>
                <span>Verifikasi Lunas Realtime</span>
              </div>
            </div>
          </div>

          {/* Search & Filter Bar (Segmented Control, Search Input & Category Tags) */}
          <section id="katalog" className="space-y-4 mb-8 scroll-mt-6" aria-label="Filter dan pencarian kategori">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="inline-flex p-1 bg-[#ddd9d2]/60 rounded-2xl border border-[#ddd9d2] self-start">
                <button
                  onClick={() => {
                    setDigitalFilter("");
                    setSelectedCategory("");
                  }}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all tap-effect ${
                    digitalFilter === "" && selectedCategory === ""
                      ? "bg-white text-[#151514] shadow-xs"
                      : "text-[#57534e] hover:text-[#151514]"
                  }`}
                >
                  Semua Koleksi
                </button>
                <button
                  onClick={() => setDigitalFilter("false")}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 tap-effect ${
                    digitalFilter === "false"
                      ? "bg-white text-[#151514] shadow-xs"
                      : "text-[#57534e] hover:text-[#151514]"
                  }`}
                >
                  <CubeIcon className="w-4 h-4 text-[#151514]" />
                  <span>Barang Fisik</span>
                </button>
                <button
                  onClick={() => setDigitalFilter("true")}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 tap-effect ${
                    digitalFilter === "true"
                      ? "bg-white text-[#151514] shadow-xs"
                      : "text-[#57534e] hover:text-[#151514]"
                  }`}
                >
                  <DocumentArrowDownIcon className="w-4 h-4 text-[#151514]" />
                  <span>Aset Digital</span>
                </button>
              </div>

              {/* Integrated Search Bar */}
              <div className="relative w-full md:w-80">
                <label htmlFor="search-input" className="sr-only">Cari produk</label>
                <MagnifyingGlassIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#78716c]" />
                <input
                  id="search-input"
                  type="text"
                  placeholder="Cari produk fisik atau digital..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-white border border-[#ddd9d2] rounded-2xl pl-10 pr-10 py-2.5 text-xs text-[#151514] placeholder-[#78716c] focus:outline-none focus:border-[#151514] shadow-2xs transition-all"
                />
                {search ? (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                ) : (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] font-semibold text-[#78716c] border border-[#ddd9d2] px-1.5 py-0.5 rounded bg-[#f5f3ef]">
                    /
                  </span>
                )}
              </div>
            </div>

            {/* Category Pills */}
            {categories.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {categories.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCategory(selectedCategory === c.slug ? "" : c.slug)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all tap-effect ${
                      selectedCategory === c.slug
                        ? "bg-[#151514] text-[#ebe9e5] shadow-xs"
                        : "bg-white text-[#57534e] hover:text-[#151514] border border-[#ddd9d2]"
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
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
                <motion.div
                  key={product.id}
                  layout
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  whileHover={{ y: -4 }}
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
                    <div className="absolute top-3 left-3 flex flex-wrap gap-1.5 max-w-[85%]">
                      {product.affiliate_links && product.affiliate_links.length > 0 ? (
                        <span className="badge-pill bg-amber-500/95 backdrop-blur-md text-white border-amber-300 shadow-xs font-bold">
                          <span>🔗 AFILIASI</span>
                        </span>
                      ) : product.is_digital ? (
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

                      {product.video_url && (
                        <span className="badge-pill bg-indigo-600/90 backdrop-blur-md text-white border-indigo-400 shadow-xs font-bold">
                          <span>🎬 VIDEO</span>
                        </span>
                      )}
                    </div>
                    {/* Quick Detail Hover Action */}
                    <div 
                      onClick={() => openProductDetail(product)}
                      className="absolute inset-0 bg-slate-950/20 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer"
                    >
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
                        <span>
                          {product.affiliate_links && product.affiliate_links.length > 0
                            ? "MARKETPLACE"
                            : product.is_digital
                            ? "INSTANT"
                            : `STOK: ${product.stock}`}
                        </span>
                      </div>
                      <h2
                        onClick={() => openProductDetail(product)}
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
                          <span className="text-[10px] text-slate-400 block font-mono uppercase tracking-wider">
                            {product.affiliate_links && product.affiliate_links.length > 0 ? "Estimasi Harga" : "Harga Resmi"}
                          </span>
                          <span className="text-base font-extrabold text-slate-900 num-tabular tracking-tight">
                            {formatIDR(product.price)}
                          </span>
                        </div>
                      </div>

                      {product.affiliate_links && product.affiliate_links.length > 0 ? (
                        <div>
                          {product.affiliate_links.length === 1 ? (
                            <a
                              href={product.affiliate_links[0].url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className={`w-full py-2.5 px-3 rounded-xl text-xs font-bold text-white shadow-xs transition-all flex items-center justify-center gap-1.5 tap-effect ${
                                product.affiliate_links[0].platform === "shopee"
                                  ? "bg-[#EE4D2D] hover:bg-[#d63f21]"
                                  : product.affiliate_links[0].platform === "tiktok"
                                  ? "bg-[#010101] hover:bg-[#222]"
                                  : product.affiliate_links[0].platform === "tokopedia"
                                  ? "bg-[#03AC0E] hover:bg-[#028b0b]"
                                  : "bg-[#151514] hover:bg-[#2d2a25]"
                              }`}
                            >
                              <span>{product.affiliate_links[0].title || "Beli di Marketplace"}</span>
                              <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5 flex-shrink-0" />
                            </a>
                          ) : (
                            <button
                              onClick={() => openProductDetail(product)}
                              className="w-full py-2.5 px-3 rounded-xl bg-[#151514] hover:bg-[#2d2a25] text-xs font-bold text-[#ebe9e5] shadow-xs transition-all flex items-center justify-center gap-1.5 tap-effect"
                            >
                              <span>Beli via Affiliate ({product.affiliate_links.length})</span>
                              <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5 flex-shrink-0" />
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => addToCart(product, 1, false)}
                            className="w-full py-2.5 px-3 rounded-xl bg-[#f5f3ef] hover:bg-[#e8e5df] text-xs font-semibold text-[#151514] transition-all border border-[#ddd9d2] tap-effect"
                          >
                            + Keranjang
                          </button>
                          <button
                            onClick={() => {
                              addToCart(product, 1, false);
                              navigateTo("cart", "/cart");
                            }}
                            className="w-full py-2.5 px-3 rounded-xl bg-[#151514] hover:bg-[#2d2a25] text-xs font-bold text-[#ebe9e5] shadow-xs transition-all tap-effect"
                          >
                            Beli Langsung
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </section>
          )}
        </main>
      )}
        </motion.div>
      </AnimatePresence>

      {/* Product Detail Quick View Modal */}
      <AnimatePresence>
        {detailProduct && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-label={`Detail produk ${detailProduct.name}`}
          >
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setDetailProduct(null)}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ type: "spring", stiffness: 380, damping: 26 }}
              className="bg-[#f5f3ef] border border-[#ddd9d2] rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl relative my-8 z-10 text-[#151514]"
            >
              <button
                onClick={() => setDetailProduct(null)}
                aria-label="Tutup detail produk"
                className="absolute top-6 right-6 p-1.5 rounded-full text-[#7a7469] hover:text-[#151514] hover:bg-[#ddd9d2]/50 transition-colors"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-start">
                {/* Media Preview (Video or Image) */}
                <div className="space-y-2">
                  <div className="rounded-2xl overflow-hidden border border-[#ddd9d2] bg-[#ebe9e5] aspect-square relative flex items-center justify-center">
                    {detailActiveMedia === "video" && detailProduct.video_url ? (
                      <video
                        src={detailProduct.video_url}
                        controls
                        playsInline
                        autoPlay
                        loop
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <img
                        src={detailProduct.image_url || "https://images.unsplash.com/photo-1526738549149-8e07eca6c147?auto=format&fit=crop&w=600&q=80"}
                        alt={detailProduct.name}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>

                  {/* Switcher Tab if video exists */}
                  {detailProduct.video_url && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setDetailActiveMedia("video")}
                        className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border ${
                          detailActiveMedia === "video"
                            ? "bg-[#151514] text-[#ebe9e5] border-[#151514]"
                            : "bg-[#ebe9e5] text-[#151514] border-[#ddd9d2] hover:bg-[#ddd9d2]"
                        }`}
                      >
                        <VideoCameraIcon className="w-4 h-4" />
                        <span>Putar Video</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setDetailActiveMedia("image")}
                        className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 border ${
                          detailActiveMedia === "image"
                            ? "bg-[#151514] text-[#ebe9e5] border-[#151514]"
                            : "bg-[#ebe9e5] text-[#151514] border-[#ddd9d2] hover:bg-[#ddd9d2]"
                        }`}
                      >
                        <span>📸 Foto Produk</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Product Info */}
                <div className="flex flex-col justify-between h-full space-y-4">
                  <div>
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      {detailProduct.affiliate_links && detailProduct.affiliate_links.length > 0 && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500 text-white">
                          🔗 Produk Afiliasi
                        </span>
                      )}
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          detailProduct.is_digital
                            ? "bg-[#2d2a25] text-[#ebe9e5]"
                            : "bg-[#ddd9d2] text-[#151514]"
                        }`}
                      >
                        {detailProduct.is_digital ? "Produk Digital" : "Barang Fisik"}
                      </span>
                      {detailProduct.category_name && (
                        <span className="text-xs text-[#7a7469] font-medium">
                          • {detailProduct.category_name}
                        </span>
                      )}
                    </div>

                    <h2 className="text-xl sm:text-2xl font-bold text-[#151514] leading-snug">
                      {detailProduct.name}
                    </h2>

                    <div className="my-3">
                      <span className="text-[10px] text-[#7a7469] block font-mono uppercase tracking-wider mb-0.5">
                        {detailProduct.affiliate_links && detailProduct.affiliate_links.length > 0
                          ? "Estimasi Harga Marketplace"
                          : "Harga Resmi"}
                      </span>
                      <span className="text-2xl font-black text-[#151514] num-tabular">
                        {formatIDR(detailProduct.price)}
                      </span>
                    </div>

                    <p className="text-xs text-[#524d45] leading-relaxed max-h-36 overflow-y-auto">
                      {detailProduct.description || "Tidak ada deskripsi detail untuk produk ini."}
                    </p>

                    <div className="pt-3 border-t border-[#ddd9d2] text-xs text-[#6b665c] space-y-1">
                      <div>
                        Tipe Pengiriman:{" "}
                        <span className="font-semibold text-[#151514]">
                          {detailProduct.affiliate_links && detailProduct.affiliate_links.length > 0
                            ? "Sesuai Marketplace Terpilih"
                            : detailProduct.is_digital
                            ? "Download Instan"
                            : "Ekspedisi / Kurir"}
                        </span>
                      </div>
                      <div>
                        Ketersediaan:{" "}
                        <span className="font-semibold text-[#151514]">
                          {detailProduct.affiliate_links && detailProduct.affiliate_links.length > 0
                            ? "Tersedia di Marketplace"
                            : detailProduct.is_digital
                            ? "Selalu Tersedia"
                            : `Stok ${detailProduct.stock} unit`}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions: Affiliate vs Local Checkout */}
                  <div className="pt-2">
                    {detailProduct.affiliate_links && detailProduct.affiliate_links.length > 0 ? (
                      <div className="space-y-3">
                        <div className="p-3 bg-amber-50 border border-amber-200/90 rounded-2xl space-y-1">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
                            <span>🔗</span>
                            <span>Tersedia via Marketplace Resmi</span>
                          </div>
                          <p className="text-[11px] text-amber-800 leading-relaxed">
                            Produk ini hanya dapat dipesan melalui mitra marketplace resmi kami. Klik tombol di bawah untuk langsung menuju aplikasi/situs terkait:
                          </p>
                        </div>

                        <div className="space-y-2">
                          {detailProduct.affiliate_links.map((link, idx) => {
                            let brandBg = "bg-[#151514] hover:bg-[#2d2a25] text-white";
                            let iconLabel = "🛍️";
                            if (link.platform === "shopee") {
                              brandBg = "bg-[#EE4D2D] hover:bg-[#d63f21] text-white shadow-sm shadow-orange-500/20";
                              iconLabel = "🟠";
                            } else if (link.platform === "tiktok") {
                              brandBg = "bg-[#010101] hover:bg-[#222] text-white border border-slate-700 shadow-sm";
                              iconLabel = "🎵";
                            } else if (link.platform === "tokopedia") {
                              brandBg = "bg-[#03AC0E] hover:bg-[#028b0b] text-white shadow-sm shadow-emerald-500/20";
                              iconLabel = "🟢";
                            } else if (link.platform === "lazada") {
                              brandBg = "bg-[#0F146D] hover:bg-[#0c1055] text-white shadow-sm shadow-indigo-500/20";
                              iconLabel = "🔵";
                            }

                            return (
                              <a
                                key={idx}
                                href={link.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`w-full py-3 px-4 rounded-xl font-bold text-xs transition-all flex items-center justify-between gap-2 tap-effect ${brandBg}`}
                              >
                                <span className="flex items-center gap-2">
                                  <span>{iconLabel}</span>
                                  <span>{link.title || `Beli di ${link.platform.toUpperCase()}`}</span>
                                </span>
                                <ArrowTopRightOnSquareIcon className="w-4 h-4 flex-shrink-0" />
                              </a>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-semibold text-[#6b665c]">Jumlah:</span>
                          <div className="flex items-center border border-[#ddd9d2] rounded-xl bg-[#ebe9e5]">
                            <button
                              onClick={() => setDetailQuantity(Math.max(1, detailQuantity - 1))}
                              aria-label="Kurangi jumlah detail"
                              className="p-2 text-[#524d45] hover:text-[#151514]"
                            >
                              <MinusIcon className="w-3.5 h-3.5" />
                            </button>
                            <span className="text-xs font-bold px-3 num-tabular text-[#151514]">{detailQuantity}</span>
                            <button
                              onClick={() => setDetailQuantity(detailQuantity + 1)}
                              aria-label="Tambah jumlah detail"
                              className="p-2 text-[#524d45] hover:text-[#151514]"
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
                            className="py-3 px-4 rounded-xl bg-[#ebe9e5] hover:bg-[#ddd9d2] text-xs font-bold text-[#151514] border border-[#ddd9d2] transition-all tap-effect"
                          >
                            + Ke Keranjang
                          </button>
                          <button
                            onClick={() => {
                              addToCart(detailProduct, detailQuantity, false);
                              setDetailProduct(null);
                              navigateTo("cart", "/cart");
                            }}
                            className="py-3 px-4 rounded-xl bg-[#151514] hover:bg-[#2d2a25] text-xs font-bold text-[#ebe9e5] shadow-xs transition-all tap-effect"
                          >
                            Beli Sekarang
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Editorial Atelier Footer */}
      <footer className="border-t border-[#ddd9d2] bg-[#f5f3ef] mt-20 pt-16 pb-12 text-[#151514]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 pb-12 border-b border-[#ddd9d2]">
            <div className="md:col-span-6">
              <div className="flex items-center gap-2.5 mb-3">
                {storeSettings.store_logo_url ? (
                  <img
                    src={storeSettings.store_logo_url}
                    alt={storeSettings.store_name}
                    className="w-8 h-8 rounded-xl object-contain border border-[#ddd9d2] p-0.5 bg-[#ebe9e5]"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-xl bg-[#151514] text-[#ebe9e5] flex items-center justify-center font-bold">
                    <CubeIcon className="w-4 h-4" />
                  </div>
                )}
                <span className="font-heading font-black text-base text-[#151514] tracking-tight">
                  {storeSettings.store_name || "SUPATMAN STORE"}
                </span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#ddd9d2] text-[#151514]">
                  {storeSettings.store_badge || "ATELIER"}
                </span>
              </div>
              <p className="text-xs text-[#524d45] leading-relaxed max-w-md mb-3">
                {storeSettings.store_tagline || "Kurasi perlengkapan meja kerja berdesain minimalis dan koleksi aset digital berkualitas tinggi. Dirancang untuk developer, kreator, dan profesional modern."}
              </p>
              {storeSettings.store_address && (
                <p className="text-[11px] text-[#7a7469] font-mono">
                  📍 {storeSettings.store_address}
                </p>
              )}
            </div>

            <div className="md:col-span-3">
              <h4 className="font-mono text-[11px] font-bold text-[#151514] uppercase tracking-wider mb-3">
                Navigasi Cepat
              </h4>
              <ul className="space-y-2 text-xs text-[#524d45]">
                <li>
                  <button onClick={() => navigateTo("store", "/")} className="hover:text-[#151514] font-medium transition-colors">
                    Katalog Produk
                  </button>
                </li>
                <li>
                  <button onClick={() => navigateTo("orders", "/orders")} className="hover:text-[#151514] font-medium transition-colors">
                    Pelacakan &amp; Resi Pesanan
                  </button>
                </li>
                <li>
                  <button onClick={() => navigateTo("cart", "/cart")} className="hover:text-[#151514] font-medium transition-colors">
                    Keranjang Belanja
                  </button>
                </li>
              </ul>
            </div>

            <div className="md:col-span-3">
              <h4 className="font-mono text-[11px] font-bold text-[#151514] uppercase tracking-wider mb-3">
                Hubungi Kami
              </h4>
              <div className="space-y-2 text-xs text-[#524d45]">
                {storeSettings.store_phone && (
                  <p className="text-xs font-mono font-semibold text-[#151514]">
                    WA/Telp: {storeSettings.store_phone}
                  </p>
                )}
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#ebe9e5] border border-[#ddd9d2] text-[11px] font-mono text-[#151514]">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span>LAYANAN SISTEM AKTIF 24/7</span>
                </div>
                <p className="text-[11px] text-[#7a7469]">
                  Didukung enkripsi TLS &amp; validasi pembayaran otomatis.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#7a7469] font-mono">
            <p>© {new Date().getFullYear()} {storeSettings.store_name || "Supatman Store"}. All Rights Reserved.</p>
            <p className="text-[11px]">Belanja Aman &amp; Terverifikasi Otomatis</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
