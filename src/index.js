export default {
  fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  },
};

async function getRdapData(ip, noCache = false) {
  const cache = caches.default;
  // Create a proper Request object for the cache key
  const cacheKey = new Request(`https://rdap-cache/${ip}`);

  // Check cache first
  if (!noCache) {
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      return await cachedResponse.json();
    }
  }

  // If not in cache or cache bypassed, fetch from RDAP
  try {
    const rdapResponse = await fetch(`https://rdap.org/ip/${ip}`);
    if (!rdapResponse.ok) {
      throw new Error(`RDAP lookup failed: ${rdapResponse.status}`);
    }

    const rdapJson = await rdapResponse.json();
    const rdapData = {
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
      timestamp: new Date().toISOString(),
    };

    // Cache the formatted RDAP data
    if (!noCache) {
      await cache.put(
        cacheKey,
        new Response(JSON.stringify(rdapData), {
          headers: {
            "content-type": "application/json",
            "cache-control": "public, max-age=1209600", // 2 weeks
          },
        }),
      );
    }

    return rdapData;
  } catch (error) {
    return {
      error: "Failed to fetch RDAP data",
      message: error.message,
    };
  }
}

async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  const clientIP = request.headers.get("cf-connecting-ip");
  const noCache = url.searchParams.has("nocache");

  // Handle cache invalidation requests
  if (request.method === "POST" && url.pathname === "/invalidate") {
    try {
      const { ip } = await request.json();
      const cache = caches.default;
      const cacheKey = new Request(`https://rdap-cache/${ip || clientIP}`);
      await cache.delete(cacheKey);
      return new Response(`Cache invalidated for IP: ${ip || clientIP}`, {
        status: 200,
      });
    } catch (error) {
      return new Response("Invalid request body", { status: 400 });
    }
  }

  // Basic Cloudflare data available immediately
  const cfData = {
    ip: clientIP,
    asn: request.cf.asn,
    isp: request.cf.asOrganization,
    country: request.cf.country,
    city: request.cf.city,
    region: request.cf.region,
    colo: request.cf.colo,
    timezone: request.cf.timezone,
  };

  // Return based on endpoint
  switch (url.pathname) {
    case "/ip":
      return new Response(clientIP, {
        headers: { "content-type": "text/plain" },
      });

    case "/isp":
      return new Response(cfData.isp || "Unknown ISP", {
        headers: { "content-type": "text/plain" },
      });

    default: {
      // Only fetch RDAP data for full response
      const rdapData = await getRdapData(clientIP, noCache);

      // Get abuse contact if available
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

      const responseData = {
        ...cfData,
        rdap: rdapData,
        abuseContact,
        timestamp: new Date().toISOString(),
      };

      return new Response(JSON.stringify(responseData, null, 2), {
        headers: {
          "content-type": "application/json",
          "access-control-allow-origin": "*",
        },
      });
    }
  }
}
