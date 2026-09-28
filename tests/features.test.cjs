const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../app/src/main/assets/core.js');
test('transactions round to cents and edits/deletes reverse only their own adjustments',()=>{
 const s=C.blank();s.profile.balance=100;
 C.saveTransaction(s,{id:'a',label:'Food',type:'expense',amount:12.34,date:'2026-09-18',category:'Groceries'});
 assert.equal(s.profile.balance,87.66);
 C.saveTransaction(s,{...s.transactions[0],amount:10,delta:undefined});assert.equal(s.profile.balance,90);
 C.saveTransaction(s,{id:'b',label:'Past',type:'expense',amount:20,date:'2026-09-17',adjust:false});assert.equal(s.profile.balance,90);
 C.removeTransaction(s,'b');assert.equal(s.profile.balance,90);C.removeTransaction(s,'a');assert.equal(s.profile.balance,100);
});
test('monthly recurrence preserves Jan 31 through February and includes multiple payments',()=>{
 const x={id:'rent',label:'Rent',date:'2028-01-31',amount:100,repeat:'monthly',anchorDay:31};
 assert.equal(C.nextDate(x),'2028-02-29');assert.equal(C.nextDate({...x,date:'2028-02-29'}),'2028-03-31');
 assert.equal(C.nextDate({...x,date:'2027-01-31'}),'2027-02-28');
 const s=C.blank();s.profile.balance=1000;s.bills=[x];s.incomes=[{id:'pay',date:'2028-02-29',amount:500}];
 assert.equal(C.forecast(s,'2028-01-31').held,200);
 C.settle(s,'bills','rent',true,'2028-01-31'); assert.equal(s.bills[0].date,'2028-02-29');assert.equal(s.profile.balance,900);assert.equal(s.transactions.length,1);
 assert.equal(C.forecast(s,'2028-02-01').held,100);
});
test('weekly and biweekly deposits recur in forecast without changing cash',()=>{
 const s=C.blank();s.incomes=[{id:'p',amount:100,date:'2026-09-18',repeat:'weekly'}];
 const before=JSON.stringify(s);assert.equal(C.forecast(s,'2026-09-18').endBalance,500);assert.equal(JSON.stringify(s),before);
 s.incomes[0].repeat='biweekly';assert.equal(C.forecast(s,'2026-09-18').endBalance,300);
});
test('late yearly income still supplies the next payday and reserves bills through it',()=>{
 const s=C.blank();s.profile.balance=2000;
 s.incomes=[{id:'bonus',label:'Annual bonus',amount:500,date:'2026-08-01',repeat:'yearly'}];
 s.bills=[{id:'rent',label:'Rent',amount:100,date:'2026-09-25',repeat:'monthly'}];
 const before=JSON.stringify(s), forecast=C.forecast(s,'2026-09-19');
 assert.equal(forecast.next.date,'2027-08-01');assert.equal(forecast.next.projected,true);
 assert.equal(forecast.held,1100);assert.equal(forecast.safe,900);
 assert.equal(forecast.lateIncome.length,1);assert.equal(forecast.timeline.length,1);
 assert.equal(forecast.endBalance,1900);assert.equal(JSON.stringify(s),before);
 s.incomes.push({id:'pay',label:'Earlier payment',amount:50,date:'2026-12-01'});
 assert.equal(C.forecast(s,'2026-09-19').next.date,'2026-12-01');
 assert.equal(C.forecast(s,'2026-09-19').held,300);
});
test('gross recurring settlement reserves tax once and records history',()=>{
 const s=C.blank();s.profile.taxRate=20;s.incomes=[{id:'p',amount:100,date:'2026-09-18',repeat:'monthly',gross:true}];
 C.settle(s,'incomes','p',true,'2026-09-18');assert.equal(s.profile.balance,100);assert.equal(s.profile.taxHeld,20);assert.equal(s.incomes[0].date,'2026-10-18');
 assert.equal(s.transactions[0].taxDelta,20); C.removeTransaction(s,s.transactions[0].id);assert.equal(s.profile.balance,0);assert.equal(s.profile.taxHeld,0);
});
test('budget rollover includes underspending and overspending, case insensitive categories',()=>{
 const s=C.blank();s.budgets=[C.budget({id:'b',category:'Food',amount:100,bucket:'flexible',start:'2026-08',rollover:true})];
 C.saveTransaction(s,{id:'1',label:'Shop',category:'food',type:'expense',date:'2026-08-20',amount:120,adjust:false});
 C.saveTransaction(s,{id:'2',label:'Shop',category:'Food',type:'expense',date:'2026-09-20',amount:30,adjust:false});
 C.saveTransaction(s,{id:'3',label:'Bus',category:'Transport',type:'expense',date:'2026-09-20',amount:4,adjust:false});
 const b=C.budgetSummary(s,'2026-09');assert.equal(b.rows[0].carry,-20);assert.equal(b.rows[0].remaining,50);assert.equal(b.unbudgeted,4);
 s.budgets[0].rollover=false;assert.equal(C.budgetSummary(s,'2026-09').rows[0].remaining,70);
 assert.equal(C.budgetSummary(s,'2026-07').rows.length,0);
});
test('legacy migration and new backup round trips preserve balance, schedules, ledger and budgets',()=>{
 const s=C.demo('2026-09-18');s.incomes[0].repeat='monthly';s.incomes[0].anchorDay=25;
 C.saveTransaction(s,{id:'a',label:'Lunch',amount:10,type:'expense',date:'2026-09-18'});
 s.budgets=[C.budget({id:'b',category:'Other',amount:100,bucket:'flexible',start:'2026-09',rollover:true})];
 const restored=C.normalize(JSON.parse(JSON.stringify(s)));assert.equal(restored.profile.balance,1490);assert.equal(restored.transactions.length,1);assert.equal(restored.incomes[0].repeat,'monthly');assert.equal(restored.budgets[0].rollover,true);
 C.removeTransaction(restored,restored.transactions[0].id);assert.equal(restored.profile.balance,1500);
 delete s.transactions;delete s.budgets;assert.deepEqual(C.normalize(s).transactions,[]);
});
test('invalid backups and tax reversals fail without partially modifying cash',()=>{
 const s=C.blank();assert.throws(()=>C.normalize({...s,transactions:'bad'}));assert.throws(()=>C.transaction({type:'expense',amount:1,date:'2026-09-18',label:'x',delta:2}));
 C.saveTransaction(s,{id:'a',label:'Pay',type:'income',amount:100,date:'2026-09-18',taxDelta:20});s.profile.taxHeld=0;
 const before=JSON.stringify(s);assert.throws(()=>C.removeTransaction(s,'a'));assert.equal(JSON.stringify(s),before);
});
