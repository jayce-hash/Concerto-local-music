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
    const radius = params.radius ? Number(params.radius) : 20; // miles
    const startSec = params.start_date ? Number(params.start_date) : null;
    const endSec = params.end_date ? Number(params.end_date) : null;

    if (!lat || !lng) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "lat and lng are required" }),
      };
    }

    const searchParams = new URLSearchParams();
    searchParams.set("apikey", apiKey);
    searchParams.set("latlong", `${lat},${lng}`);
    searchParams.set("radius", radius.toString());
    searchParams.set("unit", "miles");
    searchParams.set("classificationName", "Music");
    searchParams.set("size", "100");
    searchParams.set("sort", "date,asc");

    if (startSec) {
      const iso = new Date(startSec * 1000).toISOString();
      searchParams.set("startDateTime", iso);
    }
    if (endSec) {
      const iso = new Date(endSec * 1000).toISOString();
      searchParams.set("endDateTime", iso);
    }

    const url = `https://app.ticketmaster.com/discovery/v2/events.json?${searchParams.toString()}`;

    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      console.error("Ticketmaster error:", res.status, text);
      return {
        statusCode: res.status,
        body: JSON.stringify({ error: "Ticketmaster API error", details: text }),
      };
    }

    const body = await res.json();
    const tmEvents = body?._embedded?.events || [];

    const events = tmEvents.map((ev) => {
      const venue =
        ev._embedded && ev._embedded.venues && ev._embedded.venues[0]
          ? ev._embedded.venues[0]
          : null;

      const image =
        Array.isArray(ev.images) && ev.images.length ? ev.images[0].url : null;

      const price =
        Array.isArray(ev.priceRanges) && ev.priceRanges[0]
          ? ev.priceRanges[0]
          : null;

      const dates = ev.dates && ev.dates.start;
      const timeStart =
        (dates && (dates.dateTime || dates.dateTBD || dates.localDate)) || null;

      return {
        id: ev.id,
        name: ev.name,
        description: ev.info || ev.pleaseNote || "",
        time_start: timeStart,
        url: ev.url,
        image_url: image,
        venue: venue
          ? {
              name: venue.name,
              address1: venue.address && venue.address.line1,
              city: venue.city && venue.city.name,
              state: venue.state && venue.state.stateCode,
              country: venue.country && venue.country.countryCode,
            }
          : null,
        price_min: price ? price.min : null,
        price_max: price ? price.max : null,
      };
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ events }),
    };
  } catch (err) {
    console.error("Server error", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error", details: err.message }),
    };
  }
};
