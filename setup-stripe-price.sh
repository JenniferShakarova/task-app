#!/bin/bash
# Script to create Stripe price and set it as Supabase secret

echo "Creating Stripe price..."

# Create the price
PRICE_OUTPUT=$(stripe prices create \
  --currency=usd \
  --unit-amount=1000 \
  -d "recurring[interval]"=month \
  -d "recurring[trial_period_days]"=14 \
  -d "product_data[name]"="TaskMaster Premium" \
  2>&1)

echo "$PRICE_OUTPUT"

# Extract price ID (looks for "price_xxxxx")
PRICE_ID=$(echo "$PRICE_OUTPUT" | grep -o 'price_[a-zA-Z0-9]*' | head -1)

if [ -z "$PRICE_ID" ]; then
  echo "❌ Failed to create price or extract price ID"
  echo "Please create a price manually in Stripe Dashboard and run:"
  echo "npx supabase secrets set STRIPE_PRICE_ID=price_xxxxx"
  exit 1
fi

echo ""
echo "✅ Created price: $PRICE_ID"
echo ""
echo "Setting as Supabase secret..."

# Set as Supabase secret
npx supabase secrets set STRIPE_PRICE_ID="$PRICE_ID"

echo ""
echo "✅ Done! Your STRIPE_PRICE_ID is now set."
echo "Try clicking 'Manage Subscription' again."









