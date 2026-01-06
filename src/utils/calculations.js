// CPA calculation
export const calculateCPA = (spend, purchases) => {
  if (!purchases || purchases === 0) return 0;
  return spend / purchases;
};

// CTR calculation
export const calculateCTR = (clicks, impressions) => {
  if (!impressions || impressions === 0) return 0;
  return (clicks / impressions) * 100;
};

// ROAS calculation
export const calculateROAS = (revenue, spend) => {
  if (!spend || spend === 0) return 0;
  return revenue / spend;
};

// Days until event
export const getDaysUntilEvent = (eventDate = '2026-01-23') => {
  const today = new Date();
  const event = new Date(eventDate);
  const diffTime = event - today;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// Performance status based on CPA
export const getPerformanceStatus = (cpa, target = 50) => {
  if (cpa === 0) return 'neutral';
  if (cpa <= target) return 'success';
  if (cpa <= target * 1.5) return 'warning';
  return 'danger';
};

// Get status color
export const getStatusColor = (status) => {
  switch (status) {
    case 'success': return '#22c55e';
    case 'warning': return '#eab308';
    case 'danger': return '#ef4444';
    default: return '#64748b';
  }
};
