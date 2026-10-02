-- Phase 6: baseline local-ride catalog, settings and templates. Idempotent;
-- every fare, zone and landmark here is admin-editable (Admin → Rides).
-- Coordinates are approximate and should be checked on a map before launch.

insert into public.settings (key, value, is_public, description) values
  ('rides.defaults',
   '{"road_factor": 1.3, "avg_speed_kmph": 18, "max_ride_km": 40, "min_lead_minutes": 10, "max_advance_days": 7, "max_hours": 12, "night_start": "22:00", "night_end": "06:00", "require_pickup_otp": true, "pay_later_enabled": true, "hold_minutes": 10, "sac": "996601", "cancellation_rules": [{"hours_before": 1, "refund_percent": 100}, {"hours_before": 0, "refund_percent": 50}]}',
   false,
   'Local rides: distance fallback, longest ride, booking window, hourly limit, night hours, pickup OTP, pay-the-driver option, payment hold, SAC, cancellation refunds')
on conflict (key) do nothing;

insert into public.feature_flags (key, enabled, description) values
  ('booking.rides', false, 'Local ride booking (bike, rickshaw, car) open to customers (phase 6)')
on conflict (key) do nothing;

insert into public.ride_vehicle_types (key, service_slug, name, description, icon, seats, instant_book, tax_bps, sort_order) values
  ('bike', 'bike', '{"en": "Bike", "hi": "बाइक"}',
   '{"en": "Quickest way through the lanes, for one rider with a small bag.", "hi": "गलियों में सबसे तेज़, एक सवारी और छोटे बैग के लिए।"}', 'bike', 1, true, 500, 1),
  ('e-rickshaw', 'rickshaw', '{"en": "E-Rickshaw", "hi": "ई-रिक्शा"}',
   '{"en": "Battery rickshaw for up to 4, ideal between temples.", "hi": "4 लोगों तक के लिए बैटरी रिक्शा, मंदिरों के बीच के लिए बढ़िया।"}', 'battery-charging', 4, true, 0, 2),
  ('rickshaw', 'rickshaw', '{"en": "Rickshaw", "hi": "रिक्शा"}',
   '{"en": "Classic cycle rickshaw for 2, slow and scenic.", "hi": "2 लोगों के लिए पारंपरिक साइकिल रिक्शा, आराम से घूमने के लिए।"}', 'bike', 2, false, 0, 3),
  ('car', 'car', '{"en": "Car", "hi": "कार"}',
   '{"en": "AC car for up to 4 with luggage, for station and hotel drops.", "hi": "4 लोगों और सामान के लिए एसी कार, स्टेशन और होटल ड्रॉप के लिए।"}', 'car', 4, true, 500, 4)
on conflict (key) do nothing;

insert into public.ride_zones (slug, name, lat, lng, radius_km, sort_order) values
  ('vrindavan', '{"en": "Vrindavan", "hi": "वृंदावन"}', 27.5800, 77.6900, 8, 1),
  ('mathura',   '{"en": "Mathura", "hi": "मथुरा"}',     27.4924, 77.6737, 8, 2),
  ('govardhan', '{"en": "Govardhan", "hi": "गोवर्धन"}', 27.5050, 77.4700, 7, 3),
  ('barsana',   '{"en": "Barsana", "hi": "बरसाना"}',    27.6490, 77.3780, 6, 4)
on conflict (slug) do nothing;

insert into public.ride_points (zone_id, slug, name, kind, lat, lng, is_popular, sort_order)
select z.id, p.slug, p.name::jsonb, p.kind, p.lat, p.lng, p.popular, p.sort_order
from (values
  ('vrindavan', 'banke-bihari',       '{"en": "Banke Bihari Temple", "hi": "बांके बिहारी मंदिर"}',           'temple',  27.5806, 77.7006, true,  1),
  ('vrindavan', 'iskcon-vrindavan',   '{"en": "ISKCON Temple", "hi": "इस्कॉन मंदिर"}',                       'temple',  27.5724, 77.6738, true,  2),
  ('vrindavan', 'prem-mandir',        '{"en": "Prem Mandir", "hi": "प्रेम मंदिर"}',                          'temple',  27.5713, 77.6714, true,  3),
  ('vrindavan', 'radha-raman',        '{"en": "Radha Raman Temple", "hi": "राधा रमण मंदिर"}',                'temple',  27.5821, 77.6990, false, 4),
  ('vrindavan', 'nidhivan',           '{"en": "Nidhivan", "hi": "निधिवन"}',                                  'temple',  27.5843, 77.6996, false, 5),
  ('vrindavan', 'keshi-ghat',         '{"en": "Keshi Ghat", "hi": "केशी घाट"}',                               'ghat',    27.5868, 77.6969, true,  6),
  ('vrindavan', 'vrindavan-road',     '{"en": "Vrindavan Road station", "hi": "वृंदावन रोड स्टेशन"}',        'station', 27.5410, 77.7060, false, 7),
  ('vrindavan', 'vrindavan-bus-stand','{"en": "Vrindavan bus stand", "hi": "वृंदावन बस स्टैंड"}',             'station', 27.5760, 77.6850, false, 8),
  ('mathura',   'janmabhoomi',        '{"en": "Shri Krishna Janmabhoomi", "hi": "श्री कृष्ण जन्मभूमि"}',      'temple',  27.5047, 77.6697, true,  1),
  ('mathura',   'dwarkadhish',        '{"en": "Dwarkadhish Temple", "hi": "द्वारकाधीश मंदिर"}',              'temple',  27.5078, 77.6857, true,  2),
  ('mathura',   'vishram-ghat',       '{"en": "Vishram Ghat", "hi": "विश्राम घाट"}',                          'ghat',    27.5096, 77.6870, true,  3),
  ('mathura',   'mathura-junction',   '{"en": "Mathura Junction station", "hi": "मथुरा जंक्शन स्टेशन"}',      'station', 27.4799, 77.6791, true,  4),
  ('mathura',   'mathura-bus-stand',  '{"en": "Mathura new bus stand", "hi": "मथुरा नया बस स्टैंड"}',         'station', 27.4900, 77.6740, false, 5),
  ('govardhan', 'daan-ghati',         '{"en": "Daan Ghati Temple", "hi": "दान घाटी मंदिर"}',                 'temple',  27.4970, 77.4610, true,  1),
  ('govardhan', 'mansi-ganga',        '{"en": "Mansi Ganga", "hi": "मानसी गंगा"}',                            'ghat',    27.4990, 77.4630, true,  2),
  ('govardhan', 'radha-kund',         '{"en": "Radha Kund", "hi": "राधा कुंड"}',                              'ghat',    27.5240, 77.4870, true,  3),
  ('barsana',   'radha-rani-temple',  '{"en": "Shri Radha Rani Temple", "hi": "श्री राधा रानी मंदिर"}',      'temple',  27.6466, 77.3767, true,  1),
  ('barsana',   'barsana-bus-stand',  '{"en": "Barsana bus stand", "hi": "बरसाना बस स्टैंड"}',                'station', 27.6510, 77.3800, false, 2)
) as p(zone_slug, slug, name, kind, lat, lng, popular, sort_order)
join public.ride_zones z on z.slug = p.zone_slug
on conflict (slug) do nothing;

-- Same starter fares in every zone (paise).
insert into public.ride_fare_rules (zone_id, vehicle_type_id, mode, base_paise, included_km, per_km_paise, min_fare_paise,
  hourly_rate_paise, min_hours, km_per_hour, free_waiting_minutes, per_min_waiting_paise, night_bps)
select z.id, t.id, f.mode::public.ride_mode, f.base, f.incl, f.per_km, f.min_fare, f.hourly, f.min_hours, f.kmph, f.free_wait, f.wait, f.night
from (values
  ('bike',       'point_to_point', 3000,  2, 800,  3000,  0,     1, 10, 5, 100, 12500),
  ('bike',       'hourly',         0,     0, 800,  0,     15000, 1, 10, 5, 100, 12500),
  ('e-rickshaw', 'point_to_point', 3000,  2, 1000, 3000,  0,     1, 8,  5, 100, 12500),
  ('e-rickshaw', 'hourly',         0,     0, 1000, 0,     20000, 1, 8,  5, 100, 12500),
  ('rickshaw',   'point_to_point', 2000,  1, 1200, 2000,  0,     1, 5,  5, 100, 12500),
  ('rickshaw',   'hourly',         0,     0, 1200, 0,     15000, 1, 5,  5, 100, 12500),
  ('car',        'point_to_point', 10000, 3, 1500, 15000, 0,     2, 10, 5, 300, 12500),
  ('car',        'hourly',         0,     0, 1500, 0,     35000, 2, 10, 5, 300, 12500)
) as f(type_key, mode, base, incl, per_km, min_fare, hourly, min_hours, kmph, free_wait, wait, night)
join public.ride_vehicle_types t on t.key = f.type_key
cross join public.ride_zones z
on conflict (zone_id, vehicle_type_id, mode) do nothing;

-- The header "Bikes" and "Rickshaw" tabs now open the ride booking.
update public.navigation_links set href = '/rides?v=bike' where menu = 'header' and href = '/services/bike';
update public.navigation_links set href = '/rides?v=e-rickshaw' where menu = 'header' and href = '/services/rickshaw';

insert into public.notification_templates (key, channel, locale, subject, body) values
  ('ride.confirmed', 'email', 'en', 'Ride booked · {{code}}',
   E'Namaste {{name}},\n\nYour {{vehicle}} ride is booked.\nBooking ID: {{code}}\nRide: {{route}}\nPickup: {{pickup_at}} from {{pickup_address}}\nFare: {{total}} · Paid: {{paid}} · Pay the driver: {{balance}}\n\nYour pickup OTP is {{otp}}. We will send the driver''s details shortly.\nView your ride: {{trip_url}}\n\nThe P & S Traveler Group'),
  ('ride.confirmed', 'email', 'hi', 'सवारी बुक हो गई · {{code}}',
   E'नमस्ते {{name}},\n\nआपकी {{vehicle}} सवारी बुक हो गई है।\nबुकिंग आईडी: {{code}}\nसवारी: {{route}}\nपिकअप: {{pickup_at}}, {{pickup_address}}\nकिराया: {{total}} · भुगतान: {{paid}} · ड्राइवर को देना है: {{balance}}\n\nआपका पिकअप OTP {{otp}} है। ड्राइवर की जानकारी जल्द भेजेंगे।\nअपनी सवारी देखें: {{trip_url}}\n\nद पी एंड एस ट्रैवलर ग्रुप'),
  ('ride.confirmed', 'sms', 'en', null,
   'P&S Traveler: {{vehicle}} ride {{code}} at {{pickup_at}}. Pickup OTP {{otp}}. {{trip_url}}'),
  ('ride.assigned', 'email', 'en', 'Your rider for {{code}}',
   E'Namaste {{name}},\n\n{{driver}} ({{driver_phone}}) is coming with a {{vehicle}} {{registration}}.\nPickup: {{pickup_at}} from {{pickup_address}}\nShare OTP {{otp}} with the driver at pickup.\n\n{{trip_url}}\n\nThe P & S Traveler Group'),
  ('ride.assigned', 'email', 'hi', 'आपके ड्राइवर · {{code}}',
   E'नमस्ते {{name}},\n\n{{driver}} ({{driver_phone}}) {{vehicle}} {{registration}} लेकर आ रहे हैं।\nपिकअप: {{pickup_at}}, {{pickup_address}}\nपिकअप के समय ड्राइवर को OTP {{otp}} बताएँ।\n\n{{trip_url}}\n\nद पी एंड एस ट्रैवलर ग्रुप'),
  ('ride.assigned', 'sms', 'en', null,
   'P&S Traveler: {{driver}} {{driver_phone}} ({{vehicle}}) for ride {{code}} at {{pickup_at}}. OTP {{otp}}.'),
  ('ride.assigned', 'whatsapp', 'en', null,
   E'Namaste {{name}} 🙏 *{{driver}}* ({{driver_phone}}) is coming with your {{vehicle}} at {{pickup_at}}.\nPickup OTP: *{{otp}}*\n{{trip_url}}')
on conflict (key, channel, locale) do nothing;
