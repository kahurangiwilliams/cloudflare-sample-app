import http from 'http';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

dotenv.config({ path: '.dev.vars' });

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3000/callback';
const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly';

// Step 1: Generate the URL to send the user to Google's login page
const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
  `client_id=${CLIENT_ID}&` +
  `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
  `response_type=code&` +
  `scope=${encodeURIComponent(SCOPES)}&` +
  `access_type=offline&` +
  `prompt=consent`;

console.log('Opening browser for Google authorisation...');
console.log('If browser does not open, visit this URL manually:');
console.log(authUrl);

// Step 2: Start a temporary local server to catch Google's callback
const server = http.createServer(async (req, res) => {
  if (req.url.startsWith('/callback')) {
    const url = new URL(req.url, 'http://localhost:3000');
    const code = url.searchParams.get('code');

    if (!code) {
      res.end('No code received. Something went wrong.');
      return;
    }

    console.log('Authorisation code received. Exchanging for tokens...');

    // Step 3: Exchange the code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenResponse.json();

    if (tokens.error) {
      console.error('Error getting tokens:', tokens.error);
      res.end('Error getting tokens. Check terminal.');
      server.close();
      return;
    }

    console.log('\n✅ SUCCESS! Your refresh token is:');
    console.log(tokens.refresh_token);
    console.log('\nAdd this to your .dev.vars file as:');
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
    console.log('\nAnd upload to Cloudflare with:');
    console.log('npx wrangler secret put GOOGLE_REFRESH_TOKEN');

    res.end('Success! You can close this tab and return to your terminal.');
    server.close();
  }
});

server.listen(3000, () => {
  console.log('Waiting for Google callback on http://localhost:3000/callback');
  // Try to open the browser automatically
  import('child_process').then(({ exec }) => {
    exec(`start "" "${authUrl}"`);
  });
});