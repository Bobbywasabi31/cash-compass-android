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

test('late-paycheck scenario shifts payday and deepens the crunch',()=>{
 const s=C.blank();let n=0;const id=()=>'t'+(++n);
 s.incomes.push({id:'i',label:'Job',amount:2000,date:'2026-10-10',repeat:'none'});
 s.bills.push({id:'b',label:'Rent',amount:900,date:'2026-10-12'});
 C.saveTransaction(s,{id:id(),label:'Cash',type:'expense',amount:50,date:'2026-10-01',category:'Other',adjust:false});
 const base=C.forecast(s,'2026-10-01');
 const slip=C.forecast(s,'2026-10-01',0,5);
 // Payday moved 5 days later; the rent now falls before pay.
 assert.equal(slip.slipDate,'2026-10-15');
 assert.equal(slip.days,14);
 assert.equal(slip.held,900);
 assert.equal(base.held,0);
 // Timing shifts: the trough deepens even though the 30-day total is unchanged.
 assert.equal(slip.endBalance,base.endBalance);
 assert.ok(slip.low<base.low,'slipping payday should deepen the low point');
 // Zero slip is identical to the old behaviour.
 const same=C.forecast(s,'2026-10-01',0,0);
 assert.equal(same.endBalance,base.endBalance);
 assert.equal(same.slipDate,'2026-10-10');
});

test('subscription detector finds monthly charges, flags price hikes, ignores noise',()=>{
 const s=C.blank();let n=0;const id=()=>'t'+(++n);
 const add=(date,amount,label='Example Streaming',category='Subscriptions')=>
   C.saveTransaction(s,{id:id(),label,type:'expense',amount,date,category,adjust:false});
 ['2026-04-05','2026-05-05','2026-06-05','2026-07-05','2026-08-05'].forEach(d=>add(d,14.99));
 add('2026-09-05',19.99); // price increase on the latest charge
 // Irregular noise: only two occurrences, uneven gaps.
 add('2026-04-10',50,'Random Shop');add('2026-09-01',51,'Random Shop');
 const subs=C.detectSubscriptions(s,'2026-09-18');
 assert.equal(subs.length,1);
 const sub=subs[0];
 assert.equal(sub.cycle,'monthly');
 assert.equal(sub.count,6);
 assert.equal(sub.amount,14.99); // median, not the hiked price
 assert.equal(sub.priceUp,true);
 assert.equal(sub.nextDate,'2026-10-05');
 assert.equal(sub.alreadyPlanned,false);
 // A matching bill marks it as already planned.
 s.bills.push({id:'sb',label:'Example Streaming',amount:19.99,date:'2026-10-05',repeat:'monthly'});
 const subs2=C.detectSubscriptions(s,'2026-09-18');
 assert.equal(subs2[0].alreadyPlanned,true);
});

test('variable bill estimates average the last 3 matching expenses',()=>{
 const s=C.blank();let n=0;const id=()=>'t'+(++n);
 const add=(date,amount,label='City Power')=>
   C.saveTransaction(s,{id:id(),label,type:'expense',amount,date,category:'Utilities',adjust:false});
 add('2026-07-10',80);add('2026-08-10',90);add('2026-09-10',100);add('2026-06-10',200);
 // Last 3 only: (80+90+100)/3 = 90.
 assert.equal(C.estimateBillAmount(s,'City Power','2026-09-18'),90);
 // Processor-noise labels match the same merchant (roadmap #31).
 assert.equal(C.estimateBillAmount(s,'SQ *City Power #42','2026-09-18'),90);
 // No history: null, and the entered amount is used instead.
 assert.equal(C.estimateBillAmount(s,'Unknown Utility','2026-09-18'),null);
 // Forecast uses the estimate for flagged bills.
 s.bills.push({id:'u',label:'City Power',amount:50,date:'2026-10-10',estimate:true});
 s.incomes.push({id:'i',label:'Job',amount:2000,date:'2026-10-05',repeat:'none'});
 const m=C.forecast(s,'2026-10-01');
 const billEvent=m.timeline.find(e=>e.kind==='bills');
 assert.equal(billEvent.amount,90);
 assert.equal(billEvent.estimated,true);
 // Unflagged bills keep their entered amount.
 s.bills.push({id:'r',label:'Rent',amount:900,date:'2026-10-12'});
 const m2=C.forecast(s,'2026-10-01');
 assert.equal(m2.timeline.find(e=>e.label==='Rent').amount,900);
});

test('merchant cleanup strips processor noise and trailing ids',()=>{
 assert.equal(C.merchantKey('SQ *BLUE BOTTLE #123'),'blue bottle');
 assert.equal(C.merchantKey('TST* Taco Truck'),'taco truck');
 assert.equal(C.merchantKey('SP *GITHUB  4021'),'github');
 assert.equal(C.merchantKey('Shell #42 - Fuel'),'shell 42 fuel');
 assert.equal(C.merchantKey('Motel 6'),'motel 6'); // single digits are kept
 assert.equal(C.merchantKey('  Coffee Shop '),'coffee shop');
 // Same merchant with different noise suggests the same memory entry.
 const s=C.blank();
 C.saveTransaction(s,{id:'a',label:'SQ *BLUE BOTTLE #123',type:'expense',amount:5,date:'2026-09-18',category:'Dining'});
 assert.equal(C.suggestMerchant(s,'Blue Bottle').category,'Dining');
});
