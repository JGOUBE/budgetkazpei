// hooks/useTransactions.js
import { useState } from "react";
import { INITIAL_TRANSACTIONS } from "../data/initialTransactions";

export function useTransactions() {
  const [transactions, setTransactions] = useState(INITIAL_TRANSACTIONS);

  function addTransaction(transaction) {
    setTransactions(prev => [{ ...transaction, id: Date.now() }, ...prev]);
  }

  return { transactions, addTransaction };
}