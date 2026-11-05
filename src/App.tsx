import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Copy,
  CreditCard,
  Globe2,
  Headphones,
  LayoutDashboard,
  LoaderCircle,
  LogOut,
  Menu,
  MessageSquare,
  Phone,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { Flag } from "./Flag";

type User = { id: string; name: string; email: string; role: string };
type Country = {
  code: string;
  name: string;
  dial: string;
  flag: string;
  price: number;
  live: boolean;
};
type Config = {
  mode: "demo" | "live";
  salesEnabled: boolean;
  freePreview?: boolean;
  countries: Country[];
  supportEmail: string;
  retentionDays: number;
  operatorName: string;
  operatorAddress: string;
};
type NumberQuote = {
  id: string;
  phone: string;
  country: string;
  locality: string;
  price: number;
  capabilities: string[];
  expires_at: number;
};
type Order = {
  id: string;
  phone: string;
  country: string;
  locality: string;
  price: number;
  status: string;
  created_at: string;
  expires_at: string | null;
  email?: string;
  error?: string;
};
type Message = {
  id: string;
  phone: string;
  sender: string;
  body: string;
  created_at: string;
  is_read: number;
};
type Page =
  | "Overview"
  | "Buy numbers"
  | "My numbers"
  | "Messages"
  | "Billing"
  | "Settings"
  | "Operations";
const money = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    cents / 100,
  );
const date = (s: string) =>
  new Date(s).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
const shortTime = (s: string) =>
  new Date(s).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
const formatPhone = (phone: string) =>
  phone.startsWith("+1") && phone.length === 12
    ? `+1 (${phone.slice(2, 5)}) ${phone.slice(5, 8)} ${phone.slice(8)}`
    : phone.startsWith("+44")
      ? `+44 ${phone.slice(3, 7)} ${phone.slice(7)}`
      : phone;
async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || "Request failed");
  return body;
}
const post = (body: unknown) => ({
  method: "POST",
  body: JSON.stringify(body),
});

function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    ref.current?.focus();
    const handler = (e: KeyboardEvent) => {
      const dialogs = document.querySelectorAll(".modal");
      if (dialogs[dialogs.length - 1] !== ref.current) return;
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const elements = ref.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href],textarea:not(:disabled)",
        );
        if (!elements?.length) return;
        const first = elements[0],
          last = elements[elements.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = overflow;
      before?.focus();
    };
  }, []);
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button
            className="icon-btn"
            aria-label="Close dialog"
            onClick={close}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const [config, setConfig] = useState<Config | null>(null),
    [user, setUser] = useState<User | null>(null),
    [page, setPage] = useState<Page>("Overview");
  const [orders, setOrders] = useState<Order[]>([]),
    [messages, setMessages] = useState<Message[]>([]),
    [numbers, setNumbers] = useState<NumberQuote[]>([]);
  const [country, setCountry] = useState("US"),
    [contains, setContains] = useState(""),
    [searching, setSearching] = useState(false),
    [searchError, setSearchError] = useState("");
  const [auth, setAuth] = useState<"login" | "register" | null>(null),
    [buy, setBuy] = useState<NumberQuote | null>(null),
    [help, setHelp] = useState(false),
    [terms, setTerms] = useState(false),
    [privacy, setPrivacy] = useState(false),
    [mobile, setMobile] = useState(false);
  const [toast, setToast] = useState(""),
    [fatal, setFatal] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [selectedMessage, setSelectedMessage] = useState<Message | null>(null),
    [filter, setFilter] = useState("All numbers");
  const [accepted, setAccepted] = useState(false),
    [notifications, setNotifications] = useState(false),
    [adminOrders, setAdminOrders] = useState<Order[]>([]);
  const [globalSearch, setGlobalSearch] = useState("");
  const [activityPeriod, setActivityPeriod] = useState("Last 7 days");
  const currentCountry = config?.countries.find((c) => c.code === country);
  const active = orders.filter((o) => o.status === "active");
  const unread = messages.filter((m) => !m.is_read).length;
  const total = orders
    .filter((o) => ["active", "expired", "release_pending"].includes(o.status))
    .reduce((s, o) => s + o.price, 0);
  const notify = (s: string) => setToast(s);
  async function refresh() {
    const d = await api<{ orders: Order[]; messages: Message[] }>("/dashboard");
    setOrders(d.orders);
    setMessages(d.messages);
  }
  async function searchNumbers(code = country, pattern = contains) {
    setSearching(true);
    setSearchError("");
    try {
      const d = await api<{ numbers: NumberQuote[] }>(
        `/numbers/search?country=${code}&contains=${encodeURIComponent(pattern)}`,
      );
      setNumbers(d.numbers);
    } catch (e) {
      setSearchError((e as Error).message);
    } finally {
      setSearching(false);
    }
  }
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const c = await api<Config>("/config");
        if (cancelled) return;
        setConfig(c);
        let me = await api<{ user: User | null }>("/auth/me");
        if (c.mode === "demo" && !me.user) me = await api("/demo", post({}));
        if (cancelled) return;
        setUser(me.user);
        if (me.user) await refresh();
        await searchNumbers("US", "");
      } catch (e) {
        if (!cancelled) setFatal((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!user) return;
    const t = setInterval(() => void refresh().catch(() => {}), 15000);
    return () => clearInterval(t);
  }, [user?.id]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (page === "Operations" && user?.role === "admin")
      api<{ orders: Order[] }>("/admin/orders")
        .then((d) => setAdminOrders(d.orders))
        .catch((e) => notify(e.message));
  }, [page]);
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    if (p.has("checkout")) {
      notify(
        p.get("checkout") === "success"
          ? "Payment received. Your number will appear after payment verification."
          : "Checkout cancelled. Your reservation expires in 30 minutes.",
      );
      history.replaceState(null, "", location.pathname);
    }
  }, []);
  function navigate(p: Page) {
    setPage(p);
    setMobile(false);
    setGlobalSearch("");
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      notify("Number copied to clipboard");
    } catch {
      notify("Clipboard unavailable. Select the number to copy it.");
    }
  }
  async function checkout() {
    if (!buy) return;
    setBusy(true);
    setError("");
    try {
      const r = await api<{ demo?: boolean; url?: string }>(
        "/checkout",
        post({ quoteId: buy.id, acceptTerms: accepted }),
      );
      if (r.url) {
        const target = new URL(r.url);
        if (
          target.protocol !== "https:" ||
          target.hostname !== "checkout.stripe.com"
        )
          throw new Error("Invalid checkout address");
        location.assign(r.url);
      } else {
        setBuy(null);
        setAccepted(false);
        await refresh();
        await searchNumbers();
        navigate("My numbers");
        notify("Demo number added. No payment was collected.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function authenticate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      const r = await api<{ user: User }>(
        `/auth/${auth}`,
        post({
          name: data.get("name"),
          email: data.get("email"),
          password: data.get("password"),
          acceptTerms: data.get("acceptTerms") === "on",
        }),
      );
      setUser(r.user);
      setAuth(null);
      await refresh();
      notify("Welcome to your workspace");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveSettings(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const data = new FormData(e.currentTarget);
    try {
      await api("/account", {
        method: "PATCH",
        body: JSON.stringify({
          name: data.get("name"),
          ...(data.get("newPassword")
            ? {
                currentPassword: data.get("currentPassword"),
                newPassword: data.get("newPassword"),
              }
            : {}),
        }),
      });
      const r = await api<{ user: User }>("/auth/me");
      setUser(r.user);
      notify("Account updated");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function openMessage(m: Message) {
    setSelectedMessage(m);
    if (!m.is_read) {
      try {
        await api(`/messages/${m.id}/read`, { method: "PATCH", body: "{}" });
        setMessages((ms) =>
          ms.map((x) => (x.id === m.id ? { ...x, is_read: 1 } : x)),
        );
      } catch (e) {
        notify((e as Error).message);
      }
    }
  }
  const nav = [
    { name: "Overview" as Page, icon: LayoutDashboard },
    { name: "Buy numbers" as Page, icon: ShoppingBag },
    { name: "My numbers" as Page, icon: Phone },
    { name: "Messages" as Page, icon: MessageSquare },
  ];
  const listedNumbers = numbers.filter((n) =>
    filter === "SMS only" ? n.capabilities.includes("SMS") : true,
  );
  const filteredOrders = orders.filter((o) =>
    `${o.phone} ${o.locality} ${o.status}`
      .toLowerCase()
      .includes(globalSearch.toLowerCase()),
  );
  function NumberTable({ compact = false }: { compact?: boolean }) {
    return (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Phone number</th>
              <th>Location</th>
              <th>Capabilities</th>
              <th>30-day price</th>
              <th>
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {(compact ? listedNumbers.slice(0, 4) : listedNumbers).map((n) => (
              <tr key={n.id}>
                <td>
                  <div className="number-cell">
                    <span className="flag">
                      <Flag code={n.country} />
                    </span>
                    <div>
                      <strong>{formatPhone(n.phone)}</strong>
                      <small>Local number</small>
                    </div>
                  </div>
                </td>
                <td>
                  <strong className="regular">{n.locality}</strong>
                  <small>
                    {config?.countries.find((c) => c.code === n.country)?.name}
                  </small>
                </td>
                <td>
                  <div className="pills">
                    {n.capabilities.map((c) => (
                      <span className="capability" key={c}>
                        {c === "SMS" ? (
                          <MessageSquare size={12} />
                        ) : (
                          <Phone size={12} />
                        )}{" "}
                        {c}
                      </span>
                    ))}
                  </div>
                </td>
                <td>
                  <strong>{money(n.price)}</strong>
                  <span className="muted"> / 30 days</span>
                </td>
                <td>
                  <button
                    className="buy-btn"
                    disabled={!config?.salesEnabled}
                    onClick={() => {
                      if (!user) {
                        setError("");
                        setAuth("register");
                        return;
                      }
                      setError("");
                      setAccepted(false);
                      setBuy(n);
                    }}
                  >
                    Get number <Plus size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!searching && !listedNumbers.length && (
          <div className="empty">
            <Search />
            <h3>No numbers found</h3>
            <p>Try a different country or number pattern.</p>
          </div>
        )}
      </div>
    );
  }
  const activityDays = Array.from(
    { length: activityPeriod === "Last 7 days" ? 7 : 14 },
    (_, i) => {
      const d = new Date();
      d.setDate(
        d.getDate() - ((activityPeriod === "Last 7 days" ? 6 : 13) - i),
      );
      return {
        label: d.toLocaleDateString("en-US", { weekday: "short" }),
        count: messages.filter(
          (m) => new Date(m.created_at).toDateString() === d.toDateString(),
        ).length,
      };
    },
  );
  const maxActivity = Math.max(4, ...activityDays.map((d) => d.count));
  if (fatal)
    return (
      <div className="startup">
        <div className="brand">
          <span className="brand-mark">
            l<span />
          </span>
          linea<span className="brand-dot">.</span>
        </div>
        <h2>Unable to load your workspace</h2>
        <p>{fatal}</p>
        <button className="primary" onClick={() => location.reload()}>
          Try again
        </button>
      </div>
    );
  if (!config)
    return (
      <div className="startup">
        <LoaderCircle className="spin" />
        <p>Connecting your workspace…</p>
      </div>
    );
  return (
    <div className="app-shell">
      {mobile && (
        <div className="sidebar-scrim" onClick={() => setMobile(false)} />
      )}
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <a className="brand" href="/" aria-label="Linea home">
          <span className="brand-mark">
            l<span />
          </span>
          linea<span className="brand-dot">.</span>
        </a>
        <div className="workspace-switch">
          <span className="workspace-icon">
            <Users size={18} />
          </span>
          <div>
            <strong>Personal workspace</strong>
            <small>
              {config.mode === "demo"
                ? "Demo workspace"
                : "Your business account"}
            </small>
          </div>
          <ChevronDown size={15} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map(({ name, icon: Icon }) => (
            <button
              className={`nav-item ${page === name ? "active" : ""}`}
              onClick={() => navigate(name)}
              key={name}
            >
              <Icon size={19} />
              <span>{name}</span>
              {name === "Messages" && unread > 0 && (
                <span className="nav-count">{unread}</span>
              )}
              {name === "Buy numbers" && <span className="new-label">NEW</span>}
            </button>
          ))}
        </nav>
        <div className="nav-label manage-label">MANAGE</div>
        <nav>
          <button
            className={`nav-item ${page === "Billing" ? "active" : ""}`}
            onClick={() => navigate("Billing")}
          >
            <CreditCard size={19} />
            Billing
          </button>
          <button
            className={`nav-item ${page === "Settings" ? "active" : ""}`}
            onClick={() => navigate("Settings")}
          >
            <Settings size={19} />
            Settings
          </button>
          {user?.role === "admin" && (
            <button
              className={`nav-item ${page === "Operations" ? "active" : ""}`}
              onClick={() => navigate("Operations")}
            >
              <ShieldCheck size={19} />
              Operations
            </button>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="help-symbol">
              <Sparkles size={20} />
            </div>
            <strong>A little help, a lot closer.</strong>
            <p>Let’s get your business connected.</p>
            <button onClick={() => setHelp(true)}>
              Talk to us <ArrowUpRight size={15} />
            </button>
          </div>
          <button className="nav-item help-link" onClick={() => setHelp(true)}>
            <CircleHelp size={19} />
            Help & resources <ArrowUpRight size={14} />
          </button>
          <div className="profile">
            <span className="avatar">
              {user
                ? user.name
                    .split(" ")
                    .slice(0, 2)
                    .map((x) => x[0])
                    .join("")
                : "L"}
            </span>
            <button
              onClick={() => (user ? navigate("Settings") : setAuth("login"))}
            >
              <strong>{user?.name || "Your workspace"}</strong>
              <small>
                {user ? "Manage your account" : "Sign in to get started"}
              </small>
            </button>
            {user ? (
              <button
                className="icon-btn"
                title="Sign out"
                onClick={async () => {
                  await api("/auth/logout", post({}));
                  setUser(null);
                  setOrders([]);
                  setMessages([]);
                  navigate("Overview");
                  notify("You’ve signed out");
                }}
              >
                <LogOut size={16} />
              </button>
            ) : (
              <ChevronRight size={16} />
            )}
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-btn mobile-menu"
              onClick={() => setMobile(true)}
              aria-label="Open navigation"
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{page}</strong>
          </div>
          <div className="topbar-actions">
            <span className="connection">
              <span />
              {config.mode === "demo" ? "Demo mode" : "Connected"}
            </span>
            <div className="topbar-divider" />
            <button
              className="icon-btn bell"
              onClick={() => setNotifications(!notifications)}
              aria-label="Notifications"
            >
              <Bell size={19} />
              {unread > 0 && <i />}
            </button>
            <span className="avatar small-avatar">{user?.name[0] || "L"}</span>
          </div>
          {notifications && (
            <div className="notification-panel">
              <strong>Workspace updates</strong>
              <p>
                {unread
                  ? `${unread} unread messages are waiting in your inbox.`
                  : "You’re all caught up."}
              </p>
              <button
                className="text-btn"
                onClick={() => {
                  navigate("Messages");
                  setNotifications(false);
                }}
              >
                Open inbox <ArrowRight size={14} />
              </button>
            </div>
          )}
        </header>
        <main>
          {config.mode === "demo" && (
            <div className="demo-banner">
              <span>
                <Sparkles size={14} />{" "}
                {config.freePreview
                  ? "Free preview · No real sales. Sample data resets on restart. Do not enter personal credentials."
                  : "You’re exploring a demo workspace. Numbers, messages, and payments are simulated."}
              </span>
              <span className="demo-badge">SANDBOX</span>
            </div>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR CONNECTION STARTS HERE</div>
              <h1>
                {page === "Overview"
                  ? `Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 17 ? "afternoon" : "evening"}${user ? `, ${user.name.split(" ")[0]}` : ""} `
                  : page}
                {page === "Overview" && <span className="wave">✳</span>}
              </h1>
              <p>
                {
                  {
                    Overview:
                      "A little overview of your numbers. A world of possibilities ahead.",
                    "Buy numbers":
                      "Find a local number. Make your next connection.",
                    "My numbers": "Every connection, in one place.",
                    Messages: "Stay close to every conversation.",
                    Billing: "Clear pricing. No surprises.",
                    Settings: "Make this workspace yours.",
                    Operations: "Review orders that need your attention.",
                  }[page]
                }
              </p>
            </div>
            {page === "Overview" ? (
              <button
                className="primary"
                onClick={() => navigate("Buy numbers")}
              >
                <Plus size={17} /> Buy a number
              </button>
            ) : page === "My numbers" ? (
              <button
                className="primary"
                onClick={() => navigate("Buy numbers")}
              >
                <Plus size={17} /> Add number
              </button>
            ) : null}
          </div>
          {!user && !["Overview", "Buy numbers"].includes(page) ? (
            <div className="panel empty auth-empty">
              <ShieldCheck size={35} />
              <h2>Your workspace is waiting</h2>
              <p>Sign in to manage your numbers, messages, and billing.</p>
              <button
                className="primary"
                onClick={() => {
                  setError("");
                  setAuth("login");
                }}
              >
                Sign in
              </button>
            </div>
          ) : (
            <>
              {page === "Overview" && (
                <>
                  <section className="hero">
                    <div className="hero-copy">
                      <span className="hero-tag">
                        <span /> LOCAL NUMBERS. GLOBAL POSSIBILITIES.
                      </span>
                      <h2>
                        Your next big thing
                        <br />
                        starts with a local hello.
                      </h2>
                      <p>
                        A dedicated number for every idea, market, and
                        conversation.
                        <br className="desktop-br" /> Find your perfect number
                        and make yourself at home.
                      </p>
                      <button onClick={() => navigate("Buy numbers")}>
                        Find your number <ArrowUpRight size={17} />
                      </button>
                    </div>
                    <div className="hero-art" aria-hidden="true">
                      <div className="orbit orbit-one" />
                      <div className="orbit orbit-two" />
                      <div className="orbit orbit-three" />
                      <div className="art-dots" />
                      <span className="floating-country country-us">
                        <Flag code="US" /> <span>United States</span>
                      </span>
                      <span className="floating-country country-gb">
                        <Flag code="GB" />
                      </span>
                      <span className="floating-country country-ca">
                        <Flag code="CA" />
                      </span>
                      <div className="phone-tile">
                        <Phone size={41} strokeWidth={1.6} />
                        <span className="phone-tile-dot">
                          <Check size={13} />
                        </span>
                      </div>
                      <div className="number-float">
                        <span className="green-dot" />
                        <div>
                          <strong>Your next connection</strong>
                          <small>Closer than you think</small>
                        </div>
                        <ArrowUpRight size={16} />
                      </div>
                      <span className="art-star">✳</span>
                    </div>
                  </section>
                  <section className="stats-grid">
                    <div className="stat-card">
                      <div>
                        <span>Active numbers</span>
                        <span className="stat-icon violet">
                          <Phone size={18} />
                        </span>
                      </div>
                      <strong>
                        {active.length.toString().padStart(2, "0")}
                      </strong>
                      <p>
                        <span className="status-dot" /> Ready for your next
                        hello
                      </p>
                    </div>
                    <div className="stat-card">
                      <div>
                        <span>Messages received</span>
                        <span className="stat-icon blue">
                          <MessageSquare size={18} />
                        </span>
                      </div>
                      <strong>
                        {messages.length.toString().padStart(2, "0")}
                      </strong>
                      <p>
                        <span className="green-text">{unread} unread</span>
                        <span> across your numbers</span>
                      </p>
                    </div>
                    <div className="stat-card">
                      <div>
                        <span>Countries connected</span>
                        <span className="stat-icon peach">
                          <Globe2 size={18} />
                        </span>
                      </div>
                      <strong>
                        {new Set(active.map((o) => o.country)).size
                          .toString()
                          .padStart(2, "0")}
                      </strong>
                      <p>Your business, a little more local</p>
                    </div>
                    <div className="stat-card">
                      <div>
                        <span>Total rental spend</span>
                        <span className="stat-icon green">
                          <CreditCard size={18} />
                        </span>
                      </div>
                      <strong>{money(total)}</strong>
                      <p>Prepaid · no automatic renewal</p>
                    </div>
                  </section>
                  <div className="overview-middle">
                    <section className="panel activity-panel">
                      <div className="section-heading">
                        <div>
                          <h2>Message activity</h2>
                          <p>Every message is a new opportunity.</p>
                        </div>
                        <select
                          aria-label="Activity period"
                          className="small-select"
                          value={activityPeriod}
                          onChange={(e) => setActivityPeriod(e.target.value)}
                        >
                          <option>Last 7 days</option>
                          <option>Last 14 days</option>
                        </select>
                      </div>
                      <div className="chart-summary">
                        <strong>
                          {activityDays.reduce((s, d) => s + d.count, 0)}
                        </strong>
                        <span>messages received</span>
                        <span className="chart-legend">
                          <i /> Incoming SMS
                        </span>
                      </div>
                      <div className="chart">
                        <div className="chart-axis">
                          {[maxActivity, Math.round(maxActivity / 2), 0].map(
                            (n, i) => (
                              <span key={i}>{n}</span>
                            ),
                          )}
                        </div>
                        <div className="chart-plot">
                          <div className="grid-lines">
                            <i />
                            <i />
                            <i />
                          </div>
                          <div className="bars">
                            {activityDays.map((d, i) => (
                              <div className="bar-col" key={i}>
                                <div className="bar-track">
                                  <div
                                    className={`bar ${d.count ? "has-value" : ""}`}
                                    style={{
                                      height: `${(d.count / maxActivity) * 100}%`,
                                    }}
                                    title={`${d.label}: ${d.count} messages`}
                                  >
                                    {d.count > 0 && <span>{d.count}</span>}
                                  </div>
                                </div>
                                <span>{d.label}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </section>
                    <section className="panel recent-panel">
                      <div className="section-heading">
                        <h2>Recent messages</h2>
                        <button
                          className="icon-btn"
                          aria-label="View all messages"
                          onClick={() => navigate("Messages")}
                        >
                          <ArrowUpRight size={18} />
                        </button>
                      </div>
                      {messages.slice(0, 3).map((m, i) => (
                        <button
                          className="recent-message"
                          key={m.id}
                          onClick={() => {
                            navigate("Messages");
                            void openMessage(m);
                          }}
                        >
                          <span
                            className={`message-icon ${i === 1 ? "mint" : "lavender"}`}
                          >
                            <MessageSquare size={17} />
                          </span>
                          <div>
                            <div>
                              <strong>
                                {m.sender === "Linea"
                                  ? "Linea"
                                  : formatPhone(m.sender)}
                              </strong>
                              <time>{shortTime(m.created_at)}</time>
                            </div>
                            <p>{m.body}</p>
                            <small>To {formatPhone(m.phone)}</small>
                          </div>
                          {!m.is_read && <span className="unread-dot" />}
                        </button>
                      ))}
                      {!messages.length && (
                        <div className="empty mini">
                          <MessageSquare />
                          <p>Your conversations will appear here.</p>
                        </div>
                      )}
                      <button
                        className="recent-footer"
                        onClick={() => navigate("Messages")}
                      >
                        Go to inbox <ArrowRight size={15} />
                      </button>
                    </section>
                  </div>
                  <section className="panel discover-panel">
                    <div className="section-heading">
                      <div>
                        <h2>A new number. A new possibility.</h2>
                        <p>
                          Find a number that feels local, wherever business
                          takes you.
                        </p>
                      </div>
                      <button
                        className="text-btn"
                        onClick={() => navigate("Buy numbers")}
                      >
                        Browse all numbers <ArrowRight size={15} />
                      </button>
                    </div>
                    <div className="country-tabs">
                      {config.countries.slice(0, 4).map((c) => (
                        <button
                          key={c.code}
                          className={country === c.code ? "selected" : ""}
                          onClick={() => {
                            setCountry(c.code);
                            void searchNumbers(c.code, "");
                          }}
                        >
                          <span>
                            <Flag code={c.code} />
                          </span>
                          {c.name}
                          <span className="country-price">
                            from {money(c.price)}
                          </span>
                        </button>
                      ))}
                    </div>
                    {searchError ? (
                      <div className="inline-error">
                        {searchError}
                        <button onClick={() => void searchNumbers()}>
                          Retry
                        </button>
                      </div>
                    ) : searching ? (
                      <div className="loading">
                        <LoaderCircle className="spin" /> Finding your next
                        number…
                      </div>
                    ) : (
                      <NumberTable compact />
                    )}
                  </section>
                </>
              )}
              {page === "Buy numbers" && (
                <>
                  <div className="market-intro">
                    <div className="market-intro-icon">
                      <Globe2 size={25} />
                    </div>
                    <div>
                      <strong>Your business belongs everywhere.</strong>
                      <p>
                        Dedicated local numbers. Inbound SMS. One simple 30-day
                        rental.
                      </p>
                    </div>
                    <span className="outline-badge">
                      <ShieldCheck size={14} /> Secure Stripe checkout
                    </span>
                  </div>
                  <section className="panel">
                    <div className="search-form">
                      <div className="field country-field">
                        <label htmlFor="country">Choose a country</label>
                        <div>
                          <Globe2 size={17} />
                          <select
                            id="country"
                            value={country}
                            onChange={(e) => {
                              setCountry(e.target.value);
                              void searchNumbers(e.target.value, contains);
                            }}
                          >
                            {config.countries.map((c) => (
                              <option key={c.code} value={c.code}>
                                {c.flag} {c.name} ({c.dial})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <form
                        className="number-search-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void searchNumbers();
                        }}
                      >
                        <div className="field">
                          <label htmlFor="number-search">
                            Find your perfect digits
                          </label>
                          <div>
                            <Search size={17} />
                            <input
                              id="number-search"
                              value={contains}
                              onChange={(e) =>
                                setContains(
                                  e.target.value
                                    .replace(/\D/g, "")
                                    .slice(0, 10),
                                )
                              }
                              placeholder="Area code or number pattern"
                              inputMode="numeric"
                              maxLength={10}
                            />
                          </div>
                        </div>
                        <button className="primary" disabled={searching}>
                          {searching ? (
                            <LoaderCircle className="spin" size={17} />
                          ) : (
                            <Search size={17} />
                          )}{" "}
                          Search numbers
                        </button>
                      </form>
                    </div>
                    <div className="results-bar">
                      <div>
                        <h2>Available numbers</h2>
                        <span className="count-pill">
                          {listedNumbers.length}
                        </span>
                        <span className="muted">in {currentCountry?.name}</span>
                      </div>
                      <label className="filter-select">
                        <SlidersHorizontal size={15} />
                        <select
                          aria-label="Filter capabilities"
                          value={filter}
                          onChange={(e) => setFilter(e.target.value)}
                        >
                          <option>All numbers</option>
                          <option>SMS only</option>
                        </select>
                      </label>
                    </div>
                    {searchError ? (
                      <div className="inline-error">
                        {searchError}
                        <button onClick={() => void searchNumbers()}>
                          Retry
                        </button>
                      </div>
                    ) : searching ? (
                      <div className="loading">
                        <LoaderCircle className="spin" /> Searching available
                        numbers…
                      </div>
                    ) : (
                      <NumberTable />
                    )}
                  </section>
                  <div className="market-notes">
                    <span>
                      <CheckCheck size={17} /> Dedicated to your account
                    </span>
                    <span>
                      <MessageSquare size={17} /> Receive SMS in your inbox
                    </span>
                    <span>
                      <CreditCard size={17} /> One payment. 30 days.
                    </span>
                  </div>
                  <div className="subtle-note">
                    Availability is confirmed during provisioning. Quotes expire
                    after 10 minutes. Voice forwarding and outbound SMS are not
                    included.{" "}
                    {config.mode === "live" &&
                      "Only numbers without address requirements are listed."}
                  </div>
                </>
              )}
              {page === "My numbers" && (
                <section className="panel">
                  <div className="section-heading">
                    <div>
                      <h2>
                        Your numbers{" "}
                        <span className="count-pill">{active.length}</span>
                      </h2>
                      <p>
                        Prepaid for 30 days. Automatically released at expiry.
                      </p>
                    </div>
                    <div className="inline-search">
                      <Search size={16} />
                      <input
                        placeholder="Search your numbers"
                        value={globalSearch}
                        onChange={(e) => setGlobalSearch(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Phone number</th>
                          <th>Location</th>
                          <th>Status</th>
                          <th>Expires on</th>
                          <th>Rental</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {filteredOrders.map((o) => (
                          <tr key={o.id}>
                            <td>
                              <div className="number-cell">
                                <span className="flag">
                                  <Flag code={o.country} />
                                </span>
                                <div>
                                  <strong>{formatPhone(o.phone)}</strong>
                                  <small>Order {o.id.slice(0, 8)}</small>
                                </div>
                              </div>
                            </td>
                            <td>{o.locality}</td>
                            <td>
                              <span
                                className={`status-badge ${o.status === "active" ? "success" : ""}`}
                              >
                                <i />
                                {o.status.replaceAll("_", " ")}
                              </span>
                            </td>
                            <td>
                              {o.expires_at ? date(o.expires_at) : "Pending"}
                            </td>
                            <td>{money(o.price)}</td>
                            <td>
                              <button
                                className="icon-btn"
                                aria-label={`Copy ${o.phone}`}
                                onClick={() => void copy(o.phone)}
                              >
                                <Copy size={16} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!filteredOrders.length && (
                      <div className="empty">
                        <Phone size={30} />
                        <h3>
                          {globalSearch
                            ? "No matching numbers"
                            : "Your next connection starts here"}
                        </h3>
                        <p>
                          {globalSearch
                            ? "Try another search."
                            : "Choose a dedicated number for your business."}
                        </p>
                        <button
                          className="primary"
                          onClick={() => navigate("Buy numbers")}
                        >
                          Find a number <ArrowRight size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                </section>
              )}
              {page === "Messages" && (
                <section className="panel inbox">
                  <div className="inbox-list">
                    <div className="section-heading">
                      <h2>
                        Inbox{" "}
                        <span className="count-pill">{messages.length}</span>
                      </h2>
                      <MessageSquare size={19} />
                    </div>
                    <div className="inbox-search">
                      <Search size={16} />
                      <input
                        placeholder="Search conversations"
                        value={globalSearch}
                        onChange={(e) => setGlobalSearch(e.target.value)}
                      />
                    </div>
                    {messages
                      .filter((m) =>
                        `${m.body} ${m.sender} ${m.phone}`
                          .toLowerCase()
                          .includes(globalSearch.toLowerCase()),
                      )
                      .map((m) => (
                        <button
                          key={m.id}
                          className={`conversation ${selectedMessage?.id === m.id ? "selected" : ""} ${!m.is_read ? "unread" : ""}`}
                          onClick={() => void openMessage(m)}
                        >
                          <span className="message-icon lavender">
                            <MessageSquare size={18} />
                          </span>
                          <div>
                            <strong>{formatPhone(m.sender)}</strong>
                            <p>{m.body}</p>
                            <small>
                              {date(m.created_at)} · {shortTime(m.created_at)}
                            </small>
                          </div>
                          {!m.is_read && <span className="unread-dot" />}
                        </button>
                      ))}
                    {!messages.length && (
                      <div className="empty mini">
                        <p>Your received messages will appear here.</p>
                      </div>
                    )}
                  </div>
                  <div className="message-view">
                    {selectedMessage ? (
                      <>
                        <div className="message-view-heading">
                          <span className="message-icon lavender">
                            <MessageSquare size={20} />
                          </span>
                          <div>
                            <strong>
                              {formatPhone(selectedMessage.sender)}
                            </strong>
                            <p>To {formatPhone(selectedMessage.phone)}</p>
                          </div>
                        </div>
                        <div className="message-content">
                          <span className="message-date">
                            {date(selectedMessage.created_at)}
                          </span>
                          <div className="message-bubble">
                            {selectedMessage.body}
                          </div>
                          <span className="message-time">
                            <ArrowDownLeft size={13} />
                            {shortTime(selectedMessage.created_at)} · Received
                          </span>
                        </div>
                        <div className="inbound-note">
                          <ShieldCheck size={15} /> This inbox supports incoming
                          SMS. Replies are not enabled.
                        </div>
                      </>
                    ) : (
                      <div className="empty">
                        <span className="empty-icon">
                          <MessageSquare size={32} />
                        </span>
                        <h3>A little hello goes a long way.</h3>
                        <p>Select a conversation to read your messages.</p>
                        <small>
                          Messages are retained for {config.retentionDays} days.
                        </small>
                      </div>
                    )}
                  </div>
                </section>
              )}
              {page === "Billing" && (
                <>
                  <div className="billing-cards">
                    <div className="panel billing-card">
                      <span className="stat-icon violet">
                        <CreditCard size={21} />
                      </span>
                      <p>Total rental payments</p>
                      <h2>{money(total)}</h2>
                      <small>
                        {config.mode === "demo"
                          ? "Simulated demo transactions"
                          : "USD · prepaid rentals"}
                      </small>
                    </div>
                    <div className="panel billing-card billing-explainer">
                      <ShieldCheck size={24} />
                      <h2>Simple by design.</h2>
                      <p>
                        Your numbers are prepaid for 30 days. There are no
                        automatic renewals or stored card details in Linea.
                      </p>
                      <small>Payments are securely processed by Stripe.</small>
                    </div>
                  </div>
                  <section className="panel">
                    <div className="section-heading">
                      <div>
                        <h2>Payment history</h2>
                        <p>All your number rentals, in one place.</p>
                      </div>
                      <button
                        className="secondary"
                        disabled={!orders.length}
                        onClick={() => {
                          const fields = [
                            "Order ID",
                            "Phone",
                            "Amount USD",
                            "Status",
                            "Date",
                          ];
                          const rows = orders.map((o) => [
                            o.id,
                            o.phone,
                            (o.price / 100).toFixed(2),
                            o.status,
                            o.created_at,
                          ]);
                          const content = [fields, ...rows]
                            .map((r) =>
                              r
                                .map(
                                  (v) =>
                                    '"' +
                                    v
                                      .replaceAll('"', '""')
                                      .replace(/^[=+@-]/, "'$&") +
                                    '"',
                                )
                                .join(","),
                            )
                            .join("\r\n");
                          const url = URL.createObjectURL(
                            new Blob([content], {
                              type: "text/csv;charset=utf-8;",
                            }),
                          );
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = "linea-payment-history.csv";
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                      >
                        <ArrowDownToLine size={15} /> Export
                      </button>
                    </div>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Order</th>
                            <th>Number</th>
                            <th>Date</th>
                            <th>Amount</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orders.map((o) => (
                            <tr key={o.id}>
                              <td>
                                <strong>
                                  LN-{o.id.slice(0, 8).toUpperCase()}
                                </strong>
                                <small>30-day rental</small>
                              </td>
                              <td>{formatPhone(o.phone)}</td>
                              <td>{date(o.created_at)}</td>
                              <td>{money(o.price)}</td>
                              <td>
                                <span
                                  className={`status-badge ${o.status === "active" ? "success" : ""}`}
                                >
                                  {o.status === "active"
                                    ? config.mode === "demo"
                                      ? "Demo payment"
                                      : "Paid"
                                    : o.status.replaceAll("_", " ")}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!orders.length && (
                        <div className="empty">
                          <CreditCard size={30} />
                          <h3>No payments yet</h3>
                          <p>Your rental history will appear here.</p>
                        </div>
                      )}
                    </div>
                  </section>
                </>
              )}
              {page === "Settings" && config.freePreview && (
                <section className="panel empty">
                  <ShieldCheck size={32} />
                  <h2>Sample workspace only</h2>
                  <p>
                    Personal accounts and password changes are unavailable in
                    this free preview. All sample data resets when the service
                    restarts.
                  </p>
                  <button
                    className="primary"
                    onClick={() => navigate("Overview")}
                  >
                    Back to overview
                  </button>
                </section>
              )}
              {page === "Settings" && user && !config.freePreview && (
                <div className="settings-grid">
                  <section className="panel">
                    <div className="section-heading">
                      <div>
                        <h2>Account details</h2>
                        <p>A few details that make this workspace yours.</p>
                      </div>
                    </div>
                    <form className="settings-form" onSubmit={saveSettings}>
                      <label>
                        Full name
                        <input
                          name="name"
                          defaultValue={user.name}
                          minLength={2}
                          maxLength={80}
                          required
                        />
                      </label>
                      <label>
                        Email address
                        <input value={user.email} disabled />
                        <small>
                          Contact support for email changes or account recovery.
                        </small>
                      </label>
                      <hr />
                      <h3>Change password</h3>
                      <label>
                        Current password
                        <input
                          type="password"
                          name="currentPassword"
                          autoComplete="current-password"
                          maxLength={128}
                        />
                      </label>
                      <label>
                        New password
                        <input
                          type="password"
                          name="newPassword"
                          autoComplete="new-password"
                          minLength={12}
                          maxLength={128}
                        />
                        <small>Use at least 12 characters.</small>
                      </label>
                      <button className="primary" disabled={busy}>
                        {busy ? (
                          <LoaderCircle size={16} className="spin" />
                        ) : (
                          <Check size={16} />
                        )}
                        Save changes
                      </button>
                    </form>
                  </section>
                  <aside className="panel settings-side">
                    <ShieldCheck size={30} />
                    <h2>Your connections, protected.</h2>
                    <p>
                      Your sessions use secure cookies. Passwords are protected
                      with a one-way password hash, and payments stay with
                      Stripe.
                    </p>
                    <hr />
                    <h3>Need a hand?</h3>
                    <p>
                      For account recovery, data requests, or questions about
                      your number, we’re here.
                    </p>
                    <button className="secondary" onClick={() => setHelp(true)}>
                      Contact support <ArrowUpRight size={15} />
                    </button>
                  </aside>
                </div>
              )}
              {page === "Operations" && user?.role === "admin" && (
                <section className="panel">
                  <div className="section-heading">
                    <div>
                      <h2>Order operations</h2>
                      <p>
                        Check provider state before reconciling or refunding an
                        uncertain order.
                      </p>
                    </div>
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Order / customer</th>
                          <th>Number</th>
                          <th>Status</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {adminOrders.map((o) => (
                          <tr key={o.id}>
                            <td>
                              {o.id.slice(0, 8)}
                              <small>{o.email}</small>
                            </td>
                            <td>
                              {o.phone}
                              <small>{o.error}</small>
                            </td>
                            <td>{o.status}</td>
                            <td>
                              {[
                                "needs_review",
                                "provisioning",
                                "payment_review",
                              ].includes(o.status) && (
                                <div className="pills">
                                  {(o.status === "payment_review"
                                    ? ["refund"]
                                    : ["reconcile", "refund"]
                                  ).map((action) => (
                                    <button
                                      className="secondary"
                                      key={action}
                                      disabled={busy}
                                      onClick={async () => {
                                        if (
                                          !window.confirm(
                                            `${action === "refund" ? "Refund this payment after confirming Twilio did not provision the number" : "Reconcile this order with Twilio"}?`,
                                          )
                                        )
                                          return;
                                        setBusy(true);
                                        try {
                                          await api(
                                            `/admin/orders/${o.id}/${action}`,
                                            post({}),
                                          );
                                          const d = await api<{
                                            orders: Order[];
                                          }>("/admin/orders");
                                          setAdminOrders(d.orders);
                                          notify("Order updated");
                                        } catch (e) {
                                          notify((e as Error).message);
                                        } finally {
                                          setBusy(false);
                                        }
                                      }}
                                    >
                                      {action}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </>
          )}
          <footer>
            <span>
              <span className="footer-brand">linea.</span> A world of
              connections.
            </span>
            <div>
              <span className="system-status">
                <i />
                {config.mode === "demo"
                  ? "Demo environment"
                  : "Service connected"}
              </span>
              <button onClick={() => setPrivacy(true)}>Privacy</button>
              <button onClick={() => setTerms(true)}>Terms</button>
              <span>© {new Date().getFullYear()} Linea</span>
            </div>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
          <button
            className="icon-btn"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {auth && config.freePreview && (
        <Modal title="Explore the free preview" close={() => setAuth(null)}>
          <p className="modal-description">
            Use an isolated sample workspace. Personal accounts and real
            payments are unavailable, and sample data resets when the service
            restarts.
          </p>
          <button
            className="primary full-width"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await api<{ user: User }>("/demo", post({}));
                setUser(r.user);
                setAuth(null);
                await refresh();
              } catch (e) {
                notify((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Open sample workspace <ArrowRight size={16} />
          </button>
        </Modal>
      )}
      {auth && !config.freePreview && (
        <Modal
          title={auth === "login" ? "Welcome back." : "Make yourself at home."}
          close={() => {
            if (!busy) {
              setAuth(null);
              setError("");
            }
          }}
        >
          <p className="modal-description">
            {auth === "login"
              ? "Sign in to your Linea workspace."
              : "Your next connection starts with an account."}
          </p>
          <form className="auth-form" onSubmit={authenticate}>
            {auth === "register" && (
              <label>
                Full name
                <input
                  name="name"
                  autoComplete="name"
                  minLength={2}
                  maxLength={80}
                  required
                />
              </label>
            )}
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="email"
                maxLength={254}
                required
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={
                  auth === "login" ? "current-password" : "new-password"
                }
                minLength={12}
                maxLength={128}
                required
              />
              <small>At least 12 characters.</small>
            </label>
            {auth === "register" && (
              <label className="checkbox-label">
                <input name="acceptTerms" type="checkbox" required />
                <span>
                  I agree to the{" "}
                  <button
                    type="button"
                    className="inline-link"
                    onClick={() => setTerms(true)}
                  >
                    terms
                  </button>{" "}
                  and{" "}
                  <button
                    type="button"
                    className="inline-link"
                    onClick={() => setPrivacy(true)}
                  >
                    privacy notice
                  </button>
                  .
                </span>
              </label>
            )}
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <button className="primary full-width" disabled={busy}>
              {busy ? <LoaderCircle size={17} className="spin" /> : null}
              {auth === "login" ? "Sign in" : "Create account"}
              <ArrowRight size={16} />
            </button>
            <p className="auth-switch">
              {auth === "login" ? "New to Linea?" : "Already have an account?"}{" "}
              <button
                type="button"
                onClick={() => {
                  setAuth(auth === "login" ? "register" : "login");
                  setError("");
                }}
              >
                {auth === "login" ? "Create an account" : "Sign in"}
              </button>
            </p>
            {auth === "login" && (
              <p className="subtle-note">
                For account recovery, contact support.
              </p>
            )}
          </form>
        </Modal>
      )}
      {buy && (
        <Modal
          title="Your next connection."
          close={() => {
            if (!busy) setBuy(null);
          }}
        >
          <p className="modal-description">
            One dedicated number. All yours for 30 days.
          </p>
          <div className="checkout-number">
            <span className="flag">
              <Flag code={buy.country} />
            </span>
            <div>
              <strong>{formatPhone(buy.phone)}</strong>
              <p>{buy.locality}</p>
            </div>
            <span className="capability">
              <MessageSquare size={12} /> SMS
            </span>
          </div>
          <div className="checkout-lines">
            <div>
              <span>30-day number rental</span>
              <strong>{money(buy.price)}</strong>
            </div>
            <div>
              <span>Automatic renewal</span>
              <span>None</span>
            </div>
            <div className="checkout-total">
              <strong>Total due today</strong>
              <strong>
                {money(buy.price)} <small>USD</small>
              </strong>
            </div>
          </div>
          <div className="checkout-note">
            <ShieldCheck size={19} />
            <p>
              Inbound SMS included. The number is released after 30 days. No
              outbound SMS or voice forwarding. Availability is confirmed after
              payment; unavailable numbers are reviewed for a refund.
            </p>
          </div>
          {config.mode === "demo" && (
            <div className="demo-checkout">
              Demo checkout · No real number or payment.
            </div>
          )}
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            <span>
              I agree to the{" "}
              <button className="inline-link" onClick={() => setTerms(true)}>
                rental terms
              </button>{" "}
              and immediate activation.
            </span>
          </label>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <button
            className="primary full-width"
            disabled={!accepted || busy}
            onClick={() => void checkout()}
          >
            {busy ? (
              <LoaderCircle size={17} className="spin" />
            ) : (
              <CreditCard size={17} />
            )}{" "}
            {config.mode === "demo"
              ? "Add demo number"
              : "Continue to secure payment"}{" "}
            <ArrowRight size={16} />
          </button>
        </Modal>
      )}
      {help && (
        <Modal
          title="A little help, a lot closer."
          close={() => setHelp(false)}
        >
          <div className="support-intro">
            <span className="empty-icon">
              <Headphones size={29} />
            </span>
            <p>
              For number issues, payment questions, or account recovery, contact
              your workspace operator.
            </p>
            <a className="primary" href={`mailto:${config.supportEmail}`}>
              Email support <ArrowUpRight size={16} />
            </a>
            {config.supportEmail.endsWith("@example.com") && (
              <small>Demo contact — set SUPPORT_EMAIL before launch.</small>
            )}
          </div>
          <div className="faq">
            <h3>How long is my rental?</h3>
            <p>
              30 days from activation. Rentals are prepaid and do not renew
              automatically.
            </p>
            <h3>Can I send messages or make calls?</h3>
            <p>
              This release supports receiving SMS. Outbound SMS and voice
              forwarding are not included.
            </p>
            <h3>When will my number be ready?</h3>
            <p>
              After verified payment and successful provider provisioning. If
              availability changes, support will reconcile the order or arrange
              a refund.
            </p>
          </div>
        </Modal>
      )}
      {terms && (
        <Modal title="Number rental terms" close={() => setTerms(false)}>
          <div className="legal-text">
            <p>
              Linea provides prepaid 30-day rentals of dedicated phone numbers
              for lawful business communications, subject to provider
              availability. The rental begins at activation and the number is
              automatically released at expiry. There is no automatic renewal.
            </p>
            <h3>Included service</h3>
            <p>
              Receive SMS through this portal. Outbound messaging, emergency
              calling, voice forwarding, and third-party verification
              compatibility are not included or guaranteed. “Voice-ready”
              describes provider capability only.
            </p>
            <h3>Responsible use</h3>
            <p>
              Do not use the service for spam, fraud, harassment, impersonation,
              or bypassing access controls. Additional identity or business
              verification may be required by the operator or provider.
            </p>
            <h3>Payments and support</h3>
            <p>
              Prices are shown in USD before payment. Stripe processes live
              payments. Availability may change before activation. If
              provisioning fails, contact {config.supportEmail} with your order
              ID for reconciliation or a refund. Applicable consumer rights
              continue to apply.
            </p>
            <p>
              Service operator: {config.operatorName}. Registered address:{" "}
              {config.operatorAddress}. Contact: {config.supportEmail}. For
              service failure before activation, the operator will reconcile the
              order or refund the rental payment.
            </p>
          </div>
        </Modal>
      )}
      {privacy && (
        <Modal title="Privacy notice" close={() => setPrivacy(false)}>
          <div className="legal-text">
            <p>
              Linea stores your account name, email, password hash, rental
              orders, session records, and received messages. Data is used to
              provide and secure your number rental service.
            </p>
            <h3>Service providers</h3>
            <p>
              Twilio provisions numbers and delivers messages. Stripe processes
              payments; card details are not stored in Linea. Your account email
              and purchase details are shared with Stripe at checkout.
            </p>
            <h3>Retention and requests</h3>
            <p>
              Message content is automatically deleted after{" "}
              {config.retentionDays} days. Sessions expire after 7 days. Order
              and audit records are retained for business operations. Contact{" "}
              {config.supportEmail} for access, deletion, recovery, or other
              privacy requests.
            </p>
            <p>
              Data controller: {config.operatorName}, {config.operatorAddress}.
              Contact {config.supportEmail} for data access, correction, or
              deletion requests.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
