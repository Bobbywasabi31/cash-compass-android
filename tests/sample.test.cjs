const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../app/src/main/assets/core.js');

test('complete sample populates every financial view and survives a full backup round trip',()=>{
  const s=C.demo('2026-09-18'),r=C.normalize(JSON.parse(JSON.stringify(s)));
  assert.equal(r.demo,true);assert.equal(r.profile.name,'Jordan');
  assert.deepEqual(new Set(r.accounts.map(a=>a.type)),new Set(['checking','savings','cash','credit']));
  assert.equal(r.transactions.length,s.transactions.length);
  assert.ok(r.transactions.length>150);
  assert.equal(r.balanceHistory.length,12);assert.equal(r.holdings.length,3);assert.equal(r.lifeEvents.length,3);
  assert.equal(r.wallet.inbox.length,2);assert.equal(r.wallet.receipts.length,1);
  assert.ok(r.goals.every(g=>g.deadline&&g.contributions.length));
  assert.equal(r.profile.balance,1500);
  assert.equal(C.netWorth(r),3856);
  const flow=C.cashFlow(r,'2026-09-01','2026-09-30');
  assert.ok(flow.income>0&&flow.expense>0);
  assert.ok(C.cashFlowSankey(flow).outgoing.length>3);
  assert.ok(C.spendingReport(r,'2026-09').trends.every(m=>m.income>0&&m.expense>0));
});

test('sample balances, goal contributions, and reversible purchase stay consistent',()=>{
  const s=C.demo('2026-09-18'),balances=s.accounts.reduce((n,a)=>n+C.cents(a.balance),0);
  assert.equal(balances,C.cents(s.profile.balance));
  for(const g of s.goals)assert.equal(g.contributions.reduce((n,c)=>n+C.cents(c.amount),0),C.cents(g.saved));
  const current=s.transactions.find(t=>t.walletId);
  assert.equal(current.delta,-12.34);
  C.removeTransaction(s,current.id);
  assert.equal(s.profile.balance,1512.34);
  assert.equal(s.accounts.find(a=>a.type==='credit').balance,-1387.66);
  assert.ok(s.transactions.filter(t=>t.type==='transfer').every(t=>t.delta===0));
});

test('sample demonstrates overspent budgets, rollover, overdue bills, recurrence, and a lean month',()=>{
  const s=C.demo('2026-09-18'),budget=C.budgetSummary(s,'2026-09');
  assert.ok(budget.rows.some(b=>b.remaining<0));
  assert.ok(budget.rows.some(b=>b.rollover&&b.carry>0));
  const forecast=C.forecast(s,'2026-09-18');
  assert.ok(forecast.overdue.length);assert.ok(forecast.next);
  assert.ok(forecast.timeline.some(t=>t.projected));
  assert.ok(s.incomes.some(i=>i.gross));
  assert.deepEqual(new Set(s.bills.map(b=>b.repeat)),new Set(['weekly','monthly','yearly']));
  assert.ok(C.cashFlow(s,'2026-05-01','2026-05-31').net<0);
  const before=JSON.stringify(s);
  assert.ok(C.projectWealth(s).some(r=>r.value!==r.baseline));
  C.forecast(s,'2026-09-18',12);assert.equal(JSON.stringify(s),before);
});

test('sample dates remain valid around year boundaries, leap days, and the first day of a month',()=>{
  for(const today of ['2026-01-01','2026-03-01','2024-02-29','2026-09-30']) {
    const s=C.demo(today),roundTrip=C.normalize(JSON.parse(JSON.stringify(s)));
    assert.ok(s.transactions.every(t=>C.validDate(t.date)&&t.date<=today));
    assert.ok(s.balanceHistory.every(h=>C.validDate(h.date)&&h.date<=today));
    assert.ok(s.goals.every(g=>g.deadline>today));
    assert.ok(s.lifeEvents.every(e=>e.month>today.slice(0,7)));
    assert.equal(roundTrip.profile.balance,1500);
    const report=C.cashFlow(s,today.slice(0,7)+'-01',today);
    assert.ok(report.income>0&&report.expense>0);
    assert.ok(Number.isFinite(C.forecast(s,today).endBalance));
  }
  assert.throws(()=>C.demo('2026-02-30'));
});

test('sample Wallet review works without enabling capture or automatic insertion',()=>{
  const s=C.demo('2026-09-18'),count=s.transactions.length;
  assert.equal(s.reminders,false);assert.equal(s.wallet.auto,false);
  const item=s.wallet.inbox[0],p=C.parseWallet(item);
  assert.equal(p.amount,21.80);assert.equal(p.label,'Example Cafe');
  C.resolveWallet(s,item.id,{label:p.label,amount:p.amount,type:'expense',date:p.date,category:'Dining',accountId:'checking',adjust:true});
  assert.equal(s.transactions.length,count+1);assert.equal(s.profile.balance,1478.20);
  assert.equal(s.wallet.inbox.length,1);
  assert.equal(C.normalize(s).demo,true);
});
