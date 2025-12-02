// netlify/functions/local-events.js

// Make sure this is set in Netlify → Site Settings → Environment variables
// TM_API_KEY = your Ticketmaster API key
const TM_API_KEY = process.env.TM_API_KEY;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

exports.handler = async (event) => {
  // --- Handle CORS preflight ---
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: "",
    };
  }

  try {
    const qs = event.queryStringParameters || {};
    const city = (qs.city || "").trim();
    const state = (qs.state || qs.stateCode || "").trim(); // allow either key
    const startUnixRaw = qs.start_date;
    const endUnixRaw = qs.end_date;

    if (!TM_API_KEY) {
      console.error("[local-events] TM_API_KEY not set in environment");
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Server not configured" }),
      };
    }

    // Basic validation
    if (!city || !state || !startUnixRaw || !endUnixRaw) {
      console.warn("[local-events] Missing required params", {
        city,
        state,
        startUnixRaw,
        endUnixRaw,
      });
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: "Missing city, state, or date range",
          details: { city, state, start_date: startUnixRaw, end_date: endUnixRaw },
        }),
      };
    }

    const startUnix = Number.parseInt(startUnixRaw, 10);
    const endUnix = Number.parseInt(endUnixRaw, 10);

    if (Number.isNaN(startUnix) || Number.isNaN(endUnix)) {
      console.warn("[local-events] Invalid Unix timestamps", {
        startUnixRaw,
        endUnixRaw,
      });
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({
          error: "Invalid start_date or end_date. Must be Unix seconds.",
        }),
      };
    }

    const startIso = new Date(startUnix * 1000).toISOString();
    const endIso = new Date(endUnix * 1000).toISOString();

    // --- Build Ticketmaster URL ---
    const tmUrl = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
    tmUrl.searchParams.set("apikey", TM_API_KEY);
    tmUrl.searchParams.set("city", city);
    tmUrl.searchParams.set("stateCode", state);
    tmUrl.searchParams.set("countryCode", "US");
    tmUrl.searchParams.set("startDateTime", startIso);
    tmUrl.searchParams.set("endDateTime", endIso);
    tmUrl.searchParams.set("sort", "date,asc");
    tmUrl.searchParams.set("size", "100");

    console.log("[local-events] Requesting Ticketmaster events", {
      city,
      state,
      startIso,
      endIso,
      url: tmUrl.toString(),
    });

    const tmRes = await fetch(tmUrl.toString());
    if (!tmRes.ok) {
      const text = await tmRes.text();
      console.error(
        "[local-events] Ticketmaster error",
        tmRes.status,
        tmRes.statusText,
        text
      );
      return {
        statusCode: 502,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Ticketmaster API error" }),
      };
    }

    const tmData = await tmRes.json();
    const rawEvents = tmData._embedded?.events || [];

    // --- Normalize into the shape your front-end expects ---
    const events = rawEvents.map((ev) => {
      const venue = ev._embedded?.venues?.[0] || {};
      const images = ev.images || [];
      const img = images.find((i) => i.url) || {};
      const priceRanges = ev.priceRanges || [];
      const pr = priceRanges[0] || {};

      return {
        id: ev.id,
        name: ev.name,
        description: ev.info || ev.pleaseNote || "",
        time_start: ev.dates?.start?.dateTime || null,
        url: ev.url || null,
        image_url: img.url || null,
        venue: {
          name: venue.name || "",
          address1: venue.address?.line1 || "",
          city: venue.city?.name || "",
          state: venue.state?.stateCode || "",
          country: venue.country?.countryCode || "",
        },
        price_min: pr.min ?? null,
        price_max: pr.max ?? null,
      };
    });

    // Extra safety: sort by date in case Ticketmaster doesn’t
    events.sort((a, b) => {
      const ta = a.time_start ? Date.parse(a.time_start) : 0;
      const tb = b.time_start ? Date.parse(b.time_start) : 0;
      return ta - tb;
    });

    console.log(`[local-events] Returning ${events.length} events`);

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ events }),
    };
  } catch (err) {
    console.error("[local-events] Internal error", err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
