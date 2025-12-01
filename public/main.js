// main.js

const eventsContainer = document.getElementById("events");
const statusEl = document.getElementById("status");
const filterButtons = document.querySelectorAll(".filter-btn");

// Optional: if you add a date picker for "Select a Date"
const dateInput = document.getElementById("date-picker");

filterButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    filterButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    const range = btn.dataset.range;

    if (range === "date") {
      // If you have a date tab, wait for the user to pick a date
      if (dateInput && dateInput.value) {
        fetchAndRender("date", dateInput.value);
      } else {
        statusEl.textContent = "Pick a date to see shows.";
        eventsContainer.innerHTML = "";
      }
    } else {
      fetchAndRender(range);
    }
  });
});

if (dateInput) {
  dateInput.addEventListener("change", () => {
    const activeBtn = document.querySelector(".filter-btn.active");
    if (activeBtn && activeBtn.dataset.range === "date") {
      fetchAndRender("date", dateInput.value);
    }
  });
}

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

function getCoordsFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const lat = params.get("lat");
  const lng = params.get("lng");
  if (lat && lng) return { lat: parseFloat(lat), lng: parseFloat(lng) };
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

// 👉 MAIN FETCH
async function fetchAndRender(range = "tonight", dateStr = null) {
  try {
    statusEl.textContent = "Finding shows near you...";
    eventsContainer.innerHTML = "";

    // 1. Get coords from URL if provided
    let coords = getCoordsFromUrl();

    // 2. If not, try geolocation
    if (!coords) {
      try {
        coords = await getUserLocation();
      } catch (geoErr) {
        console.warn("Geolocation failed, using fallback coords", geoErr);
        // 3. Fallback to a default location (example: Downtown LA)
        coords = {
          lat: 34.0407,
          lng: -118.2468,
        };
      }
    }

    if (!coords || isNaN(coords.lat) || isNaN(coords.lng)) {
      throw new Error("No valid coordinates available");
    }

    const { start, end } = getUnixRange(range, dateStr);

    const params = new URLSearchParams({
      lat: coords.lat.toString(),
      lng: coords.lng.toString(),
      radius: "20", // 20-mile radius (your Netlify function interprets this)
      start_date: start.toString(),
      end_date: end.toString(),
    });

 // ✅ use your real Netlify site domain here
const url = `https://YOUR-SITE-NAME.netlify.app/.netlify/functions/local-events?${params.toString()}`;

    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      console.error("Function error:", res.status, text);
      throw new Error("API request failed");
    }

    const data = await res.json();
    console.log("Events data:", data);

    const events = data.events || [];

    if (!events.length) {
      statusEl.textContent = "No local shows found in this range. Try a different filter.";
      return;
    }

    statusEl.textContent = `Showing ${events.length} local performances.`;
    renderEvents(events);
  } catch (err) {
    console.error("fetchAndRender error:", err);
    statusEl.textContent =
      "We couldn't load local shows. Please check location permissions and try again.";
  }
}

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
    const locStr = venue.address1 || venue.city || venue.name
      ? `${venue.name ? venue.name + " • " : ""}${venue.address1 || ""} ${venue.city || ""}, ${
          venue.state || ""
        }`.trim()
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
      if (venue && (venue.address1 || venue.name)) {
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

// Default load: Tonight
fetchAndRender("tonight");
