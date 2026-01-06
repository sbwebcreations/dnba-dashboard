import { useState, useMemo } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ComposedChart, Area, PieChart, Pie, Cell, ReferenceLine,
  AreaChart, FunnelChart, Funnel, LabelList
} from 'recharts'
import { formatCurrency, formatPercent, formatNumber, formatShortDate } from './utils/formatters'
import { getDaysUntilEvent, getPerformanceStatus, getStatusColor } from './utils/calculations'

// Import data
import dailyData from './data/dailyPerformance.json'
import creativeData from './data/creativePerformance.json'
import platformData from './data/platformPerformance.json'
import adSetData from './data/adSetPerformance.json'
import geoData from './data/geoPerformance.json'
import actualSalesData from './data/actualSales.json'
import benchmarksData from './data/benchmarks.json'

// Color constants
const COLORS = {
  purple: '#8b5cf6',
  pink: '#ec4899',
  blue: '#3b82f6',
  green: '#22c55e',
  amber: '#f59e0b',
  cyan: '#06b6d4',
  red: '#ef4444',
  facebook: '#1877F2',
  instagram: '#E4405F',
}

// Date range presets
const DATE_PRESETS = [
  { id: 'today', label: 'Today', days: 0 },
  { id: 'yesterday', label: 'Yesterday', days: 1 },
  { id: '4days', label: '4 Days', days: 4 },
  { id: '7days', label: '7 Days', days: 7 },
  { id: '2weeks', label: '2 Weeks', days: 14 },
  { id: '1month', label: '1 Month', days: 30 },
  { id: '2months', label: '2 Months', days: 60 },
  { id: '3months', label: '3 Months', days: 90 },
  { id: '4months', label: '4 Months', days: 120 },
  { id: 'max', label: 'Maximum', days: -1 },
]

// Get date range based on preset
function getDateRange(presetId, customStart, customEnd) {
  const today = new Date('2026-01-06') // Using the data's last date as "today"

  if (presetId === 'custom' && customStart && customEnd) {
    return { start: new Date(customStart), end: new Date(customEnd) }
  }

  const preset = DATE_PRESETS.find(p => p.id === presetId)
  if (!preset) return { start: null, end: today }

  if (preset.days === -1) {
    return { start: null, end: today } // Maximum - no start limit
  }

  if (preset.days === 0) {
    return { start: today, end: today }
  }

  if (preset.days === 1) {
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    return { start: yesterday, end: yesterday }
  }

  const start = new Date(today)
  start.setDate(start.getDate() - preset.days + 1)
  return { start, end: today }
}

// Filter metrics by date range
function filterByDateRange(metrics, startDate, endDate) {
  return metrics.filter(m => {
    const date = new Date(m.date)
    if (startDate && date < startDate) return false
    if (endDate && date > endDate) return false
    return true
  })
}

// Date Filter Component
function DateFilter({ selectedPreset, onPresetChange, customStart, customEnd, onCustomStartChange, onCustomEndChange, showCustom, onToggleCustom }) {
  return (
    <div className="bg-[#0f1729] rounded-xl p-4 border border-[#1e3a5f] mb-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-gray-400 text-sm mr-2">Date Range:</span>

        {/* Preset Buttons */}
        <div className="flex flex-wrap gap-1.5">
          {DATE_PRESETS.map(preset => (
            <button
              key={preset.id}
              onClick={() => onPresetChange(preset.id)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                selectedPreset === preset.id && !showCustom
                  ? 'bg-purple-600 text-white'
                  : 'bg-[#1a2744] text-gray-400 hover:bg-[#243352]'
              }`}
            >
              {preset.label}
            </button>
          ))}
          <button
            onClick={onToggleCustom}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
              showCustom
                ? 'bg-purple-600 text-white'
                : 'bg-[#1a2744] text-gray-400 hover:bg-[#243352]'
            }`}
          >
            Custom
          </button>
        </div>
      </div>

      {/* Custom Date Range Inputs */}
      {showCustom && (
        <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-[#1e3a5f]">
          <div className="flex items-center gap-2">
            <label className="text-gray-400 text-xs">From:</label>
            <input
              type="date"
              value={customStart}
              onChange={(e) => onCustomStartChange(e.target.value)}
              className="bg-[#1a2744] border border-[#2d4a6f] rounded px-2 py-1 text-sm text-white"
              max="2026-01-06"
              min="2025-09-17"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-gray-400 text-xs">To:</label>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => onCustomEndChange(e.target.value)}
              className="bg-[#1a2744] border border-[#2d4a6f] rounded px-2 py-1 text-sm text-white"
              max="2026-01-06"
              min="2025-09-17"
            />
          </div>
        </div>
      )}
    </div>
  )
}

// KPI Card Component
function KPICard({ label, value, subValue, trend, status }) {
  const statusColor = status ? getStatusColor(status) : null;
  return (
    <div className="bg-[#0f1729] rounded-xl p-4 border border-[#1e3a5f]">
      <div className="text-gray-400 text-xs mb-1">{label}</div>
      <div className="text-2xl font-bold" style={statusColor ? { color: statusColor } : {}}>{value}</div>
      {subValue && <div className="text-gray-500 text-xs mt-1">{subValue}</div>}
      {trend && (
        <div className={`text-xs mt-1 ${trend > 0 ? 'text-green-400' : 'text-red-400'}`}>
          {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
        </div>
      )}
    </div>
  )
}

// Chart Card Component
function ChartCard({ title, children, className = '' }) {
  return (
    <div className={`bg-[#0f1729] rounded-xl p-5 border border-[#1e3a5f] ${className}`}>
      <h3 className="text-sm font-semibold mb-4 text-gray-200">{title}</h3>
      {children}
    </div>
  )
}

// Insight Box Component
function InsightBox({ type, children }) {
  const colors = {
    success: 'bg-green-900/30 border-green-700 text-green-400',
    warning: 'bg-yellow-900/30 border-yellow-700 text-yellow-400',
    danger: 'bg-red-900/30 border-red-700 text-red-400',
    info: 'bg-blue-900/30 border-blue-700 text-blue-400',
  }
  return (
    <div className={`mt-3 p-3 rounded-lg border text-xs ${colors[type]}`}>
      {children}
    </div>
  )
}

// Overview View
function OverviewView({ filteredMetrics, geoCountries, dateLabel }) {
  const daysToEvent = getDaysUntilEvent();

  // Calculate totals from filtered metrics
  const calculatedTotals = useMemo(() => {
    const totalSpend = filteredMetrics.reduce((a, b) => a + b.spend, 0)
    const totalPurchases = filteredMetrics.reduce((a, b) => a + b.purchases, 0)
    const totalImpressions = filteredMetrics.reduce((a, b) => a + b.impressions, 0)
    const totalClicks = filteredMetrics.reduce((a, b) => a + b.clicks, 0)
    const blendedCPA = totalPurchases > 0 ? totalSpend / totalPurchases : 0
    const avgCTR = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0

    return {
      totalSpend,
      totalPurchases,
      blendedCPA,
      avgCTR,
      totalImpressions,
      totalClicks,
      targetCPA: 50
    }
  }, [filteredMetrics])

  // Calculate spend vs revenue for filtered period
  const spendVsRevenueData = useMemo(() => {
    return actualSalesData.sales
      .filter(sale => {
        const saleDate = new Date(sale.date)
        const firstMetricDate = filteredMetrics.length > 0 ? new Date(filteredMetrics[0].date) : null
        const lastMetricDate = filteredMetrics.length > 0 ? new Date(filteredMetrics[filteredMetrics.length - 1].date) : null
        if (firstMetricDate && saleDate < firstMetricDate) return false
        if (lastMetricDate && saleDate > lastMetricDate) return false
        return true
      })
      .map(sale => ({
        date: formatShortDate(sale.date),
        spend: filteredMetrics.find(d => d.date === sale.date)?.spend || 0,
        revenue: sale.revenue
      }))
  }, [filteredMetrics])

  // Platform split estimation (proportional to overall campaign)
  const fbShare = benchmarksData.platformBenchmarks.facebook.spendShare
  const igShare = benchmarksData.platformBenchmarks.instagram.spendShare
  const platformSummary = [
    { name: 'Facebook', spend: calculatedTotals.totalSpend * fbShare, color: COLORS.facebook },
    { name: 'Instagram', spend: calculatedTotals.totalSpend * igShare, color: COLORS.instagram },
  ]

  const topCountries = geoCountries.slice(0, 5)

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <KPICard label="Total Spend" value={formatCurrency(calculatedTotals.totalSpend)} subValue={dateLabel} />
        <KPICard label="Purchases (Meta)" value={calculatedTotals.totalPurchases} />
        <KPICard
          label="Blended CPA"
          value={calculatedTotals.blendedCPA > 0 ? formatCurrency(calculatedTotals.blendedCPA) : '-'}
          subValue={`Target: ${formatCurrency(calculatedTotals.targetCPA)}`}
          status={calculatedTotals.blendedCPA > 0 ? getPerformanceStatus(calculatedTotals.blendedCPA) : 'neutral'}
        />
        <KPICard label="Avg CTR" value={formatPercent(calculatedTotals.avgCTR)} />
        <KPICard label="Impressions" value={formatNumber(calculatedTotals.totalImpressions)} />
        <KPICard label="Days to Event" value={daysToEvent} status={daysToEvent < 20 ? 'warning' : 'success'} />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {spendVsRevenueData.length > 0 ? (
          <ChartCard title="Spend vs Revenue">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={spendVsRevenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
                <XAxis dataKey="date" stroke="#9CA3AF" fontSize={12} />
                <YAxis stroke="#9CA3AF" fontSize={12} tickFormatter={v => `£${v}`} />
                <Tooltip
                  contentStyle={{ background: '#1F2937', border: '1px solid #1e3a5f', borderRadius: '8px' }}
                  formatter={(v) => [`£${v.toLocaleString()}`, '']}
                />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="spend" name="Ad Spend" fill={COLORS.red} radius={[4, 4, 0, 0]} />
                <Bar dataKey="revenue" name="Revenue" fill={COLORS.green} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            {spendVsRevenueData.reduce((a, b) => a + b.spend, 0) > 0 && (
              <InsightBox type="success">
                ROAS: {(spendVsRevenueData.reduce((a, b) => a + b.revenue, 0) / spendVsRevenueData.reduce((a, b) => a + b.spend, 0)).toFixed(2)}x
              </InsightBox>
            )}
          </ChartCard>
        ) : (
          <ChartCard title="Spend vs Revenue">
            <div className="h-[250px] flex items-center justify-center text-gray-500">
              No sales data available for selected period
            </div>
          </ChartCard>
        )}

        <ChartCard title="CPA Trend">
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={filteredMetrics}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
              <XAxis dataKey="date" stroke="#9CA3AF" fontSize={10} tickFormatter={formatShortDate} />
              <YAxis yAxisId="left" stroke="#9CA3AF" fontSize={12} tickFormatter={v => `£${v}`} />
              <YAxis yAxisId="right" orientation="right" stroke="#9CA3AF" fontSize={12} />
              <Tooltip
                contentStyle={{ background: '#1F2937', border: '1px solid #1e3a5f', borderRadius: '8px' }}
                labelFormatter={formatShortDate}
              />
              <ReferenceLine yAxisId="left" y={50} stroke={COLORS.green} strokeDasharray="5 5" />
              <Bar yAxisId="right" dataKey="purchases" name="Purchases" fill={COLORS.blue} opacity={0.6} radius={[4, 4, 0, 0]} />
              <Line yAxisId="left" type="monotone" dataKey="cpa" name="CPA" stroke={COLORS.amber} strokeWidth={2} dot={{ r: 3 }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Full Width Chart */}
      <ChartCard title="Daily Performance Timeline">
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={filteredMetrics}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
            <XAxis dataKey="date" stroke="#9CA3AF" fontSize={10} tickFormatter={formatShortDate} />
            <YAxis yAxisId="left" stroke="#9CA3AF" fontSize={12} tickFormatter={v => `£${v}`} />
            <YAxis yAxisId="right" orientation="right" stroke="#9CA3AF" fontSize={12} />
            <Tooltip
              contentStyle={{ background: '#1F2937', border: '1px solid #1e3a5f', borderRadius: '8px' }}
              labelFormatter={formatShortDate}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Area yAxisId="left" type="monotone" dataKey="spend" name="Spend (£)" fill={COLORS.purple} fillOpacity={0.3} stroke={COLORS.purple} strokeWidth={2} />
            <Bar yAxisId="right" dataKey="purchases" name="Purchases" fill={COLORS.green} radius={[4, 4, 0, 0]} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Platform Split (Est.)">
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={platformSummary}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={5}
                dataKey="spend"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {platformSummary.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={v => formatCurrency(v)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-6 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ background: COLORS.facebook }}></div>
              <span className="text-gray-400">FB: {formatCurrency(platformSummary[0].spend)}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{ background: COLORS.instagram }}></div>
              <span className="text-gray-400">IG: {formatCurrency(platformSummary[1].spend)}</span>
            </div>
          </div>
        </ChartCard>

        <ChartCard title="Top Countries by CPA">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topCountries} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
              <XAxis type="number" stroke="#9CA3AF" fontSize={12} tickFormatter={v => `£${v}`} />
              <YAxis type="category" dataKey="countryName" stroke="#9CA3AF" fontSize={11} width={80} />
              <Tooltip contentStyle={{ background: '#1F2937', border: '1px solid #1e3a5f', borderRadius: '8px' }} />
              <ReferenceLine x={50} stroke={COLORS.green} strokeDasharray="5 5" />
              <Bar dataKey="cpa" name="CPA" radius={[0, 4, 4, 0]}>
                {topCountries.map((entry, index) => (
                  <Cell key={index} fill={entry.cpa <= 65 ? COLORS.green : entry.cpa <= 100 ? COLORS.amber : COLORS.red} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  )
}

// Daily Trends View
function DailyTrendsView({ filteredMetrics, dateLabel }) {
  // Calculate summary stats
  const summaryStats = useMemo(() => {
    const totalSpend = filteredMetrics.reduce((a, b) => a + b.spend, 0)
    const totalPurchases = filteredMetrics.reduce((a, b) => a + b.purchases, 0)
    const totalImpressions = filteredMetrics.reduce((a, b) => a + b.impressions, 0)
    const totalClicks = filteredMetrics.reduce((a, b) => a + b.clicks, 0)
    return { totalSpend, totalPurchases, totalImpressions, totalClicks }
  }, [filteredMetrics])

  return (
    <div className="space-y-6">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="Total Spend" value={formatCurrency(summaryStats.totalSpend)} subValue={dateLabel} />
        <KPICard label="Total Purchases" value={summaryStats.totalPurchases} />
        <KPICard label="Total Impressions" value={formatNumber(summaryStats.totalImpressions)} />
        <KPICard label="Total Clicks" value={formatNumber(summaryStats.totalClicks)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Daily Spend">
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={filteredMetrics}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
              <XAxis dataKey="date" stroke="#9CA3AF" fontSize={10} tickFormatter={formatShortDate} />
              <YAxis stroke="#9CA3AF" fontSize={12} tickFormatter={v => `£${v}`} />
              <Tooltip contentStyle={{ background: '#1F2937', border: '1px solid #1e3a5f', borderRadius: '8px' }} labelFormatter={formatShortDate} />
              <Area type="monotone" dataKey="spend" stroke={COLORS.purple} fill={COLORS.purple} fillOpacity={0.3} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Daily Purchases">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={filteredMetrics}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
              <XAxis dataKey="date" stroke="#9CA3AF" fontSize={10} tickFormatter={formatShortDate} />
              <YAxis stroke="#9CA3AF" fontSize={12} />
              <Tooltip contentStyle={{ background: '#1F2937', border: '1px solid #1e3a5f', borderRadius: '8px' }} labelFormatter={formatShortDate} />
              <Bar dataKey="purchases" fill={COLORS.green} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Impressions & CTR Over Time">
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={filteredMetrics}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
            <XAxis dataKey="date" stroke="#9CA3AF" fontSize={10} tickFormatter={formatShortDate} />
            <YAxis yAxisId="left" stroke="#9CA3AF" fontSize={12} tickFormatter={formatNumber} />
            <YAxis yAxisId="right" orientation="right" stroke="#9CA3AF" fontSize={12} tickFormatter={v => `${v}%`} />
            <Tooltip contentStyle={{ background: '#1F2937', border: '1px solid #1e3a5f', borderRadius: '8px' }} labelFormatter={formatShortDate} />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Bar yAxisId="left" dataKey="impressions" name="Impressions" fill={COLORS.blue} opacity={0.7} radius={[4, 4, 0, 0]} />
            <Line yAxisId="right" type="monotone" dataKey="ctr" name="CTR %" stroke={COLORS.amber} strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Data Table */}
      <ChartCard title="Daily Breakdown">
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#0f1729]">
              <tr className="text-gray-400 text-left border-b border-[#1e3a5f]">
                <th className="py-2 px-3">Date</th>
                <th className="py-2 px-3 text-right">Spend</th>
                <th className="py-2 px-3 text-right">Impressions</th>
                <th className="py-2 px-3 text-right">Clicks</th>
                <th className="py-2 px-3 text-right">CTR</th>
                <th className="py-2 px-3 text-right">Purchases</th>
                <th className="py-2 px-3 text-right">CPA</th>
              </tr>
            </thead>
            <tbody>
              {[...filteredMetrics].reverse().map((day, i) => (
                <tr key={i} className="border-b border-[#1e3a5f]/50 hover:bg-[#1a2744]">
                  <td className="py-2 px-3">{formatShortDate(day.date)}</td>
                  <td className="py-2 px-3 text-right">{formatCurrency(day.spend)}</td>
                  <td className="py-2 px-3 text-right">{formatNumber(day.impressions)}</td>
                  <td className="py-2 px-3 text-right">{formatNumber(day.clicks)}</td>
                  <td className="py-2 px-3 text-right">{formatPercent(day.ctr)}</td>
                  <td className="py-2 px-3 text-right">{day.purchases}</td>
                  <td className="py-2 px-3 text-right" style={{ color: getStatusColor(getPerformanceStatus(day.cpa)) }}>
                    {day.cpa > 0 ? formatCurrency(day.cpa) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  )
}

// Creatives View
function CreativesView({ creatives }) {
  const sortedBySpend = [...creatives].sort((a, b) => b.spend - a.spend).slice(0, 20);
  const sortedByCPA = [...creatives].filter(c => c.purchases > 0).sort((a, b) => a.cpa - b.cpa).slice(0, 10);
  const sortedByPurchases = [...creatives].sort((a, b) => b.purchases - a.purchases).slice(0, 10);

  return (
    <div className="space-y-6">
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="Total Creatives" value={creatives.length} />
        <KPICard label="With Purchases" value={creatives.filter(c => c.purchases > 0).length} />
        <KPICard label="Best CPA" value={formatCurrency(Math.min(...creatives.filter(c => c.cpa > 0).map(c => c.cpa)))} status="success" />
        <KPICard label="Total Purchases" value={creatives.reduce((a, b) => a + b.purchases, 0)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Top 10 by Purchases">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={sortedByPurchases} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
              <XAxis type="number" stroke="#9CA3AF" fontSize={12} />
              <YAxis type="category" dataKey="adName" stroke="#9CA3AF" fontSize={10} width={120} tick={{ fontSize: 9 }} />
              <Tooltip contentStyle={{ background: '#1F2937', border: '1px solid #1e3a5f', borderRadius: '8px' }} />
              <Bar dataKey="purchases" name="Purchases" fill={COLORS.green} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Top 10 by CPA (Best Performers)">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={sortedByCPA} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
              <XAxis type="number" stroke="#9CA3AF" fontSize={12} tickFormatter={v => `£${v}`} />
              <YAxis type="category" dataKey="adName" stroke="#9CA3AF" fontSize={10} width={120} tick={{ fontSize: 9 }} />
              <Tooltip contentStyle={{ background: '#1F2937', border: '1px solid #1e3a5f', borderRadius: '8px' }} />
              <ReferenceLine x={50} stroke={COLORS.green} strokeDasharray="5 5" />
              <Bar dataKey="cpa" name="CPA" radius={[0, 4, 4, 0]}>
                {sortedByCPA.map((entry, index) => (
                  <Cell key={index} fill={entry.cpa <= 50 ? COLORS.green : entry.cpa <= 100 ? COLORS.amber : COLORS.red} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Creatives Table */}
      <ChartCard title="All Creatives (Top 20 by Spend)">
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#0f1729]">
              <tr className="text-gray-400 text-left border-b border-[#1e3a5f]">
                <th className="py-2 px-3">Ad Name</th>
                <th className="py-2 px-3">Type</th>
                <th className="py-2 px-3 text-right">Spend</th>
                <th className="py-2 px-3 text-right">Impressions</th>
                <th className="py-2 px-3 text-right">Clicks</th>
                <th className="py-2 px-3 text-right">CTR</th>
                <th className="py-2 px-3 text-right">Purchases</th>
                <th className="py-2 px-3 text-right">CPA</th>
              </tr>
            </thead>
            <tbody>
              {sortedBySpend.map((creative, i) => (
                <tr key={i} className="border-b border-[#1e3a5f]/50 hover:bg-[#1a2744]">
                  <td className="py-2 px-3 max-w-xs truncate">{creative.adName}</td>
                  <td className="py-2 px-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${creative.type === 'Video' ? 'bg-purple-900/50 text-purple-300' : 'bg-blue-900/50 text-blue-300'}`}>
                      {creative.type}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right">{formatCurrency(creative.spend)}</td>
                  <td className="py-2 px-3 text-right">{formatNumber(creative.impressions)}</td>
                  <td className="py-2 px-3 text-right">{formatNumber(creative.clicks)}</td>
                  <td className="py-2 px-3 text-right">{formatPercent(creative.ctr)}</td>
                  <td className="py-2 px-3 text-right">{creative.purchases}</td>
                  <td className="py-2 px-3 text-right" style={{ color: getStatusColor(getPerformanceStatus(creative.cpa)) }}>
                    {creative.cpa > 0 ? formatCurrency(creative.cpa) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  )
}

// Platforms View
function PlatformsView({ benchmarks, platformMetrics }) {
  const fb = benchmarks.platformBenchmarks.facebook;
  const ig = benchmarks.platformBenchmarks.instagram;

  const comparisonData = [
    { metric: 'Spend', Facebook: fb.spend, Instagram: ig.spend },
    { metric: 'Purchases', Facebook: fb.purchases, Instagram: ig.purchases },
  ];

  const cpaComparison = [
    { name: 'Facebook', cpa: fb.cpa, color: COLORS.facebook },
    { name: 'Instagram', cpa: ig.cpa, color: COLORS.instagram },
  ];

  const efficiencyDiff = ((ig.cpa - fb.cpa) / ig.cpa * 100).toFixed(0);

  return (
    <div className="space-y-6">
      {/* Platform Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#0f1729] rounded-xl p-5 border-2" style={{ borderColor: COLORS.facebook }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-4 h-4 rounded-full" style={{ background: COLORS.facebook }}></div>
            <span className="font-semibold">Facebook</span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">Spend:</span><span>{formatCurrency(fb.spend)}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Purchases:</span><span>{fb.purchases}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">CPA:</span><span className="text-green-400">{formatCurrency(fb.cpa)}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Share:</span><span>{(fb.spendShare * 100).toFixed(0)}%</span></div>
          </div>
        </div>

        <div className="bg-[#0f1729] rounded-xl p-5 border-2" style={{ borderColor: COLORS.instagram }}>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-4 h-4 rounded-full" style={{ background: COLORS.instagram }}></div>
            <span className="font-semibold">Instagram</span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">Spend:</span><span>{formatCurrency(ig.spend)}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Purchases:</span><span>{ig.purchases}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">CPA:</span><span className="text-amber-400">{formatCurrency(ig.cpa)}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Share:</span><span>{(ig.spendShare * 100).toFixed(0)}%</span></div>
          </div>
        </div>

        <div className="bg-[#0f1729] rounded-xl p-5 border border-[#1e3a5f]">
          <div className="font-semibold mb-3">Comparison</div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-gray-400">FB Efficiency:</span><span className="text-green-400">+{efficiencyDiff}%</span></div>
            <div className="flex justify-between"><span className="text-gray-400">CPA Difference:</span><span>{formatCurrency(ig.cpa - fb.cpa)}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Best Platform:</span><span className="text-green-400">Facebook</span></div>
          </div>
          <InsightBox type="info">
            Facebook delivers {efficiencyDiff}% better CPA than Instagram
          </InsightBox>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Spend Distribution">
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={[
                  { name: 'Facebook', value: fb.spend, color: COLORS.facebook },
                  { name: 'Instagram', value: ig.spend, color: COLORS.instagram }
                ]}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={90}
                paddingAngle={5}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                <Cell fill={COLORS.facebook} />
                <Cell fill={COLORS.instagram} />
              </Pie>
              <Tooltip formatter={v => formatCurrency(v)} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="CPA Comparison">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={cpaComparison}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
              <XAxis dataKey="name" stroke="#9CA3AF" fontSize={12} />
              <YAxis stroke="#9CA3AF" fontSize={12} tickFormatter={v => `£${v}`} />
              <Tooltip contentStyle={{ background: '#1F2937', border: '1px solid #1e3a5f', borderRadius: '8px' }} />
              <ReferenceLine y={50} stroke={COLORS.green} strokeDasharray="5 5" />
              <Bar dataKey="cpa" name="CPA" radius={[4, 4, 0, 0]}>
                {cpaComparison.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <InsightBox type="success">
            Target CPA: £50 | FB: {fb.cpa <= 50 ? 'On Target' : 'Above Target'} | IG: {ig.cpa <= 50 ? 'On Target' : 'Above Target'}
          </InsightBox>
        </ChartCard>
      </div>
    </div>
  )
}

// Geography View
function GeographyView({ countries }) {
  const sortedByCPA = [...countries].filter(c => c.cpa > 0).sort((a, b) => a.cpa - b.cpa);
  const sortedBySpend = [...countries].sort((a, b) => b.spend - a.spend);
  const topPerformers = sortedByCPA.filter(c => c.cpa <= 70);
  const underperformers = sortedByCPA.filter(c => c.cpa > 120);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="Countries" value={countries.length} />
        <KPICard label="Best CPA" value={`${countries[0]?.flag || ''} ${formatCurrency(Math.min(...countries.filter(c => c.cpa > 0).map(c => c.cpa)))}`} status="success" />
        <KPICard label="Top Performers" value={topPerformers.length} subValue="CPA < £70" />
        <KPICard label="Underperformers" value={underperformers.length} subValue="CPA > £120" status="warning" />
      </div>

      <ChartCard title="CPA by Country">
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={sortedByCPA}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
            <XAxis dataKey="countryName" stroke="#9CA3AF" fontSize={10} angle={-45} textAnchor="end" height={80} />
            <YAxis stroke="#9CA3AF" fontSize={12} tickFormatter={v => `£${v}`} />
            <Tooltip contentStyle={{ background: '#1F2937', border: '1px solid #1e3a5f', borderRadius: '8px' }} />
            <ReferenceLine y={50} stroke={COLORS.green} strokeDasharray="5 5" label={{ value: 'Target', fill: COLORS.green, fontSize: 10 }} />
            <Bar dataKey="cpa" name="CPA" radius={[4, 4, 0, 0]}>
              {sortedByCPA.map((entry, index) => (
                <Cell key={index} fill={entry.cpa <= 65 ? COLORS.green : entry.cpa <= 100 ? COLORS.amber : COLORS.red} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Top Performers (CPA < £70)">
          <div className="space-y-3">
            {topPerformers.map((country, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-green-900/20 rounded-lg border border-green-700/50">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{country.flag}</span>
                  <div>
                    <div className="font-medium">{country.countryName}</div>
                    <div className="text-xs text-gray-400">{country.purchases} purchases</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-green-400 font-semibold">{formatCurrency(country.cpa)}</div>
                  <div className="text-xs text-gray-400">{formatCurrency(country.spend)} spent</div>
                </div>
              </div>
            ))}
          </div>
        </ChartCard>

        <ChartCard title="Underperformers (CPA > £120)">
          <div className="space-y-3">
            {underperformers.map((country, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-red-900/20 rounded-lg border border-red-700/50">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{country.flag}</span>
                  <div>
                    <div className="font-medium">{country.countryName}</div>
                    <div className="text-xs text-gray-400">{country.purchases} purchases</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-red-400 font-semibold">{formatCurrency(country.cpa)}</div>
                  <div className="text-xs text-gray-400">{formatCurrency(country.spend)} spent</div>
                </div>
              </div>
            ))}
          </div>
          <InsightBox type="warning">
            Consider reducing spend in countries with CPA &gt; £100
          </InsightBox>
        </ChartCard>
      </div>

      {/* Full Table */}
      <ChartCard title="All Countries">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#0f1729]">
              <tr className="text-gray-400 text-left border-b border-[#1e3a5f]">
                <th className="py-2 px-3">Country</th>
                <th className="py-2 px-3 text-right">Spend</th>
                <th className="py-2 px-3 text-right">Impressions</th>
                <th className="py-2 px-3 text-right">Clicks</th>
                <th className="py-2 px-3 text-right">CTR</th>
                <th className="py-2 px-3 text-right">Purchases</th>
                <th className="py-2 px-3 text-right">CPA</th>
              </tr>
            </thead>
            <tbody>
              {sortedBySpend.map((country, i) => (
                <tr key={i} className="border-b border-[#1e3a5f]/50 hover:bg-[#1a2744]">
                  <td className="py-2 px-3"><span className="mr-2">{country.flag}</span>{country.countryName}</td>
                  <td className="py-2 px-3 text-right">{formatCurrency(country.spend)}</td>
                  <td className="py-2 px-3 text-right">{formatNumber(country.impressions)}</td>
                  <td className="py-2 px-3 text-right">{formatNumber(country.clicks)}</td>
                  <td className="py-2 px-3 text-right">{formatPercent(country.ctr)}</td>
                  <td className="py-2 px-3 text-right">{country.purchases}</td>
                  <td className="py-2 px-3 text-right" style={{ color: getStatusColor(getPerformanceStatus(country.cpa)) }}>
                    {country.cpa > 0 ? formatCurrency(country.cpa) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  )
}

// Attribution View
function AttributionView({ filteredMetrics, actualSales, dateLabel }) {
  const salesDays = actualSales.sales;

  // Filter sales by the same date range
  const filteredSales = useMemo(() => {
    if (filteredMetrics.length === 0) return []
    const firstDate = new Date(filteredMetrics[0].date)
    const lastDate = new Date(filteredMetrics[filteredMetrics.length - 1].date)
    return salesDays.filter(sale => {
      const saleDate = new Date(sale.date)
      return saleDate >= firstDate && saleDate <= lastDate
    })
  }, [filteredMetrics, salesDays])

  const combinedData = filteredSales.map(sale => {
    const metaDay = filteredMetrics.find(d => d.date === sale.date);
    return {
      date: formatShortDate(sale.date),
      metaPurchases: metaDay?.purchases || 0,
      actualOrders: sale.orders,
      metaSpend: metaDay?.spend || 0,
      actualRevenue: sale.revenue,
    };
  });

  const totalMetaPurchases = combinedData.reduce((a, b) => a + b.metaPurchases, 0);
  const totalActualOrders = combinedData.reduce((a, b) => a + b.actualOrders, 0);
  const totalSpend = combinedData.reduce((a, b) => a + b.metaSpend, 0);
  const totalRevenue = combinedData.reduce((a, b) => a + b.actualRevenue, 0);
  const attributionGap = totalActualOrders > 0 ? ((totalActualOrders - totalMetaPurchases) / totalActualOrders * 100) : 0;
  const metaCPA = totalMetaPurchases > 0 ? totalSpend / totalMetaPurchases : 0;
  const trueCPA = totalActualOrders > 0 ? totalSpend / totalActualOrders : 0;
  const roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;

  return (
    <div className="space-y-6">
      <div className="text-center mb-4">
        <h2 className="text-xl font-semibold text-gray-200">Meta Attribution vs Actual Sales</h2>
        <p className="text-gray-400 text-sm">Comparing Meta pixel data with Skiddle ticket sales ({dateLabel})</p>
      </div>

      {combinedData.length === 0 ? (
        <ChartCard title="No Data">
          <div className="text-center py-12 text-gray-500">
            No sales data available for the selected date range.
            <br />
            <span className="text-sm">Sales data is only available for Jan 5-6, 2026</span>
          </div>
        </ChartCard>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#0f1729] rounded-xl p-5 border border-[#1e3a5f] text-center">
              <div className="text-gray-400 text-xs mb-2">Meta Attributed</div>
              <div className="text-3xl font-bold text-blue-400">{totalMetaPurchases}</div>
              <div className="text-gray-500 text-xs mt-1">purchases</div>
            </div>
            <div className="bg-[#0f1729] rounded-xl p-5 border border-[#1e3a5f] text-center">
              <div className="text-gray-400 text-xs mb-2">Actual Orders</div>
              <div className="text-3xl font-bold text-green-400">{totalActualOrders}</div>
              <div className="text-gray-500 text-xs mt-1">from Skiddle</div>
            </div>
            <div className="bg-[#0f1729] rounded-xl p-5 border border-[#1e3a5f] text-center">
              <div className="text-gray-400 text-xs mb-2">Attribution Gap</div>
              <div className="text-3xl font-bold text-yellow-400">+{attributionGap.toFixed(0)}%</div>
              <div className="text-gray-500 text-xs mt-1">untracked by Meta</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard title="Meta vs Actual Sales">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={combinedData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
                  <XAxis dataKey="date" stroke="#9CA3AF" fontSize={12} />
                  <YAxis stroke="#9CA3AF" fontSize={12} />
                  <Tooltip contentStyle={{ background: '#1F2937', border: '1px solid #1e3a5f', borderRadius: '8px' }} />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="metaPurchases" name="Meta Attributed" fill={COLORS.blue} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actualOrders" name="Actual Orders" fill={COLORS.green} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <InsightBox type="warning">
                Meta is capturing only {(100 - attributionGap).toFixed(0)}% of actual sales
              </InsightBox>
            </ChartCard>

            <ChartCard title="CPA Comparison">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="text-center p-4 bg-red-900/30 rounded-xl border border-red-700">
                  <div className="text-gray-400 text-xs mb-1">Meta CPA</div>
                  <div className="text-3xl font-bold text-red-400">{metaCPA > 0 ? formatCurrency(metaCPA) : '-'}</div>
                  <div className="text-xs text-gray-500">{totalMetaPurchases} attributed</div>
                </div>
                <div className="text-center p-4 bg-green-900/30 rounded-xl border border-green-700">
                  <div className="text-gray-400 text-xs mb-1">True CPA</div>
                  <div className="text-3xl font-bold text-green-400">{trueCPA > 0 ? formatCurrency(trueCPA) : '-'}</div>
                  <div className="text-xs text-gray-500">{totalActualOrders} actual orders</div>
                </div>
              </div>
              <div className="text-center p-4 bg-purple-900/30 rounded-xl border border-purple-700">
                <div className="text-gray-400 text-xs mb-1">Revenue Generated</div>
                <div className="text-3xl font-bold text-purple-400">{formatCurrency(totalRevenue)}</div>
                <div className="text-xs text-gray-500">ROAS: {roas.toFixed(2)}x</div>
              </div>
            </ChartCard>
          </div>
        </>
      )}

      <ChartCard title="Attribution Gap Analysis">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-sm font-semibold mb-3">Possible Causes</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li className="flex items-start gap-2">
                <span className="text-yellow-400">!</span>
                <span>iOS 14+ privacy restrictions limiting pixel tracking</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-400">!</span>
                <span>Cross-device conversions not being attributed</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-400">!</span>
                <span>Ad blockers preventing pixel fires</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-yellow-400">!</span>
                <span>View-through conversions beyond attribution window</span>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold mb-3">Recommendations</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li className="flex items-start gap-2">
                <span className="text-green-400">+</span>
                <span>Implement Conversions API for server-side tracking</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400">+</span>
                <span>Use UTM parameters for backup tracking</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400">+</span>
                <span>Consider true CPA for budget decisions</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400">+</span>
                <span>Review 28-day click attribution settings</span>
              </li>
            </ul>
          </div>
        </div>
      </ChartCard>
    </div>
  )
}

// Funnel View
function FunnelView({ filteredMetrics, dateLabel }) {
  const totals = useMemo(() => ({
    impressions: filteredMetrics.reduce((a, b) => a + b.impressions, 0),
    clicks: filteredMetrics.reduce((a, b) => a + b.clicks, 0),
    lpv: filteredMetrics.reduce((a, b) => a + b.landingPageViews, 0),
    atc: filteredMetrics.reduce((a, b) => a + b.addToCart, 0),
    checkout: filteredMetrics.reduce((a, b) => a + b.checkoutsInitiated, 0),
    purchases: filteredMetrics.reduce((a, b) => a + b.purchases, 0),
  }), [filteredMetrics])

  const funnelData = [
    { name: 'Impressions', value: totals.impressions, fill: COLORS.purple },
    { name: 'Clicks', value: totals.clicks, fill: COLORS.blue },
    { name: 'Landing Page Views', value: totals.lpv, fill: COLORS.cyan },
    { name: 'Add to Cart', value: totals.atc, fill: COLORS.amber },
    { name: 'Checkout', value: totals.checkout, fill: COLORS.pink },
    { name: 'Purchases', value: totals.purchases, fill: COLORS.green },
  ];

  const stages = totals.impressions > 0 ? [
    { from: 'Impressions', to: 'Clicks', rate: (totals.clicks / totals.impressions * 100).toFixed(2) },
    { from: 'Clicks', to: 'LPV', rate: totals.clicks > 0 ? (totals.lpv / totals.clicks * 100).toFixed(1) : '0' },
    { from: 'LPV', to: 'Add to Cart', rate: totals.lpv > 0 ? (totals.atc / totals.lpv * 100).toFixed(1) : '0' },
    { from: 'Add to Cart', to: 'Checkout', rate: totals.atc > 0 ? (totals.checkout / totals.atc * 100).toFixed(1) : '0' },
    { from: 'Checkout', to: 'Purchase', rate: totals.checkout > 0 ? (totals.purchases / totals.checkout * 100).toFixed(1) : '0' },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="text-center mb-4">
        <h2 className="text-xl font-semibold text-gray-200">Conversion Funnel</h2>
        <p className="text-gray-400 text-sm">Tracking user journey from impression to purchase ({dateLabel})</p>
      </div>

      {/* Visual Funnel */}
      <ChartCard title="Funnel Visualization">
        <div className="flex flex-col items-center py-6 space-y-2">
          {funnelData.map((stage, i) => {
            const width = Math.max(20, 100 - i * 15);
            return (
              <div key={i} className="flex items-center gap-4 w-full max-w-xl">
                <div
                  className="h-12 rounded-lg flex items-center justify-center text-sm font-medium transition-all"
                  style={{
                    width: `${width}%`,
                    background: stage.fill,
                    marginLeft: `${(100 - width) / 2}%`
                  }}
                >
                  <span className="text-white">{stage.name}</span>
                </div>
                <div className="text-right min-w-[100px]">
                  <div className="font-semibold">{formatNumber(stage.value)}</div>
                  {i > 0 && funnelData[0].value > 0 && (
                    <div className="text-xs text-gray-400">
                      {((stage.value / funnelData[0].value) * 100).toFixed(2)}%
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ChartCard>

      {/* Conversion Rates */}
      {stages.length > 0 && (
        <ChartCard title="Stage-by-Stage Conversion Rates">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {stages.map((stage, i) => (
              <div key={i} className="text-center p-4 bg-[#1a2744] rounded-lg">
                <div className="text-xs text-gray-400 mb-1">{stage.from} → {stage.to}</div>
                <div className="text-2xl font-bold" style={{ color: parseFloat(stage.rate) > 50 ? COLORS.green : parseFloat(stage.rate) > 20 ? COLORS.amber : COLORS.red }}>
                  {stage.rate}%
                </div>
              </div>
            ))}
          </div>
        </ChartCard>
      )}

      {/* Drop-off Analysis */}
      <ChartCard title="Drop-off Analysis & Recommendations">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-sm font-semibold mb-3 text-red-400">Biggest Drop-offs</h4>
            <div className="space-y-3">
              {totals.lpv > 0 && (
                <div className="p-3 bg-red-900/20 rounded-lg border border-red-700/50">
                  <div className="flex justify-between items-center">
                    <span>LPV → Add to Cart</span>
                    <span className="text-red-400 font-semibold">{(100 - (totals.atc / totals.lpv * 100)).toFixed(1)}% drop</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Most users leave after viewing the landing page</p>
                </div>
              )}
              {totals.impressions > 0 && (
                <div className="p-3 bg-red-900/20 rounded-lg border border-red-700/50">
                  <div className="flex justify-between items-center">
                    <span>Impressions → Clicks</span>
                    <span className="text-red-400 font-semibold">{(100 - (totals.clicks / totals.impressions * 100)).toFixed(1)}% drop</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Standard ad CTR - consider testing new creatives</p>
                </div>
              )}
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold mb-3 text-green-400">Optimization Tips</h4>
            <ul className="space-y-2 text-sm text-gray-400">
              <li className="flex items-start gap-2">
                <span className="text-green-400">+</span>
                <span>Improve landing page load speed and mobile experience</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400">+</span>
                <span>Add urgency messaging (countdown to event)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400">+</span>
                <span>Simplify checkout process</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-green-400">+</span>
                <span>Test retargeting ads for cart abandoners</span>
              </li>
            </ul>
          </div>
        </div>
      </ChartCard>
    </div>
  )
}

// Ad Sets View
function AdSetsView({ adSets }) {
  const sortedBySpend = [...adSets].sort((a, b) => b.spend - a.spend);
  const sortedByCPA = [...adSets].filter(s => s.cpa > 0).sort((a, b) => a.cpa - b.cpa);

  const temperatureData = [
    { name: 'Hot', value: adSets.filter(s => s.temperature === 'Hot').reduce((a, b) => a + b.spend, 0), color: COLORS.red },
    { name: 'Warm', value: adSets.filter(s => s.temperature === 'Warm').reduce((a, b) => a + b.spend, 0), color: COLORS.amber },
    { name: 'Cold', value: adSets.filter(s => s.temperature === 'Cold').reduce((a, b) => a + b.spend, 0), color: COLORS.blue },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="Total Ad Sets" value={adSets.length} />
        <KPICard label="With Purchases" value={adSets.filter(s => s.purchases > 0).length} />
        <KPICard label="Best CPA" value={formatCurrency(Math.min(...adSets.filter(s => s.cpa > 0).map(s => s.cpa)))} status="success" />
        <KPICard label="Total Purchases" value={adSets.reduce((a, b) => a + b.purchases, 0)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="Spend by Audience Temperature">
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={temperatureData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={90}
                paddingAngle={5}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {temperatureData.map((entry, index) => (
                  <Cell key={index} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={v => formatCurrency(v)} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Top Ad Sets by CPA">
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={sortedByCPA.slice(0, 8)} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
              <XAxis type="number" stroke="#9CA3AF" fontSize={12} tickFormatter={v => `£${v}`} />
              <YAxis type="category" dataKey="adSetName" stroke="#9CA3AF" fontSize={9} width={140} tick={{ fontSize: 8 }} />
              <Tooltip contentStyle={{ background: '#1F2937', border: '1px solid #1e3a5f', borderRadius: '8px' }} />
              <ReferenceLine x={50} stroke={COLORS.green} strokeDasharray="5 5" />
              <Bar dataKey="cpa" name="CPA" radius={[0, 4, 4, 0]}>
                {sortedByCPA.slice(0, 8).map((entry, index) => (
                  <Cell key={index} fill={entry.cpa <= 50 ? COLORS.green : entry.cpa <= 100 ? COLORS.amber : COLORS.red} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="All Ad Sets">
        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[#0f1729]">
              <tr className="text-gray-400 text-left border-b border-[#1e3a5f]">
                <th className="py-2 px-3">Ad Set</th>
                <th className="py-2 px-3">Temp</th>
                <th className="py-2 px-3">Geo</th>
                <th className="py-2 px-3 text-right">Spend</th>
                <th className="py-2 px-3 text-right">Clicks</th>
                <th className="py-2 px-3 text-right">CTR</th>
                <th className="py-2 px-3 text-right">Purchases</th>
                <th className="py-2 px-3 text-right">CPA</th>
              </tr>
            </thead>
            <tbody>
              {sortedBySpend.map((adSet, i) => (
                <tr key={i} className="border-b border-[#1e3a5f]/50 hover:bg-[#1a2744]">
                  <td className="py-2 px-3 max-w-xs truncate">{adSet.adSetName}</td>
                  <td className="py-2 px-3">
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      adSet.temperature === 'Hot' ? 'bg-red-900/50 text-red-300' :
                      adSet.temperature === 'Warm' ? 'bg-amber-900/50 text-amber-300' :
                      'bg-blue-900/50 text-blue-300'
                    }`}>
                      {adSet.temperature}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-gray-400">{adSet.geo}</td>
                  <td className="py-2 px-3 text-right">{formatCurrency(adSet.spend)}</td>
                  <td className="py-2 px-3 text-right">{formatNumber(adSet.clicks)}</td>
                  <td className="py-2 px-3 text-right">{formatPercent(adSet.ctr)}</td>
                  <td className="py-2 px-3 text-right">{adSet.purchases}</td>
                  <td className="py-2 px-3 text-right" style={{ color: getStatusColor(getPerformanceStatus(adSet.cpa)) }}>
                    {adSet.cpa > 0 ? formatCurrency(adSet.cpa) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  )
}

// Main App Component
function App() {
  const [activeTab, setActiveTab] = useState('overview')
  const [datePreset, setDatePreset] = useState('7days')
  const [showCustomDate, setShowCustomDate] = useState(false)
  const [customStart, setCustomStart] = useState('2025-12-30')
  const [customEnd, setCustomEnd] = useState('2026-01-06')

  const daysToEvent = getDaysUntilEvent();

  // Calculate filtered metrics based on date selection
  const { filteredMetrics, dateLabel } = useMemo(() => {
    const range = showCustomDate
      ? getDateRange('custom', customStart, customEnd)
      : getDateRange(datePreset)

    const filtered = filterByDateRange(dailyData.metrics, range.start, range.end)

    // Generate label
    let label = ''
    if (showCustomDate && customStart && customEnd) {
      label = `${formatShortDate(customStart)} - ${formatShortDate(customEnd)}`
    } else {
      const preset = DATE_PRESETS.find(p => p.id === datePreset)
      label = preset?.label || ''
    }

    return { filteredMetrics: filtered, dateLabel: label }
  }, [datePreset, showCustomDate, customStart, customEnd])

  const tabs = [
    { id: 'overview', label: 'Overview', hasDateFilter: true },
    { id: 'daily', label: 'Daily Trends', hasDateFilter: true },
    { id: 'creatives', label: 'Creatives', hasDateFilter: false },
    { id: 'adsets', label: 'Ad Sets', hasDateFilter: false },
    { id: 'platforms', label: 'Platforms', hasDateFilter: false },
    { id: 'geo', label: 'Geography', hasDateFilter: false },
    { id: 'attribution', label: 'Attribution', hasDateFilter: true },
    { id: 'funnel', label: 'Funnel', hasDateFilter: true },
  ]

  const currentTab = tabs.find(t => t.id === activeTab)

  return (
    <div className="min-h-screen bg-[#030712] text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-[#0f1729] border-b border-[#1e3a5f]">
        <div className="max-w-[1440px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl md:text-2xl font-bold gradient-text">DNBA Thailand 2026</h1>
              <p className="text-gray-400 text-xs">Campaign Analytics Dashboard</p>
            </div>
            <div className="text-right">
              <div className="text-2xl md:text-3xl font-bold text-orange-500">{daysToEvent}</div>
              <div className="text-gray-400 text-xs">Days to Event</div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                  activeTab === tab.id
                    ? 'bg-purple-600 text-white'
                    : 'bg-[#1a2744] text-gray-400 hover:bg-[#243352]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1440px] mx-auto px-4 py-6">
        {/* Date Filter - only show for tabs that support it */}
        {currentTab?.hasDateFilter && (
          <DateFilter
            selectedPreset={datePreset}
            onPresetChange={(id) => {
              setDatePreset(id)
              setShowCustomDate(false)
            }}
            customStart={customStart}
            customEnd={customEnd}
            onCustomStartChange={setCustomStart}
            onCustomEndChange={setCustomEnd}
            showCustom={showCustomDate}
            onToggleCustom={() => setShowCustomDate(!showCustomDate)}
          />
        )}

        {activeTab === 'overview' && (
          <OverviewView
            filteredMetrics={filteredMetrics}
            geoCountries={geoData.countries}
            dateLabel={dateLabel}
          />
        )}
        {activeTab === 'daily' && (
          <DailyTrendsView
            filteredMetrics={filteredMetrics}
            dateLabel={dateLabel}
          />
        )}
        {activeTab === 'creatives' && (
          <CreativesView creatives={creativeData.creatives} />
        )}
        {activeTab === 'adsets' && (
          <AdSetsView adSets={adSetData.adSets} />
        )}
        {activeTab === 'platforms' && (
          <PlatformsView benchmarks={benchmarksData} platformMetrics={platformData.platforms} />
        )}
        {activeTab === 'geo' && (
          <GeographyView countries={geoData.countries} />
        )}
        {activeTab === 'attribution' && (
          <AttributionView
            filteredMetrics={filteredMetrics}
            actualSales={actualSalesData}
            dateLabel={dateLabel}
          />
        )}
        {activeTab === 'funnel' && (
          <FunnelView
            filteredMetrics={filteredMetrics}
            dateLabel={dateLabel}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-gray-500 text-xs border-t border-[#1e3a5f]">
        <p>Data as of January 6, 2026 | Event: Jan 23-26, 2026 | Cafe del Mar, Phuket</p>
        <p className="mt-1">Meta purchases may differ from actual Skiddle sales</p>
      </footer>
    </div>
  )
}

export default App
