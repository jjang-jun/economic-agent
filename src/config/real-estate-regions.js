const SEOUL_LAWD_CODES = Object.freeze([
  '11110', '11140', '11170', '11200', '11215', '11230', '11260', '11290', '11305',
  '11320', '11350', '11380', '11410', '11440', '11470', '11500', '11530', '11545',
  '11560', '11590', '11620', '11650', '11680', '11710', '11740',
]);

const GYEONGGI_LAWD_CODES = Object.freeze([
  '41111', '41113', '41115', '41117', '41131', '41133', '41135', '41150',
  '41171', '41173', '41192', '41194', '41196', '41210', '41220', '41250',
  '41271', '41273', '41281', '41285', '41287', '41290', '41310', '41360',
  '41370', '41390', '41410', '41430', '41450', '41461', '41463', '41465',
  '41480', '41500', '41550', '41570', '41590', '41610', '41630', '41650',
  '41670', '41800', '41820', '41830',
]);

function parseRegionCodes(value, fallback = [...SEOUL_LAWD_CODES, ...GYEONGGI_LAWD_CODES]) {
  const codes = String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
  const selected = codes.length > 0 ? codes : fallback;
  const invalid = selected.filter(code => !/^\d{5}$/.test(code));
  if (invalid.length > 0) throw new Error(`Invalid REAL_ESTATE_REGION_CODES: ${invalid.join(', ')}`);
  return [...new Set(selected)];
}

module.exports = {
  SEOUL_LAWD_CODES,
  GYEONGGI_LAWD_CODES,
  parseRegionCodes,
};
