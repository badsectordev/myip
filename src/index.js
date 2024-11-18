export default {
  fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  },
};

async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const clientIP = request.headers.get("cf-connecting-ip");
  const noCache = url.searchParams.has("nocache");

  // Handle cache invalidation requests
  if (request.method === "POST" && url.pathname === "/invalidate") {
    try {
      const { ip } = await request.json();
      const cache = caches.default;

      if (ip) {
        // Create cache key based on IP only
        const cacheKey = `ip-data:${ip}`;
        await cache.delete(cacheKey);
        return new Response(`Cache invalidated for IP: ${ip}`, { status: 200 });
      } else {
        // For complete invalidation, we'll still just use the current IP
        // as we can't enumerate or bulk delete from the cache
        const cacheKey = `ip-data:${clientIP}`;
        await cache.delete(cacheKey);
        return new Response("Cache invalidated", { status: 200 });
      }
    } catch (error) {
      return new Response("Invalid request body", { status: 400 });
    }
  }

  // Check cache for this IP
  let ipData = null;
  if (!noCache) {
    const cache = caches.default;
    const cacheKey = `ip-data:${clientIP}`;
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      ipData = await cachedResponse.json();
    }
  }

  // If no cached data, fetch everything
  if (!ipData) {
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

    // Build complete data object
    ipData = {
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

    // Store in cache
    if (!noCache) {
      const cache = caches.default;
      const cacheKey = `ip-data:${clientIP}`;
      await cache.put(
        cacheKey,
        new Response(JSON.stringify(ipData), {
          headers: {
            "content-type": "application/json",
            "cache-control": "public, max-age=1209600",
          },
        }),
      );
    }
  }

  // Return response based on endpoint
  switch (url.pathname) {
    case "/ip":
      return new Response(ipData.ip, {
        headers: {
          "content-type": "text/plain",
          "cache-control": "public, max-age=1209600",
        },
      });

    case "/isp":
      return new Response(ipData.isp || "Unknown ISP", {
        headers: {
          "content-type": "text/plain",
          "cache-control": "public, max-age=1209600",
        },
      });

    default:
      return new Response(JSON.stringify(ipData, null, 2), {
        headers: {
          "content-type": "application/json",
          "access-control-allow-origin": "*",
          "cache-control": "public, max-age=1209600",
        },
      });
  }
}
