-- Phase 3: baseline settings and content for hotels. Idempotent.

-- Home page slot for featured hotels, after the services grid.
insert into public.cms_sections (page, key, type, title, subtitle, content, sort_order) values
  ('home', 'featured-hotels', 'featured_hotels',
   '{"en": "Stays near the temples", "hi": "मंदिरों के पास ठहरें"}',
   '{"en": "Hand-picked hotels, guest houses and ashrams in Vrindavan and Mathura.", "hi": "वृंदावन और मथुरा में चुने हुए होटल, गेस्ट हाउस और आश्रम।"}',
   '{"limit": 6}', 5)
on conflict (page, key) do nothing;

-- The header "Hotels" tab now opens the hotel listing.
update public.navigation_links
   set href = '/hotels'
 where menu = 'header' and href = '/services/hotel-vendors';

-- GST on accommodation by declared tariff per room per night (paise), from
-- 22 Sep 2025: up to ₹1,000 exempt; ₹1,001–7,500 at 5%; above ₹7,500 at 18%.
-- Admin-editable; lib/pricing/tax.ts picks the first slab whose max covers the tariff.
insert into public.settings (key, value, is_public, description) values
  ('tax.hotel_gst_slabs',
   '[{"max_tariff_paise": 100000, "rate_bps": 0}, {"max_tariff_paise": 750000, "rate_bps": 500}, {"max_tariff_paise": null, "rate_bps": 1800}]',
   true,
   'GST slabs for room tariffs (per room per night, paise). Last slab has no maximum.'),
  ('hotels.search_defaults',
   '{"city": "vrindavan", "page_size": 12, "max_nights": 30, "max_rooms": 8, "price_buckets_paise": [[0, 150000], [150000, 250000], [250000, 500000], [500000, null]], "landmark_radii_m": [500, 1000, 2000, 5000], "map_tiles": {"url": "https://tile.openstreetmap.org/{z}/{x}/{y}.png", "attribution": "© OpenStreetMap contributors"}}',
   true,
   'Defaults for the hotel search and listing')
on conflict (key) do nothing;

-- Amenities used by the hotel filters and detail page. Admin-editable rows;
-- `grouping` decides the heading they appear under.
insert into public.amenities (slug, name, icon, grouping, sort_order) values
  ('wifi',            '{"en": "Free Wi-Fi", "hi": "मुफ़्त वाई-फ़ाई"}',              'wifi',             'general',  1),
  ('ac',              '{"en": "Air conditioning", "hi": "एयर कंडीशनिंग"}',          'snowflake',        'room',     2),
  ('parking',         '{"en": "Parking", "hi": "पार्किंग"}',                         'square-parking',   'general',  3),
  ('power-backup',    '{"en": "Power backup", "hi": "पावर बैकअप"}',                  'battery-charging', 'general',  4),
  ('temple-shuttle',  '{"en": "Temple shuttle", "hi": "मंदिर शटल"}',                 'bus',              'services', 5),
  ('sattvik-kitchen', '{"en": "Sattvik kitchen", "hi": "सात्विक रसोई"}',             'leaf',             'dining',   6),
  ('restaurant',      '{"en": "Restaurant", "hi": "रेस्टोरेंट"}',                    'utensils',         'dining',   7),
  ('room-service',    '{"en": "Room service", "hi": "रूम सर्विस"}',                  'concierge-bell',   'services', 8),
  ('lift',            '{"en": "Lift", "hi": "लिफ़्ट"}',                              'arrow-up-down',    'general',  9),
  ('hot-water',       '{"en": "24-hour hot water", "hi": "24 घंटे गर्म पानी"}',      'shower-head',      'room',     10),
  ('tv',              '{"en": "TV", "hi": "टीवी"}',                                   'tv',               'room',     11),
  ('front-desk-24h',  '{"en": "24-hour front desk", "hi": "24 घंटे रिसेप्शन"}',      'clock',            'services', 12),
  ('laundry',         '{"en": "Laundry", "hi": "लॉन्ड्री"}',                         'shirt',            'services', 13),
  ('wheelchair',      '{"en": "Wheelchair accessible", "hi": "व्हीलचेयर सुलभ"}',     'accessibility',    'general',  14),
  ('cctv',            '{"en": "CCTV security", "hi": "सीसीटीवी सुरक्षा"}',           'cctv',             'general',  15),
  ('family-rooms',    '{"en": "Family rooms", "hi": "फ़ैमिली रूम"}',                 'users',            'room',     16)
on conflict (slug) do nothing;
