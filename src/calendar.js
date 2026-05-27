/**
 * Google Calendar integration for Shaq
 * Fetches today's events using OAuth2
 */

// Step 1: Get a fresh access token using our stored refresh token
// Access tokens expire after 1 hour - refresh tokens last indefinitely
async function getAccessToken(env) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(`Failed to get access token: ${data.error}`);
  }

  return data.access_token;
}

// Step 2: Fetch today's calendar events
export async function getTodaysEvents(env) {
  const accessToken = await getAccessToken(env);

  // Get start and end of today in NZT (UTC+12)
  // We calculate this by getting current UTC time and adjusting
  const now = new Date();
  
  // NZT is UTC+12 (UTC+13 during daylight saving)
  // For simplicity we use UTC+12 as the base offset
  const nztOffset = 12 * 60 * 60 * 1000;
  const nztNow = new Date(now.getTime() + nztOffset);
  
  // Start of today in NZT
  const startOfDay = new Date(nztNow);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const startUtc = new Date(startOfDay.getTime() - nztOffset);
  
  // End of today in NZT
  const endOfDay = new Date(nztNow);
  endOfDay.setUTCHours(23, 59, 59, 999);
  const endUtc = new Date(endOfDay.getTime() - nztOffset);

  const params = new URLSearchParams({
    timeMin: startUtc.toISOString(),
    timeMax: endUtc.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
  });

  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  const data = await response.json();

  if (data.error) {
    throw new Error(`Failed to fetch calendar events: ${data.error.message}`);
  }

  return data.items || [];
}