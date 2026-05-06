module.exports = {
  preopen: [
    { symbol: '^KS11', name: 'KOSPI' },
    { symbol: '^KQ11', name: 'KOSDAQ' },
    { symbol: 'KRW=X', name: 'USD/KRW' },
    { symbol: '005930.KS', name: '삼성전자' },
    { symbol: '000660.KS', name: 'SK하이닉스' },
  ],
  usopen: [
    { symbol: 'SPY', name: 'S&P 500 ETF' },
    { symbol: 'QQQ', name: 'Nasdaq 100 ETF' },
    { symbol: 'SOXX', name: 'Semiconductor ETF' },
    { symbol: 'NVDA', name: 'NVIDIA' },
    { symbol: 'AMD', name: 'AMD' },
    { symbol: 'TSM', name: 'TSMC ADR' },
    { symbol: 'AAPL', name: 'Apple' },
    { symbol: 'MSFT', name: 'Microsoft' },
    { symbol: 'TSLA', name: 'Tesla' },
  ],
  close: [
    { symbol: '^KS11', name: 'KOSPI' },
    { symbol: '^KQ11', name: 'KOSDAQ' },
    { symbol: 'KRW=X', name: 'USD/KRW' },
    { symbol: '005930.KS', name: '삼성전자' },
    { symbol: '000660.KS', name: 'SK하이닉스' },
  ],
  global: [
    { symbol: 'CL=F', name: 'WTI Oil' },
    { symbol: 'GC=F', name: 'Gold' },
    { symbol: '^VIX', name: 'VIX' },
    { symbol: 'DX-Y.NYB', name: 'Dollar Index' },
  ],
};
