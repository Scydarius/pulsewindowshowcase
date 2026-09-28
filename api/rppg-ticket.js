import { createHmac, randomUUID } from "node:crypto";

function base64Url(value) { return Buffer.from(value).toString("base64url"); }

export default function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ error: "Method not allowed" });
  const apiUrl = process.env.RPPG_API_URL;
  const secret = process.env.RPPG_TICKET_SECRET;
  if (!apiUrl || !secret) return response.status(503).json({ error: "The live demo is not configured yet." });
  const sessionId = `showcase-${randomUUID().replaceAll("-", "")}`;
  const encodedPayload = base64Url(JSON.stringify({ aud: "pulsewindow-rppg", appointment_id: "public-showcase", role: "showcase", session_id: sessionId, exp: Math.floor(Date.now() / 1000) + 120, jti: randomUUID() }));
  const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  const ticket = `${encodedPayload}.${signature}`;
  const websocketBase = apiUrl.replace(/^https:/, "wss:").replace(/^http:/, "ws:").replace(/\/$/, "");
  return response.status(200).json({ websocketUrl: `${websocketBase}/api/v1/stream?session_id=${encodeURIComponent(sessionId)}&ticket=${encodeURIComponent(ticket)}&algorithm=POS&fps=30` });
}
