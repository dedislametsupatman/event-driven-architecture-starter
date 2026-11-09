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

export type ViewMode = "store" | "cart" | "orders" | "profile" | "cms" | "manga";

export default function App() {
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window !== "undefined") {
      const path = window.location.pathname.toLowerCase();
      const hash = window.location.hash.toLowerCase();
      if (path.startsWith("/cms") || hash === "#/cms" || hash === "#cms") return "cms";
      if (path.startsWith("/cart") || hash === "#/cart" || hash === "#cart") return "cart";
      if (path.startsWith("/order/") || path.startsWith("/orders") || hash === "#/orders" || hash === "#orders") return "orders";
      if (path.startsWith("/profile") || hash === "#/profile" || hash === "#profile") return "profile";
      if (path.startsWith("/manga") || hash === "#/manga" || hash === "#manga") return "manga";
    }
    return "store";
  });

  const [activeOrderId, setActiveOrderId] = useState<number | string | null>(() => {
    if (typeof window !== "undefined") {
      const path = window.location.pathname;
      const orderMatch = path.match(/^\/orders?\/([^/?#]+)/i);
      if (orderMatch && orderMatch[1]) {
        return orderMatch[1];
      }
      const params = new URLSearchParams(window.location.search);
      const id = params.get("id") || params.get("order_id");
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
      } else if (path.startsWith("/order/") || path.startsWith("/orders") || hash === "#/orders" || hash === "#orders") {
        setViewMode("orders");
        const orderMatch = window.location.pathname.match(/^\/orders?\/([^/?#]+)/i);
        if (orderMatch && orderMatch[1]) {
          setActiveOrderId(orderMatch[1]);
        } else {
          const params = new URLSearchParams(window.location.search);
          const id = params.get("id") || params.get("order_id");
          if (id) setActiveOrderId(id);
        }
      } else if (path.startsWith("/profile") || hash === "#/profile" || hash === "#profile") {
        setViewMode("profile");
      } else if (path.startsWith("/manga") || hash === "#/manga" || hash === "#manga") {
        setViewMode("manga");
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

  // 3D Hero Carousel State (3 Slides: Gadget & Sepeda, Web & Mobile Apps, Affiliate)
  const [heroSlide, setHeroSlide] = useState<number>(0);
  const [isHeroPaused, setIsHeroPaused] = useState<boolean>(false);
  const [heroTilt, setHeroTilt] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    if (isHeroPaused || viewMode !== "store") return;
    const timer = setInterval(() => {
      setHeroSlide((prev) => (prev + 1) % 3);
    }, 6000);
    return () => clearInterval(timer);
  }, [isHeroPaused, viewMode]);

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
        onBackToStore={() => {
          loadPaymentMethods();
          navigateTo("store", "/");
        }}
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
              <nav className="hidden md:flex items-center gap-7 text-xs font-medium text-white" aria-label="Navigasi Utama">
                <button
                  onClick={() => navigateTo("store", "/")}
                  className="text-stone-200 hover:text-white transition-colors"
                >
                  Shop
                </button>
                <button
                  onClick={() => navigateTo("store", "/")}
                  className="text-stone-200 hover:text-white transition-colors"
                >
                  Katalog
                </button>
                <button
                  onClick={() => navigateTo("manga", "/manga")}
                  className={`transition-colors flex items-center gap-1.5 ${viewMode === "manga" ? "text-white font-bold underline underline-offset-4" : "text-stone-200 hover:text-white"}`}
                >
                  <span>Manga</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white font-bold text-[9px]">HOT</span>
                </button>
                <button
                  onClick={() => navigateTo("orders", "/orders")}
                  className={`transition-colors ${viewMode === "orders" ? "text-white font-bold underline underline-offset-4" : "text-stone-200 hover:text-white"}`}
                >
                  Riwayat Pesanan
                </button>
                <button
                  onClick={() => navigateTo("profile", "/profile")}
                  className={`transition-colors ${viewMode === "profile" ? "text-white font-bold underline underline-offset-4" : "text-stone-200 hover:text-white"}`}
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
              navigateTo("orders", `/order/${order.id}`);
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
      ) : viewMode === "manga" ? (
        /* Dedicated Portalbun Manga Reader (manga.rasb.co.id iframe) */
        <main className="flex-1 max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-5 w-full">
          <div className="bg-[#14161a] border border-[#2d2a25] rounded-[28px] sm:rounded-[36px] p-3 sm:p-5 shadow-2xl space-y-3.5">
            {/* Manga Reader Toolbar Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-white/10 px-1">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigateTo("store", "/")}
                  className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
                >
                  <span>← Kembali ke Toko</span>
                </button>
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-base sm:text-lg font-black text-white tracking-tight">
                      Portalbun Manga Reader
                    </h1>
                  </div>
                  <p className="text-[11px] text-stone-400">
                    Koleksi komik dan web manga pilihan, terintegrasi langsung di Portalbun
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <button
                  onClick={() => {
                    const iframe = document.getElementById("portalbun-manga-iframe") as HTMLIFrameElement;
                    if (iframe) iframe.src = iframe.src;
                  }}
                  className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-stone-300 hover:text-white text-xs transition-colors flex items-center gap-1.5 border border-white/10"
                  title="Muat ulang reader manga"
                >
                  <span>↻ Muat Ulang</span>
                </button>
                <a
                  href="https://manga.rasb.co.id"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-xl bg-white text-[#151514] hover:bg-stone-200 text-xs font-bold transition-colors flex items-center gap-1.5"
                >
                  <span>Buka di Tab Baru</span>
                  <span>↗</span>
                </a>
              </div>
            </div>

            {/* Iframe Viewport Container */}
            <div className="relative w-full rounded-2xl overflow-hidden bg-[#0d0f12] border border-white/10 shadow-inner">
              <iframe
                id="portalbun-manga-iframe"
                src="https://manga.rasb.co.id"
                title="Portalbun Manga Reader"
                className="w-full h-[calc(100vh-210px)] min-h-[680px] border-0"
                allow="fullscreen; clipboard-read; clipboard-write; autoplay; picture-in-picture"
                loading="lazy"
              />
            </div>
          </div>
        </main>
      ) : (
        /* Dedicated Storefront Catalog Page */
        <main className="flex-1 max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-5 sm:py-7 w-full">
          {/* ================= NOTCHED ARCHITECTURAL HERO & INTEGRATED TOP HEADER ================= */}
          <div className="mb-10">
            {/* Outer White Architectural Frame */}
            <div className="bg-white rounded-[32px] sm:rounded-[42px] p-3 sm:p-4 shadow-2xl border border-[#ddd9d2]/80">
              {/* Inner Dark Studio Canvas with 3D Mouse Perspective & Auto-Play Pause on Hover */}
              <div
                onMouseEnter={() => setIsHeroPaused(true)}
                onMouseLeave={() => {
                  setIsHeroPaused(false);
                  setHeroTilt({ x: 0, y: 0 });
                }}
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const nx = (e.clientX - rect.left) / rect.width - 0.5;
                  const ny = (e.clientY - rect.top) / rect.height - 0.5;
                  setHeroTilt({ x: nx * 12, y: -ny * 10 });
                }}
                className="relative rounded-[24px] sm:rounded-[30px] overflow-hidden bg-[#18191b] min-h-[580px] sm:min-h-[650px] flex flex-col justify-between select-none"
                style={{ perspective: "1200px" }}
              >
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

                {/* Dynamic Ambient Studio Spotlight Glow per Slide */}
                <div
                  className="absolute inset-0 pointer-events-none transition-all duration-700"
                  style={{
                    background:
                      heroSlide === 0
                        ? "radial-gradient(circle at 78% 36%, rgba(255, 190, 110, 0.18) 0%, rgba(255, 90, 82, 0.08) 32%, transparent 62%), radial-gradient(circle at 30% 60%, rgba(16, 185, 129, 0.09) 0%, transparent 55%)"
                        : heroSlide === 1
                        ? "radial-gradient(circle at 75% 36%, rgba(56, 189, 248, 0.18) 0%, rgba(99, 102, 241, 0.12) 35%, transparent 65%), radial-gradient(circle at 25% 55%, rgba(168, 85, 247, 0.10) 0%, transparent 55%)"
                        : "radial-gradient(circle at 78% 36%, rgba(255, 140, 66, 0.20) 0%, rgba(238, 77, 45, 0.10) 35%, transparent 62%), radial-gradient(circle at 30% 55%, rgba(250, 204, 21, 0.10) 0%, transparent 55%)",
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
                    className="hidden lg:flex items-center gap-10 text-xs sm:text-[13px] font-semibold text-white"
                    aria-label="Navigasi Utama"
                  >
                    <button
                      onClick={() => navigateTo("store", "/")}
                      className="text-white hover:text-amber-200 transition-colors font-bold"
                    >
                      Shop
                    </button>
                    <a
                      href="#katalog"
                      className="text-stone-200 hover:text-white transition-colors"
                    >
                      Katalog
                    </a>
                    <button
                      onClick={() => navigateTo("manga", "/manga")}
                      className="text-stone-200 hover:text-white transition-colors flex items-center gap-1.5"
                    >
                      <span>Manga</span>
                      <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white font-bold text-[9px]">HOT</span>
                    </button>
                    <button
                      onClick={() => navigateTo("orders", "/orders")}
                      className="text-stone-200 hover:text-white transition-colors flex items-center gap-1.5"
                    >
                      <span>Riwayat Pesanan</span>
                    </button>
                    <button
                      onClick={() => navigateTo("profile", "/profile")}
                      className="text-stone-200 hover:text-white transition-colors"
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

                {/* 6. 3-SLIDE 3D ANIMATED CAROUSEL CONTENT & CONTROLS */}
                <div className="relative z-20 px-5 sm:px-10 pt-16 sm:pt-10 pb-56 sm:pb-64 text-center max-w-4xl mx-auto my-auto">
                  {/* Prev / Next Floating Side Arrows (Desktop) */}
                  <button
                    onClick={() => setHeroSlide((prev) => (prev + 2) % 3)}
                    aria-label="Slide Sebelumnya"
                    className="hidden md:flex absolute left-0 top-1/3 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white items-center justify-center backdrop-blur-md transition-all hover:scale-110"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="15 18 9 12 15 6" />
                    </svg>
                  </button>
                  <button
                    onClick={() => setHeroSlide((prev) => (prev + 1) % 3)}
                    aria-label="Slide Selanjutnya"
                    className="hidden md:flex absolute right-0 top-1/3 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 border border-white/15 text-white items-center justify-center backdrop-blur-md transition-all hover:scale-110"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>

                  <AnimatePresence mode="wait">
                    <motion.div
                      key={heroSlide}
                      initial={{ opacity: 0, y: 18, rotateX: -10 }}
                      animate={{ opacity: 1, y: 0, rotateX: 0 }}
                      exit={{ opacity: 0, y: -16, rotateX: 10 }}
                      transition={{ duration: 0.42, ease: "easeOut" }}
                    >
                      {/* Category Eyebrow Pill */}
                      <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/10 border border-white/15 backdrop-blur-md text-[10px] sm:text-[11px] font-mono font-bold tracking-widest uppercase text-white/90 mb-3.5">
                        <span
                          className={`w-2 h-2 rounded-full animate-pulse ${
                            heroSlide === 0
                              ? "bg-emerald-400"
                              : heroSlide === 1
                              ? "bg-sky-400"
                              : "bg-amber-400"
                          }`}
                        />
                        <span>
                          {heroSlide === 0
                            ? "01 • AKSESORIS GADGET & SEPEDA"
                            : heroSlide === 1
                            ? "02 • PEMBUATAN WEBSITE & MOBILE APPS"
                            : "03 • KATALOG PRODUK AFFILIATE PILIHAN"}
                        </span>
                      </div>

                      {/* Main Headline */}
                      <h1
                        className="text-2xl sm:text-5xl lg:text-[50px] font-extrabold text-white tracking-tight leading-[1.14]"
                        style={{
                          fontFamily:
                            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
                        }}
                      >
                        {heroSlide === 0 ? (
                          <>
                            Aksesoris Gadget &amp; Sepeda
                            <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-white via-amber-100 to-emerald-200">
                              for Minimalist Riders
                            </span>
                          </>
                        ) : heroSlide === 1 ? (
                          <>
                            Pembuatan Website &amp;
                            <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-200 via-white to-indigo-200">
                              Mobile Apps Modern
                            </span>
                          </>
                        ) : (
                          <>
                            Kurasi Produk Affiliate
                            <br />
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-white to-rose-200">
                              Terbaik &amp; Terverifikasi
                            </span>
                          </>
                        )}
                      </h1>

                      {/* Subtitle */}
                      <p className="mt-3.5 text-xs sm:text-sm text-white/75 max-w-lg mx-auto leading-relaxed font-sans">
                        {heroSlide === 0
                          ? "Perlengkapan setup gadget presisi, mounting sepeda carbon, cyclocomputer GPS, dan lampu pintar untuk mobilitas harian Anda."
                          : heroSlide === 1
                          ? "Jasa pengembangan website berkinerja tinggi, aplikasi iOS & Android custom, serta koleksi source code & UI/UX kit siap pakai."
                          : "Rekomendasi produk pilihan dari Shopee, TikTok Shop, Tokopedia & Lazada dengan harga promo langsung menuju toko resmi."}
                      </p>

                      {/* Coral-Red Pill CTA with White Circle Arrow */}
                      <div className="mt-6 flex items-center justify-center gap-3">
                        <a
                          href="#katalog"
                          onClick={() => {
                            if (heroSlide === 0) {
                              setDigitalFilter("false");
                            } else if (heroSlide === 1) {
                              setDigitalFilter("true");
                            } else {
                              setDigitalFilter("");
                            }
                          }}
                          className="inline-flex items-center gap-3.5 bg-[#ff5a52] hover:bg-[#ff4238] text-white font-semibold text-xs sm:text-sm pl-6 pr-2 py-2 rounded-full shadow-xl shadow-[#ff5a52]/30 transition-all hover:scale-105 active:scale-95 font-sans"
                        >
                          <span>
                            {heroSlide === 0
                              ? "Explore Gadget & Sepeda"
                              : heroSlide === 1
                              ? "Explore Web & Mobile Apps"
                              : "Explore Katalog Affiliate"}
                          </span>
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
                      </div>
                    </motion.div>
                  </AnimatePresence>

                  {/* 3-Slide Interactive Carousel Switcher Pills */}
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-2 z-30 relative">
                    {[
                      { idx: 0, label: "Gadget & Sepeda", icon: "🚲" },
                      { idx: 1, label: "Website & Mobile Apps", icon: "💻" },
                      { idx: 2, label: "Affiliate Pilihan", icon: "🛍️" },
                    ].map((tab) => (
                      <button
                        key={tab.idx}
                        onClick={() => setHeroSlide(tab.idx)}
                        className={`px-3.5 py-1.5 rounded-full text-[11px] font-semibold transition-all flex items-center gap-1.5 border ${
                          heroSlide === tab.idx
                            ? "bg-white text-[#151514] border-white shadow-lg scale-105"
                            : "bg-white/10 text-white/75 border-white/15 hover:bg-white/20 hover:text-white"
                        }`}
                      >
                        <span>{tab.icon}</span>
                        <span>{tab.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 7. BOTTOM 3D ANIMATED STAGE SCENE PER SLIDE + ARCHITECTURAL ROOM */}
                <div className="absolute inset-x-0 bottom-0 z-10 pointer-events-none flex flex-col justify-end">
                  <div className="relative w-full max-w-5xl mx-auto px-4 sm:px-10 flex items-end justify-between -mb-3">
                    {/* Left Indoor Botanical Plants & Planter Pots */}
                    <div className="hidden sm:flex items-end -space-x-4 z-10">
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

                    {/* CENTER 3D ANIMATED SHOWCASE STAGE (Changes per Slide + 3D Mouse Tilt) */}
                    <div
                      className="mx-auto w-full max-w-md sm:max-w-lg lg:max-w-xl z-20 px-2"
                      style={{
                        transform: `rotateY(${heroTilt.x}deg) rotateX(${heroTilt.y}deg)`,
                        transformStyle: "preserve-3d",
                        transition: "transform 0.2s ease-out",
                      }}
                    >
                      <AnimatePresence mode="wait">
                        {heroSlide === 0 ? (
                          /* SLIDE 0: 3D AKSESORIS GADGET & SEPEDA */
                          <motion.div
                            key="stage-gadget-bike"
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 15 }}
                            transition={{ duration: 0.45 }}
                            className="relative flex flex-col items-center"
                          >
                            {/* Floating 3D Elements Above Sofa */}
                            <div className="relative w-full h-36 sm:h-40 flex items-center justify-center gap-4 sm:gap-7 -mb-5 z-30">
                              {/* 3D Spinning Carbon Bike Wheel & Rotor */}
                              <motion.div
                                animate={{ y: [0, -8, 0] }}
                                transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
                                className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full border-[6px] border-zinc-800 shadow-2xl flex items-center justify-center bg-gradient-to-br from-zinc-900/80 to-black/40 backdrop-blur-xs ring-2 ring-emerald-400/50"
                              >
                                <motion.svg
                                  animate={{ rotate: 360 }}
                                  transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                                  className="w-full h-full p-1"
                                  viewBox="0 0 100 100"
                                >
                                  <circle cx="50" cy="50" r="44" stroke="#34d399" strokeWidth="1.5" strokeDasharray="6 4" fill="none" />
                                  <line x1="50" y1="6" x2="50" y2="94" stroke="#a1a1aa" strokeWidth="1.2" />
                                  <line x1="6" y1="50" x2="94" y2="50" stroke="#a1a1aa" strokeWidth="1.2" />
                                  <line x1="19" y1="19" x2="81" y2="81" stroke="#a1a1aa" strokeWidth="1.2" />
                                  <line x1="81" y1="19" x2="19" y2="81" stroke="#a1a1aa" strokeWidth="1.2" />
                                  <circle cx="50" cy="50" r="14" fill="#27272a" stroke="#e4e4e7" strokeWidth="2.5" />
                                  <circle cx="50" cy="50" r="5" fill="#ff5a52" />
                                </motion.svg>
                                <span className="absolute -bottom-2.5 px-2 py-0.5 rounded-full bg-emerald-500 text-[#151514] font-mono font-black text-[9px] shadow-md">
                                  BIKE GEAR
                                </span>
                              </motion.div>

                              {/* 3D Floating Smart Gadget / Cyclocomputer GPS Card */}
                              <motion.div
                                animate={{ y: [0, -12, 0], rotateZ: [-2, 2, -2] }}
                                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                                className="w-28 sm:w-32 h-32 sm:h-36 rounded-2xl bg-gradient-to-b from-[#2a2d34] to-[#16181c] border border-white/20 p-2.5 shadow-2xl flex flex-col justify-between relative"
                              >
                                <div className="flex items-center justify-between text-[9px] font-mono text-emerald-400">
                                  <span>GPS • PRO</span>
                                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                                </div>
                                <div className="my-auto text-center">
                                  <div className="text-xl sm:text-2xl font-black text-white font-mono leading-none">
                                    34.8
                                  </div>
                                  <div className="text-[9px] text-white/60 font-mono mt-0.5">KM/H • CAD 92</div>
                                  <div className="mt-2 h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                                    <div className="h-full w-3/4 bg-gradient-to-r from-emerald-400 to-[#ff5a52] rounded-full" />
                                  </div>
                                </div>
                                <div className="text-[9px] font-mono text-white/80 bg-white/5 rounded-lg py-1 text-center border border-white/10">
                                  MAGSAFE MOUNT
                                </div>
                              </motion.div>

                              {/* 3D Floating Wireless ANC Headphones / Audio Pod */}
                              <motion.div
                                animate={{ y: [0, -9, 0], rotateZ: [3, -2, 3] }}
                                transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut", delay: 0.3 }}
                                className="w-20 h-24 sm:w-24 sm:h-28 rounded-2xl bg-gradient-to-br from-zinc-800 via-zinc-900 to-black border border-white/15 p-2.5 shadow-2xl flex flex-col items-center justify-center gap-1.5"
                              >
                                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-amber-400/15 border border-amber-300/30 flex items-center justify-center text-lg sm:text-xl">
                                  🎧
                                </div>
                                <span className="text-[9px] font-mono font-bold text-amber-200">GADGET PRO</span>
                                <span className="text-[8px] text-white/50">ANC • USB-C</span>
                              </motion.div>
                            </div>

                            {/* Minimalist Studio Sofa Base */}
                            <div className="w-full flex items-end">
                              <div className="w-10 sm:w-14 h-14 sm:h-16 rounded-tl-3xl rounded-bl-xl bg-gradient-to-r from-[#24262a] via-[#313338] to-[#202226] border-t border-white/10 shadow-2xl -mr-2 z-20" />
                              <div className="flex-1 grid grid-cols-2 gap-0.5 bg-[#141517] rounded-t-xl overflow-hidden shadow-2xl border-t border-white/10">
                                <div className="h-12 sm:h-15 bg-gradient-to-b from-[#32343a] via-[#26282c] to-[#1b1c20]" />
                                <div className="h-12 sm:h-15 bg-gradient-to-b from-[#34363c] via-[#26282c] to-[#1b1c20]" />
                              </div>
                              <div className="w-10 sm:w-14 h-14 sm:h-16 rounded-tr-3xl rounded-br-xl bg-gradient-to-l from-[#24262a] via-[#313338] to-[#202226] border-t border-white/10 shadow-2xl -ml-2 z-20" />
                            </div>
                          </motion.div>
                        ) : heroSlide === 1 ? (
                          /* SLIDE 1: 3D PEMBUATAN WEBSITE & MOBILE APPS */
                          <motion.div
                            key="stage-web-mobile"
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 15 }}
                            transition={{ duration: 0.45 }}
                            className="relative flex flex-col items-center"
                          >
                            <div className="relative w-full h-36 sm:h-40 flex items-center justify-center gap-3 sm:gap-5 -mb-5 z-30">
                              {/* 3D Isometric Web Browser Window */}
                              <motion.div
                                animate={{ y: [0, -10, 0], rotateY: [-6, 6, -6] }}
                                transition={{ duration: 4.2, repeat: Infinity, ease: "easeInOut" }}
                                className="w-44 sm:w-56 h-28 sm:h-34 rounded-2xl bg-gradient-to-br from-[#1e293b]/95 via-[#0f172a]/95 to-[#1e1b4b]/95 border border-sky-400/40 p-3 shadow-2xl flex flex-col justify-between backdrop-blur-md"
                              >
                                <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                                  <div className="flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-rose-400" />
                                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                                  </div>
                                  <span className="text-[8px] font-mono text-sky-300 bg-sky-500/10 px-2 py-0.5 rounded-full border border-sky-400/20">
                                    https://web-studio.app
                                  </span>
                                </div>
                                <div className="grid grid-cols-3 gap-1.5 my-auto py-1">
                                  <div className="col-span-2 bg-white/5 rounded-lg p-1.5 border border-white/10">
                                    <div className="w-2/3 h-1.5 bg-sky-400/80 rounded mb-1" />
                                    <div className="w-full h-1 bg-white/30 rounded mb-1" />
                                    <div className="w-4/5 h-1 bg-white/20 rounded" />
                                  </div>
                                  <div className="bg-indigo-500/20 rounded-lg border border-indigo-400/30 flex items-center justify-center text-[10px] font-mono font-bold text-indigo-200">
                                    &lt;/&gt;
                                  </div>
                                </div>
                                <div className="flex items-center justify-between text-[8px] font-mono text-white/70">
                                  <span>FULLSTACK WEB</span>
                                  <span className="text-emerald-400 font-bold">● 100% SCORE</span>
                                </div>
                              </motion.div>

                              {/* 3D Floating Mobile App Phone Mockup */}
                              <motion.div
                                animate={{ y: [0, -14, 0], rotateZ: [4, -2, 4] }}
                                transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
                                className="w-20 sm:w-24 h-32 sm:h-36 rounded-[20px] bg-gradient-to-b from-[#1e1b4b] to-[#090d16] border-2 border-indigo-400/50 p-2 shadow-2xl flex flex-col justify-between relative"
                              >
                                <div className="w-8 h-1 bg-white/30 rounded-full mx-auto" />
                                <div className="my-auto space-y-1.5">
                                  <div className="h-8 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-500 p-1.5 flex items-center justify-center text-[9px] font-bold text-white shadow-md">
                                    iOS &amp; APK
                                  </div>
                                  <div className="h-5 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center text-[8px] font-mono text-sky-200">
                                    UI/UX 3D
                                  </div>
                                </div>
                                <div className="w-6 h-0.5 bg-white/40 rounded-full mx-auto" />
                              </motion.div>
                            </div>

                            {/* Minimalist Studio Sofa Base */}
                            <div className="w-full flex items-end">
                              <div className="w-10 sm:w-14 h-14 sm:h-16 rounded-tl-3xl rounded-bl-xl bg-gradient-to-r from-[#24262a] via-[#313338] to-[#202226] border-t border-white/10 shadow-2xl -mr-2 z-20" />
                              <div className="flex-1 grid grid-cols-2 gap-0.5 bg-[#141517] rounded-t-xl overflow-hidden shadow-2xl border-t border-white/10">
                                <div className="h-12 sm:h-15 bg-gradient-to-b from-[#32343a] via-[#26282c] to-[#1b1c20]" />
                                <div className="h-12 sm:h-15 bg-gradient-to-b from-[#34363c] via-[#26282c] to-[#1b1c20]" />
                              </div>
                              <div className="w-10 sm:w-14 h-14 sm:h-16 rounded-tr-3xl rounded-br-xl bg-gradient-to-l from-[#24262a] via-[#313338] to-[#202226] border-t border-white/10 shadow-2xl -ml-2 z-20" />
                            </div>
                          </motion.div>
                        ) : (
                          /* SLIDE 2: 3D MULTI-PLATFORM AFFILIATE SHOWCASE */
                          <motion.div
                            key="stage-affiliate"
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 15 }}
                            transition={{ duration: 0.45 }}
                            className="relative flex flex-col items-center"
                          >
                            <div className="relative w-full h-36 sm:h-40 flex items-center justify-center gap-2.5 sm:gap-4 -mb-5 z-30">
                              {/* Shopee 3D Floating Card */}
                              <motion.div
                                animate={{ y: [0, -10, 0], rotateZ: [-6, -2, -6] }}
                                transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
                                className="w-22 sm:w-26 h-26 sm:h-30 rounded-2xl bg-gradient-to-br from-[#ee4d2d] to-[#b92b10] p-2.5 shadow-2xl border border-white/25 flex flex-col justify-between text-white"
                              >
                                <span className="text-[9px] font-mono font-bold bg-black/20 px-1.5 py-0.5 rounded self-start">
                                  SHOPEE
                                </span>
                                <div className="text-xl sm:text-2xl font-black text-center">🛍️</div>
                                <span className="text-[8px] font-bold text-center bg-white text-[#ee4d2d] rounded-full py-0.5">
                                  STAR+ DEAL
                                </span>
                              </motion.div>

                              {/* Central Verified 3D Affiliate Hub */}
                              <motion.div
                                animate={{ y: [0, -14, 0], scale: [1, 1.04, 1] }}
                                transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut" }}
                                className="w-32 sm:w-36 h-30 sm:h-34 rounded-2xl bg-gradient-to-b from-[#2b2d33] to-[#17181c] p-3 shadow-2xl border border-amber-300/40 flex flex-col justify-between text-center relative"
                              >
                                <span className="text-[9px] font-mono font-bold text-amber-300">
                                  ★ 4.9 CURATED
                                </span>
                                <div className="my-auto">
                                  <div className="text-xs sm:text-sm font-black text-white">
                                    MULTI-STORE
                                  </div>
                                  <div className="text-[9px] text-white/60 mt-0.5">
                                    TikTok • Tokopedia
                                  </div>
                                </div>
                                <span className="text-[9px] font-mono font-bold bg-gradient-to-r from-emerald-400 to-teal-400 text-[#151514] rounded-lg py-1">
                                  HARGA TERBAIK
                                </span>
                              </motion.div>

                              {/* TikTok & Tokopedia 3D Floating Card */}
                              <motion.div
                                animate={{ y: [0, -10, 0], rotateZ: [6, 2, 6] }}
                                transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: 0.25 }}
                                className="w-22 sm:w-26 h-26 sm:h-30 rounded-2xl bg-gradient-to-br from-[#00aa5b] to-[#046c3c] p-2.5 shadow-2xl border border-white/25 flex flex-col justify-between text-white"
                              >
                                <span className="text-[9px] font-mono font-bold bg-black/20 px-1.5 py-0.5 rounded self-start">
                                  OFFICIAL
                                </span>
                                <div className="text-xl sm:text-2xl font-black text-center">⚡</div>
                                <span className="text-[8px] font-bold text-center bg-white text-[#00aa5b] rounded-full py-0.5">
                                  LINK RESMI
                                </span>
                              </motion.div>
                            </div>

                            {/* Minimalist Studio Sofa Base */}
                            <div className="w-full flex items-end">
                              <div className="w-10 sm:w-14 h-14 sm:h-16 rounded-tl-3xl rounded-bl-xl bg-gradient-to-r from-[#24262a] via-[#313338] to-[#202226] border-t border-white/10 shadow-2xl -mr-2 z-20" />
                              <div className="flex-1 grid grid-cols-2 gap-0.5 bg-[#141517] rounded-t-xl overflow-hidden shadow-2xl border-t border-white/10">
                                <div className="h-12 sm:h-15 bg-gradient-to-b from-[#32343a] via-[#26282c] to-[#1b1c20]" />
                                <div className="h-12 sm:h-15 bg-gradient-to-b from-[#34363c] via-[#26282c] to-[#1b1c20]" />
                              </div>
                              <div className="w-10 sm:w-14 h-14 sm:h-16 rounded-tr-3xl rounded-br-xl bg-gradient-to-l from-[#24262a] via-[#313338] to-[#202226] border-t border-white/10 shadow-2xl -ml-2 z-20" />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
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
                    <div
                      className="absolute inset-0 opacity-35"
                      style={{
                        backgroundImage:
                          "repeating-linear-gradient(90deg, transparent, transparent 48px, rgba(0,0,0,0.45) 48px, rgba(0,0,0,0.45) 50px)",
                      }}
                    />
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

          {/* ================= 1 FULL ROW: PORTALBUN WEB MANGA EDITORIAL BANNER ================= */}
          <div
            onClick={() => navigateTo("manga", "/manga")}
            className="group relative w-full mb-10 rounded-[28px] sm:rounded-[36px] overflow-hidden bg-[#141518] border border-[#26282e] cursor-pointer select-none transition-colors hover:border-stone-600"
          >
            {/* Atmospheric Japanese Graphic Novel Background Artwork */}
            <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
              <img
                src="https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=1200&q=80"
                alt=""
                className="w-full h-full object-cover object-right-top sm:object-center opacity-20 sm:opacity-10 scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t sm:bg-gradient-to-r from-[#141518] via-[#141518]/95 to-[#141518]/70 sm:to-[#141518]/40" />
            </div>

            {/* Subtle screentone halftone dots */}
            <div
              className="absolute inset-0 opacity-10 pointer-events-none z-0"
              style={{
                backgroundImage: "radial-gradient(#ffffff 1px, transparent 1px)",
                backgroundSize: "24px 24px",
              }}
            />

            <div className="relative z-10 p-5 sm:p-10 lg:p-12 flex flex-col lg:flex-row lg:items-center justify-between gap-6 lg:gap-12">
              {/* Left Column: Direct Editorial Typography */}
              <div className="max-w-2xl space-y-4">
                <p className="text-xs uppercase tracking-widest text-stone-400 font-semibold">
                  Pustaka Komik Digital
                </p>

                <h2 className="text-2xl sm:text-3xl lg:text-4xl font-black text-white tracking-tight leading-[1.15]">
                  Baca Web Manga Langsung di Portalbun
                </h2>

                <p className="text-sm sm:text-base text-stone-300 leading-relaxed max-w-xl">
                  Ribuan chapter komik dan graphic novel pilihan siap dibaca langsung dari peramban Anda. Ringan, responsif di perangkat seluler, dan terintegrasi penuh tanpa aplikasi tambahan.
                </p>

                {/* Editorial Metadata Row */}
                <div className="pt-1 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-stone-400">
                  <span className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    Pembaruan Chapter Harian
                  </span>
                  <span className="text-stone-600">·</span>
                  <span>Bebas Iklan Pop-up</span>
                  <span className="text-stone-600">·</span>
                  <span>Mode Baca Responsif</span>
                </div>

                {/* Mobile Manga Volumes Preview Showcase */}
                <div className="flex sm:hidden items-center justify-center py-2.5 my-1">
                  <div className="relative w-64 h-36 flex items-center justify-center">
                    {/* Volume 1 */}
                    <div className="absolute left-2 w-24 h-32 rounded-lg overflow-hidden shadow-lg -rotate-6 border border-white/10 bg-[#1c1d22]">
                      <img
                        src="https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=300&q=80"
                        alt="Manga Shonen"
                        className="w-full h-full object-cover grayscale contrast-125"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent flex flex-col justify-end p-1.5">
                        <span className="text-[8px] text-stone-400 font-mono">Vol. 01</span>
                        <span className="text-[10px] font-bold text-white truncate">Shonen</span>
                      </div>
                    </div>

                    {/* Volume 2 (Center) */}
                    <div className="relative z-10 w-28 h-36 rounded-lg overflow-hidden shadow-xl border border-white/15 bg-[#22242a]">
                      <img
                        src="https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=300&q=80"
                        alt="Manga Featured"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent flex flex-col justify-end p-2">
                        <span className="text-[8px] text-rose-400 font-mono font-bold uppercase">Terbaru</span>
                        <span className="text-xs font-black text-white leading-tight">Weekly</span>
                      </div>
                    </div>

                    {/* Volume 3 */}
                    <div className="absolute right-2 w-24 h-32 rounded-lg overflow-hidden shadow-lg rotate-6 border border-white/10 bg-[#1c1d22]">
                      <img
                        src="https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=300&q=80"
                        alt="Manga Fantasy"
                        className="w-full h-full object-cover grayscale contrast-125"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent flex flex-col justify-end p-1.5">
                        <span className="text-[8px] text-stone-400 font-mono">Archive</span>
                        <span className="text-[10px] font-bold text-white truncate">Fantasy</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Solid Flat Button */}
                <div className="pt-2">
                  <div className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-white text-[#151514] font-bold text-xs sm:text-sm hover:bg-stone-200 transition-transform duration-200 group-hover:translate-x-1">
                    <span>Buka Reader Manga</span>
                    <span aria-hidden="true">→</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Editorial Manga Volumes Showcase (Desktop & Tablet) */}
              <div className="hidden sm:flex items-center justify-center lg:justify-end">
                <div className="relative w-80 h-56 flex items-center justify-center">
                  {/* Volume 1 (Left tilted) */}
                  <div className="absolute left-3 w-36 h-48 rounded-xl overflow-hidden shadow-2xl -rotate-6 transition-transform duration-300 group-hover:-rotate-8 group-hover:-translate-x-1 border border-white/10 bg-[#1c1d22]">
                    <img
                      src="https://images.unsplash.com/photo-1578632767115-351597cf2477?auto=format&fit=crop&w=400&q=80"
                      alt="Manga Shonen Edition"
                      className="w-full h-full object-cover grayscale contrast-125"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent flex flex-col justify-end p-2.5">
                      <span className="text-[10px] text-stone-400 uppercase tracking-widest font-mono">Vol. 01</span>
                      <span className="text-xs font-bold text-white leading-tight">Shonen Chronicle</span>
                    </div>
                  </div>

                  {/* Volume 2 (Center / Hero) */}
                  <div className="relative z-10 w-40 h-52 rounded-xl overflow-hidden shadow-2xl transition-transform duration-300 group-hover:scale-105 border border-white/15 bg-[#22242a]">
                    <img
                      src="https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=400&q=80"
                      alt="Manga Featured Selection"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent flex flex-col justify-end p-3">
                      <span className="text-[10px] text-rose-400 uppercase tracking-widest font-mono font-bold">Terbaru</span>
                      <span className="text-sm font-black text-white leading-tight">Weekly Chapter</span>
                    </div>
                  </div>

                  {/* Volume 3 (Right tilted) */}
                  <div className="absolute right-3 w-36 h-48 rounded-xl overflow-hidden shadow-2xl rotate-6 transition-transform duration-300 group-hover:rotate-8 group-hover:translate-x-1 border border-white/10 bg-[#1c1d22]">
                    <img
                      src="https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=400&q=80"
                      alt="Manga Fantasy Edition"
                      className="w-full h-full object-cover grayscale contrast-125"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent flex flex-col justify-end p-2.5">
                      <span className="text-[10px] text-stone-400 uppercase tracking-widest font-mono">Archive</span>
                      <span className="text-xs font-bold text-white leading-tight">Fantasy Realm</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Search & Visual Category Image Cards */}
          <section id="katalog" className="space-y-6 mb-9 scroll-mt-6" aria-label="Filter dan pencarian kategori">
            {/* Visual Category Image Cards Grid */}
            {categories.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3.5">
                  <div>
                    <h2 className="text-sm sm:text-base font-black text-[#151514] uppercase tracking-tight">
                      Jelajahi Kategori Pilihan
                    </h2>
                    <p className="text-[11px] text-[#78716c]">
                      Pilih kategori untuk memfilter koleksi produk fisik, layanan web/mobile apps, dan affiliate
                    </p>
                  </div>
                  {(selectedCategory !== "" || digitalFilter !== "") && (
                    <button
                      onClick={() => {
                        setSelectedCategory("");
                        setDigitalFilter("");
                      }}
                      className="text-xs font-bold text-[#ff5a52] hover:underline flex items-center gap-1"
                    >
                      <span>Lihat Semua</span>
                      <XMarkIcon className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {categories.map((c, idx) => {
                    const isSelected = selectedCategory === c.slug;
                    const slugLower = (c.slug + " " + c.name).toLowerCase();

                    // Curated visual image & metadata per category
                    let catImage =
                      "https://images.unsplash.com/photo-1526738549149-8e07eca6c147?auto=format&fit=crop&w=800&q=80";
                    let catBadge = "KOLEKSI PILIHAN";
                    let catSubtitle = "Kurasi produk berkualitas tinggi & bergaransi";

                    if (
                      slugLower.includes("physical") ||
                      slugLower.includes("sepeda") ||
                      slugLower.includes("bike") ||
                      slugLower.includes("fisik")
                    ) {
                      catImage =
                        "https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=800&q=80";
                      catBadge = "BIKE & GEAR";
                      catSubtitle = "Aksesoris sepeda, mounting carbon & perlengkapan gowes";
                    } else if (
                      slugLower.includes("gadget") ||
                      slugLower.includes("electronic") ||
                      slugLower.includes("setup")
                    ) {
                      catImage =
                        "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=800&q=80";
                      catBadge = "GADGET ACCESSORIES";
                      catSubtitle = "Aksesoris gadget minimalis, desk setup & perangkat pintar";
                    } else if (
                      slugLower.includes("digital") ||
                      slugLower.includes("web") ||
                      slugLower.includes("app") ||
                      slugLower.includes("software")
                    ) {
                      catImage =
                        "https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=800&q=80";
                      catBadge = "WEB & MOBILE APPS";
                      catSubtitle = "Jasa pembuatan website, aplikasi iOS/Android & sistem";
                    } else if (
                      slugLower.includes("ebook") ||
                      slugLower.includes("template") ||
                      slugLower.includes("affiliate")
                    ) {
                      catImage =
                        "https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&w=800&q=80";
                      catBadge = "AFFILIATE & TEMPLATES";
                      catSubtitle = "Rekomendasi affiliate resmi, UI/UX kit & e-book eksklusif";
                    } else {
                      const fallbackImages = [
                        "https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=800&q=80",
                        "https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=800&q=80",
                        "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=800&q=80",
                        "https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&w=800&q=80",
                      ];
                      catImage = fallbackImages[idx % fallbackImages.length];
                    }

                    return (
                      <motion.button
                        key={c.id}
                        whileHover={{ y: -4 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setSelectedCategory(isSelected ? "" : c.slug)}
                        className={`group relative h-44 sm:h-48 rounded-3xl overflow-hidden text-left transition-all duration-300 border ${
                          isSelected
                            ? "ring-3 ring-[#ff5a52] border-[#ff5a52] shadow-xl"
                            : "border-[#ddd9d2] shadow-sm hover:shadow-xl"
                        }`}
                      >
                        {/* Background Category Image */}
                        <img
                          src={catImage}
                          alt={c.name}
                          loading="lazy"
                          className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                        />

                        {/* Dark Studio Gradient Overlay */}
                        <div
                          className={`absolute inset-0 transition-opacity duration-300 ${
                            isSelected
                              ? "bg-gradient-to-t from-[#151514] via-[#151514]/65 to-[#ff5a52]/25"
                              : "bg-gradient-to-t from-[#151514]/95 via-[#151514]/45 to-black/15 group-hover:from-[#151514]"
                          }`}
                        />

                        {/* Top Bar: Badge & Circle Arrow */}
                        <div className="relative z-10 p-4 flex items-center justify-between">
                          <span
                            className={`px-2.5 py-1 rounded-full text-[9px] font-mono font-bold uppercase tracking-wider backdrop-blur-md border ${
                              isSelected
                                ? "bg-[#ff5a52] text-white border-[#ff5a52]"
                                : "bg-black/45 text-white/90 border-white/15"
                            }`}
                          >
                            {isSelected ? "✓ KATEGORI AKTIF" : catBadge}
                          </span>

                          <span
                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                              isSelected
                                ? "bg-[#ff5a52] text-white rotate-45"
                                : "bg-white/90 text-[#151514] group-hover:bg-[#ff5a52] group-hover:text-white group-hover:rotate-12"
                            }`}
                          >
                            <svg
                              className="w-3.5 h-3.5"
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
                        </div>

                        {/* Bottom Content: Category Name & Subtitle */}
                        <div className="absolute inset-x-0 bottom-0 z-10 p-4">
                          <h3 className="text-base sm:text-lg font-extrabold text-white tracking-tight leading-snug group-hover:text-amber-100 transition-colors">
                            {c.name}
                          </h3>
                          <p className="text-[11px] text-white/75 line-clamp-1 mt-0.5 font-sans">
                            {catSubtitle}
                          </p>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Filter Segmented Control & Search Input Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-2">
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
