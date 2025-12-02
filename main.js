// main.js — Local Shows (direct Ticketmaster, with on-screen error details)

// ----- DOM HOOKS -----
const eventsContainer = document.getElementById("events");
const statusEl = document.getElementById("status");

// Filters
const filterButtons = document.querySelectorAll(".filter-btn");
const dateInput = document.getElementById("date-picker");

// Location inputs
const cityInput = document.getElementById("city-input");
const stateSelect = document.getElementById("state-select");
const applyLocationBtn = document.getElementById("apply-location");

// ✅ Same Ticketmaster key you use in Concerto+
const TM_API_KEY = "oMkciJfNTvAuK1N4O1XXe49pdPEeJQuh";

// Keep track of current filter range
let currentRange = "tonight";
let currentDateStr = null;

// ============= FILTER BUTTONS =============
filterButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    filterButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    const range = btn.dataset.range;
    currentRange = range;

    if (range === "date") {
      if (dateInput) dateInput.style.display = "block";

      if (dateInput && dateInput.value) {
        currentDateStr = dateInput.value;
        fetchAndRender("date", currentDateStr);
      } else {
        statusEl.textContent = "Pick a date to see shows.";
        eventsContainer.innerHTML = "";
      }
    } else {
      if (dateInput) dateInput.style.display = "none";
      currentDateStr = null;
      fetchAndRender(range);
    }
  });
});

if (dateInput) {
  dateInput.addEventListener("change", () => {
    if (currentRange === "date" && dateInput.value) {
      currentDateStr = dateInput.value;
      fetchAndRender("date", currentDateStr);
    }
  });
}

if (applyLocationBtn) {
  applyLocationBtn.addEventListener("click", () => {
    fetchAndRender(currentRange, currentDateStr);
  });
}

// ============= TIME RANGE HELPERS =============
function getUnixRange(range, dateStr) {
  const now = new Date();
  const start = new Date();
  const end = new Date();

  if (range === "tonight") {
    // Tonight = now → 3am
    start.setTime(now.getTime());
    end.setDate(start.getDate() + 1);
    end.setHours(3, 0, 0, 0);
  } else if (range === "week") {
    // Next 7 days
    start.setHours(0, 0, 0, 0);
    end.setDate(start.getDate() + 7);
    end.setHours(23, 59, 59, 999);
  } else if (range === "date" && dateStr) {
    // Specific calendar date (local)
    const d = new Date(dateStr + "T00:00:00");
    start.setTime(d.getTime());
    start.setHours(0, 0, 0, 0);
    end.setTime(d.getTime());
    end.setHours(23, 59, 59, 999);
  } else {
    // Default = tonight
    start.setTime(now.getTime());
    end.setDate(start.getDate() + 1);
    end.setHours(3, 0, 0, 0);
  }

  return {
    start: Math.floor(start.getTime() / 1000),
    end: Math.floor(end.getTime() / 1000),
  };
}

function toIsoFromUnix(sec) {
  return new Date(sec * 1000).toISOString();
}

// ============= MAIN FETCH =============
async function fetchAndRender(range = "tonight", dateStr = null) {
  try {
    const city = cityInput.value.trim();
    const state = stateSelect.value.trim();

    if (!city || !state) {
      statusEl.textContent =
        'Select your city and state, then tap "Find Shows".';
      eventsContainer.innerHTML = "";
      return;
    }

    if (!TM_API_KEY) {
      statusEl.textContent = "Ticket search is not configured (missing API key).";
      console.error("TM_API_KEY is missing");
      return;
    }

    statusEl.textContent = "Finding shows in your area...";
    eventsContainer.innerHTML = "";

    const { start, end } = getUnixRange(range, dateStr);
    const startIso = toIsoFromUnix(start);
    const endIso = toIsoFromUnix(end);

    // Build Ticketmaster Discovery URL
    const tmUrl = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
    tmUrl.searchParams.set("apikey", TM_API_KEY);
    tmUrl.searchParams.set("city", city);
    tmUrl.searchParams.set("stateCode", state);
    tmUrl.searchParams.set("countryCode", "US");
    tmUrl.searchParams.set("startDateTime", startIso);
    tmUrl.searchParams.set("endDateTime", endIso);
    tmUrl.searchParams.set("sort", "date,asc");
    tmUrl.searchParams.set("size", "100"); // up to 100 events

    console.log("TM URL:", tmUrl.toString());

    const res = await fetch(tmUrl.toString());

    if (!res.ok) {
      const text = await res.text();
      console.error("Ticketmaster error:", res.status, text);

      if (res.status === 401 || res.status === 403) {
        statusEl.textContent =
          "Ticket search is blocked (401/403). Double-check your Ticketmaster API key & permissions.";
      } else {
        statusEl.textContent =
          `Ticketmaster error ${res.status}. Try again or adjust your search.`;
      }
      return;
    }

    const data = await res.json();
    console.log("Ticketmaster data:", data);

    const rawEvents = data._embedded?.events || [];
    if (!rawEvents.length) {
      statusEl.textContent =
        "No shows found for that city and date range. Try a different filter or date.";
      eventsContainer.innerHTML = "";
      return;
    }

    const events = rawEvents.map((ev) => {
      const venue = ev._embedded?.venues?.[0] || {};
      const images = ev.images || [];
      const img = images.find((i) => i.url) || {};
      const priceRanges = ev.priceRanges || [];
      const pr = priceRanges[0] || {};

      return {
        id: ev.id,
        name: ev.name,
        description: ev.info || ev.pleaseNote || "",
        time_start: ev.dates?.start?.dateTime || null,
        url: ev.url || null,
        image_url: img.url || null,
        venue: {
          name: venue.name || "",
          address1: venue.address?.line1 || "",
          city: venue.city?.name || "",
          state: venue.state?.stateCode || "",
          country: venue.country?.countryCode || "",
        },
        price_min: pr.min ?? null,
        price_max: pr.max ?? null,
      };
    });

    statusEl.textContent = `Showing ${events.length} performances in ${city}, ${state}.`;
    renderEvents(events);
  } catch (err) {
    console.error("fetchAndRender error:", err);
    const msg = err && err.message ? err.message : String(err || "Unknown error");
    statusEl.textContent =
      `Error loading shows: ${msg}`;
  }
}

// ============= RENDER CARDS =============
function renderEvents(events) {
  eventsContainer.innerHTML = "";
  events.forEach((ev) => {
    const card = document.createElement("article");
    card.className = "event-card";

    const img = document.createElement("img");
    img.className = "event-image";
    img.src = ev.image_url || "";
    img.alt = ev.name || "Event image";

    const main = document.createElement("div");
    main.className = "event-main";

    const nameEl = document.createElement("div");
    nameEl.className = "event-name";
    nameEl.textContent = ev.name || "Live Music";

    const metaEl = document.createElement("div");
    metaEl.className = "event-meta";

    const date = ev.time_start ? new Date(ev.time_start) : null;
    const timeStr = date
      ? date.toLocaleString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        })
      : "Time TBA";

    const venue = ev.venue || {};
    const locStr =
      venue.address1 ||
      venue.city ||
      venue.name
        ? `${venue.name ? venue.name + " • " : ""}${venue.address1 || ""} ${
            venue.city || ""
          }, ${venue.state || ""}`.trim()
        : "Location TBA";

    metaEl.textContent = `${timeStr} • ${locStr}`;

    const descEl = document.createElement("div");
    descEl.className = "event-description";
    descEl.textContent = ev.description || "";

    const tagsEl = document.createElement("div");
    tagsEl.className = "event-tags";

    if (ev.price_min != null || ev.price_max != null) {
      const pill = document.createElement("span");
      pill.className = "tag-pill";
      const min = ev.price_min != null ? `$${ev.price_min.toFixed(0)}` : "";
      const max = ev.price_max != null ? `$${ev.price_max.toFixed(0)}` : "";
      pill.textContent = max && max !== min ? `${min}–${max}` : min || "Paid";
      tagsEl.appendChild(pill);
    }

    const actions = document.createElement("div");
    actions.className = "event-actions";

    if (ev.url) {
      const btn = document.createElement("a");
      btn.className = "btn-outline";
      btn.href = ev.url;
      btn.target = "_blank";
      btn.rel = "noopener noreferrer";
      btn.textContent = "View Event";
      actions.appendChild(btn);
    }

    const planBtn = document.createElement("button");
    planBtn.className = "btn-outline";
    planBtn.textContent = "Plan Your Night";
    planBtn.addEventListener("click", () => {
      if (venue && (venue.address1 || venue.name || venue.city)) {
        const q = encodeURIComponent(
          `${venue.name || ""} ${venue.address1 || ""} ${venue.city || ""} ${
            venue.state || ""
          }`
        );
        window.open(`https://maps.apple.com/?q=${q}`, "_blank");
      }
    });
    actions.appendChild(planBtn);

    main.appendChild(nameEl);
    main.appendChild(metaEl);
    main.appendChild(descEl);
    main.appendChild(tagsEl);
    main.appendChild(actions);

    card.appendChild(img);
    card.appendChild(main);
    eventsContainer.appendChild(card);
  });
}

// NOTE: No default fetch on load — user must pick city/state and tap "Find Shows".
