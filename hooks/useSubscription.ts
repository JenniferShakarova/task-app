import { useState } from "react";
import { UseSubscriptionReturn } from "@/types/subscription";

export function useSubscription(): UseSubscriptionReturn {
  const [error, setError] = useState<string | null>(null);
  const manageSubscription = async (accessToken: string) => {
    try {
      if (!accessToken) {
        throw new Error("Authentication required. Please log in again.");
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      
      if (!supabaseUrl) {
        throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured. Please check your .env.local file.");
      }
      
      if (!supabaseAnonKey) {
        throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY is not configured. Please check your .env.local file.");
      }

      const functionUrl = `${supabaseUrl}/functions/v1/create-stripe-session`;
      console.log("Calling function:", functionUrl);

      const response = await fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: supabaseAnonKey,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Failed to connect to server" }));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      if (!data.url) {
        throw new Error("No redirect URL received from server");
      }

      window.location.href = data.url;
    } catch (error: any) {
      console.error("Error managing subscription:", error);
      
      // Handle network errors specifically
      if (error.message === "Failed to fetch" || error.name === "TypeError") {
        const errorMessage = `Network error: Could not connect to ${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/create-stripe-session. Please check:
1. Your internet connection
2. That NEXT_PUBLIC_SUPABASE_URL is set correctly in .env.local
3. That the function is deployed: supabase functions deploy create-stripe-session`;
        setError(errorMessage);
        throw new Error(errorMessage);
      }
      
      setError(error.message);
      throw error;
    }
  };

  return {
    manageSubscription,
  };
}
