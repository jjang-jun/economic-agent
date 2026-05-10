const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function includes(file, pattern) {
  const content = read(file);
  if (pattern instanceof RegExp) return pattern.test(content);
  return content.includes(pattern);
}

const checks = [
  {
    file: 'docs/AGENT_HARNESS.md',
    pattern: '# Agent Harness',
    message: 'docs/AGENT_HARNESS.md must exist as the long-running task harness entry point',
  },
  {
    file: 'docs/AGENT_HARNESS.md',
    pattern: '## 작업 계약',
    message: 'agent harness must define a task contract',
  },
  {
    file: 'docs/AGENT_HARNESS.md',
    pattern: '## 검증 루프',
    message: 'agent harness must define a verification loop',
  },
  {
    file: 'docs/AGENT_HARNESS.md',
    pattern: '## 엔트로피 관리',
    message: 'agent harness must define entropy management rules',
  },
  {
    file: 'docs/README.md',
    pattern: 'AGENT_HARNESS.md',
    message: 'docs/README.md must index AGENT_HARNESS.md',
  },
  {
    file: 'AGENTS.md',
    pattern: 'docs/AGENT_HARNESS.md',
    message: 'AGENTS.md must point Codex to the harness doc',
  },
  {
    file: 'README.md',
    pattern: 'docs/AGENT_HARNESS.md',
    message: 'README.md must mention the harness doc in the Codex/doc map',
  },
  {
    file: 'package.json',
    pattern: '"agent:harness-check"',
    message: 'package.json must expose npm run agent:harness-check',
  },
];

function main() {
  const failures = checks.filter(check => !includes(check.file, check.pattern));
  if (failures.length > 0) {
    console.error('[agent-harness-check] failed');
    for (const failure of failures) {
      console.error(`- ${failure.message}`);
    }
    process.exit(1);
  }
  console.log(`[agent-harness-check] ok (${checks.length} checks)`);
}

main();
