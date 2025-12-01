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

// Return start/end as ISO8601 strings for Ticketmaster
function getDateRangeISO(range) {
  const now = new Date();
  const start = new Date();
  const end = new Date();

  if (range === "tonight") {
    // roughly "this evening" → now until 3am
    if (start.getHours() < 15) {
      // if it's earlier than 3pm, start at 6pm local
      start.setHours(18, 0, 0, 0);
    }
    end.setDate(start.getDate() + 1);
    end.setHours(3, 0, 0, 0);
  } else if (range === "weekend") {
    // Friday 00:00 through Sunday 23:59
    const day = now.getDay(); // 0 = Sunday
    const diffToFri = (5 - day + 7) % 7;
    start.setDate(now.getDate() + diffToFri);
    start.setHours(0, 0, 0, 0);

    const diffToSun = (7 - day) % 7;
    end.setDate(now.getDate() + diffToSun);
    end.setHours(23, 59, 59, 999);
  } else {
    // this week: today through 7 days out
    start.setHours(0, 0, 0, 0);
    end.setDate(start.getDate() + 7);
    end.setHours(23, 59, 59, 999);
  }

  return {
    start: start.toISOString(),
    end: end.toISOString(),
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

async function fetchAndRender(range = "tonight") {
  try {
    statusEl.textContent = "Finding shows near you...";
    eventsContainer.innerHTML = "";

    let coords = getCoordsFromUrl();
    if (!coords) {
      coords = await getUserLocation();
    }

    const { start, end } = getDateRangeISO(range);

    const params = new URLSearchParams({
      lat: coords.lat,
      lng: coords.lng,
      radius: 25, // miles
      startDateTime: start,
      endDateTime: end,
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
        "No local shows found in this range. Try a different filter.";
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

    const v = ev.venue;
    const locStr = v
      ? [v.name, v.city, v.state].filter(Boolean).join(" • ")
      : "Venue TBA";

    metaEl.textContent = `${timeStr} • ${locStr}`;

    const descEl = document.createElement("div");
    descEl.className = "event-description";
    descEl.textContent = ev.description || "";

    const tagsEl = document.createElement("div");
    tagsEl.className = "event-tags";

    if (ev.price_min || ev.price_max) {
      const pill = document.createElement("span");
      pill.className = "tag-pill";

      const min = ev.price_min ? `$${ev.price_min.toFixed(0)}` : "";
      const max = ev.price_max ? `$${ev.price_max.toFixed(0)}` : "";

      pill.textContent =
        min && max && max !== min ? `${min}–${max}` : min || max || "Ticketed";
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
      if (v && (v.address1 || v.name)) {
        const q = encodeURIComponent(
          `${v.address1 || ""} ${v.name || ""} ${v.city || ""} ${
            v.state || ""
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

fetchAndRender("tonight");
