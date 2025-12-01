// main.js

const eventsContainer = document.getElementById("events");
const statusEl = document.getElementById("status");
const filterButtons = document.querySelectorAll(".filter-btn");
const datePicker = document.getElementById("date-picker");

// --- Date range helpers ---

function getUnixRange(range, options = {}) {
  let start;
  let end;

  if (range === "tonight") {
    // tonight: roughly 5pm–4am
    start = new Date();
    start.setHours(17, 0, 0, 0);

    end = new Date(start);
    end.setDate(end.getDate() + 1);
    end.setHours(4, 0, 0, 0);
  } else if (range === "week") {
    // next 7 days
    start = new Date();
    start.setHours(0, 0, 0, 0);

    end = new Date(start);
    end.setDate(end.getDate() + 7);
    end.setHours(23, 59, 59, 999);
  } else if (range === "date" && options.date) {
    // specific single date
    start = new Date(options.date + "T00:00:00");
    end = new Date(options.date + "T23:59:59");
  } else {
    // fallback: next 7 days
    start = new Date();
    start.setHours(0, 0, 0, 0);
    end = new Date(start);
    end.setDate(end.getDate() + 7);
    end.setHours(23, 59, 59, 999);
  }

  return {
    start: Math.floor(start.getTime() / 1000),
    end: Math.floor(end.getTime() / 1000),
  };
}

// --- Location helpers ---

function getCoordsFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const lat = params.get("lat");
  const lng = params.get("lng");
  if (lat && lng) {
    return { lat: parseFloat(lat), lng: parseFloat(lng) };
  }
  return null;
}

async function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      return reject(new Error("Geolocation not supported"));
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });
}

// --- Core fetch + render ---

async function fetchAndRender(range = "tonight", options = {}) {
  try {
    statusEl.textContent = "Finding shows near you...";
    eventsContainer.innerHTML = "";

    let coords = getCoordsFromUrl();
    if (!coords) {
      coords = await getUserLocation();
    }

    const { start, end } = getUnixRange(range, options);

    const params = new URLSearchParams({
      lat: coords.lat,
      lng: coords.lng,
      radius: 20, // miles
      start_date: start,
      end_date: end,
    });

    const res = await fetch(
      `/.netlify/functions/local-events?${params.toString()}`
    );
    if (!res.ok) {
      throw new Error("API request failed");
    }

    const data = await res.json();
    const events = data.events || [];

    if (!events.length) {
      statusEl.textContent =
        "No local shows found in this range. Try a different filter or date.";
      return;
    }

    statusEl.textContent = `Showing ${events.length} local performances.`;
    renderEvents(events);
  } catch (err) {
    console.error(err);
    statusEl.textContent =
      "We couldn't load local shows. Please check location permissions and try again.";
  }
}

function renderEvents(events) {
  eventsContainer.innerHTML = "";

  events.forEach((ev) => {
    const card = document.createElement("article");
    card.className = "event-card";

    // Image
    const img = document.createElement("img");
    img.className = "event-image";
    img.src = ev.image_url || "";
    img.alt = ev.name || "Event image";

    // Main
    const main = document.createElement("div");
    main.className = "event-main";

    // Name
    const nameEl = document.createElement("div");
    nameEl.className = "event-name";
    nameEl.textContent = ev.name || "Live Music";

    // Meta (date + venue)
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

    const venue = ev.venue || ev.location || null;
    const locStr = venue
      ? `${venue.name ? venue.name + " • " : ""}${venue.address1 || ""} ${venue.city || ""}, ${
          venue.state || ""
        }`.trim()
      : "Location TBA";

    metaEl.textContent = `${timeStr} • ${locStr}`;

    // Description
    const descEl = document.createElement("div");
    descEl.className = "event-description";
    descEl.textContent = ev.description || "";

    // Tags (price + venue label)
    const tagsEl = document.createElement("div");
    tagsEl.className = "event-tags";

    const hasMin = typeof ev.price_min === "number";
    const hasMax = typeof ev.price_max === "number";

    if (hasMin || hasMax) {
      const pill = document.createElement("span");
      pill.className = "tag-pill";

      if (hasMin && hasMax && ev.price_min === 0 && ev.price_max === 0) {
        pill.textContent = "Free";
      } else {
        const min = hasMin ? `$${Math.round(ev.price_min)}` : "";
        const max = hasMax ? `$${Math.round(ev.price_max)}` : "";
        pill.textContent =
          max && max !== min ? `${min}–${max}` : min || max || "Paid";
      }

      tagsEl.appendChild(pill);
    }

    if (venue && venue.name) {
      const venuePill = document.createElement("span");
      venuePill.className = "tag-pill";
      venuePill.textContent = venue.name;
      tagsEl.appendChild(venuePill);
    }

    // Actions
    const actions = document.createElement("div");
    actions.className = "event-actions";

    const eventUrl = ev.url || ev.event_site_url || null;
    if (eventUrl) {
      const btn = document.createElement("a");
      btn.className = "btn-outline";
      btn.href = eventUrl;
      btn.target = "_blank";
      btn.rel = "noopener noreferrer";
      btn.textContent = "View Event";
      actions.appendChild(btn);
    }

    const planBtn = document.createElement("button");
    planBtn.className = "btn-outline";
    planBtn.textContent = "Plan Your Night";
    planBtn.addEventListener("click", () => {
      if (venue && venue.address1) {
        const q = encodeURIComponent(
          `${venue.address1} ${venue.city || ""} ${venue.state || ""}`
        );
        window.open(`https://maps.apple.com/?q=${q}`, "_blank");
      }
    });
    actions.appendChild(planBtn);

    // Assemble
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

// --- UI wiring ---

filterButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    filterButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    const range = btn.dataset.range;
    if (range === "date") {
      if (datePicker.value) {
        fetchAndRender("date", { date: datePicker.value });
      } else {
        statusEl.textContent = "Select a date to see local shows.";
        datePicker.focus();
      }
    } else if (range === "tonight") {
      fetchAndRender("tonight");
    } else if (range === "week") {
      fetchAndRender("week");
    }
  });
});

datePicker.addEventListener("change", () => {
  if (!datePicker.value) return;
  filterButtons.forEach((b) => b.classList.remove("active"));
  const dateBtn = document.querySelector('.filter-btn[data-range="date"]');
  if (dateBtn) dateBtn.classList.add("active");
  fetchAndRender("date", { date: datePicker.value });
});

// Initial load: Tonight
fetchAndRender("tonight");
