import { createClient } from "jsr:@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@12.0.0";

// Load environment variables
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") as string;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const STRIPE_PRICE_ID = Deno.env.get("STRIPE_PRICE_ID");

if (!STRIPE_SECRET_KEY) {
  console.error("❌ STRIPE_SECRET_KEY is not set");
  throw new Error("STRIPE_SECRET_KEY is required. Please set it as a Supabase secret.");
}
if (!STRIPE_PRICE_ID) {
  console.error("❌ STRIPE_PRICE_ID is not set");
  throw new Error("STRIPE_PRICE_ID is required. Please set it as a Supabase secret. Run: supabase secrets set STRIPE_PRICE_ID=price_xxx");
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: "2023-10-16",
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("No authorization header provided");
    }

    // Initialize Supabase client with user's token
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Authenticate user
    console.log("🔄 Authenticating user...");
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !user) {
      throw new Error("Authentication failed: Invalid or missing user");
    }

    console.log(`✅ Authenticated user: ${user.id}`);

    // Get user profile
    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("stripe_customer_id, subscription_plan, name")
      .eq("user_id", user.id)
      .single();

    if (profileError) {
      throw new Error(`Failed to fetch profile: ${profileError.message}`);
    }

    if (!profile) {
      throw new Error("User profile not found");
    }

    // Get user email for Stripe customer creation if needed
    const userEmail = user.email;
    if (!userEmail) {
      throw new Error("User email not found");
    }

    // Create Stripe customer if it doesn't exist
    let stripeCustomerId = profile.stripe_customer_id;
    if (!stripeCustomerId) {
      console.log("📝 Creating new Stripe customer...");
      const customer = await stripe.customers.create({
        email: userEmail,
        name: profile.name || undefined,
        metadata: {
          supabase_user_id: user.id,
        },
      });

      stripeCustomerId = customer.id;

      // Update profile with Stripe customer ID
      const { error: updateError } = await supabaseClient
        .from("profiles")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("user_id", user.id);

      if (updateError) {
        console.error("Failed to update profile with Stripe customer ID:", updateError);
        // Continue anyway - we have the customer ID
      }

      console.log(`✅ Created Stripe customer: ${stripeCustomerId}`);
    }

    const originUrl = req.headers.get("origin") ?? "http://localhost:3000";

    // If user already has premium subscription, return billing portal
    if (profile.subscription_plan === "premium") {
      console.log("🔐 User has premium - creating billing portal session...");
      const session = await stripe.billingPortal.sessions.create({
        customer: stripeCustomerId,
        return_url: `${originUrl}/profile`,
      });

      return new Response(JSON.stringify({ url: session.url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create Checkout session for new subscription
    console.log("💳 Creating checkout session for new subscription...");
    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      line_items: [
        {
          price: STRIPE_PRICE_ID,
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${originUrl}/profile?success=true`,
      cancel_url: `${originUrl}/profile?canceled=true`,
      metadata: {
        supabase_user_id: user.id,
      },
    });

    console.log(`✅ Created checkout session: ${session.id}`);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("❌ Error in create-stripe-session:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: error.message?.includes("Authentication") ? 401 : 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
