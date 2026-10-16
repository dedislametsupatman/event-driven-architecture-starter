import React, { useState } from "react";
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
        <div className="my-16 bg-white border border-slate-200 rounded-3xl p-12 text-center max-w-lg mx-auto shadow-xs space-y-4">
          <div className="w-20 h-20 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
            <ShoppingBagIcon className="w-10 h-10" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Keranjang Belanja Anda Kosong</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Belum ada produk yang ditambahkan ke keranjang. Temukan perlengkapan setup kerja minimalis dan aset digital eksklusif sekarang.
          </p>
          <div className="pt-3">
            <button
              onClick={() => onNavigate("store", "/")}
              className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm transition-all"
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
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
              <h2 className="text-base font-bold text-slate-900 pb-3 border-b border-slate-100 flex items-center justify-between">
                <span>Daftar Produk ({cart.reduce((t, i) => t + i.quantity, 0)} item)</span>
                {totalWeightGrams > 0 && (
                  <span className="text-xs font-normal text-slate-500">
                    Estimasi Berat: {(totalWeightGrams / 1000).toFixed(1)} kg
                  </span>
                )}
              </h2>

              <div className="divide-y divide-slate-100">
                {cart.map((item) => (
                  <div key={item.product.id} className="py-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                    {/* Thumbnail */}
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-slate-100 overflow-hidden flex-shrink-0 border border-slate-200">
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
                          item.product.is_digital ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                        }`}>
                          {item.product.is_digital ? "Aset Digital" : "Barang Fisik"}
                        </span>
                        {item.product.category_name && (
                          <span className="text-slate-400 text-xs">• {item.product.category_name}</span>
                        )}
                      </div>
                      <h3 className="font-bold text-slate-900 text-sm">{item.product.name}</h3>
                      <p className="text-xs font-black text-blue-600 num-tabular mt-0.5">
                        {formatIDR(item.product.price)}
                      </p>
                    </div>

                    {/* Quantity Controls & Total */}
                    <div className="flex items-center justify-between sm:justify-end gap-4 w-full sm:w-auto">
                      <div className="flex items-center border border-slate-200 rounded-xl bg-slate-50 overflow-hidden">
                        <button
                          onClick={() => onUpdateQuantity(item.product.id, -1)}
                          className="p-1.5 hover:bg-slate-200 text-slate-600 transition-colors"
                          aria-label="Kurangi kuantitas"
                        >
                          <MinusIcon className="w-3.5 h-3.5" />
                        </button>
                        <span className="px-3 text-xs font-bold text-slate-900 num-tabular">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => onUpdateQuantity(item.product.id, 1)}
                          className="p-1.5 hover:bg-slate-200 text-slate-600 transition-colors"
                          aria-label="Tambah kuantitas"
                        >
                          <PlusIcon className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <span className="font-black text-slate-900 text-sm num-tabular w-24 text-right">
                        {formatIDR(item.product.price * item.quantity)}
                      </span>

                      <button
                        onClick={() => onRemoveItem(item.product.id)}
                        className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors"
                        title="Hapus dari keranjang"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottom Add More Button */}
              <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                <button
                  onClick={() => onNavigate("store", "/")}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                >
                  + Tambah Produk Lainnya
                </button>
                <span className="text-xs text-slate-500">
                  Subtotal: <strong className="text-slate-900 num-tabular">{formatIDR(cartSubtotal)}</strong>
                </span>
              </div>
            </div>

            {/* Jaminan & Layanan */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center gap-3 text-xs text-slate-700">
                <ShieldCheckIcon className="w-6 h-6 text-emerald-600 flex-shrink-0" />
                <div>
                  <span className="font-bold text-slate-900">Garansi 100% Aman</span>
                  <p className="text-[11px] text-slate-500">Privasi dan transaksi terlindungi dengan enkripsi tinggi.</p>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center gap-3 text-xs text-slate-700">
                <TruckIcon className="w-6 h-6 text-blue-600 flex-shrink-0" />
                <div>
                  <span className="font-bold text-slate-900">Pengiriman Cepat</span>
                  <p className="text-[11px] text-slate-500">Produk digital instan &amp; pengiriman fisik berpelacak resi.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Checkout Form & Summary */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
              <h2 className="text-base font-bold text-slate-900 pb-3 border-b border-slate-100">
                Informasi &amp; Pembayaran
              </h2>

              <form onSubmit={handleCheckoutSubmit} className="space-y-4">
                {/* Kontak */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nama Lengkap <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Nama penerima pesanan"
                    value={checkoutForm.customer_name}
                    onChange={(e) => setCheckoutForm({ ...checkoutForm, customer_name: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Email Aktif <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="email@example.com"
                      value={checkoutForm.customer_email}
                      onChange={(e) => setCheckoutForm({ ...checkoutForm, customer_email: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      No. WhatsApp / HP <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="08123456789"
                      value={checkoutForm.customer_phone}
                      onChange={(e) => setCheckoutForm({ ...checkoutForm, customer_phone: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                    />
                  </div>
                </div>

                {/* Alamat Pengiriman jika ada barang fisik */}
                {hasPhysicalItems ? (
                  <div className="pt-2 border-t border-slate-100 space-y-3">
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <TruckIcon className="w-4 h-4 text-blue-600" />
                      Alamat Pengiriman (Produk Fisik)
                    </span>

                    <div>
                      <textarea
                        rows={2}
                        required
                        placeholder="Alamat lengkap (Jalan, No Rumah, RT/RW, Kecamatan)"
                        value={checkoutForm.shipping_address}
                        onChange={(e) => setCheckoutForm({ ...checkoutForm, shipping_address: e.target.value })}
                        className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
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
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                        />
                      </div>
                      <div>
                        <input
                          type="text"
                          required
                          placeholder="Kode Pos"
                          value={checkoutForm.postal_code}
                          onChange={(e) => setCheckoutForm({ ...checkoutForm, postal_code: e.target.value })}
                          className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3.5 py-2 text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-xs text-purple-900">
                    <p className="font-bold">✓ Pesanan Hanya Produk Digital</p>
                    <p className="text-[11px] text-purple-700 mt-0.5">
                      Tidak memerlukan alamat pengiriman fisik. Link unduh langsung tersedia setelah pembayaran lunas.
                    </p>
                  </div>
                )}

                {/* Metode Pembayaran */}
                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <span className="block text-xs font-bold text-slate-900">
                    Pilih Metode Pembayaran <span className="text-rose-500">*</span>
                  </span>

                  <div className="space-y-2">
                    {/* Transfer Bank */}
                    <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      checkoutForm.payment_method === "manual_transfer"
                        ? "bg-blue-50/50 border-blue-600 shadow-2xs"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}>
                      <input
                        type="radio"
                        name="payment_method"
                        value="manual_transfer"
                        checked={checkoutForm.payment_method === "manual_transfer"}
                        onChange={() => setCheckoutForm({ ...checkoutForm, payment_method: "manual_transfer" })}
                        className="text-blue-600"
                      />
                      <BanknotesIcon className="w-5 h-5 text-blue-600" />
                      <div className="flex-1 text-xs">
                        <span className="font-bold text-slate-900 block">Transfer Bank Manual</span>
                        <span className="text-[11px] text-slate-500">BCA, Mandiri, BNI (Verifikasi penjual)</span>
                      </div>
                    </label>

                    {/* QRIS */}
                    <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      checkoutForm.payment_method === "qris"
                        ? "bg-blue-50/50 border-blue-600 shadow-2xs"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}>
                      <input
                        type="radio"
                        name="payment_method"
                        value="qris"
                        checked={checkoutForm.payment_method === "qris"}
                        onChange={() => setCheckoutForm({ ...checkoutForm, payment_method: "qris" })}
                        className="text-blue-600"
                      />
                      <QrCodeIcon className="w-5 h-5 text-emerald-600" />
                      <div className="flex-1 text-xs">
                        <span className="font-bold text-slate-900 block">QRIS (Semua E-Wallet &amp; Mobile Banking)</span>
                        <span className="text-[11px] text-slate-500">GoPay, OVO, Dana, ShopeePay, BCA QR</span>
                      </div>
                    </label>

                    {/* Midtrans */}
                    <label className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      checkoutForm.payment_method === "midtrans"
                        ? "bg-blue-50/50 border-blue-600 shadow-2xs"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}>
                      <input
                        type="radio"
                        name="payment_method"
                        value="midtrans"
                        checked={checkoutForm.payment_method === "midtrans"}
                        onChange={() => setCheckoutForm({ ...checkoutForm, payment_method: "midtrans" })}
                        className="text-blue-600"
                      />
                      <CreditCardIcon className="w-5 h-5 text-indigo-600" />
                      <div className="flex-1 text-xs">
                        <span className="font-bold text-slate-900 block">Payment Gateway (Midtrans)</span>
                        <span className="text-[11px] text-slate-500">Kartu Kredit, Virtual Account otomatis</span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Ringkasan Biaya Final */}
                <div className="pt-3 border-t border-slate-100 space-y-1.5 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal Produk</span>
                    <span className="font-semibold text-slate-900 num-tabular">{formatIDR(cartSubtotal)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Biaya Pengiriman</span>
                    <span className="font-semibold text-slate-900 num-tabular">
                      {shippingCost > 0 ? formatIDR(shippingCost) : "Gratis"}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm font-extrabold text-slate-900 pt-2 border-t border-slate-100">
                    <span>Total Pembayaran</span>
                    <span className="text-blue-600 text-lg num-tabular">{formatIDR(grandTotal)}</span>
                  </div>
                </div>

                {/* Submit Action Button */}
                <button
                  type="submit"
                  disabled={checkoutLoading}
                  className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold text-sm rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 mt-4"
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
