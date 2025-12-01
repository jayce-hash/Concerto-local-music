// functions/local-events.js

exports.handler = async (event) => {
  try {
    const apiKey = process.env.TICKETMASTER_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing TICKETMASTER_API_KEY env var" }),
      };
    }

    const params = event.queryStringParameters || {};
    const lat = params.lat;
    const lng = params.lng;
    const radius = params.radius || "20"; // miles (default 20)
    const startDateTime = params.startDateTime; // ISO 8601
    const endDateTime = params.endDateTime;     // ISO 8601

    if (!lat || !lng) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "lat and lng are required" }),
      };
    }

    const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
    url.searchParams.set("apikey", apiKey);
    url.searchParams.set("latlong", `${lat},${lng}`);
    url.searchParams.set("radius", radius);
    url.searchParams.set("unit", "miles");
    url.searchParams.set("classificationName", "Music");
    url.searchParams.set("size", "100");
    url.searchParams.set("sort", "date,asc");

    if (startDateTime) url.searchParams.set("startDateTime", startDateTime);
    if (endDateTime) url.searchParams.set("endDateTime", endDateTime);

    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Ticketmaster error:", res.status, text);
      return {
        statusCode: res.status,
        body: JSON.stringify({ error: "Ticketmaster API error", details: text }),
      };
    }

    const data = await res.json();
    const rawEvents =
      data._embedded && Array.isArray(data._embedded.events)
        ? data._embedded.events
        : [];

    const events = rawEvents.map((ev) => {
      const venue =
        ev._embedded &&
        ev._embedded.venues &&
        ev._embedded.venues[0];

      const image =
        ev.images && ev.images.length
          ? ev.images[0]
          : null;

      const priceRange =
        ev.priceRanges && ev.priceRanges.length
          ? ev.priceRanges[0]
          : null;

      return {
        id: ev.id,
        name: ev.name,
        description: ev.info || ev.pleaseNote || "",
        time_start:
          ev.dates &&
          ev.dates.start &&
          (ev.dates.start.dateTime || ev.dates.start.localDate),
        url: ev.url,
        image_url: image ? image.url : null,
        venue: venue
          ? {
              name: venue.name,
              address1: venue.address && venue.address.line1,
              city: venue.city && venue.city.name,
              state: venue.state && venue.state.stateCode,
              country: venue.country && venue.country.countryCode,
            }
          : null,
        price_min: priceRange && priceRange.min,
        price_max: priceRange && priceRange.max,
      };
    });

    // 🧹 Try to remove big tours / massive venues
    const bigVenuePattern =
      /(stadium|arena|coliseum|ballpark|speedway|raceway|amphitheatre|amphitheater|field|dome|center|centre)$/i;

    const filtered = events.filter((ev) => {
      if (!ev.venue || !ev.venue.name) return true;
      const name = ev.venue.name.trim();
      return !bigVenuePattern.test(name);
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ events: filtered }),
    };
  } catch (err) {
    console.error("Server error", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error", details: err.message }),
    };
  }
};
