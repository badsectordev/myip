# myip

A Cloudflare Worker that provides IP address information, including RDAP data and ISP details.

This documentation assumes you will want to deploy your own to Cloudflare account,
but the worker is deployed at [https://myip.badsector.dev](https://myip.badsector.dev) for anyone to use.

## Features

- Get client IP address in plain text
- Get ISP name in plain text
- Live Cloudflare data (IP, ISP, location)
- Cached RDAP lookups with 2-week expiration
- Cache invalidation options

## API Endpoints

### GET /ip
Returns the client's IP address in plain text.

```bash
curl https://your-worker.dev/ip
```

### GET /isp
Returns the client's ISP name in plain text.

```bash
curl https://your-worker.dev/isp
```

### GET /
Returns detailed JSON information including:
- IP address (live)
- ASN (live)
- ISP (live)
- Geographic location (live)
- RDAP data (cached)
- Abuse contact info

```bash
curl https://your-worker.dev/
```

## Caching Behavior

The worker only caches RDAP (Registration Data Access Protocol) lookups, as these are external API calls. All Cloudflare data (IP, ISP, location) is always fresh from the request.

### Cache Duration
- RDAP data is cached for 2 weeks
- All other data is live

### Cache Management Options

1. **Query Parameter - `?nocache`**
```bash
curl https://your-worker.dev/?nocache
```
- Bypasses the RDAP cache for a single request
- Forces fresh RDAP lookup
- Doesn't affect future requests

2. **Invalidate Cache for an IP**
```bash
curl -X POST https://your-worker.dev/invalidate \
  -H "Content-Type: application/json" \
  -d '{"ip": "8.8.8.8"}'
```
- Removes cached RDAP data for specific IP
- Forces next request to fetch fresh RDAP data

3. **Natural Expiration**
- RDAP cache entries automatically expire after 2 weeks
- No manual intervention needed

### Implementation Details
- Cache keys format: `rdap:${ip}`
- Caches stored in Cloudflare's Edge Cache
- Only RDAP responses are cached
- All other data is real-time from Cloudflare

## Development

1. Install dependencies:
```bash
npm install
```

2. Run locally:
```bash
npm run dev
```

3. Deploy:
```bash
npm run deploy
```

## Example Workflow

1. First request for an IP fetches and caches RDAP data
2. Subsequent requests use cached RDAP data
3. Use `?nocache` when testing or verifying RDAP data
4. Use `/invalidate` when you need to force fresh RDAP data for an IP
5. All Cloudflare data is always fresh

## License

MIT
