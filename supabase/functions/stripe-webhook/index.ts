import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@12.0.0";

// Load environment variables
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET");
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") as string;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!WEBHOOK_SECRET) {
  throw new Error("STRIPE_WEBHOOK_SECRET is required");
}
if (!STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is required");
}

console.log("🌍 Stripe Webhook is running...");

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
  httpClient: Stripe.createFetchHttpClient(),
});

// This is needed in order to use the Web Crypto API in Deno.
const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  // Get the raw body and signature for verification
  const signature = req.headers.get("Stripe-Signature");
  const body = await req.text();

  if (!signature) {
    console.error("❌ Missing Stripe-Signature header");
    return new Response(
      JSON.stringify({ error: "Missing Stripe-Signature header" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // Verify webhook signature to ensure it's from Stripe
    const event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      WEBHOOK_SECRET,
      undefined,
      cryptoProvider
    );

    console.log(`📨 Received event: ${event.type} (ID: ${event.id})`);

    // Initialize Supabase client with service role key
    // This allows us to update user profiles without user authentication
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Handle different event types
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(`💳 Checkout completed for customer: ${session.customer}`);

        if (session.mode === "subscription" && session.customer) {
          const { error } = await supabase
            .from("profiles")
            .update({
              subscription_plan: "premium",
              updated_at: new Date().toISOString(),
            })
            .eq("stripe_customer_id", session.customer as string);

          if (error) {
            console.error("❌ Error updating profile:", error);
            throw error;
          }

          console.log(`✅ Updated user to premium (customer: ${session.customer})`);
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        console.log(`🔄 Subscription updated: ${subscription.id}`);

        // Determine subscription status
        const isActive =
          subscription.status === "active" || subscription.status === "trialing";
        const subscriptionPlan = isActive ? "premium" : "free";

        const { error } = await supabase
          .from("profiles")
          .update({
            subscription_plan: subscriptionPlan,
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_customer_id", subscription.customer as string);

        if (error) {
          console.error("❌ Error updating subscription:", error);
          throw error;
        }

        console.log(
          `✅ Updated subscription to ${subscriptionPlan} (customer: ${subscription.customer})`
        );
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        console.log(`🗑️ Subscription deleted: ${subscription.id}`);

        const { error } = await supabase
          .from("profiles")
          .update({
            subscription_plan: "free",
            updated_at: new Date().toISOString(),
          })
          .eq("stripe_customer_id", subscription.customer as string);

        if (error) {
          console.error("❌ Error downgrading user:", error);
          throw error;
        }

        console.log(
          `✅ Downgraded user to free (customer: ${subscription.customer})`
        );
        break;
      }

      case "customer.subscription.trial_will_end": {
        const subscription = event.data.object as Stripe.Subscription;
        console.log(
          `⏰ Trial ending soon for subscription: ${subscription.id}`
        );
        // You could send an email notification here
        // For now, we'll just log it
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        console.log(`💸 Payment failed for invoice: ${invoice.id}`);

        // Optionally handle payment failures
        // You might want to send an email notification or update a payment_failed flag
        // For now, we'll just log it
        console.log(
          `⚠️ Payment failed for customer: ${invoice.customer}. Consider sending notification.`
        );
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        console.log(`✅ Payment succeeded for invoice: ${invoice.id}`);

        // Ensure subscription is active if payment succeeded
        if (invoice.subscription && invoice.customer) {
          const { error } = await supabase
            .from("profiles")
            .update({
              subscription_plan: "premium",
              updated_at: new Date().toISOString(),
            })
            .eq("stripe_customer_id", invoice.customer as string);

          if (error) {
            console.error("❌ Error updating profile after payment:", error);
            // Don't throw - payment succeeded, this is just a sync issue
          } else {
            console.log(
              `✅ Confirmed premium status after payment (customer: ${invoice.customer})`
            );
          }
        }
        break;
      }

      default:
        console.log(`ℹ️ Unhandled event type: ${event.type}`);
    }

    console.log("✅ Webhook processed successfully");
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("❌ Error in stripe-webhook:", error.message);

    // Return 400 for signature verification errors, 500 for others
    const status = error.type === "StripeSignatureVerificationError" ? 400 : 500;

    return new Response(
      JSON.stringify({
        error: error.message,
        type: error.type || "UnknownError",
      }),
      {
        status,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});
