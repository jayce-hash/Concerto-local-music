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

const toggleFiltersBtn = document.getElementById("toggleFilters");
const moreFiltersEl = document.getElementById("moreFilters");
const genreGroup = document.getElementById("genreFilters");
const timeGroup = document.getElementById("timeFilters");
const priceGroup = document.getElementById("priceFilters");

// Filter state
const selectedGenres = new Set(); // multi-select
let selectedTime = "any";         // "any" | "afternoon" | "evening" | "latenight"
let selectedPrice = "any";        // "any" | "free" | "under20" | "under50"

// Genre keyword mapping
const GENRE_KEYWORDS = {
  pop: ["pop"],
  rock: ["rock"],
  hiphop: ["hip hop", "hip-hop", "rap"],
  rnb: ["r&b", "rnb", "soul"],
  country: ["country"],
  edm: ["edm", "electronic", "dance"],
  indie: ["indie", "alternative", "alt rock", "alt-pop"],
  jazz: ["jazz"],
  latin: ["latin"],
};

// === Helpers ===
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Parse "City, ST"
function parseCityState(input) {
  if (!input) return null;
  const parts = input.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const state = parts[parts.length - 1].toUpperCase();
  const city = parts.slice(0, parts.length - 1).join(", ");
  if (state.length !== 2) return null;
  return { city, stateCode: state };
}

// Event local date "YYYY-MM-DD"
function getEventLocalDate(event) {
  if (event.dates && event.dates.start) {
    if (event.dates.start.localDate) {
      return event.dates.start.localDate;
    }
    if (event.dates.start.dateTime) {
      return event.dates.start.dateTime.slice(0, 10);
    }
  }
  return null;
}

// Event local time "HH:MM:SS"
function getEventLocalTime(event) {
  if (event.dates && event.dates.start) {
    if (event.dates.start.localTime) {
      return event.dates.start.localTime;
    }
    if (event.dates.start.dateTime) {
      const parts = event.dates.start.dateTime.split("T");
      if (parts[1]) return parts[1].slice(0, 8);
    }
  }
  return null;
}

// Small-venue heuristic
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

// Debounce utility
function debounce(fn, delay = 350) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// === Location suggestions (Ticketmaster venues) ===
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

// Suggestion events
locationSuggestions.addEventListener("click", (e) => {
  const target = e.target.closest(".suggest-item");
  if (!target) return;
  const value = target.getAttribute("data-value");
  if (!value) return;

  locationInput.value = value;
  locationSuggestions.hidden = true;
});

document.addEventListener("click", (e) => {
  if (
    !locationSuggestions.contains(e.target) &&
    e.target !== locationInput
  ) {
    locationSuggestions.hidden = true;
  }
});

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

// === More Filters toggle ===
toggleFiltersBtn.addEventListener("click", () => {
  const isOpen = !moreFiltersEl.hasAttribute("hidden");
  if (isOpen) {
    moreFiltersEl.setAttribute("hidden", "");
    toggleFiltersBtn.classList.remove("open");
  } else {
    moreFiltersEl.removeAttribute("hidden");
    toggleFiltersBtn.classList.add("open");
  }
});

// === Filter group interactions ===

// Genre (multi-select)
if (genreGroup) {
  genreGroup.addEventListener("click", (e) => {
    const pill = e.target.closest(".pill");
    if (!pill) return;
    const val = pill.dataset.genre;
    if (!val) return;

    if (selectedGenres.has(val)) {
      selectedGenres.delete(val);
      pill.classList.remove("active");
    } else {
      selectedGenres.add(val);
      pill.classList.add("active");
    }
  });
}

// Time of night (single-select)
if (timeGroup) {
  timeGroup.addEventListener("click", (e) => {
    const pill = e.target.closest(".pill");
    if (!pill) return;
    const val = pill.dataset.time;
    if (!val) return;

    selectedTime = val;

    Array.from(timeGroup.querySelectorAll(".pill")).forEach((p) =>
      p.classList.remove("active")
    );
    pill.classList.add("active");
  });
}

// Price (single-select)
if (priceGroup) {
  priceGroup.addEventListener("click", (e) => {
    const pill = e.target.closest(".pill");
    if (!pill) return;
    const val = pill.dataset.price;
    if (!val) return;

    selectedPrice = val;

    Array.from(priceGroup.querySelectorAll(".pill")).forEach((p) =>
      p.classList.remove("active")
    );
    pill.classList.add("active");
  });
}

// === Fetch events (no date params; date is filtered client-side) ===
async function fetchEvents(city, stateCode) {
  const baseParams = {
    apikey: API_KEY,
    city,
    stateCode,
    countryCode: "US",
    segmentName: "Music",
    size: "100",
    sort: "date,asc",
  };

  const params = new URLSearchParams(baseParams);
  const url = `${EVENTS_URL}?${params.toString()}`;
  console.log("➡️ TM events URL:", url);

  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    console.error("❌ Network / CORS error when calling Ticketmaster:", err);
    throw new Error("Network error contacting Ticketmaster.");
  }

  if (!res.ok) {
    let bodySnippet = "";
    try {
      const text = await res.text();
      bodySnippet = text.slice(0, 200);
    } catch (_) {}

    const msg = `Ticketmaster error ${res.status} ${res.statusText || ""}`.trim();
    console.error("❌", msg, "Body snippet:", bodySnippet);
    throw new Error(msg);
  }

  const data = await res.json();
  if (!data._embedded || !data._embedded.events) return [];

  return data._embedded.events;
}

// === Advanced filters (genre, time, price) ===
function getEventGenres(event) {
  const out = [];
  if (event.classifications && event.classifications.length) {
    const c = event.classifications[0];
    if (c.segment && c.segment.name) out.push(c.segment.name.toLowerCase());
    if (c.genre && c.genre.name) out.push(c.genre.name.toLowerCase());
    if (c.subGenre && c.subGenre.name) out.push(c.subGenre.name.toLowerCase());
  }
  return out;
}

function matchesGenreFilter(event) {
  if (selectedGenres.size === 0) return true; // no genre filter

  const eventGenres = getEventGenres(event);
  if (!eventGenres.length) return true; // don't hide if unknown

  const lowered = eventGenres.join(" | ");

  for (const value of selectedGenres) {
    const keywords = GENRE_KEYWORDS[value] || [];
    for (const kw of keywords) {
      if (lowered.includes(kw)) {
        return true;
      }
    }
  }
  return false;
}

function matchesTimeFilter(event) {
  if (selectedTime === "any") return true;

  const t = getEventLocalTime(event);
  if (!t) return true;
  const hour = parseInt(t.slice(0, 2), 10);
  if (Number.isNaN(hour)) return true;

  if (selectedTime === "afternoon") {
    return hour < 18;
  }
  if (selectedTime === "evening") {
    return hour >= 18 && hour < 21;
  }
  if (selectedTime === "latenight") {
    return hour >= 21;
  }

  return true;
}

function getEventMinPrice(event) {
  if (event.priceRanges && event.priceRanges.length) {
    const p = event.priceRanges[0];
    if (typeof p.min === "number") return p.min;
  }
  return null;
}

function matchesPriceFilter(event) {
  if (selectedPrice === "any") return true;

  const min = getEventMinPrice(event);
  if (min == null) return false; // no info, be conservative

  if (selectedPrice === "free") {
    return min === 0;
  }
  if (selectedPrice === "under20") {
    return min > 0 && min <= 20;
  }
  if (selectedPrice === "under50") {
    return min > 0 && min <= 50;
  }

  return true;
}

function applyAdvancedFilters(events) {
  return events.filter((event) => {
    if (!matchesGenreFilter(event)) return false;
    if (!matchesTimeFilter(event)) return false;
    if (!matchesPriceFilter(event)) return false;
    return true;
  });
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
  const dateStr = dateInput.value || ""; // "YYYY-MM-DD" or ""

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
    const events = await fetchEvents(city, stateCode);

    if (!events.length) {
      statusEl.textContent = "No events found. Try another city.";
      resultsSummary.textContent = `No events for ${city}, ${stateCode}.`;
      renderEvents([]);
      return;
    }

    // 1) Only small venues
    let filtered = events.filter(isSmallVenueEvent);

    // 2) Date filter (client-side)
    if (dateStr) {
      filtered = filtered.filter((event) => {
        const eventDate = getEventLocalDate(event);
        return eventDate === dateStr;
      });
    }

    // 3) Advanced filters (genre, time, price)
    filtered = applyAdvancedFilters(filtered);

    if (!filtered.length) {
      if (dateStr) {
        statusEl.textContent =
          "No shows match those filters on that date. Try adjusting filters or clearing the date.";
        resultsSummary.textContent = `No small-venue shows for ${city}, ${stateCode} that match your filters on that date.`;
      } else {
        statusEl.textContent =
          "No shows match those filters. Try adjusting your filters.";
        resultsSummary.textContent = `No small-venue shows for ${city}, ${stateCode} that match your filters.`;
      }
      renderEvents([]);
      return;
    }

    statusEl.textContent = `Found ${filtered.length} small-venue show(s).`;
    resultsSummary.textContent = `Showing small-venue music events for ${city}, ${stateCode}${
      dateStr ? " on your selected date" : ""
    } with your filters applied.`;
    renderEvents(filtered);
  } catch (err) {
    console.error("🔥 Error loading shows:", err);
    statusEl.textContent =
      err.message || "We couldn't load shows right now. Please try again in a moment.";
    resultsSummary.textContent = "Error loading events from Ticketmaster.";
  }
}

// Button + Enter key
searchBtn.addEventListener("click", handleSearch);

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
