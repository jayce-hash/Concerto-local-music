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
const categoryFilters = document.getElementById("categoryFilters");

// Filter DOM groups
const musicGenreGroup = document.getElementById("musicGenreFilters");
const musicVenueGroup = document.getElementById("musicVenueFilters");
const sportsTypeGroup = document.getElementById("sportsTypeFilters");
const sportsLevelGroup = document.getElementById("sportsLevelFilters");
const comedyTypeGroup = document.getElementById("comedyTypeFilters");
const festivalTypeGroup = document.getElementById("festivalTypeFilters");
const theaterTypeGroup = document.getElementById("theaterTypeFilters");
const timeGroup = document.getElementById("timeFilters");
const priceGroup = document.getElementById("priceFilters");

// State
let selectedCategory = "music"; // "music" | "sports" | "comedy" | "festivals" | "theater"

const selectedMusicGenres = new Set();
let smallVenuesOnly = false;

const selectedSports = new Set();
let selectedSportsLevel = "any";

const selectedComedyTypes = new Set();
const selectedFestivalTypes = new Set();
const selectedTheaterTypes = new Set();

let selectedTime = "any";   // "any" | "afternoon" | "evening" | "latenight"
let selectedPrice = "any";  // "any" | "free" | "under20" | "under50"

const CATEGORY_LABELS = {
  music: "live music",
  sports: "sports",
  comedy: "comedy",
  festivals: "festivals",
  theater: "theater",
};

// Keyword maps
const GENRE_KEYWORDS = {
  pop: ["pop"],
  rock: ["rock"],
  hiphop: ["hip hop", "hip-hop", "rap"],
  rnb: ["r&b", "rnb", "soul"],
  country: ["country"],
  edm: ["edm", "electronic", "dance"],
  indie: ["indie", "alternative", "alt rock", "alt-pop", "alt pop"],
  jazz: ["jazz"],
  latin: ["latin"],
};

const SPORT_KEYWORDS = {
  basketball: ["basketball", "nba", "wnba", "ncaa", "march madness"],
  football: ["football", "nfl", "cfb", "ncaa football"],
  baseball: ["baseball", "mlb"],
  hockey: ["hockey", "nhl"],
  soccer: ["soccer", "mls", "premier league", "fc"],
};

const SPORTS_LEVEL_KEYWORDS = {
  pro: ["nba", "nfl", "mlb", "nhl", "mls", "premier league", "fc"],
  college: ["ncaa", "college", "university", "state university"],
};

const COMEDY_KEYWORDS = {
  standup: ["stand-up", "stand up", "standup"],
  improv: ["improv"],
  club: ["comedy club", "improv theatre", "improv theater"],
};

const FESTIVAL_KEYWORDS = {
  music: ["music festival", "fest", "music fest"],
  food: ["food festival", "wine festival", "beer festival", "bbq", "bbq festival", "brew fest"],
  cultural: ["fair", "carnival", "parade", "cultural festival"],
};

const THEATER_KEYWORDS = {
  musical: ["musical"],
  play: ["play", "drama"],
  family: ["family", "kids", "children"],
};

// ===== Helpers =====
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

// Small-venue heuristic (bars / clubs)
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

// Collect searchable text from event
function getEventTextBlob(event) {
  const chunks = [];
  if (event.name) chunks.push(event.name);
  if (event.info) chunks.push(event.info);
  if (event.description) chunks.push(event.description);
  if (event.pleaseNote) chunks.push(event.pleaseNote);
  const joined = chunks.join(" | ");
  return joined.toLowerCase();
}

// Event genres from classifications
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

// Event min price
function getEventMinPrice(event) {
  if (event.priceRanges && event.priceRanges.length) {
    const p = event.priceRanges[0];
    if (typeof p.min === "number") return p.min;
  }
  return null;
}

// ===== Category → Ticketmaster params =====
function getCategoryParams(category) {
  switch (category) {
    case "sports":
      return { segmentName: "Sports" };
    case "comedy":
      return { segmentName: "Arts & Theatre", keyword: "comedy" };
    case "festivals":
      return { keyword: "festival" };
    case "theater":
      return { segmentName: "Arts & Theatre" };
    case "music":
    default:
      return { segmentName: "Music" };
  }
}

// ===== Location suggestions (Ticketmaster venues) =====
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

// ===== More Filters toggle =====
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

// ===== Category selection =====
function updateCategoryFiltersVisibility() {
  const groups = document.querySelectorAll(".category-filters");
  groups.forEach((group) => {
    const cat = group.dataset.category;
    group.classList.toggle("active", cat === selectedCategory);
  });
}

categoryFilters.addEventListener("click", (e) => {
  const pill = e.target.closest(".pill");
  if (!pill) return;
  const cat = pill.dataset.cat;
  if (!cat) return;

  selectedCategory = cat;

  // update pill UI
  Array.from(categoryFilters.querySelectorAll(".pill")).forEach((p) =>
    p.classList.remove("active")
  );
  pill.classList.add("active");

  // show correct filter block
  updateCategoryFiltersVisibility();
});

// ===== Category-specific filter listeners =====

// Live music: genres (multi-select)
if (musicGenreGroup) {
  musicGenreGroup.addEventListener("click", (e) => {
    const pill = e.target.closest(".pill");
    if (!pill) return;
    const val = pill.dataset.genre;
    if (!val) return;

    if (selectedMusicGenres.has(val)) {
      selectedMusicGenres.delete(val);
      pill.classList.remove("active");
    } else {
      selectedMusicGenres.add(val);
      pill.classList.add("active");
    }
  });
}

// Live music: small venues only (toggle)
if (musicVenueGroup) {
  musicVenueGroup.addEventListener("click", (e) => {
    const pill = e.target.closest(".pill");
    if (!pill) return;
    if (!pill.dataset.smallVenues) return;

    smallVenuesOnly = !smallVenuesOnly;
    pill.classList.toggle("active", smallVenuesOnly);
  });
}

// Sports: type (multi-select)
if (sportsTypeGroup) {
  sportsTypeGroup.addEventListener("click", (e) => {
    const pill = e.target.closest(".pill");
    if (!pill) return;
    const val = pill.dataset.sport;
    if (!val) return;

    if (selectedSports.has(val)) {
      selectedSports.delete(val);
      pill.classList.remove("active");
    } else {
      selectedSports.add(val);
      pill.classList.add("active");
    }
  });
}

// Sports: level (single-select)
if (sportsLevelGroup) {
  sportsLevelGroup.addEventListener("click", (e) => {
    const pill = e.target.closest(".pill");
    if (!pill) return;
    const val = pill.dataset.level;
    if (!val) return;

    selectedSportsLevel = val;

    Array.from(sportsLevelGroup.querySelectorAll(".pill")).forEach((p) =>
      p.classList.remove("active")
    );
    pill.classList.add("active");
  });
}

// Comedy: type (multi-select)
if (comedyTypeGroup) {
  comedyTypeGroup.addEventListener("click", (e) => {
    const pill = e.target.closest(".pill");
    if (!pill) return;
    const val = pill.dataset.comedy;
    if (!val) return;

    if (selectedComedyTypes.has(val)) {
      selectedComedyTypes.delete(val);
      pill.classList.remove("active");
    } else {
      selectedComedyTypes.add(val);
      pill.classList.add("active");
    }
  });
}

// Festivals: type (multi-select)
if (festivalTypeGroup) {
  festivalTypeGroup.addEventListener("click", (e) => {
    const pill = e.target.closest(".pill");
    if (!pill) return;
    const val = pill.dataset.fest;
    if (!val) return;

    if (selectedFestivalTypes.has(val)) {
      selectedFestivalTypes.delete(val);
      pill.classList.remove("active");
    } else {
      selectedFestivalTypes.add(val);
      pill.classList.add("active");
    }
  });
}

// Theater: type (multi-select)
if (theaterTypeGroup) {
  theaterTypeGroup.addEventListener("click", (e) => {
    const pill = e.target.closest(".pill");
    if (!pill) return;
    const val = pill.dataset.theater;
    if (!val) return;

    if (selectedTheaterTypes.has(val)) {
      selectedTheaterTypes.delete(val);
      pill.classList.remove("active");
    } else {
      selectedTheaterTypes.add(val);
      pill.classList.add("active");
    }
  });
}

// Time (single-select)
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

// ===== Fetch events (no date params; date is filtered client-side) =====
async function fetchEvents(city, stateCode, category) {
  const baseParams = {
    apikey: API_KEY,
    city,
    stateCode,
    countryCode: "US",
    size: "100",
    sort: "date,asc",
  };

  Object.assign(baseParams, getCategoryParams(category));

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

// ===== Advanced filters =====
function matchesMusicGenre(event) {
  if (selectedMusicGenres.size === 0) return true;
  const eventGenres = getEventGenres(event);
  if (!eventGenres.length) return true;
  const lowered = eventGenres.join(" | ");
  for (const value of selectedMusicGenres) {
    const keywords = GENRE_KEYWORDS[value] || [];
    for (const kw of keywords) {
      if (lowered.includes(kw)) return true;
    }
  }
  return false;
}

function matchesSportType(event) {
  if (selectedSports.size === 0) return true;
  const text = getEventTextBlob(event);

  let matchesAnySelected = false;
  let matchesAnyDefinedSport = false;

  for (const [key, keywords] of Object.entries(SPORT_KEYWORDS)) {
    const matchedThis = keywords.some((kw) => text.includes(kw));
    if (matchedThis) {
      matchesAnyDefinedSport = true;
      if (selectedSports.has(key)) {
        matchesAnySelected = true;
      }
    }
  }

  if (selectedSports.has("other")) {
    if (!matchesAnyDefinedSport) return true;
  }

  return matchesAnySelected;
}

function matchesSportsLevel(event) {
  if (selectedSportsLevel === "any") return true;
  const text = getEventTextBlob(event);

  if (selectedSportsLevel === "pro") {
    return SPORTS_LEVEL_KEYWORDS.pro.some((kw) => text.includes(kw));
  }
  if (selectedSportsLevel === "college") {
    return SPORTS_LEVEL_KEYWORDS.college.some((kw) => text.includes(kw));
  }
  return true;
}

function matchesComedyType(event) {
  if (selectedComedyTypes.size === 0) return true;
  const text = getEventTextBlob(event);

  let matched = false;
  for (const [key, arr] of Object.entries(COMEDY_KEYWORDS)) {
    const any = arr.some((kw) => text.includes(kw));
    if (any && selectedComedyTypes.has(key)) {
      matched = true;
      break;
    }
  }
  return matched;
}

function matchesFestivalType(event) {
  if (selectedFestivalTypes.size === 0) return true;
  const text = getEventTextBlob(event);

  let matched = false;
  for (const [key, arr] of Object.entries(FESTIVAL_KEYWORDS)) {
    const any = arr.some((kw) => text.includes(kw));
    if (any && selectedFestivalTypes.has(key)) {
      matched = true;
      break;
    }
  }
  return matched;
}

function matchesTheaterType(event) {
  if (selectedTheaterTypes.size === 0) return true;
  const text = getEventTextBlob(event);

  let matched = false;
  for (const [key, arr] of Object.entries(THEATER_KEYWORDS)) {
    const any = arr.some((kw) => text.includes(kw));
    if (any && selectedTheaterTypes.has(key)) {
      matched = true;
      break;
    }
  }
  return matched;
}

// Time filter
function matchesTimeFilter(event) {
  if (selectedTime === "any") return true;

  const t = getEventLocalTime(event);
  if (!t) return true;
  const hour = parseInt(t.slice(0, 2), 10);
  if (Number.isNaN(hour)) return true;

  if (selectedTime === "afternoon") return hour < 18;
  if (selectedTime === "evening") return hour >= 18 && hour < 21;
  if (selectedTime === "latenight") return hour >= 21;
  return true;
}

// Price filter
function matchesPriceFilter(event) {
  if (selectedPrice === "any") return true;
  const min = getEventMinPrice(event);
  if (min == null) return false;

  if (selectedPrice === "free") return min === 0;
  if (selectedPrice === "under20") return min > 0 && min <= 20;
  if (selectedPrice === "under50") return min > 0 && min <= 50;
  return true;
}

function applyGenericFilters(events) {
  return events.filter(
    (event) => matchesTimeFilter(event) && matchesPriceFilter(event)
  );
}

function applyMusicFilters(events) {
  let out = events;
  if (!events.length) return out;
  out = out.filter(matchesMusicGenre);
  if (smallVenuesOnly) {
    out = out.filter(isSmallVenueEvent);
  }
  return out;
}

function applySportsFilters(events) {
  let out = events;
  if (!events.length) return out;
  out = out.filter(matchesSportType);
  out = out.filter(matchesSportsLevel);
  return out;
}

function applyComedyFilters(events) {
  let out = events;
  if (!events.length) return out;
  out = out.filter(matchesComedyType);
  return out;
}

function applyFestivalFilters(events) {
  let out = events;
  if (!events.length) return out;
  out = out.filter(matchesFestivalType);
  return out;
}

function applyTheaterFilters(events) {
  let out = events;
  if (!events.length) return out;
  out = out.filter(matchesTheaterType);
  return out;
}

// ===== Render events =====
function renderEvents(events) {
  eventsContainer.innerHTML = "";

  if (!events.length) {
    eventsContainer.innerHTML = `<p class="muted">No events matched your search.</p>`;
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

// ===== Search handler =====
async function handleSearch() {
  const rawLocation = locationInput.value.trim();
  const dateStr = dateInput.value || ""; // "YYYY-MM-DD" or ""

  const parsed = parseCityState(rawLocation);

  if (!parsed) {
    statusEl.textContent = "Please enter a city and 2-letter state (e.g. Austin, TX).";
    return;
  }

  const { city, stateCode } = parsed;
  const categoryLabel = CATEGORY_LABELS[selectedCategory] || "events";

  eventsContainer.innerHTML = "";
  statusEl.innerHTML = "";
  const spinner = document.createElement("div");
  spinner.className = "spinner";
  statusEl.appendChild(spinner);

  resultsSummary.textContent = "";

  try {
    const events = await fetchEvents(city, stateCode, selectedCategory);

    if (!events.length) {
      statusEl.textContent = "No events found. Try another city.";
      resultsSummary.textContent = `No ${categoryLabel} found for ${city}, ${stateCode}.`;
      renderEvents([]);
      return;
    }

    // 1) Date filter (client-side)
    let filtered = events;
    if (dateStr) {
      filtered = filtered.filter((event) => {
        const eventDate = getEventLocalDate(event);
        return eventDate === dateStr;
      });
    }

    // 2) Generic filters (time + price)
    filtered = applyGenericFilters(filtered);

    // 3) Category-specific filters
    switch (selectedCategory) {
      case "music":
        filtered = applyMusicFilters(filtered);
        break;
      case "sports":
        filtered = applySportsFilters(filtered);
        break;
      case "comedy":
        filtered = applyComedyFilters(filtered);
        break;
      case "festivals":
        filtered = applyFestivalFilters(filtered);
        break;
      case "theater":
        filtered = applyTheaterFilters(filtered);
        break;
      default:
        break;
    }

    if (!filtered.length) {
      if (dateStr) {
        statusEl.textContent =
          "No events match those filters on that date. Try adjusting your filters or clearing the date.";
        resultsSummary.textContent = `No ${categoryLabel} in ${city}, ${stateCode} match your filters on that date.`;
      } else {
        statusEl.textContent =
          "No events match those filters. Try adjusting your filters.";
        resultsSummary.textContent = `No ${categoryLabel} in ${city}, ${stateCode} match your filters.`;
      }
      renderEvents([]);
      return;
    }

    statusEl.textContent = `Found ${filtered.length} ${categoryLabel} event(s).`;
    resultsSummary.textContent = `Showing ${categoryLabel} for ${city}, ${stateCode}${
      dateStr ? " on your selected date" : ""
    } with your filters applied.`;
    renderEvents(filtered);
  } catch (err) {
    console.error("🔥 Error loading events:", err);
    statusEl.textContent =
      err.message || "We couldn't load events right now. Please try again in a moment.";
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

// Init correct filters block
updateCategoryFiltersVisibility();
