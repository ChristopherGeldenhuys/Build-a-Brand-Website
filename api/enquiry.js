// Vercel serverless function: receives Black Friday enquiries and emails them via Gmail SMTP.
// Required environment variables (set in Vercel → Project → Settings → Environment Variables):
//   GMAIL_USER          full Gmail address used to send
//   GMAIL_APP_PASSWORD  16-character Google App Password (no spaces)
//   LEAD_TO_EMAIL       (optional) where leads go; defaults to GMAIL_USER

const nodemailer = require('nodemailer');

const MAX_LEN = 500;

function clean(value) {
  return String(value == null ? '' : value).trim().slice(0, MAX_LEN);
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const user = process.env.GMAIL_USER;
  const pass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  const to = process.env.LEAD_TO_EMAIL || user;

  if (!user || !pass) {
    console.error('Missing GMAIL_USER or GMAIL_APP_PASSWORD environment variables');
    return res.status(500).json({ ok: false, error: 'Email not configured' });
  }

  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    return res.status(400).json({ ok: false, error: 'Invalid request' });
  }

  const data = {
    fullName: clean(body.fullName),
    businessName: clean(body.businessName),
    email: clean(body.email),
    whatsapp: clean(body.whatsapp),
    websiteType: clean(body.websiteType),
    websiteUrl: clean(body.websiteUrl),
    utm_source: clean(body.utm_source),
    utm_medium: clean(body.utm_medium),
    utm_campaign: clean(body.utm_campaign),
    utm_content: clean(body.utm_content),
    utm_term: clean(body.utm_term),
  };

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email);
  if (!data.fullName || !data.businessName || !emailOk || !data.whatsapp || !data.websiteType) {
    return res.status(400).json({ ok: false, error: 'Missing or invalid fields' });
  }

  const submitted = new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' });

  const rows = [
    ['Name', data.fullName],
    ['Business', data.businessName],
    ['Email', data.email],
    ['WhatsApp', data.whatsapp],
    ['Website type', data.websiteType],
    ['Current website', data.websiteUrl || '—'],
    ['Submitted', submitted],
    ['UTM source', data.utm_source || '—'],
    ['UTM medium', data.utm_medium || '—'],
    ['UTM campaign', data.utm_campaign || '—'],
    ['UTM content (ad)', data.utm_content || '—'],
    ['UTM term', data.utm_term || '—'],
  ];

  const text = 'New Black Friday enquiry (R3,500 website special)\n\n' +
    rows.map(([k, v]) => `${k}: ${v}`).join('\n');

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#1E1430;max-width:560px">
      <h2 style="margin:0 0 4px">New Black Friday enquiry</h2>
      <p style="margin:0 0 16px;color:#5A4F6B">R3,500 website special</p>
      <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:14px">
        ${rows.map(([k, v]) => `
          <tr>
            <td style="border-bottom:1px solid #E9E9EC;color:#5A4F6B;width:160px">${escapeHtml(k)}</td>
            <td style="border-bottom:1px solid #E9E9EC"><strong>${escapeHtml(v)}</strong></td>
          </tr>`).join('')}
      </table>
      <p style="margin-top:16px;font-size:13px;color:#5A4F6B">Hit Reply to answer ${escapeHtml(data.fullName)} directly.</p>
    </div>`;

  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass },
  });

  try {
    await transporter.sendMail({
      from: `"Build a Brand Website" <${user}>`,
      to,
      replyTo: `"${data.fullName.replace(/"/g, '')}" <${data.email}>`,
      subject: `New Black Friday enquiry: ${data.businessName} (${data.fullName})`,
      text,
      html,
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Gmail send failed:', err && err.message);
    return res.status(502).json({ ok: false, error: 'Could not send email' });
  }
};
