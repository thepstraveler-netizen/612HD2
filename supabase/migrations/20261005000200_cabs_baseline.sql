-- Phase 5: baseline cab catalog, settings and templates. Idempotent; every
-- price here is admin-editable (Admin → Cabs).

insert into public.settings (key, value, is_public, description) values
  ('cabs.defaults',
   '{"advance_percent": 20, "min_advance_paise": 50000, "tax_bps": 500, "sac": "996601", "road_factor": 1.25, "avg_speed_kmph": 45, "min_lead_minutes": 120, "max_advance_days": 90, "max_trip_days": 15, "night_start": "22:00", "night_end": "06:00", "require_pickup_otp": true, "hold_minutes": 15, "cancellation_rules": [{"hours_before": 24, "refund_percent": 100}, {"hours_before": 6, "refund_percent": 50}, {"hours_before": 0, "refund_percent": 0}]}',
   false,
   'Cabs: advance %, minimum advance, GST rate and SAC, distance fallback, booking window, night hours, pickup OTP, cancellation refunds')
on conflict (key) do nothing;

insert into public.cab_places (slug, name, kind, lat, lng, is_popular, sort_order) values
  ('vrindavan',        '{"en": "Vrindavan", "hi": "वृंदावन"}',                              'city',    27.5650, 77.6593, true,  1),
  ('mathura',          '{"en": "Mathura", "hi": "मथुरा"}',                                  'city',    27.4924, 77.6737, true,  2),
  ('mathura-junction', '{"en": "Mathura Junction (railway station)", "hi": "मथुरा जंक्शन (रेलवे स्टेशन)"}', 'station', 27.4799, 77.6791, true,  3),
  ('vrindavan-road',   '{"en": "Vrindavan Road (railway station)", "hi": "वृंदावन रोड (रेलवे स्टेशन)"}', 'station', 27.5410, 77.7060, false, 4),
  ('govardhan',        '{"en": "Govardhan", "hi": "गोवर्धन"}',                              'city',    27.4970, 77.4610, true,  5),
  ('barsana',          '{"en": "Barsana", "hi": "बरसाना"}',                                 'city',    27.6490, 77.3780, true,  6),
  ('nandgaon',         '{"en": "Nandgaon", "hi": "नंदगाँव"}',                               'city',    27.7149, 77.3836, false, 7),
  ('gokul',            '{"en": "Gokul", "hi": "गोकुल"}',                                    'city',    27.4392, 77.7208, false, 8),
  ('agra',             '{"en": "Agra", "hi": "आगरा"}',                                      'city',    27.1767, 78.0081, true,  9),
  ('agra-cantt',       '{"en": "Agra Cantt (railway station)", "hi": "आगरा कैंट (रेलवे स्टेशन)"}', 'station', 27.1580, 77.9893, false, 10),
  ('delhi',            '{"en": "Delhi", "hi": "दिल्ली"}',                                   'city',    28.6139, 77.2090, true,  11),
  ('delhi-airport',    '{"en": "Delhi Airport (IGI)", "hi": "दिल्ली एयरपोर्ट (IGI)"}',      'airport', 28.5562, 77.1000, true,  12),
  ('noida',            '{"en": "Noida", "hi": "नोएडा"}',                                    'city',    28.5355, 77.3910, false, 13),
  ('jaipur',           '{"en": "Jaipur", "hi": "जयपुर"}',                                   'city',    26.9124, 75.7873, true,  14)
on conflict (slug) do nothing;

insert into public.cab_categories (key, name, description, body_type, seats, luggage, sort_order) values
  ('hatchback', '{"en": "Hatchback", "hi": "हैचबैक"}',
   '{"en": "Budget car for up to 4 people with light bags.", "hi": "4 लोगों तक, हल्के सामान के लिए किफ़ायती कार।"}', 'hatchback', 4, 1, 1),
  ('sedan', '{"en": "Sedan", "hi": "सेडान"}',
   '{"en": "Comfortable car for 4 with boot space for 2 bags.", "hi": "4 लोगों के लिए आरामदायक कार, 2 बैग की जगह।"}', 'sedan', 4, 2, 2),
  ('suv', '{"en": "SUV (6+1)", "hi": "एसयूवी (6+1)"}',
   '{"en": "Seats 6 passengers; good for families.", "hi": "6 यात्रियों के लिए; परिवारों के लिए अच्छी।"}', 'muv', 6, 2, 3),
  ('innova', '{"en": "Innova Crysta", "hi": "इनोवा क्रिस्टा"}',
   '{"en": "Premium 7-seater with extra legroom and luggage space.", "hi": "ज़्यादा जगह वाली प्रीमियम 7-सीटर।"}', 'suv', 7, 3, 4),
  ('tempo-traveller', '{"en": "Tempo Traveller (12)", "hi": "टेम्पो ट्रैवलर (12)"}',
   '{"en": "For groups of up to 12 with plenty of luggage.", "hi": "12 लोगों तक के समूह और ज़्यादा सामान के लिए।"}', 'tempo_traveller', 12, 8, 5)
on conflict (key) do nothing;

insert into public.cab_models (category_id, name, fuel, is_featured, sort_order)
select c.id, m.name, m.fuel::public.fuel_type, m.featured, m.sort_order
from (values
  ('hatchback', 'Maruti WagonR', 'cng', true, 1),
  ('hatchback', 'Tata Tiago EV', 'electric', false, 2),
  ('sedan', 'Maruti Swift Dzire', 'cng', true, 1),
  ('sedan', 'Honda Amaze', 'petrol', false, 2),
  ('suv', 'Maruti Ertiga', 'cng', true, 1),
  ('innova', 'Toyota Innova Crysta', 'diesel', true, 1),
  ('tempo-traveller', 'Force Tempo Traveller', 'diesel', true, 1)
) as m(category_key, name, fuel, featured, sort_order)
join public.cab_categories c on c.key = m.category_key
on conflict (category_id, name) do nothing;

-- Per-km outstation rules (paise).
insert into public.cab_fare_rules (category_id, trip_type, rate_per_km_paise, min_km, min_km_per_day,
  driver_allowance_per_day_paise, night_charge_paise, extra_km_paise)
select c.id, r.trip_type::public.cab_trip_type, r.rate, r.min_km, r.min_km_day, r.allowance, r.night, r.extra
from (values
  ('hatchback',       'one_way',    1100, 80, 0,   30000, 25000, 1100),
  ('hatchback',       'round_trip', 1000, 0,  250, 30000, 25000, 1000),
  ('sedan',           'one_way',    1300, 80, 0,   30000, 25000, 1300),
  ('sedan',           'round_trip', 1200, 0,  250, 30000, 25000, 1200),
  ('suv',             'one_way',    1600, 80, 0,   30000, 25000, 1600),
  ('suv',             'round_trip', 1500, 0,  250, 30000, 25000, 1500),
  ('innova',          'one_way',    2000, 80, 0,   40000, 30000, 2000),
  ('innova',          'round_trip', 1800, 0,  250, 40000, 30000, 1800),
  ('tempo-traveller', 'one_way',    2600, 80, 0,   50000, 40000, 2600),
  ('tempo-traveller', 'round_trip', 2400, 0,  250, 50000, 40000, 2400)
) as r(category_key, trip_type, rate, min_km, min_km_day, allowance, night, extra)
join public.cab_categories c on c.key = r.category_key
on conflict (category_id, trip_type) do nothing;

insert into public.cab_local_packages (key, name, hours, km, sort_order) values
  ('4hr-40km',   '{"en": "4 hrs · 40 km", "hi": "4 घंटे · 40 किमी"}',    4, 40, 1),
  ('8hr-80km',   '{"en": "8 hrs · 80 km", "hi": "8 घंटे · 80 किमी"}',    8, 80, 2),
  ('12hr-120km', '{"en": "12 hrs · 120 km", "hi": "12 घंटे · 120 किमी"}', 12, 120, 3)
on conflict (key) do nothing;

insert into public.cab_local_fares (package_id, category_id, fare_paise, extra_km_paise, extra_hour_paise)
select p.id, c.id, f.fare, f.extra_km, f.extra_hour
from (values
  ('4hr-40km', 'hatchback', 120000, 1100, 15000), ('8hr-80km', 'hatchback', 200000, 1100, 15000), ('12hr-120km', 'hatchback', 280000, 1100, 15000),
  ('4hr-40km', 'sedan', 140000, 1300, 18000), ('8hr-80km', 'sedan', 230000, 1300, 18000), ('12hr-120km', 'sedan', 320000, 1300, 18000),
  ('4hr-40km', 'suv', 190000, 1600, 22000), ('8hr-80km', 'suv', 300000, 1600, 22000), ('12hr-120km', 'suv', 420000, 1600, 22000),
  ('4hr-40km', 'innova', 240000, 2000, 25000), ('8hr-80km', 'innova', 380000, 2000, 25000), ('12hr-120km', 'innova', 520000, 2000, 25000),
  ('4hr-40km', 'tempo-traveller', 350000, 2600, 35000), ('8hr-80km', 'tempo-traveller', 550000, 2600, 35000), ('12hr-120km', 'tempo-traveller', 750000, 2600, 35000)
) as f(package_key, category_key, fare, extra_km, extra_hour)
join public.cab_local_packages p on p.key = f.package_key
join public.cab_categories c on c.key = f.category_key
on conflict (package_id, category_id) do nothing;

insert into public.cab_routes (slug, trip_type, from_place_id, to_place_id, name, stops, distance_km, duration_minutes, is_popular, sort_order)
select r.slug, r.trip_type::public.cab_trip_type, f.id, t.id, r.name::jsonb, r.stops::jsonb, r.km, r.minutes, r.popular, r.sort_order
from (values
  ('vrindavan-mathura',          'one_way',     'vrindavan',        'mathura',          null, '[]', 13,  25,  true,  1),
  ('vrindavan-govardhan',        'one_way',     'vrindavan',        'govardhan',        null, '[]', 23,  40,  true,  2),
  ('vrindavan-barsana',          'one_way',     'vrindavan',        'barsana',          null, '[]', 45,  70,  true,  3),
  ('vrindavan-nandgaon',         'one_way',     'vrindavan',        'nandgaon',         null, '[]', 52,  80,  true,  4),
  ('vrindavan-agra',             'one_way',     'vrindavan',        'agra',             null, '[]', 75,  105, true,  5),
  ('vrindavan-delhi',            'one_way',     'vrindavan',        'delhi',            null, '[]', 165, 210, true,  6),
  ('vrindavan-jaipur',           'one_way',     'vrindavan',        'jaipur',           null, '[]', 235, 300, true,  7),
  ('vrindavan-noida',            'one_way',     'vrindavan',        'noida',            null, '[]', 150, 180, false, 8),
  ('mathura-junction-vrindavan', 'transfer',    'mathura-junction', 'vrindavan',        null, '[]', 14,  30,  true,  20),
  ('vrindavan-mathura-junction', 'transfer',    'vrindavan',        'mathura-junction', null, '[]', 14,  30,  false, 21),
  ('vrindavan-road-vrindavan',   'transfer',    'vrindavan-road',   'vrindavan',        null, '[]', 10,  20,  false, 22),
  ('vrindavan-vrindavan-road',   'transfer',    'vrindavan',        'vrindavan-road',   null, '[]', 10,  20,  false, 23),
  ('agra-cantt-vrindavan',       'transfer',    'agra-cantt',       'vrindavan',        null, '[]', 72,  100, false, 24),
  ('vrindavan-agra-cantt',       'transfer',    'vrindavan',        'agra-cantt',       null, '[]', 72,  100, false, 25),
  ('delhi-airport-vrindavan',    'transfer',    'delhi-airport',    'vrindavan',        null, '[]', 175, 225, true,  26),
  ('vrindavan-delhi-airport',    'transfer',    'vrindavan',        'delhi-airport',    null, '[]', 175, 225, true,  27),
  ('braj-darshan-day-tour',      'sightseeing', 'vrindavan',        'vrindavan',
   '{"en": "Braj darshan day tour", "hi": "ब्रज दर्शन डे टूर"}',
   '["Mathura", "Gokul", "Govardhan", "Barsana", "Nandgaon"]', 140, 600, true, 40),
  ('vrindavan-temple-tour',      'sightseeing', 'vrindavan',        'vrindavan',
   '{"en": "Vrindavan temple tour", "hi": "वृंदावन मंदिर दर्शन"}',
   '["Banke Bihari", "Radha Vallabh", "Nidhivan", "ISKCON", "Prem Mandir"]', 30, 300, true, 41)
) as r(slug, trip_type, from_slug, to_slug, name, stops, km, minutes, popular, sort_order)
join public.cab_places f on f.slug = r.from_slug
join public.cab_places t on t.slug = r.to_slug
on conflict (slug) do nothing;

-- Fixed fares for transfers, tours and short outstation hops, derived once
-- from each category's one-way rate and rounded to ₹50. Admins edit them per row.
insert into public.cab_route_fares (route_id, category_id, fare_paise, extra_km_paise, tolls_included)
select r.id, c.id,
       (ceil((case when r.trip_type = 'sightseeing' then 50000 when r.distance_km < 60 then 30000 else 40000 end
              + r.distance_km * fr.rate_per_km_paise * (case when r.distance_km < 60 then 1.6 else 1.05 end)) / 5000) * 5000)::integer,
       fr.extra_km_paise,
       r.trip_type = 'sightseeing'
from public.cab_routes r
cross join public.cab_categories c
join public.cab_fare_rules fr on fr.category_id = c.id and fr.trip_type = 'one_way'
where r.trip_type in ('transfer', 'sightseeing') or (r.trip_type = 'one_way' and r.distance_km < 60)
on conflict (route_id, category_id) do nothing;

insert into public.cab_addons (key, name, description, price_paise, sort_order) values
  ('roof-carrier', '{"en": "Roof carrier", "hi": "रूफ़ कैरियर"}',
   '{"en": "Extra luggage space on the roof, with a cover.", "hi": "छत पर ढका हुआ अतिरिक्त सामान स्थान।"}', 25000, 1),
  ('child-seat', '{"en": "Child seat", "hi": "चाइल्ड सीट"}',
   '{"en": "Forward-facing seat for children aged 1 to 4.", "hi": "1 से 4 साल के बच्चों के लिए सीट।"}', 20000, 2)
on conflict (key) do nothing;

-- The header "Cabs" tab now opens the cab search.
update public.navigation_links set href = '/cabs' where menu = 'header' and href = '/services/car';

insert into public.notification_templates (key, channel, locale, subject, body) values
  ('cab.confirmed', 'email', 'en', 'Cab booked · {{code}}',
   E'Namaste {{name}},\n\nYour {{vehicle}} is booked.\nBooking ID: {{code}}\nTrip: {{route}}\nPickup: {{pickup_at}} from {{pickup_address}}\nTotal: {{total}} · Paid: {{paid}} · Pay the driver: {{balance}}\n\nWe will send your driver''s details before pickup. Your pickup OTP is {{otp}}.\nView your trip: {{trip_url}}\n\nThe P & S Traveler Group'),
  ('cab.confirmed', 'email', 'hi', 'कैब बुक हो गई · {{code}}',
   E'नमस्ते {{name}},\n\nआपकी {{vehicle}} बुक हो गई है।\nबुकिंग आईडी: {{code}}\nयात्रा: {{route}}\nपिकअप: {{pickup_at}}, {{pickup_address}}\nकुल: {{total}} · भुगतान: {{paid}} · ड्राइवर को देना है: {{balance}}\n\nपिकअप से पहले हम ड्राइवर की जानकारी भेजेंगे। आपका पिकअप OTP {{otp}} है।\nअपनी यात्रा देखें: {{trip_url}}\n\nद पी एंड एस ट्रैवलर ग्रुप'),
  ('cab.confirmed', 'sms', 'en', null,
   'P&S Traveler: cab {{code}} booked for {{pickup_at}}. Pickup OTP {{otp}}. Details: {{trip_url}}'),
  ('trip.assigned', 'email', 'en', 'Your driver for {{code}}',
   E'Namaste {{name}},\n\nYour driver is {{driver}} ({{driver_phone}}) in a {{vehicle}}, {{registration}}.\nPickup: {{pickup_at}} from {{pickup_address}}\nShare OTP {{otp}} with the driver at pickup.\n\n{{trip_url}}\n\nThe P & S Traveler Group'),
  ('trip.assigned', 'email', 'hi', 'आपके ड्राइवर · {{code}}',
   E'नमस्ते {{name}},\n\nआपके ड्राइवर {{driver}} ({{driver_phone}}) हैं, गाड़ी {{vehicle}}, {{registration}}।\nपिकअप: {{pickup_at}}, {{pickup_address}}\nपिकअप के समय ड्राइवर को OTP {{otp}} बताएँ।\n\n{{trip_url}}\n\nद पी एंड एस ट्रैवलर ग्रुप'),
  ('trip.assigned', 'sms', 'en', null,
   'P&S Traveler: driver {{driver}} {{driver_phone}}, {{registration}} for {{code}} at {{pickup_at}}. OTP {{otp}}.'),
  ('trip.assigned', 'whatsapp', 'en', null,
   E'Namaste {{name}} 🙏 Your driver *{{driver}}* ({{driver_phone}}) will pick you up at {{pickup_at}} in a {{vehicle}} ({{registration}}).\nPickup OTP: *{{otp}}*\n{{trip_url}}')
on conflict (key, channel, locale) do nothing;
