-- Phase 11 · SMS (MSG91) and WhatsApp (Cloud API) delivery.
--
-- Indian SMS must use DLT-registered templates and business-initiated
-- WhatsApp messages must use Meta-approved templates, so each notification
-- template key needs the provider's own template id. They live in one
-- setting rather than new columns on notification_templates (no schema
-- change). Empty ids mean "not set up yet": that channel is logged as
-- skipped, exactly as before.
--
-- sms.<key>.template_id       MSG91 Flow template id (approved on DLT).
-- sms.<key>.variables         optional placeholder names sent as var1..varN;
--                              default = placeholders in the stored body, in order.
-- whatsapp.<key>.name         approved WhatsApp template name.
-- whatsapp.<key>.languages    template language code per site locale.
-- whatsapp.<key>.params       optional placeholder names for {{1}}..{{N}};
--                              default = placeholders in the stored body, in order.

insert into public.settings (key, value, is_public, description) values
  ('notifications.providers',
   '{
  "sms": {
    "booking.cancelled": {
      "template_id": ""
    },
    "booking.confirmed": {
      "template_id": ""
    },
    "cab.confirmed": {
      "template_id": ""
    },
    "lead.received": {
      "template_id": ""
    },
    "medicine.quoted": {
      "template_id": ""
    },
    "order.confirmed": {
      "template_id": ""
    },
    "order.status": {
      "template_id": ""
    },
    "package.confirmed": {
      "template_id": ""
    },
    "partner.application_approved": {
      "template_id": ""
    },
    "partner.application_received": {
      "template_id": ""
    },
    "payment.link": {
      "template_id": ""
    },
    "quote.sent": {
      "template_id": ""
    },
    "ride.assigned": {
      "template_id": ""
    },
    "ride.confirmed": {
      "template_id": ""
    },
    "travel.confirmed": {
      "template_id": ""
    },
    "trip.assigned": {
      "template_id": ""
    }
  },
  "whatsapp": {
    "booking.confirmed": {
      "name": "",
      "languages": {
        "en": "en",
        "hi": "hi"
      }
    },
    "crm.follow_up": {
      "name": "",
      "languages": {
        "en": "en",
        "hi": "hi"
      }
    },
    "crm.intro": {
      "name": "",
      "languages": {
        "en": "en",
        "hi": "hi"
      }
    },
    "order.status": {
      "name": "",
      "languages": {
        "en": "en",
        "hi": "hi"
      }
    },
    "quote.sent": {
      "name": "",
      "languages": {
        "en": "en",
        "hi": "hi"
      }
    },
    "ride.assigned": {
      "name": "",
      "languages": {
        "en": "en",
        "hi": "hi"
      }
    },
    "trip.assigned": {
      "name": "",
      "languages": {
        "en": "en",
        "hi": "hi"
      }
    }
  }
}',
   false,
   'SMS and WhatsApp provider template ids per notification: MSG91 DLT template id (and optional variable order) and WhatsApp Cloud API template name, language and parameter order. Leave an id empty to skip that channel for the notification.')
on conflict (key) do nothing;
