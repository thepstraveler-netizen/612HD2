-- Phase 7: baseline delivery zones, settings, flags and templates. Idempotent;
-- everything here is admin-editable (Admin → Food & Essentials / Medicine,
-- Settings → Delivery).

insert into public.settings (key, value, is_public, description) values
  ('delivery.defaults',
   '{"require_delivery_otp": true, "cod_enabled": true, "max_cod_paise": 300000, "hold_minutes": 15, "delivery_tax_bps": 1800, "delivery_sac": "996813", "food_sac": "996331", "goods_sac": "996211", "quote_valid_hours": 24, "max_items": 30, "cancel_until": "placed", "medicine_notice": {"en": "Medicines are supplied only by licensed partner pharmacies against a valid prescription from a registered doctor. Prescription (Schedule H, H1 and X) drugs are never sold without one. Our pharmacist may call you to confirm the order. We do not dispense medicines ourselves.", "hi": "दवाइयाँ केवल लाइसेंसधारी पार्टनर फ़ार्मेसी द्वारा, पंजीकृत डॉक्टर के वैध पर्चे पर दी जाती हैं। पर्चे वाली (शेड्यूल H, H1 और X) दवाइयाँ बिना पर्चे के कभी नहीं बेची जातीं। ऑर्डर की पुष्टि के लिए हमारे फ़ार्मासिस्ट आपको कॉल कर सकते हैं। हम स्वयं दवाइयाँ नहीं देते।"}}',
   true,
   'Food, essentials and medicine delivery: delivery OTP, cash on delivery and its limit, payment hold, delivery fee GST and SAC codes, medicine quote validity, cart size, when customers may cancel, medicine compliance notice')
on conflict (key) do nothing;

insert into public.feature_flags (key, enabled, description) values
  ('booking.food', false, 'Food ordering open to customers (phase 7)'),
  ('booking.essentials', false, 'Essentials ordering open to customers (phase 7)'),
  ('booking.medicine', false, 'Prescription upload and medicine orders open to customers (phase 7)')
on conflict (key) do nothing;

insert into public.delivery_zones (slug, name, fee_paise, free_above_paise, eta_minutes, sort_order) values
  ('vrindavan', '{"en": "Vrindavan", "hi": "वृंदावन"}', 3000, 49900, 30, 1),
  ('mathura',   '{"en": "Mathura", "hi": "मथुरा"}',     4000, 79900, 45, 2),
  ('govardhan', '{"en": "Govardhan", "hi": "गोवर्धन"}', 6000, null,  60, 3),
  ('barsana',   '{"en": "Barsana", "hi": "बरसाना"}',    6000, null,  60, 4)
on conflict (slug) do nothing;

-- The header Food, Essentials and Medicine tabs now open the shops.
update public.navigation_links set href = '/food' where menu = 'header' and href = '/services/food';
update public.navigation_links set href = '/essentials' where menu = 'header' and href = '/services/essentials';
update public.navigation_links set href = '/medicine' where menu = 'header' and href = '/services/medicine';

insert into public.notification_templates (key, channel, locale, subject, body) values
  ('order.confirmed', 'email', 'en', 'Order placed · {{code}}',
   E'Namaste {{name}},\n\nYour order from {{store}} is placed.\nOrder ID: {{code}}\nItems: {{items}}\nDeliver to: {{address}}\nTotal: {{total}} · Paid: {{paid}} · Pay on delivery: {{balance}}\n\nShare delivery OTP {{otp}} with the rider when your order arrives.\nTrack your order: {{order_url}}\n\nThe P & S Traveler Group'),
  ('order.confirmed', 'email', 'hi', 'ऑर्डर हो गया · {{code}}',
   E'नमस्ते {{name}},\n\n{{store}} से आपका ऑर्डर हो गया है।\nऑर्डर आईडी: {{code}}\nसामान: {{items}}\nपता: {{address}}\nकुल: {{total}} · भुगतान: {{paid}} · डिलीवरी पर देना है: {{balance}}\n\nऑर्डर आने पर राइडर को डिलीवरी OTP {{otp}} बताएँ।\nअपना ऑर्डर देखें: {{order_url}}\n\nद पी एंड एस ट्रैवलर ग्रुप'),
  ('order.confirmed', 'sms', 'en', null,
   'P&S Traveler: order {{code}} from {{store}} placed. Delivery OTP {{otp}}. Track: {{order_url}}'),
  ('order.status', 'sms', 'en', null,
   'P&S Traveler: order {{code}} is {{status}}. {{order_url}}'),
  ('order.status', 'whatsapp', 'en', null,
   E'Namaste {{name}} 🙏 Your order *{{code}}* from {{store}} is *{{status}}*.\n{{order_url}}'),
  ('medicine.quoted', 'email', 'en', 'Your medicine quote · {{total}}',
   E'Namaste {{name}},\n\n{{store}} has checked your prescription and sent a quote of {{total}} for {{items}}.\nThe quote is valid until {{valid_until}}.\n\nReview and order: {{quote_url}}\n\nThe P & S Traveler Group'),
  ('medicine.quoted', 'email', 'hi', 'आपकी दवाइयों का कोटेशन · {{total}}',
   E'नमस्ते {{name}},\n\n{{store}} ने आपका पर्चा देखकर {{items}} के लिए {{total}} का कोटेशन भेजा है।\nयह {{valid_until}} तक मान्य है।\n\nदेखें और ऑर्डर करें: {{quote_url}}\n\nद पी एंड एस ट्रैवलर ग्रुप'),
  ('medicine.quoted', 'sms', 'en', null,
   'P&S Traveler: medicine quote {{total}} from {{store}}, valid till {{valid_until}}. Order: {{quote_url}}'),
  ('medicine.rejected', 'email', 'en', 'About your prescription',
   E'Namaste {{name}},\n\nWe could not fill your prescription: {{reason}}\nYou can upload a clearer or newer prescription at {{upload_url}}.\n\nThe P & S Traveler Group')
on conflict (key, channel, locale) do nothing;
