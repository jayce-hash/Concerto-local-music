// main.js

const eventsContainer = document.getElementById("events");
const statusEl = document.getElementById("status");
const filterButtons = document.querySelectorAll(".filter-btn");

filterButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    filterButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    fetchAndRender(btn.dataset.range);
  });
});

function getUnixRange(range) {
  const now = new Date();
  const start = new Date();
  const end = new Date();

  if (range === "tonight") {
    start.setMinutes(0, 0, 0);
    end.setDate(start.getDate() + 1);
    end.setHours(3, 0, 0, 0);
  } else if (range === "weekend") {
    const day = now.getDay(); // 0=Sun
    const diffToFri = (5 - day + 7) % 7;
    start.setDate(now.getDate() + diffToFri);
    start.setHours(0, 0, 0, 0);

    const diffToSun = (7 - day) % 7;
    end.setDate(now.getDate() + diffToSun);
    end.setHours(23, 59, 59, 999);
  } else {
    start.setHours(0, 0, 0, 0);
    end.setDate(start.getDate() + 7);
    end.setHours(23, 59, 59, 999);
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
  const fromUrl = getCoordsFromUrl();
  if (fromUrl) {
    console.log("Using coords from URL:", fromUrl);
    return fromUrl;
  }

  if (!("geolocation" in navigator)) {
    throw new Error("Geolocation is not supported in this browser.");
  }

  return new Promise((resolve, reject) => {
    let finished = false;

    const timeoutId = setTimeout(() => {
      if (finished) return;
      finished = true;
      reject(new Error("Location request timed out. Check permissions in Settings."));
    }, 10000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeoutId);
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        console.log("Got coords from geolocation:", coords);
        resolve(coords);
      },
      (err) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeoutId);
        console.error("Geolocation error:", err);
        reject(err);
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });
}

async function fetchAndRender(range = "tonight") {
  try {
    statusEl.textContent = "Finding shows near you...";
    eventsContainer.innerHTML = "";

    const coords = await getUserLocation();

    const { start, end } = getUnixRange(range);

    const params = new URLSearchParams({
      lat: coords.lat,
      lng: coords.lng,
      radius: 5000,
      start_date: start,
      end_date: end,
    });

    const res = await fetch(`/.netlify/functions/local-events?${params.toString()}`);
    if (!res.ok) {
      const text = await res.text();
      console.error("API error response:", res.status, text);
      throw new Error(`API request failed (${res.status})`);
    }

    const data = await res.json();
    const events = data.events || [];

    if (!events.length) {
      statusEl.textContent = "No local shows found in this range. Try a different filter.";
      return;
    }

    statusEl.textContent = `Showing ${events.length} local performances.`;
    renderEvents(events);
  } catch (err) {
    console.error("Location or API error:", err);

    let msg = "We couldn't load local shows.";
    if (err.code === 1) {
      msg =
        "We couldn't access your location. Please allow location for Safari / Concerto in Settings and reload.";
    } else if (err.message) {
      msg = `We couldn't load local shows: ${err.message}`;
    }
    statusEl.textContent = msg;
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

    const loc = ev.location;
    const locStr = loc
      ? `${loc.address1 || ""} ${loc.city || ""}, ${loc.state || ""}`.trim()
      : "Location TBA";

    metaEl.textContent = `${timeStr} • ${locStr}`;

    const descEl = document.createElement("div");
    descEl.className = "event-description";
    descEl.textContent = ev.description || "";

    const tagsEl = document.createElement("div");
    tagsEl.className = "event-tags";

    if (ev.is_free) {
      const pill = document.createElement("span");
      pill.className = "tag-pill";
      pill.textContent = "Free";
      tagsEl.appendChild(pill);
    } else if (ev.cost || ev.cost_max) {
      const pill = document.createElement("span");
      pill.className = "tag-pill";
      const min = ev.cost ? `$${ev.cost.toFixed(0)}` : "";
      const max = ev.cost_max ? `$${ev.cost_max.toFixed(0)}` : "";
      pill.textContent = max && max !== min ? `${min}–${max}` : min || "Paid";
      tagsEl.appendChild(pill);
    }

    if (ev.category) {
      const pill = document.createElement("span");
      pill.className = "tag-pill";
      pill.textContent = ev.category;
      tagsEl.appendChild(pill);
    }

    const actions = document.createElement("div");
    actions.className = "event-actions";

    if (ev.event_site_url) {
      const btn = document.createElement("a");
      btn.className = "btn-outline";
      btn.href = ev.event_site_url;
      btn.target = "_blank";
      btn.rel = "noopener noreferrer";
      btn.textContent = "View Event";
      actions.appendChild(btn);
    }

    const planBtn = document.createElement("button");
    planBtn.className = "btn-outline";
    planBtn.textContent = "Plan Your Night";
    planBtn.addEventListener("click", () => {
      if (ev.location && ev.location.address1) {
        const q = encodeURIComponent(
          `${ev.location.address1} ${ev.location.city || ""} ${ev.location.state || ""}`
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

fetchAndRender("tonight");
