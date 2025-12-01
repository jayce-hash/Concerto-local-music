// functions/local-events.js

exports.handler = async (event) => {
  try {
    const apiKey = process.env.YELP_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing YELP_API_KEY env var" }),
      };
    }

    const params = event.queryStringParameters || {};
    const lat = params.lat;
    const lng = params.lng;
    const radius = params.radius || 5000; // meters (5km default)
    const startDate = params.start_date;  // Unix timestamp (optional)
    const endDate = params.end_date;      // Unix timestamp (optional)

    if (!lat || !lng) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "lat and lng are required" }),
      };
    }

    const url = new URL("https://api.yelp.com/v3/events");
    url.searchParams.set("latitude", lat);
    url.searchParams.set("longitude", lng);
    url.searchParams.set("radius", radius);
    url.searchParams.set("categories", "music,festivals,arts");
    url.searchParams.set("limit", "30");

    if (startDate) url.searchParams.set("start_date", startDate);
    if (endDate) url.searchParams.set("end_date", endDate);

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Yelp error:", res.status, text);
      return {
        statusCode: res.status,
        body: JSON.stringify({ error: "Yelp API error", details: text }),
      };
    }

    const data = await res.json();

    const events = (data.events || []).map((ev) => ({
      id: ev.id,
      name: ev.name,
      description: ev.description || "",
      time_start: ev.time_start,
      time_end: ev.time_end,
      cost: ev.cost,
      cost_max: ev.cost_max,
      is_free: ev.is_free,
      category: ev.category,
      event_site_url: ev.event_site_url,
      image_url: ev.image_url,
      attending_count: ev.attending_count,
      location: ev.location
        ? {
            address1: ev.location.address1,
            city: ev.location.city,
            state: ev.location.state,
            zip_code: ev.location.zip_code,
          }
        : null,
    }));

    return {
      statusCode: 200,
      body: JSON.stringify({ events }),
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    };
  } catch (err) {
    console.error("Server error", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Server error", details: err.message }),
    };
  }
};
