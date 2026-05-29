import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { formatAmount } from "../utils/format";

export default function Dashboard({ transactions, categories }) {

  const revenus = transactions
    .filter(t => t.amount > 0)
    .reduce((a, b) => a + b.amount, 0);

  const depenses = transactions
    .filter(t => t.amount < 0)
    .reduce((a, b) => a + Math.abs(b.amount), 0);

  const solde = revenus - depenses;

  const pieData = categories.map(cat => {
    const total = transactions
      .filter(t => t.category === cat.id)
      .reduce((a, b) => a + Math.abs(b.amount), 0);

    return {
      name: cat.label,
      value: total,
      color: cat.color,
    };
  }).filter(d => d.value > 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* TOP STATS */}
      <div style={{ display: "flex", gap: 20 }}>
        <div>💼 Solde : {solde.toFixed(2)} €</div>
        <div>💰 Revenus : {revenus.toFixed(2)} €</div>
        <div>📉 Dépenses : {depenses.toFixed(2)} €</div>
      </div>

      {/* PIE CHART */}
      <div style={{ width: 300, height: 250 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={pieData} dataKey="value" outerRadius={80}>
              {pieData.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* LISTE TRANSACTIONS */}
      <div>
        {transactions.slice(0, 5).map(t => (
          <div key={t.id} style={{
            display: "flex",
            justifyContent: "space-between",
            padding: 8,
            borderBottom: "1px solid #1E3A5F"
          }}>
            <span>{t.icon} {t.label}</span>
            <span>{formatAmount(t.amount)}</span>
          </div>
        ))}
      </div>

    </div>
  );
}