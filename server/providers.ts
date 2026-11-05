import Stripe from "stripe";
import twilio from "twilio";
import type { Config } from "./config.js";
import type { Order } from "./db.js";
export type Available = {
  phone: string;
  locality: string;
  capabilities: string[];
};
export interface Provider {
  search(country: string, contains: string): Promise<Available[]>;
  provision(order: Order): Promise<string>;
  find(order: Order): Promise<string | null>;
  release(sid: string): Promise<void>;
}
export interface Payments {
  checkout(order: Order, email: string): Promise<{ id: string; url: string }>;
  verify(body: Buffer, signature: string): Stripe.Event;
  refund(order: Order): Promise<void>;
}
export function liveProviders(c: Config): {
  provider: Provider;
  payments: Payments;
} {
  const client = twilio(c.TWILIO_ACCOUNT_SID!, c.TWILIO_AUTH_TOKEN!, {
    timeout: 15000,
    autoRetry: false,
  });
  const stripe = new Stripe(c.STRIPE_SECRET_KEY!, {
    timeout: 15000,
    maxNetworkRetries: 2,
  });
  return {
    provider: {
      async search(country, contains) {
        const rows = await client.availablePhoneNumbers(country).local.list({
          limit: 24,
          smsEnabled: true,
          ...(contains ? { contains } : {}),
        });
        return rows
          .filter((r) => r.addressRequirements === "none")
          .map((r) => ({
            phone: r.phoneNumber,
            locality: r.locality || r.region || country,
            capabilities: [
              "SMS",
              ...(r.capabilities.voice ? ["Voice-ready"] : []),
            ],
          }));
      },
      async provision(order) {
        const number = await client.incomingPhoneNumbers.create({
          phoneNumber: order.phone,
          friendlyName: `linea:${order.id}`,
          smsUrl: `${c.APP_URL}/api/webhooks/twilio/sms`,
          smsMethod: "POST",
          voiceUrl: `${c.APP_URL}/api/webhooks/twilio/voice`,
          voiceMethod: "POST",
        });
        return number.sid;
      },
      async find(order) {
        const rows = await client.incomingPhoneNumbers.list({
          phoneNumber: order.phone,
          limit: 20,
        });
        return (
          rows.find((r) => r.friendlyName === `linea:${order.id}`)?.sid || null
        );
      },
      async release(sid) {
        try {
          await client.incomingPhoneNumbers(sid).remove();
        } catch (error) {
          if ((error as { status?: number }).status !== 404) throw error;
        }
      },
    },
    payments: {
      async checkout(order, email) {
        const s = await stripe.checkout.sessions.create(
          {
            mode: "payment",
            payment_method_types: ["card"],
            customer_email: email,
            client_reference_id: order.id,
            metadata: { order_id: order.id },
            expires_at: Math.floor(Date.now() / 1000) + 1800,
            line_items: [
              {
                price_data: {
                  currency: "usd",
                  unit_amount: order.price,
                  product_data: {
                    name: `${order.phone} · 30-day number rental`,
                    description:
                      "Prepaid inbound SMS number. No automatic renewal. Voice forwarding and outbound messages are not included.",
                  },
                },
                quantity: 1,
              },
            ],
            success_url: `${c.APP_URL}/?checkout=success`,
            cancel_url: `${c.APP_URL}/?checkout=cancelled`,
          },
          { idempotencyKey: `checkout:${order.id}` },
        );
        if (!s.url) throw new Error("Checkout URL missing");
        return { id: s.id, url: s.url };
      },
      verify(body, signature) {
        return stripe.webhooks.constructEvent(
          body,
          signature,
          c.STRIPE_WEBHOOK_SECRET!,
        );
      },
      async refund(order) {
        if (!order.payment_intent) throw new Error("Missing payment intent");
        await stripe.refunds.create(
          { payment_intent: order.payment_intent },
          { idempotencyKey: `refund:${order.id}` },
        );
      },
    },
  };
}
export const demoProvider: Provider = {
  async search(country, contains) {
    const regions: Record<string, [string, string][]> = {
      US: [
        ["+121255501", "New York, NY"],
        ["+141555501", "San Francisco, CA"],
        ["+131055501", "Los Angeles, CA"],
        ["+151255501", "Austin, TX"],
      ],
      CA: [
        ["+141655501", "Toronto, ON"],
        ["+160455501", "Vancouver, BC"],
      ],
      GB: [["+442079460", "London"]],
      AU: [["+612555001", "Sydney"]],
      DE: [["+493055501", "Berlin"]],
      NL: [["+312055501", "Amsterdam"]],
    };
    return (regions[country] || [])
      .flatMap(([prefix, locality]) =>
        Array.from({ length: 4 }, (_, i) => ({
          phone: prefix + String(i + 10).padStart(2, "0"),
          locality,
          capabilities: ["SMS", "Voice-ready"],
        })),
      )
      .filter((r) => !contains || r.phone.includes(contains));
  },
  async provision(order) {
    return `DEMO_${order.id}`;
  },
  async find() {
    return null;
  },
  async release() {},
};
