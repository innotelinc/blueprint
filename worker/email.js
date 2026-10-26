// Outbound email.
//
// The platform never requires an email provider: with no credentials configured
// every send is recorded in "capture mode" so the double opt-in flow, the
// confirmation links and the CSV exports can be tested end to end without a
// vendor account. Configure one to actually deliver.
//
// Never log a key, a token or a full request body here.

const PROVIDERS = {
  resend: {
    label: 'Resend',
    configured: (env) => Boolean(env.RESEND_API_KEY && env.EMAIL_FROM),
    send: async (env, message, fetchImpl) => {
      const response = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: env.EMAIL_FROM,
          to: [message.to],
          subject: message.subject,
          html: message.html,
          text: message.text,
          reply_to: message.replyTo || undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      return { ok: response.ok, status: response.status, id: data.id, error: response.ok ? null : data.message || 'send failed' };
    },
  },
  postmark: {
    label: 'Postmark',
    configured: (env) => Boolean(env.POSTMARK_SERVER_TOKEN && env.EMAIL_FROM),
    send: async (env, message, fetchImpl) => {
      const response = await fetchImpl('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: { 'x-postmark-server-token': env.POSTMARK_SERVER_TOKEN, 'content-type': 'application/json' },
        body: JSON.stringify({
          From: env.EMAIL_FROM,
          To: message.to,
          Subject: message.subject,
          HtmlBody: message.html,
          TextBody: message.text,
          ReplyTo: message.replyTo || undefined,
          MessageStream: 'outbound',
        }),
      });
      const data = await response.json().catch(() => ({}));
      return { ok: response.ok, status: response.status, id: data.MessageID, error: response.ok ? null : data.Message || 'send failed' };
    },
  },
  plunk: {
    label: 'Plunk',
    configured: (env) => Boolean(env.PLUNK_API_KEY && env.EMAIL_FROM),
    send: async (env, message, fetchImpl) => {
      const response = await fetchImpl('https://api.useplunk.com/v1/send', {
        method: 'POST',
        headers: { authorization: `Bearer ${env.PLUNK_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ to: message.to, subject: message.subject, body: message.html, from: env.EMAIL_FROM }),
      });
      return { ok: response.ok, status: response.status, error: response.ok ? null : 'send failed' };
    },
  },
};

export function describeProvider(env) {
  const key = String(env.EMAIL_PROVIDER || '').toLowerCase();
  const provider = PROVIDERS[key];
  if (!provider) {
    return { key: null, label: 'Capture mode', configured: false, note: 'No provider selected. Subscribers and confirmations are stored, not delivered.' };
  }
  const configured = provider.configured(env);
  return {
    key,
    label: provider.label,
    configured,
    note: configured
      ? `${provider.label} is configured and will deliver mail.`
      : `${provider.label} selected but missing credentials. Check the worker secrets.`,
  };
}

/**
 * Send an email, or explain why it was not sent.
 * @returns {Promise<{delivered: boolean, provider: string|null, reason?: string, id?: string}>}
 */
export async function sendEmail(env, message, options = {}) {
  const info = describeProvider(env);
  if (!info.key || !info.configured) {
    return { delivered: false, provider: info.key, reason: info.configured ? 'no-provider' : 'not-configured' };
  }
  const fetchImpl = options.fetchImpl || fetch;
  try {
    const result = await PROVIDERS[info.key].send(env, message, fetchImpl);
    return { delivered: Boolean(result.ok), provider: info.key, id: result.id || undefined, reason: result.ok ? undefined : result.error };
  } catch {
    return { delivered: false, provider: info.key, reason: 'network-error' };
  }
}

/** Confirmation email for the double opt-in flow. */
export function confirmEmail({ projectName, confirmUrl, brandColor = '#2563eb' }) {
  return {
    subject: `Confirm your subscription to ${projectName}`,
    text: `Almost there.\n\nConfirm your subscription to ${projectName} by opening this link:\n${confirmUrl}\n\nIf you did not sign up, ignore this email — nothing else will be sent.`,
    html: `<!doctype html><html><body style="margin:0;background:#f6f7f9;padding:32px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#111">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:32px;border:1px solid #e6e8ec">
  <h1 style="font-size:20px;margin:0 0 12px">Confirm your subscription</h1>
  <p style="color:#555;line-height:1.6;margin:0 0 20px">One click and you are on the list for ${escapeText(projectName)}. We send one useful email a month — no drip campaign.</p>
  <p style="margin:0 0 24px"><a href="${confirmUrl}" style="display:inline-block;background:${brandColor};color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">Confirm subscription</a></p>
  <p style="color:#888;font-size:13px;line-height:1.6;margin:0">If the button does not work, paste this into your browser:<br><span style="word-break:break-all">${confirmUrl}</span></p>
  <p style="color:#888;font-size:13px;margin:16px 0 0">Did not sign up? Ignore this email and nothing will be sent to you again.</p>
</div></body></html>`,
  };
}

/** Notification for the founder when a contact form arrives. */
export function leadNotification({ projectName, lead, adminUrl }) {
  return {
    subject: `New enquiry for ${projectName}${lead.name ? ` from ${lead.name}` : ''}`,
    text: `${lead.name || 'Someone'} (${lead.email}) wrote:\n\n${lead.message}\n\nOpen the inbox: ${adminUrl}`,
    html: `<!doctype html><html><body style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#111;line-height:1.6">
<h2 style="font-size:18px;margin:0 0 12px">New enquiry for ${escapeText(projectName)}</h2>
<p style="margin:0 0 6px"><strong>${escapeText(lead.name || 'Unknown')}</strong> &lt;${escapeText(lead.email)}&gt;</p>
${lead.company ? `<p style="margin:0 0 6px;color:#555">Company: ${escapeText(lead.company)}</p>` : ''}
<p style="margin:16px 0;padding:16px;background:#f6f7f9;border-radius:10px;white-space:pre-wrap">${escapeText(lead.message)}</p>
<p style="margin:0"><a href="${adminUrl}">Open the inbox</a></p>
</body></html>`,
  };
}

function escapeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
