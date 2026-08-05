/** SMS OTP via MSG91 (paid). Safe no-op until MSG91_AUTHKEY + MSG91_TEMPLATE_ID are set. */
export async function sendOtpSms(phone: string, code: string): Promise<void> {
  const authkey = process.env.MSG91_AUTHKEY;
  const template_id = process.env.MSG91_TEMPLATE_ID;
  if (!authkey || !template_id) { console.log(`[SMS not configured] OTP ${code} would go to ${phone}`); return; }
  const digits = phone.replace(/[^0-9]/g, '');
  const mobiles = digits.length === 10 ? '91' + digits : digits;
  try {
    const r = await fetch('https://control.msg91.com/api/v5/flow/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authkey },
      body: JSON.stringify({ template_id, recipients: [{ mobiles, OTP: code }] }),
    });
    if (!r.ok) console.error('MSG91 responded', r.status, await r.text());
  } catch (e) { console.error('MSG91 send failed', e); }
}
