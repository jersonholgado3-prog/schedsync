// admin-reset.js
// Uses service account to get an OAuth2 access token, then calls
// Firebase Auth REST API to update any user's password.
// ADMIN-ONLY — only called from facultyprofile.js when role === 'admin'

const SA = {
  client_email: "firebase-adminsdk-fbsvc@schedsync-e60d0.iam.gserviceaccount.com",
  private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQDL8q+1D0O8eKAy\n+IzfLuzUTUTDeITmmAcVjkQO8+RcNC1FRt8kRRCMKtnnHPatbt80LWN9CiiNRBY2\nR80wxJZMsSh/jYREmnHqltLgI8rR/Wp89M8V6+6n112QL2bUg6f7f9V8sFGbEtNi\njOWVk2YdyfraBDbmYKMOe3A4vfEfhJO9Hci/UQDfVm3zmH45DRDfx/wzo1sTpByi\nHfLI6zPjqgK756qpPzKzE+e1Zci4C3/RvQNdf198X7jASTOSV2vc2+JwcQ+udeJF\noNGdvrC0jkDuTTjJ0EM9/PpbkE7TZ9DbVLXjcrrDB1KJ8T5nHeO2n7ekzx8af1xa\nt3bFRM7FAgMBAAECggEAWrPXfgxIYTk6cgDFUfriG/czVkWywYUqXWVUklvYm0Mf\nQRioY86NcfEa0OS6Nl7BSMjI3tLWPyFhSYm8UWyUtY3yh2vOP956PE0QgtuYN7Tf\nF6yers6raJzpARd7wZa97iWnshkOagvA1Cr6bf/MYgIynKRUMDgZPHccbTfYVV3K\nZx13nPpzy8h/iUb57F7fd7Z7Pyxn7+hU5bGOAYBjickihrWLQhn6+9HSA2bTc1Xr\ncYbVrA5tkhdM7sa9g/w1rdcEqrocj8IxxsOIfxjxmifxN3gj5qInNfVel53DcUa8\ncew4kxLIz0DwKV6t8oO7GdqidrFgJrL9D4dvvEBbXwKBgQD6dzCAk0zDos/zBmsF\nfT1bfAktPicIrbTIyosJJK0XTn8TqtDRJgKVZHR80ngdpW3/P5ZfJ3xvic3gS/YZ\nvfLtrEhOP3QPlPMvr4PkuiFFssjjqPpSsz8ywKjI1aTRAEPhQ8hhRWuIBhFVAcCX\n/OOC7DEbCT80XDPAkzs8B6d2ywKBgQDQdFxJXe91yPvh84BdqAUqJOgBp3+Emsx2\n2O1KSqVd5cUPGbs4E2uB399bPdhJbIRZWrRW3e/YikQI6STt6n5YSixl4lPnRCja\nkWTIbuiQwH1DmAYAu+kEOirVNQ74hYRjCGS6H1F7t7BU195N+9xo6zseCwSpEzFT\nrFu7zvKOrwKBgQD19qyL55ugF7hNOcVJq7bgq4s7gejFTgjWkok9XmYZGD4VK09L\nxR8OZIs8tVe+DWJbIq/iHB3ITzT9irtQhkgVfXW4Wfn4/1ZeQuesa9kW4D8Fy0Cg\njGSIy8g1ChGEKdV/V5hlZc3207abm0/uMiueu6JxoYAPRGiSOkQWbJHZRwKBgQDD\nWZi25MIpJq3uhQzyOCiG40lNa5QUSCF+6zINIkEw6sguq5WJKqHgd1XRIvcTcA/j\n0R4aHijMTF8P3rXOBKhcwz4ySNUKcRS8J+9D6rQmG04Iz2oou/DWFlDXt76M5ks3\np8EFr53kDDPCfv6FJJfc9z1SnU7DyAm8+VSKf5lOXwKBgQDGcdWZywOfNLkGJ699\nX+xvm+6+RtpZgUuFU1QSjbXN2JUwPlkQMeRUl+IViUn4SGHeGRZmgDWuxKEjIpgC\nTB0mYY7EP9wvySPkh3BbpoM1zJBcgSkvOdFj1PMidUGMjdw2Iy98yLovc2/SMCvl\nv4etlJQL4YV3Bmc4DzbBfu2y3g==\n-----END PRIVATE KEY-----\n",
  project_id: "schedsync-e60d0"
};

/** Base64url encode (no padding) */
function b64url(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlBytes(buf) {
  let bin = '';
  new Uint8Array(buf).forEach(b => bin += String.fromCharCode(b));
  return b64url(bin);
}

/** Sign a string with the RSA private key using WebCrypto */
async function rsaSign(message, pemKey) {
  const pemBody = pemKey.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  const der = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'pkcs8', der.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );
  const enc = new TextEncoder();
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(message));
  return b64urlBytes(sig);
}

/** Create a signed JWT for Google OAuth2 */
async function makeJWT() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({
    iss: SA.client_email,
    sub: SA.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.service.management https://www.googleapis.com/auth/identitytoolkit'
  }));
  const sig = await rsaSign(`${header}.${payload}`, SA.private_key);
  return `${header}.${payload}.${sig}`;
}

/** Exchange JWT for an access token */
async function getAccessToken() {
  const jwt = await makeJWT();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Failed to get access token: ' + JSON.stringify(data));
  return data.access_token;
}

/**
 * Reset a user's password using Firebase Auth REST API (Admin)
 * @param {string} uid - Firebase Auth UID
 * @param {string} newPassword
 */
export async function adminResetPassword(uid, newPassword) {
  const token = await getAccessToken();
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/projects/${SA.project_id}/accounts/${uid}`,
    {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ password: newPassword })
    }
  );
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data;
}
