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
 const s=C.demo('2026-09-18'),historyCount=s.transactions.length;s.incomes[0].repeat='monthly';s.incomes[0].anchorDay=25;
 C.saveTransaction(s,{id:'a',label:'Lunch',amount:10,type:'expense',date:'2026-09-18'});
 s.budgets=[C.budget({id:'b',category:'Other',amount:100,bucket:'flexible',start:'2026-09',rollover:true})];
 const restored=C.normalize(JSON.parse(JSON.stringify(s)));assert.equal(restored.profile.balance,1490);assert.equal(restored.transactions.length,historyCount+1);assert.equal(restored.incomes[0].repeat,'monthly');assert.equal(restored.budgets[0].rollover,true);
 C.removeTransaction(restored,restored.transactions.find(t=>t.label==='Lunch').id);assert.equal(restored.profile.balance,1500);
 delete s.transactions;delete s.budgets;assert.deepEqual(C.normalize(s).transactions,[]);
});
test('invalid backups and tax reversals fail without partially modifying cash',()=>{
 const s=C.blank();assert.throws(()=>C.normalize({...s,transactions:'bad'}));assert.throws(()=>C.transaction({type:'expense',amount:1,date:'2026-09-18',label:'x',delta:2}));
 C.saveTransaction(s,{id:'a',label:'Pay',type:'income',amount:100,date:'2026-09-18',taxDelta:20});s.profile.taxHeld=0;
 const before=JSON.stringify(s);assert.throws(()=>C.removeTransaction(s,'a'));assert.equal(JSON.stringify(s),before);
});
test('cash-crunch warnings flag 30-day dates below the safety buffer',()=>{
 const s=C.blank();s.profile.balance=500;s.profile.buffer=100;
 s.bills=[{id:'rent',label:'Rent',amount:450,date:'2026-09-25',repeat:'none',accountId:'cash',category:'Housing'}];
 const f=C.forecast(s,'2026-09-18');
 assert.ok(f.crunchDays.length>=1);
 assert.equal(f.crunchDays[0].date,'2026-09-25');
 assert.equal(f.buffer,100);
 // No buffer means no crunch days, so this never duplicates the shortfall warning.
 s.profile.buffer=0;
 assert.equal(C.forecast(s,'2026-09-18').crunchDays.length,0);
 // Comfortable cash means no crunch days either.
 const ok=C.blank();ok.profile.balance=5000;ok.profile.buffer=100;
 ok.bills=[{id:'rent',label:'Rent',amount:450,date:'2026-09-25',repeat:'none',accountId:'cash',category:'Housing'}];
 assert.equal(C.forecast(ok,'2026-09-18').crunchDays.length,0);
});
test('merchant memory learns category and account, suggests on normalized names',()=>{
 const s=C.blank();
 C.saveTransaction(s,{id:'a',label:"McDonald's",type:'expense',amount:12.5,date:'2026-09-18',category:'Dining'});
 const sug=C.suggestMerchant(s,"  mcdonald's ");
 assert.equal(sug.category,'Dining');
 assert.equal(sug.accountId,'cash');
 assert.equal(C.merchantKey('  Shell #42 - Fuel '),'shell 42 fuel');
 // Unknown merchants suggest nothing.
 assert.equal(C.suggestMerchant(s,'Unknown Shop'),null);
 assert.equal(C.suggestMerchant(s,''),null);
 // Transfers are not learned.
 C.saveAccount(s,{id:'checking',label:'Checking',type:'checking',balance:100});
 C.saveTransaction(s,{id:'b',label:'Save Transfer',type:'transfer',amount:5,date:'2026-09-18',category:'Transfer',accountId:'cash',toAccountId:'checking'});
 assert.equal(C.suggestMerchant(s,'save transfer'),null);
 // Memory survives a backup round trip and can be cleared.
 const restored=C.normalize(JSON.parse(JSON.stringify(s)));
 assert.equal(C.suggestMerchant(restored,"McDonald's").category,'Dining');
 C.clearMerchantMemory(restored);
 assert.equal(C.suggestMerchant(restored,"McDonald's"),null);
 assert.deepEqual(restored.merchantMemory,{});
 // Oversized memory is rejected on import.
 const big={...s,merchantMemory:Object.fromEntries(Array.from({length:501},(_,i)=>['m'+i,{label:'M'+i,category:'Other',accountId:'cash',uses:1}]))};
 assert.throws(()=>C.normalize(big));
});
