import { describe, it, expect } from 'vitest';
import { buildReadyMessage, buildChannelUrl } from './notify-message';

describe('buildReadyMessage', () => {
  it('interpolates customer name and order number', () => {
    expect(buildReadyMessage('Λεπτή Κήπων', 'ORD-2026-056')).toBe(
      'Γεια σας Λεπτή Κήπων, η παραγγελία σας ORD-2026-056 είναι έτοιμη και μπορείτε να την παραλάβετε από τα Φυτώρια μας. Ευχαριστούμε!',
    );
  });

  it('omits the name when it is empty', () => {
    expect(buildReadyMessage('', 'ORD-2026-056')).toBe(
      'Γεια σας, η παραγγελία σας ORD-2026-056 είναι έτοιμη και μπορείτε να την παραλάβετε από τα Φυτώρια μας. Ευχαριστούμε!',
    );
  });
});

describe('buildChannelUrl', () => {
  const phone = '+35799123456';
  const msg = 'Γεια σας';

  it('builds a Viber deep-link with +-encoded number and no text', () => {
    expect(buildChannelUrl('VIBER', phone, msg)).toBe('viber://chat?number=%2B35799123456');
  });

  it('builds a wa.me link with the number sans + and an encoded text', () => {
    expect(buildChannelUrl('WHATSAPP', phone, msg)).toBe(
      'https://wa.me/35799123456?text=' + encodeURIComponent(msg),
    );
  });

  it('builds an iOS sms link with &body=', () => {
    expect(buildChannelUrl('SMS', phone, msg, false)).toBe(
      'sms:+35799123456&body=' + encodeURIComponent(msg),
    );
  });

  it('builds an Android sms link with ?body=', () => {
    expect(buildChannelUrl('SMS', phone, msg, true)).toBe(
      'sms:+35799123456?body=' + encodeURIComponent(msg),
    );
  });
});
