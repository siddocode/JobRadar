// JobRadar — Deterministic Company Branding & Monogram Utility

export function getCompanyBranding(companyName = '') {
  const name = String(companyName).trim();
  const lower = name.toLowerCase();

  if (lower.includes('razorpay')) {
    return { bg: '#EBF3FC', color: '#0C66E4', monogram: 'R' };
  }
  if (lower.includes('swiggy')) {
    return { bg: '#FFF2E8', color: '#FC8019', monogram: 'S' };
  }
  if (lower.includes('cred')) {
    return { bg: '#1B1C1D', color: '#FFFFFF', monogram: 'C' };
  }
  if (lower.includes('groww')) {
    return { bg: '#E6FAF3', color: '#00D09C', monogram: 'G' };
  }
  if (lower.includes('zepto')) {
    return { bg: '#FDF0F4', color: '#FF3269', monogram: 'Z' };
  }
  if (lower.includes('phonepe')) {
    return { bg: '#F4EEFB', color: '#6739B7', monogram: 'P' };
  }
  if (lower.includes('meesho')) {
    return { bg: '#FDEEF5', color: '#E4287C', monogram: 'M' };
  }
  if (lower.includes('zomato')) {
    return { bg: '#FEECEC', color: '#CB202D', monogram: 'Z' };
  }
  if (lower.includes('google')) {
    return { bg: '#E8F0FE', color: '#1A73E8', monogram: 'G' };
  }
  if (lower.includes('amazon')) {
    return { bg: '#FFF8E6', color: '#FF9900', monogram: 'A' };
  }
  if (lower.includes('uber')) {
    return { bg: '#111111', color: '#FFFFFF', monogram: 'U' };
  }
  if (lower.includes('microsoft')) {
    return { bg: '#EBF4FA', color: '#00A4EF', monogram: 'M' };
  }

  // Consistent hash for any other company
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hues = [168, 205, 32, 280, 195, 150];
  const hue = hues[Math.abs(hash) % hues.length];
  return {
    bg: `hsl(${hue}, 40%, 93%)`,
    color: `hsl(${hue}, 65%, 28%)`,
    monogram: (name[0] || 'C').toUpperCase()
  };
}

