import { useState, useMemo, useEffect } from "react";
import { supabase } from "./supabaseClient";
import {
  Building2, Wallet, TrendingUp, TrendingDown, Home, LayoutDashboard,
  DoorOpen, CalendarDays, CreditCard, Receipt, Zap, CheckCircle2, XCircle,
  CircleDashed, Plus, X, Trash2, ChevronDown, Search, User, Phone,
  Calendar, Banknote, AlertCircle, Cloud
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend
} from "recharts";

// ---------- helpers ----------
const fmt = (n) => `${Math.round(n).toLocaleString()} ر.ع`;

const monthKey = (y, m) => `${y}-${String(m).padStart(2, "0")}`;
const CURRENT = { y: 2026, m: 7 };
const ARABIC_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

function fmtRate(room) {
  return `${fmt(room.rent)} / ${room.rentType === "daily" ? "يوم" : "شهر"}`;
}
const COLLECTION_LABEL = { lumpsum: "دفعة واحدة (وقتي)", installments: "على دفعات خلال المدة" };

const TODAY = new Date().toISOString().slice(0, 10);

function parseDate(d) { return new Date(d + "T12:00:00"); }
function addDays(dateStr, n) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
// عدد الليالي: يوم الدخول يُحسب، يوم الخروج لا يُحسب (مثل الفنادق)
function bookingNights(checkIn, checkOut) {
  const nights = Math.round((parseDate(checkOut) - parseDate(checkIn)) / 86400000);
  return Math.max(1, nights);
}
function datesOverlap(s1, e1, s2, e2) {
  return s1 < e2 && s2 < e1;
}
function dailyRate(room) {
  if (!room) return 0;
  return room.rentType === "daily" ? room.rent : room.rent / 30;
}
function expectedForBooking(booking, room) {
  if (!booking || !room) return 0;
  return dailyRate(room) * bookingNights(booking.checkIn, booking.checkOut);
}
function fmtDateRange(checkIn, checkOut) {
  return `${checkIn} → ${checkOut} (${bookingNights(checkIn, checkOut)} ليلة)`;
}
function bookingsForRoom(bookings, roomId) {
  return bookings.filter((b) => b.roomId === roomId);
}
function isRoomAvailable(bookings, roomId, checkIn, checkOut, excludeId = null) {
  return !bookingsForRoom(bookings, roomId)
    .filter((b) => b.id !== excludeId)
    .some((b) => datesOverlap(checkIn, checkOut, b.checkIn, b.checkOut));
}
function roomStatusOn(bookings, roomId, date = TODAY) {
  const list = bookingsForRoom(bookings, roomId)
    .filter((b) => b.checkOut > date)
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn));
  const active = list.find((b) => b.checkIn <= date && date < b.checkOut);
  if (active) return { status: "occupied", booking: active };
  const upcoming = list.find((b) => b.checkIn > date);
  if (upcoming) return { status: "reserved", booking: upcoming };
  return { status: "vacant", booking: null };
}
const ROOM_STATUS_LABEL = { occupied: "مشغولة", reserved: "محجوزة", vacant: "شاغرة" };
const ROOM_STATUS_STYLE = {
  occupied: "border-emerald-700/60 bg-emerald-950/40",
  reserved: "border-amber-700/60 bg-amber-950/40",
  vacant: "border-slate-700/80 bg-slate-800/30",
};
const ROOM_STATUS_DOT = {
  occupied: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]",
  reserved: "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]",
  vacant: "bg-slate-500",
};
const TABS = [
  { id: "dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
  { id: "rooms", label: "الغرف", icon: DoorOpen },
  { id: "bookings", label: "الحجوزات", icon: CalendarDays },
  { id: "payments", label: "المدفوعات", icon: CreditCard },
  { id: "expenses", label: "المصروفات", icon: Receipt },
];
const BOOKING_FILTERS = [
  { id: "all", label: "الكل" },
  { id: "active", label: "جارية" },
  { id: "upcoming", label: "قادمة" },
  { id: "past", label: "منتهية" },
];
function fmtDateShort(d) {
  const [, m, day] = d.split("-");
  return `${Number(day)} ${ARABIC_MONTHS[Number(m) - 1]}`;
}
function bookingPhase(book) {
  if (book.checkIn <= TODAY && TODAY < book.checkOut) return "active";
  if (book.checkIn > TODAY) return "upcoming";
  return "past";
}

function lastNMonths(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(CURRENT.y, CURRENT.m - 1 - i, 1);
    out.push({
      key: monthKey(d.getFullYear(), d.getMonth() + 1),
      label: ARABIC_MONTHS[d.getMonth()],
    });
  }
  return out;
}
const MONTHS = lastNMonths(6);
const THIS_MONTH = MONTHS[MONTHS.length - 1].key;

const CATEGORIES_ALL = ["كهرباء", "مياه", "صيانة", "نظافة", "أمن", "أخرى"];

// ---------- small UI atoms ----------
function StatCard({ icon: Icon, label, value, sub, tone = "slate", accent }) {
  const tones = {
    slate: "text-slate-100",
    emerald: "text-emerald-400",
    rose: "text-rose-400",
    amber: "text-amber-400",
  };
  const accents = {
    slate: "from-slate-700/20",
    emerald: "from-emerald-500/10",
    rose: "from-rose-500/10",
    amber: "from-amber-500/10",
  };
  return (
    <div className={`relative overflow-hidden bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col gap-2 card-hover bg-gradient-to-br ${accents[accent || tone]} to-transparent`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        <div className="w-8 h-8 rounded-lg bg-slate-800/80 flex items-center justify-center">
          <Icon size={15} className="text-slate-400" />
        </div>
      </div>
      <div className={`text-2xl font-mono font-bold tracking-tight ${tones[tone]}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 leading-relaxed">{sub}</div>}
    </div>
  );
}

function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="text-center py-14 px-6 border border-dashed border-slate-700/80 rounded-2xl bg-slate-900/30 animate-fade-in">
      <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-slate-800 flex items-center justify-center">
        <Icon size={24} className="text-slate-500" />
      </div>
      <h3 className="text-base font-semibold text-slate-200 mb-1">{title}</h3>
      <p className="text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function FilterChips({ options, value, onChange }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {options.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          className={`px-3 py-1.5 text-xs font-medium rounded-full transition-all ${
            value === opt.id
              ? "bg-amber-400 text-slate-950 shadow-sm"
              : "bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          }`}
        >
          {opt.label}
          {opt.count != null && <span className="mr-1 opacity-70">({opt.count})</span>}
        </button>
      ))}
    </div>
  );
}

function StatusChip({ status }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${
      status === "occupied" ? "bg-emerald-400/15 text-emerald-400" :
      status === "reserved" ? "bg-amber-400/15 text-amber-400" :
      "bg-slate-700/80 text-slate-400"
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${ROOM_STATUS_DOT[status]}`} />
      {ROOM_STATUS_LABEL[status]}
    </span>
  );
}

function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm" />
      <div
        className={`relative w-full ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"} max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl shadow-2xl animate-slide-up`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-5 py-4 flex items-center justify-between z-10">
          <h3 className="text-base font-semibold">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function ConfirmDialog({ open, title, message, onConfirm, onCancel, danger }) {
  return (
    <Modal open={open} onClose={onCancel} title={title}>
      <p className="text-sm text-slate-400 leading-relaxed mb-5">{message}</p>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel} className="px-4 py-2 text-sm font-medium rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors">إلغاء</button>
        <button onClick={onConfirm} className={`px-4 py-2 text-sm font-medium rounded-xl transition-colors ${danger ? "bg-rose-500/20 text-rose-400 hover:bg-rose-500/30" : "bg-amber-400 text-slate-950 hover:bg-amber-300"}`}>تأكيد</button>
      </div>
    </Modal>
  );
}

function BtnPrimary({ children, onClick, disabled, className = "" }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 text-sm bg-amber-400 text-slate-950 px-4 py-2 rounded-xl font-semibold hover:bg-amber-300 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 ${className}`}
    >
      {children}
    </button>
  );
}

function BtnGhost({ children, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg font-medium transition-colors ${
        danger ? "text-slate-500 hover:text-rose-400 hover:bg-rose-400/10" : "text-slate-400 hover:text-slate-100 hover:bg-slate-800"
      }`}
    >
      {children}
    </button>
  );
}

function FieldLabel({ children, icon: Icon }) {
  return (
    <label className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mb-1.5">
      {Icon && <Icon size={12} />}
      {children}
    </label>
  );
}

function SaveIndicator({ status }) {
  if (status === "idle") return null;
  return (
    <div className={`fixed bottom-4 left-4 z-40 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium shadow-lg border transition-all ${
      status === "saving" ? "bg-slate-800 border-slate-700 text-slate-300" : "bg-emerald-950 border-emerald-800 text-emerald-400"
    }`}>
      {status === "saving" ? <Cloud size={14} className="animate-pulse" /> : <CheckCircle2 size={14} />}
      {status === "saving" ? "جاري الحفظ..." : "تم الحفظ"}
    </div>
  );
}

function Badge({ status }) {
  const map = {
    paid: { icon: CheckCircle2, cls: "text-emerald-400 bg-emerald-400/10", label: "مدفوع" },
    partial: { icon: CircleDashed, cls: "text-amber-400 bg-amber-400/10", label: "جزئي" },
    unpaid: { icon: XCircle, cls: "text-rose-400 bg-rose-400/10", label: "غير مدفوع" },
  };
  const s = map[status];
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${s.cls}`}>
      <Icon size={13} /> {s.label}
    </span>
  );
}

function TabButton({ active, onClick, icon: Icon, children }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-xl whitespace-nowrap transition-all ${
        active
          ? "bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20"
          : "text-slate-400 hover:text-slate-100 hover:bg-slate-800/80"
      }`}
    >
      {Icon && <Icon size={15} />}
      {children}
    </button>
  );
}

const PIE_COLORS = ["#34d399", "#fbbf24", "#334155"];
const EXP_COLORS = ["#fbbf24", "#38bdf8", "#34d399", "#f472b6", "#a78bfa"];

// ---------- main ----------
export default function BuildingManager() {
  const [rooms, setRooms] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [payments, setPayments] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [tab, setTab] = useState("dashboard");
  const [month, setMonth] = useState(THIS_MONTH);
  const [showRoomForm, setShowRoomForm] = useState(false);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [showExpForm, setShowExpForm] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [bookingFilter, setBookingFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [roomFilter, setRoomFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState(null);

  // load saved data once on first render
  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.from("building_data").select("data").eq("id", 1).single();
      if (error) console.error("خطأ في تحميل البيانات:", error);
      if (data?.data) {
        const d = data.data;
        if (d.rooms) setRooms(d.rooms);
        if (d.bookings) {
          setBookings(d.bookings);
        } else if (d.residents) {
          setBookings(d.residents.map((r) => ({
            id: r.id,
            name: r.name,
            phone: r.phone || "",
            roomId: r.roomId,
            checkIn: r.checkIn || r.moveIn || TODAY,
            checkOut: r.checkOut || addDays(r.checkIn || r.moveIn || TODAY, 30),
            collectionMode: r.collectionMode || "lumpsum",
          })));
        }
        if (d.payments) {
          setPayments(d.payments.map((p) => ({
            ...p,
            bookingId: p.bookingId || p.residentId,
            date: p.date || (p.month ? `${p.month}-01` : TODAY),
          })));
        }
        if (d.expenses) setExpenses(d.expenses);
      }
      setLoaded(true);
    }
    load();
  }, []);

  // save automatically whenever data changes (after initial load)
  useEffect(() => {
    if (!loaded) return;
    setSaveStatus("saving");
    const timeout = setTimeout(() => {
      supabase
        .from("building_data")
        .update({ data: { rooms, bookings, payments, expenses } })
        .eq("id", 1)
        .then(({ error }) => {
          if (error) {
            console.error("خطأ في حفظ البيانات:", error);
            setSaveStatus("idle");
          } else {
            setSaveStatus("saved");
            setTimeout(() => setSaveStatus("idle"), 2000);
          }
        });
    }, 800);
    return () => clearTimeout(timeout);
  }, [rooms, bookings, payments, expenses, loaded]);

  const roomStates = useMemo(
    () => rooms.map((r) => ({ room: r, ...roomStatusOn(bookings, r.id) })),
    [rooms, bookings]
  );
  const occupied = roomStates.filter((s) => s.status === "occupied");
  const reserved = roomStates.filter((s) => s.status === "reserved");
  const vacant = roomStates.filter((s) => s.status === "vacant");

  const roomOf = (bookingId) => rooms.find((r) => r.id === bookings.find((x) => x.id === bookingId)?.roomId);
  const paymentsFor = (bookingId) => payments.filter((p) => p.bookingId === bookingId);
  const totalPaidForBooking = (bookingId) => paymentsFor(bookingId).reduce((s, p) => s + p.amount, 0);
  const statusForBooking = (bookingId) => {
    const booking = bookings.find((b) => b.id === bookingId);
    const room = roomOf(bookingId);
    const expected = expectedForBooking(booking, room);
    const paid = totalPaidForBooking(bookingId);
    if (paid <= 0) return "unpaid";
    if (paid >= expected) return "paid";
    return "partial";
  };
  const activeBookings = useMemo(
    () => bookings.filter((b) => b.checkIn <= TODAY && TODAY < b.checkOut),
    [bookings]
  );
  const bookingsInMonth = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const monthStart = `${month}-01`;
    const monthEnd = monthKey(y, m + 1 > 12 ? 1 : m + 1) + "-01";
    const end = m + 1 > 12 ? monthKey(y + 1, 1) + "-01" : monthEnd;
    return bookings.filter((b) => datesOverlap(b.checkIn, b.checkOut, monthStart, end));
  }, [bookings, month]);

  const stats = useMemo(() => {
    const expected = bookingsInMonth.reduce((s, b) => s + expectedForBooking(b, roomOf(b.id)), 0);
    const monthStart = `${month}-01`;
    const [y, m] = month.split("-").map(Number);
    const monthEnd = m + 1 > 12 ? `${y + 1}-01-01` : monthKey(y, m + 1) + "-01";
    const monthPayments = payments.filter((p) => {
      const d = p.date || "";
      return d >= monthStart && d < monthEnd;
    });
    const collected = monthPayments.reduce((s, p) => s + p.amount, 0);
    const outstanding = bookingsInMonth.reduce((s, b) => {
      const exp = expectedForBooking(b, roomOf(b.id));
      const paid = totalPaidForBooking(b.id);
      return s + Math.max(exp - paid, 0);
    }, 0);
    const monthExpenses = expenses.filter((e) => e.month === month);
    const totalExpenses = monthExpenses.reduce((s, e) => s + e.amount, 0);
    const netIncome = collected - totalExpenses;
    const occupancyRate = rooms.length ? (occupied.length / rooms.length) * 100 : 0;
    return { expected, collected, outstanding, totalExpenses, netIncome, occupancyRate, monthExpenses };
  }, [rooms, occupied, bookings, bookingsInMonth, payments, expenses, month]);

  const trendData = MONTHS.map(({ key, label }) => {
    const [y, m] = key.split("-").map(Number);
    const monthStart = `${key}-01`;
    const monthEnd = m + 1 > 12 ? `${y + 1}-01-01` : monthKey(y, m + 1) + "-01";
    const monthBookings = bookings.filter((b) => datesOverlap(b.checkIn, b.checkOut, monthStart, monthEnd));
    const expected = monthBookings.reduce((s, b) => s + expectedForBooking(b, roomOf(b.id)), 0);
    const collected = payments.filter((p) => {
      const d = p.date || "";
      return d >= monthStart && d < monthEnd;
    }).reduce((s, p) => s + p.amount, 0);
    const exp = expenses.filter((e) => e.month === key).reduce((s, e) => s + e.amount, 0);
    return { label, "المحصّل": collected, "المتوقع": expected, "المصروفات": exp };
  });

  const occupancyPie = [
    { name: "مشغولة", value: occupied.length },
    { name: "محجوزة", value: reserved.length },
    { name: "شاغرة", value: vacant.length },
  ];
  const expenseByCategory = Object.values(
    stats.monthExpenses.reduce((acc, e) => {
      acc[e.category] = acc[e.category] || { name: e.category, value: 0 };
      acc[e.category].value += e.amount;
      return acc;
    }, {})
  );

  const perRoomShare = activeBookings.length ? stats.totalExpenses / activeBookings.length : 0;
  const unpaidCount = bookings.filter((b) => statusForBooking(b.id) !== "paid").length;

  const filteredBookings = useMemo(() => {
    let list = [...bookings].sort((a, b) => b.checkIn.localeCompare(a.checkIn));
    if (bookingFilter !== "all") list = list.filter((b) => bookingPhase(b) === bookingFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((b) => b.name.toLowerCase().includes(q) || b.phone?.includes(q));
    }
    return list;
  }, [bookings, bookingFilter, search]);

  const filteredPayments = useMemo(() => {
    let list = [...bookings].sort((a, b) => {
      const unpaidA = statusForBooking(a.id) !== "paid" ? 0 : 1;
      const unpaidB = statusForBooking(b.id) !== "paid" ? 0 : 1;
      if (unpaidA !== unpaidB) return unpaidA - unpaidB;
      return b.checkIn.localeCompare(a.checkIn);
    });
    if (paymentFilter === "unpaid") list = list.filter((b) => statusForBooking(b.id) !== "paid");
    if (paymentFilter === "partial") list = list.filter((b) => statusForBooking(b.id) === "partial");
    return list;
  }, [bookings, paymentFilter, payments]);

  const bookingFilterCounts = useMemo(() => ({
    all: bookings.length,
    active: bookings.filter((b) => bookingPhase(b) === "active").length,
    upcoming: bookings.filter((b) => bookingPhase(b) === "upcoming").length,
    past: bookings.filter((b) => bookingPhase(b) === "past").length,
  }), [bookings]);

  function requestDelete(type, item, label) {
    setConfirm({ type, item, label });
  }
  function handleConfirm() {
    if (!confirm) return;
    if (confirm.type === "room") deleteRoom(confirm.item);
    else if (confirm.type === "booking") removeBooking(confirm.item);
    else if (confirm.type === "expense") deleteExpense(confirm.item);
    setConfirm(null);
  }

  function addPayment(bookingId, amount, date) {
    if (!amount || Number(amount) <= 0) return;
    setPayments((prev) => [
      ...prev,
      { id: `pay-${bookingId}-${Date.now()}`, bookingId, amount: Number(amount), date: date || TODAY },
    ]);
  }
  function deletePayment(id) {
    setPayments((prev) => prev.filter((p) => p.id !== id));
  }

  function addRoom(data) {
    const id = `room-${data.number}`;
    setRooms((prev) => [...prev, { id, ...data, status: "vacant" }]);
    setShowRoomForm(false);
  }
  function deleteRoom(id) {
    setBookings((prev) => {
      const removedIds = prev.filter((b) => b.roomId === id).map((b) => b.id);
      setPayments((p) => p.filter((pay) => !removedIds.includes(pay.bookingId)));
      return prev.filter((b) => b.roomId !== id);
    });
    setRooms((prev) => prev.filter((r) => r.id !== id));
  }
  function addBooking(data) {
    if (!isRoomAvailable(bookings, data.roomId, data.checkIn, data.checkOut)) return false;
    const id = `book-${data.roomId}-${Date.now()}`;
    setBookings((prev) => [...prev, { id, ...data }]);
    setShowBookingForm(false);
    return true;
  }
  function removeBooking(book) {
    setBookings((prev) => prev.filter((b) => b.id !== book.id));
    setPayments((prev) => prev.filter((p) => p.bookingId !== book.id));
  }
  function addExpense(data) {
    setExpenses((prev) => [...prev, { id: `exp-${Date.now()}`, month, ...data }]);
    setShowExpForm(false);
  }
  function deleteExpense(id) {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  }

  if (!loaded) {
    return (
      <div dir="rtl" className="min-h-screen bg-[#0a0f1a] text-slate-100 flex flex-col items-center justify-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-amber-400/20 flex items-center justify-center">
          <Building2 size={22} className="text-amber-400 animate-pulse" />
        </div>
        <p className="text-sm text-slate-400">جاري تحميل البيانات...</p>
      </div>
    );
  }

  const filteredRooms = roomStates.filter((s) => roomFilter === "all" || s.status === roomFilter);

  return (
    <div dir="rtl" className="min-h-screen bg-[#0a0f1a] text-slate-100 font-sans">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_top,_rgba(251,191,36,0.06)_0%,_transparent_50%)]" />
      <SaveIndicator status={saveStatus} />
      <ConfirmDialog
        open={!!confirm}
        title="تأكيد الحذف"
        message={confirm ? `هل أنت متأكد من حذف ${confirm.label}؟ لا يمكن التراجع عن هذا الإجراء.` : ""}
        onConfirm={handleConfirm}
        onCancel={() => setConfirm(null)}
        danger
      />

      <header className="border-b border-slate-800/80 sticky top-0 bg-[#0a0f1a]/90 backdrop-blur-md z-20">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-amber-500 flex items-center justify-center shadow-lg shadow-amber-400/20">
                <Building2 size={20} className="text-slate-950" />
              </div>
              <div>
                <h1 className="text-lg font-bold leading-tight">بناية</h1>
                <p className="text-xs text-slate-500">
                  {rooms.length} غرفة · {bookings.length} حجز
                  {unpaidCount > 0 && <span className="text-rose-400 mr-1"> · {unpaidCount} غير مدفوع</span>}
                </p>
              </div>
            </div>
            {rooms.length > 0 && (
              <BtnPrimary onClick={() => { setTab("bookings"); setShowBookingForm(true); }} className="hidden sm:flex">
                <Plus size={15} /> حجز جديد
              </BtnPrimary>
            )}
          </div>
          <nav className="flex gap-1 overflow-x-auto scrollbar-thin pb-0.5 -mx-1 px-1">
            {TABS.map(({ id, label, icon }) => (
              <TabButton key={id} active={tab === id} onClick={() => setTab(id)} icon={icon}>
                {label}
                {id === "payments" && unpaidCount > 0 && (
                  <span className="mr-1 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-rose-500 text-white text-[10px] font-bold">{unpaidCount}</span>
                )}
              </TabButton>
            ))}
          </nav>
        </div>
      </header>

      <main className="relative max-w-6xl mx-auto px-4 py-6 pb-24 sm:pb-6 flex flex-col gap-5 animate-fade-in">
        {(tab === "dashboard" || tab === "payments" || tab === "expenses") && (
          <div className="flex items-center gap-3 bg-slate-900/50 border border-slate-800 rounded-xl px-4 py-2.5 w-fit">
            <Calendar size={14} className="text-slate-500" />
            <span className="text-xs text-slate-500 font-medium">الشهر</span>
            <div className="relative">
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="appearance-none bg-transparent border-0 pr-2 pl-6 py-0 text-sm font-semibold focus:outline-none focus:ring-0 cursor-pointer"
              >
                {MONTHS.map((m) => (
                  <option key={m.key} value={m.key}>{m.label} {m.key.split("-")[0]}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute left-0 top-1 text-slate-500 pointer-events-none" />
            </div>
          </div>
        )}

        {tab === "dashboard" && rooms.length === 0 && (
          <EmptyState
            icon={DoorOpen}
            title="ابدأ بإعداد المبنى"
            description="أضف غرف المبنى أولاً، ثم أنشئ الحجوزات وتابع المدفوعات والمصروفات من مكان واحد."
            action={<BtnPrimary onClick={() => { setTab("rooms"); setShowRoomForm(true); }}><Plus size={15} /> إضافة أول غرفة</BtnPrimary>}
          />
        )}

        {tab === "dashboard" && rooms.length > 0 && (
          <>
            {unpaidCount > 0 && (
              <button
                onClick={() => setTab("payments")}
                className="flex items-center gap-3 w-full bg-rose-500/10 border border-rose-500/20 rounded-xl px-4 py-3 text-sm hover:bg-rose-500/15 transition-colors text-right"
              >
                <AlertCircle size={18} className="text-rose-400 shrink-0" />
                <span className="text-rose-300">{unpaidCount} حجز بانتظار الدفع — اضغط للمتابعة</span>
              </button>
            )}

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard icon={Home} label="نسبة الإشغال" value={`${stats.occupancyRate.toFixed(0)}%`} sub={`${occupied.length} مشغولة · ${reserved.length} محجوزة · ${vacant.length} شاغرة`} tone="emerald" accent="emerald" />
              <StatCard icon={Wallet} label="الإيراد المتوقع" value={fmt(stats.expected)} sub={`حجوزات ${MONTHS.find(m => m.key === month)?.label}`} />
              <StatCard icon={TrendingUp} label="المحصّل" value={fmt(stats.collected)} tone="emerald" accent="emerald" />
              <StatCard icon={TrendingDown} label="المتبقي" value={fmt(stats.outstanding)} tone="rose" accent="rose" />
              <StatCard icon={Zap} label="المصروفات" value={fmt(stats.totalExpenses)} tone="amber" accent="amber" />
              <StatCard icon={Wallet} label="صافي الدخل" value={fmt(stats.netIncome)} tone={stats.netIncome >= 0 ? "emerald" : "rose"} accent={stats.netIncome >= 0 ? "emerald" : "rose"} />
            </div>

            <div className="grid lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-slate-200 mb-4">الإيرادات مقابل المصروفات</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="label" stroke="#64748b" fontSize={12} />
                    <YAxis stroke="#64748b" fontSize={12} orientation="right" />
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }} />
                    <Legend />
                    <Bar dataKey="المتوقع" fill="#334155" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="المحصّل" fill="#fbbf24" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="المصروفات" fill="#f472b6" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-slate-200 mb-4">توزيع الإشغال</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={occupancyPie} dataKey="value" innerRadius={45} outerRadius={70} paddingAngle={2}>
                      {occupancyPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-3 text-xs mt-1 flex-wrap">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" /> مشغولة {occupied.length}</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> محجوزة {reserved.length}</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-700" /> شاغرة {vacant.length}</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-slate-200 mb-4">حالة الدفع — {MONTHS.find(m => m.key === month)?.label}</h3>
              {bookingsInMonth.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-6">لا توجد حجوزات في هذا الشهر</p>
              ) : (
              <div className="overflow-x-auto scrollbar-thin">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-right text-xs text-slate-500 font-medium">
                      <th className="pb-3 pr-2">العميل</th><th className="pb-3">الغرفة</th><th className="pb-3 hidden sm:table-cell">المدة</th><th className="pb-3">المبلغ</th><th className="pb-3">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bookingsInMonth.map((book) => {
                      const room = roomOf(book.id);
                      return (
                        <tr key={book.id} className="border-t border-slate-800/80 hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 pr-2 font-medium">{book.name}</td>
                          <td className="py-3 text-slate-400 font-mono">{room?.number}</td>
                          <td className="py-3 text-slate-500 text-xs hidden sm:table-cell">{fmtDateShort(book.checkIn)} — {fmtDateShort(book.checkOut)}</td>
                          <td className="py-3 font-mono text-amber-400/90">{fmt(expectedForBooking(book, room))}</td>
                          <td className="py-3"><Badge status={statusForBooking(book.id)} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              )}
            </div>
          </>
        )}

        {tab === "rooms" && (
          <div className="flex flex-col gap-4">
            <PageHeader
              title="الغرف"
              subtitle={`${occupied.length} مشغولة · ${reserved.length} محجوزة · ${vacant.length} شاغرة`}
              action={<BtnPrimary onClick={() => setShowRoomForm(true)}><Plus size={15} /> إضافة غرفة</BtnPrimary>}
            />

            <FilterChips
              options={[
                { id: "all", label: "الكل", count: rooms.length },
                { id: "occupied", label: "مشغولة", count: occupied.length },
                { id: "reserved", label: "محجوزة", count: reserved.length },
                { id: "vacant", label: "شاغرة", count: vacant.length },
              ]}
              value={roomFilter}
              onChange={setRoomFilter}
            />

            {rooms.length === 0 && (
              <EmptyState icon={DoorOpen} title="لا توجد غرف" description="أضف غرف المبنى مع رقم الغرفة والطابق ونوع الإيجار." action={<BtnPrimary onClick={() => setShowRoomForm(true)}><Plus size={15} /> إضافة غرفة</BtnPrimary>} />
            )}

            {[...new Set(filteredRooms.map((s) => s.room.floor))].sort((a, b) => b - a).map((floor) => (
              <div key={floor} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-semibold text-slate-400">الطابق {floor}</span>
                  <span className="h-px flex-1 bg-slate-800" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                  {filteredRooms.filter((s) => s.room.floor === floor).sort((a, b) => a.room.number - b.room.number).map(({ room: r, status, booking }) => (
                    <RoomCard
                      key={r.id}
                      room={r}
                      status={status}
                      booking={booking}
                      onDelete={() => requestDelete("room", r.id, `غرفة ${r.number}`)}
                      onBook={() => { setTab("bookings"); setShowBookingForm(true); }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "bookings" && (
          <div className="flex flex-col gap-4">
            <PageHeader
              title="الحجوزات"
              subtitle={`${bookings.length} حجز · ${vacant.length} غرفة شاغرة الآن`}
              action={<BtnPrimary onClick={() => setShowBookingForm(true)} disabled={rooms.length === 0}><Plus size={15} /> حجز جديد</BtnPrimary>}
            />

            {rooms.length > 0 && (
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search size={15} className="absolute right-3 top-2.5 text-slate-500 pointer-events-none" />
                  <input
                    className={`${inputCls} w-full pr-9`}
                    placeholder="بحث بالاسم أو الهاتف..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <FilterChips
                  options={BOOKING_FILTERS.map((f) => ({ ...f, count: bookingFilterCounts[f.id] }))}
                  value={bookingFilter}
                  onChange={setBookingFilter}
                />
              </div>
            )}

            {rooms.length === 0 && (
              <EmptyState icon={CalendarDays} title="أضف غرفاً أولاً" description="لا يمكن إنشاء حجز بدون غرف. ابدأ من تبويب الغرف." action={<BtnPrimary onClick={() => setTab("rooms")}>الذهاب للغرف</BtnPrimary>} />
            )}

            {rooms.length > 0 && bookings.length === 0 && (
              <EmptyState icon={CalendarDays} title="لا توجد حجوزات" description="أنشئ أول حجز وحدد فترة الإقامة والغرفة المتاحة." action={<BtnPrimary onClick={() => setShowBookingForm(true)}><Plus size={15} /> حجز جديد</BtnPrimary>} />
            )}

            {filteredBookings.length > 0 && (
              <div className="flex flex-col gap-3">
                {filteredBookings.map((book) => (
                  <BookingCard
                    key={book.id}
                    booking={book}
                    room={roomOf(book.id)}
                    paid={totalPaidForBooking(book.id)}
                    payStatus={statusForBooking(book.id)}
                    roomStatus={roomStatusOn(bookings, book.roomId).status}
                    onDelete={() => requestDelete("booking", book, `حجز ${book.name}`)}
                    onPay={() => setTab("payments")}
                  />
                ))}
              </div>
            )}

            {rooms.length > 0 && bookings.length > 0 && filteredBookings.length === 0 && (
              <p className="text-center text-sm text-slate-500 py-8">لا توجد نتائج مطابقة للبحث أو الفلتر</p>
            )}
          </div>
        )}

        {tab === "payments" && bookings.length === 0 && (
          <EmptyState icon={CreditCard} title="لا توجد مدفوعات" description="أضف غرفاً وحجزاً أولاً لتتبع المدفوعات والمتبقي." />
        )}

        {tab === "payments" && bookings.length > 0 && (
          <div className="flex flex-col gap-4">
            <PageHeader
              title="المدفوعات"
              subtitle={unpaidCount > 0 ? `${unpaidCount} حجز بانتظار الدفع` : "جميع الحجوزات مدفوعة"}
            />
            <FilterChips
              options={[
                { id: "all", label: "الكل", count: bookings.length },
                { id: "unpaid", label: "غير مدفوع", count: bookings.filter((b) => statusForBooking(b.id) === "unpaid").length },
                { id: "partial", label: "جزئي", count: bookings.filter((b) => statusForBooking(b.id) === "partial").length },
              ]}
              value={paymentFilter}
              onChange={setPaymentFilter}
            />
            <div className="flex flex-col gap-3">
              {filteredPayments.map((book) => (
                <PaymentCard
                  key={book.id}
                  booking={book}
                  room={roomOf(book.id)}
                  entries={paymentsFor(book.id)}
                  status={statusForBooking(book.id)}
                  onAdd={(amount, date) => addPayment(book.id, amount, date)}
                  onDelete={deletePayment}
                />
              ))}
            </div>
          </div>
        )}

        {tab === "expenses" && (
          <div className="flex flex-col gap-4">
            <PageHeader
              title="المصروفات"
              subtitle={`شهر ${MONTHS.find(m => m.key === month)?.label}`}
              action={<BtnPrimary onClick={() => setShowExpForm(true)}><Plus size={15} /> إضافة مصروف</BtnPrimary>}
            />
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <h3 className="text-sm font-medium text-slate-300 mb-3">تفاصيل المصروفات — {MONTHS.find(m => m.key === month)?.label}</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={expenseByCategory} dataKey="value" nameKey="name" innerRadius={40} outerRadius={70} paddingAngle={2}>
                      {expenseByCategory.map((_, i) => <Cell key={i} fill={EXP_COLORS[i % EXP_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-center gap-3">
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wide">الإجمالي هذا الشهر</div>
                  <div className="text-2xl font-mono font-semibold text-amber-400">{fmt(stats.totalExpenses)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-500 uppercase tracking-wide">نصيب كل وحدة مشغولة اليوم</div>
                  <div className="text-lg font-mono">{fmt(perRoomShare)}</div>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <p className="text-sm text-slate-500">{stats.monthExpenses.length} مصروف هذا الشهر</p>
            </div>
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-right text-xs text-slate-500 uppercase tracking-wide bg-slate-800/50">
                    <th className="px-4 py-2">الفئة</th><th className="px-4 py-2">الوصف</th><th className="px-4 py-2">المبلغ</th><th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {stats.monthExpenses.map((e) => (
                    <tr key={e.id} className="border-t border-slate-800/80 hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3">{e.category}</td>
                      <td className="px-4 py-3 text-slate-400">{e.description || "—"}</td>
                      <td className="px-4 py-3 font-mono text-amber-400/90">{fmt(e.amount)}</td>
                      <td className="px-4 py-3 text-left">
                        <BtnGhost onClick={() => requestDelete("expense", e.id, `مصروف ${e.category}`)} danger><Trash2 size={14} /></BtnGhost>
                      </td>
                    </tr>
                  ))}
                  {stats.monthExpenses.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-10 text-center text-sm text-slate-500">لا توجد مصروفات هذا الشهر</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Mobile FAB */}
      {rooms.length > 0 && (
        <button
          onClick={() => { setTab("bookings"); setShowBookingForm(true); }}
          className="fixed bottom-5 left-5 sm:hidden w-14 h-14 rounded-2xl bg-amber-400 text-slate-950 shadow-xl shadow-amber-400/30 flex items-center justify-center active:scale-95 transition-transform z-30"
        >
          <Plus size={24} />
        </button>
      )}

      <Modal open={showRoomForm} onClose={() => setShowRoomForm(false)} title="إضافة غرفة">
        <RoomForm onAdd={addRoom} />
      </Modal>
      <Modal open={showBookingForm} onClose={() => setShowBookingForm(false)} title="حجز جديد" wide>
        <BookingForm rooms={rooms} bookings={bookings} onAdd={addBooking} />
      </Modal>
      <Modal open={showExpForm} onClose={() => setShowExpForm(false)} title="إضافة مصروف">
        <ExpenseForm onAdd={addExpense} />
      </Modal>
    </div>
  );
}

// ---------- room & booking cards ----------
function RoomCard({ room, status, booking, onDelete, onBook }) {
  return (
    <div className={`group relative rounded-xl border p-3.5 card-hover cursor-default ${ROOM_STATUS_STYLE[status]}`}>
      <div className="flex items-start justify-between mb-2">
        <span className="font-mono text-base font-bold">{room.number}</span>
        <StatusChip status={status} />
      </div>
      <div className="text-xs text-slate-400 truncate mb-1">
        {booking ? booking.name : "—"}
      </div>
      {booking && (
        <div className="text-[11px] text-slate-500 mb-2">
          {fmtDateShort(booking.checkIn)} — {fmtDateShort(booking.checkOut)}
        </div>
      )}
      <div className="text-xs font-mono text-amber-400/90">{fmtRate(room)}</div>
      <div className="absolute top-2 left-2 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {status === "vacant" && (
          <button onClick={onBook} className="w-6 h-6 rounded-md bg-amber-400/20 text-amber-400 flex items-center justify-center hover:bg-amber-400/30" title="حجز">
            <Plus size={12} />
          </button>
        )}
        <button onClick={onDelete} className="w-6 h-6 rounded-md bg-slate-800/80 text-slate-500 flex items-center justify-center hover:text-rose-400" title="حذف">
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

function BookingCard({ booking, room, paid, payStatus, roomStatus, onDelete, onPay }) {
  const expected = expectedForBooking(booking, room);
  const remaining = Math.max(expected - paid, 0);
  const pct = expected ? Math.min((paid / expected) * 100, 100) : 0;
  const phase = bookingPhase(booking);
  const phaseLabel = { active: "جاري", upcoming: "قادم", past: "منتهي" };
  const phaseStyle = { active: "bg-emerald-400/15 text-emerald-400", upcoming: "bg-sky-400/15 text-sky-400", past: "bg-slate-700 text-slate-400" };

  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 card-hover">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center shrink-0">
            <User size={18} className="text-slate-400" />
          </div>
          <div>
            <div className="font-semibold text-slate-100">{booking.name}</div>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-500">
              <span className="font-mono">غرفة {room?.number}</span>
              {booking.phone && <span className="flex items-center gap-1"><Phone size={10} />{booking.phone}</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${phaseStyle[phase]}`}>{phaseLabel[phase]}</span>
          <StatusChip status={roomStatus} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3 text-sm">
        <div className="bg-slate-800/50 rounded-xl px-3 py-2">
          <div className="text-[10px] text-slate-500 mb-0.5">المدة</div>
          <div className="text-xs text-slate-300">{fmtDateShort(booking.checkIn)} — {fmtDateShort(booking.checkOut)}</div>
          <div className="text-[10px] text-slate-500">{bookingNights(booking.checkIn, booking.checkOut)} ليلة</div>
        </div>
        <div className="bg-slate-800/50 rounded-xl px-3 py-2">
          <div className="text-[10px] text-slate-500 mb-0.5">الإجمالي</div>
          <div className="font-mono text-amber-400">{fmt(expected)}</div>
        </div>
        <div className="bg-slate-800/50 rounded-xl px-3 py-2">
          <div className="text-[10px] text-slate-500 mb-0.5">المدفوع</div>
          <div className="font-mono text-emerald-400">{fmt(paid)}</div>
        </div>
        <div className="bg-slate-800/50 rounded-xl px-3 py-2">
          <div className="text-[10px] text-slate-500 mb-0.5">الحالة</div>
          <Badge status={payStatus} />
        </div>
      </div>

      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mb-3">
        <div className={`h-full rounded-full transition-all ${payStatus === "paid" ? "bg-emerald-400" : "bg-amber-400"}`} style={{ width: `${pct}%` }} />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">{COLLECTION_LABEL[booking.collectionMode]}</span>
        <div className="flex gap-1">
          {remaining > 0 && <BtnPrimary onClick={onPay} className="!text-xs !px-3 !py-1.5"><Banknote size={13} /> دفع {fmt(remaining)}</BtnPrimary>}
          <BtnGhost onClick={onDelete} danger><Trash2 size={14} /></BtnGhost>
        </div>
      </div>
    </div>
  );
}

// ---------- payment card ----------
function PaymentCard({ booking, room, entries, status, onAdd, onDelete }) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(TODAY);
  const [expanded, setExpanded] = useState(status !== "paid");
  const expected = expectedForBooking(booking, room);
  const paid = entries.reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(expected - paid, 0);
  const pct = expected ? Math.min((paid / expected) * 100, 100) : 0;

  return (
    <div className={`border rounded-2xl overflow-hidden transition-colors ${status !== "paid" ? "bg-slate-900/70 border-slate-800" : "bg-slate-900/40 border-slate-800/60"}`}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-right hover:bg-slate-800/30 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-2 h-2 rounded-full shrink-0 ${status === "paid" ? "bg-emerald-400" : status === "partial" ? "bg-amber-400 animate-pulse-dot" : "bg-rose-400 animate-pulse-dot"}`} />
          <div className="min-w-0">
            <div className="font-medium truncate">{booking.name}</div>
            <div className="text-xs text-slate-500">غرفة {room?.number} · {bookingNights(booking.checkIn, booking.checkOut)} ليلة</div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-left">
            <div className="text-xs font-mono text-slate-400">{fmt(paid)} / {fmt(expected)}</div>
            {remaining > 0 && <div className="text-[10px] text-rose-400">متبقي {fmt(remaining)}</div>}
          </div>
          <Badge status={status} />
          <ChevronDown size={16} className={`text-slate-500 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-3 border-t border-slate-800/80">
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden mt-3">
            <div className={`h-full rounded-full transition-all duration-500 ${status === "paid" ? "bg-emerald-400" : "bg-gradient-to-l from-amber-400 to-amber-500"}`} style={{ width: `${pct}%` }} />
          </div>

          {entries.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {entries.map((p) => (
                <span key={p.id} className="inline-flex items-center gap-1.5 bg-slate-800 rounded-lg px-2.5 py-1.5 text-xs font-mono">
                  {fmt(p.amount)}
                  {p.date && <span className="text-slate-500">{fmtDateShort(p.date)}</span>}
                  <button onClick={() => onDelete(p.id)} className="text-slate-500 hover:text-rose-400"><X size={12} /></button>
                </span>
              ))}
            </div>
          )}

          {remaining > 0 && (
            <div className="flex gap-2 flex-wrap">
              <button type="button" onClick={() => { setAmount(String(remaining)); setDate(TODAY); }} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-400/10 text-emerald-400 hover:bg-emerald-400/20 font-medium transition-colors">
                دفع المتبقي كاملاً ({fmt(remaining)})
              </button>
              <button type="button" onClick={() => { setAmount(String(Math.round(remaining / 2))); setDate(TODAY); }} className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 font-medium transition-colors">
                نصف المبلغ
              </button>
            </div>
          )}

          <form
            onSubmit={(e) => { e.preventDefault(); onAdd(amount, date); setAmount(""); setDate(TODAY); }}
            className="flex flex-wrap items-end gap-2"
          >
            <div className="flex-1 min-w-[120px]">
              <FieldLabel icon={Banknote}>مبلغ الدفعة</FieldLabel>
              <input className={`${inputCls} w-full`} placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="flex-1 min-w-[140px]">
              <FieldLabel icon={Calendar}>تاريخ الدفع</FieldLabel>
              <input type="date" className={`${inputCls} w-full`} value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <BtnPrimary className="!text-xs"><Plus size={13} /> تسجيل</BtnPrimary>
          </form>
        </div>
      )}
    </div>
  );
}

// ---------- forms ----------
function FormShell({ onSubmit, children, submitLabel = "حفظ" }) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="flex flex-col gap-4">
      {children}
      <button type="submit" className="w-full sm:w-auto self-start bg-amber-400 text-slate-950 text-sm font-semibold px-6 py-2.5 rounded-xl hover:bg-amber-300 active:scale-[0.98] transition-all">
        {submitLabel}
      </button>
    </form>
  );
}

const inputCls = "bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-sm text-right w-full focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400/50 transition-all placeholder:text-slate-600";

function RoomForm({ onAdd }) {
  const [number, setNumber] = useState("");
  const [floor, setFloor] = useState("");
  const [rent, setRent] = useState("");
  const [rentType, setRentType] = useState("daily");
  const submit = () => {
    if (!number || !floor || !rent) return;
    onAdd({ number: Number(number), floor: Number(floor), rent: Number(rent), rentType });
  };
  return (
    <FormShell onSubmit={submit} submitLabel="إضافة الغرفة">
      <div className="grid sm:grid-cols-2 gap-4">
        <div><FieldLabel>رقم الغرفة</FieldLabel><input className={inputCls} placeholder="مثال: 101" value={number} onChange={(e) => setNumber(e.target.value)} /></div>
        <div><FieldLabel>الطابق</FieldLabel><input className={inputCls} placeholder="مثال: 1" value={floor} onChange={(e) => setFloor(e.target.value)} /></div>
        <div><FieldLabel>نوع الإيجار</FieldLabel>
          <select className={inputCls} value={rentType} onChange={(e) => setRentType(e.target.value)}>
            <option value="daily">إيجار يومي</option>
            <option value="monthly">إيجار شهري</option>
          </select>
        </div>
        <div><FieldLabel>{rentType === "daily" ? "السعر لليلة (ر.ع)" : "السعر الشهري (ر.ع)"}</FieldLabel><input className={inputCls} placeholder="0" value={rent} onChange={(e) => setRent(e.target.value)} /></div>
      </div>
    </FormShell>
  );
}

function BookingForm({ rooms, bookings, onAdd }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [checkIn, setCheckIn] = useState(TODAY);
  const [checkOut, setCheckOut] = useState(addDays(TODAY, 3));
  const [roomId, setRoomId] = useState(rooms[0]?.id || "");
  const [collectionMode, setCollectionMode] = useState("lumpsum");
  const [error, setError] = useState("");

  const availableRooms = rooms.filter((r) => isRoomAvailable(bookings, r.id, checkIn, checkOut));
  const selectedRoom = rooms.find((r) => r.id === roomId);
  const nights = bookingNights(checkIn, checkOut);
  const total = expectedForBooking({ checkIn, checkOut }, selectedRoom);

  useEffect(() => {
    if (roomId && !availableRooms.find((r) => r.id === roomId)) {
      setRoomId(availableRooms[0]?.id || "");
    }
  }, [checkIn, checkOut, availableRooms, roomId]);

  const setDuration = (days) => setCheckOut(addDays(checkIn, days));

  const submit = () => {
    if (!name || !roomId || checkOut <= checkIn) {
      setError("تأكد من الاسم والتواريخ (يوم الخروج بعد يوم الدخول)");
      return;
    }
    if (!isRoomAvailable(bookings, roomId, checkIn, checkOut)) {
      setError("الغرفة محجوزة في هذه الفترة — اختر غرفة أو تواريخ أخرى");
      return;
    }
    setError("");
    onAdd({ name, phone, roomId, checkIn, checkOut, collectionMode });
  };

  return (
    <FormShell onSubmit={submit} submitLabel="تأكيد الحجز">
      <div className="grid sm:grid-cols-2 gap-4">
        <div><FieldLabel icon={User}>اسم العميل</FieldLabel><input className={inputCls} placeholder="الاسم الكامل" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><FieldLabel icon={Phone}>رقم الهاتف</FieldLabel><input className={inputCls} placeholder="اختياري" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <div><FieldLabel icon={Calendar}>يوم الدخول</FieldLabel><input type="date" className={inputCls} value={checkIn} min={TODAY} onChange={(e) => setCheckIn(e.target.value)} /></div>
        <div>
          <FieldLabel icon={Calendar}>يوم الخروج</FieldLabel>
          <input type="date" className={inputCls} value={checkOut} min={addDays(checkIn, 1)} onChange={(e) => setCheckOut(e.target.value)} />
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {[{ d: 1, l: "ليلة" }, { d: 3, l: "3 ليالي" }, { d: 7, l: "أسبوع" }, { d: 30, l: "شهر" }].map(({ d, l }) => (
              <button key={d} type="button" onClick={() => setDuration(d)} className={`text-[11px] px-2.5 py-1 rounded-lg font-medium transition-colors ${checkOut === addDays(checkIn, d) ? "bg-amber-400/20 text-amber-400" : "bg-slate-800 text-slate-500 hover:text-slate-300"}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="sm:col-span-2">
          <FieldLabel icon={DoorOpen}>الغرفة المتاحة</FieldLabel>
          <select className={inputCls} value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            {availableRooms.length === 0 && <option value="">لا توجد غرف متاحة في هذه الفترة</option>}
            {availableRooms.map((r) => <option key={r.id} value={r.id}>غرفة {r.number} — طابق {r.floor} — {fmtRate(r)}</option>)}
          </select>
          {availableRooms.length > 0 && (
            <p className="text-[11px] text-slate-500 mt-1.5">{availableRooms.length} غرفة متاحة من أصل {rooms.length}</p>
          )}
        </div>
        <div className="sm:col-span-2">
          <FieldLabel>نظام التحصيل</FieldLabel>
          <div className="grid grid-cols-2 gap-2">
            {[{ id: "lumpsum", label: "دفعة واحدة", desc: "تحصيل كامل" }, { id: "installments", label: "على دفعات", desc: "خلال المدة" }].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setCollectionMode(m.id)}
                className={`text-right p-3 rounded-xl border transition-all ${collectionMode === m.id ? "border-amber-400/50 bg-amber-400/10" : "border-slate-700 bg-slate-800/50 hover:border-slate-600"}`}
              >
                <div className="text-sm font-medium">{m.label}</div>
                <div className="text-[11px] text-slate-500">{m.desc}</div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {selectedRoom && (
        <div className="bg-gradient-to-l from-amber-400/10 to-transparent border border-amber-400/20 rounded-xl px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-slate-400">المبلغ الإجمالي</div>
            <div className="text-xl font-mono font-bold text-amber-400">{fmt(total)}</div>
          </div>
          <div className="text-left text-xs text-slate-500">
            {nights} ليلة × {fmt(dailyRate(selectedRoom))}
          </div>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 text-xs text-rose-400 bg-rose-400/10 border border-rose-400/20 rounded-xl px-3 py-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}
    </FormShell>
  );
}

function ExpenseForm({ onAdd }) {
  const [category, setCategory] = useState(CATEGORIES_ALL[0]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  return (
    <FormShell onSubmit={() => { if (!amount) return; onAdd({ category, description, amount: Number(amount) }); }} submitLabel="إضافة المصروف">
      <div className="grid sm:grid-cols-2 gap-4">
        <div><FieldLabel>الفئة</FieldLabel>
          <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES_ALL.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div><FieldLabel icon={Banknote}>المبلغ (ر.ع)</FieldLabel><input className={inputCls} placeholder="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
        <div className="sm:col-span-2"><FieldLabel>الوصف</FieldLabel><input className={inputCls} placeholder="اختياري" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      </div>
    </FormShell>
  );
}
