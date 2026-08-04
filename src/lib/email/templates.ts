const BASE_URL = "https://techlympics.my";

export const EMAIL_HEADER_HTML = `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0;padding:0;">
  <tr>
    <td align="center" style="background:linear-gradient(135deg,#3b0764 0%,#5b21b6 55%,#7c3aed 100%);padding:0;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
        <tr>
          <td align="center" style="padding:36px 40px 28px;">
            <img src="${BASE_URL}/logos-white/mt-logo-white.svg"
                 alt="Malaysia Techlympics"
                 width="180" height="auto"
                 style="display:block;height:auto;max-width:180px;margin:0 auto;" />
            <div style="margin-top:18px;width:56px;height:3px;background:linear-gradient(90deg,#f59e0b,#fbbf24);border-radius:2px;margin-left:auto;margin-right:auto;"></div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td align="center" style="background:#f5f3ff;padding:0;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
        <tr>
          <td style="padding:0 0 0 0;height:4px;background:linear-gradient(90deg,#7c3aed,#a78bfa,#7c3aed);"></td>
        </tr>
      </table>
    </td>
  </tr>
</table>
`.trim();

export const EMAIL_FOOTER_HTML = `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0;padding:0;">
  <tr>
    <td align="center" style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:0;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
        <tr>
          <td align="center" style="padding:32px 40px 12px;">
            <img src="${BASE_URL}/logo-mt.svg"
                 alt="Malaysia Techlympics"
                 width="120" height="auto"
                 style="display:block;height:auto;max-width:120px;margin:0 auto;opacity:0.65;" />
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 40px 8px;">
            <p style="margin:0;font-family:sans-serif;font-size:13px;font-weight:600;color:#374151;letter-spacing:0.05em;">MALAYSIA TECHLYMPICS</p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 40px 12px;">
            <p style="margin:0;font-family:sans-serif;font-size:11px;color:#9ca3af;line-height:1.6;">
              Aras 15, Menara MDEC, MSC Malaysia Headquarters,<br/>
              2310, Jalan Usahawan, 63000 Cyberjaya, Selangor, Malaysia
            </p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 40px 12px;">
            <p style="margin:0;font-family:sans-serif;font-size:11px;color:#9ca3af;">
              <a href="${BASE_URL}" style="color:#7c3aed;text-decoration:none;font-weight:500;">techlympics.my</a>
              &nbsp;&nbsp;·&nbsp;&nbsp;
              <a href="mailto:info@techlympics.my" style="color:#7c3aed;text-decoration:none;font-weight:500;">info@techlympics.my</a>
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 40px 0;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-family:sans-serif;font-size:10px;color:#d1d5db;text-align:center;padding-bottom:24px;">
              © 2025 Malaysia Techlympics. All rights reserved.<br/>
              You are receiving this email because you registered as a contingent manager.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
`.trim();

export function buildEmailHtml(bodyHtml: string, includeHeader: boolean, includeFooter: boolean): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<title>Malaysia Techlympics</title>
</head>
<body style="margin:0;padding:0;background:#ede9fe;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ede9fe;padding:24px 0;">
  <tr>
    <td align="center">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(91,33,182,0.10);">
        <tr><td>${includeHeader ? EMAIL_HEADER_HTML : ""}</td></tr>
        <tr>
          <td style="padding:32px 40px;font-family:Arial,sans-serif;font-size:15px;line-height:1.7;color:#1f2937;">
            ${bodyHtml}
          </td>
        </tr>
        <tr><td>${includeFooter ? EMAIL_FOOTER_HTML : ""}</td></tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
