const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../app/src/main/assets/core.js');

function report(transactions,start='2026-01-01',end='2026-01-31',account='all',group='category') {
  const state=C.blank();
  state.transactions=transactions.map((row,i)=>({id:String(i),date:'2026-01-15',accountId:'a',label:'Example merchant',category:'Other',...row}));
  return C.cashFlow(state,start,end,account,group);
}
const income=(amount,category='Pay',extra={})=>({type:'income',amount,category,...extra});
const expense=(amount,category='Food',extra={})=>({type:'expense',amount,category,...extra});
const sum=rows=>rows.reduce((n,row)=>n+row.cents,0);
function balanced(flow) {
  assert.equal(sum(flow.incoming),flow.totalCents);
  assert.equal(sum(flow.outgoing),flow.totalCents);
  for(const node of [...flow.incoming,...flow.outgoing]) {
    assert.ok(Number.isSafeInteger(node.cents)&&node.cents>0);
    if(node.members.length)assert.equal(sum(node.members),node.cents);
  }
}

test('Sankey preserves cents, separates saved income, and leaves the report untouched',()=>{
  const r=report([income(100.03),expense(10.01),expense(20.01,'Rent')]);
  const before=JSON.stringify(r),flow=C.cashFlowSankey(r);
  balanced(flow);
  assert.equal(flow.incomeCents,10003);
  assert.equal(flow.expenseCents,3002);
  assert.equal(flow.savedCents,7001);
  assert.equal(flow.gapCents,0);
  assert.equal(flow.outgoing.find(n=>n.kind==='saved').cents,7001);
  assert.equal(JSON.stringify(r),before);
});

test('overspending has a funding gap, never a negative Saved node',()=>{
  const flow=C.cashFlowSankey(report([income(10.01),expense(15.02)]));
  balanced(flow);
  assert.equal(flow.totalCents,1502);
  assert.equal(flow.incoming.find(n=>n.kind==='gap').cents,501);
  assert.equal(flow.savedCents,0);
  assert.ok(!flow.outgoing.some(n=>n.kind==='saved'));
});

test('income-only, expense-only, and exact break-even periods stay balanced',()=>{
  const onlyIncome=C.cashFlowSankey(report([income(0.01)]));
  const onlyExpense=C.cashFlowSankey(report([expense(0.01)]));
  const equal=C.cashFlowSankey(report([income(3.03),expense(3.03)]));
  for(const flow of [onlyIncome,onlyExpense,equal])balanced(flow);
  assert.equal(onlyIncome.outgoing[0].kind,'saved');
  assert.equal(onlyExpense.incoming[0].kind,'gap');
  assert.equal(equal.savedCents,0);assert.equal(equal.gapCents,0);
});

test('empty and transfer-only periods do not fabricate flows from balances or planned income',()=>{
  const state=C.blank();state.profile.balance=900;state.incomes=[{amount:500,date:'2026-01-20'}];
  for(const transactions of [[],[{type:'transfer',amount:99,date:'2026-01-15',accountId:'a',toAccountId:'b'}]]) {
    state.transactions=transactions;
    const flow=C.cashFlowSankey(C.cashFlow(state,'2026-01-01','2026-01-31'));
    balanced(flow);assert.equal(flow.totalCents,0);
    assert.deepEqual(flow.incoming,[]);assert.deepEqual(flow.outgoing,[]);
  }
});

test('groups under 3% combine with existing Other without dropping a cent',()=>{
  const flow=C.cashFlowSankey(report([income(100),expense(80,'Housing'),expense(14,'Food'),expense(3,'Transit'),expense(2,'Coffee'),expense(1,'oThEr')]));
  balanced(flow);
  const other=flow.outgoing.filter(n=>n.label==='Other');
  assert.equal(other.length,1);assert.equal(other[0].cents,300);
  assert.deepEqual(other[0].members.map(n=>n.label),['Coffee','oThEr']);
  assert.ok(flow.outgoing.some(n=>n.label==='Transit'));
  assert.ok(!flow.outgoing.some(n=>n.label==='Coffee'));
});

test('bounds the number of named income and expense groups and retains overflow details',()=>{
  const rows=Array.from({length:10},(_,i)=>[income(10,'Job '+i),expense(8,'Category '+i)]).flat();
  const flow=C.cashFlowSankey(report(rows));balanced(flow);
  assert.equal(flow.incoming.filter(n=>!n.grouped).length,5);
  assert.equal(flow.outgoing.filter(n=>n.kind==='expense'&&!n.grouped).length,6);
  assert.equal(flow.incoming.find(n=>n.grouped).members.length,5);
  assert.equal(flow.outgoing.find(n=>n.grouped).members.length,4);
  assert.equal(flow.savedCents,2000);
});

test('a large named Other category also joins small categories only once',()=>{
  const flow=C.cashFlowSankey(report([income(100),expense(97,'Other'),expense(2,'Bus'),expense(1,'Coffee')]));
  balanced(flow);assert.equal(flow.outgoing.length,1);
  assert.equal(flow.outgoing[0].cents,10000);assert.equal(flow.outgoing[0].members.length,3);
});

test('Sankey honors inclusive dates, account filters, merchant grouping, and transfer exclusion',()=>{
  const rows=[income(50,'Pay',{date:'2026-01-01'}),expense(10,'Food',{date:'2026-01-31',label:'Cafe A'}),expense(5,'food',{label:'Cafe B'}),
    expense(20,'Food',{accountId:'b'}),income(999,'Pay',{date:'2025-12-31'}),expense(999,'Food',{date:'2026-02-01'}),
    {type:'transfer',amount:500,accountId:'a',toAccountId:'b'}];
  const category=C.cashFlowSankey(report(rows,'2026-01-01','2026-01-31','a'));
  balanced(category);assert.equal(category.incomeCents,5000);assert.equal(category.expenseCents,1500);
  assert.equal(category.outgoing.filter(n=>n.kind==='expense').length,1);
  const merchant=C.cashFlowSankey(report(rows,'2026-01-01','2026-01-31','a','merchant'));
  balanced(merchant);assert.equal(merchant.outgoing.filter(n=>n.kind==='expense').length,2);
  const empty=C.cashFlowSankey(report(rows,'2026-03-01','2026-03-31','a'));
  assert.equal(empty.totalCents,0);
});

test('category names cannot masquerade as the synthetic Saved and Funding gap nodes',()=>{
  const flow=C.cashFlowSankey(report([income(100,'Funding gap'),expense(10,'Saved')]));
  balanced(flow);
  assert.equal(flow.incoming[0].kind,'income');
  assert.equal(flow.outgoing.find(n=>n.kind==='expense').cents,1000);
  assert.equal(flow.outgoing.find(n=>n.kind==='saved').cents,9000);
});

test('large collections and tiny categories conserve all cash through grouping',()=>{
  const flow=C.cashFlowSankey(report([income(1000000000),...Array.from({length:9999},(_,i)=>expense(0.01,'Small '+i))]));
  balanced(flow);assert.equal(flow.expenseCents,9999);
  assert.equal(flow.outgoing.find(n=>n.grouped).members.length,9999);
  assert.equal(flow.savedCents,99999990001);
});
