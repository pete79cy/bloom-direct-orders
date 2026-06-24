export type NotifyChannel = 'VIBER' | 'WHATSAPP' | 'SMS';

/**
 * Default "order ready" message. Greeting drops the name gracefully when it's
 * empty (e.g. unknown customer) so we never produce "Γεια σας ,".
 */
export function buildReadyMessage(customerName: string, orderNumber: string): string {
  const name = (customerName || '').trim();
  const greeting = name ? `Γεια σας ${name}` : 'Γεια σας';
  return `${greeting}, η παραγγελία σας ${orderNumber} είναι έτοιμη και μπορείτε να την παραλάβετε από τα Φυτώρια μας. Ευχαριστούμε!`;
}

/**
 * Builds the per-channel deep-link.
 * - Viber CANNOT pre-fill text → URL carries only the number; caller copies
 *   the message to the clipboard separately.
 * - WhatsApp wants the number WITHOUT a leading + (wa.me/35799…).
 * - SMS pre-fills body; iOS uses &body=, Android uses ?body=.
 */
export function buildChannelUrl(
  channel: NotifyChannel,
  phoneE164: string,
  message: string,
  isAndroid = false,
): string {
  const digits = phoneE164.replace(/\D/g, ''); // e.g. "35799123456"
  const enc = encodeURIComponent(message);
  switch (channel) {
    case 'VIBER':
      return `viber://chat?number=%2B${digits}`;
    case 'WHATSAPP':
      return `https://wa.me/${digits}?text=${enc}`;
    case 'SMS':
      return isAndroid ? `sms:+${digits}?body=${enc}` : `sms:+${digits}&body=${enc}`;
  }
}
