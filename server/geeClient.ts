import crypto from 'node:crypto';

export interface GeeIntegrationStatus {
  configured: boolean;
  provider: 'Google Earth Engine REST API v1';
  dynamicWorldDataset: 'GOOGLE/DYNAMICWORLD/V1';
  sentinelDataset: 'COPERNICUS/S2_SR_HARMONIZED';
  landsatDataset: 'LANDSAT/LC08/C02/T1_L2';
  projectId: string | null;
  liveDynamicWorldActive: boolean;
  reason: string;
}

interface ServiceAccountCreds {
  client_email: string;
  private_key: string;
}

function parseServiceAccount(): ServiceAccountCreds | null {
  const raw = process.env.GEE_SERVICE_ACCOUNT_JSON;
  if (!raw || raw.trim().startsWith('MY_')) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.client_email && parsed.private_key) {
      return {
        client_email: String(parsed.client_email),
        private_key: String(parsed.private_key),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function getGeeAccessToken(): Promise<string | null> {
  const creds = parseServiceAccount();
  if (!creds) return null;

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const claim = Buffer.from(
    JSON.stringify({
      iss: creds.client_email,
      scope: 'https://www.googleapis.com/auth/earthengine.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    })
  ).toString('base64url');

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${header}.${claim}`);
  const signature = sign.sign(creds.private_key, 'base64url');
  const jwt = `${header}.${claim}.${signature}`;

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!resp.ok) return null;
  const json = (await resp.json()) as { access_token?: string };
  return json.access_token ?? null;
}

export async function checkGeeStatus(): Promise<GeeIntegrationStatus> {
  const projectId = process.env.GEE_PROJECT_ID || null;
  const creds = parseServiceAccount();

  if (!creds || !projectId) {
    return {
      configured: false,
      provider: 'Google Earth Engine REST API v1',
      dynamicWorldDataset: 'GOOGLE/DYNAMICWORLD/V1',
      sentinelDataset: 'COPERNICUS/S2_SR_HARMONIZED',
      landsatDataset: 'LANDSAT/LC08/C02/T1_L2',
      projectId,
      liveDynamicWorldActive: false,
      reason:
        'Live Google Earth Engine REST execution requires an Earth Engine-registered GCP service account (GEE_SERVICE_ACCOUNT_JSON and GEE_PROJECT_ID). Falling back transparently to public Copernicus Sentinel-2 L2A (10 m), USGS Landsat 8/9 C2 L2 (30 m), and Impact Observatory 10 m LULC (Dynamic World 9-class taxonomy) STAC archives.',
    };
  }

  try {
    const token = await getGeeAccessToken();
    if (!token) {
      return {
        configured: true,
        provider: 'Google Earth Engine REST API v1',
        dynamicWorldDataset: 'GOOGLE/DYNAMICWORLD/V1',
        sentinelDataset: 'COPERNICUS/S2_SR_HARMONIZED',
        landsatDataset: 'LANDSAT/LC08/C02/T1_L2',
        projectId,
        liveDynamicWorldActive: false,
        reason: 'Google Earth Engine OAuth2 token exchange failed for configured service account.',
      };
    }

    const ping = await fetch(
      `https://earthengine.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/assets/GOOGLE/DYNAMICWORLD/V1`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return {
      configured: true,
      provider: 'Google Earth Engine REST API v1',
      dynamicWorldDataset: 'GOOGLE/DYNAMICWORLD/V1',
      sentinelDataset: 'COPERNICUS/S2_SR_HARMONIZED',
      landsatDataset: 'LANDSAT/LC08/C02/T1_L2',
      projectId,
      liveDynamicWorldActive: ping.ok,
      reason: ping.ok
        ? 'Connected to Google Earth Engine REST API v1.'
        : `Earth Engine API responded with HTTP ${ping.status}; using STAC Sentinel-2 + Landsat + IO LULC fallback.`,
    };
  } catch (err) {
    return {
      configured: true,
      provider: 'Google Earth Engine REST API v1',
      dynamicWorldDataset: 'GOOGLE/DYNAMICWORLD/V1',
      sentinelDataset: 'COPERNICUS/S2_SR_HARMONIZED',
      landsatDataset: 'LANDSAT/LC08/C02/T1_L2',
      projectId,
      liveDynamicWorldActive: false,
      reason: err instanceof Error ? err.message : 'Unable to reach Earth Engine endpoint.',
    };
  }
}
