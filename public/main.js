// Because this app may run inside BuildFire or other frames,
// we hardcode the Netlify domain for 100% reliability.
const BASE_URL = "https://concerto-local-music.netlify.app";

const eventsContainer = document.getElementById("events");
const statusEl = document.getElementById("status");
const filterButtons = document.querySelectorAll(".filter-btn");
const dateInput = document.getElementById("date-picker");

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
}

// Filters
filterButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    filterButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");

    const range = btn.dataset.range;
    if (range === "date") {
      if (dateInput.value) {
        fetchAndRender("date", dateInput.value);
      } else {
        setStatus("Pick a date to see shows.");
        eventsContainer.innerHTML = "";
      }
    } else {
      fetchAndRender(range);
    }
  });
});

if (dateInput) {
  dateInput.addEventListener("change", () => {
    const active = document.querySelector(".filter-btn.active");
    if (active && active.dataset.range === "date") {
      fetchAndRender("date", dateInput.value);
    }
  });
}

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
  } else if (range === "date") {
    const d = new Date(dateStr);
    start.setTime(d.getTime());
    start.setHours(0, 0, 0, 0);
    end.setTime(d.getTime());
    end.setHours(23, 59, 59, 999);
  }

  return {
    start: Math.floor(start.getTime() / 1000),
    end: Math.floor(end.getTime() / 1000),
  };
}

function getCoordsFromUrl() {
  const url = new URLSearchParams(window.location.search);
  const lat = parseFloat(url.get("lat"));
  const lng = parseFloat(url.get("lng"));
  return !isNaN(lat) && !isNaN(lng) ? { lat, lng } : null;
}

async function getUserLocation() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });
}

async function fetchAndRender(range = "tonight", dateStr = null) {
  try {
    setStatus("Finding shows near you...");
    eventsContainer.innerHTML = "";

    let coords = getCoordsFromUrl();
    if (!coords) {
      try {
        coords = await getUserLocation();
      } catch {
        // fallback: downtown LA
        coords = { lat: 34.0407, lng: -118.2468 };
      }
    }

    const { start, end } = getUnixRange(range, dateStr);

    const params = new URLSearchParams({
      lat: coords.lat,
      lng: coords.lng,
      radius: "20",
      start_date: start,
      end_date: end,
    });

    const endpoint = `${BASE_URL}/.netlify/functions/local-events?${params.toString()}`;
    console.log("Fetching:", endpoint);

    const res = await fetch(endpoint);
    if (!res.ok) {
      throw new Error("API error");
    }

    const data = await res.json();
    const events = data.events || [];

    if (!events.length) {
      setStatus("No local shows found.");
      return;
    }

    setStatus(`Showing ${events.length} performances.`);
    renderEvents(events);
  } catch (err) {
    console.error(err);
    setStatus("We couldn’t load local shows. Check location settings.");
  }
}

function renderEvents(events) {
  eventsContainer.innerHTML = "";

  events.forEach(ev => {
    const venue = ev.venue || {};

    const card = document.createElement("div");
    card.className = "event-card";

    card.innerHTML = `
      <img class="event-image" src="${ev.image_url || ""}" alt="" />
      <div class="event-main">
        <div class="event-name">${ev.name || "Live Music"}</div>

        <div class="event-meta">
          ${ev.time_start ? new Date(ev.time_start).toLocaleString() : "Time TBA"}
          • ${venue.name || venue.address1 || venue.city || venue.state || "Location TBA"}
        </div>

        <div class="event-description">
          ${ev.description || ""}
        </div>

        <div class="event-actions">
          ${ev.url ? `<a class="btn-outline" target="_blank" href="${ev.url}">View Event</a>` : ""}
        </div>
      </div>
    `;

    eventsContainer.appendChild(card);
  });
}

fetchAndRender("tonight");
