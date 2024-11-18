# myip

A Cloudflare Worker that provides IP address information, including RDAP data and ISP details.

## Features

- Get client IP address in plain text or detailed JSON format
- RDAP (Registration Data Access Protocol) lookup
- ISP and location information from Cloudflare
- Built-in caching with 2-week expiration
- Cache invalidation endpoints

## API Endpoints

### GET /ip
Returns the client's IP address in plain text.

```bash
curl https://your-worker.dev/ip
```

### GET /
Returns detailed JSON information about the client's IP address, including:
- IP address
- ASN
- ISP
- Geographic location
- RDAP data
- Abuse contact

```bash
curl https://your-worker.dev/
```

### POST /invalidate
Invalidate the cache for a specific IP or all caches.

Invalidate specific IP:
```bash
curl -X POST https://your-worker.dev/invalidate \
  -H "Content-Type: application/json" \
  -d '{"ip": "8.8.8.8"}'
```

Invalidate all caches:
```bash
curl -X POST https://your-worker.dev/invalidate \
  -H "Content-Type: application/json" \
  -d '{}'
```

### Query Parameters

- `nocache`: Force a cache refresh
  ```bash
  curl https://your-worker.dev/?nocache
  ```

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

## License

MIT
