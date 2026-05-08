import { useRef, useState } from "react";
import axios from "axios";

const initialState = {
  current_location: "",
  pickup_location: "",
  dropoff_location: "",
  current_cycle_used: 0,
  driver_name: "",
  carrier_name: "",
  vehicle_number: "",
  main_office_address: "",
  co_driver: "",
};

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const locationFields = ["current_location", "pickup_location", "dropoff_location"];
const createSuggestMeta = () => ({ open: false, loading: false, highlighted: -1 });

export default function TripForm({ onSubmit, loading }) {
  const [formData, setFormData] = useState(initialState);
  const [suggestions, setSuggestions] = useState({
    current_location: [],
    pickup_location: [],
    dropoff_location: [],
  });
  const [suggestMeta, setSuggestMeta] = useState({
    current_location: createSuggestMeta(),
    pickup_location: createSuggestMeta(),
    dropoff_location: createSuggestMeta(),
  });
  const timersRef = useRef({});
  const closeTimersRef = useRef({});
  const controllersRef = useRef({});
  const lastQueryRef = useRef({});

  const updateMeta = (field, patch) => {
    setSuggestMeta((prev) => ({
      ...prev,
      [field]: { ...prev[field], ...patch },
    }));
  };

  const scheduleSuggestions = (field, value) => {
    if (!locationFields.includes(field)) {
      return;
    }

    if (timersRef.current[field]) {
      clearTimeout(timersRef.current[field]);
    }

    if (controllersRef.current[field]) {
      controllersRef.current[field].abort();
    }

    const trimmed = value.trim();
    lastQueryRef.current[field] = trimmed;
    if (trimmed.length < 3) {
      setSuggestions((prev) => ({ ...prev, [field]: [] }));
      updateMeta(field, { open: false, loading: false, highlighted: -1 });
      return;
    }

    updateMeta(field, { loading: true, open: true, highlighted: -1 });

    timersRef.current[field] = setTimeout(async () => {
      const controller = new AbortController();
      controllersRef.current[field] = controller;
      try {
        const response = await axios.get(`${API_BASE}/api/suggest/`, {
          params: { q: trimmed },
          signal: controller.signal,
        });
        if (lastQueryRef.current[field] !== trimmed) {
          return;
        }
        const items = response.data?.suggestions ?? [];
        setSuggestions((prev) => ({ ...prev, [field]: items }));
        updateMeta(field, {
          open: true,
          highlighted: items.length > 0 ? 0 : -1,
        });
      } catch (error) {
        if (error?.code === "ERR_CANCELED") {
          return;
        }
        setSuggestions((prev) => ({ ...prev, [field]: [] }));
        updateMeta(field, { open: true, highlighted: -1 });
      } finally {
        if (lastQueryRef.current[field] === trimmed) {
          updateMeta(field, { loading: false });
        }
      }
    }, 300);
  };

  const handleFocus = (field) => {
    if (suggestions[field].length || (lastQueryRef.current[field] || "").length >= 3) {
      updateMeta(field, { open: true });
    }
  };

  const handleBlur = (field) => {
    if (closeTimersRef.current[field]) {
      clearTimeout(closeTimersRef.current[field]);
    }
    closeTimersRef.current[field] = setTimeout(() => {
      updateMeta(field, { open: false, highlighted: -1 });
    }, 150);
  };

  const selectSuggestion = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    setSuggestions((prev) => ({ ...prev, [field]: [] }));
    updateMeta(field, { open: false, highlighted: -1 });
  };

  const handleKeyDown = (field, event) => {
    const items = suggestions[field];
    if (!suggestMeta[field].open || items.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      updateMeta(field, {
        highlighted: Math.min(items.length - 1, suggestMeta[field].highlighted + 1),
      });
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      updateMeta(field, {
        highlighted: Math.max(0, suggestMeta[field].highlighted - 1),
      });
    } else if (event.key === "Enter") {
      if (suggestMeta[field].highlighted >= 0) {
        event.preventDefault();
        selectSuggestion(field, items[suggestMeta[field].highlighted]);
      }
    } else if (event.key === "Escape") {
      updateMeta(field, { open: false, highlighted: -1 });
    }
  };

  const renderLocationInput = (label, name, placeholder) => {
    const items = suggestions[name];
    const meta = suggestMeta[name];
    const query = lastQueryRef.current[name] || "";
    return (
      <label className="input-label">
        {label}
        <div className="relative mt-1">
          <input
            type="text"
            name={name}
            value={formData[name]}
            onChange={handleChange}
            onFocus={() => handleFocus(name)}
            onBlur={() => handleBlur(name)}
            onKeyDown={(event) => handleKeyDown(name, event)}
            required
            placeholder={placeholder}
            autoComplete="off"
            className="input-field"
          />
          {meta.loading && (
            <span className="absolute right-3 top-2.5 text-xs text-steel-200">Searching...</span>
          )}
          {meta.open && (items.length > 0 || (query.length >= 3 && !meta.loading)) && (
            <div className="absolute z-20 mt-2 max-h-52 w-full overflow-auto rounded-lg border border-white/30 bg-white text-sm text-navy-900 shadow">
              {items.length > 0 ? (
                items.map((item, index) => (
                  <div
                    key={item}
                    className={`cursor-pointer px-3 py-2 ${
                      index === meta.highlighted ? "bg-steel-200" : "hover:bg-steel-100"
                    }`}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      selectSuggestion(name, item);
                    }}
                  >
                    {item}
                  </div>
                ))
              ) : (
                <div className="px-3 py-2 text-steel-200">No matches found.</div>
              )}
            </div>
          )}
        </div>
      </label>
    );
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === "current_cycle_used" ? Number(value) : value,
    }));
    scheduleSuggestions(name, value);
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setSuggestions({
      current_location: [],
      pickup_location: [],
      dropoff_location: [],
    });
    setSuggestMeta({
      current_location: createSuggestMeta(),
      pickup_location: createSuggestMeta(),
      dropoff_location: createSuggestMeta(),
    });
    onSubmit?.(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="glass-panel rounded-2xl p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-steel-100">Trip Inputs</h2>
          <p className="mt-1 text-sm text-steel-200">
            Enter locations and driver details to generate a compliant trip plan.
          </p>
        </div>
        <span className="hidden rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.3em] text-steel-200 md:inline-flex">
          HOS Ready
        </span>
      </div>

      <div className="mt-6 space-y-4">
        {renderLocationInput("Current Location", "current_location", "Chicago, IL")}
        {renderLocationInput("Pickup Location", "pickup_location", "Indianapolis, IN")}
        {renderLocationInput("Dropoff Location", "dropoff_location", "Columbus, OH")}

        <label className="input-label">
          Current Cycle Used (hours)
          <input
            type="number"
            name="current_cycle_used"
            min="0"
            max="70"
            step="0.1"
            value={formData.current_cycle_used}
            onChange={handleChange}
            required
            className="input-field"
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="input-label">
            Driver Name
            <input
              type="text"
              name="driver_name"
              value={formData.driver_name}
              onChange={handleChange}
              placeholder="Alex Carter"
              className="input-field"
            />
          </label>
          <label className="input-label">
            Carrier Name
            <input
              type="text"
              name="carrier_name"
              value={formData.carrier_name}
              onChange={handleChange}
              placeholder="Northline Freight"
              className="input-field"
            />
          </label>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="input-label">
            Vehicle Number
            <input
              type="text"
              name="vehicle_number"
              value={formData.vehicle_number}
              onChange={handleChange}
              placeholder="Truck 102"
              className="input-field"
            />
          </label>
          <label className="input-label">
            Co-Driver
            <input
              type="text"
              name="co_driver"
              value={formData.co_driver}
              onChange={handleChange}
              placeholder="Optional"
              className="input-field"
            />
          </label>
        </div>

        <label className="input-label">
          Main Office Address
          <input
            type="text"
            name="main_office_address"
            value={formData.main_office_address}
            onChange={handleChange}
            placeholder="100 Logistics Ave, Chicago, IL"
            className="input-field"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="mt-6 flex w-full items-center justify-center gap-3 rounded-full bg-accent-500 px-5 py-3 text-sm font-semibold text-navy-950 transition hover:bg-accent-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? (
          <>
            <span className="spinner"></span>
            Planning Route
          </>
        ) : (
          "Plan Trip"
        )}
      </button>
    </form>
  );
}
