-- Phase 8: baseline settings, flags and templates for packages, travel
-- enquiries and the leads CRM. Idempotent; everything here is
-- admin-editable (Admin → Packages / Leads, Settings → Packages & leads,
-- Notifications).

insert into public.settings (key, value, is_public, description) values
  ('packages.defaults',
   '{"advance_percent": 25, "hold_minutes": 20, "book_until_days": 2, "max_travellers": 20, "cancellation_policy": {"en": "Free cancellation up to 15 days before departure. 50% of the package price is charged between 15 and 7 days, and the full price within 7 days of departure. The advance is adjusted against these charges.", "hi": "प्रस्थान से 15 दिन पहले तक मुफ़्त रद्दीकरण। 15 से 7 दिन के बीच पैकेज मूल्य का 50% और प्रस्थान से 7 दिन के भीतर पूरा मूल्य लिया जाता है। अग्रिम राशि इन शुल्कों में समायोजित की जाती है।"}}',
   true,
   'Tour packages: online advance %, how long an unpaid booking holds seats, how many days before departure online booking closes, most travellers per booking, cancellation policy shown on every package'),
  ('leads.defaults',
   '{"auto_assign": "least_loaded", "max_per_phone_per_hour": 5, "first_follow_up_hours": 2, "quote_valid_hours": 48, "quote_tax_bps": 500, "quote_sac": "998555", "sources": ["website", "whatsapp", "instagram", "facebook", "google", "calling", "walk_in", "referral", "other"], "lost_reasons": ["Price too high", "Booked elsewhere", "Plans cancelled", "Not reachable", "Just enquiring", "Other"]}',
   false,
   'Leads CRM: auto-assignment (least_loaded or none), enquiry throttle per phone, first follow-up delay, quote validity and default GST, lead sources and lost reasons'),
  ('travel.defaults',
   '{"provider": "manual", "max_travellers": 9, "classes": {"flight": ["economy", "premium_economy", "business"], "train": ["SL", "3A", "2A", "1A", "CC", "EC"], "bus": ["seater", "sleeper", "ac_seater", "ac_sleeper"]}, "notice": {"en": "Tell us where and when; our travel desk replies with the best fares, usually within an hour (8 am to 10 pm). You pay only after you approve the quote.", "hi": "बताइए कहाँ और कब जाना है; हमारी ट्रैवल डेस्क आमतौर पर एक घंटे में (सुबह 8 से रात 10 बजे) सबसे अच्छे किराए के साथ जवाब देती है। कोटेशन मंज़ूर करने के बाद ही भुगतान करें।"}}',
   true,
   'Flights, trains and buses: inventory provider (manual = enquiry and quote), most travellers per enquiry, classes offered per mode, notice shown on the search form')
on conflict (key) do nothing;

insert into public.feature_flags (key, enabled, description) values
  ('booking.packages', false, 'Online booking with advance for packages set to "book" (phase 8); enquiries are always open')
on conflict (key) do nothing;

-- The header Packages and Flights / Trains / Buses tabs now open their pages.
update public.navigation_links set href = '/packages' where menu = 'header' and href = '/services/travel-hotel-booking';
update public.navigation_links set href = '/travel' where menu = 'header' and href = '/services/travel-agent';

insert into public.notification_templates (key, channel, locale, subject, body) values
  ('lead.received', 'email', 'en', 'We got your enquiry · {{reference}}',
   E'Namaste {{name}},\n\nThank you for your enquiry about {{summary}}.\nReference: {{reference}}\n\nOur travel desk will call or WhatsApp you shortly with options and prices.\n\nThe P & S Traveler Group'),
  ('lead.received', 'email', 'hi', 'आपकी पूछताछ मिल गई · {{reference}}',
   E'नमस्ते {{name}},\n\n{{summary}} के बारे में पूछताछ के लिए धन्यवाद।\nसंदर्भ: {{reference}}\n\nहमारी ट्रैवल डेस्क जल्द ही विकल्पों और कीमतों के साथ आपको कॉल या व्हाट्सऐप करेगी।\n\nद पी एंड एस ट्रैवलर ग्रुप'),
  ('lead.received', 'sms', 'en', null,
   'P&S Traveler: enquiry {{reference}} received for {{summary}}. Our travel desk will contact you shortly.'),
  ('lead.assigned', 'email', 'en', 'New lead {{reference}} · {{summary}}',
   E'A lead has been assigned to you.\n\n{{reference}} · {{summary}}\nName: {{name}}\nPhone: {{phone}}\nSource: {{source}}\n\nOpen it: {{lead_url}}'),
  ('quote.sent', 'email', 'en', 'Your quote · {{title}}',
   E'Namaste {{name}},\n\nHere is your quote for {{title}}.\nTotal: {{total}}\nPay now to confirm: {{pay_now}}\nValid until: {{valid_until}}\n\nSee the details and pay securely: {{quote_url}}\n\nQuestions? Just reply or call us.\n\nThe P & S Traveler Group'),
  ('quote.sent', 'email', 'hi', 'आपका कोटेशन · {{title}}',
   E'नमस्ते {{name}},\n\n{{title}} के लिए आपका कोटेशन तैयार है।\nकुल: {{total}}\nकन्फ़र्म करने के लिए अभी भुगतान: {{pay_now}}\nमान्य: {{valid_until}} तक\n\nविवरण देखें और सुरक्षित भुगतान करें: {{quote_url}}\n\nकोई सवाल? जवाब दें या हमें कॉल करें।\n\nद पी एंड एस ट्रैवलर ग्रुप'),
  ('quote.sent', 'sms', 'en', null,
   'P&S Traveler: your quote for {{title}} is {{total}} (pay {{pay_now}} to confirm), valid till {{valid_until}}. {{quote_url}}'),
  ('quote.sent', 'whatsapp', 'en', null,
   E'Namaste {{name}} 🙏 Your quote for *{{title}}* is ready.\nTotal: *{{total}}* · Pay now: *{{pay_now}}*\nValid till {{valid_until}}.\n\nDetails and secure payment: {{quote_url}}'),
  ('quote.sent', 'whatsapp', 'hi', null,
   E'नमस्ते {{name}} 🙏 *{{title}}* के लिए आपका कोटेशन तैयार है।\nकुल: *{{total}}* · अभी भुगतान: *{{pay_now}}*\n{{valid_until}} तक मान्य।\n\nविवरण और सुरक्षित भुगतान: {{quote_url}}'),
  ('package.confirmed', 'email', 'en', 'Tour booked · {{code}}',
   E'Namaste {{name}},\n\nYour tour {{hotel}} is booked.\nBooking ID: {{code}}\nDeparture: {{check_in}}\nTravellers: {{guests}}\nTotal: {{total}} · Paid: {{paid}} · Balance: {{balance}}\n\nOur team will call you before departure with pickup details.\nView your booking: {{trip_url}}\n\nThe P & S Traveler Group'),
  ('package.confirmed', 'email', 'hi', 'टूर बुक हो गया · {{code}}',
   E'नमस्ते {{name}},\n\nआपका टूर {{hotel}} बुक हो गया है।\nबुकिंग आईडी: {{code}}\nप्रस्थान: {{check_in}}\nयात्री: {{guests}}\nकुल: {{total}} · भुगतान: {{paid}} · शेष: {{balance}}\n\nप्रस्थान से पहले हमारी टीम पिकअप की जानकारी के लिए कॉल करेगी।\nअपनी बुकिंग देखें: {{trip_url}}\n\nद पी एंड एस ट्रैवलर ग्रुप'),
  ('package.confirmed', 'sms', 'en', null,
   'P&S Traveler: tour {{code}} booked, departure {{check_in}}. Paid {{paid}}, balance {{balance}}. {{trip_url}}'),
  ('travel.confirmed', 'email', 'en', 'Payment received · {{code}}',
   E'Namaste {{name}},\n\nWe received {{paid}} for {{hotel}}.\nBooking ID: {{code}}\nTotal: {{total}} · Balance: {{balance}}\n\nOur travel desk is issuing your tickets and will send them to you shortly.\n\nThe P & S Traveler Group'),
  ('travel.confirmed', 'email', 'hi', 'भुगतान मिल गया · {{code}}',
   E'नमस्ते {{name}},\n\n{{hotel}} के लिए हमें {{paid}} मिल गए हैं।\nबुकिंग आईडी: {{code}}\nकुल: {{total}} · शेष: {{balance}}\n\nहमारी ट्रैवल डेस्क आपके टिकट बना रही है और जल्द ही भेज देगी।\n\nद पी एंड एस ट्रैवलर ग्रुप'),
  ('travel.confirmed', 'sms', 'en', null,
   'P&S Traveler: payment {{paid}} received for {{code}}. Your tickets will be sent shortly.'),
  -- Quick replies agents open in WhatsApp from the CRM.
  ('crm.intro', 'whatsapp', 'en', null,
   E'Namaste {{name}} 🙏 This is {{agent}} from The P & S Traveler Group. Thank you for your enquiry about {{summary}} ({{reference}}). When is a good time to talk?'),
  ('crm.intro', 'whatsapp', 'hi', null,
   E'नमस्ते {{name}} 🙏 मैं द पी एंड एस ट्रैवलर ग्रुप से {{agent}} बोल रहा/रही हूँ। {{summary}} ({{reference}}) के बारे में आपकी पूछताछ के लिए धन्यवाद। बात करने का सही समय क्या रहेगा?'),
  ('crm.follow_up', 'whatsapp', 'en', null,
   E'Namaste {{name}} 🙏 Just checking in about {{summary}} ({{reference}}). Shall I hold the price for you or share a few more options?'),
  ('crm.follow_up', 'whatsapp', 'hi', null,
   E'नमस्ते {{name}} 🙏 {{summary}} ({{reference}}) के बारे में जानना चाहते थे। क्या मैं यह कीमत आपके लिए रोक दूँ या कुछ और विकल्प भेजूँ?'),
  ('crm.follow_up', 'email', 'en', 'About your enquiry · {{reference}}',
   E'Namaste {{name}},\n\nJust checking in about {{summary}}. Reply to this email or call us and we will hold the best price for you.\n\n{{agent}}\nThe P & S Traveler Group')
on conflict (key, channel, locale) do nothing;
