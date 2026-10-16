import React, { useState, useEffect } from "react";
import {
  api,
  User,
  Order,
} from "./api";
import {
  UserIcon,
  ShoppingBagIcon,
  TruckIcon,
  ShieldCheckIcon,
  ArrowRightOnRectangleIcon,
  ArrowLeftIcon,
  CheckBadgeIcon,
  KeyIcon,
  EnvelopeIcon,
  PhoneIcon,
  SparklesIcon,
  CubeIcon,
} from "@heroicons/react/24/outline";

interface ProfilePageProps {
  currentUser: User | null;
  onLoginSuccess: (user: User) => void;
  onLogout: () => void;
  onNavigate: (view: "store" | "cart" | "orders" | "profile" | "cms", path: string) => void;
  showToast: (msg: string) => void;
}

export function ProfilePage({
  currentUser,
  onLoginSuccess,
  onLogout,
  onNavigate,
  showToast,
}: ProfilePageProps) {
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authForm, setAuthForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    admin_key: "",
  });
  const [authLoading, setAuthLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [userOrdersCount, setUserOrdersCount] = useState<number | null>(null);

  useEffect(() => {
    if (currentUser) {
      // Load user orders count
      api.getOrders()
        .then((res) => {
          setUserOrdersCount(res.orders?.length || 0);
        })
        .catch(() => {});
    }
  }, [currentUser]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      if (authMode === "login") {
        const res = await api.login({
          email: authForm.email,
          password: authForm.password,
        });
        localStorage.setItem("token", res.token);
        onLoginSuccess(res.user);
        showToast(`Selamat datang kembali, ${res.user.name || res.user.email}!`);
      } else {
        const res = await api.register({
          name: authForm.name,
          email: authForm.email,
          password: authForm.password,
          phone: authForm.phone,
          admin_key: authForm.admin_key || undefined,
        });
        localStorage.setItem("token", res.token);
        onLoginSuccess(res.user);
        showToast("Akun Anda berhasil didaftarkan!");
      }
    } catch (err: any) {
      alert(err.message || "Gagal melakukan otentikasi.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const settings = await api.getAuthSettings().catch(() => null);

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
              onLoginSuccess(res.user);
              showToast(`Berhasil masuk dengan Google: ${res.user.email}`);
            } catch (err: any) {
              alert(err.message || "Gagal memproses login Google");
            }
          },
        });
        (window as any).google.accounts.id.prompt();
        setGoogleLoading(false);
        return;
      }

      // Fallback email prompt jika Google Client ID belum aktif
      const emailInput = prompt(
        "Tips: Google Client ID dapat disetel di /cms > Pengaturan.\n\nMasukkan email Google Anda untuk masuk instan:",
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
      onLoginSuccess(res.user);
      showToast(`Berhasil masuk dengan akun Google: ${res.user.email}`);
    } catch (err: any) {
      alert(err.message || "Gagal masuk dengan Google.");
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleDemoLogin = async (role: "customer" | "admin") => {
    setAuthLoading(true);
    try {
      if (role === "admin") {
        const res = await api.adminLogin();
        localStorage.setItem("token", res.token);
        onLoginSuccess(res.user);
        showToast("Masuk sebagai Demo Administrator!");
      } else {
        const res = await api.login({
          email: "customer@example.com",
          password: "password123",
        }).catch(async () => {
          return api.register({
            name: "Budi Santoso",
            email: "customer@example.com",
            password: "password123",
            phone: "08123456789",
          });
        });
        localStorage.setItem("token", res.token);
        onLoginSuccess(res.user);
        showToast("Masuk sebagai Demo Pelanggan!");
      }
    } catch (err: any) {
      alert(err.message || "Gagal masuk demo");
    } finally {
      setAuthLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
      {/* Header Back Link */}
      <div className="mb-6">
        <button
          onClick={() => onNavigate("store", "/")}
          className="text-xs font-semibold text-slate-500 hover:text-blue-600 flex items-center gap-1"
        >
          <ArrowLeftIcon className="w-3.5 h-3.5" />
          Kembali ke Toko
        </button>
      </div>

      {currentUser ? (
        /* ================= HALAMAN PROFIL PENGGUNA TERDAFTAR ================= */
        <div className="space-y-8">
          {/* Hero Profile Banner */}
          <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center gap-6">
              {/* Avatar Initial */}
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-black text-3xl shadow-md flex-shrink-0">
                {currentUser.name ? currentUser.name.charAt(0).toUpperCase() : "U"}
              </div>

              {/* User Bio */}
              <div className="flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                    {currentUser.name || "Pelanggan Supatman Store"}
                  </h1>
                  <span className={`text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                    currentUser.role === "admin"
                      ? "bg-purple-100 text-purple-800 border border-purple-200"
                      : "bg-blue-100 text-blue-800 border border-blue-200"
                  }`}>
                    {currentUser.role === "admin" ? "Administrator" : "Konsumen / Customer"}
                  </span>
                </div>
                <p className="text-sm text-slate-500 flex items-center gap-1.5">
                  <EnvelopeIcon className="w-4 h-4 text-slate-400" />
                  {currentUser.email}
                </p>
                {currentUser.phone && (
                  <p className="text-xs text-slate-500 flex items-center gap-1.5">
                    <PhoneIcon className="w-4 h-4 text-slate-400" />
                    {currentUser.phone}
                  </p>
                )}
              </div>

              {/* Logout Button */}
              <button
                onClick={onLogout}
                className="self-start sm:self-center px-4 py-2 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
              >
                <ArrowRightOnRectangleIcon className="w-4 h-4" />
                Keluar Akun
              </button>
            </div>
          </div>

          {/* Quick Action Navigation Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1: Riwayat Pesanan */}
            <div
              onClick={() => onNavigate("orders", "/orders")}
              className="bg-white border border-slate-200 hover:border-blue-400 rounded-2xl p-6 shadow-xs hover:shadow-md cursor-pointer transition-all group"
            >
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                <TruckIcon className="w-6 h-6" />
              </div>
              <h3 className="font-extrabold text-slate-900 text-base mb-1 group-hover:text-blue-600 transition-colors">
                Riwayat Pesanan Saya
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Lihat detail semua pesanan fisik, nomor resi pengiriman, serta unduh file produk digital Anda.
              </p>
              <span className="text-xs font-bold text-blue-600 group-hover:underline flex items-center gap-1">
                Buka Pesanan ({userOrdersCount !== null ? `${userOrdersCount} Pesanan` : "Lihat"}) →
              </span>
            </div>

            {/* Card 2: Keranjang Belanja */}
            <div
              onClick={() => onNavigate("cart", "/cart")}
              className="bg-white border border-slate-200 hover:border-blue-400 rounded-2xl p-6 shadow-xs hover:shadow-md cursor-pointer transition-all group"
            >
              <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                <ShoppingBagIcon className="w-6 h-6" />
              </div>
              <h3 className="font-extrabold text-slate-900 text-base mb-1 group-hover:text-indigo-600 transition-colors">
                Keranjang Belanja
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Periksa barang yang ingin dibeli, atur kuantitas produk, dan lanjutkan ke pembayaran.
              </p>
              <span className="text-xs font-bold text-indigo-600 group-hover:underline flex items-center gap-1">
                Buka Keranjang Saya →
              </span>
            </div>

            {/* Card 3: CMS Panel jika Admin ATAU Belanja Toko */}
            {currentUser.role === "admin" ? (
              <div
                onClick={() => onNavigate("cms", "/cms")}
                className="bg-emerald-50/50 border border-emerald-200 hover:border-emerald-400 rounded-2xl p-6 shadow-xs hover:shadow-md cursor-pointer transition-all group"
              >
                <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                  <ShieldCheckIcon className="w-6 h-6" />
                </div>
                <h3 className="font-extrabold text-emerald-950 text-base mb-1 group-hover:text-emerald-700 transition-colors">
                  Pusat Kendali CMS Admin
                </h3>
                <p className="text-xs text-emerald-800 mb-4">
                  Kelola inventori produk, atur stok barang, verifikasi pembayaran masuk, dan monitor keuangan toko.
                </p>
                <span className="text-xs font-bold text-emerald-700 group-hover:underline flex items-center gap-1">
                  Masuk ke /cms Admin Panel →
                </span>
              </div>
            ) : (
              <div
                onClick={() => onNavigate("store", "/")}
                className="bg-white border border-slate-200 hover:border-blue-400 rounded-2xl p-6 shadow-xs hover:shadow-md cursor-pointer transition-all group"
              >
                <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                  <SparklesIcon className="w-6 h-6" />
                </div>
                <h3 className="font-extrabold text-slate-900 text-base mb-1 group-hover:text-amber-600 transition-colors">
                  Katalog Etalase Toko
                </h3>
                <p className="text-xs text-slate-500 mb-4">
                  Jelajahi koleksi perlengkapan meja kerja dan aset digital eksklusif yang dirancang profesional.
                </p>
                <span className="text-xs font-bold text-amber-600 group-hover:underline flex items-center gap-1">
                  Jelajahi Produk Pilihan →
                </span>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ================= HALAMAN LOGIN & DAFTAR KONSUMEN ================= */
        <div className="max-w-md mx-auto my-12">
          <div className="surface-card rounded-3xl p-8 sm:p-10 shadow-lg space-y-6">
            <div className="text-center space-y-2">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-700 text-white flex items-center justify-center mx-auto shadow-md font-bold text-xl">
                <CubeIcon className="w-6 h-6" />
              </div>
              <h2 className="font-heading text-2xl font-black text-slate-900 tracking-tight">
                {authMode === "login" ? "Masuk ke Akun Anda" : "Buat Akun Konsumen Baru"}
              </h2>
              <p className="text-xs text-slate-500 leading-relaxed">
                {authMode === "login"
                  ? "Akses riwayat pesanan, unduhan digital, dan kelola profil Anda."
                  : "Daftar sekarang untuk kemudahan bertransaksi dan pelacakan pesanan instan."}
              </p>
            </div>

            {/* Google One-Tap / OAuth Button */}
            <div>
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleLoading}
                className="w-full py-2.5 px-4 bg-white hover:bg-slate-50 border border-slate-200/90 rounded-xl text-xs font-bold text-slate-700 shadow-xs transition-all flex items-center justify-center gap-3 tap-effect"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
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
                <span>{googleLoading ? "Menghubungkan..." : "Masuk dengan Akun Google"}</span>
              </button>
            </div>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-slate-200"></div>
              <span className="flex-shrink mx-3 text-[11px] font-semibold text-slate-400 uppercase">Atau Email</span>
              <div className="flex-grow border-t border-slate-200"></div>
            </div>

            {/* Email / Password Form */}
            <form onSubmit={handleAuthSubmit} className="space-y-4">
              {authMode === "register" && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nama Lengkap</label>
                  <input
                    type="text"
                    required
                    placeholder="Nama Anda"
                    value={authForm.name}
                    onChange={(e) => setAuthForm({ ...authForm, name: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  placeholder="email@example.com"
                  value={authForm.email}
                  onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Kata Sandi</label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={authForm.password}
                  onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                />
              </div>

              {authMode === "register" && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Nomor WhatsApp / HP (Opsional)</label>
                  <input
                    type="tel"
                    placeholder="08123456789"
                    value={authForm.phone}
                    onChange={(e) => setAuthForm({ ...authForm, phone: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all tap-effect active:scale-[0.99]"
              >
                {authLoading ? "Memproses..." : authMode === "login" ? "Masuk ke Akun" : "Daftar Akun Baru"}
              </button>
            </form>

            {/* Toggle Login / Register */}
            <div className="text-center pt-2 border-t border-slate-100">
              {authMode === "login" ? (
                <p className="text-xs text-slate-500">
                  Belum memiliki akun?{" "}
                  <button
                    onClick={() => setAuthMode("register")}
                    className="font-bold text-blue-600 hover:underline"
                  >
                    Daftar di sini
                  </button>
                </p>
              ) : (
                <p className="text-xs text-slate-500">
                  Sudah memiliki akun?{" "}
                  <button
                    onClick={() => setAuthMode("login")}
                    className="font-bold text-blue-600 hover:underline"
                  >
                    Masuk di sini
                  </button>
                </p>
              )}
            </div>

            {/* Quick Demo Logins for Testing */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
              <span className="text-slate-400 text-[11px]">Tes Cepat:</span>
              <button
                type="button"
                onClick={() => handleDemoLogin("customer")}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 font-semibold text-[11px]"
              >
                Demo Pelanggan
              </button>
              <button
                type="button"
                onClick={() => handleDemoLogin("admin")}
                className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-emerald-800 font-bold text-[11px]"
              >
                Demo Admin
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
