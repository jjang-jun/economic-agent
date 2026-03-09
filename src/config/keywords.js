const KEYWORDS = {
  must_include: [
    '금리', '기준금리', '통화정책', 'FOMC', '금통위',
    'CPI', '물가', '인플레이션',
    '환율', '달러', '원화',
    '반도체', 'AI', '엔비디아', 'TSMC', '삼성전자', 'SK하이닉스',
    '코스피', 'S&P', '나스닥',
    '부동산', '주담대', 'DSR', '청약',
    'ETF', 'Figma', 'Adobe',
    '고용', '실업률', 'GDP', 'PMI',
    '유가', '원유', 'WTI', '배럴', '석유', 'OPEC',
    'Trump', 'tariff', 'trade war', 'Bloomberg',
    'Fed', 'rate cut', 'rate hike', 'inflation',
    'treasury', 'bond', 'recession', 'oil', 'crude',
  ],
  high_priority: [
    '긴급', '속보', '폭락', '폭등', '서킷브레이커',
    '금리 인하', '금리 인상', '기준금리 변경',
    '전쟁',
  ],

  // 키워드별 중요도 가중치
  weight: {
    5: ['속보', '긴급', '폭락', '폭등', '서킷브레이커', '전쟁'],
    4: ['금리 인하', '금리 인상', '기준금리', 'FOMC', '금통위', 'CPI', '제재', '관세',
        'rate cut', 'rate hike', 'executive order', 'sanction', 'tariff',
        '유가 급등', '유가 급락', '원유 급등'],
    3: ['금리', '통화정책', '인플레이션', '환율', '반도체', 'GDP', '실업률',
        '삼성전자', 'SK하이닉스', '코스피', 'S&P', '나스닥',
        'Fed', 'inflation', 'recession', 'treasury', 'Trump',
        '유가', '원유', 'WTI', 'OPEC', 'oil', 'crude', '배럴'],
    2: ['물가', '달러', '원화', 'AI', '엔비디아', 'TSMC', '부동산', '주담대', 'DSR', '청약',
        'ETF', 'Figma', 'Adobe', '고용', 'PMI', 'trade war', 'bond', 'Bloomberg'],
  },

  // 감성 사전 (일반 + 도메인 특화)
  sentiment: {
    bullish: [
      '상승', '급등', '폭등', '호재', '개선', '회복', '성장', '최고', '흑자', '수혜',
      '강세', '반등', '돌파', '확대', '호황', '매수', '낙관', '완화',
      '금리 인하', '유동성 공급', '부양', '감세',
      'surge', 'rally', 'gain', 'rise', 'boom', 'bullish', 'recovery',
      'growth', 'beat', 'upgrade', 'record high', 'optimism', 'rate cut',
    ],
    bearish: [
      '하락', '급락', '폭락', '악재', '악화', '위기', '침체', '적자', '손실',
      '약세', '붕괴', '축소', '불황', '매도', '비관', '리스크', '긴축',
      '금리 인상', '유동성 축소', '물가 상승', '고유가', '공급 차질', '봉쇄',
      '유조선', '원유 공급', '석유 수급', '배럴당',
      'fall', 'drop', 'plunge', 'crash', 'decline', 'bearish', 'recession',
      'loss', 'downgrade', 'sell-off', 'fear', 'risk', 'slump', 'weak',
      'oil price', 'crude surge', 'supply disruption',
    ],
  },

  // 섹터 분류 키워드
  sectors: {
    '반도체': ['반도체', '삼성전자', 'SK하이닉스', '엔비디아', 'TSMC', 'AI칩', 'HBM', 'DRAM',
               'semiconductor', 'NVIDIA', 'chip'],
    '에너지·원자재': ['유가', '원유', 'WTI', 'OPEC', '석유', '배럴', '유조선', '가스', 'LNG',
                     'oil', 'crude', 'energy', 'petroleum'],
    '금융·통화': ['금리', '기준금리', 'FOMC', '금통위', '은행', '보험', '증권', '채권',
                  'Fed', 'rate', 'treasury', 'bond', 'banking'],
    '부동산': ['부동산', '주담대', 'DSR', '청약', '아파트', '분양', '전세', '매매'],
    '거시경제': ['CPI', '물가', '인플레이션', '환율', 'GDP', 'PMI', '실업률', '고용',
                'inflation', 'recession', 'unemployment'],
    '테크': ['AI', 'Figma', 'Adobe', '클라우드', 'SaaS', '플랫폼',
             'tech', 'software', 'cloud'],
    '무역·지정학': ['관세', '제재', '전쟁', 'Trump', 'tariff', 'sanction', 'trade war',
                    'executive order', 'ban', '봉쇄', '호르무즈'],
  },
};

module.exports = KEYWORDS;
