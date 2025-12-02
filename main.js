// main.js

const API_KEY = "vSyw9gaQsyn8SqMXctOzWZsGJDGt29tB"; // <-- put your key here

const EVENTS_URL = "https://app.ticketmaster.com/discovery/v2/events.json";
const VENUES_URL = "https://app.ticketmaster.com/discovery/v2/venues.json";

// DOM
const locationInput = document.getElementById("locationInput");
const locationSuggestions = document.getElementById("locationSuggestions");
const dateInput = document.getElementById("dateInput");
const searchBtn = document.getElementById("searchBtn");
const statusEl = document.getElementById("status");
const eventsContainer = document.getElementById("events");
const resultsSummary = document.getElementById("resultsSummary");

// === Helpers ===

// Escape HTML
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Parse "City, ST" into { city, stateCode }
function parseCityState(input) {
  if (!input) return null;
  const parts = input.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const state = parts[parts.length - 1].toUpperCase();
  const city = parts.slice(0, parts.length - 1).join(", ");
  if (state.length !== 2) return null;
  return { city, stateCode: state };
}

// Build date range for a given YYYY-MM-DD string
function getDateRange(dateStr) {
  if (!dateStr) return {};
  const start = new Date(dateStr + "T00:00:00");
  const end = new Date(dateStr + "T23:59:59");

  if (isNaN(start.getTime()) || isNaN(end.getTime())) return {};

  return {
    startDateTime: start.toISOString(),
    endDateTime: end.toISOString(),
  };
}

// Heuristic for "small" venues
function isSmallVenueEvent(event) {
  const venue =
    event._embedded &&
    event._embedded.venues &&
    event._embedded.venues[0];

  if (!venue || !venue.name) return false;

  const name = venue.name.toLowerCase();

  const smallKeywords = [
    "bar",
    "pub",
    "club",
    "lounge",
    "tavern",
    "saloon",
    "grill",
    "taproom",
    "brewing",
    "brewery",
    "cafe",
    "caf\u00e9",
    "music hall",
  ];

  const bigVenueKeywords = [
    "stadium",
    "arena",
    "center",
    "centre",
    "coliseum",
    "ampitheatre",
    "amphitheatre",
    "amphitheater",
    "ballpark",
    "field",
    "pavilion",
  ];

  const hasSmall = smallKeywords.some((k) => name.includes(k));
  const hasBig = bigVenueKeywords.some((k) => name.includes(k));

  return hasSmall && !hasBig;
}

// === Location suggestions (Ticketmaster venues) ===

// Debounce utility
function debounce(fn, delay = 350) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// Fetch venue-based city suggestions
async function fetchLocationSuggestions(query) {
  const params = new URLSearchParams({
    apikey: API_KEY,
    keyword: query,
    countryCode: "US",
    size: "20",
  });

  const url = `${VENUES_URL}?${params.toString()}`;
  const res = await fetch(url);

  if (!res.ok) {
    console.error("Venue suggestion error:", res.status);
    return [];
  }

  const data = await res.json();
  if (!data._embedded || !data._embedded.venues) return [];

  const venues = data._embedded.venues;

  const set = new Set();
  const suggestions = [];

  for (const v of venues) {
    const city = v.city && v.city.name;
    const state = v.state && v.state.stateCode;
    const name = v.name;
    if (!city || !state) continue;

    const key = `${city}, ${state}`;
    if (!set.has(key)) {
      set.add(key);
      suggestions.push({
        label: key,
        venueName: name || "",
      });
    }
    if (suggestions.length >= 10) break;
  }

  return suggestions;
}

// Render suggestions dropdown
function renderLocationSuggestions(items) {
  if (!items.length) {
    locationSuggestions.innerHTML = "";
    locationSuggestions.hidden = true;
    return;
  }

  locationSuggestions.innerHTML = items
    .map(
      (item) => `
      <div class="suggest-item" data-value="${escapeHtml(item.label)}">
        <strong>${escapeHtml(item.label)}</strong>
        ${
          item.venueName
            ? `<span>&mdash; ${escapeHtml(item.venueName)}</span>`
            : ""
        }
      </div>
    `
    )
    .join("");

  locationSuggestions.hidden = false;
}

// Handle click on suggestion
locationSuggestions.addEventListener("click", (e) => {
  const target = e.target.closest(".suggest-item");
  if (!target) return;
  const value = target.getAttribute("data-value");
  if (!value) return;

  locationInput.value = value;
  locationSuggestions.hidden = true;
});

// Hide suggestions when clicking outside
document.addEventListener("click", (e) => {
  if (
    !locationSuggestions.contains(e.target) &&
    e.target !== locationInput
  ) {
    locationSuggestions.hidden = true;
  }
});

// On input, fetch suggestions (debounced)
const handleLocationInput = debounce(async () => {
  const query = locationInput.value.trim();
  if (query.length < 2) {
    locationSuggestions.hidden = true;
    return;
  }

  try {
    const suggestions = await fetchLocationSuggestions(query);
    renderLocationSuggestions(suggestions);
  } catch (err) {
    console.error("Suggestion fetch error:", err);
    locationSuggestions.hidden = true;
  }
}, 380);

locationInput.addEventListener("input", handleLocationInput);

// === Fetch events ===
async function fetchEvents(city, stateCode, dateStr) {
  const baseParams = {
    apikey: API_KEY,
    city,
    stateCode,
    countryCode: "US",
    segmentName: "Music",
    size: "100",
    sort: "date,asc",
  };

  const dateParams = getDateRange(dateStr);
  const params = new URLSearchParams({
    ...baseParams,
    ...dateParams,
  });

  const url = `${EVENTS_URL}?${params.toString()}`;
  const res = await fetch(url);

  if (!res.ok) {
    const text = await res.text();
    console.error("Ticketmaster API error:", res.status, text);
    throw new Error(`Ticketmaster API error: ${res.status}`);
  }

  const data = await res.json();
  if (!data._embedded || !data._embedded.events) return [];

  return data._embedded.events;
}

// === Render events ===
function renderEvents(events) {
  eventsContainer.innerHTML = "";

  if (!events.length) {
    eventsContainer.innerHTML = `<p class="muted">No small-venue music events found for this search.</p>`;
    return;
  }

  events.forEach((event) => {
    const venue =
      event._embedded &&
      event._embedded.venues &&
      event._embedded.venues[0];

    const eventName = event.name || "Untitled event";
    const url = event.url || "#";

    // Date/time
    let displayDate = "Date TBA";
    if (event.dates && event.dates.start) {
      const { dateTime, localDate, localTime } = event.dates.start;
      const raw =
        dateTime ||
        (localDate && `${localDate}T${localTime || "00:00:00"}`);
      if (raw) {
        const d = new Date(raw);
        if (!isNaN(d.getTime())) {
          displayDate = d.toLocaleString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          });
        }
      }
    }

    const venueName = venue && venue.name ? venue.name : "Venue TBA";

    const addressLine =
      venue && venue.address && venue.address.line1
        ? venue.address.line1
        : "";

    const cityStateZip = [
      venue && venue.city && venue.city.name,
      venue && venue.state && venue.state.stateCode,
      venue && venue.postalCode,
    ]
      .filter(Boolean)
      .join(" ");

    const smallTag = isSmallVenueEvent(event);
    const venueTagText = smallTag ? "Small venue" : "Venue";

    const card = document.createElement("article");
    card.className = "event-card";

    card.innerHTML = `
      <h3 class="event-title">${escapeHtml(eventName)}</h3>
      <div class="event-meta">
        <span><strong>When</strong> ${escapeHtml(displayDate)}</span>
        <span><strong>Where</strong> ${escapeHtml(venueName)}</span>
      </div>
      <div class="event-address">
        ${escapeHtml(addressLine)}
        ${addressLine && cityStateZip ? "<br>" : ""}
        ${escapeHtml(cityStateZip)}
      </div>
      <div class="event-footer">
        <span class="venue-tag">${escapeHtml(venueTagText)}</span>
        ${
          url && url !== "#"
            ? `<a class="ticket-link" href="${url}" target="_blank" rel="noopener noreferrer">
                 Tickets / Info
               </a>`
            : ""
        }
      </div>
    `;

    eventsContainer.appendChild(card);
  });
}

// === Search handler ===
async function handleSearch() {
  const rawLocation = locationInput.value.trim();
  const dateStr = dateInput.value || "";

  const parsed = parseCityState(rawLocation);

  if (!parsed) {
    statusEl.textContent = "Please enter a city and 2-letter state (e.g. Austin, TX).";
    return;
  }

  const { city, stateCode } = parsed;

  eventsContainer.innerHTML = "";
  statusEl.innerHTML = "";
  const spinner = document.createElement("div");
  spinner.className = "spinner";
  statusEl.appendChild(spinner);

  resultsSummary.textContent = "";

  try {
    const events = await fetchEvents(city, stateCode, dateStr);

    // Filter to small venues only
    const smallEvents = events.filter(isSmallVenueEvent);

    if (!events.length) {
      statusEl.textContent = "No events found. Try another city or date.";
      resultsSummary.textContent = `No events for ${city}, ${stateCode}${dateStr ? " on selected date" : ""}.`;
      renderEvents([]);
      return;
    }

    if (!smallEvents.length) {
      statusEl.textContent =
        "We found music events, but none that look like small bar/club shows.";
      resultsSummary.textContent = `No small-venue shows for ${city}, ${stateCode}${dateStr ? " on selected date" : ""}.`;
      renderEvents([]);
      return;
    }

    statusEl.textContent = `Found ${smallEvents.length} small-venue show(s).`;
    resultsSummary.textContent = `Showing small-venue music events for ${city}, ${stateCode}${dateStr ? " on your selected date" : ""}.`;
    renderEvents(smallEvents);
  } catch (err) {
    console.error("Error loading shows:", err);
    statusEl.textContent =
      "We couldn't load shows right now. Please try again in a moment.";
    resultsSummary.textContent = "Error loading events from Ticketmaster.";
  }
}

// Button click
searchBtn.addEventListener("click", handleSearch);

// Enter key shortcuts
locationInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    handleSearch();
  }
});
dateInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    handleSearch();
  }
});
