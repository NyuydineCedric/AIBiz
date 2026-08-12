export const kpis = [
  { label: 'Revenue (QTD)', value: '$482,300', change: '+12% vs last quarter', trend: 'up' as const },
  { label: 'Customer retention', value: '87%', change: '+8% vs last quarter', trend: 'up' as const },
  { label: 'Inventory cost', value: '$96,150', change: '+15% vs last quarter', trend: 'down' as const },
  { label: 'Active risks', value: '3', change: '1 high severity', trend: 'warn' as const },
]

export const executiveSummary =
  "Revenue increased by 12% this quarter, driven primarily by strong product sales in the West region. Customer retention improved by 8%, while inventory costs rose by 15% — likely tied to overstocking in the Southeast branch."

export const revenueTrend = {
  labels: ['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'],
  values: [356000, 371000, 398000, 412000, 455000, 482300],
}

export const regionBreakdown = {
  labels: ['West', 'Midwest', 'Southeast', 'Northeast'],
  values: [42, 26, 18, 14],
}

export type Risk = { severity: 'High' | 'Medium'; text: string }
export const risks: Risk[] = [
  { severity: 'High', text: 'Inventory costs rose 15% — overstocking risk in Southeast branch.' },
  { severity: 'Medium', text: 'Early churn signals detected among customers inactive 60+ days.' },
  { severity: 'Medium', text: 'Product line C underperforming vs. forecast for 2nd month running.' },
]

export const recommendations: string[] = [
  'Reduce Southeast branch stock orders by 10% next cycle.',
  'Launch a win-back promotion for customers inactive 60+ days.',
  'Increase West region marketing spend to capitalize on momentum.',
]

export type UploadRow = { file: string; type: string; size: string; date: string; status: 'Parsed' | 'Processing...' }
export const initialUploads: UploadRow[] = [
  { file: 'Q3_Sales_Report.xlsx', type: 'Excel', size: '1.2 MB', date: 'Aug 2, 2026', status: 'Parsed' },
  { file: 'Inventory_July.csv', type: 'CSV', size: '340 KB', date: 'Aug 1, 2026', status: 'Parsed' },
  { file: 'Customer_Feedback_Q3.pdf', type: 'PDF', size: '2.8 MB', date: 'Jul 29, 2026', status: 'Parsed' },
]

export type ChatMessage = { role: 'user' | 'ai'; text: string }
export const initialChat: ChatMessage[] = [
  { role: 'user', text: 'Which product generated the highest profit last quarter?' },
  { role: 'ai', text: 'Product A generated the highest profit ($142K, 31% margin), driven by strong West region demand. Product C trailed with a 6% margin due to rising input costs.' },
]

export const suggestedQuestions = [
  "What caused the drop in sales last month?",
  "Predict next month's revenue",
  'Which branch needs improvement?',
]

export const chatResponses: Record<string, string> = {
  "what caused the drop in sales last month?":
    'Sales in July dipped 4% versus June, concentrated in the Southeast branch. The main driver was a stockout on Product B for 9 days, combined with a competitor promotion in that region.',
  "predict next month's revenue":
    'Based on current trends and seasonality, September revenue is forecast at $498,000–$512,000, a 3–6% increase over August, driven by continued West region growth.',
  'which branch needs improvement?':
    "The Southeast branch needs the most attention — it's underperforming on both revenue growth (-4% MoM) and inventory turnover, and shows early churn signals among repeat customers.",
}

export type ReportItem = {
  title: string
  description: string
  date: string
  icon: 'summary' | 'risk' | 'forecast' | 'performance'
}
export const reports: ReportItem[] = [
  { title: 'Q3 2026 executive summary', description: 'Revenue, retention, and cost overview with AI commentary.', date: 'Aug 1, 2026', icon: 'summary' },
  { title: 'Risk assessment report', description: 'Detected risks, severity ratings, and mitigation suggestions.', date: 'Jul 28, 2026', icon: 'risk' },
  { title: 'Revenue forecast — Q4 2026', description: 'Predicted revenue, demand, and growth projections.', date: 'Jul 15, 2026', icon: 'forecast' },
  { title: 'Monthly performance summary', description: 'KPIs, trends, and recommendations for June 2026.', date: 'Jul 1, 2026', icon: 'performance' },
]
