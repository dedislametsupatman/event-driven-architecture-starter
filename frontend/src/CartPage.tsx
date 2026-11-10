import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  api,
  Product,
  Order,
  PaymentMethods,
  User,
  CourierRate,
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
    payment_method: "qrisgate",
    qrisgate_channel: "QRIS" as "QRIS" | "BANK_TRANSFER",
    bank_code: "BCA",
  });

  // Pastikan metode bayar default adalah qrisgate
  useEffect(() => {
    if (checkoutForm.payment_method !== "qrisgate") {
      setCheckoutForm((prev) => ({ ...prev, payment_method: "qrisgate" }));
    }
  }, [checkoutForm.payment_method]);

  const [courierRates, setCourierRates] = useState<CourierRate[]>([]);
  const [selectedCourier, setSelectedCourier] = useState<CourierRate | null>(null);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratesMessage, setRatesMessage] = useState<string | null>(null);

  const hasPhysicalItems = cart.some((item) => !item.product.is_digital);
  const cartSubtotal = cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  const shippingCost = hasPhysicalItems ? (selectedCourier ? selectedCourier.price : 15000) : 0;
  const grandTotal = cartSubtotal + shippingCost;
  const totalWeightGrams = cart.reduce(
    (sum, item) => sum + (item.product.is_digital ? 0 : item.product.weight_grams * item.quantity),
    0
  );

  // Ambil opsi kurir Biteship saat kode pos diisi dan ada produk fisik
  useEffect(() => {
    if (!hasPhysicalItems || cart.length === 0) {
      setCourierRates([]);
      setSelectedCourier(null);
      return;
    }

    const postalCode = checkoutForm.postal_code.trim();
    const timer = setTimeout(async () => {
      setRatesLoading(true);
      try {
        const res = await api.getShippingRates({
          destination_postal_code: postalCode,
          items: cart.map((i) => ({
            product_id: i.product.id,
            quantity: i.quantity,
            weight_grams: i.product.weight_grams,
            price: i.product.price,
            name: i.product.name,
          })),
        });

        if (res && res.rates && res.rates.length > 0) {
          setCourierRates(res.rates);
          setRatesMessage(res.message || null);
          setSelectedCourier((prev) => {
            if (!prev) return res.rates[0];
            const found = res.rates.find(
              (r) => r.courier_code === prev.courier_code && r.courier_service_code === prev.courier_service_code
            );
            return found || res.rates[0];
          });
        }
      } catch (err: any) {
        console.warn("Gagal mengecek tarif ekspedisi:", err);
      } finally {
        setRatesLoading(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [hasPhysicalItems, cart, checkoutForm.postal_code]);

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
      // Alur Utama QRISGate: Panggil POST /api/checkout (hitung harga dari DB + buat transaksi QRISGate)
      if (checkoutForm.payment_method === "qrisgate") {
        const res = await api.checkoutQRISGate({
          customer_name: checkoutForm.customer_name,
          customer_email: checkoutForm.customer_email,
          customer_phone: checkoutForm.customer_phone,
          shipping_address: hasPhysicalItems ? checkoutForm.shipping_address : undefined,
          city: hasPhysicalItems ? checkoutForm.city : undefined,
          postal_code: hasPhysicalItems ? checkoutForm.postal_code : undefined,
          courier_name: hasPhysicalItems && selectedCourier ? selectedCourier.courier_name : undefined,
          courier_service: hasPhysicalItems && selectedCourier ? selectedCourier.courier_service_name : undefined,
          courier_etd: hasPhysicalItems && selectedCourier ? selectedCourier.duration : undefined,
          shipping_cost: hasPhysicalItems ? shippingCost : 0,
          payment_method: checkoutForm.qrisgate_channel,
          bank_code: checkoutForm.qrisgate_channel === "BANK_TRANSFER" ? checkoutForm.bank_code : undefined,
          return_url: `${window.location.origin}/order/`,
          items: cart.map((i) => ({ product_id: i.product.id, quantity: i.quantity })),
        });

        const createdOrder = res.order;
        localStorage.setItem("customer_email", checkoutForm.customer_email);
        localStorage.setItem("last_order_id", String(createdOrder.id));
        onClearCart();

        const targetCheckoutUrl = res.data?.checkout_url || res.checkout_url;
        if (targetCheckoutUrl) {
          // Redirect langsung ke halaman pembayaran resmi QRISGate (atau halaman /order/:id jika simulasi lokal)
          window.location.href = targetCheckoutUrl;
          return;
        }

        onOrderCreated(createdOrder);
        return;
      }

      const order = await api.createOrder({
        customer_name: checkoutForm.customer_name,
        customer_email: checkoutForm.customer_email,
        customer_phone: checkoutForm.customer_phone,
        shipping_address: hasPhysicalItems ? checkoutForm.shipping_address : undefined,
        city: hasPhysicalItems ? checkoutForm.city : undefined,
        postal_code: hasPhysicalItems ? checkoutForm.postal_code : undefined,
        courier_name: hasPhysicalItems && selectedCourier ? selectedCourier.courier_name : undefined,
        courier_service: hasPhysicalItems && selectedCourier ? selectedCourier.courier_service_name : undefined,
        courier_etd: hasPhysicalItems && selectedCourier ? selectedCourier.duration : undefined,
        shipping_cost: hasPhysicalItems ? shippingCost : 0,
        payment_method: checkoutForm.payment_method,
        items: cart.map((i) => ({ product_id: i.product.id, quantity: i.quantity })),
      });

      localStorage.setItem("customer_email", checkoutForm.customer_email);
      localStorage.setItem("last_order_id", String(order.id));
      showToast("Pesanan #" + order.id + " berhasil dibuat!");
      onClearCart();

      // Jika menggunakan Duitku, buka popup POP Duitku
      if (checkoutForm.payment_method === "duitku") {
        try {
          const invoice = await api.createDuitkuInvoice({
            order_id: order.id,
            payment_amount: order.grand_total,
            product_details: `Pesanan #${order.id} Supatman Store`,
            customer_name: checkoutForm.customer_name,
            customer_email: checkoutForm.customer_email,
            customer_phone: checkoutForm.customer_phone,
            return_url: `${window.location.origin}/orders`,
            callback_url: `${window.location.origin}/payment/duitku/callback`,
          });

          if (invoice.reference && !invoice.reference.startsWith("MOCK-")) {
            // Load Duitku POP script
            await new Promise<void>((resolve, reject) => {
              const existing = document.getElementById("duitku-script");
              if (existing) {
                resolve();
                return;
              }
              const script = document.createElement("script");
              script.id = "duitku-script";
              script.src = invoice.sandbox
                ? "https://app-sandbox.duitku.com/lib/js/duitku.js"
                : "https://app-prod.duitku.com/lib/js/duitku.js";
              script.async = true;
              script.onload = () => resolve();
              script.onerror = () => reject(new Error("Gagal memuat SDK Duitku"));
              document.body.appendChild(script);
            });

            if ((window as any).checkout?.process) {
              (window as any).checkout.process(invoice.reference, {
                defaultLanguage: "id",
                successEvent: function () {
                  showToast("Pembayaran Duitku berhasil!");
                  onNavigate("orders", `/orders?order_id=${order.id}`);
                },
                pendingEvent: function () {
                  showToast("Menunggu penyelesaian pembayaran.");
                  onNavigate("orders", `/orders?order_id=${order.id}`);
                },
                errorEvent: function () {
                  alert("Pembayaran Duitku dibatalkan atau bermasalah.");
                  onNavigate("orders", `/orders?order_id=${order.id}`);
                },
                closeEvent: function () {
                  onNavigate("orders", `/orders?order_id=${order.id}`);
                },
              });
              onOrderCreated(order);
              return;
            }
          }

          if (invoice.payment_url && !invoice.reference.startsWith("MOCK-")) {
            window.location.href = invoice.payment_url;
            return;
          }
        } catch (duitkuErr: any) {
          console.warn("Duitku POP error, proceeding to order detail:", duitkuErr);
        }
      }

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
                          placeholder="Kode Pos (5 digit)"
                          value={checkoutForm.postal_code}
                          onChange={(e) => setCheckoutForm({ ...checkoutForm, postal_code: e.target.value })}
                          className="w-full bg-[#ebe9e5] border border-[#ddd9d2] rounded-xl px-3.5 py-2 text-xs text-[#151514] focus:outline-none focus:bg-[#faf9f7] focus:border-[#151514]"
                        />
                      </div>
                    </div>

                    {/* Pemilihan Kurir Ekspedisi (Biteship) */}
                    <div className="space-y-2 pt-2 border-t border-[#ddd9d2]/60">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#151514] flex items-center gap-1.5">
                          <TruckIcon className="w-3.5 h-3.5 text-[#151514]" />
                          Pilih Layanan Kurir &amp; Ekspedisi
                        </span>
                        {ratesLoading && (
                          <span className="text-[10px] text-[#6b665c] font-medium flex items-center gap-1 animate-pulse">
                            <ArrowPathIcon className="w-3 h-3 animate-spin" />
                            Cek tarif...
                          </span>
                        )}
                      </div>

                      {checkoutForm.postal_code.trim().length < 5 && (
                        <p className="text-[10px] text-[#8c827a] leading-relaxed">
                          💡 Masukkan 5 digit kode pos untuk menampilkan opsi kurir (JNE, SiCepat, J&amp;T, AnterAja) secara akurat.
                        </p>
                      )}

                      {ratesLoading && courierRates.length === 0 ? (
                        <div className="p-3 bg-[#ebe9e5] rounded-xl text-center text-xs text-[#6b665c] animate-pulse">
                          Sedang mengambil opsi ongkir...
                        </div>
                      ) : courierRates.length > 0 ? (
                        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
                          {courierRates.map((rate, idx) => {
                            const isSelected =
                              selectedCourier?.courier_code === rate.courier_code &&
                              selectedCourier?.courier_service_code === rate.courier_service_code;
                            return (
                              <button
                                key={`${rate.courier_code}-${rate.courier_service_code}-${idx}`}
                                type="button"
                                onClick={() => setSelectedCourier(rate)}
                                className={`w-full text-left p-2.5 rounded-xl border text-xs transition flex items-center justify-between ${
                                  isSelected
                                    ? "bg-white border-[#151514] shadow-xs"
                                    : "bg-[#f5f3ef] border-[#ddd9d2] hover:border-[#151514]/40"
                                }`}
                              >
                                <div className="flex items-center gap-2.5">
                                  <div
                                    className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${
                                      isSelected ? "border-[#151514] bg-[#151514]" : "border-[#b0aaa0]"
                                    }`}
                                  >
                                    {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                  </div>
                                  <div>
                                    <div className="font-bold text-[#151514] flex items-center gap-1.5">
                                      <span>{rate.courier_name}</span>
                                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-[#ebe9e5] text-[#555]">
                                        {rate.courier_service_name}
                                      </span>
                                    </div>
                                    <div className="text-[10px] text-[#6b665c]">
                                      Estimasi: {rate.duration || "1-3 Hari"}
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <span className="font-bold text-[#151514] num-tabular text-xs">
                                    {formatIDR(rate.price)}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      ) : null}
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
                    {/* Opsi Pembayaran Utama: QRIS (Semua E-Wallet & Mobile Banking) */}
                    <div
                      className={`rounded-xl border transition-all ${
                        checkoutForm.payment_method === "qrisgate"
                          ? "bg-[#ebe9e5] border-[#151514] shadow-2xs"
                          : "border-[#ddd9d2] hover:bg-[#ebe9e5]/50"
                      }`}
                    >
                      <label className="flex items-center gap-3 p-3 cursor-pointer">
                        <input
                          type="radio"
                          name="payment_method"
                          value="qrisgate"
                          checked={checkoutForm.payment_method === "qrisgate"}
                          onChange={() => setCheckoutForm({ ...checkoutForm, payment_method: "qrisgate" })}
                          className="accent-[#151514]"
                        />
                        <QrCodeIcon className="w-5 h-5 text-emerald-700" />
                        <div className="flex-1 text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[#151514]">
                              QRIS (Semua E-Wallet &amp; Mobile Banking)
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white">
                              Verifikasi Otomatis
                            </span>
                          </div>
                          <span className="text-[11px] text-[#6b665c]">
                            GoPay, OVO, Dana, ShopeePay, BCA QR
                          </span>
                        </div>
                      </label>

                      {checkoutForm.payment_method === "qrisgate" && (
                        <div className="px-3 pb-3 pt-1 border-t border-[#ddd9d2]/70 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setCheckoutForm({ ...checkoutForm, qrisgate_channel: "QRIS" })}
                              className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all ${
                                checkoutForm.qrisgate_channel === "QRIS"
                                  ? "bg-[#151514] text-[#ebe9e5] border-[#151514]"
                                  : "bg-[#f5f3ef] text-[#151514] border-[#ddd9d2]"
                              }`}
                            >
                              QRIS Semua E-Wallet/Bank
                            </button>
                            <button
                              type="button"
                              onClick={() => setCheckoutForm({ ...checkoutForm, qrisgate_channel: "BANK_TRANSFER" })}
                              className={`py-2 px-3 rounded-lg text-xs font-bold border transition-all ${
                                checkoutForm.qrisgate_channel === "BANK_TRANSFER"
                                  ? "bg-[#151514] text-[#ebe9e5] border-[#151514]"
                                  : "bg-[#f5f3ef] text-[#151514] border-[#ddd9d2]"
                              }`}
                            >
                              Transfer Bank (Kode Unik)
                            </button>
                          </div>

                          {checkoutForm.qrisgate_channel === "BANK_TRANSFER" && (
                            <div className="flex items-center gap-2 pt-1">
                              <span className="text-[11px] font-semibold text-[#6b665c]">Pilih Bank:</span>
                              {["BCA", "MANDIRI", "BRI", "BNI"].map((code) => (
                                <button
                                  key={code}
                                  type="button"
                                  onClick={() => setCheckoutForm({ ...checkoutForm, bank_code: code })}
                                  className={`px-2.5 py-1 rounded-md text-[11px] font-bold border ${
                                    checkoutForm.bank_code === code
                                      ? "bg-[#151514] text-[#ebe9e5] border-[#151514]"
                                      : "bg-[#f5f3ef] text-[#151514] border-[#ddd9d2]"
                                  }`}
                                >
                                  {code}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Ringkasan Biaya Final */}
                <div className="pt-3 border-t border-[#ddd9d2] space-y-1.5 text-xs">
                  <div className="flex justify-between text-[#6b665c]">
                    <span>Subtotal Produk</span>
                    <span className="font-semibold text-[#151514] num-tabular">{formatIDR(cartSubtotal)}</span>
                  </div>
                  <div className="flex justify-between text-[#6b665c]">
                    <span>
                      Biaya Pengiriman
                      {hasPhysicalItems && selectedCourier ? ` (${selectedCourier.courier_name} ${selectedCourier.courier_service_name})` : ""}
                    </span>
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
