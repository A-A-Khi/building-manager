import { useState, useMemo } from "react";
import {
  Building2, Users, Wallet, TrendingUp, TrendingDown, Home,
  Zap, CheckCircle2, XCircle, CircleDashed, Plus, X, Trash2, ChevronDown
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend
} from "recharts";

// ---------- helpers ----------
const fmt = (n) => `${Math.round(n).toLocaleString()} ج.م`;

const monthKey = (y, m) => `${y}-${String(m).padStart(2, "0")}`;
const CURRENT = { y: 2026, m: 7 };
const ARABIC_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

function daysInMonth(monthKeyStr) {
  const [y, m] = monthKeyStr.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}
// Expected rent for a room in a given month, accounting for daily vs monthly rate
function expectedForRoom(room, monthKeyStr) {
  if (!room) return 0;
  if (room.rentType === "daily") return room.rent * daysInMonth(monthKeyStr);
  return room.rent;
}
function fmtRate(room) {
  return `${fmt(room.rent)} / ${room.rentType === "daily" ? "يوم" : "شهر"}`;
}
const COLLECTION_LABEL = { lumpsum: "دفعة واحدة (وقتي)", installments: "على دفعات خلال المدة" };

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
function StatCard({ icon: Icon, label, value, sub, tone = "slate" }) {
  const tones = {
    slate: "text-slate-100",
    emerald: "text-emerald-400",
    rose: "text-rose-400",
    amber: "text-amber-400",
  };
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
        <Icon size={16} className="text-slate-600" />
      </div>
      <div className={`text-2xl font-mono font-semibold ${tones[tone]}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
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

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
        active ? "bg-amber-400 text-slate-950" : "text-slate-400 hover:text-slate-100 hover:bg-slate-800"
      }`}
    >
      {children}
    </button>
  );
}

const PIE_COLORS = ["#fbbf24", "#334155"];
const EXP_COLORS = ["#fbbf24", "#38bdf8", "#34d399", "#f472b6", "#a78bfa"];

// ---------- main ----------
export default function BuildingManager() {
  const [rooms, setRooms] = useState([]);
  const [residents, setResidents] = useState([]);
  const [payments, setPayments] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [tab, setTab] = useState("dashboard");
  const [month, setMonth] = useState(THIS_MONTH);
  const [showRoomForm, setShowRoomForm] = useState(false);
  const [showResForm, setShowResForm] = useState(false);
  const [showExpForm, setShowExpForm] = useState(false);

  const occupied = rooms.filter((r) => r.status === "occupied");
  const vacant = rooms.filter((r) => r.status === "vacant");

  const residentOf = (roomId) => residents.find((r) => r.roomId === roomId);
  const roomOf = (residentId) => rooms.find((r) => r.id === residents.find((x) => x.id === residentId)?.roomId);
  const paymentsFor = (residentId, m) => payments.filter((p) => p.residentId === residentId && p.month === m);
  const totalPaid = (residentId, m) => paymentsFor(residentId, m).reduce((s, p) => s + p.amount, 0);
  const statusFor = (residentId, m) => {
    const room = roomOf(residentId);
    const expected = expectedForRoom(room, m);
    const paid = totalPaid(residentId, m);
    if (paid <= 0) return "unpaid";
    if (paid >= expected) return "paid";
    return "partial";
  };

  const stats = useMemo(() => {
    const expected = occupied.reduce((s, r) => s + expectedForRoom(r, month), 0);
    const monthPayments = payments.filter((p) => p.month === month);
    const collected = monthPayments.reduce((s, p) => s + p.amount, 0);
    const outstanding = Math.max(expected - collected, 0);
    const monthExpenses = expenses.filter((e) => e.month === month);
    const totalExpenses = monthExpenses.reduce((s, e) => s + e.amount, 0);
    const netIncome = collected - totalExpenses;
    const occupancyRate = rooms.length ? (occupied.length / rooms.length) * 100 : 0;
    return { expected, collected, outstanding, totalExpenses, netIncome, occupancyRate, monthExpenses };
  }, [rooms, occupied, payments, expenses, month]);

  const trendData = MONTHS.map(({ key, label }) => {
    const expected = occupied.reduce((s, r) => s + expectedForRoom(r, key), 0);
    const collected = payments.filter((p) => p.month === key).reduce((s, p) => s + p.amount, 0);
    const exp = expenses.filter((e) => e.month === key).reduce((s, e) => s + e.amount, 0);
    return { label, "المحصّل": collected, "المتوقع": expected, "المصروفات": exp };
  });

  const occupancyPie = [
    { name: "مشغولة", value: occupied.length },
    { name: "شاغرة", value: vacant.length },
  ];
  const expenseByCategory = Object.values(
    stats.monthExpenses.reduce((acc, e) => {
      acc[e.category] = acc[e.category] || { name: e.category, value: 0 };
      acc[e.category].value += e.amount;
      return acc;
    }, {})
  );

  const perRoomShare = occupied.length ? stats.totalExpenses / occupied.length : 0;

  function addPayment(residentId, amount, date) {
    if (!amount || Number(amount) <= 0) return;
    setPayments((prev) => [
      ...prev,
      { id: `pay-${residentId}-${month}-${Date.now()}`, residentId, month, amount: Number(amount), date },
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
    setRooms((prev) => prev.filter((r) => r.id !== id));
    setResidents((prev) => prev.filter((r) => r.roomId !== id));
  }
  function addResident(data) {
    const id = `res-${data.roomId}-${Date.now()}`;
    setResidents((prev) => [...prev, { id, ...data }]);
    setRooms((prev) => prev.map((r) => (r.id === data.roomId ? { ...r, status: "occupied" } : r)));
    setShowResForm(false);
  }
  function removeResident(res) {
    setResidents((prev) => prev.filter((r) => r.id !== res.id));
    setRooms((prev) => prev.map((r) => (r.id === res.roomId ? { ...r, status: "vacant" } : r)));
  }
  function addExpense(data) {
    setExpenses((prev) => [...prev, { id: `exp-${Date.now()}`, month, ...data }]);
    setShowExpForm(false);
  }
  function deleteExpense(id) {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  }

  return (
    <div dir="rtl" className="min-h-screen bg-slate-950 text-slate-100 font-sans">
      <header className="border-b border-slate-800 sticky top-0 bg-slate-950/95 backdrop-blur z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-400 flex items-center justify-center">
              <Building2 size={20} className="text-slate-950" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">بناية</h1>
              <p className="text-xs text-slate-500">لوحة إدارة المبنى · {rooms.length} وحدة</p>
            </div>
          </div>
          <nav className="flex gap-1 flex-wrap">
            <TabButton active={tab === "dashboard"} onClick={() => setTab("dashboard")}>لوحة التحكم</TabButton>
            <TabButton active={tab === "rooms"} onClick={() => setTab("rooms")}>الغرف</TabButton>
            <TabButton active={tab === "residents"} onClick={() => setTab("residents")}>السكان</TabButton>
            <TabButton active={tab === "payments"} onClick={() => setTab("payments")}>المدفوعات</TabButton>
            <TabButton active={tab === "expenses"} onClick={() => setTab("expenses")}>المصروفات</TabButton>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 flex flex-col gap-6">
        {(tab === "dashboard" || tab === "payments" || tab === "expenses") && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 uppercase tracking-wide">الشهر</span>
            <div className="relative">
              <select
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="appearance-none bg-slate-900 border border-slate-800 rounded-lg pr-3 pl-8 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-400"
              >
                {MONTHS.map((m) => (
                  <option key={m.key} value={m.key}>{m.label} {m.key.split("-")[0]}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute left-2 top-2.5 text-slate-500 pointer-events-none" />
            </div>
          </div>
        )}

        {tab === "dashboard" && rooms.length === 0 && (
          <div className="text-center py-16 text-slate-500 text-sm border border-dashed border-slate-800 rounded-xl">
            لا توجد بيانات بعد. ابدأ بإضافة غرف المبنى من تبويب "الغرف"، ثم أضف السكان والمدفوعات والمصروفات.
          </div>
        )}

        {tab === "dashboard" && rooms.length > 0 && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard icon={Home} label="نسبة الإشغال" value={`${stats.occupancyRate.toFixed(0)}%`} sub={`${occupied.length}/${rooms.length} وحدة`} />
              <StatCard icon={Wallet} label="الإيراد المتوقع" value={fmt(stats.expected)} />
              <StatCard icon={TrendingUp} label="المحصّل" value={fmt(stats.collected)} tone="emerald" />
              <StatCard icon={TrendingDown} label="المتبقي" value={fmt(stats.outstanding)} tone="rose" />
              <StatCard icon={Zap} label="المصروفات" value={fmt(stats.totalExpenses)} tone="amber" />
              <StatCard icon={Wallet} label="صافي الدخل" value={fmt(stats.netIncome)} tone={stats.netIncome >= 0 ? "emerald" : "rose"} />
            </div>

            <div className="grid lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-4">
                <h3 className="text-sm font-medium text-slate-300 mb-3">الإيرادات مقابل المصروفات — آخر 6 أشهر</h3>
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

              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <h3 className="text-sm font-medium text-slate-300 mb-3">الإشغال</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={occupancyPie} dataKey="value" innerRadius={45} outerRadius={70} paddingAngle={2}>
                      {occupancyPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex justify-center gap-4 text-xs mt-1">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> مشغولة {occupied.length}</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-700" /> شاغرة {vacant.length}</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <h3 className="text-sm font-medium text-slate-300 mb-3">حالة الدفع — {MONTHS.find(m => m.key === month)?.label}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-right text-xs text-slate-500 uppercase tracking-wide">
                      <th className="pb-2">الساكن</th><th className="pb-2">الغرفة</th><th className="pb-2">الإيجار</th><th className="pb-2">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {residents.map((res) => {
                      const room = roomOf(res.id);
                      return (
                        <tr key={res.id} className="border-t border-slate-800">
                          <td className="py-2">{res.name}</td>
                          <td className="py-2 text-slate-400 font-mono">{room?.number}</td>
                          <td className="py-2 font-mono">{fmt(expectedForRoom(room, month))}</td>
                          <td className="py-2"><Badge status={statusFor(res.id, month)} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {tab === "rooms" && (
          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-slate-500">عرض طوابق المبنى — من الأعلى للأسفل</p>
              <button onClick={() => setShowRoomForm(true)} className="flex items-center gap-1 text-sm bg-amber-400 text-slate-950 px-3 py-1.5 rounded-lg font-medium hover:bg-amber-300">
                <Plus size={15} /> إضافة غرفة
              </button>
            </div>

            {showRoomForm && <RoomForm onAdd={addRoom} onCancel={() => setShowRoomForm(false)} />}

            {rooms.length === 0 && (
              <div className="text-center py-12 text-slate-500 text-sm border border-dashed border-slate-800 rounded-xl">
                لا توجد غرف بعد. اضغط "إضافة غرفة" لبدء إدخال وحدات المبنى.
              </div>
            )}

            {[...new Set(rooms.map((r) => r.floor))].sort((a, b) => b - a).map((floor) => (
              <div key={floor} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="text-xs text-slate-500 uppercase tracking-wide mb-2">الطابق {floor}</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                  {rooms.filter((r) => r.floor === floor).sort((a, b) => a.number - b.number).map((r) => {
                    const res = residentOf(r.id);
                    return (
                      <div key={r.id} className={`relative group rounded-lg border p-3 ${r.status === "occupied" ? "border-emerald-800 bg-emerald-950/30" : "border-slate-700 bg-slate-800/40"}`}>
                        <button onClick={() => deleteRoom(r.id)} className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400">
                          <Trash2 size={13} />
                        </button>
                        <div className="font-mono text-sm font-semibold">{r.number}</div>
                        <div className="text-xs text-slate-400 truncate">{res ? res.name : "شاغرة"}</div>
                        <div className="text-xs font-mono text-amber-400 mt-1">{fmtRate(r)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "residents" && (
          <div className="flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-slate-500">{residents.length} ساكن · {vacant.length} وحدة شاغرة</p>
              <button onClick={() => setShowResForm(true)} disabled={vacant.length === 0} className="flex items-center gap-1 text-sm bg-amber-400 text-slate-950 px-3 py-1.5 rounded-lg font-medium hover:bg-amber-300 disabled:opacity-40 disabled:cursor-not-allowed">
                <Plus size={15} /> إضافة ساكن
              </button>
            </div>
            {rooms.length === 0 && (
              <div className="text-center py-12 text-slate-500 text-sm border border-dashed border-slate-800 rounded-xl">
                أضف غرفة أولاً من تبويب "الغرف" قبل إضافة ساكن.
              </div>
            )}
            {showResForm && <ResidentForm vacantRooms={vacant} onAdd={addResident} onCancel={() => setShowResForm(false)} />}
            {residents.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-right text-xs text-slate-500 uppercase tracking-wide bg-slate-800/50">
                    <th className="px-4 py-2">الاسم</th><th className="px-4 py-2">الغرفة</th><th className="px-4 py-2">الهاتف</th><th className="px-4 py-2">تاريخ السكن</th><th className="px-4 py-2">الإيجار</th><th className="px-4 py-2">نظام التحصيل</th><th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {residents.map((res) => {
                    const room = roomOf(res.id);
                    return (
                      <tr key={res.id} className="border-t border-slate-800">
                        <td className="px-4 py-2">{res.name}</td>
                        <td className="px-4 py-2 font-mono text-slate-400">{room?.number}</td>
                        <td className="px-4 py-2 font-mono text-slate-400">{res.phone}</td>
                        <td className="px-4 py-2 text-slate-400">{res.moveIn}</td>
                        <td className="px-4 py-2 font-mono">{room ? fmtRate(room) : "—"}</td>
                        <td className="px-4 py-2 text-slate-400 text-xs">{COLLECTION_LABEL[res.collectionMode] || COLLECTION_LABEL.lumpsum}</td>
                        <td className="px-4 py-2 text-left">
                          <button onClick={() => removeResident(res)} className="text-slate-500 hover:text-rose-400"><Trash2 size={14} /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            )}
          </div>
        )}

        {tab === "payments" && residents.length === 0 && (
          <div className="text-center py-12 text-slate-500 text-sm border border-dashed border-slate-800 rounded-xl">
            لا يوجد سكان بعد. أضف غرفًا وسكانًا أولاً لتتبع مدفوعاتهم.
          </div>
        )}

        {tab === "payments" && residents.length > 0 && (
          <div className="flex flex-col gap-3">
            {residents.map((res) => (
              <PaymentCard
                key={res.id}
                resident={res}
                room={roomOf(res.id)}
                month={month}
                entries={paymentsFor(res.id, month)}
                status={statusFor(res.id, month)}
                onAdd={(amount, date) => addPayment(res.id, amount, date)}
                onDelete={deletePayment}
              />
            ))}
          </div>
        )}

        {tab === "expenses" && (
          <div className="flex flex-col gap-4">
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
                  <div className="text-xs text-slate-500 uppercase tracking-wide">نصيب كل وحدة مشغولة</div>
                  <div className="text-lg font-mono">{fmt(perRoomShare)}</div>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center">
              <p className="text-sm text-slate-500">مصروفات شهر {MONTHS.find(m => m.key === month)?.label}</p>
              <button onClick={() => setShowExpForm(true)} className="flex items-center gap-1 text-sm bg-amber-400 text-slate-950 px-3 py-1.5 rounded-lg font-medium hover:bg-amber-300">
                <Plus size={15} /> إضافة مصروف
              </button>
            </div>
            {showExpForm && <ExpenseForm onAdd={addExpense} onCancel={() => setShowExpForm(false)} />}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-right text-xs text-slate-500 uppercase tracking-wide bg-slate-800/50">
                    <th className="px-4 py-2">الفئة</th><th className="px-4 py-2">الوصف</th><th className="px-4 py-2">المبلغ</th><th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {stats.monthExpenses.map((e) => (
                    <tr key={e.id} className="border-t border-slate-800">
                      <td className="px-4 py-2">{e.category}</td>
                      <td className="px-4 py-2 text-slate-400">{e.description || "—"}</td>
                      <td className="px-4 py-2 font-mono">{fmt(e.amount)}</td>
                      <td className="px-4 py-2 text-left">
                        <button onClick={() => deleteExpense(e.id)} className="text-slate-500 hover:text-rose-400"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ---------- payment card ----------
function PaymentCard({ resident, room, month, entries, status, onAdd, onDelete }) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const expected = expectedForRoom(room, month);
  const paid = entries.reduce((s, p) => s + p.amount, 0);
  const pct = expected ? Math.min((paid / expected) * 100, 100) : 0;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-medium">{resident.name}</div>
          <div className="text-xs text-slate-500">
            غرفة {room?.number} · {room ? fmtRate(room) : "—"} · {COLLECTION_LABEL[resident.collectionMode] || COLLECTION_LABEL.lumpsum}
          </div>
        </div>
        <Badge status={status} />
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
        </div>
        <span className="text-xs font-mono text-slate-400 whitespace-nowrap">{fmt(paid)} / {fmt(expected)}</span>
      </div>

      {entries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {entries.map((p) => (
            <span key={p.id} className="inline-flex items-center gap-1 bg-slate-800 rounded-md px-2 py-1 text-xs font-mono">
              {fmt(p.amount)} {p.date && <span className="text-slate-500">· {p.date}</span>}
              <button onClick={() => onDelete(p.id)} className="text-slate-500 hover:text-rose-400"><X size={12} /></button>
            </span>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); onAdd(amount, date); setAmount(""); setDate(""); }}
        className="flex flex-wrap items-center gap-2"
      >
        <input className={`${inputCls} w-32`} placeholder="مبلغ الدفعة" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <input type="date" className={`${inputCls} w-40`} value={date} onChange={(e) => setDate(e.target.value)} />
        <button type="submit" className="flex items-center gap-1 text-xs bg-amber-400 text-slate-950 px-3 py-1.5 rounded-lg font-medium hover:bg-amber-300">
          <Plus size={13} /> تسجيل دفعة
        </button>
      </form>
    </div>
  );
}

// ---------- forms ----------
function FormShell({ title, onCancel, onSubmit, children }) {
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSubmit(); }}
      className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col gap-3"
    >
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-medium">{title}</h4>
        <button type="button" onClick={onCancel} className="text-slate-500 hover:text-slate-200"><X size={16} /></button>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">{children}</div>
      <button type="submit" className="self-start bg-amber-400 text-slate-950 text-sm font-medium px-4 py-1.5 rounded-lg hover:bg-amber-300">حفظ</button>
    </form>
  );
}

const inputCls = "bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-amber-400";

function RoomForm({ onAdd, onCancel }) {
  const [number, setNumber] = useState("");
  const [floor, setFloor] = useState("");
  const [rent, setRent] = useState("");
  const [rentType, setRentType] = useState("monthly");
  return (
    <FormShell title="إضافة غرفة" onCancel={onCancel} onSubmit={() => {
      if (!number || !floor || !rent) return;
      onAdd({ number: Number(number), floor: Number(floor), rent: Number(rent), rentType });
    }}>
      <input className={inputCls} placeholder="رقم الغرفة" value={number} onChange={(e) => setNumber(e.target.value)} />
      <input className={inputCls} placeholder="الطابق" value={floor} onChange={(e) => setFloor(e.target.value)} />
      <select className={inputCls} value={rentType} onChange={(e) => setRentType(e.target.value)}>
        <option value="monthly">إيجار شهري</option>
        <option value="daily">إيجار يومي</option>
      </select>
      <input className={inputCls} placeholder={rentType === "daily" ? "قيمة الإيجار اليومي (ج.م)" : "قيمة الإيجار الشهري (ج.م)"} value={rent} onChange={(e) => setRent(e.target.value)} />
    </FormShell>
  );
}

function ResidentForm({ vacantRooms, onAdd, onCancel }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [roomId, setRoomId] = useState(vacantRooms[0]?.id || "");
  const [moveIn, setMoveIn] = useState("2026-07-01");
  const [collectionMode, setCollectionMode] = useState("lumpsum");
  return (
    <FormShell title="إضافة ساكن" onCancel={onCancel} onSubmit={() => {
      if (!name || !roomId) return;
      onAdd({ name, phone, roomId, moveIn, collectionMode });
    }}>
      <input className={inputCls} placeholder="الاسم الكامل" value={name} onChange={(e) => setName(e.target.value)} />
      <input className={inputCls} placeholder="رقم الهاتف" value={phone} onChange={(e) => setPhone(e.target.value)} />
      <select className={inputCls} value={roomId} onChange={(e) => setRoomId(e.target.value)}>
        {vacantRooms.map((r) => <option key={r.id} value={r.id}>غرفة {r.number} — {fmtRate(r)}</option>)}
      </select>
      <input type="date" className={inputCls} value={moveIn} onChange={(e) => setMoveIn(e.target.value)} />
      <select className={inputCls} value={collectionMode} onChange={(e) => setCollectionMode(e.target.value)}>
        <option value="lumpsum">تحصيل دفعة واحدة (وقتي)</option>
        <option value="installments">تحصيل على دفعات خلال المدة</option>
      </select>
    </FormShell>
  );
}

function ExpenseForm({ onAdd, onCancel }) {
  const [category, setCategory] = useState(CATEGORIES_ALL[0]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  return (
    <FormShell title="إضافة مصروف" onCancel={onCancel} onSubmit={() => {
      if (!amount) return;
      onAdd({ category, description, amount: Number(amount) });
    }}>
      <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
        {CATEGORIES_ALL.map((c) => <option key={c}>{c}</option>)}
      </select>
      <input className={inputCls} placeholder="المبلغ (ج.م)" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <input className={inputCls} placeholder="الوصف (اختياري)" value={description} onChange={(e) => setDescription(e.target.value)} />
    </FormShell>
  );
}