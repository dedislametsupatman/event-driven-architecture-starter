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
import SculptureHero from "@/components/ui/liquid-sculpture-hero";
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

      {/* Editorial Announcement Bar */}
      <div className="bg-[#1c1a17] text-[#ebe9e5] py-2.5 px-4 text-xs font-medium border-b border-[#2d2a25]">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-center sm:text-left">
          <div className="flex items-center gap-2.5 mx-auto sm:mx-0">
            <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold text-[#ebe9e5] bg-[#2d2a25] border border-[#3e3b34] px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              {storeSettings.store_badge || "RESMI"}
            </span>
            <span className="text-[#ebe9e5]">
              {storeSettings.store_announcement || "Pengiriman Kilat Pulau Jawa & Akses Unduhan Instan Seluruh Aset Digital"}
            </span>
          </div>
          <div className="hidden lg:flex items-center gap-4 text-[11px] text-[#a8a195] font-mono">
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
                className="w-full bg-[#f5f3ef] hover:bg-white border border-[#ddd9d2] rounded-xl pl-10 pr-12 py-2.5 text-xs text-[#151514] placeholder-[#78716c] focus:outline-none focus:bg-white focus:border-[#151514] focus:ring-2 focus:ring-[#151514]/10 transition-all"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] font-semibold text-[#78716c] border border-[#ddd9d2] px-1.5 py-0.5 rounded bg-white">
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
                  ? "bg-[#151514] text-[#ebe9e5] font-bold"
                  : "text-[#57534e] hover:text-[#151514] hover:bg-[#f5f3ef]"
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
                  ? "bg-[#151514] text-[#ebe9e5] border-[#151514] font-bold"
                  : "text-[#57534e] hover:text-[#151514] border-[#ddd9d2] hover:bg-[#f5f3ef]"
              }`}
            >
              <TruckIcon className="w-4 h-4 text-[#151514]" />
              <span className="hidden sm:inline">Riwayat Pesanan</span>
            </button>

            {/* Realtime In-App Notifications Bell */}
            <div className="relative" ref={notificationRef}>
              <button
                onClick={() => setIsNotificationsOpen((prev) => !prev)}
                aria-label={`Notifikasi pesanan (${unreadNotificationsCount} belum dibaca)`}
                className={`relative p-2 rounded-xl border transition-all flex items-center justify-center ${
                  isNotificationsOpen
                    ? "bg-[#151514] text-[#ebe9e5] border-[#151514] ring-2 ring-[#78716c]/20"
                    : "text-[#57534e] hover:text-[#151514] border-[#ddd9d2] hover:bg-[#f5f3ef]"
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
              <AnimatePresence>
                {isNotificationsOpen && (
                  <motion.div
                    key="notif-dropdown"
                    initial={{ opacity: 0, y: -6, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.96 }}
                    transition={{ duration: 0.15, ease: "easeOut" }}
                    className="absolute right-0 sm:right-auto sm:left-1/2 sm:-translate-x-1/2 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden"
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
                </motion.div>
              )}
            </AnimatePresence>
            </div>

            {/* Profil / Akun Pengguna */}
            <button
              onClick={() => navigateTo("profile", "/profile")}
              className={`text-xs font-semibold px-3.5 py-2 rounded-xl border transition-all flex items-center gap-1.5 ${
                viewMode === "profile"
                  ? "bg-[#151514] text-[#ebe9e5] border-[#151514] font-bold"
                  : "text-[#57534e] hover:text-[#151514] border-[#ddd9d2] hover:bg-[#f5f3ef]"
              }`}
            >
              <UserIcon className="w-4 h-4 text-[#151514]" />
              <span className="hidden sm:inline">
                {currentUser ? currentUser.name.split(" ")[0] : "Akun"}
              </span>
            </button>

            {/* Admin CMS Button (jika role admin) */}
            {currentUser?.role === "admin" && (
              <button
                onClick={() => navigateTo("cms", "/cms")}
                className="text-xs font-bold px-3 py-2 rounded-xl bg-[#151514] text-[#ebe9e5] border border-[#2d2a25] hover:bg-[#292524] transition-all flex items-center gap-1 shadow-2xs"
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
                  ? "bg-[#151514] text-[#ebe9e5] ring-2 ring-[#78716c]"
                  : "bg-[#151514] hover:bg-[#292524] text-[#ebe9e5]"
              }`}
            >
              <ShoppingBagIcon className="w-5 h-5" />
              {totalCartCount > 0 && (
                <motion.span
                  key={totalCartCount}
                  initial={{ scale: 0.5 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 500, damping: 15 }}
                  className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white font-bold text-[10px] w-5 h-5 rounded-full flex items-center justify-center ring-2 ring-white"
                >
                  {totalCartCount}
                </motion.span>
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
        <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
          {/* Liquid Sculpture Hero (dev21st Interactive GPU Particle Showcase) */}
          <div className="mb-10">
            <SculptureHero
              brand={storeSettings.store_name || "SUPATMAN STORE"}
              eyebrow="EST. 2026 • HARDWARE & DIGITAL ATELIER"
              headline={"Form that\nanswers back."}
              headlineAccent={"answers back."}
              body="Kurasi perlengkapan meja kerja berdesain minimalis dan koleksi aset digital berkualitas tinggi. Sentuh dan gerakkan kursor pada form liquid material untuk merasakan interaksi GPU real-time."
              primaryCta={{ label: "Jelajahi Katalog ↓", href: "#katalog" }}
              secondaryCta={{ label: "Lacak Pesanan →", href: "#/orders" }}
              showNav={false}
              height="580px"
              className="rounded-3xl border border-[#ddd9d2] shadow-sm overflow-hidden"
              backdropText="supatman"
              background="#ebe9e5"
              darkBackground="#111110"
              textColor="#151514"
              accentColor="#151514"
            />

            {/* 3 Keunggulan Atelier Badges */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-6 mt-6 border-t border-[#ddd9d2]">
              <div className="flex items-center gap-2.5 text-xs text-[#151514] font-semibold p-3.5 rounded-2xl bg-[#f5f3ef] border border-[#ddd9d2] shadow-2xs">
                <div className="w-8 h-8 rounded-xl bg-[#ebe9e5] text-[#151514] flex items-center justify-center flex-shrink-0 border border-[#ddd9d2]">
                  <TruckIcon className="w-4 h-4" />
                </div>
                <span>Ekspedisi Kilat &amp; Resi</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-[#151514] font-semibold p-3.5 rounded-2xl bg-[#f5f3ef] border border-[#ddd9d2] shadow-2xs">
                <div className="w-8 h-8 rounded-xl bg-[#ebe9e5] text-[#151514] flex items-center justify-center flex-shrink-0 border border-[#ddd9d2]">
                  <ArrowDownTrayIcon className="w-4 h-4" />
                </div>
                <span>Akses Unduh Instan</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-[#151514] font-semibold p-3.5 rounded-2xl bg-[#f5f3ef] border border-[#ddd9d2] shadow-2xs">
                <div className="w-8 h-8 rounded-xl bg-[#ebe9e5] text-[#151514] flex items-center justify-center flex-shrink-0 border border-[#ddd9d2]">
                  <ShieldCheckIcon className="w-4 h-4" />
                </div>
                <span>Verifikasi Lunas Realtime</span>
              </div>
            </div>
          </div>

          {/* Filter Bar (Segmented Control & Tags) */}
          <section id="katalog" className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8" aria-label="Filter kategori">
            <div className="inline-flex p-1 bg-[#ddd9d2]/60 rounded-2xl border border-[#ddd9d2]">
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

            {/* Category Pills */}
            <div className="flex flex-wrap items-center gap-1.5">
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCategory(selectedCategory === c.slug ? "" : c.slug)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all tap-effect ${
                    selectedCategory === c.slug
                      ? "bg-[#151514] text-[#ebe9e5] shadow-xs"
                      : "bg-[#f5f3ef] text-[#57534e] hover:text-[#151514] border border-[#ddd9d2] hover:bg-white"
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
                  <span>ENCORE CLOUD MICROSERVICES</span>
                </div>
                <p className="text-[11px] text-[#7a7469]">
                  Didukung enkripsi TLS &amp; validasi pembayaran otomatis.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#7a7469] font-mono">
            <p>© {new Date().getFullYear()} {storeSettings.store_name || "Supatman Store"}. All Rights Reserved.</p>
            <p className="text-[11px]">Crafted with Go (Encore.dev) &amp; React 18 + Tailwind CSS</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
