import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  api,
  Product,
  Order,
  PaymentMethods,
  User,
} from "./api";
import {
  ShoppingBagIcon,
  TrashIcon,
  PlusIcon,
  MinusIcon,
  ArrowLeftIcon,
  TruckIcon,
  ShieldCheckIcon,
  BanknotesIcon,
  QrCodeIcon,
  CreditCardIcon,
  ArrowRightIcon,
  ArrowPathIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/outline";

export interface CartItem {
  product: Product;
  quantity: number;
}

interface CartPageProps {
  cart: CartItem[];
  currentUser: User | null;
  paymentMethods: PaymentMethods | null;
  onUpdateQuantity: (productId: number, delta: number) => void;
  onRemoveItem: (productId: number) => void;
  onClearCart: () => void;
  onOrderCreated: (order: Order) => void;
  onNavigate: (view: "store" | "cart" | "orders" | "profile" | "cms", path: string) => void;
  showToast: (msg: string) => void;
}

export function CartPage({
  cart,
  currentUser,
  paymentMethods,
  onUpdateQuantity,
  onRemoveItem,
  onClearCart,
  onOrderCreated,
  onNavigate,
  showToast,
}: CartPageProps) {
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState({
    customer_name: currentUser?.name || "",
    customer_email: currentUser?.email || "",
    customer_phone: currentUser?.phone || "",
    shipping_address: "",
    city: "",
    postal_code: "",
    payment_method: "manual_transfer",
  });

  const hasPhysicalItems = cart.some((item) => !item.product.is_digital);
  const cartSubtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const shippingCost = hasPhysicalItems ? 15000 : 0;
  const grandTotal = cartSubtotal + shippingCost;
  const totalWeightGrams = cart.reduce(
    (sum, item) => sum + (item.product.is_digital ? 0 : item.product.weight_grams * item.quantity),
    0
  );

  const formatIDR = (val: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(val);
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;

    if (!checkoutForm.customer_name.trim() || !checkoutForm.customer_email.trim() || !checkoutForm.customer_phone.trim()) {
      alert("Harap lengkapi nama, email, dan nomor WhatsApp Anda.");
      return;
    }

    if (hasPhysicalItems && !checkoutForm.shipping_address.trim()) {
      alert("Harap lengkapi alamat tujuan pengiriman barang fisik.");
      return;
    }

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

      localStorage.setItem("customer_email", checkoutForm.customer_email);
      localStorage.setItem("last_order_id", String(order.id));
      showToast("Pesanan #" + order.id + " berhasil dibuat!");
      onClearCart();
      onOrderCreated(order);
    } catch (err: any) {
      alert(err.message || "Gagal membuat pesanan.");
    } finally {
      setCheckoutLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <button
            onClick={() => onNavigate("store", "/")}
            className="text-xs font-semibold text-slate-500 hover:text-blue-600 flex items-center gap-1 mb-1"
          >
            <ArrowLeftIcon className="w-3.5 h-3.5" />
            Lanjut Belanja
          </button>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Keranjang Belanja &amp; Checkout
          </h1>
          <p className="text-sm text-slate-500">
            Periksa item pesanan Anda dan lengkapi rincian pengiriman untuk menyelesaikan pembayaran.
          </p>
        </div>

        {cart.length > 0 && (
          <button
            onClick={onClearCart}
            className="text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-200 transition-all self-start sm:self-auto"
          >
            Kosongkan Keranjang
          </button>
        )}
      </div>

      {cart.length === 0 ? (
        /* Empty Cart State */
        <div className="my-16 bg-[#f5f3ef] border border-[#ddd9d2] rounded-3xl p-12 text-center max-w-lg mx-auto shadow-xs space-y-4">
          <div className="w-20 h-20 rounded-2xl bg-[#ebe9e5] text-[#151514] flex items-center justify-center mx-auto border border-[#ddd9d2]">
            <ShoppingBagIcon className="w-10 h-10" />
          </div>
          <h2 className="text-xl font-bold text-[#151514]">Keranjang Belanja Anda Kosong</h2>
          <p className="text-xs text-[#6b665c] leading-relaxed">
            Belum ada produk yang ditambahkan ke keranjang. Temukan perlengkapan setup kerja minimalis dan aset digital eksklusif sekarang.
          </p>
          <div className="pt-3">
            <button
              onClick={() => onNavigate("store", "/")}
              className="px-6 py-3 rounded-xl bg-[#151514] hover:bg-[#2d2a25] text-[#ebe9e5] font-bold text-xs shadow-sm transition-all"
            >
              Mulai Belanja Sekarang →
            </button>
          </div>
        </div>
      ) : (
        /* Cart + Checkout Grid */
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Cart Items List */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-[#f5f3ef] border border-[#ddd9d2] rounded-2xl p-6 shadow-xs">
              <h2 className="text-base font-bold text-[#151514] pb-3 border-b border-[#ddd9d2] flex items-center justify-between">
                <span>Daftar Produk ({cart.reduce((t, i) => t + i.quantity, 0)} item)</span>
                {totalWeightGrams > 0 && (
                  <span className="text-xs font-normal text-[#6b665c]">
                    Estimasi Berat: {(totalWeightGrams / 1000).toFixed(1)} kg
                  </span>
                )}
              </h2>

              <div className="divide-y divide-[#ddd9d2]">
                <AnimatePresence initial={false}>
                  {cart.map((item) => (
                    <motion.div
                      key={item.product.id}
                      layout
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20, height: 0, paddingTop: 0, paddingBottom: 0, overflow: "hidden" }}
                      transition={{ duration: 0.2 }}
                      className="py-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center"
                    >
                      {/* Thumbnail */}
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-[#ebe9e5] overflow-hidden flex-shrink-0 border border-[#ddd9d2]">
                        <img
                          src={item.product.image_url}
                          alt={item.product.name}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      {/* Details */}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            item.product.is_digital ? "bg-[#2d2a25] text-[#ebe9e5]" : "bg-[#ddd9d2] text-[#151514]"
                          }`}>
                            {item.product.is_digital ? "Aset Digital" : "Barang Fisik"}
                          </span>
                          {item.product.category_name && (
                            <span className="text-[#7a7469] text-xs">• {item.product.category_name}</span>
                          )}
                        </div>
                        <h3 className="font-bold text-[#151514] text-sm">{item.product.name}</h3>
                        <p className="text-xs font-black text-[#151514] num-tabular mt-0.5">
                          {formatIDR(item.product.price)}
                        </p>
                      </div>

                      {/* Quantity Controls & Total */}
                      <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
                        <div className="flex items-center border border-[#ddd9d2] rounded-xl bg-[#ebe9e5] overflow-hidden">
                          <button
                            onClick={() => onUpdateQuantity(item.product.id, -1)}
                            className="p-1.5 hover:bg-[#ddd9d2] text-[#151514] transition-colors"
                            aria-label="Kurangi kuantitas"
                          >
                            <MinusIcon className="w-3.5 h-3.5" />
                          </button>
                          <span className="px-3 text-xs font-bold text-[#151514] num-tabular">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => onUpdateQuantity(item.product.id, 1)}
                            className="p-1.5 hover:bg-[#ddd9d2] text-[#151514] transition-colors"
                            aria-label="Tambah kuantitas"
                          >
                            <PlusIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <span className="font-black text-[#151514] text-sm num-tabular w-24 text-right">
                          {formatIDR(item.product.price * item.quantity)}
                        </span>

                        <button
                          onClick={() => onRemoveItem(item.product.id)}
                          className="text-[#7a7469] hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors"
                          title="Hapus dari keranjang"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {/* Bottom Add More Button */}
              <div className="pt-4 border-t border-[#ddd9d2] flex justify-between items-center">
                <button
                  onClick={() => onNavigate("store", "/")}
                  className="text-xs font-bold text-[#151514] hover:underline flex items-center gap-1"
                >
                  + Tambah Produk Lainnya
                </button>
                <span className="text-xs text-[#6b665c]">
                  Subtotal: <strong className="text-[#151514] num-tabular">{formatIDR(cartSubtotal)}</strong>
                </span>
              </div>
            </div>

            {/* Jaminan & Layanan */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-[#f5f3ef] border border-[#ddd9d2] rounded-xl p-4 flex items-center gap-3 text-xs text-[#151514]">
                <ShieldCheckIcon className="w-6 h-6 text-emerald-600 flex-shrink-0" />
                <div>
                  <span className="font-bold text-[#151514]">Garansi 100% Aman</span>
                  <p className="text-[11px] text-[#6b665c]">Privasi dan transaksi terlindungi dengan enkripsi tinggi.</p>
                </div>
              </div>

              <div className="bg-[#f5f3ef] border border-[#ddd9d2] rounded-xl p-4 flex items-center gap-3 text-xs text-[#151514]">
                <TruckIcon className="w-6 h-6 text-[#151514] flex-shrink-0" />
                <div>
                  <span className="font-bold text-[#151514]">Pengiriman Cepat</span>
                  <p className="text-[11px] text-[#6b665c]">Produk digital instan &amp; pengiriman fisik berpelacak resi.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Checkout Form & Summary */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-[#f5f3ef] border border-[#ddd9d2] rounded-2xl p-6 shadow-sm space-y-5 text-[#151514]">
              <h2 className="text-base font-bold text-[#151514] pb-3 border-b border-[#ddd9d2]">
                Informasi &amp; Pembayaran
              </h2>

              <form onSubmit={handleCheckoutSubmit} className="space-y-4">
                {/* Kontak */}
                <div>
                  <label className="block text-xs font-bold text-[#151514] mb-1">
                    Nama Lengkap <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Nama penerima pesanan"
                    value={checkoutForm.customer_name}
                    onChange={(e) => setCheckoutForm({ ...checkoutForm, customer_name: e.target.value })}
                    className="w-full bg-[#ebe9e5] border border-[#ddd9d2] rounded-xl px-3.5 py-2 text-xs text-[#151514] focus:outline-none focus:bg-[#faf9f7] focus:border-[#151514]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-[#151514] mb-1">
                      Email Aktif <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="email@example.com"
                      value={checkoutForm.customer_email}
                      onChange={(e) => setCheckoutForm({ ...checkoutForm, customer_email: e.target.value })}
                      className="w-full bg-[#ebe9e5] border border-[#ddd9d2] rounded-xl px-3.5 py-2 text-xs text-[#151514] focus:outline-none focus:bg-[#faf9f7] focus:border-[#151514]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#151514] mb-1">
                      No. WhatsApp / HP <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="08123456789"
                      value={checkoutForm.customer_phone}
                      onChange={(e) => setCheckoutForm({ ...checkoutForm, customer_phone: e.target.value })}
                      className="w-full bg-[#ebe9e5] border border-[#ddd9d2] rounded-xl px-3.5 py-2 text-xs text-[#151514] focus:outline-none focus:bg-[#faf9f7] focus:border-[#151514]"
                    />
                  </div>
                </div>

                {/* Alamat Pengiriman jika ada barang fisik */}
                {hasPhysicalItems ? (
                  <div className="pt-2 border-t border-[#ddd9d2] space-y-3">
                    <span className="text-xs font-bold text-[#151514] flex items-center gap-1.5">
                      <TruckIcon className="w-4 h-4 text-[#151514]" />
                      Alamat Pengiriman (Produk Fisik)
                    </span>

                    <div>
                      <textarea
                        rows={2}
                        required
                        placeholder="Alamat lengkap (Jalan, No Rumah, RT/RW, Kecamatan)"
                        value={checkoutForm.shipping_address}
                        onChange={(e) => setCheckoutForm({ ...checkoutForm, shipping_address: e.target.value })}
                        className="w-full bg-[#ebe9e5] border border-[#ddd9d2] rounded-xl px-3.5 py-2 text-xs text-[#151514] focus:outline-none focus:bg-[#faf9f7] focus:border-[#151514]"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <input
                          type="text"
                          required
                          placeholder="Kota / Kabupaten"
                          value={checkoutForm.city}
                          onChange={(e) => setCheckoutForm({ ...checkoutForm, city: e.target.value })}
                          className="w-full bg-[#ebe9e5] border border-[#ddd9d2] rounded-xl px-3.5 py-2 text-xs text-[#151514] focus:outline-none focus:bg-[#faf9f7] focus:border-[#151514]"
                        />
                      </div>
                      <div>
                        <input
                          type="text"
                          required
                          placeholder="Kode Pos"
                          value={checkoutForm.postal_code}
                          onChange={(e) => setCheckoutForm({ ...checkoutForm, postal_code: e.target.value })}
                          className="w-full bg-[#ebe9e5] border border-[#ddd9d2] rounded-xl px-3.5 py-2 text-xs text-[#151514] focus:outline-none focus:bg-[#faf9f7] focus:border-[#151514]"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-[#ebe9e5] border border-[#ddd9d2] rounded-xl p-3 text-xs text-[#151514]">
                    <p className="font-bold">✓ Pesanan Hanya Produk Digital</p>
                    <p className="text-[11px] text-[#6b665c] mt-0.5">
                      Tidak memerlukan alamat pengiriman fisik. Link unduh langsung tersedia setelah pembayaran lunas.
                    </p>
                  </div>
                )}

                {/* Metode Pembayaran */}
                <div className="pt-2 border-t border-[#ddd9d2] space-y-2">
                  <span className="block text-xs font-bold text-[#151514]">
                    Pilih Metode Pembayaran <span className="text-rose-500">*</span>
                  </span>

                  <div className="space-y-2">
                    {/* Transfer Bank */}
                    <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      checkoutForm.payment_method === "manual_transfer"
                        ? "bg-[#ebe9e5] border-[#151514] shadow-2xs"
                        : "border-[#ddd9d2] hover:bg-[#ebe9e5]/50"
                    }`}>
                      <input
                        type="radio"
                        name="payment_method"
                        value="manual_transfer"
                        checked={checkoutForm.payment_method === "manual_transfer"}
                        onChange={() => setCheckoutForm({ ...checkoutForm, payment_method: "manual_transfer" })}
                        className="accent-[#151514]"
                      />
                      <BanknotesIcon className="w-5 h-5 text-[#151514]" />
                      <div className="flex-1 text-xs">
                        <span className="font-bold text-[#151514] block">Transfer Bank Manual</span>
                        <span className="text-[11px] text-[#6b665c]">BCA, Mandiri, BNI (Verifikasi penjual)</span>
                      </div>
                    </label>

                    {/* QRIS */}
                    <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      checkoutForm.payment_method === "qris"
                        ? "bg-[#ebe9e5] border-[#151514] shadow-2xs"
                        : "border-[#ddd9d2] hover:bg-[#ebe9e5]/50"
                    }`}>
                      <input
                        type="radio"
                        name="payment_method"
                        value="qris"
                        checked={checkoutForm.payment_method === "qris"}
                        onChange={() => setCheckoutForm({ ...checkoutForm, payment_method: "qris" })}
                        className="accent-[#151514]"
                      />
                      <QrCodeIcon className="w-5 h-5 text-emerald-700" />
                      <div className="flex-1 text-xs">
                        <span className="font-bold text-[#151514] block">QRIS (Semua E-Wallet &amp; Mobile Banking)</span>
                        <span className="text-[11px] text-[#6b665c]">GoPay, OVO, Dana, ShopeePay, BCA QR</span>
                      </div>
                    </label>

                    {/* Midtrans */}
                    <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      checkoutForm.payment_method === "midtrans"
                        ? "bg-[#ebe9e5] border-[#151514] shadow-2xs"
                        : "border-[#ddd9d2] hover:bg-[#ebe9e5]/50"
                    }`}>
                      <input
                        type="radio"
                        name="payment_method"
                        value="midtrans"
                        checked={checkoutForm.payment_method === "midtrans"}
                        onChange={() => setCheckoutForm({ ...checkoutForm, payment_method: "midtrans" })}
                        className="accent-[#151514]"
                      />
                      <CreditCardIcon className="w-5 h-5 text-[#151514]" />
                      <div className="flex-1 text-xs">
                        <span className="font-bold text-[#151514] block">Payment Gateway (Midtrans)</span>
                        <span className="text-[11px] text-[#6b665c]">Kartu Kredit, Virtual Account otomatis</span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Ringkasan Biaya Final */}
                <div className="pt-3 border-t border-[#ddd9d2] space-y-1.5 text-xs">
                  <div className="flex justify-between text-[#6b665c]">
                    <span>Subtotal Produk</span>
                    <span className="font-semibold text-[#151514] num-tabular">{formatIDR(cartSubtotal)}</span>
                  </div>
                  <div className="flex justify-between text-[#6b665c]">
                    <span>Biaya Pengiriman</span>
                    <span className="font-semibold text-[#151514] num-tabular">
                      {shippingCost > 0 ? formatIDR(shippingCost) : "Gratis"}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm font-extrabold text-[#151514] pt-2 border-t border-[#ddd9d2]">
                    <span>Total Pembayaran</span>
                    <span className="text-[#151514] text-lg num-tabular">{formatIDR(grandTotal)}</span>
                  </div>
                </div>

                {/* Submit Action Button */}
                <button
                  type="submit"
                  disabled={checkoutLoading}
                  className="w-full py-3.5 bg-[#151514] hover:bg-[#2d2a25] disabled:bg-[#7a7469] text-[#ebe9e5] font-bold text-sm rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 mt-4 tap-effect active:scale-[0.99]"
                >
                  {checkoutLoading ? (
                    <>
                      <ArrowPathIcon className="w-4 h-4 animate-spin" />
                      Memproses Pesanan...
                    </>
                  ) : (
                    <>
                      <span>Konfirmasi &amp; Bayar Sekarang</span>
                      <ArrowRightIcon className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
