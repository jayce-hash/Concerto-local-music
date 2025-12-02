// main.js

const API_KEY = "vSyw9gaQsyn8SqMXctOzWZsGJDGt29tB"; // <-- put your key here
const BASE_URL = "https://app.ticketmaster.com/discovery/v2/events.json";

// DOM elements
const form = document.getElementById("search-form");
const cityInput = document.getElementById("cityInput");
const stateInput = document.getElementById("stateInput");
const smallOnlyCheckbox = document.getElementById("smallOnly");
const statusEl = document.getElementById("status");
const eventsContainer = document.getElementById("events");

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const city = cityInput.value.trim();
  const state = stateInput.value.trim().toUpperCase();
  const smallOnly = smallOnlyCheckbox.checked;

  if (!city || !state || state.length !== 2) {
    statusEl.textContent = "Please enter a city and 2-letter state code.";
    return;
  }

  eventsContainer.innerHTML = "";
  statusEl.textContent = `Searching for music shows in ${city}, ${state}...`;

  try {
    const events = await fetchEvents(city, state);

    if (!events || events.length === 0) {
      statusEl.textContent = "No music events found. Try another city or date range.";
      return;
    }

    let filtered = events;

    if (smallOnly) {
      filtered = events.filter(isSmallVenueEvent);
    }

    if (filtered.length === 0) {
      statusEl.textContent =
        "We found music events, but none that look like small bar/club shows. Try unchecking 'Small venues only'.";
      return;
    }

    statusEl.textContent = `Found ${filtered.length} show(s).`;
    renderEvents(filtered);
  } catch (err) {
    console.error("Error loading shows:", err);
    statusEl.textContent =
      "We couldn't load shows right now. Please try again in a moment.";
  }
});

/**
 * Call Ticketmaster Discovery API with city + state.
 */
async function fetchEvents(city, stateCode) {
  const params = new URLSearchParams({
    apikey: API_KEY,
    city,
    stateCode,
    countryCode: "US",
    segmentName: "Music", // limit to music
    size: "100",
    sort: "date,asc",
  });

  const url = `${BASE_URL}?${params.toString()}`;

  const res = await fetch(url);

  if (!res.ok) {
    // Surface some info in console; user-facing error is handled above
    const text = await res.text();
    console.error("Ticketmaster API error:", res.status, text);
    throw new Error(`Ticketmaster API error: ${res.status}`);
  }

  const data = await res.json();

  if (!data._embedded || !data._embedded.events) {
    return [];
  }

  return data._embedded.events;
}

/**
 * Heuristic: try to keep it to bar/club-type venues.
 * We look at the venue name and keep ones that contain
 * "bar", "club", "pub", etc. and avoid big arena words.
 */
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
    "ampitheatre", // common misspells
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

/**
 * Render cards into the page.
 */
function renderEvents(events) {
  eventsContainer.innerHTML = "";

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
      const raw = dateTime || (localDate && `${localDate}T${localTime || "00:00:00"}`);
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

    const addressLine = venue && venue.address && venue.address.line1
      ? venue.address.line1
      : "";

    const cityStateZip = [
      venue && venue.city && venue.city.name,
      venue && venue.state && venue.state.stateCode,
      venue && venue.postalCode,
    ]
      .filter(Boolean)
      .join(" ");

    const isSmallTag = isSmallVenueEvent(event) ? "Small venue" : "Venue";

    const card = document.createElement("article");
    card.className = "event-card";

    card.innerHTML = `
      <h3 class="event-title">${escapeHtml(eventName)}</h3>
      <div class="event-meta">
        <div><strong>When:</strong> ${escapeHtml(displayDate)}</div>
        <div><strong>Where:</strong> ${escapeHtml(venueName)}</div>
      </div>
      <div class="event-address">
        ${escapeHtml(addressLine)}
        ${addressLine && cityStateZip ? "<br>" : ""}
        ${escapeHtml(cityStateZip)}
      </div>
      <div class="event-footer">
        <span class="venue-tag">${escapeHtml(isSmallTag)}</span>
        ${
          url && url !== "#"
            ? `<a class="ticket-link" href="${url}" target="_blank" rel="noopener noreferrer">Tickets / Info</a>`
            : ""
        }
      </div>
    `;

    eventsContainer.appendChild(card);
  });
}

/**
 * Simple HTML escaping to avoid weird characters breaking layout.
 */
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
