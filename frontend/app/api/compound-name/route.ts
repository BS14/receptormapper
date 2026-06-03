// This route is intentionally left minimal.
// The compound name lookup calls PubChem directly from the browser
// (see SMILESInput.tsx and SubmissionInfoCard.tsx) because PubChem
// supports CORS and Node.js undici TLS has issues on Alpine Docker.
//
// If you ever need server-side lookup, switch to node:20-debian in
// the frontend Dockerfile or add: RUN apk add --no-cache ca-certificates

export function GET() {
  return new Response(JSON.stringify({ name: null }), {
    headers: { "Content-Type": "application/json" },
  });
}
