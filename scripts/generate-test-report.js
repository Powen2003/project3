const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const suites = [
  { name: 'auth', dir: 'services/auth-service', args: [] },
  { name: 'customer', dir: 'services/customer-service', args: [] },
  { name: 'product', dir: 'services/product-service', args: [] },
  { name: 'order', dir: 'services/order-service', args: [] },
  { name: 'shipment', dir: 'services/shipment-service', args: ['--e2e'] },
  { name: 'gateway', dir: 'api-gateway', args: [] },
];

const testCases = [
  ['TC-IAM-01', 'Identity & Access', 'Đăng ký tài khoản hợp lệ', ['gateway:TC-IAM-01 register', 'auth:register ok']],
  ['TC-IAM-02', 'Identity & Access', 'Đăng ký username đã tồn tại', ['gateway:duplicate username -> 409', 'auth:duplicate -> ALREADY_EXISTS']],
  ['TC-IAM-03', 'Identity & Access', 'Đăng ký thiếu password', ['gateway:TC-IAM-03 empty password -> 400']],
  ['TC-IAM-04', 'Identity & Access', 'Đăng nhập đúng thông tin', ['gateway:login ok with camelCase fields', 'auth:login ok']],
  ['TC-IAM-05', 'Identity & Access', 'Đăng nhập sai password', ['gateway:wrong password -> 401', 'auth:wrong password -> UNAUTHENTICATED']],
  ['TC-CUS-01', 'Customer & Membership', 'Lấy Customer tồn tại', ['gateway:TC-CUS-01', 'customer:TC-CUS-01']],
  ['TC-CUS-02', 'Customer & Membership', 'Lấy Customer không tồn tại', ['gateway:TC-CUS-02', 'customer:TC-CUS-02']],
  ['TC-CUS-03', 'Customer & Membership', 'Cập nhật fullname', ['gateway:TC-CUS-03', 'customer:TC-CUS-03']],
  ['TC-CUS-04', 'Customer & Membership', 'Lấy thông tin Membership', ['gateway:TC-CUS-04', 'customer:TC-CUS-04']],
  ['TC-CUS-05', 'Customer & Membership', 'Truy vấn Customer không có token', ['gateway:TC-CUS-05']],
  ['TC-PRO-01', 'Product', 'Lấy danh sách Product', ['gateway:member lists products', 'product:TC-PRO-01']],
  ['TC-PRO-02', 'Product', 'Lấy Product tồn tại', ['gateway:get product by id', 'product:TC-PRO-02']],
  ['TC-PRO-03', 'Product', 'Lấy Product không tồn tại', ['gateway:unknown product -> 404', 'product:TC-PRO-03']],
  ['TC-PRO-04', 'Product', 'Tạo Product', ['gateway:admin creates product -> 201', 'product:create product']],
  ['TC-PRO-05', 'Product', 'Cập nhật tồn kho', ['gateway:TC-PRO-05', 'product:TC-PRO-05']],
  ['TC-ORD-01', 'Order', 'Tạo Order hợp lệ', ['gateway:TC-ORD-01', 'order:TC-ORD-01']],
  ['TC-ORD-02', 'Order', 'Tạo Order không có JWT', ['gateway:create order without token -> 401']],
  ['TC-ORD-03', 'Order', 'Đặt số lượng vượt tồn kho', ['gateway:TC-ORD-03', 'order:TC-ORD-03']],
  ['TC-ORD-04', 'Order', 'Tính discount theo score', ['gateway:TC-ORD-04', 'order:TC-ORD-04']],
  ['TC-ORD-05', 'Order', 'Tạo Order và phát sự kiện', ['order:TC-ORD-05', 'order:outbox event published']],
  ['TC-SHP-01', 'Shipment', 'Nhận OrderCreated Event', ['shipment:TC-SHP-01', 'shipment:e2e: Order -> Outbox']],
  ['TC-SHP-02', 'Shipment', 'Event thiếu oid', ['shipment:TC-SHP-02', 'shipment:invalid events created no shipment']],
  ['TC-SHP-03', 'Shipment', 'Cập nhật trạng thái Shipment', ['shipment:TC-SHP-03', 'gateway:TC-SHP-03']],
  ['TC-SHP-04', 'Shipment', 'Cập nhật Shipment không tồn tại', ['shipment:TC-SHP-04', 'gateway:TC-SHP-04']],
  ['TC-SHP-05', 'Shipment', 'Nhận cùng Event hai lần', ['shipment:TC-SHP-05']],
];

function runSuite(suite) {
  process.stdout.write(`Running ${suite.name}...\n`);
  const cwd = path.join(root, suite.dir);
  if (!fs.existsSync(path.join(cwd, 'node_modules'))) {
    const install = spawnSync('npm', ['ci'], { cwd, encoding: 'utf8', stdio: 'inherit' });
    if (install.status !== 0) {
      return { name: suite.name, rows: [], code: install.status ?? 1, output: '' };
    }
  }
  const result = spawnSync(process.execPath, ['scripts/smoke-test.js', ...suite.args], { cwd, encoding: 'utf8' });
  const output = `${result.stdout || ''}${result.stderr || ''}`;
  const rows = output.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^(PASS|FAIL)\s{2}(.*)$/);
    return match ? [{ status: match[1], label: match[2].trim() }] : [];
  });
  return {
    name: suite.name,
    rows,
    code: result.status ?? 1,
    output,
  };
}

const results = suites.map(runSuite);
const labels = new Map(results.map((result) => [result.name, result.rows]));
const tcLines = [];
let tcPass = 0;

for (const [id, context, title, evidenceRules] of testCases) {
  let ok = true;
  const evidence = evidenceRules.map((rule) => {
    const separator = rule.indexOf(':');
    const suite = rule.slice(0, separator);
    const prefix = rule.slice(separator + 1);
    const found = (labels.get(suite) || []).filter((row) => row.label.startsWith(prefix));
    if (found.length === 0) {
      ok = false;
      return `${suite}: MISSING`;
    }
    if (found.some((row) => row.status === 'FAIL')) {
      ok = false;
      return `${suite}: FAIL`;
    }
    return `${suite}: ${found.length} check(s)`;
  });
  if (ok) tcPass += 1;
  tcLines.push(`| ${id} | ${context} | ${title} | ${evidence.join('; ')} | ${ok ? 'PASS' : 'FAIL'} |`);
}

const totalPass = results.reduce((sum, result) => sum + result.rows.filter((row) => row.status === 'PASS').length, 0);
const totalFail = results.reduce((sum, result) => sum + result.rows.filter((row) => row.status === 'FAIL').length, 0);
const report = [
  '# Test report',
  '',
  `Generated: ${new Date().toISOString().replace('T', ' ').slice(0, 19)}`,
  '',
  'Produced by `scripts/generate-test-report.js`: it runs the six smoke-test suites against the running system and maps their checks to the 25 test cases of the specification.',
  '',
  `## Result: ${tcPass} of ${testCases.length} test cases passed`,
  '',
  '| Test case | Bounded context | Description | Evidence (suite: number of checks) | Result |',
  '|---|---|---|---|---|',
  ...tcLines,
  '',
  '## Automated suites',
  '',
  '| Suite | Passed | Failed | Exit code |',
  '|---|---|---|---|',
  ...results.map((result) => `| ${result.name} | ${result.rows.filter((row) => row.status === 'PASS').length} | ${result.rows.filter((row) => row.status === 'FAIL').length} | ${result.code} |`),
  `| **Total** | **${totalPass}** | **${totalFail}** | |`,
  '',
].join('\n');

fs.writeFileSync(path.join(root, 'docs/test-report.md'), report, 'utf8');
for (const result of results) {
  process.stdout.write(result.output);
}
process.stdout.write(`Test cases passed: ${tcPass} of ${testCases.length}   Checks passed: ${totalPass}   Failed: ${totalFail}\n`);
process.stdout.write('Report written to docs/test-report.md\n');
process.exitCode = tcPass === testCases.length && totalFail === 0 ? 0 : 1;
