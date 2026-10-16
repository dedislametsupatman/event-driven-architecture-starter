import React, { useState, useEffect } from "react";
import {
  api,
  Order,
  PaymentMethods,
  User,
} from "./api";
import {
  TruckIcon,
  CheckCircleIcon,
  ClockIcon,
  ArrowDownTrayIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  ArrowLeftIcon,
  DocumentArrowDownIcon,
  BanknotesIcon,
  QrCodeIcon,
  CreditCardIcon,
  ShoppingBagIcon,
  CheckBadgeIcon,
  DocumentDuplicateIcon,
  ArrowTopRightOnSquareIcon,
  PhotoIcon,
  ArrowUpTrayIcon,
} from "@heroicons/react/24/outline";

interface OrdersPageProps {
  currentUser: User | null;
  paymentMethods: PaymentMethods | null;
  initialOrderId?: number | string | null;
  onNavigate: (view: "store" | "cart" | "orders" | "profile" | "cms", path: string) => void;
  showToast: (msg: string) => void;
}

export function OrdersPage({
  currentUser,
  paymentMethods,
  initialOrderId,
  onNavigate,
  showToast,
}: OrdersPageProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [searchId, setSearchId] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Upload proof state
  const [proofUrl, setProofUrl] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [proofMode, setProofMode] = useState<"file" | "url">("file");
  const [uploadingProof, setUploadingProof] = useState(false);
  const [proofSuccess, setProofSuccess] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Load user orders or initial order
  useEffect(() => {
    if (initialOrderId) {
      loadSpecificOrder(initialOrderId);
    }
    if (currentUser) {
      loadUserOrders();
    }
  }, [currentUser, initialOrderId]);

  const loadUserOrders = async () => {
    setLoadingOrders(true);
    try {
      const res = await api.getOrders();
      setOrders(res.orders || []);
    } catch (err: any) {
      console.error("Gagal memuat daftar pesanan:", err);
    } finally {
      setLoadingOrders(false);
    }
  };

  const loadSpecificOrder = async (id: number | string) => {
    setLoadingDetail(true);
    setSearchError(null);
    try {
      const ord = await api.getOrder(id);
      setSelectedOrder(ord);
      setProofUrl("");
      setProofSuccess(false);
    } catch (err: any) {
      setSearchError("Pesanan dengan ID #" + id + " tidak ditemukan.");
      setSelectedOrder(null);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanId = searchId.replace(/[^0-9]/g, "");
    if (!cleanId) return;
    loadSpecificOrder(cleanId);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Security check 1: Strictly whitelist image MIME types only
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      alert("Hanya file gambar asli (JPG, PNG, WebP, GIF) yang diperbolehkan demi keamanan sistem.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    // Security check 2: Enforce max 5 MB file size limit
    if (file.size > 5 * 1024 * 1024) {
      alert("Ukuran gambar terlalu besar! Maksimal 5 MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setProofFile(file);
    const reader = new FileReader();
    reader.onload = () => {
      setProofPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUploadProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;

    if (proofMode === "file") {
      if (!proofPreview) {
        alert("Pilih file foto bukti transfer terlebih dahulu.");
        return;
      }
    } else {
      if (!proofUrl.trim()) {
        alert("Masukkan URL atau link foto bukti transfer.");
        return;
      }
    }

    setUploadingProof(true);
    try {
      if (proofMode === "file" && proofPreview) {
        // Upload directly to PaymentProofs bucket with security inspection
        await api.uploadProofFile(selectedOrder.id, {
          data: proofPreview,
          file_name: proofFile?.name || "bukti-transfer.jpg",
        });
      } else {
        await api.uploadProof(selectedOrder.id, proofUrl.trim());
      }

      setProofSuccess(true);
      showToast("Bukti pembayaran berhasil diunggah ke storage! Menunggu verifikasi.");
      // Refresh order detail
      const updated = await api.getOrder(selectedOrder.id);
      setSelectedOrder(updated);
      setProofFile(null);
      setProofPreview(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (currentUser) loadUserOrders();
    } catch (err: any) {
      alert(err.message || "Gagal mengunggah bukti pembayaran.");
    } finally {
      setUploadingProof(false);
    }
  };

  const formatIDR = (val: number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(val);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast(`${label} disalin ke clipboard!`);
  };

  const filteredOrders = orders.filter((ord) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "pending") return ord.status === "pending";
    if (statusFilter === "paid_processing") return ord.status === "paid" || ord.status === "processing";
    if (statusFilter === "shipped") return ord.status === "shipped";
    if (statusFilter === "completed") return ord.status === "completed";
    if (statusFilter === "cancelled") return ord.status === "cancelled";
    return true;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "paid":
      case "completed":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircleIcon className="w-3.5 h-3.5" />
            {status === "paid" ? "Sudah Dibayar" : "Selesai"}
          </span>
        );
      case "shipped":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-sky-100 text-sky-800 border border-sky-200">
            <TruckIcon className="w-3.5 h-3.5" />
            Dikirim
          </span>
        );
      case "processing":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200">
            <ClockIcon className="w-3.5 h-3.5" />
            Diproses
          </span>
        );
      case "cancelled":
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-100 text-rose-800 border border-rose-200">
            Dibatalkan
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">
            <ClockIcon className="w-3.5 h-3.5" />
            Menunggu Pembayaran
          </span>
        );
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
      {/* Header Halaman */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button
              onClick={() => onNavigate("store", "/")}
              className="text-xs font-semibold text-slate-500 hover:text-blue-600 flex items-center gap-1"
            >
              <ArrowLeftIcon className="w-3.5 h-3.5" />
              Kembali ke Toko
            </button>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Riwayat &amp; Pelacakan Pesanan
          </h1>
          <p className="text-sm text-slate-500">
            Cek status pengiriman pesanan fisik atau langsung unduh file untuk produk digital Anda.
          </p>
        </div>

        {/* Quick Search Order ID */}
        <div className="w-full md:w-auto">
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <div className="relative flex-1 md:w-72">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Cari ID Pesanan (contoh: 1)"
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 shadow-xs"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
            >
              Cek Pesanan
            </button>
          </form>
          {searchError && (
            <p className="text-xs text-rose-600 mt-1 font-medium">{searchError}</p>
          )}
        </div>
      </div>

      {/* Main Content: Split into Detail View OR List View */}
      {selectedOrder ? (
        /* DETAIL PESANAN TERPILIH (Dedicated Page View) */
        <div className="mt-8 space-y-6">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSelectedOrder(null)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-all shadow-xs"
            >
              <ArrowLeftIcon className="w-4 h-4" />
              Lihat Semua Pesanan Saya
            </button>

            <button
              onClick={() => loadSpecificOrder(selectedOrder.id)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:text-blue-600 transition-all"
            >
              <ArrowPathIcon className="w-3.5 h-3.5" />
              Segarkan Status
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Kolom Kiri: Ringkasan & Item Pesanan */}
            <div className="lg:col-span-7 space-y-6">
              {/* Order Card Header */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
                  <div>
                    <span className="text-xs text-slate-400 font-medium">Nomor ID Pesanan</span>
                    <h2 className="text-2xl font-black text-slate-900 num-tabular tracking-tight">
                      #ORDER-{selectedOrder.id}
                    </h2>
                    <span className="text-xs text-slate-500">
                      Waktu Pemesanan: {new Date(selectedOrder.created_at).toLocaleString("id-ID")}
                    </span>
                  </div>
                  <div>
                    {getStatusBadge(selectedOrder.status)}
                  </div>
                </div>

                {/* Progress Status Bar */}
                <div className="pt-6">
                  <div className="grid grid-cols-4 gap-2 text-center text-xs">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold mb-1 shadow-xs">
                        1
                      </div>
                      <span className="font-semibold text-slate-900">Pesanan Dibuat</span>
                    </div>

                    <div className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mb-1 shadow-xs ${
                        selectedOrder.status !== "pending" && selectedOrder.status !== "cancelled"
                          ? "bg-blue-600 text-white"
                          : "bg-slate-100 text-slate-400"
                      }`}>
                        2
                      </div>
                      <span className={`font-semibold ${selectedOrder.status !== "pending" && selectedOrder.status !== "cancelled" ? "text-slate-900" : "text-slate-400"}`}>
                        Pembayaran
                      </span>
                    </div>

                    <div className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mb-1 shadow-xs ${
                        selectedOrder.status === "processing" || selectedOrder.status === "shipped" || selectedOrder.status === "completed"
                          ? "bg-blue-600 text-white"
                          : "bg-slate-100 text-slate-400"
                      }`}>
                        3
                      </div>
                      <span className={`font-semibold ${selectedOrder.status === "processing" || selectedOrder.status === "shipped" || selectedOrder.status === "completed" ? "text-slate-900" : "text-slate-400"}`}>
                        Diproses
                      </span>
                    </div>

                    <div className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold mb-1 shadow-xs ${
                        selectedOrder.status === "completed" || selectedOrder.status === "shipped"
                          ? "bg-emerald-600 text-white"
                          : "bg-slate-100 text-slate-400"
                      }`}>
                        4
                      </div>
                      <span className={`font-semibold ${selectedOrder.status === "completed" || selectedOrder.status === "shipped" ? "text-emerald-700 font-bold" : "text-slate-400"}`}>
                        {selectedOrder.is_digital_only ? "Akses Terbuka" : "Selesai/Kirim"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Rincian Produk yang Dipesan */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
                <h3 className="text-base font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <ShoppingBagIcon className="w-5 h-5 text-blue-600" />
                  Rincian Produk
                </h3>

                <div className="divide-y divide-slate-100">
                  {selectedOrder.items && selectedOrder.items.length > 0 ? (
                    selectedOrder.items.map((item) => (
                      <div key={item.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-bold text-slate-900 text-sm">{item.product_name}</h4>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              item.is_digital ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                            }`}>
                              {item.is_digital ? "Produk Digital" : "Produk Fisik"}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500">
                            {formatIDR(item.price)} × {item.quantity} item
                          </p>
                        </div>

                        <div className="flex items-center gap-4 justify-between sm:justify-end">
                          <span className="font-extrabold text-slate-900 text-sm num-tabular">
                            {formatIDR(item.price * item.quantity)}
                          </span>

                          {/* Digital Download Action Button */}
                          {item.is_digital && (selectedOrder.status === "paid" || selectedOrder.status === "completed") && (
                            <a
                              href={item.digital_file_url || "#"}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs transition-all"
                            >
                              <ArrowDownTrayIcon className="w-4 h-4" />
                              Unduh File
                            </a>
                          )}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-4 text-xs text-slate-500">
                      Total Belanja: {formatIDR(selectedOrder.total_amount)}
                    </div>
                  )}
                </div>

                {/* Subtotal & Breakdown */}
                <div className="border-t border-slate-100 pt-4 mt-2 space-y-2 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal Produk:</span>
                    <span className="font-semibold text-slate-900 num-tabular">{formatIDR(selectedOrder.total_amount)}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Ongkos Kirim:</span>
                    <span className="font-semibold text-slate-900 num-tabular">
                      {selectedOrder.shipping_cost > 0 ? formatIDR(selectedOrder.shipping_cost) : "Gratis (Digital / Promo)"}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm font-extrabold text-slate-900 pt-2 border-t border-slate-100">
                    <span>Total Pembayaran:</span>
                    <span className="text-blue-600 text-base num-tabular">{formatIDR(selectedOrder.grand_total)}</span>
                  </div>
                </div>
              </div>

              {/* Data Pengiriman (Jika Produk Fisik) */}
              {!selectedOrder.is_digital_only && (
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs">
                  <h3 className="text-base font-bold text-slate-900 mb-3 flex items-center gap-2">
                    <TruckIcon className="w-5 h-5 text-blue-600" />
                    Informasi Pengiriman &amp; Penerima
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-slate-400 font-medium">Nama Penerima:</span>
                      <p className="font-bold text-slate-800 text-sm mt-0.5">{selectedOrder.customer_name}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 font-medium">Nomor WhatsApp:</span>
                      <p className="font-bold text-slate-800 text-sm mt-0.5">{selectedOrder.customer_phone}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-slate-400 font-medium">Alamat Tujuan:</span>
                      <p className="font-semibold text-slate-800 mt-0.5">
                        {selectedOrder.shipping_address}, {selectedOrder.city} {selectedOrder.postal_code}
                      </p>
                    </div>
                    {selectedOrder.tracking_number && (
                      <div className="sm:col-span-2 bg-sky-50 border border-sky-200 p-3 rounded-xl flex items-center justify-between">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-sky-800 tracking-wider">Nomor Resi Pengiriman:</span>
                          <p className="font-black text-sky-900 text-sm num-tabular">{selectedOrder.tracking_number}</p>
                        </div>
                        <button
                          onClick={() => copyToClipboard(selectedOrder.tracking_number || "", "Nomor Resi")}
                          className="px-2.5 py-1 bg-white border border-sky-300 rounded-lg text-xs font-bold text-sky-700 hover:bg-sky-100"
                        >
                          Salin Resi
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Kolom Kanan: Panduan Pembayaran & Upload Bukti */}
            <div className="lg:col-span-5 space-y-6">
              {/* Petunjuk Pembayaran jika status Pending */}
              {selectedOrder.status === "pending" ? (
                <div className="bg-white border-2 border-amber-200 rounded-2xl p-6 shadow-xs space-y-5">
                  <div className="flex items-center gap-2 text-amber-800">
                    <ClockIcon className="w-6 h-6 text-amber-600" />
                    <div>
                      <h3 className="font-bold text-base text-slate-900">Menunggu Pembayaran</h3>
                      <p className="text-xs text-slate-500">Silakan selesaikan pembayaran agar pesanan diproses.</p>
                    </div>
                  </div>

                  {/* Nominal Tagihan */}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <span className="text-xs text-amber-800 font-medium">Jumlah yang Harus Ditransfer:</span>
                      <p className="text-xl font-black text-amber-950 num-tabular">
                        {formatIDR(selectedOrder.grand_total)}
                      </p>
                    </div>
                    <button
                      onClick={() => copyToClipboard(String(selectedOrder.grand_total), "Nominal transfer")}
                      className="px-3 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-bold text-amber-900 hover:bg-amber-100 transition-all flex items-center gap-1"
                    >
                      <DocumentDuplicateIcon className="w-4 h-4" />
                      Salin
                    </button>
                  </div>

                  {/* Manual Transfer Accounts */}
                  {selectedOrder.payment_method === "manual_transfer" && (
                    <div className="space-y-3 pt-2">
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Pilihan Rekening Pembayaran:
                      </span>

                      {paymentMethods?.manual_banks && paymentMethods.manual_banks.length > 0 ? (
                        paymentMethods.manual_banks.map((acc, idx) => (
                          <div key={idx} className="border border-slate-200 rounded-xl p-3 bg-slate-50 flex items-center justify-between">
                            <div>
                              <span className="text-xs font-bold text-slate-900">{acc.bank_name}</span>
                              <p className="text-sm font-black text-blue-700 num-tabular tracking-wide">{acc.account_number}</p>
                              <span className="text-[11px] text-slate-500">a.n. {acc.account_holder}</span>
                            </div>
                            <button
                              onClick={() => copyToClipboard(acc.account_number, `Nomor rekening ${acc.bank_name}`)}
                              className="px-2.5 py-1 bg-white border border-slate-300 hover:border-blue-500 rounded-lg text-xs font-semibold text-slate-700 transition-all"
                            >
                              Salin No. Rek
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 space-y-2 text-xs">
                          <div className="flex justify-between items-center">
                            <div>
                              <span className="font-bold text-slate-800">BCA (Bank Central Asia)</span>
                              <p className="font-bold text-blue-700 text-sm">8001234567</p>
                              <span className="text-[11px] text-slate-500">a.n. Dedi Supatman</span>
                            </div>
                            <button
                              onClick={() => copyToClipboard("8001234567", "No. Rekening BCA")}
                              className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700"
                            >
                              Salin
                            </button>
                          </div>
                          <div className="flex justify-between items-center pt-2 border-t border-slate-200">
                            <div>
                              <span className="font-bold text-slate-800">Bank Mandiri</span>
                              <p className="font-bold text-blue-700 text-sm">1370019876543</p>
                              <span className="text-[11px] text-slate-500">a.n. Dedi Supatman</span>
                            </div>
                            <button
                              onClick={() => copyToClipboard("1370019876543", "No. Rekening Mandiri")}
                              className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-700"
                            >
                              Salin
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Form Upload Bukti Transfer ke Bucket */}
                      <form onSubmit={handleUploadProof} className="pt-4 border-t border-slate-100 space-y-3">
                        <div className="flex items-center justify-between">
                          <label className="block text-xs font-bold text-slate-800">
                            Upload Bukti Pembayaran:
                          </label>
                          <div className="flex items-center gap-1.5 text-[11px]">
                            <button
                              type="button"
                              onClick={() => setProofMode("file")}
                              className={`px-2 py-0.5 rounded font-bold transition-all ${
                                proofMode === "file"
                                  ? "bg-blue-100 text-blue-700"
                                  : "text-slate-500 hover:text-slate-800"
                              }`}
                            >
                              File Gambar
                            </button>
                            <span>|</span>
                            <button
                              type="button"
                              onClick={() => setProofMode("url")}
                              className={`px-2 py-0.5 rounded font-bold transition-all ${
                                proofMode === "url"
                                  ? "bg-blue-100 text-blue-700"
                                  : "text-slate-500 hover:text-slate-800"
                              }`}
                            >
                              Link URL
                            </button>
                          </div>
                        </div>

                        {proofMode === "file" ? (
                          <div className="space-y-2">
                            {/* Hidden file input */}
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept="image/jpeg,image/png,image/webp,image/gif"
                              onChange={handleFileSelect}
                              className="hidden"
                              id="proof-file-input"
                            />

                            {/* Dropzone / Picker */}
                            <label
                              htmlFor="proof-file-input"
                              className="border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50 hover:bg-blue-50/40 rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer transition-all text-center"
                            >
                              {proofPreview ? (
                                <div className="space-y-2">
                                  <img
                                    src={proofPreview}
                                    alt="Preview Bukti"
                                    className="w-32 h-32 object-cover rounded-lg border border-slate-200 mx-auto shadow-xs"
                                  />
                                  <div className="text-xs text-slate-700 font-bold truncate max-w-xs">
                                    {proofFile?.name} ({(proofFile?.size ? proofFile.size / 1024 : 0).toFixed(0)} KB)
                                  </div>
                                  <span className="text-[11px] text-blue-600 font-semibold underline block">
                                    Klik untuk ganti foto
                                  </span>
                                </div>
                              ) : (
                                <div className="space-y-1">
                                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-1">
                                    <ArrowUpTrayIcon className="w-5 h-5" />
                                  </div>
                                  <p className="text-xs font-bold text-slate-800">
                                    Pilih Foto Struk / Bukti Transfer
                                  </p>
                                  <p className="text-[10px] text-slate-500">
                                    Hanya file gambar (JPG, PNG, WebP, GIF maks 5 MB)
                                  </p>
                                </div>
                              )}
                            </label>
                          </div>
                        ) : (
                          <div>
                            <input
                              type="url"
                              placeholder="https://... atau link foto bukti"
                              value={proofUrl}
                              onChange={(e) => setProofUrl(e.target.value)}
                              required
                              className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                            />
                          </div>
                        )}

                        <button
                          type="submit"
                          disabled={uploadingProof}
                          className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2"
                        >
                          {uploadingProof ? (
                            <>
                              <ArrowPathIcon className="w-4 h-4 animate-spin" />
                              Mengunggah ke Storage...
                            </>
                          ) : (
                            "Kirim Bukti Pembayaran"
                          )}
                        </button>
                        {proofSuccess && (
                          <p className="text-xs text-emerald-600 font-bold text-center">
                            ✓ Bukti tersimpan di bucket storage! Admin akan segera memverifikasi.
                          </p>
                        )}
                      </form>
                    </div>
                  )}

                  {/* QRIS Display */}
                  {selectedOrder.payment_method === "qris" && (
                    <div className="text-center p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                      <QrCodeIcon className="w-12 h-12 text-blue-600 mx-auto" />
                      <div>
                        <p className="text-xs font-bold text-slate-800">Scan QRIS Dinamis / Statis</p>
                        <p className="text-[11px] text-slate-500">Mendukung GoPay, OVO, Dana, ShopeePay, dan BCA QR.</p>
                      </div>
                      <div className="p-3 bg-white border border-slate-300 rounded-lg inline-block">
                        <img
                          src={paymentMethods?.qris_image_url || "https://images.unsplash.com/photo-1595079672139-622943ac5321?w=400&q=80"}
                          alt="QRIS Code"
                          className="w-48 h-48 object-contain mx-auto"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Detail Status Pembayaran Sukses */
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 shadow-xs space-y-3">
                  <div className="flex items-center gap-2 text-emerald-800">
                    <CheckBadgeIcon className="w-6 h-6 text-emerald-600" />
                    <div>
                      <h4 className="font-bold text-base text-emerald-900">Pembayaran Terverifikasi</h4>
                      <p className="text-xs text-emerald-700">Pesanan telah lunas dan sedang diproses oleh penjual.</p>
                    </div>
                  </div>

                  {selectedOrder.payment_proof_url && (
                    <div className="pt-2 text-xs">
                      <span className="text-emerald-700 font-medium">Bukti Pembayaran Tersimpan:</span>
                      <a
                        href={selectedOrder.payment_proof_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-600 font-bold hover:underline mt-1"
                      >
                        Lihat Foto Bukti <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                </div>
              )}

              {/* Bantuan & Kontak Penjual */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 text-xs text-slate-600 space-y-2">
                <h4 className="font-bold text-slate-800">Butuh Bantuan?</h4>
                <p>
                  Jika ada kendala pembayaran atau pertanyaan mengenai pesanan, hubungi layanan pelanggan kami via WhatsApp dengan menyertakan ID <strong>#ORDER-{selectedOrder.id}</strong>.
                </p>
                <a
                  href={`https://wa.me/6281234567890?text=Halo%20Supatman%20Store,%20saya%20ingin%20menanyakan%20pesanan%20saya%20%23ORDER-${selectedOrder.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 font-bold text-emerald-700 hover:text-emerald-800 pt-1"
                >
                  Hubungi CS via WhatsApp →
                </a>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* DAFTAR SEMUA PESANAN KONSUMEN (Dedicated History List Page) */
        <div className="mt-8 space-y-6">
          {/* Filter Status Tabs */}
          <div className="flex flex-wrap items-center gap-2 pb-2">
            {[
              { id: "all", label: "Semua Pesanan" },
              { id: "pending", label: "Menunggu Pembayaran" },
              { id: "paid_processing", label: "Diproses" },
              { id: "shipped", label: "Dikirim" },
              { id: "completed", label: "Selesai" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all shadow-2xs ${
                  statusFilter === tab.id
                    ? "bg-blue-600 text-white"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* List of Orders */}
          {loadingOrders ? (
            <div className="py-16 text-center text-slate-400">
              <ArrowPathIcon className="w-8 h-8 animate-spin mx-auto mb-2 text-blue-600" />
              <p className="text-sm font-semibold">Memuat riwayat pesanan...</p>
            </div>
          ) : filteredOrders.length > 0 ? (
            <div className="space-y-4">
              {filteredOrders.map((ord) => (
                <div
                  key={ord.id}
                  onClick={() => setSelectedOrder(ord)}
                  className="bg-white border border-slate-200 hover:border-blue-400 rounded-2xl p-5 transition-all shadow-xs hover:shadow-md cursor-pointer group"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm">
                        #{ord.id}
                      </div>
                      <div>
                        <h3 className="font-extrabold text-slate-900 group-hover:text-blue-600 transition-colors">
                          Pesanan #ORDER-{ord.id}
                        </h3>
                        <span className="text-xs text-slate-400">
                          {new Date(ord.created_at).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {getStatusBadge(ord.status)}
                      <span className="text-sm font-black text-slate-900 num-tabular">
                        {formatIDR(ord.grand_total)}
                      </span>
                    </div>
                  </div>

                  <div className="pt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-slate-500">
                      Penerima: <strong className="text-slate-800">{ord.customer_name}</strong> • Metode:{" "}
                      <span className="uppercase font-semibold">{ord.payment_method.replace("_", " ")}</span>
                    </span>

                    <button className="text-xs font-bold text-blue-600 group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                      Lihat Rincian &amp; Lacak →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center max-w-lg mx-auto space-y-4 shadow-xs">
              <div className="w-16 h-16 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                <ShoppingBagIcon className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Belum Ada Riwayat Pesanan</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                {currentUser
                  ? "Anda belum memiliki pesanan dengan filter ini. Jelajahi katalog dan temukan produk terbaik untuk meja kerja Anda."
                  : "Anda belum login. Masuk ke akun Anda atau masukkan ID pesanan pada kolom pencarian di atas untuk melacak pesanan Anda."}
              </p>
              <div className="pt-2 flex justify-center gap-3">
                <button
                  onClick={() => onNavigate("store", "/")}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-xs transition-all"
                >
                  Mulai Belanja
                </button>
                {!currentUser && (
                  <button
                    onClick={() => onNavigate("profile", "/profile")}
                    className="px-5 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold text-xs transition-all"
                  >
                    Masuk Akun
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
