-- Phase 2: baseline content every environment needs (services, home
-- sections, navigation, settings, flags, cities). Idempotent: existing rows
-- edited in the admin are never overwritten. Demo content lives in seed.sql.

insert into public.cities (slug, name, lat, lng, sort_order) values
  ('vrindavan', '{"en": "Vrindavan", "hi": "वृंदावन"}', 27.5650, 77.6593, 1),
  ('mathura',   '{"en": "Mathura", "hi": "मथुरा"}',     27.4924, 77.6737, 2),
  ('govardhan', '{"en": "Govardhan", "hi": "गोवर्धन"}', 27.4970, 77.4610, 3),
  ('barsana',   '{"en": "Barsana", "hi": "बरसाना"}',    27.6490, 77.3780, 4),
  ('agra',      '{"en": "Agra", "hi": "आगरा"}',         27.1767, 78.0081, 5)
on conflict (slug) do nothing;

insert into public.areas (city_id, slug, name, kind, lat, lng, sort_order)
select c.id, a.slug, a.name::jsonb, a.kind, a.lat, a.lng, a.sort_order
from (values
  ('vrindavan', 'banke-bihari',  '{"en": "Banke Bihari Temple", "hi": "बांके बिहारी मंदिर"}', 'temple',   27.5803, 77.7006, 1),
  ('vrindavan', 'prem-mandir',   '{"en": "Prem Mandir", "hi": "प्रेम मंदिर"}',               'temple',   27.5717, 77.6720, 2),
  ('vrindavan', 'iskcon',        '{"en": "ISKCON Temple", "hi": "इस्कॉन मंदिर"}',             'temple',   27.5727, 77.6799, 3),
  ('vrindavan', 'nidhivan',      '{"en": "Nidhivan", "hi": "निधिवन"}',                       'temple',   27.5826, 77.6990, 4),
  ('vrindavan', 'vrindavan-road','{"en": "Vrindavan Road Station", "hi": "वृंदावन रोड स्टेशन"}', 'station', 27.5326, 77.6512, 5),
  ('mathura',   'mathura-jn',    '{"en": "Mathura Junction", "hi": "मथुरा जंक्शन"}',          'station',  27.4813, 77.6747, 1),
  ('mathura',   'janmabhoomi',   '{"en": "Krishna Janmabhoomi", "hi": "कृष्ण जन्मभूमि"}',     'temple',   27.5047, 77.6697, 2),
  ('agra',      'agra-cantt',    '{"en": "Agra Cantt Station", "hi": "आगरा कैंट स्टेशन"}',   'station',  27.1590, 77.9900, 1)
) as a(city_slug, slug, name, kind, lat, lng, sort_order)
join public.cities c on c.slug = a.city_slug
on conflict (city_id, slug) do nothing;

insert into public.services (slug, kind, accent, icon, name, summary, highlights, sort_order, show_in_nav) values
  ('travel-hotel-booking', 'bookable', 'blue', 'plane',
   '{"en": "Travel & Hotel Booking", "hi": "ट्रैवल और होटल बुकिंग"}',
   '{"en": "Flight, train, bus, hotel and tour packages.", "hi": "फ़्लाइट, ट्रेन, बस, होटल और टूर पैकेज।"}',
   '[{"en": "Hotels near every major temple", "hi": "हर बड़े मंदिर के पास होटल"}, {"en": "Agent-assisted flight, train and bus tickets", "hi": "एजेंट की मदद से फ़्लाइट, ट्रेन और बस टिकट"}, {"en": "Braj darshan tour packages", "hi": "ब्रज दर्शन टूर पैकेज"}]',
   1, true),
  ('travel-agent', 'enquiry', 'teal', 'user-round',
   '{"en": "Travel Agent & Data", "hi": "ट्रैवल एजेंट और डेटा"}',
   '{"en": "Customer management, travel planning and coordination.", "hi": "ग्राहक प्रबंधन, यात्रा योजना और समन्वय।"}',
   '[]', 2, false),
  ('hotel-photography', 'enquiry', 'blue', 'camera',
   '{"en": "Hotel Photography", "hi": "होटल फ़ोटोग्राफ़ी"}',
   '{"en": "Quality photos and videos for better visibility.", "hi": "बेहतर दृश्यता के लिए अच्छी गुणवत्ता की फ़ोटो और वीडियो।"}',
   '[]', 3, false),
  ('calling-centre', 'enquiry', 'purple', 'headset',
   '{"en": "Calling Centre", "hi": "कॉलिंग सेंटर"}',
   '{"en": "Enquiry, booking assistance, follow-ups and customer support.", "hi": "पूछताछ, बुकिंग सहायता, फ़ॉलो-अप और ग्राहक सहायता।"}',
   '[]', 4, false),
  ('hotel-vendors', 'bookable', 'pink', 'building-2',
   '{"en": "Hotel Vendor Network", "hi": "होटल वेंडर नेटवर्क"}',
   '{"en": "Best hotels, verified partners and attractive options.", "hi": "बेहतरीन होटल, सत्यापित पार्टनर और आकर्षक विकल्प।"}',
   '[{"en": "Verified partner hotels", "hi": "सत्यापित पार्टनर होटल"}, {"en": "Couple-friendly and family stays", "hi": "कपल-फ़्रेंडली और फ़ैमिली स्टे"}]',
   5, true),
  ('ota-handling', 'enquiry', 'teal', 'monitor-cog',
   '{"en": "OTA Handling", "hi": "ओटीए हैंडलिंग"}',
   '{"en": "Inventory, rates, availability, listings and more.", "hi": "इन्वेंट्री, रेट, उपलब्धता, लिस्टिंग और बहुत कुछ।"}',
   '[]', 6, false),
  ('bike', 'bookable', 'green', 'bike',
   '{"en": "Bike Pick & Drop", "hi": "बाइक पिक और ड्रॉप"}',
   '{"en": "Fast and reliable bike service across Vrindavan.", "hi": "पूरे वृंदावन में तेज़ और भरोसेमंद बाइक सेवा।"}',
   '[]', 7, true),
  ('rickshaw', 'bookable', 'amber', 'car-taxi-front',
   '{"en": "Rickshaw / E-Rickshaw Pick & Drop", "hi": "रिक्शा / ई-रिक्शा पिक और ड्रॉप"}',
   '{"en": "Local transport for your short and long rides.", "hi": "छोटी और लंबी सवारी के लिए स्थानीय परिवहन।"}',
   '[]', 8, true),
  ('car', 'bookable', 'red', 'car',
   '{"en": "Car Pick & Drop", "hi": "कार पिक और ड्रॉप"}',
   '{"en": "Comfortable and safe car service for all your travel needs.", "hi": "आपकी हर यात्रा के लिए आरामदायक और सुरक्षित कार सेवा।"}',
   '[{"en": "Airport and station transfers", "hi": "एयरपोर्ट और स्टेशन ट्रांसफ़र"}, {"en": "Outstation and local packages", "hi": "आउटस्टेशन और लोकल पैकेज"}]',
   9, true),
  ('food', 'bookable', 'orange', 'utensils-crossed',
   '{"en": "24×7 Food Delivery", "hi": "24×7 फ़ूड डिलीवरी"}',
   '{"en": "Your favourite food, anytime, anywhere.", "hi": "आपका पसंदीदा खाना, कभी भी, कहीं भी।"}',
   '[{"en": "Sattvik and Jain options", "hi": "सात्विक और जैन विकल्प"}]', 10, true),
  ('essentials', 'bookable', 'magenta', 'shopping-cart',
   '{"en": "24×7 Essentials Delivery", "hi": "24×7 ज़रूरी सामान डिलीवरी"}',
   '{"en": "Groceries, daily-use items and travel essentials.", "hi": "किराना, रोज़मर्रा की चीज़ें और यात्रा का ज़रूरी सामान।"}',
   '[]', 11, true),
  ('medicine', 'bookable', 'indigo', 'pill',
   '{"en": "Medicine Delivery Assistance", "hi": "दवा डिलीवरी सहायता"}',
   '{"en": "Genuine medicine delivery through trusted partners.", "hi": "भरोसेमंद पार्टनर के ज़रिए असली दवाओं की डिलीवरी।"}',
   '[{"en": "Delivered only by licensed partner pharmacies", "hi": "केवल लाइसेंसशुदा पार्टनर फ़ार्मेसी से डिलीवरी"}]', 12, true),
  ('instagram-marketing', 'enquiry', 'pink', 'clapperboard',
   '{"en": "Instagram Posts & Reels Marketing", "hi": "इंस्टाग्राम पोस्ट और रील्स मार्केटिंग"}',
   '{"en": "Grow your brand with creative content and digital reach.", "hi": "रचनात्मक कंटेंट और डिजिटल पहुँच से अपना ब्रांड बढ़ाएँ।"}',
   '[]', 13, false),
  ('lead-generation', 'enquiry', 'teal', 'megaphone',
   '{"en": "Calling + Instagram + Lead Generation", "hi": "कॉलिंग + इंस्टाग्राम + लीड जनरेशन"}',
   '{"en": "More visibility. More leads. More business.", "hi": "ज़्यादा दृश्यता। ज़्यादा लीड। ज़्यादा व्यापार।"}',
   '[]', 14, false)
on conflict (slug) do nothing;

insert into public.cms_sections (page, key, type, title, subtitle, content, sort_order) values
  ('home', 'hero', 'hero',
   '{"en": "Your One Stop Travel & Service Partner", "hi": "आपका वन स्टॉप ट्रैवल और सर्विस पार्टनर"}',
   '{"en": "Hotels, cabs, local rides, food, essentials and medicine delivery across Vrindavan, Mathura and the Braj region, all in one trusted place.", "hi": "वृंदावन, मथुरा और पूरे ब्रज क्षेत्र में होटल, कैब, लोकल सवारी, भोजन, ज़रूरी सामान और दवा डिलीवरी, सब एक भरोसेमंद जगह पर।"}',
   '{"tagline": {"en": "Connecting Travel, Hospitality & Local Services in Vrindavan", "hi": "वृंदावन में यात्रा, आतिथ्य और स्थानीय सेवाओं को जोड़ते हुए"}, "search_tabs": ["hotels", "cabs", "rides", "packages", "travel"]}',
   1),
  ('home', 'pillars', 'pillars', null, null,
   '{"items": [{"icon": "compass", "label": {"en": "Travel Made Easy", "hi": "आसान यात्रा"}}, {"icon": "house", "label": {"en": "Stay Comfortable", "hi": "आरामदायक ठहराव"}}, {"icon": "car", "label": {"en": "Travel Local", "hi": "लोकल सफ़र"}}, {"icon": "heart", "label": {"en": "Serving Vrindavan", "hi": "वृंदावन की सेवा में"}}]}',
   2),
  ('home', 'offers', 'offers',
   '{"en": "Offers for you", "hi": "आपके लिए ऑफ़र"}', null, '{}', 3),
  ('home', 'services', 'services',
   '{"en": "Our Services", "hi": "हमारी सेवाएँ"}',
   '{"en": "Book, order or enquire. Everything you need in Vrindavan, from one place.", "hi": "बुक करें, ऑर्डर करें या पूछताछ करें। वृंदावन में आपकी हर ज़रूरत, एक ही जगह से।"}',
   '{}', 4),
  ('home', 'about', 'about',
   '{"en": "About Us", "hi": "हमारे बारे में"}', null,
   '{"body": {"en": "The P & S Traveler Group is a Vrindavan-based travel, hotel and local services company, dedicated to making your journey, stay and daily needs easier, faster and more convenient. We bring together travel, hospitality, transportation, delivery and digital marketing services under one trusted platform.", "hi": "द पी एंड एस ट्रैवलर ग्रुप वृंदावन स्थित एक ट्रैवल, होटल और स्थानीय सेवा कंपनी है, जो आपकी यात्रा, ठहराव और रोज़मर्रा की ज़रूरतों को आसान, तेज़ और सुविधाजनक बनाने के लिए समर्पित है। हम यात्रा, आतिथ्य, परिवहन, डिलीवरी और डिजिटल मार्केटिंग सेवाओं को एक भरोसेमंद प्लेटफ़ॉर्म पर लाते हैं।"}}',
   5),
  ('home', 'testimonials', 'testimonials',
   '{"en": "What pilgrims say", "hi": "यात्री क्या कहते हैं"}', null, '{}', 6),
  ('home', 'why-collaborate', 'why_collaborate',
   '{"en": "Why Collaborate With Us?", "hi": "हमारे साथ क्यों जुड़ें?"}', null,
   '{"partner_types": [{"en": "Hotels & Resorts", "hi": "होटल और रिसॉर्ट"}, {"en": "Travel Agencies", "hi": "ट्रैवल एजेंसियाँ"}, {"en": "Restaurant & Food Businesses", "hi": "रेस्टोरेंट और फ़ूड व्यवसाय"}, {"en": "Transport Providers", "hi": "परिवहन प्रदाता"}, {"en": "Local Shops & Service Providers", "hi": "स्थानीय दुकानें और सेवा प्रदाता"}, {"en": "Other Vendors & Service Partners", "hi": "अन्य वेंडर और सेवा पार्टनर"}], "points": [{"icon": "map-pin", "text": {"en": "Vrindavan-focused local network", "hi": "वृंदावन-केंद्रित स्थानीय नेटवर्क"}}, {"icon": "share-2", "text": {"en": "Multiple services under one platform", "hi": "एक प्लेटफ़ॉर्म पर कई सेवाएँ"}}, {"icon": "users", "text": {"en": "Customer lead sharing & coordination", "hi": "ग्राहक लीड साझा करना और समन्वय"}}, {"icon": "trending-up", "text": {"en": "Marketing & promotion opportunities", "hi": "मार्केटिंग और प्रमोशन के अवसर"}}, {"icon": "shield-check", "text": {"en": "Long-term and trusted business partnerships", "hi": "लंबी और भरोसेमंद व्यावसायिक साझेदारी"}}]}',
   7),
  ('home', 'partner-cta', 'partner_cta',
   '{"en": "Together We Grow Stronger", "hi": "साथ मिलकर और मज़बूत"}',
   '{"en": "Hotels, travel agencies, restaurants, transport providers and local shops: join the Vrindavan-focused network.", "hi": "होटल, ट्रैवल एजेंसियाँ, रेस्टोरेंट, परिवहन प्रदाता और स्थानीय दुकानें: वृंदावन-केंद्रित नेटवर्क से जुड़ें।"}',
   '{"cta_label": {"en": "Partner with us", "hi": "हमारे साथ जुड़ें"}, "href": "/partner"}',
   8)
on conflict (page, key) do nothing;

insert into public.navigation_links (menu, label, href, sort_order)
select v.menu, v.label::jsonb, v.href, v.sort_order
from (values
  ('header', '{"en": "Hotels", "hi": "होटल"}',                     '/services/hotel-vendors', 1),
  ('header', '{"en": "Cabs", "hi": "कैब"}',                        '/services/car', 2),
  ('header', '{"en": "Bikes", "hi": "बाइक"}',                      '/services/bike', 3),
  ('header', '{"en": "Rickshaw", "hi": "रिक्शा"}',                  '/services/rickshaw', 4),
  ('header', '{"en": "Food", "hi": "भोजन"}',                       '/services/food', 5),
  ('header', '{"en": "Essentials", "hi": "ज़रूरी सामान"}',          '/services/essentials', 6),
  ('header', '{"en": "Medicine", "hi": "दवाइयाँ"}',                 '/services/medicine', 7),
  ('header', '{"en": "Packages", "hi": "पैकेज"}',                   '/services/travel-hotel-booking', 8),
  ('header', '{"en": "Flights / Trains / Buses", "hi": "फ़्लाइट / ट्रेन / बस"}', '/services/travel-agent', 9),
  ('header', '{"en": "Partner With Us", "hi": "हमारे साथ जुड़ें"}',  '/partner', 10),
  ('footer_company', '{"en": "About us", "hi": "हमारे बारे में"}',   '/#about', 1),
  ('footer_company', '{"en": "All services", "hi": "सभी सेवाएँ"}',  '/services', 2),
  ('footer_company', '{"en": "Partner With Us", "hi": "हमारे साथ जुड़ें"}', '/partner', 3)
) as v(menu, label, href, sort_order)
where not exists (select 1 from public.navigation_links);

insert into public.settings (key, value, is_public, description) values
  ('business.profile', '{"name": "The P & S Traveler Group", "phone": "", "whatsapp": "", "email": "", "address": "Vrindavan, Uttar Pradesh, India", "gstin": ""}', true, 'Business name and contact details shown on the site and invoices'),
  ('business.social', '{"instagram": "", "facebook": "", "youtube": ""}', true, 'Social profile URLs'),
  ('payments.defaults', '{"advance_percent": 25, "convenience_fee_paise": 0, "pay_at_hotel_enabled": false}', false, 'Payment defaults (used from phase 4)')
on conflict (key) do nothing;

insert into public.feature_flags (key, enabled, description) values
  ('site.maintenance_mode', false, 'Show a maintenance page to non-staff visitors'),
  ('booking.hotels', false, 'Hotel booking open to customers (phase 3-4)'),
  ('booking.cabs', false, 'Cab booking open to customers (phase 5)'),
  ('i18n.hindi', true, 'Hindi language available on the public site')
on conflict (key) do nothing;
