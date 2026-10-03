-- Demo content so a fresh local database looks alive (`supabase db reset`).
-- Not applied to production by `supabase db push`. Hotels, routes, drivers
-- and restaurants are seeded by the phases that create those tables.

insert into public.offers_banners (tab, title, subtitle, coupon_code, cta_label, href, accent, sort_order) values
  ('all', '{"en": "Kartik Maas Special", "hi": "कार्तिक मास स्पेशल"}', '{"en": "Up to 20% off stays near Banke Bihari", "hi": "बांके बिहारी के पास ठहरने पर 20% तक की छूट"}', 'KARTIK20', '{"en": "Book now", "hi": "अभी बुक करें"}', '/hotels', 'pink', 1),
  ('cabs', '{"en": "Braj Darshan Day Tour", "hi": "ब्रज दर्शन डे टूर"}', '{"en": "Mathura · Vrindavan · Govardhan · Barsana in one day", "hi": "एक दिन में मथुरा · वृंदावन · गोवर्धन · बरसाना"}', 'BRAJ500', '{"en": "Book cab", "hi": "कैब बुक करें"}', '/services/car', 'red', 2),
  ('food', '{"en": "Sattvik thali, delivered", "hi": "सात्विक थाली, आपके दरवाज़े पर"}', '{"en": "Flat ₹50 off your first order", "hi": "पहले ऑर्डर पर ₹50 की छूट"}', 'FIRSTFOOD', '{"en": "Order food", "hi": "खाना ऑर्डर करें"}', '/services/food', 'orange', 3),
  ('hotels', '{"en": "Long Weekend Sale", "hi": "लॉन्ग वीकेंड सेल"}', '{"en": "Extra 10% off on 2+ nights", "hi": "2+ रातों पर अतिरिक्त 10% छूट"}', 'LONGWKND', '{"en": "See hotels", "hi": "होटल देखें"}', '/hotels', 'blue', 4),
  ('packages', '{"en": "Braj 84 Kos Yatra", "hi": "ब्रज 84 कोस यात्रा"}', '{"en": "Guided group departures every month", "hi": "हर महीने गाइडेड ग्रुप यात्रा"}', null, '{"en": "Enquire", "hi": "पूछताछ करें"}', '/services/travel-hotel-booking', 'teal', 5);

insert into public.testimonials (author_name, author_place, quote, rating, sort_order) values
  ('Radha Sharma', 'Delhi', '{"en": "Booked a hotel walking distance from Banke Bihari and a cab from Mathura Junction in one call. Smooth darshan trip for my parents.", "hi": "एक ही कॉल में बांके बिहारी के पास होटल और मथुरा जंक्शन से कैब बुक हो गई। माता-पिता की दर्शन यात्रा बहुत आराम से हुई।"}', 5, 1),
  ('Amit Verma', 'Jaipur', '{"en": "The Braj darshan day tour covered Govardhan and Barsana without any rush. Driver knew every temple timing.", "hi": "ब्रज दर्शन डे टूर में बिना जल्दबाज़ी के गोवर्धन और बरसाना घूम लिए। ड्राइवर को हर मंदिर का समय पता था।"}', 5, 2),
  ('Hotel Shri Radha Palace', 'Vrindavan', '{"en": "Their photography and OTA team doubled our online bookings before Janmashtami.", "hi": "उनकी फ़ोटोग्राफ़ी और ओटीए टीम ने जन्माष्टमी से पहले हमारी ऑनलाइन बुकिंग दोगुनी कर दी।"}', 5, 3);

insert into public.faqs (service_id, question, answer, sort_order)
select s.id, f.question::jsonb, f.answer::jsonb, f.sort_order
from (values
  ('car', '{"en": "Do you pick up from Mathura Junction and Vrindavan Road?", "hi": "क्या आप मथुरा जंक्शन और वृंदावन रोड से पिकअप करते हैं?"}', '{"en": "Yes. Station and Delhi/Agra airport transfers run 24×7.", "hi": "हाँ। स्टेशन और दिल्ली/आगरा एयरपोर्ट ट्रांसफ़र 24×7 उपलब्ध हैं।"}', 1),
  ('food', '{"en": "Is the food sattvik?", "hi": "क्या खाना सात्विक है?"}', '{"en": "Every restaurant is tagged veg, Jain or sattvik so you can filter.", "hi": "हर रेस्टोरेंट पर वेज, जैन या सात्विक टैग है, ताकि आप फ़िल्टर कर सकें।"}', 1),
  ('medicine', '{"en": "Do I need a prescription?", "hi": "क्या पर्ची ज़रूरी है?"}', '{"en": "Prescription medicines are delivered only against a valid prescription, through licensed partner pharmacies.", "hi": "पर्ची वाली दवाएँ केवल वैध पर्ची पर, लाइसेंसशुदा पार्टनर फ़ार्मेसी के ज़रिए दी जाती हैं।"}', 1)
) as f(slug, question, answer, sort_order)
join public.services s on s.slug = f.slug;

-- ---------------------------------------------------------------- demo hotels
-- Fictional properties (names start with "Demo ·") so the hotel listing,
-- filters and calendar have something to show. Archive or delete them from
-- /admin/hotels before launch. No photos: upload real ones in the admin.
do $$
declare
  v_vrindavan uuid := (select id from public.cities where slug = 'vrindavan');
  v_mathura   uuid := (select id from public.cities where slug = 'mathura');
  v_hotel uuid;
  v_room uuid;
  v_plan uuid;
begin
  if exists (select 1 from public.hotels where slug like 'demo-%') then
    return;
  end if;

  -- 1. Radha Kunj Residency: mid-range hotel by Banke Bihari.
  insert into public.hotels (slug, city_id, area_id, name, summary, description, property_type, star_rating, address, lat, lng,
    highlights, policies, food_dining, is_couple_friendly, is_featured, rating_avg, rating_count, status, sort_order, seo)
  values ('demo-radha-kunj-residency', v_vrindavan, (select id from public.areas where slug = 'banke-bihari'),
    '{"en": "Demo · Radha Kunj Residency", "hi": "डेमो · राधा कुंज रेज़िडेंसी"}',
    '{"en": "A 4-minute walk to Banke Bihari, with a rooftop view of the temple lanes.", "hi": "बांके बिहारी से 4 मिनट पैदल, छत से मंदिर की गलियों का नज़ारा।"}',
    '{"en": "Clean, quiet rooms in the old town with 24-hour hot water, power backup and a sattvik kitchen. Our staff can arrange darshan timings, e-rickshaws and Braj parikrama guides.", "hi": "पुराने शहर में साफ़, शांत कमरे, 24 घंटे गर्म पानी, पावर बैकअप और सात्विक रसोई। हमारा स्टाफ़ दर्शन समय, ई-रिक्शा और ब्रज परिक्रमा गाइड की व्यवस्था कर सकता है।"}',
    'hotel', 3, 'Near Vidyapeeth Chauraha, Vrindavan 281121', 27.5795, 77.6990,
    '[{"en": "4 min walk to Banke Bihari", "hi": "बांके बिहारी 4 मिनट पैदल"}, {"en": "Rooftop with temple view", "hi": "छत से मंदिर का नज़ारा"}, {"en": "Sattvik meals", "hi": "सात्विक भोजन"}]',
    '{"unmarried_couples_allowed": true, "bachelors_allowed": true, "local_ids_allowed": false, "pets_allowed": false, "id_proofs": ["aadhaar", "passport", "driving_licence", "voter_id"], "rules": [{"en": "No non-veg food, alcohol or smoking on the property.", "hi": "प्रॉपर्टी पर मांसाहार, शराब और धूम्रपान वर्जित है।"}]}',
    '{"en": "Sattvik breakfast and thali; no onion or garlic on request.", "hi": "सात्विक नाश्ता और थाली; अनुरोध पर बिना प्याज़-लहसुन।"}',
    true, true, 4.5, 128, 'published', 1, '{"title": "Radha Kunj Residency, Vrindavan (demo)"}')
  returning id into v_hotel;
  insert into public.hotel_amenities (hotel_id, amenity_id)
    select v_hotel, id from public.amenities where slug in ('wifi', 'ac', 'power-backup', 'sattvik-kitchen', 'hot-water', 'front-desk-24h', 'cctv');
  insert into public.hotel_rooms (hotel_id, name, bed_type, size_sqft, base_occupancy, max_adults, max_children, max_occupancy, total_units, sort_order)
    values (v_hotel, '{"en": "Deluxe Double Room", "hi": "डीलक्स डबल रूम"}', 'Double bed', 180, 2, 3, 1, 3, 8, 1) returning id into v_room;
  insert into public.hotel_rate_plans (room_id, name, meal_plan, is_refundable, cancellation_rules, base_price_paise, extra_adult_paise, extra_child_paise, sort_order)
    values (v_room, '{"en": "Room only", "hi": "सिर्फ़ कमरा"}', 'room_only', false, '[]', 180000, 50000, 0, 1),
           (v_room, '{"en": "With breakfast, free cancellation", "hi": "नाश्ते के साथ, मुफ़्त कैंसलेशन"}', 'breakfast', true, '[{"hours_before": 48, "refund_percent": 100}]', 220000, 60000, 30000, 2);
  insert into public.hotel_rooms (hotel_id, name, bed_type, size_sqft, base_occupancy, max_adults, max_children, max_occupancy, total_units, sort_order)
    values (v_hotel, '{"en": "Family Suite", "hi": "फ़ैमिली सुइट"}', 'Double + 2 singles', 320, 4, 4, 2, 6, 3, 2) returning id into v_room;
  insert into public.hotel_rate_plans (room_id, name, meal_plan, is_refundable, cancellation_rules, base_price_paise, extra_adult_paise, extra_child_paise, sort_order)
    values (v_room, '{"en": "Room only", "hi": "सिर्फ़ कमरा"}', 'room_only', true, '[{"hours_before": 72, "refund_percent": 100}, {"hours_before": 24, "refund_percent": 50}]', 320000, 0, 30000, 1);
  insert into public.hotel_pricing_rules (hotel_id, name, start_date, end_date, weekdays, adjustment, value, priority)
    values (v_hotel, 'Kartik Maas', '2026-10-26', '2026-11-24', '{}', 'percent', 2500, 10),
           (v_hotel, 'Holi', '2027-03-19', '2027-03-23', '{}', 'percent', 5000, 20),
           (v_hotel, 'Weekend nights', '2026-01-01', '2027-12-31', '{5,6}', 'percent', 1500, 1);

  -- 2. Yamuna Vihar Guest House: budget, sponsored.
  insert into public.hotels (slug, city_id, area_id, name, summary, property_type, star_rating, address, lat, lng,
    highlights, policies, is_couple_friendly, is_sponsored, rating_avg, rating_count, status, sort_order)
  values ('demo-yamuna-vihar-guest-house', v_vrindavan, (select id from public.areas where slug = 'nidhivan'),
    '{"en": "Demo · Yamuna Vihar Guest House", "hi": "डेमो · यमुना विहार गेस्ट हाउस"}',
    '{"en": "Simple, budget rooms between Nidhivan and Keshi Ghat.", "hi": "निधिवन और केशी घाट के बीच सादे, किफ़ायती कमरे।"}',
    'guest_house', 2, 'Gopinath Bazar, Vrindavan 281121', 27.5835, 77.6975,
    '[{"en": "Walk to Keshi Ghat aarti", "hi": "केशी घाट आरती तक पैदल"}]',
    '{"unmarried_couples_allowed": true, "bachelors_allowed": true, "local_ids_allowed": true, "pets_allowed": false, "id_proofs": ["aadhaar", "voter_id", "driving_licence"], "rules": []}',
    true, true, 4.1, 64, 'published', 2)
  returning id into v_hotel;
  insert into public.hotel_amenities (hotel_id, amenity_id)
    select v_hotel, id from public.amenities where slug in ('wifi', 'power-backup', 'hot-water');
  insert into public.hotel_rooms (hotel_id, name, bed_type, base_occupancy, max_adults, max_children, max_occupancy, total_units, sort_order)
    values (v_hotel, '{"en": "Standard Room (non-AC)", "hi": "स्टैंडर्ड रूम (नॉन-एसी)"}', 'Double bed', 2, 2, 1, 3, 6, 1) returning id into v_room;
  insert into public.hotel_rate_plans (room_id, name, meal_plan, is_refundable, cancellation_rules, base_price_paise, extra_child_paise, sort_order)
    values (v_room, '{"en": "Room only", "hi": "सिर्फ़ कमरा"}', 'room_only', false, '[]', 95000, 20000, 1);
  insert into public.hotel_rooms (hotel_id, name, bed_type, base_occupancy, max_adults, max_children, max_occupancy, total_units, amenity_ids, sort_order)
    values (v_hotel, '{"en": "AC Room", "hi": "एसी रूम"}', 'Double bed', 2, 3, 1, 3, 4,
      array(select id from public.amenities where slug in ('ac', 'tv')), 2) returning id into v_room;
  insert into public.hotel_rate_plans (room_id, name, meal_plan, is_refundable, cancellation_rules, base_price_paise, extra_adult_paise, sort_order)
    values (v_room, '{"en": "With breakfast", "hi": "नाश्ते के साथ"}', 'breakfast', true, '[{"hours_before": 24, "refund_percent": 100}]', 140000, 40000, 1)
    returning id into v_plan;
  -- Stop-sell one night to show "closed" in the calendar.
  insert into public.hotel_inventory (room_id, date, is_closed) values (v_room, '2026-11-08', true);

  -- 3. Prem Sarovar Hotel: upscale near Prem Mandir.
  insert into public.hotels (slug, city_id, area_id, name, summary, description, property_type, star_rating, address, lat, lng,
    highlights, policies, food_dining, is_couple_friendly, is_featured, pay_at_hotel_enabled, rating_avg, rating_count, status, sort_order)
  values ('demo-prem-sarovar-hotel', v_vrindavan, (select id from public.areas where slug = 'prem-mandir'),
    '{"en": "Demo · Prem Sarovar Hotel", "hi": "डेमो · प्रेम सरोवर होटल"}',
    '{"en": "Four-star comfort opposite Prem Mandir, with a pure-veg restaurant and lift.", "hi": "प्रेम मंदिर के सामने चार-सितारा आराम, शुद्ध शाकाहारी रेस्टोरेंट और लिफ़्ट।"}',
    '{"en": "Spacious rooms with Prem Mandir light-show views, family rooms, wheelchair access and parking for coaches.", "hi": "प्रेम मंदिर लाइट-शो के नज़ारे वाले बड़े कमरे, फ़ैमिली रूम, व्हीलचेयर सुविधा और बसों के लिए पार्किंग।"}',
    'hotel', 4, 'Chhatikara Road, Vrindavan 281121', 27.5712, 77.6731,
    '[{"en": "Opposite Prem Mandir", "hi": "प्रेम मंदिर के सामने"}, {"en": "Pure-veg restaurant", "hi": "शुद्ध शाकाहारी रेस्टोरेंट"}, {"en": "Coach parking", "hi": "बस पार्किंग"}]',
    '{"unmarried_couples_allowed": false, "bachelors_allowed": true, "local_ids_allowed": false, "pets_allowed": false, "id_proofs": ["aadhaar", "passport", "driving_licence"], "rules": []}',
    '{"en": "In-house pure-veg restaurant open 7 am to 11 pm.", "hi": "इन-हाउस शुद्ध शाकाहारी रेस्टोरेंट सुबह 7 से रात 11 बजे तक।"}',
    false, true, true, 4.7, 212, 'published', 3)
  returning id into v_hotel;
  insert into public.hotel_amenities (hotel_id, amenity_id)
    select v_hotel, id from public.amenities where slug in ('wifi', 'ac', 'parking', 'power-backup', 'restaurant', 'room-service', 'lift', 'hot-water', 'tv', 'front-desk-24h', 'laundry', 'wheelchair', 'cctv', 'family-rooms');
  insert into public.hotel_rooms (hotel_id, name, bed_type, size_sqft, base_occupancy, max_adults, max_children, max_occupancy, total_units, sort_order)
    values (v_hotel, '{"en": "Premium Room", "hi": "प्रीमियम रूम"}', 'King bed', 260, 2, 3, 2, 4, 20, 1) returning id into v_room;
  insert into public.hotel_rate_plans (room_id, name, meal_plan, is_refundable, cancellation_rules, base_price_paise, extra_adult_paise, extra_child_paise, sort_order)
    values (v_room, '{"en": "Room only", "hi": "सिर्फ़ कमरा"}', 'room_only', true, '[{"hours_before": 24, "refund_percent": 100}]', 450000, 100000, 50000, 1),
           (v_room, '{"en": "Breakfast included", "hi": "नाश्ता शामिल"}', 'breakfast', true, '[{"hours_before": 24, "refund_percent": 100}]', 520000, 120000, 60000, 2);
  insert into public.hotel_rooms (hotel_id, name, bed_type, size_sqft, base_occupancy, max_adults, max_children, max_occupancy, total_units, sort_order)
    values (v_hotel, '{"en": "Executive Suite", "hi": "एग्ज़ीक्यूटिव सुइट"}', 'King bed + sofa', 420, 2, 3, 2, 5, 4, 2) returning id into v_room;
  insert into public.hotel_rate_plans (room_id, name, meal_plan, inclusions, is_refundable, cancellation_rules, base_price_paise, extra_adult_paise, min_stay, sort_order)
    values (v_room, '{"en": "Breakfast and dinner", "hi": "नाश्ता और रात का खाना"}', 'half_board',
      '[{"en": "Evening aarti transfer", "hi": "शाम की आरती के लिए ट्रांसफ़र"}]', true, '[{"hours_before": 72, "refund_percent": 100}]', 850000, 150000, 2, 1);
  insert into public.hotel_pricing_rules (hotel_id, name, start_date, end_date, weekdays, adjustment, value, priority)
    values (v_hotel, 'Kartik Maas', '2026-10-26', '2026-11-24', '{}', 'percent', 2000, 10),
           (v_hotel, 'Janmashtami week', '2027-08-23', '2027-08-27', '{}', 'percent', 6000, 20);

  -- 4. Govind Seva Ashram: dharmic stay with meals.
  insert into public.hotels (slug, city_id, area_id, name, summary, property_type, star_rating, address, lat, lng,
    highlights, policies, food_dining, rating_avg, rating_count, status, sort_order)
  values ('demo-govind-seva-ashram', v_vrindavan, (select id from public.areas where slug = 'iskcon'),
    '{"en": "Demo · Govind Seva Ashram", "hi": "डेमो · गोविंद सेवा आश्रम"}',
    '{"en": "Peaceful ashram stay with prasadam meals and morning kirtan.", "hi": "प्रसाद भोजन और सुबह के कीर्तन के साथ शांत आश्रम प्रवास।"}',
    'ashram', 0, 'Raman Reti, Vrindavan 281121', 27.5735, 77.6785,
    '[{"en": "Three prasadam meals daily", "hi": "रोज़ तीन समय प्रसाद"}, {"en": "Morning kirtan", "hi": "सुबह का कीर्तन"}]',
    '{"unmarried_couples_allowed": false, "bachelors_allowed": true, "local_ids_allowed": true, "pets_allowed": false, "id_proofs": ["aadhaar", "voter_id"], "rules": [{"en": "Gates close at 10 pm.", "hi": "रात 10 बजे गेट बंद हो जाते हैं।"}]}',
    '{"en": "Prasadam is served at 8 am, 1 pm and 8 pm.", "hi": "प्रसाद सुबह 8, दोपहर 1 और रात 8 बजे।"}',
    4.3, 90, 'published', 4)
  returning id into v_hotel;
  insert into public.hotel_amenities (hotel_id, amenity_id)
    select v_hotel, id from public.amenities where slug in ('sattvik-kitchen', 'hot-water', 'temple-shuttle', 'parking');
  insert into public.hotel_rooms (hotel_id, name, bed_type, base_occupancy, max_adults, max_children, max_occupancy, total_units, sort_order)
    values (v_hotel, '{"en": "Simple Room", "hi": "साधारण कमरा"}', 'Two single beds', 2, 2, 1, 3, 12, 1) returning id into v_room;
  insert into public.hotel_rate_plans (room_id, name, meal_plan, is_refundable, cancellation_rules, base_price_paise, extra_child_paise, sort_order)
    values (v_room, '{"en": "With all meals", "hi": "सभी भोजन के साथ"}', 'full_board', true, '[{"hours_before": 24, "refund_percent": 100}]', 90000, 20000, 1);

  -- 5. Krishna Janmabhoomi Inn: Mathura.
  insert into public.hotels (slug, city_id, area_id, name, summary, property_type, star_rating, address, lat, lng,
    policies, is_couple_friendly, rating_avg, rating_count, status, sort_order)
  values ('demo-janmabhoomi-inn', v_mathura, (select id from public.areas where slug = 'janmabhoomi'),
    '{"en": "Demo · Janmabhoomi Inn", "hi": "डेमो · जन्मभूमि इन"}',
    '{"en": "Business-style hotel 600 m from Krishna Janmabhoomi.", "hi": "कृष्ण जन्मभूमि से 600 मीटर पर बिज़नेस-स्टाइल होटल।"}',
    'hotel', 3, 'Deeg Gate, Mathura 281001', 27.5045, 77.6750,
    '{"unmarried_couples_allowed": true, "bachelors_allowed": true, "local_ids_allowed": false, "pets_allowed": false, "id_proofs": ["aadhaar", "passport", "driving_licence", "voter_id"], "rules": []}',
    true, 3.9, 45, 'published', 5)
  returning id into v_hotel;
  insert into public.hotel_amenities (hotel_id, amenity_id)
    select v_hotel, id from public.amenities where slug in ('wifi', 'ac', 'parking', 'lift', 'tv', 'restaurant');
  insert into public.hotel_rooms (hotel_id, name, bed_type, base_occupancy, max_adults, max_children, max_occupancy, total_units, sort_order)
    values (v_hotel, '{"en": "Deluxe Room", "hi": "डीलक्स रूम"}', 'Queen bed', 2, 3, 1, 3, 10, 1) returning id into v_room;
  insert into public.hotel_rate_plans (room_id, name, meal_plan, is_refundable, cancellation_rules, base_price_paise, extra_adult_paise, sort_order)
    values (v_room, '{"en": "Room only", "hi": "सिर्फ़ कमरा"}', 'room_only', true, '[{"hours_before": 24, "refund_percent": 100}]', 200000, 50000, 1);
  -- Fully booked one night to show "sold out".
  insert into public.hotel_inventory (room_id, date, units, sold_units) values (v_room, '2026-11-14', 10, 10);

  -- 6. Braj Homestay: small, top rated.
  insert into public.hotels (slug, city_id, name, summary, property_type, star_rating, address, lat, lng,
    policies, is_couple_friendly, rating_avg, rating_count, status, sort_order)
  values ('demo-braj-homestay', v_vrindavan,
    '{"en": "Demo · Braj Homestay", "hi": "डेमो · ब्रज होमस्टे"}',
    '{"en": "Stay with a Brajwasi family; home-cooked breakfast included.", "hi": "ब्रजवासी परिवार के साथ ठहरें; घर का बना नाश्ता शामिल।"}',
    'homestay', 0, 'Parikrama Marg, Vrindavan 281121', 27.5768, 77.7052,
    '{"unmarried_couples_allowed": true, "bachelors_allowed": false, "local_ids_allowed": true, "pets_allowed": true, "id_proofs": ["aadhaar", "passport"], "rules": []}',
    true, 4.8, 22, 'published', 6)
  returning id into v_hotel;
  insert into public.hotel_amenities (hotel_id, amenity_id)
    select v_hotel, id from public.amenities where slug in ('wifi', 'hot-water', 'sattvik-kitchen');
  insert into public.hotel_rooms (hotel_id, name, base_occupancy, max_adults, max_children, max_occupancy, total_units, sort_order)
    values (v_hotel, '{"en": "Garden Room", "hi": "गार्डन रूम"}', 2, 2, 2, 4, 2, 1) returning id into v_room;
  insert into public.hotel_rate_plans (room_id, name, meal_plan, is_refundable, cancellation_rules, base_price_paise, extra_child_paise, sort_order)
    values (v_room, '{"en": "With breakfast", "hi": "नाश्ते के साथ"}', 'breakfast', true, '[{"hours_before": 48, "refund_percent": 100}]', 160000, 25000, 1);

  -- A draft that must stay hidden from the public site.
  insert into public.hotels (slug, city_id, name, property_type, status)
  values ('demo-draft-hotel', v_vrindavan, '{"en": "Demo · Draft Hotel"}', 'hotel', 'draft');
end
$$;

-- Phase 4: checkout options on the demo hotels, and demo coupons.
update public.hotels
   set early_checkin_paise = 50000, late_checkout_paise = 50000, breakfast_addon_paise = 15000,
       part_payment_percent = 25, pay_at_hotel_enabled = true
 where slug = 'demo-prem-sarovar-hotel';
update public.hotels
   set early_checkin_paise = 30000, breakfast_addon_paise = 10000, pay_at_hotel_enabled = true
 where slug in ('demo-radha-kunj-residency', 'demo-janmabhoomi-inn');

insert into public.coupons (code, description, discount_type, value, max_discount_paise, min_order_paise, services, is_public, per_user_limit)
values
  ('DEMO10', '{"en": "Demo · 10% off hotel stays (up to ₹500)", "hi": "डेमो · होटल पर 10% छूट (₹500 तक)"}', 'percent', 1000, 50000, 100000, '{hotel}', true, 3),
  ('DEMOFLAT300', '{"en": "Demo · ₹300 off stays above ₹3,000", "hi": "डेमो · ₹3,000 से ऊपर ₹300 छूट"}', 'flat', 30000, null, 300000, '{hotel}', true, 1),
  ('DEMOFIRST', '{"en": "Demo · 15% off your first booking", "hi": "डेमो · पहली बुकिंग पर 15% छूट"}', 'percent', 1500, 100000, 0, '{}', false, 1)
on conflict (code) do nothing;
update public.coupons set first_booking_only = true where code = 'DEMOFIRST';

-- Phase 5: demo fleet, a demo weekend peak rule and a cab coupon. Names
-- start with "Demo" and registrations with "DEMO" — remove before launch.
insert into public.drivers (full_name, phone, licence_no, licence_expiry, languages, rating)
values
  ('Demo Driver Ramesh', '+919800000001', 'UP85 20190001234', current_date + 400, '{hi,en}', 4.8),
  ('Demo Driver Suresh', '+919800000002', 'UP85 20170005678', current_date + 20, '{hi}', 4.6);

insert into public.vehicles (category_id, model_id, registration_no, colour, year, fuel, default_driver_id, insurance_expiry, permit_expiry, puc_expiry)
select c.id, m.id, v.reg, v.colour, v.year, m.fuel, d.id, current_date + v.ins, current_date + 300, current_date + 90
  from (values
    ('sedan', 'Maruti Swift Dzire', 'DEMO UP85 1001', 'White', 2023, 'Demo Driver Ramesh', 200),
    ('innova', 'Toyota Innova Crysta', 'DEMO UP85 2002', 'Silver', 2022, 'Demo Driver Suresh', 15)
  ) as v(category_key, model_name, reg, colour, year, driver_name, ins)
  join public.cab_categories c on c.key = v.category_key
  join public.cab_models m on m.category_id = c.id and m.name = v.model_name
  join public.drivers d on d.full_name = v.driver_name
on conflict do nothing;

insert into public.cab_surcharges (name, multiplier_bps, weekdays, trip_types)
values ('{"en": "Demo · Weekend outstation peak", "hi": "डेमो · सप्ताहांत आउटस्टेशन पीक"}', 11000, '{6,7}', '{one_way,round_trip}');

insert into public.coupons (code, description, discount_type, value, max_discount_paise, min_order_paise, services, is_public, per_user_limit)
values ('DEMOCAB5', '{"en": "Demo · 5% off cabs (up to ₹300)", "hi": "डेमो · कैब पर 5% छूट (₹300 तक)"}', 'percent', 500, 30000, 50000, '{cab}', true, 2)
on conflict (code) do nothing;

-- Phase 6: demo ride vehicles for the shared demo drivers — remove before launch.
insert into public.vehicles (ride_vehicle_type_id, registration_no, colour, year, fuel, default_driver_id, notes)
select t.id, v.reg, v.colour, v.year, v.fuel::public.fuel_type, d.id, 'Demo vehicle'
  from (values
    ('bike', 'DEMO UP85 3003', 'Black', 2022, 'petrol', 'Demo Driver Ramesh'),
    ('e-rickshaw', 'DEMO UP85 4004', 'Green', 2024, 'electric', 'Demo Driver Suresh')
  ) as v(type_key, reg, colour, year, fuel, driver_name)
  join public.ride_vehicle_types t on t.key = v.type_key
  join public.drivers d on d.full_name = v.driver_name
on conflict do nothing;

-- Phase 7: a demo restaurant, essentials shop and partner pharmacy with a
-- small menu, a platform rider and a food coupon. Names start with "Demo" —
-- remove before launch. The pharmacy licence number is a placeholder.
do $$
declare
  v_vendor uuid;
  v_store uuid;
  v_cat uuid;
  v_item uuid;
  v_group uuid;
begin
  if exists (select 1 from public.stores where slug like 'demo-%') then
    return;
  end if;

  -- Restaurant: pure-veg Sattvik thali house, open 7am to 11pm.
  insert into public.vendors (kind, name, slug, phone, status)
    values ('restaurant', 'Demo Brajwasi Bhojnalaya', 'demo-brajwasi-bhojnalaya', '+919800000101', 'active')
    returning id into v_vendor;
  insert into public.stores (vendor_id, kind, slug, name, description, cuisines, address, phone, lat, lng, pure_veg, hours,
    prep_minutes, min_order_paise, packaging_fee_paise, tax_bps, rating, is_featured, sort_order)
  values (v_vendor, 'restaurant', 'demo-brajwasi-bhojnalaya',
    '{"en": "Demo · Brajwasi Bhojnalaya", "hi": "डेमो · ब्रजवासी भोजनालय"}',
    '{"en": "Pure-veg thalis, kachori and lassi near Banke Bihari. No onion or garlic on request.", "hi": "बांके बिहारी के पास शुद्ध शाकाहारी थाली, कचौड़ी और लस्सी। अनुरोध पर बिना प्याज़-लहसुन।"}',
    '{North Indian,Thali,Sweets}', 'Near Banke Bihari Temple, Vrindavan', '+919800000101', 27.5800, 77.7000, true,
    '[{"day":1,"open":"07:00","close":"23:00"},{"day":2,"open":"07:00","close":"23:00"},{"day":3,"open":"07:00","close":"23:00"},{"day":4,"open":"07:00","close":"23:00"},{"day":5,"open":"07:00","close":"23:00"},{"day":6,"open":"07:00","close":"23:00"},{"day":7,"open":"07:00","close":"23:00"}]',
    20, 15000, 1000, 500, 4.4, true, 1)
  returning id into v_store;
  insert into public.store_zones (store_id, zone_id) select v_store, id from public.delivery_zones where slug in ('vrindavan', 'mathura');

  insert into public.store_categories (store_id, name, sort_order) values (v_store, '{"en": "Thalis", "hi": "थाली"}', 1) returning id into v_cat;
  insert into public.store_items (store_id, category_id, name, description, diet, is_jain, is_sattvik, price_paise, is_bestseller, sort_order)
  values (v_store, v_cat, '{"en": "Braj Thali", "hi": "ब्रज थाली"}',
    '{"en": "Dal, two sabzi, kadhi, rice, four rotis, salad and a sweet.", "hi": "दाल, दो सब्ज़ी, कढ़ी, चावल, चार रोटी, सलाद और मिठाई।"}',
    'veg', false, true, 22000, true, 1)
  returning id into v_item;
  insert into public.item_variants (item_id, name, price_paise, sort_order) values
    (v_item, '{"en": "Regular", "hi": "रेगुलर"}', 22000, 1),
    (v_item, '{"en": "Deluxe (with paneer)", "hi": "डीलक्स (पनीर के साथ)"}', 29000, 2);
  insert into public.item_addon_groups (item_id, name, min_select, max_select, sort_order)
    values (v_item, '{"en": "Extras", "hi": "अतिरिक्त"}', 0, 3, 1) returning id into v_group;
  insert into public.item_addons (group_id, name, price_paise, sort_order) values
    (v_group, '{"en": "Extra roti", "hi": "अतिरिक्त रोटी"}', 1500, 1),
    (v_group, '{"en": "Desi ghee on rotis", "hi": "रोटी पर देसी घी"}', 2000, 2),
    (v_group, '{"en": "Gulab jamun (2)", "hi": "गुलाब जामुन (2)"}', 4000, 3);
  insert into public.store_items (store_id, category_id, name, diet, is_jain, is_sattvik, price_paise, sort_order)
    values (v_store, v_cat, '{"en": "Jain Thali (no onion, garlic or root vegetables)", "hi": "जैन थाली (बिना प्याज़, लहसुन, जड़ वाली सब्ज़ी)"}',
      'veg', true, true, 24000, 2);

  insert into public.store_categories (store_id, name, sort_order) values (v_store, '{"en": "Snacks and sweets", "hi": "नाश्ता और मिठाई"}', 2) returning id into v_cat;
  insert into public.store_items (store_id, category_id, name, diet, is_sattvik, price_paise, track_stock, stock, is_bestseller, sort_order) values
    (v_store, v_cat, '{"en": "Kachori sabzi (2 pcs)", "hi": "कचौड़ी सब्ज़ी (2 पीस)"}', 'veg', false, 6000, false, null, true, 1),
    (v_store, v_cat, '{"en": "Mathura peda (250 g)", "hi": "मथुरा पेड़ा (250 ग्राम)"}', 'veg', true, 12000, true, 40, false, 2),
    (v_store, v_cat, '{"en": "Kesar lassi", "hi": "केसर लस्सी"}', 'veg', true, 7000, false, null, false, 3);

  -- Essentials: 24×7 store with stock counts and MRPs.
  insert into public.vendors (kind, name, slug, phone, status)
    values ('store', 'Demo Vrinda Mart', 'demo-vrinda-mart', '+919800000102', 'active')
    returning id into v_vendor;
  insert into public.stores (vendor_id, kind, slug, name, description, address, phone, lat, lng, is_24x7,
    prep_minutes, min_order_paise, tax_bps, is_featured, sort_order)
  values (v_vendor, 'grocery', 'demo-vrinda-mart', '{"en": "Demo · Vrinda Mart", "hi": "डेमो · वृंदा मार्ट"}',
    '{"en": "Daily needs, puja samagri and travel essentials, open all night.", "hi": "रोज़मर्रा का सामान, पूजा सामग्री और यात्रा की ज़रूरतें, पूरी रात खुला।"}',
    'Parikrama Marg, Vrindavan', '+919800000102', 27.5760, 77.6900, true, 10, 9900, 500, true, 2)
  returning id into v_store;
  insert into public.store_zones (store_id, zone_id) select v_store, id from public.delivery_zones where slug = 'vrindavan';
  insert into public.store_categories (store_id, name, sort_order) values (v_store, '{"en": "Daily needs", "hi": "रोज़ की ज़रूरतें"}', 1) returning id into v_cat;
  insert into public.store_items (store_id, category_id, name, diet, price_paise, mrp_paise, tax_bps, hsn, unit, track_stock, stock, sort_order) values
    (v_store, v_cat, '{"en": "Packaged drinking water", "hi": "पैक्ड पीने का पानी"}', 'na', 2000, 2000, 1800, '22011010', '1 L', true, 120, 1),
    (v_store, v_cat, '{"en": "Full cream milk", "hi": "फ़ुल क्रीम दूध"}', 'veg', 3300, 3400, 0, '04012000', '500 ml', true, 30, 2),
    (v_store, v_cat, '{"en": "Mosquito repellent cream", "hi": "मच्छर भगाने वाली क्रीम"}', 'na', 9000, 9900, 1800, '38089191', '50 g', true, 15, 3);
  insert into public.store_categories (store_id, name, sort_order) values (v_store, '{"en": "Puja samagri", "hi": "पूजा सामग्री"}', 2) returning id into v_cat;
  insert into public.store_items (store_id, category_id, name, diet, price_paise, mrp_paise, tax_bps, hsn, unit, track_stock, stock, sort_order) values
    (v_store, v_cat, '{"en": "Tulsi mala", "hi": "तुलसी माला"}', 'na', 5000, null, 500, '96020090', '108 beads', true, 25, 1),
    (v_store, v_cat, '{"en": "Agarbatti (sandalwood)", "hi": "अगरबत्ती (चंदन)"}', 'na', 4500, 5000, 500, '33074100', '100 g', true, 50, 2);

  -- Partner pharmacy: medicines only through prescription review and a quote.
  insert into public.vendors (kind, name, slug, phone, status)
    values ('pharmacy', 'Demo Shri Hari Medicos', 'demo-shri-hari-medicos', '+919800000103', 'active')
    returning id into v_vendor;
  insert into public.stores (vendor_id, kind, slug, name, description, address, phone, is_24x7, prep_minutes, tax_bps, drug_licence_no, sort_order)
  values (v_vendor, 'pharmacy', 'demo-shri-hari-medicos', '{"en": "Demo · Shri Hari Medicos", "hi": "डेमो · श्री हरि मेडिकोज़"}',
    '{"en": "Licensed partner pharmacy (demo).", "hi": "लाइसेंसधारी पार्टनर फ़ार्मेसी (डेमो)।"}',
    'Chhatikara Road, Vrindavan', '+919800000103', true, 15, 1200, 'DEMO-UP-MTH-0000/20B', 3)
  returning id into v_store;
  insert into public.store_zones (store_id, zone_id) select v_store, id from public.delivery_zones where slug in ('vrindavan', 'mathura');

  insert into public.delivery_partners (full_name, phone, vehicle, notes)
    values ('Demo Rider Gopal', '+919800000201', 'Scooter', 'Demo rider');
end
$$;

insert into public.coupons (code, description, discount_type, value, max_discount_paise, min_order_paise, services, is_public, per_user_limit)
values ('DEMOFOOD20', '{"en": "Demo · 20% off food (up to ₹100)", "hi": "डेमो · भोजन पर 20% छूट (₹100 तक)"}', 'percent', 2000, 10000, 20000, '{food}', true, 3)
on conflict (code) do nothing;

-- Phase 8: demo tour packages (names start with "Demo ·" — archive before
-- launch). Group departures are dated from today so they stay bookable.
insert into public.packages (slug, title, summary, description, category, destinations, start_city, duration_days, duration_nights,
  highlights, inclusions, exclusions, booking_mode, fixed_departures, min_pax, max_pax, is_featured, sort_order) values
  ('demo-vrindavan-mathura-govardhan',
   '{"en": "Demo · Vrindavan, Mathura & Govardhan", "hi": "डेमो · वृंदावन, मथुरा और गोवर्धन"}',
   '{"en": "Two relaxed days covering the main temples with a private car and guide", "hi": "निजी गाड़ी और गाइड के साथ मुख्य मंदिरों के दो आरामदायक दिन"}',
   '{"en": "A private tour on the date you choose. Darshan timings are planned around aarti so you never rush.", "hi": "आपकी चुनी तारीख़ पर निजी टूर। दर्शन का समय आरती के अनुसार तय होता है ताकि जल्दबाज़ी न हो।"}',
   'braj', '{Vrindavan,Mathura,Govardhan}', 'Vrindavan', 2, 1,
   '[{"en": "Banke Bihari and Prem Mandir evening aarti", "hi": "बांके बिहारी और प्रेम मंदिर की संध्या आरती"}, {"en": "Govardhan parikrama by car", "hi": "गाड़ी से गोवर्धन परिक्रमा"}]',
   '[{"en": "AC car with driver", "hi": "ड्राइवर सहित एसी गाड़ी"}, {"en": "1 night hotel stay", "hi": "1 रात होटल में ठहरना"}, {"en": "Breakfast", "hi": "नाश्ता"}, {"en": "Local guide", "hi": "स्थानीय गाइड"}]',
   '[{"en": "Lunch and dinner", "hi": "दोपहर और रात का भोजन"}, {"en": "Temple donations", "hi": "मंदिर दान"}]',
   'book', false, 1, 12, true, 1),
  ('demo-braj-84-kos-yatra',
   '{"en": "Demo · Braj 84 Kos Yatra", "hi": "डेमो · ब्रज 84 कोस यात्रा"}',
   '{"en": "Guided group yatra through the sacred groves and villages of Braj", "hi": "ब्रज के पवित्र वनों और गाँवों से होकर गाइडेड ग्रुप यात्रा"}',
   null, 'braj', '{Vrindavan,Govardhan,Barsana,Nandgaon,Gokul}', 'Vrindavan', 7, 6,
   '[{"en": "All 12 forests of Braj", "hi": "ब्रज के सभी 12 वन"}, {"en": "Daily satsang", "hi": "दैनिक सत्संग"}]',
   '[{"en": "AC coach", "hi": "एसी कोच"}, {"en": "6 nights dharamshala or hotel", "hi": "6 रात धर्मशाला या होटल"}, {"en": "All sattvik meals", "hi": "सभी सात्विक भोजन"}, {"en": "Yatra guide", "hi": "यात्रा गाइड"}]',
   '[{"en": "Travel to Vrindavan", "hi": "वृंदावन तक की यात्रा"}, {"en": "Personal expenses", "hi": "निजी ख़र्च"}]',
   'book', true, 1, 10, true, 2),
  ('demo-agra-mathura-vrindavan',
   '{"en": "Demo · Agra, Mathura & Vrindavan", "hi": "डेमो · आगरा, मथुरा और वृंदावन"}',
   '{"en": "The Taj Mahal with the birthplace and playground of Krishna", "hi": "ताजमहल के साथ कृष्ण की जन्मभूमि और लीलाभूमि"}',
   null, 'heritage', '{Agra,Mathura,Vrindavan}', 'Delhi', 3, 2,
   '[{"en": "Taj Mahal at sunrise", "hi": "सूर्योदय पर ताजमहल"}]',
   '[{"en": "AC car from Delhi", "hi": "दिल्ली से एसी गाड़ी"}, {"en": "2 nights hotel", "hi": "2 रात होटल"}, {"en": "Breakfast", "hi": "नाश्ता"}]',
   '[{"en": "Monument tickets", "hi": "स्मारक टिकट"}]',
   'enquiry', false, 1, 12, false, 3);

insert into public.package_pricing_tiers (package_id, min_pax, max_pax, adult_price_paise, child_price_paise)
select p.id, t.min_pax, t.max_pax, t.adult, t.child
  from public.packages p
  join (values
    ('demo-vrindavan-mathura-govardhan', 1, 2, 599900, 250000),
    ('demo-vrindavan-mathura-govardhan', 3, 5, 449900, 250000),
    ('demo-vrindavan-mathura-govardhan', 6, 12, 379900, 250000),
    ('demo-braj-84-kos-yatra', 1, 10, 1850000, 1200000),
    ('demo-agra-mathura-vrindavan', 1, 3, 899900, null),
    ('demo-agra-mathura-vrindavan', 4, 12, 699900, null)
  ) as t(slug, min_pax, max_pax, adult, child) on t.slug = p.slug;

insert into public.package_departures (package_id, start_date, seats_total, supplement_paise)
select p.id, current_date + d.days, 30, d.supplement
  from public.packages p
  cross join (values (20, 0), (50, 0), (80, 150000)) as d(days, supplement)
 where p.slug = 'demo-braj-84-kos-yatra';

insert into public.package_itinerary_days (package_id, day_number, title, description, meals, overnight)
select p.id, d.day, d.title::jsonb, d.description::jsonb, d.meals::text[], d.overnight
  from public.packages p
  join (values
    ('demo-vrindavan-mathura-govardhan', 1, '{"en": "Vrindavan temples", "hi": "वृंदावन के मंदिर"}', '{"en": "Banke Bihari, ISKCON, Nidhivan and Prem Mandir for the evening aarti.", "hi": "बांके बिहारी, इस्कॉन, निधिवन और संध्या आरती के लिए प्रेम मंदिर।"}', '{}', 'Vrindavan'),
    ('demo-vrindavan-mathura-govardhan', 2, '{"en": "Mathura and Govardhan", "hi": "मथुरा और गोवर्धन"}', '{"en": "Krishna Janmabhoomi, Vishram Ghat, then the Govardhan parikrama by car.", "hi": "कृष्ण जन्मभूमि, विश्राम घाट, फिर गाड़ी से गोवर्धन परिक्रमा।"}', '{breakfast}', null),
    ('demo-braj-84-kos-yatra', 1, '{"en": "Arrival and sankalp", "hi": "आगमन और संकल्प"}', null, '{dinner}', 'Vrindavan'),
    ('demo-braj-84-kos-yatra', 2, '{"en": "Madhuvan, Talvan and Kumudvan", "hi": "मधुवन, तालवन और कुमुदवन"}', null, '{breakfast,lunch,dinner}', 'Mathura'),
    ('demo-braj-84-kos-yatra', 3, '{"en": "Radha Kund and Govardhan", "hi": "राधा कुंड और गोवर्धन"}', null, '{breakfast,lunch,dinner}', 'Govardhan'),
    ('demo-braj-84-kos-yatra', 4, '{"en": "Kamyavan", "hi": "काम्यवन"}', null, '{breakfast,lunch,dinner}', 'Kaman'),
    ('demo-braj-84-kos-yatra', 5, '{"en": "Barsana and Nandgaon", "hi": "बरसाना और नंदगाँव"}', null, '{breakfast,lunch,dinner}', 'Barsana'),
    ('demo-braj-84-kos-yatra', 6, '{"en": "Gokul and Mahavan", "hi": "गोकुल और महावन"}', null, '{breakfast,lunch,dinner}', 'Vrindavan'),
    ('demo-braj-84-kos-yatra', 7, '{"en": "Closing puja and departure", "hi": "समापन पूजा और विदाई"}', null, '{breakfast}', null),
    ('demo-agra-mathura-vrindavan', 1, '{"en": "Delhi to Agra", "hi": "दिल्ली से आगरा"}', '{"en": "Drive to Agra, Agra Fort in the afternoon.", "hi": "आगरा तक ड्राइव, दोपहर में आगरा क़िला।"}', '{}', 'Agra'),
    ('demo-agra-mathura-vrindavan', 2, '{"en": "Taj Mahal and Mathura", "hi": "ताजमहल और मथुरा"}', null, '{breakfast}', 'Vrindavan'),
    ('demo-agra-mathura-vrindavan', 3, '{"en": "Vrindavan and return", "hi": "वृंदावन और वापसी"}', null, '{breakfast}', null)
  ) as d(slug, day, title, description, meals, overnight) on d.slug = p.slug;

-- Phase 9: sample plans on the B2B service pages (prices are examples; edit
-- them in Admin → CMS → Services before launch).
insert into public.service_plans (service_id, name, summary, price_paise, price_suffix, features, is_popular, sort_order)
select s.id, p.name::jsonb, p.summary::jsonb, p.price, p.suffix::jsonb, p.features::jsonb, p.popular, p.sort
  from public.services s
  join (values
    ('hotel-photography', '{"en": "Essential shoot", "hi": "बेसिक शूट"}', '{"en": "For small hotels and guest houses", "hi": "छोटे होटल और गेस्ट हाउस के लिए"}', 499900, null,
     '[{"en": "25 edited photos", "hi": "25 एडिट की हुई फ़ोटो"}, {"en": "Rooms, lobby and facade", "hi": "कमरे, लॉबी और बाहरी हिस्सा"}, {"en": "Delivery in 5 days", "hi": "5 दिन में डिलीवरी"}]', false, 1),
    ('hotel-photography', '{"en": "Listing booster", "hi": "लिस्टिंग बूस्टर"}', '{"en": "Photos and a short video for OTAs and Instagram", "hi": "OTA और इंस्टाग्राम के लिए फ़ोटो और छोटा वीडियो"}', 1199900, null,
     '[{"en": "60 edited photos", "hi": "60 एडिट की हुई फ़ोटो"}, {"en": "60-second walkthrough video", "hi": "60 सेकंड का वॉकथ्रू वीडियो"}, {"en": "Drone shot where allowed", "hi": "जहाँ अनुमति हो वहाँ ड्रोन शॉट"}]', true, 2),
    ('ota-handling', '{"en": "OTA management", "hi": "OTA प्रबंधन"}', '{"en": "We run your listings on the major travel sites", "hi": "हम प्रमुख ट्रैवल साइटों पर आपकी लिस्टिंग चलाते हैं"}', 799900, '{"en": "per month", "hi": "प्रति माह"}',
     '[{"en": "Rates and availability updated daily", "hi": "रोज़ाना रेट और उपलब्धता अपडेट"}, {"en": "Review replies", "hi": "रिव्यू के जवाब"}, {"en": "Monthly performance report", "hi": "मासिक प्रदर्शन रिपोर्ट"}]', true, 1),
    ('calling-centre', '{"en": "Booking desk", "hi": "बुकिंग डेस्क"}', '{"en": "Calls answered in your name, 8 am to 10 pm", "hi": "सुबह 8 से रात 10 बजे तक आपके नाम से कॉल का जवाब"}', 999900, '{"en": "per month", "hi": "प्रति माह"}',
     '[{"en": "Enquiries and booking help", "hi": "पूछताछ और बुकिंग में मदद"}, {"en": "Follow-up calls", "hi": "फ़ॉलो-अप कॉल"}, {"en": "Daily call report", "hi": "रोज़ाना कॉल रिपोर्ट"}]', false, 1),
    ('instagram-marketing', '{"en": "Reels starter", "hi": "रील्स स्टार्टर"}', '{"en": "Content that shows off your property or shop", "hi": "आपकी प्रॉपर्टी या दुकान को दिखाने वाला कंटेंट"}', 699900, '{"en": "per month", "hi": "प्रति माह"}',
     '[{"en": "8 reels and 8 posts", "hi": "8 रील्स और 8 पोस्ट"}, {"en": "Captions in Hindi and English", "hi": "हिंदी और अंग्रेज़ी में कैप्शन"}, {"en": "Posting schedule", "hi": "पोस्टिंग शेड्यूल"}]', true, 1),
    ('lead-generation', '{"en": "Leads package", "hi": "लीड्स पैकेज"}', '{"en": "Calling, Instagram and ads working together", "hi": "कॉलिंग, इंस्टाग्राम और विज्ञापन एक साथ"}', null, null,
     '[{"en": "Campaign setup", "hi": "कैंपेन सेटअप"}, {"en": "Leads called within the hour", "hi": "लीड्स को एक घंटे में कॉल"}, {"en": "Weekly lead report", "hi": "साप्ताहिक लीड रिपोर्ट"}]', false, 1),
    ('travel-agent', '{"en": "Travel desk partner", "hi": "ट्रैवल डेस्क पार्टनर"}', '{"en": "Plan and coordinate trips for your guests", "hi": "आपके मेहमानों की यात्राओं की योजना और समन्वय"}', null, null,
     '[{"en": "Customer records and trip plans", "hi": "ग्राहक रिकॉर्ड और यात्रा योजना"}, {"en": "Cabs, hotels and tickets in one place", "hi": "कैब, होटल और टिकट एक जगह"}]', false, 1)
  ) as p(slug, name, summary, price, suffix, features, popular, sort) on p.slug = s.slug;
