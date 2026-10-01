-- Demo content so a fresh local database looks alive (`supabase db reset`).
-- Not applied to production by `supabase db push`. Hotels, routes, drivers
-- and restaurants are seeded by the phases that create those tables.

insert into public.offers_banners (tab, title, subtitle, coupon_code, cta_label, href, accent, sort_order) values
  ('all', '{"en": "Kartik Maas Special", "hi": "कार्तिक मास स्पेशल"}', '{"en": "Up to 20% off stays near Banke Bihari", "hi": "बांके बिहारी के पास ठहरने पर 20% तक की छूट"}', 'KARTIK20', '{"en": "Book now", "hi": "अभी बुक करें"}', '/services/hotel-vendors', 'pink', 1),
  ('cabs', '{"en": "Braj Darshan Day Tour", "hi": "ब्रज दर्शन डे टूर"}', '{"en": "Mathura · Vrindavan · Govardhan · Barsana in one day", "hi": "एक दिन में मथुरा · वृंदावन · गोवर्धन · बरसाना"}', 'BRAJ500', '{"en": "Book cab", "hi": "कैब बुक करें"}', '/services/car', 'red', 2),
  ('food', '{"en": "Sattvik thali, delivered", "hi": "सात्विक थाली, आपके दरवाज़े पर"}', '{"en": "Flat ₹50 off your first order", "hi": "पहले ऑर्डर पर ₹50 की छूट"}', 'FIRSTFOOD', '{"en": "Order food", "hi": "खाना ऑर्डर करें"}', '/services/food', 'orange', 3),
  ('hotels', '{"en": "Long Weekend Sale", "hi": "लॉन्ग वीकेंड सेल"}', '{"en": "Extra 10% off on 2+ nights", "hi": "2+ रातों पर अतिरिक्त 10% छूट"}', 'LONGWKND', '{"en": "See hotels", "hi": "होटल देखें"}', '/services/hotel-vendors', 'blue', 4),
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
