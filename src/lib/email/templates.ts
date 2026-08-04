const BASE_URL = "https://techlympics.my";

// bgcolor attributes are required for Outlook and Gmail which don't support CSS gradients.
// For clients that do support gradients, the style= attribute overrides bgcolor.

export const EMAIL_HEADER_HTML = `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0;padding:0;">
  <tr>
    <td align="center" bgcolor="#5b21b6" style="background:#5b21b6;background:linear-gradient(135deg,#3b0764 0%,#5b21b6 55%,#7c3aed 100%);padding:0;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
        <tr>
          <td align="center" style="padding:36px 40px 28px;">
            <img src="${BASE_URL}/logos-white/mt-logo-white.svg"
                 alt="Malaysia Techlympics"
                 width="180" height="60"
                 style="display:block;height:auto;max-width:180px;margin:0 auto;border:0;" />
            <div style="margin-top:18px;">
              <table cellpadding="0" cellspacing="0" border="0" align="center">
                <tr>
                  <td width="56" height="3" bgcolor="#f59e0b" style="background:#f59e0b;height:3px;border-radius:2px;font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td height="4" bgcolor="#7c3aed" style="background:#7c3aed;height:4px;padding:0;font-size:0;line-height:0;">&nbsp;</td>
  </tr>
</table>
`.trim();

export const EMAIL_FOOTER_HTML = `
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0;padding:0;">
  <tr>
    <td align="center" bgcolor="#f9fafb" style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:0;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">
        <tr>
          <td align="center" style="padding:32px 40px 12px;">
            <img src="${BASE_URL}/logo-mt.svg"
                 alt="Malaysia Techlympics"
                 width="120" height="40"
                 style="display:block;height:auto;max-width:120px;margin:0 auto;border:0;opacity:0.7;" />
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 40px 6px;">
            <p style="margin:0;font-family:Arial,sans-serif;font-size:13px;font-weight:bold;color:#374151;letter-spacing:1px;">MALAYSIA TECHLYMPICS</p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 40px 10px;">
            <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:#9ca3af;line-height:1.6;">
              Aras 15, Menara MDEC, MSC Malaysia Headquarters,<br/>
              2310, Jalan Usahawan, 63000 Cyberjaya, Selangor, Malaysia
            </p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:0 40px 12px;">
            <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:#9ca3af;">
              <a href="${BASE_URL}" style="color:#7c3aed;text-decoration:none;font-weight:bold;">techlympics.my</a>
              &nbsp;&nbsp;·&nbsp;&nbsp;
              <a href="mailto:info@techlympics.my" style="color:#7c3aed;text-decoration:none;font-weight:bold;">info@techlympics.my</a>
            </p>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:14px 40px 24px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-family:Arial,sans-serif;font-size:10px;color:#d1d5db;line-height:1.6;">
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

export function buildEmailHtml(bodyHtml: string, includeHeader = true, includeFooter = true): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<meta http-equiv="X-UA-Compatible" content="IE=edge"/>
<meta name="x-apple-disable-message-reformatting"/>
<title>Malaysia Techlympics</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#ede9fe;font-family:Arial,sans-serif;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ede9fe" style="background-color:#ede9fe;">
  <tr>
    <td align="center" style="padding:24px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="max-width:600px;width:100%;background-color:#ffffff;">
        ${includeHeader ? `<tr><td style="padding:0;">${EMAIL_HEADER_HTML}</td></tr>` : ""}
        <tr>
          <td style="padding:32px 40px;font-family:Arial,sans-serif;font-size:15px;line-height:1.7;color:#1f2937;">
            ${bodyHtml}
          </td>
        </tr>
        ${includeFooter ? `<tr><td style="padding:0;">${EMAIL_FOOTER_HTML}</td></tr>` : ""}
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}
