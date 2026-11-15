/**
 * Embedded offline HTTP server for the DayStaff kiosk.
 *
 * The native phone verifier and the silent attendance/pairing callbacks are
 * served directly from the kiosk over the local Wi-Fi network, so no public
 * internet host is required.
 */
import * as Network from 'expo-network';
import TcpSocket from 'react-native-tcp-socket';

export const KIOSK_SERVER_PORT = 8080;

type KioskServerHandlers = {
  onPair: ((payload: any) => Promise<any>) | null;
  onAttend: ((payload: any) => Promise<any>) | null;
};

const handlers: KioskServerHandlers = {
  onPair: null,
  onAttend: null,
};

let server: any = null;
let currentUrl = '';

export function setKioskServerHandlers(next: Partial<KioskServerHandlers>): void {
  if (next.onPair !== undefined) {
    handlers.onPair = next.onPair;
  }
  if (next.onAttend !== undefined) {
    handlers.onAttend = next.onAttend;
  }
}

export function getKioskServerUrl(): string {
  return currentUrl || `http://127.0.0.1:${KIOSK_SERVER_PORT}/`;
}

export function isPrivateKioskUrl(value: string): boolean {
  const match = value.trim().match(/^https?:\/\/([^/:?#]+)/i);
  if (!match) return false;
  const host = match[1].toLowerCase();
  if (host === 'localhost') return true;
  if (/^127\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  const m = host.match(/^172\.(\d+)\./);
  if (m) {
    const octet = Number(m[1]);
    if (octet >= 16 && octet <= 31) return true;
  }
  return false;
}

export async function startKioskServer(): Promise<string> {
  if (server) {
    return getKioskServerUrl();
  }

  const ip = await Network.getIpAddressAsync();
  const host = ip && ip !== '0.0.0.0' ? ip : '127.0.0.1';
  currentUrl = `http://${host}:${KIOSK_SERVER_PORT}/`;

  server = TcpSocket.createServer((socket: any) => {
    let buffer = '';

    const send = (status: number, body: string, type = 'text/plain; charset=utf-8') => {
      const response =
        `HTTP/1.1 ${status} ${status === 200 ? 'OK' : 'ERROR'}\r\n` +
        `Content-Type: ${type}\r\n` +
        `Content-Length: ${body.length}\r\n` +
        `Connection: close\r\n` +
        `Access-Control-Allow-Origin: *\r\n\r\n` +
        body;
      socket.write(response);
      socket.end();
    };

    socket.on('data', (chunk: any) => {
      buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');

      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) {
        return;
      }

      const head = buffer.slice(0, headerEnd);
      const lines = head.split('\r\n');
      const requestLine = lines[0] || '';
      const [method, path] = requestLine.split(' ');
      const headers: Record<string, string> = {};
      for (const line of lines.slice(1)) {
        const index = line.indexOf(':');
        if (index > 0) {
          headers[line.slice(0, index).toLowerCase()] = line.slice(index + 1).trim();
        }
      }

      const contentLength = Number(headers['content-length'] || 0);
      const bodyStart = headerEnd + 4;
      if (buffer.length < bodyStart + contentLength) {
        return;
      }

      const body = buffer.slice(bodyStart, bodyStart + contentLength);

      if (method === 'GET') {
        const queryIndex = path.indexOf('?');
        const queryString = queryIndex >= 0 ? path.slice(queryIndex + 1) : '';
        const deepLink = `daystaff://verify${queryString ? `?${queryString}` : ''}`;
        const html =
          `<!DOCTYPE html><html><head><meta charset="utf-8" />` +
          `<meta name="viewport" content="width=device-width,initial-scale=1" />` +
          `<title>DayStaff verification</title></head><body style="font-family:system-ui;background:#06142b;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px">` +
          `<main style="max-width:420px;width:100%;background:rgba(12,36,74,.85);border-radius:18px;padding:24px;text-align:center">` +
          `<h1>DayStaff verification</h1>` +
          `<p>Opening the DayStaff app…</p>` +
          `<p><a href="${deepLink}" style="display:inline-block;padding:12px 20px;border-radius:12px;background:#1e6bff;color:#fff;font-weight:700;text-decoration:none">Open in DayStaff app</a></p>` +
          `<p style="color:#a9bce0;font-size:13px">If nothing happens, open the DayStaff app on your phone and tap "Scan kiosk code".</p>` +
          `</main><script>try{window.location.replace(${JSON.stringify(deepLink)});}catch(e){}</script></body></html>`;
        send(200, html, 'text/html; charset=utf-8');
        return;
      }

      if (method === 'POST' && path === '/api/pair') {
        void (async () => {
          try {
            const payload = JSON.parse(body || '{}');
            const result = handlers.onPair ? await handlers.onPair(payload) : { ok: false, error: 'Pairing unavailable.' };
            send(200, JSON.stringify(result), 'application/json; charset=utf-8');
          } catch (error) {
            send(400, JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Invalid pairing request.' }), 'application/json; charset=utf-8');
          }
        })();
        return;
      }

      if (method === 'POST' && path === '/api/attend') {
        void (async () => {
          try {
            const payload = JSON.parse(body || '{}');
            const result = handlers.onAttend ? await handlers.onAttend(payload) : { ok: false, error: 'Attendance unavailable.' };
            send(200, JSON.stringify(result), 'application/json; charset=utf-8');
          } catch (error) {
            send(400, JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Invalid attendance request.' }), 'application/json; charset=utf-8');
          }
        })();
        return;
      }

      send(404, JSON.stringify({ ok: false, error: 'Not found.' }), 'application/json; charset=utf-8');
    });

    socket.on('error', () => {
      try {
        socket.destroy();
      } catch {
        // Ignore socket errors.
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.listen({ port: KIOSK_SERVER_PORT, host: '0.0.0.0', reuseAddress: true }, () => resolve());
    server.on('error', (error: Error) => reject(error));
  });

  return currentUrl;
}

export function stopKioskServer(): void {
  if (server) {
    try {
      server.close();
    } catch {
      // Ignore close errors.
    }
    server = null;
  }
}
