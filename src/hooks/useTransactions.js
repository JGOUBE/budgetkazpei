import { useState, useEffect } from "react";
import { supabase } from "../services/supabase";

export function useTransactions(userId) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Charger les transactions depuis Supabase ────────────────
  useEffect(() => {
    if (!userId) return;

    async function fetchTransactions() {
      setLoading(true);
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", userId)
        .order("date", { ascending: false });

      if (error) {
        console.error("Erreur chargement transactions:", error);
      } else {
        setTransactions(data || []);
      }
      setLoading(false);
    }

    fetchTransactions();
  }, [userId]);

  // ── Ajouter une transaction ─────────────────────────────────
  async function addTransaction(transaction) {
    const newTransaction = {
      ...transaction,
      user_id: userId,
      date: transaction.date || new Date().toISOString().split("T")[0],
    };

    const { data, error } = await supabase
      .from("transactions")
      .insert(newTransaction)
      .select()
      .single();

    if (error) {
      console.error("Erreur ajout transaction:", error);
      return;
    }

    setTransactions(prev => [data, ...prev]);
  }

  // ── Supprimer une transaction ───────────────────────────────
  async function deleteTransaction(id) {
    const { error } = await supabase
      .from("transactions")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Erreur suppression transaction:", error);
      return;
    }

    setTransactions(prev => prev.filter(t => t.id !== id));
  }

  return { transactions, loading, addTransaction, deleteTransaction };
}
