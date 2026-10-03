import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  CartesianGrid,
} from "recharts";
export function AdvancedInsights({
  data,
}: {
  data: {
    qrScans: number;
    daily: { day: string; views: number; exchanges: number; qrScans: number }[];
    campaigns: { id: string; name: string; scans: number }[];
  };
}) {
  return (
    <section className="glass-panel billing-panel">
      <h2>
        Pro analytics <small className="plan-chip plan-chip-pro">PRO</small>
      </h2>
      <p>QR scans: {data.qrScans.toLocaleString()}</p>
      <h3>Views and contact exchanges over time</h3>
      <div style={{ width: "100%", height: 260, minWidth: 0 }}>
        <ResponsiveContainer>
          <LineChart data={data.daily} accessibilityLayer>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" tickFormatter={d => d.slice(5)} />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="views"
              name="Profile views"
              stroke="#6366F1"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="exchanges"
              name="Contact exchanges"
              stroke="#059669"
              dot={false}
              isAnimationActive={false}
            />
            <Line
              dataKey="qrScans"
              name="QR scans"
              stroke="#DB2777"
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <h3>QR scans by campaign</h3>
      <div style={{ width: "100%", height: 220, minWidth: 0 }}>
        <ResponsiveContainer>
          <BarChart data={data.campaigns} accessibilityLayer>
            <XAxis dataKey="name" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="scans" fill="#6366F1" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ul>
        {data.campaigns.map(c => (
          <li key={c.id}>
            {c.name}: {c.scans} scans
          </li>
        ))}
      </ul>
    </section>
  );
}
