// QRZ.com API Lookup Function
// Cloudflare Pages Function - receives POST with callsign, returns operator info

let sessionKey = null;
let sessionExpiry = 0;

async function getSessionKey(env) {
  // Check if we have a valid session
  if (sessionKey && Date.now() < sessionExpiry) {
    return sessionKey;
  }

  const username = env.QRZ_USERNAME;
  const password = env.QRZ_PASSWORD;

  if (!username || !password) {
    throw new Error('QRZ credentials not configured');
  }

  const loginUrl = `https://xmldata.qrz.com/xml/current/?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;

  const response = await fetch(loginUrl);
  const xml = await response.text();

  // Parse session key from XML response
  const keyMatch = xml.match(/<Key>([^<]+)<\/Key>/);
  if (!keyMatch) {
    const errorMatch = xml.match(/<Error>([^<]+)<\/Error>/);
    throw new Error(errorMatch ? errorMatch[1] : 'Failed to authenticate with QRZ.com');
  }

  sessionKey = keyMatch[1];
  // Session valid for 24 hours, refresh after 23
  sessionExpiry = Date.now() + (23 * 60 * 60 * 1000);

  return sessionKey;
}

async function lookupCallsign(callsign, env) {
  const key = await getSessionKey(env);

  const lookupUrl = `https://xmldata.qrz.com/xml/current/?s=${key}&callsign=${encodeURIComponent(callsign)}`;

  const response = await fetch(lookupUrl);
  const xml = await response.text();

  // Check for errors
  const errorMatch = xml.match(/<Error>([^<]+)<\/Error>/);
  if (errorMatch) {
    // Session expired, clear and retry once
    if (errorMatch[1].includes('Session') || errorMatch[1].includes('Invalid session')) {
      sessionKey = null;
      sessionExpiry = 0;
      const newKey = await getSessionKey(env);
      const retryUrl = `https://xmldata.qrz.com/xml/current/?s=${newKey}&callsign=${encodeURIComponent(callsign)}`;
      const retryResponse = await fetch(retryUrl);
      const retryXml = await retryResponse.text();
      return parseCallsignData(retryXml, callsign);
    }
    throw new Error(errorMatch[1]);
  }

  return parseCallsignData(xml, callsign);
}

function parseCallsignData(xml, callsign) {
  const getValue = (tag) => {
    const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
    return match ? match[1] : '';
  };

  const fname = getValue('fname');
  const name = getValue('name');
  const addr1 = getValue('addr1');
  const addr2 = getValue('addr2');
  const state = getValue('state');
  const zip = getValue('zip');
  const country = getValue('country');
  const lat = getValue('lat');
  const lon = getValue('lon');

  // Build full name
  const fullName = [fname, name].filter(Boolean).join(' ');

  // Build address
  const addressParts = [addr1, addr2, state, zip, country].filter(Boolean);
  const address = addressParts.join(', ');

  return {
    callsign: callsign.toUpperCase(),
    name: fullName,
    address: address,
    lat: lat ? parseFloat(lat) : null,
    lon: lon ? parseFloat(lon) : null
  };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // CORS headers
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };

  try {
    const body = await request.json();
    const { callsign } = body;

    if (!callsign || typeof callsign !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Callsign is required' }),
        { status: 400, headers }
      );
    }

    const data = await lookupCallsign(callsign.trim(), env);

    return new Response(JSON.stringify(data), { headers });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers }
    );
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
