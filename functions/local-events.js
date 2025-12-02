// netlify/functions/local-events.js

const TM_API_KEY = process.env.TM_API_KEY; // set this in Netlify env

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

exports.handler = async (event) => {
  // Handle preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: "",
    };
  }

  try {
    const qs = event.queryStringParameters || {};
    const city = qs.city;
    const state = qs.state;
    const startUnix = qs.start_date;
    const endUnix = qs.end_date;

    if (!TM_API_KEY) {
      console.error("TM_API_KEY not set");
      return {
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Server not configured" }),
      };
    }

    if (!city || !state || !startUnix || !endUnix) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Missing city, state, or date range" }),
      };
    }

    const startIso = new Date(Number(startUnix) * 1000).toISOString();
    const endIso = new Date(Number(endUnix) * 1000).toISOString();

    const tmUrl = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
    tmUrl.searchParams.set("apikey", TM_API_KEY);
    tmUrl.searchParams.set("city", city);
    tmUrl.searchParams.set("stateCode", state);
    tmUrl.searchParams.set("countryCode", "US");
    tmUrl.searchParams.set("startDateTime", startIso);
    tmUrl.searchParams.set("endDateTime", endIso);
    tmUrl.searchParams.set("sort", "date,asc");
    tmUrl.searchParams.set("size", "100");

    const tmRes = await fetch(tmUrl.toString());
    if (!tmRes.ok) {
      const text = await tmRes.text();
      console.error("Ticketmaster error:", tmRes.status, text);
      return {
        statusCode: 502,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Ticketmaster API error" }),
      };
    }

    const tmData = await tmRes.json();
    const rawEvents = tmData._embedded?.events || [];

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

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ events }),
    };
  } catch (err) {
    console.error("local-events error:", err);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: "Internal server error" }),
    };
  }
};
