-- Phase 10: baseline settings and templates for reviews, P&S Rewards and
-- referrals. Idempotent; all of it is admin-editable (Settings → Reviews &
-- rewards, Notifications).

insert into public.settings (key, value, is_public, description) values
  ('reviews.defaults',
   '{"auto_publish": false, "window_days": 180, "max_photos": 5, "max_photo_mb": 5, "min_body_chars": 0}',
   true,
   'Reviews: publish without moderation, days after a booking ends that it can still be reviewed, photos per review and their largest size in MB, shortest written review'),
  ('loyalty.defaults',
   '{"enabled": true, "point_value_paise": 100, "earn_bps": 100, "earn_services": [],
     "min_redeem_points": 100, "max_redeem_points": 2000, "code_valid_days": 30, "expiry_days": 365,
     "review_points": 25, "referrals_enabled": true, "referrer_points": 100, "referee_points": 100}',
   true,
   'P&S Rewards: on/off, value of one point in paise, share of a completed booking earned back (basis points; 100 = 1%), services that earn (empty = all), smallest and largest redemption, days a reward code stays valid, days before earned points expire (0 = never), points for a published review, and referral bonuses for both friends')
on conflict (key) do nothing;

insert into public.notification_templates (key, channel, locale, subject, body) values
  ('review.published', 'email', 'en', 'Thank you for your review',
   E'Namaste {{name}},\n\nYour review of {{subject}} is now live. Thank you for helping other travellers to Vrindavan.\n{{points_line}}\n\nThe P & S Traveler Group'),
  ('review.published', 'email', 'hi', 'आपकी समीक्षा के लिए धन्यवाद',
   E'नमस्ते {{name}},\n\n{{subject}} के बारे में आपकी समीक्षा अब सबको दिख रही है। वृंदावन आने वाले दूसरे यात्रियों की मदद के लिए धन्यवाद।\n{{points_line}}\n\nद पी एंड एस ट्रैवलर ग्रुप')
on conflict (key, channel, locale) do nothing;
