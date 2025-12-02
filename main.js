// main.js — Local Shows (via Netlify Function)

const eventsContainer = document.getElementById("events");
const statusEl = document.getElementById("status");

// Filters
const filterButtons = document.querySelectorAll(".filter-btn");
const dateInput = document.getElementById("date-picker");

// Location inputs
const cityInput = document.getElementById("city-input");
const stateSelect = document.getElementById("state-select");
const applyLocationBtn = document.getElementById("apply-location");

// Keep track of current filter range
let currentRange = "tonight";
let currentDateStr = null;

// ------------- EVENT LISTENERS -------------

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

// ------------- TIME RANGE -> UNIX SECONDS -------------

function getUnixRange(range, dateStr) {
  const now = new Date();
  const start = new Date();
  const end = new Date();

  if (range === "tonight") {
    start.setTime(now.getTime());
    end.setDate(start.getDate() + 1);
    end.setHours(3, 0, 0, 0);
  } else if (range === "week") {
    start.setHours(0, 0, 0, 0);
    end.setDate(start.getDate() + 7);
    end.setHours(23, 59, 59, 999);
  } else if (range === "date" && dateStr) {
    const d = new Date(dateStr + "T00:00:00");
    start.setTime(d.getTime());
    start.setHours(0, 0, 0, 0);
    end.setTime(d.getTime());
    end.setHours(23, 59, 59, 999);
  } else {
    start.setTime(now.getTime());
    end.setDate(start.getDate() + 1);
    end.setHours(3, 0, 0, 0);
  }

  return {
    start: Math.floor(start.getTime() / 1000),
    end: Math.floor(end.getTime() / 1000),
  };
}

// ------------- MAIN FETCH -------------

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

    statusEl.textContent = "Finding shows in your area...";
    eventsContainer.innerHTML = "";

    const { start, end } = getUnixRange(range, dateStr);

    const params = new URLSearchParams({
      city,
      state,
      start_date: start.toString(),
      end_date: end.toString(),
    });

    const url = `/.netlify/functions/local-events?${params.toString()}`;
    console.log("Calling function:", url);

    const res = await fetch(url);
    const text = await res.text(); // grab raw text in case of error
    console.log("Function raw response:", text);

    if (!res.ok) {
      let errMsg = `API error ${res.status}`;
      try {
        const parsed = JSON.parse(text);
        if (parsed.error) errMsg += ` – ${parsed.error}`;
      } catch {}
      statusEl.textContent = errMsg;
      return;
    }

    const data = JSON.parse(text);
    const events = data.events || [];

    if (!events.length) {
      statusEl.textContent =
        "No shows found for that city and date range. Try a different filter or date.";
      return;
    }

    statusEl.textContent = `Showing ${events.length} performances in ${city}, ${state}.`;
    renderEvents(events);
  } catch (err) {
    console.error("fetchAndRender error:", err);
    const msg = err?.message || String(err || "Unknown error");
    statusEl.textContent = `We couldn't load shows right now: ${msg}`;
  }
}

// ------------- RENDER CARDS -------------

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
