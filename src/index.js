export default {
  fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  },
};

async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const clientIP = request.headers.get("cf-connecting-ip");

  // Return plain text IP if /ip endpoint is used
  if (url.pathname === "/ip") {
    return new Response(clientIP, {
      headers: {
        "content-type": "text/plain",
        "cache-control": "public, max-age=1209600",
      },
    });
  }

  // Return plain text ISP if /isp endpoint is used
  if (url.pathname === "/isp") {
    return new Response(request.cf.asOrganization || "Unknown ISP", {
      headers: {
        "content-type": "text/plain",
        "cache-control": "public, max-age=1209600",
      },
    });
  }

  // Handle cache invalidation requests
  if (request.method === "POST" && url.pathname === "/invalidate") {
    try {
      const { ip } = await request.json();
      const cache = caches.default;

      if (ip) {
        // Invalidate specific IP
        const cacheKey = new Request(new URL("/", request.url), {
          headers: { "CF-Connecting-IP": ip },
        });
        await cache.delete(cacheKey);
        return new Response(`Cache invalidated for IP: ${ip}`, { status: 200 });
      } else {
        // Invalidate all by updating timestamp
        const newTimestamp = Date.now();
        ctx.waitUntil(cache.delete(request.url));
        return new Response("All caches invalidated", {
          status: 200,
          headers: {
            "Cache-Timestamp": newTimestamp.toString(),
          },
        });
      }
    } catch (error) {
      return new Response("Invalid request body", { status: 400 });
    }
  }

  // Check if we have a cache-busting parameter
  const noCache = url.searchParams.has("nocache");

  // If cached response exists and no cache-busting, return it
  if (!noCache) {
    const cacheKey = new Request(request.url, {
      method: "GET",
      headers: { "CF-Connecting-IP": clientIP },
    });
    const cache = caches.default;
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      return cachedResponse;
    }
  }

  // Perform RDAP lookup
  let rdapData = {};
  try {
    const rdapResponse = await fetch(`https://rdap.org/ip/${clientIP}`);
    if (rdapResponse.ok) {
      const rdapJson = await rdapResponse.json();

      rdapData = {
        name: rdapJson.name || null,
        type: rdapJson.type || null,
        handle: rdapJson.handle || null,
        startAddress: rdapJson.startAddress || null,
        endAddress: rdapJson.endAddress || null,
        entities:
          rdapJson.entities?.map((entity) => ({
            name:
              entity.vcardArray?.[1]?.find((item) => item[0] === "fn")?.[3] ||
              entity.handle,
            roles: entity.roles || [],
            handle: entity.handle || null,
          })) || [],
        remarks:
          rdapJson.remarks?.map((remark) => remark.description).flat() || [],
      };
    }
  } catch (error) {
    rdapData = {
      error: "Failed to fetch RDAP data",
      message: error.message,
    };
  }

  // Try to get abuse contact information if available
  let abuseContact = null;
  try {
    const abuseEntity = rdapData.entities?.find((entity) =>
      entity.roles?.includes("abuse"),
    );
    if (abuseEntity) {
      abuseContact = abuseEntity.name;
    }
  } catch (error) {
    console.error("Error extracting abuse contact:", error);
  }

  // Build response data
  const responseData = {
    ip: clientIP,
    asn: request.cf.asn,
    isp: request.cf.asOrganization,
    country: request.cf.country,
    city: request.cf.city,
    region: request.cf.region,
    colo: request.cf.colo,
    timezone: request.cf.timezone,
    rdap: rdapData,
    abuseContact,
    timestamp: new Date().toISOString(),
  };

  // Create response with caching headers
  const response = new Response(JSON.stringify(responseData, null, 2), {
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=1209600", // 2 weeks in seconds
      etag: `"${clientIP}-${responseData.timestamp}"`,
    },
  });

  // Store in cache
  if (!noCache) {
    const cacheKey = new Request(request.url, {
      method: "GET",
      headers: { "CF-Connecting-IP": clientIP },
    });
    const cache = caches.default;
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
  }

  return response;
}
