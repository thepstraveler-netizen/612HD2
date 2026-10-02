-- Phase 9: baseline settings and templates for partner onboarding and vendor
-- settlements. Idempotent; everything here is admin-editable (Settings →
-- Partners & settlements, Notifications).

insert into public.settings (key, value, is_public, description) values
  ('partners.defaults',
   '{"business_types": ["hotel", "travel_agency", "restaurant", "transport", "shop", "pharmacy", "service_provider", "other"],
     "required_documents": {
       "hotel": ["id_proof", "pan", "property_proof"],
       "travel_agency": ["id_proof", "pan"],
       "restaurant": ["id_proof", "pan", "fssai"],
       "transport": ["id_proof", "pan", "vehicle_rc"],
       "shop": ["id_proof", "pan"],
       "pharmacy": ["id_proof", "pan", "drug_licence"],
       "service_provider": ["id_proof"],
       "other": ["id_proof"]
     },
     "commission_bps": {"hotel": 1500, "travel_agency": 1000, "restaurant": 1500, "transport": 1000, "shop": 1000, "pharmacy": 800, "service_provider": 1000, "other": 1000},
     "max_file_mb": 8,
     "agreement": {
       "version": "2026-10",
       "body": {
         "en": "1. You confirm that the business details and documents you shared are true and that you hold every licence your business needs.\n2. The P & S Traveler Group lists your services and sends you bookings, orders and leads. You agree to honour confirmed bookings at the prices and policies shown on the platform.\n3. The platform charges the commission agreed at approval on the value of each completed booking. GST applies on the commission. Tax deducted or collected at source is shown on your statement where the law requires it.\n4. Money the platform collects for you is settled to your bank account or UPI after deducting commission and taxes, on the settlement cycle shown in your dashboard. Money you collect directly (pay at hotel, balance to the driver) counts against what you owe the platform.\n5. You keep customer data private and use it only to serve the booking.\n6. Either side may end the partnership with 15 days written notice. Confirmed bookings before that date must still be honoured.",
         "hi": "1. आप पुष्टि करते हैं कि आपके द्वारा दी गई व्यवसाय की जानकारी और दस्तावेज़ सही हैं और आपके पास व्यवसाय के लिए आवश्यक सभी लाइसेंस हैं।\n2. द पी एंड एस ट्रैवलर ग्रुप आपकी सेवाएँ दिखाता है और आपको बुकिंग, ऑर्डर और लीड भेजता है। आप प्लेटफ़ॉर्म पर दिखाए गए मूल्य और नियमों पर कन्फ़र्म बुकिंग पूरी करने के लिए सहमत हैं।\n3. प्लेटफ़ॉर्म हर पूरी हुई बुकिंग के मूल्य पर स्वीकृति के समय तय कमीशन लेता है। कमीशन पर GST लागू है। जहाँ क़ानून कहता है, स्रोत पर काटा या लिया गया कर आपके स्टेटमेंट में दिखाया जाता है।\n4. प्लेटफ़ॉर्म द्वारा आपके लिए लिया गया पैसा कमीशन और कर काटकर आपके बैंक खाते या UPI में डैशबोर्ड में दिखाए गए सेटलमेंट चक्र पर भेजा जाता है। आप जो पैसा सीधे लेते हैं (होटल पर भुगतान, ड्राइवर को शेष राशि), वह प्लेटफ़ॉर्म को देय राशि में गिना जाता है।\n5. आप ग्राहकों की जानकारी गोपनीय रखेंगे और उसका उपयोग केवल बुकिंग पूरी करने के लिए करेंगे।\n6. कोई भी पक्ष 15 दिन के लिखित नोटिस से साझेदारी समाप्त कर सकता है। उस तारीख़ से पहले की कन्फ़र्म बुकिंग फिर भी पूरी करनी होंगी।"
       }
     }
   }',
   true,
   'Partner With Us: business types offered, documents asked for each type, default commission per type (basis points), largest upload in MB, and the partner agreement (bump the version when the text changes)'),
  ('settlements.defaults',
   '{"commission_tax_bps": 1800, "tcs_bps": 0, "tds_bps": 0, "cycle_days": 7, "provider": "manual"}',
   false,
   'Vendor settlements: GST on commission, TCS and TDS rates in basis points (set with your CA; 0 = not deducted), settlement cycle in days shown to vendors, payout provider (manual; razorpay_route is not switched on)')
on conflict (key) do nothing;

insert into public.notification_templates (key, channel, locale, subject, body) values
  ('partner.application_received', 'email', 'en', 'We received your partner application · {{reference}}',
   E'Namaste {{name}},\n\nThank you for applying to partner with The P & S Traveler Group.\nApplication: {{reference}} · {{business}}\n\nOur partnerships team will review your details and documents and get back to you shortly.\n\nThe P & S Traveler Group'),
  ('partner.application_received', 'email', 'hi', 'आपका पार्टनर आवेदन मिल गया · {{reference}}',
   E'नमस्ते {{name}},\n\nद पी एंड एस ट्रैवलर ग्रुप के साथ साझेदारी के लिए आवेदन करने के लिए धन्यवाद।\nआवेदन: {{reference}} · {{business}}\n\nहमारी पार्टनरशिप टीम आपकी जानकारी और दस्तावेज़ देखकर जल्द ही आपसे संपर्क करेगी।\n\nद पी एंड एस ट्रैवलर ग्रुप'),
  ('partner.application_received', 'sms', 'en', null,
   'P&S Traveler: partner application {{reference}} received for {{business}}. We will contact you shortly.'),
  ('partner.application_approved', 'email', 'en', 'Welcome aboard · {{business}}',
   E'Namaste {{name}},\n\nYour partner application {{reference}} is approved. {{business}} is now a P & S Traveler partner.\n\nSign in with the same account to open your partner dashboard: {{dashboard_url}}\nAdd your bank or UPI details there so we can settle your earnings.\n\nThe P & S Traveler Group'),
  ('partner.application_approved', 'email', 'hi', 'स्वागत है · {{business}}',
   E'नमस्ते {{name}},\n\nआपका पार्टनर आवेदन {{reference}} स्वीकृत हो गया है। {{business}} अब पी एंड एस ट्रैवलर का पार्टनर है।\n\nउसी खाते से साइन इन करके अपना पार्टनर डैशबोर्ड खोलें: {{dashboard_url}}\nवहाँ अपना बैंक या UPI विवरण जोड़ें ताकि हम आपकी कमाई भेज सकें।\n\nद पी एंड एस ट्रैवलर ग्रुप'),
  ('partner.application_approved', 'sms', 'en', null,
   'P&S Traveler: application {{reference}} approved. Open your partner dashboard: {{dashboard_url}}'),
  ('partner.application_rejected', 'email', 'en', 'About your partner application · {{reference}}',
   E'Namaste {{name}},\n\nThank you for your interest in partnering with us. We are unable to approve application {{reference}} for {{business}} at this time.\n\nReason: {{reason}}\n\nYou are welcome to apply again once this is resolved.\n\nThe P & S Traveler Group'),
  ('partner.application_rejected', 'email', 'hi', 'आपके पार्टनर आवेदन के बारे में · {{reference}}',
   E'नमस्ते {{name}},\n\nहमारे साथ साझेदारी में रुचि के लिए धन्यवाद। अभी हम {{business}} का आवेदन {{reference}} स्वीकृत नहीं कर पा रहे हैं।\n\nकारण: {{reason}}\n\nयह ठीक होने के बाद आप फिर से आवेदन कर सकते हैं।\n\nद पी एंड एस ट्रैवलर ग्रुप'),
  ('payout.paid', 'email', 'en', 'Settlement {{reference}} · {{amount}}',
   E'Namaste {{name}},\n\nSettlement {{reference}} for {{business}} is done.\nAmount: {{amount}}\nPeriod up to: {{period_end}}\nMethod: {{method}} {{payment_reference}}\n\nSee the bookings it covers in your partner dashboard: {{dashboard_url}}\n\nThe P & S Traveler Group'),
  ('payout.paid', 'email', 'hi', 'सेटलमेंट {{reference}} · {{amount}}',
   E'नमस्ते {{name}},\n\n{{business}} का सेटलमेंट {{reference}} पूरा हो गया है।\nराशि: {{amount}}\nअवधि: {{period_end}} तक\nतरीका: {{method}} {{payment_reference}}\n\nइसमें शामिल बुकिंग अपने पार्टनर डैशबोर्ड में देखें: {{dashboard_url}}\n\nद पी एंड एस ट्रैवलर ग्रुप')
on conflict (key, channel, locale) do nothing;
