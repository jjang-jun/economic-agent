function errorChain(error) {
  const chain = [];
  let current = error;
  while (current && chain.length < 4) {
    chain.push(current);
    current = current.cause;
  }
  return chain;
}

function formatNetworkError(error) {
  const chain = errorChain(error);
  const codes = [...new Set(chain.map(item => item?.code).filter(Boolean).map(String))];
  const messages = [...new Set(chain
    .map(item => item?.message)
    .filter(Boolean)
    .map(String))];
  const prefix = codes.length > 0 ? `${codes.join('/')} · ` : '';
  return `${prefix}${messages.join(' ← ') || String(error || 'unknown error')}`;
}

module.exports = { errorChain, formatNetworkError };
