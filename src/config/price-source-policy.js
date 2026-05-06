const PRICE_SOURCE_POLICY = {
  currentPrice: {
    domestic: ['kis-rest', 'naver-finance', 'yahoo-finance'],
    global: ['yahoo-finance'],
  },
  realtime: {
    domestic: ['kis-websocket'],
    global: [],
  },
  eodOfficial: {
    domestic: ['krx-openapi', 'data-go-kr', 'kis-rest'],
    global: ['yahoo-finance'],
  },
  backtest: {
    domestic: ['pykrx', 'finance-data-reader'],
    global: ['finance-data-reader', 'yahoo-finance'],
  },
};

module.exports = {
  PRICE_SOURCE_POLICY,
};
