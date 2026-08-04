const DISCORD_CATEGORIES = {
  signals: {
    name: '01 핵심 신호',
    description: '즉시 확인하거나 당일 판단에 반영할 시장 신호',
  },
  assets: {
    name: '02 자산 관리',
    description: '포트폴리오 상태와 투자 성과 추적',
  },
  policy: {
    name: '03 정책 인텔리전스',
    description: '세금·부동산 등 자산에 영향을 주는 정책 변화',
  },
  operations: {
    name: '04 운영',
    description: '수집기·Provider·배포 상태 점검',
  },
};

const DISCORD_CHANNELS = {
  urgent: {
    name: '긴급-알림',
    description: '시장 스트레스, 치명적 공시, 즉시 확인이 필요한 장애',
    category: 'signals',
  },
  action: {
    name: '일일-행동',
    description: '매수·관찰·보유·축소·매도 후보',
    category: 'signals',
  },
  briefing: {
    name: '시장-브리핑',
    description: '장전·장중·마감·유럽·미국장 경제 뉴스 다이제스트',
    category: 'signals',
  },
  portfolio: {
    name: '포트폴리오',
    description: '평가액, 현금, 자금 흐름, 경제적 자유 상태',
    category: 'assets',
  },
  policy_tax: {
    name: '정책-세금',
    description: '세제, ISA, 연금, 자본시장 정책',
    category: 'policy',
  },
  policy_real_estate: {
    name: '정책-부동산',
    description: '주택, 대출, 청약, 부동산 세제 정책',
    category: 'policy',
  },
  pre_news: {
    name: '선행신호',
    description: '가격·거래량 이상징후와 기사 선후관계 연구',
    category: 'signals',
  },
  performance: {
    name: '성과-리뷰',
    description: '추천·실제 거래의 주간·월간 성과',
    category: 'assets',
  },
  ops: {
    name: '시스템-점검',
    description: '수집기, 가격 Provider, 배포, workflow 상태',
    category: 'operations',
  },
};

function discordWebhookEnvName(channel) {
  return `DISCORD_WEBHOOK_${String(channel || '').toUpperCase()}`;
}

module.exports = {
  DISCORD_CATEGORIES,
  DISCORD_CHANNELS,
  discordWebhookEnvName,
};
