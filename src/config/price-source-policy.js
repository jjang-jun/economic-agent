const PRICE_SOURCE_POLICY = {
  currentPrice: {
    domestic: ['kis-rest', 'naver-finance', 'yahoo-finance'],
    global: ['alpaca-market-data', 'fmp', 'alpha-vantage', 'tiingo-eod', 'yahoo-finance'],
  },
  realtime: {
    domestic: ['kis-websocket'],
    global: ['alpaca-websocket', 'massive-websocket'],
  },
  eodOfficial: {
    domestic: ['krx-openapi', 'data-go-kr', 'kis-rest'],
    global: ['tiingo-eod', 'alpha-vantage', 'fmp', 'yahoo-finance'],
  },
  backtest: {
    domestic: ['pykrx', 'finance-data-reader'],
    global: ['massive', 'tiingo-eod', 'alpha-vantage', 'finance-data-reader', 'yahoo-finance'],
  },
  fundamentals: {
    domestic: ['dart-api'],
    global: ['fmp'],
  },
};

module.exports = {
  PRICE_SOURCE_POLICY,
};
