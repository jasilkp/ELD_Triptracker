import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { jsPDF } from "jspdf";
import TripForm from "./components/TripForm";
import MapView from "./components/MapView";
import ELDLogSheet from "./components/ELDLogSheet";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "https://eldtrip-backend-bi9i.onrender.com").replace(/\/+$/, "");

const buildRecap = (logSheets) => {
  const recent = [...logSheets].slice(-8);
  const daily = recent.map((sheet) => {
    const driving = sheet.total_hours?.driving || 0;
    const onDuty = sheet.total_hours?.on_duty_not_driving || 0;
    return Math.round((driving + onDuty) * 100) / 100;
  });
  while (daily.length < 8) {
    daily.unshift(0);
  }
  const totalOnDuty = daily.reduce((sum, val) => sum + val, 0);
  return {
    daily,
    totalOnDuty: Math.round(totalOnDuty * 100) / 100,
    remaining: Math.max(70 - totalOnDuty, 0),
  };
};

export default function App() {
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [planningStep, setPlanningStep] = useState(0);
  const [recentTrips, setRecentTrips] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [serverStatus, setServerStatus] = useState("checking"); // 'checking' | 'waking' | 'online' | 'offline'
  const [serverPing, setServerPing] = useState(null);
  const canvasRefs = useRef({});

  const recap = useMemo(() => (plan?.log_sheets ? buildRecap(plan.log_sheets) : null), [plan]);

  const planningSteps = [
    { label: "Geocoding locations", icon: "📍" },
    { label: "Building route", icon: "🛣️" },
    { label: "Generating HOS schedule", icon: "📋" },
    { label: "Rendering daily logs", icon: "📄" },
  ];

  // Background server warmup & health check loop
  const checkServerHealth = async (isInitial = false) => {
    if (isInitial) setServerStatus("checking");
    const startTime = performance.now();
    try {
      // 12-second timeout for quick probe
      const res = await axios.get(`${API_BASE}/api/trip/health/`, { timeout: 12000 });
      if (res.data?.status === "ok") {
        const latency = Math.round(performance.now() - startTime);
        setServerPing(latency);
        setServerStatus("online");
        return true;
      }
    } catch {
      // Server is likely cold or booting up
      setServerStatus("waking");
    }
    return false;
  };

  useEffect(() => {
    let timer;
    let attempts = 0;

    const probe = async () => {
      const isUp = await checkServerHealth(attempts === 0);
      attempts += 1;
      if (isUp) {
        fetchRecentTrips();
      } else if (attempts < 15) {
        // Retry every 4 seconds while waking up
        timer = setTimeout(probe, 4000);
      } else {
        setServerStatus("offline");
      }
    };

    probe();

    return () => clearTimeout(timer);
  }, []);

  const fetchRecentTrips = async () => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const response = await axios.get(`${API_BASE}/api/trip/history/?limit=6`, { timeout: 20000 });
      setRecentTrips(response.data?.results || []);
    } catch {
      setHistoryError("Could not load recent trips.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleSubmit = async (payload) => {
    setLoading(true);
    setPlanningStep(0);
    setError("");
    try {
      const stepDuration = 600;
      
      setPlanningStep(1);
      await new Promise(r => setTimeout(r, stepDuration));
      
      setPlanningStep(2);
      // Extended 75s timeout to comfortably absorb cold boots if triggered during submission
      const response = await axios.post(`${API_BASE}/api/trip/plan/`, payload, { timeout: 75000 });
      
      setPlanningStep(3);
      await new Promise(r => setTimeout(r, stepDuration));
      
      setPlanningStep(4);
      await new Promise(r => setTimeout(r, 400));
      
      setPlan(response.data);
      setServerStatus("online");
      fetchRecentTrips();
    } catch (err) {
      if (err.code === "ECONNABORTED" || err.message?.includes("timeout")) {
        setError("Request timed out while server was warming up. The server should be awake now—please try again.");
        setServerStatus("waking");
      } else {
        setError(err.response?.data?.detail || "Trip planning failed. Check your API and inputs.");
      }
    } finally {
      setLoading(false);
      setPlanningStep(0);
    }
  };

  const registerCanvas = (index, canvas) => {
    canvasRefs.current[index] = canvas;
  };

  const downloadPdf = () => {
    if (!plan?.log_sheets) return;
    const canvases = Object.values(canvasRefs.current).filter(Boolean);
    if (!canvases.length) return;
    const first = canvases[0];
    const pdf = new jsPDF({
      orientation: "landscape",
      unit: "pt",
      format: [first.width, first.height],
    });
    canvases.forEach((canvas, index) => {
      if (index > 0) {
        pdf.addPage([canvas.width, canvas.height], "landscape");
      }
      const img = canvas.toDataURL("image/png", 1.0);
      pdf.addImage(img, "PNG", 0, 0, canvas.width, canvas.height);
    });
    pdf.save("eld-log-sheets.pdf");
  };

  const totalDistance = plan?.total_distance_miles
    ? `${plan.total_distance_miles.toFixed(1)} mi`
    : "—";
  const totalDuration = plan?.total_duration_hours
    ? `${plan.total_duration_hours.toFixed(1)} hrs`
    : "—";
  const totalStops = plan?.stops?.length ?? "—";

  const formatWhen = (isoDate) => {
    if (!isoDate) return "";
    const date = new Date(isoDate);
    return date.toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-grid opacity-15"></div>
      <div className="pointer-events-none absolute -top-32 right-10 h-72 w-72 rounded-full bg-accent-500/20 blur-3xl"></div>
      <div className="pointer-events-none absolute bottom-0 left-0 h-96 w-96 rounded-full bg-aqua-400/10 blur-3xl"></div>

      {/* Planning Progress Overlay */}
      {loading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
          <div className="glass-panel animate-pop rounded-2xl p-8 shadow-2xl sm:max-w-md">
            <div className="mb-6 text-center">
              <h2 className="font-display text-2xl font-semibold text-white">Planning Your Trip</h2>
              <p className="mt-2 text-sm text-steel-200">
                {serverStatus === "waking"
                  ? "Cloud backend is waking up from idle (~30-45s)..."
                  : "Calculating routes and FMCSA HOS compliance logs..."}
              </p>
            </div>
            <div className="space-y-3">
              {planningSteps.map((step, index) => {
                const isActive = planningStep === index + 1;
                const isComplete = planningStep > index + 1;
                return (
                  <div
                    key={index}
                    className={`flex items-center gap-3 rounded-lg p-3 transition-all duration-300 ${
                      isActive ? "bg-accent-500/30 ring-1 ring-accent-400" : isComplete ? "bg-aqua-500/20" : "bg-white/5"
                    }`}
                  >
                    <span className="text-lg">{isComplete ? "✓" : step.icon}</span>
                    <span className={`text-sm font-medium ${isActive ? "text-white" : isComplete ? "text-aqua-300" : "text-steel-300"}`}>
                      {step.label}
                    </span>
                    {isActive && <span className="ml-auto h-2 w-2 animate-pulse rounded-full bg-accent-400"></span>}
                  </div>
                );
              })}
            </div>
            <div className="mt-6 text-center text-xs text-steel-300">
              {serverStatus === "waking"
                ? "First run takes a bit longer while Render spins up the container."
                : "Standard computation takes 5–15 seconds."}
            </div>
          </div>
        </div>
      )}

      <div className="relative mx-auto flex max-w-7xl flex-col gap-10 px-6 py-10">
        <header className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <span className="pill animate-reveal delay-1">Fleet Ops Console</span>
            <div className="mt-4 flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:gap-5 sm:text-left animate-reveal delay-2">
              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-[1.4rem] border border-white/10 bg-white/6 shadow-[0_14px_36px_rgba(0,0,0,0.24)] backdrop-blur-md sm:h-14 sm:w-14 animate-hero-logo">
                <span className="absolute inset-[-12px] rounded-[1.8rem] border border-accent-400/20 animate-hero-ring"></span>
                <span className="absolute inset-0 rounded-[1.4rem] bg-gradient-to-br from-accent-500/25 via-white/10 to-aqua-400/15 blur-xl animate-hero-glow"></span>
                <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-aqua-400 shadow-[0_0_18px_rgba(60,207,230,0.75)] animate-hero-dot"></span>
                <svg className="relative h-6 w-6 text-accent-400 drop-shadow-[0_8px_14px_rgba(0,0,0,0.35)] animate-hero-icon sm:h-7 sm:w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" d="M3 13.5V7a1 1 0 011-1h10.2a1 1 0 01.8.4l3 4a1 1 0 01.2.6v2.5" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" d="M3 13.5h2.5a1 1 0 01.8.4l1.2 1.6a1 1 0 00.8.4h5.4a1 1 0 00.8-.4l1.2-1.6a1 1 0 01.8-.4H21" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" d="M6.5 18a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0Zm14 0a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0Z" />
                </svg>
              </div>
              <h1 className="font-display text-5xl font-bold leading-[0.95] sm:text-6xl md:text-7xl bg-gradient-to-r from-steel-100 via-accent-400 to-steel-100 bg-clip-text text-transparent drop-shadow-lg animate-hero-title">
                ELD Trip Planner
              </h1>
            </div>
            <p className="mt-4 text-base text-steel-200 animate-reveal delay-3">
              Build FMCSA-compliant plans, visualize every stop, and export daily logs in minutes.
            </p>
          </div>
          
          {/* Dynamic Server Health & Cold-Start Status Badge */}
          <div className="glass-panel animate-pop delay-4 rounded-2xl p-5 hover-soft sheen animate-glow min-w-[220px]">
            <div className="flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.35em] text-steel-200">Server Status</p>
              {serverPing && serverStatus === "online" && (
                <span className="text-[10px] text-aqua-300 font-mono">{serverPing}ms</span>
              )}
            </div>
            {serverStatus === "online" && (
              <>
                <p className="mt-2 text-lg font-semibold text-white">HOS Engine Online</p>
                <div className="mt-2 flex items-center gap-2 text-sm text-steel-200">
                  <span className="h-2.5 w-2.5 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.8)]"></span>
                  Ready for calculations
                </div>
              </>
            )}
            {(serverStatus === "waking" || serverStatus === "checking") && (
              <>
                <p className="mt-2 text-lg font-semibold text-amber-200 flex items-center gap-2">
                  <span className="spinner h-4 w-4 border-amber-300"></span>
                  Waking Server...
                </p>
                <div className="mt-2 flex items-center gap-2 text-xs text-amber-100/80">
                  <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping"></span>
                  Spinning up free tier instance (~30s)
                </div>
              </>
            )}
            {serverStatus === "offline" && (
              <>
                <p className="mt-2 text-lg font-semibold text-red-300">Server Idle</p>
                <button
                  type="button"
                  onClick={() => checkServerHealth(true)}
                  className="mt-2 flex items-center gap-2 text-xs text-red-200 underline hover:text-white"
                >
                  <span className="h-2 w-2 rounded-full bg-red-500"></span>
                  Click to wake server
                </button>
              </>
            )}
          </div>
        </header>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="stat-card animate-reveal delay-2 hover-soft sheen animate-glow">
            <p className="stat-label">Total Distance</p>
            <p className="stat-value mt-2">{totalDistance}</p>
          </div>
          <div className="stat-card animate-reveal delay-3 hover-soft sheen animate-glow">
            <p className="stat-label">Drive Window</p>
            <p className="stat-value mt-2">{totalDuration}</p>
          </div>
          <div className="stat-card animate-reveal delay-4 hover-soft sheen animate-glow">
            <p className="stat-label">Stops Logged</p>
            <p className="stat-value mt-2">{totalStops}</p>
          </div>
        </section>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <section className="flex flex-col gap-4">
            <div className="animate-reveal delay-3">
              <TripForm onSubmit={handleSubmit} loading={loading} />
            </div>
            {error && (
              <div className="rounded-xl border border-red-400/40 bg-red-500/20 px-4 py-3 text-sm text-red-100">
                {error}
              </div>
            )}
            <div className="glass-panel animate-reveal delay-4 rounded-2xl p-5 hover-soft">
              <div className="mb-3 flex items-center justify-between">
                <p className="panel-title">Recent Trips</p>
                <button
                  type="button"
                  onClick={fetchRecentTrips}
                  className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-steel-100 transition hover:bg-white/10"
                >
                  Refresh
                </button>
              </div>
              {historyLoading ? (
                <div className="flex items-center gap-2 text-sm text-steel-200">
                  <span className="spinner"></span>
                  Loading recent trips...
                </div>
              ) : historyError ? (
                <div className="rounded-lg border border-red-400/30 bg-red-500/20 px-3 py-2 text-sm text-red-100">
                  {historyError}
                </div>
              ) : recentTrips.length ? (
                <div className="space-y-2">
                  {recentTrips.map((trip) => (
                    <div key={trip.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm">
                      <p className="font-semibold text-steel-100">
                        {trip.pickup_location} to {trip.dropoff_location}
                      </p>
                      <p className="mt-1 text-xs text-steel-300">
                        {trip.total_distance_miles?.toFixed(1)} mi, {trip.total_duration_hours?.toFixed(1)} hrs, {trip.stops_count} stops
                      </p>
                      <p className="mt-1 text-xs text-steel-400">
                        {trip.driver_name ? `${trip.driver_name} - ` : ""}{formatWhen(trip.created_at)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm text-steel-200">
                  No saved trips yet. Submit a trip to see history here.
                </div>
              )}
            </div>
          </section>

          <section className="flex flex-1 flex-col gap-8">
            <div className="glass-panel animate-reveal delay-4 rounded-2xl p-5 hover-soft tilt">
              <div className="flex items-center justify-between">
                <div>
                  <p className="panel-title">Route Map</p>
                  <p className="panel-subtitle">Stops, breaks, and fuel along the planned path.</p>
                </div>
              </div>
              <div className="mt-4 h-[360px]">
                <MapView route={plan?.route} />
              </div>
            </div>

            <div className="glass-panel animate-reveal delay-5 rounded-2xl p-5 hover-soft tilt">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="panel-title">ELD Daily Log Sheets</p>
                  <p className="panel-subtitle">Generated from the simulated HOS timeline.</p>
                </div>
                <button
                  type="button"
                  onClick={downloadPdf}
                  disabled={!plan?.log_sheets?.length}
                  className="rounded-full bg-accent-500 px-4 py-2 text-sm font-semibold text-navy-950 transition hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Download as PDF
                </button>
              </div>
              <div className="mt-6 space-y-8">
                {plan?.log_sheets?.length ? (
                  plan.log_sheets.map((sheet, index) => (
                    <div key={sheet.date} className={`fade-in-sm delay-${Math.min(index + 1, 3)}`}>
                      <ELDLogSheet
                        sheet={sheet}
                        recap={recap}
                        registerCanvas={registerCanvas}
                        index={index}
                      />
                    </div>
                  ))
                ) : (
                  <div className="rounded-xl border border-white/10 bg-white/5 px-5 py-8 text-center text-sm text-steel-200">
                    Submit a trip plan to generate daily log sheets.
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
