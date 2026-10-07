/* PDF bank-statement import: statement-line heuristics, text grouping, and
   the shared preview pipeline. Everything is on-device; the parser is
   best-effort and the preview is the safety net. */
const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../app/src/main/assets/core.js');
const setup=()=>{const s=C.blank();s.profile.balance=1000;C.ensureAccounts(s);return s;};
const T='2026-11-01'; // fixed "today" so statement-date tests stay deterministic

test('groupTextItems groups pdf.js items into lines by y, ordered by x',()=>{
  const items=[
    {str:'WORLD',transform:[1,0,0,1,100,700]},
    {str:'HELLO',transform:[1,0,0,1,50,700]},
    {str:'NEXT',transform:[1,0,0,1,50,680]},
    {str:'  ',transform:[1,0,0,1,10,680]},
    {str:'off',transform:[1,0,0,1,160,701.5]}, // slight y wobble stays on the line
  ];
  assert.deepEqual(C.groupTextItems(items),['HELLO WORLD off','NEXT']);
  assert.deepEqual(C.groupTextItems([]),[]);
  assert.deepEqual(C.groupTextItems([{str:'x'}]),[]); // no transform -> dropped
});

test('statement parser handles many date formats',()=>{
  const lines=[
    '10/05/2026 STORE A $12.50',
    '10-06-26 STORE B $12.50',
    '2026-10-07 STORE C $12.50',
    'Oct 8 STORE D $12.50',
    'October 9, 2026 STORE E $12.50',
    '10 Oct 2026 STORE F $12.50',
    '11-Oct-26 STORE G $12.50',
    'Jan 5 STORE H $12.50',
  ];
  const rows=C.parseStatementLines(lines,{today:T,year:2026});
  assert.deepEqual(rows.map(r=>r.date),['2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09','2026-10-10','2026-10-11','2026-01-05']);
  assert.equal(rows[0].label,'STORE A');
});

test('statement parser handles amount styles and signs',()=>{
  const rows=C.parseStatementLines([
    '10/05/2026 Store A $1,234.56',
    '10/05/2026 Store B -$12.50',
    '10/05/2026 Store C $-12.50',
    '10/05/2026 Store D (12.50)',
    '10/05/2026 Store E 12.50-',
    '10/05/2026 Store F 12.50 CR',
    '10/05/2026 Store G 12.50',
  ],{today:T,year:2026});
  assert.deepEqual(rows.map(r=>r.amountText),['1234.56','-12.50','-12.50','-12.50','-12.50','-12.50','12.50']);
  assert.deepEqual(rows.map(r=>r.type),['expense','income','income','income','income','income','expense']);
});

test('statement parser skips headers, footers, totals, and garbage',()=>{
  const rows=C.parseStatementLines([
    'Statement Period: Oct 1, 2026 - Oct 31, 2026',
    'Page 1 of 3',
    'Page 2',
    'Account Summary',
    'Beginning balance $5,000.00',
    'Total purchases $63.74',
    'Subtotal $10.00',
    'continued',
    'Have a great day!',
    '10/05/2026',
    '$12.50',
    '10/05/2026 REAL STORE $12.50',
  ],{today:T});
  assert.equal(rows.length,1);
  assert.equal(rows[0].label,'REAL STORE');
  assert.equal(rows[0].date,'2026-10-05'); // year inferred from the statement period
});

test('statement parser uses section headers for type and treats refunds as income',()=>{
  const rows=C.parseStatementLines([
    'Purchases',
    '10/05/2026 STORE $12.50',
    '10/06/2026 REFUND ISSUED (5.00)',
    'Payments and Credits',
    '10/20/2026 AUTOPAY PAYMENT -200.00',
    '10/21/2026 REWARD CREDIT 25.00',
  ],{today:T,year:2026});
  assert.deepEqual(rows.map(r=>r.type),['expense','income','income','income']);
  assert.equal(rows[1].amountText,'-5.00');
});

test('statement parser takes the first amount and drops running balances from the label',()=>{
  const rows=C.parseStatementLines(['10/05/2026 STORE $12.50 $4,987.50'],{today:T,year:2026});
  assert.equal(rows.length,1);
  assert.equal(rows[0].amountText,'12.50');
  assert.equal(rows[0].label,'STORE');
});

test('statement parser rolls December dates back a year when read in January',()=>{
  const rows=C.parseStatementLines(['Dec 28 HOLIDAY SHOP $30.00'],{today:'2026-01-05'});
  assert.equal(rows[0].date,'2025-12-28');
});

test('statement parser does not mistake words for month names',()=>{
  const rows=C.parseStatementLines([
    'Market 5 special $10.00',
    'Maybe later $10.00',
  ],{today:T,year:2026});
  assert.equal(rows.length,0);
});

test('statement rows flow through the shared preview pipeline',()=>{
  const s=setup();
  const parsed=C.parseStatementLines([
    '10/05/2026 Chipotle $12.50',
    '10/05/2026 Chipotle $12.50',
  ],{today:T,year:2026});
  const out=C.previewRows(s,parsed,'cash');
  assert.equal(out.length,2);
  assert.equal(out[0].transaction.label,'Chipotle');
  assert.equal(out[0].transaction.type,'expense');
  assert.equal(out[0].transaction.amount,12.50);
  assert.equal(out[0].transaction.date,'2026-10-05');
  assert.equal(out[0].duplicate,false);
  assert.equal(out[1].duplicate,true); // duplicate detection matches CSV behavior
  assert.ok(Array.isArray(out.transferPairs));
  // bad rows surface with the "Statement row N" prefix
  assert.throws(()=>C.previewRows(s,[{rowTag:'Statement row',rowNum:3,date:'2099-01-01',label:'X',amountText:'5',type:'expense'}],'cash'),/Statement row 3/);
});

test('previewRows still validates CSV-shaped rows exactly like previewCSV did',()=>{
  const s=setup();
  const csv=C.previewCSV(s,'date,description,amount\r\n2026-09-18,Shop,-5','cash');
  const rows=C.previewRows(s,[{rowTag:'CSV row',rowNum:2,colCount:3,headerLen:3,date:'2026-09-18',label:'Shop',amountText:'-5',type:undefined,category:'',accountName:'',toAccountName:''}],'cash');
  assert.equal(rows[0].transaction.type,csv[0].transaction.type);
  assert.equal(rows[0].transaction.amount,csv[0].transaction.amount);
  assert.throws(()=>C.previewRows(s,[{rowTag:'CSV row',rowNum:2,colCount:2,headerLen:3,date:'2026-09-18',label:'Shop',amountText:'-5',type:'expense'}],'cash'),/Column count/);
});
