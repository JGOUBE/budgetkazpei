import { useEffect, useState } from "react";
import { supabase } from "../services/supabase";

export function useCustomBudgets(userId, isPremium) {
  const [customBudgets, setCustomBudgets] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId || !isPremium) {
      setCustomBudgets([]);
      return;
    }

    loadBudgets();
  }, [userId, isPremium]);

  async function loadBudgets() {
    setLoading(true);

    const { data, error } = await supabase
      .from("budgets")
      .select("*")
      .eq("user_id", userId);

    if (!error && data) {
      setCustomBudgets(data);
    }

    setLoading(false);
  }

  async function saveBudgets(budgets) {
    if (!userId || !isPremium) return;

    const payload = budgets.map((budget) => ({
      user_id: userId,
      category: budget.category,
      amount: Number(budget.amount),
      alert_enabled: budget.alert_enabled,
    }));

    const { error } = await supabase
      .from("budgets")
      .upsert(payload, {
        onConflict: "user_id,category",
      });

    if (!error) {
      setCustomBudgets(payload);
    }

    return { error };
  }

  return {
    customBudgets,
    loading,
    saveBudgets,
  };
}