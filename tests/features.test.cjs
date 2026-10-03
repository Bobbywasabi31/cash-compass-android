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

test('forecast range derives worst/best from recorded income months',()=>{
 const s=C.blank();let n=0;const id=()=>'t'+(++n);
 const add=(date,amount)=>C.saveTransaction(s,{id:id(),label:'Job',type:'income',amount,date,category:'Paycheck',adjust:false});
 add('2026-04-15',1000);add('2026-05-15',2000);add('2026-06-15',3000);
 s.bills.push({id:'b',label:'Rent',amount:500,date:'2026-10-12'});
 const fr=C.forecastRange(s,'2026-10-01');
 assert.ok(fr.range);
 assert.equal(fr.range.variability.min,1000);
 assert.equal(fr.range.variability.max,3000);
 assert.equal(fr.range.variability.avg,2000);
 // Plan has no income events in the window: base ending cash is -500,
 // worst swaps in the worst recorded month (+1000), best the best (+3000).
 assert.equal(fr.range.worst,500);
 assert.equal(fr.range.best,2500);
 assert.equal(fr.range.expected,fr.endBalance);
 // Fewer than 2 months of income history: no range.
 const s2=C.blank();
 C.saveTransaction(s2,{id:'x',label:'Job',type:'income',amount:1000,date:'2026-06-15',category:'Paycheck',adjust:false});
 assert.equal(C.forecastRange(s2,'2026-10-01').range,null);
});

test('low-season runway converts cash and burn into months or indefinite',()=>{
 const s=C.blank();s.profile.balance=3000;
 let r=C.runway(s,1000,2000);
 assert.equal(r.cash,3000);
 assert.equal(r.burn,1000);
 assert.equal(r.months,3);
 assert.ok(Math.abs(r.weeks-13.035)<0.01);
 assert.equal(r.indefinite,false);
 r=C.runway(s,2500,2000);
 assert.equal(r.indefinite,true);
 assert.equal(r.months,null);
 // Reserves reduce the countable cash.
 s.goals.push({id:'g',label:'EF',target:10000,saved:1000,monthly:0,deadline:'',contributions:[]});
 r=C.runway(s,1000,2000);
 assert.equal(r.cash,2000);
 assert.equal(r.months,2);
 // Monthly averages feed the runway defaults.
 const s3=C.blank();let n=0;const id=()=>'t'+(++n);
 ['2026-07-05','2026-08-05','2026-09-05'].forEach(d=>{
   C.saveTransaction(s3,{id:id(),label:'Job',type:'income',amount:3000,date:d,category:'Paycheck',adjust:false});
   C.saveTransaction(s3,{id:id(),label:'Rent',type:'expense',amount:1200,date:d,category:'Housing',adjust:false});
 });
 assert.equal(C.avgMonthly(s3,'income','2026-10-01',3),3000);
 assert.equal(C.avgMonthly(s3,'expense','2026-10-01',3),1200);
});

test('tags and notes are normalized on transactions',()=>{
 const s=C.blank();
 C.saveTransaction(s,{id:'a',label:'Coffee',type:'expense',amount:5,date:'2026-09-18',category:'Dining',tags:['Work','work','client-meeting!',''],note:'  Team standup  '});
 const t=s.transactions[0];
 assert.deepEqual(t.tags,['client-meeting','work']);
 assert.equal(t.note,'Team standup');
 // Too many / too long tags are trimmed to 10 x 30 chars.
 C.saveTransaction(s,{id:'b',label:'X',type:'expense',amount:1,date:'2026-09-18',tags:Array.from({length:15},(_,i)=>'tag'+i+'-'.repeat(40))});
 assert.equal(s.transactions[1].tags.length,10);
 assert.ok(s.transactions[1].tags.every(x=>x.length<=30));
 // Survives a normalize round trip.
 const r=C.normalize(JSON.parse(JSON.stringify(s)));
 assert.deepEqual(r.transactions[0].tags,['client-meeting','work']);
 assert.equal(r.transactions[0].note,'Team standup');
});

test('saved filters validate and round-trip',()=>{
 const s=C.blank();
 s.savedFilters.push({id:'f1',name:'Big dining',filters:{query:'',type:'expense',account:'all',category:'Dining',tag:'all',min:20,max:'',start:'',end:''}});
 const r=C.normalize(JSON.parse(JSON.stringify(s)));
 assert.equal(r.savedFilters.length,1);
 assert.equal(r.savedFilters[0].name,'Big dining');
 assert.equal(r.savedFilters[0].filters.min,20);
 assert.equal(r.savedFilters[0].filters.category,'Dining');
 // Invalid filters are rejected; blank names are auto-named on import.
 const raw=JSON.parse(JSON.stringify(s));
 assert.equal(C.normalize({...raw,savedFilters:[{name:'',filters:{}}]}).savedFilters[0].name,'Filter 1');
 assert.throws(()=>C.normalize({...raw,savedFilters:'nope'}));
 assert.throws(()=>C.normalize({...raw,savedFilters:[{name:'x',filters:{start:'bad-date'}}]}));
});

test('split transaction divides across categories and preserves cash',()=>{
 const s=C.blank();
 C.saveAccount(s,{id:'checking',label:'Checking',type:'checking',balance:1000});
 C.saveTransaction(s,{id:'a',label:'Store',type:'expense',amount:100,date:'2026-09-18',category:'Groceries',accountId:'checking',tags:['weekly'],note:'big shop'});
 const before=s.accounts.find(a=>a.id==='checking').balance;
 const parts=C.splitTransaction(s,'a',[{category:'Groceries',amount:60},{category:'Household',amount:40}]);
 assert.equal(parts.length,2);
 assert.equal(parts[0].category,'Groceries');
 assert.equal(parts[1].category,'Household');
 assert.equal(parts[0].amount,60);
 // Original replaced; cash unchanged (100 was already deducted).
 assert.equal(s.transactions.length,2);
 assert.equal(s.accounts.find(a=>a.id==='checking').balance,before);
 // Tags and note stay on the first part.
 assert.deepEqual(parts[0].tags,['weekly']);
 assert.equal(parts[0].note,'big shop');
 assert.deepEqual(parts[1].tags,[]);
 // Parts must sum to the original.
 C.saveTransaction(s,{id:'b',label:'X',type:'expense',amount:10,date:'2026-09-18',accountId:'checking'});
 assert.throws(()=>C.splitTransaction(s,'b',[{category:'A',amount:6},{category:'B',amount:5}]));
 assert.throws(()=>C.splitTransaction(s,'b',[{category:'A',amount:10}]));
});

test('duplicate cleanup finds and merges double-records',()=>{
 const s=C.blank();
 C.saveAccount(s,{id:'checking',label:'Checking',type:'checking',balance:1000});
 const add=(id,label,amount,date,extra={})=>C.saveTransaction(s,{id,label,type:'expense',amount,date,category:'Dining',accountId:'checking',adjust:false,...extra});
 add('a','SQ *CAFE 1234',25,'2026-09-10',{tags:['lunch']});
 add('b','TST*CAFE',25,'2026-09-10',{note:'with sam'});
 add('c','Cafe',25,'2026-09-11'); // different day: not a duplicate
 add('d','Grocery',25,'2026-09-10');
 const dups=C.findDuplicates(s);
 assert.equal(dups.length,1);
 assert.equal(dups[0].length,2);
 const kept=C.mergeDuplicates(s,dups[0].map(t=>t.id));
 assert.equal(s.transactions.length,3);
 assert.deepEqual(kept.tags,['lunch']);
 assert.equal(kept.note,'with sam');
 assert.throws(()=>C.mergeDuplicates(s,['only-one']));
});

test('rules engine auto-categorizes and tags new transactions',()=>{
 const s=C.blank();
 C.saveAccount(s,{id:'checking',label:'Checking',type:'checking',balance:1000});
 s.rules.push(C.makeRule({match:'whole foods',category:'Groceries',tag:'organic'}));
 s.rules.push(C.makeRule({match:'foods',tag:'food'}));
 // New uncategorized transaction: first matching rule sets category, all matches add tags.
 C.saveTransaction(s,{id:'a',label:'WHOLE FOODS #123',type:'expense',amount:50,date:'2026-09-18',accountId:'checking'});
 const a=s.transactions.find(t=>t.id==='a');
 assert.equal(a.category,'Groceries');
 assert.deepEqual(a.tags,['food','organic']);
 // Explicit category is preserved; matching rules still add tags.
 C.saveTransaction(s,{id:'b',label:'Whole Foods',type:'expense',amount:20,date:'2026-09-18',category:'Dining',accountId:'checking'});
 const b=s.transactions.find(t=>t.id==='b');
 assert.equal(b.category,'Dining');
 assert.deepEqual(b.tags,['food','organic']);
 // Preview counts matches; apply-to-existing forces the rule's category.
 C.saveTransaction(s,{id:'c',label:'Whole Foods Market',type:'expense',amount:30,date:'2026-09-10',category:'Dining',accountId:'checking'});
 const rule=s.rules[0];
 assert.equal(C.previewRule(s,rule).length,3);
 assert.equal(C.applyRule(s,rule.id),3);
 assert.equal(s.transactions.find(t=>t.id==='c').category,'Groceries');
 // Validation and round trip.
 assert.throws(()=>C.makeRule({match:'',category:'X'}));
 assert.throws(()=>C.makeRule({match:'x'}));
 const s2=C.normalize(JSON.parse(JSON.stringify(s)));
 assert.equal(s2.rules.length,2);
 assert.equal(s2.rules[0].match,'whole foods');
});

test('refund linking nets against category in budgets and reports',()=>{
 const s=C.blank();
 C.saveAccount(s,{id:'checking',label:'Checking',type:'checking',balance:1000});
 C.saveTransaction(s,{id:'p',label:'Store',type:'expense',amount:100,date:'2026-10-05',category:'Clothing',accountId:'checking'});
 s.budgets.push(C.budget({id:'b',category:'Clothing',amount:200,bucket:'flexible',start:'2026-10'}));
 assert.equal(C.budgetSummary(s,'2026-10').rows[0].spent,100);
 C.saveTransaction(s,{id:'r',label:'Store refund',type:'income',amount:40,date:'2026-10-12',category:'Clothing',accountId:'checking',refundOf:'p'});
 assert.equal(C.budgetSummary(s,'2026-10').rows[0].spent,60);
 const flow=C.cashFlow(s,'2026-10-01','2026-10-31','all','category');
 assert.equal(flow.expenses.find(e=>e.label==='Clothing').amount,60);
 assert.equal(flow.income,0);
 assert.equal(flow.net,-60);
 // Refund must link an existing expense and be income.
 assert.throws(()=>C.saveTransaction(s,{id:'x',label:'X',type:'income',amount:5,date:'2026-10-12',accountId:'checking',refundOf:'nope'}));
 assert.throws(()=>C.saveTransaction(s,{id:'y',label:'Y',type:'expense',amount:5,date:'2026-10-12',accountId:'checking',refundOf:'p'}));
 // refundOf survives normalize (ids are rebuilt, links remapped).
 const s2=C.normalize(JSON.parse(JSON.stringify(s)));
 const r2=s2.transactions.find(t=>t.label==='Store refund');
 assert.equal(r2.refundOf,s2.transactions.find(t=>t.label==='Store').id);
 assert.equal(C.budgetSummary(s2,'2026-10').rows[0].spent,60);
});

test('emergency fund reports months covered of a target',()=>{
 const s=C.blank();
 s.profile.balance=9000;
 const f=C.emergencyFund(s,3000,3);
 assert.equal(f.cash,9000);
 assert.equal(f.target,9000);
 assert.equal(f.monthsCovered,3);
 assert.equal(f.funded,true);
 assert.equal(f.gap,0);
 const g=C.emergencyFund(s,3000,6);
 assert.equal(g.funded,false);
 assert.equal(g.gap,9000);
 assert.equal(g.monthsCovered,3);
 // Reserves reduce the spendable pool.
 s.goals.push({id:'g',label:'Trip',target:2000,saved:500,monthly:0,contributions:[]});
 const h=C.emergencyFund(s,3000,3);
 assert(h.cash<9000);
 assert.throws(()=>C.emergencyFund(s,100,0));
 assert.throws(()=>C.emergencyFund(s,100,61));
});

test('reimbursable tracking sums owed and logs paybacks',()=>{
 const s=C.blank();
 C.saveAccount(s,{id:'checking',label:'Checking',type:'checking',balance:1000});
 C.saveTransaction(s,{id:'a',label:'Flight',type:'expense',amount:400,date:'2026-09-18',category:'Travel',accountId:'checking',reimbursable:true});
 C.saveTransaction(s,{id:'b',label:'Hotel',type:'expense',amount:200,date:'2026-09-19',category:'Travel',accountId:'checking',reimbursable:true});
 C.saveTransaction(s,{id:'c',label:'Lunch',type:'expense',amount:20,date:'2026-09-19',category:'Dining',accountId:'checking'});
 let r=C.reimbursableSummary(s);
 assert.equal(r.count,2);
 assert.equal(r.total,600);
 assert.equal(r.owed,600);
 C.markReimbursed(s,'a',150);
 r=C.reimbursableSummary(s);
 assert.equal(r.reimbursed,150);
 assert.equal(r.owed,450);
 // Logging is capped at the expense amount.
 C.markReimbursed(s,'b',9999);
 assert.equal(s.transactions.find(t=>t.id==='b').reimbursed,200);
 assert.equal(C.reimbursableSummary(s).owed,250);
 // Income can't be reimbursable; unknown ids fail.
 assert.throws(()=>C.markReimbursed(s,'nope',10));
 C.saveTransaction(s,{id:'d',label:'Pay',type:'income',amount:50,date:'2026-09-20',accountId:'checking',reimbursable:true});
 assert.equal(s.transactions.find(t=>t.id==='d').reimbursable,false);
 // Round trip preserves flags.
 const s2=C.normalize(JSON.parse(JSON.stringify(s)));
 assert.equal(s2.transactions.find(t=>t.label==='Flight').reimbursed,150);
 assert.equal(C.reimbursableSummary(s2).owed,250);
});

test('CSV import auto-detects transfer pairs across accounts',()=>{
 const s=C.blank();
 C.saveAccount(s,{id:'checking',label:'Checking',type:'checking',balance:1000});
 C.saveAccount(s,{id:'savings',label:'Savings',type:'savings',balance:500});
 const csv='date,description,amount,account\n2026-09-10,Transfer to savings,-500,Checking\n2026-09-11,Transfer from checking,500,Savings\n2026-09-12,Coffee,-4.50,Checking';
 const out=C.previewCSV(s,csv,'checking',true);
 assert.equal(out.length,3);
 assert.equal(out.transferPairs.length,1);
 const p=out.transferPairs[0];
 assert.equal(p.amount,500);
 assert.equal(p.fromAccount,'checking');
 assert.equal(p.toAccount,'savings');
 assert(out[0].transferPair && out[1].transferPair);
 assert(!out[2].transferPair);
 // Same-account rows never pair; amounts must match to the cent.
 const csv2='date,description,amount,account\n2026-09-10,X,-500,Checking\n2026-09-11,Y,500,Checking\n2026-09-12,Z,-500.01,Savings';
 const out2=C.previewCSV(s,csv2,'checking',true);
 assert.equal(out2.transferPairs.length,0);
 // Importing the pair as a transfer moves money once, not twice.
 C.saveTransaction(s,{id:'t1',label:out[p.expense].transaction.label,type:'transfer',amount:p.amount,date:p.date,accountId:p.fromAccount,toAccountId:p.toAccount,adjust:true});
 assert.equal(s.accounts.find(a=>a.id==='checking').balance,500);
 assert.equal(s.accounts.find(a=>a.id==='savings').balance,1000);
 assert.equal(s.transactions.filter(t=>t.type==='transfer').length,1);
});

test('tax set-aside tracks untaxed income against a rate',()=>{
 const s=C.blank();
 C.saveAccount(s,{id:'checking',label:'Checking',type:'checking',balance:2000});
 s.profile.sideTaxRate=25;
 C.saveTransaction(s,{id:'a',label:'Client A',type:'income',amount:4000,date:'2026-03-10',category:'Freelance',accountId:'checking',untaxed:true,taxDelta:500});
 C.saveTransaction(s,{id:'b',label:'Salary',type:'income',amount:5000,date:'2026-03-15',category:'Paycheck',accountId:'checking'});
 C.saveTransaction(s,{id:'c',label:'Client B',type:'income',amount:2000,date:'2025-12-10',category:'Freelance',accountId:'checking',untaxed:true});
 const t=C.taxSetAside(s,'2026');
 assert.equal(t.income,4000);
 assert.equal(t.owed,1000);
 assert.equal(t.reserved,500);
 assert.equal(t.remaining,500);
 assert.equal(t.rate,25);
 assert(t.nextDeadline >= '2026-01-15');
 // untaxed flag only sticks to income and round-trips.
 assert.equal(s.transactions.find(t=>t.id==='a').untaxed,true);
 assert.equal(s.transactions.find(t=>t.id==='b').untaxed,false);
 const s2=C.normalize(JSON.parse(JSON.stringify(s)));
 assert.equal(s2.profile.sideTaxRate,25);
 assert.equal(C.taxSetAside(s2,'2026').owed,1000);
 assert.throws(()=>C.taxSetAside(s,'20'));
});

test('paycheck estimator derives gross, tax, and take-home',()=>{
 const e=C.paycheckEstimate(28,40,18);
 assert.equal(e.gross,1120);
 assert.equal(e.tax,201.6);
 assert.equal(e.takeHome,918.4);
 const f=C.paycheckEstimate(15,37.5,0);
 assert.equal(f.gross,562.5);
 assert.equal(f.takeHome,562.5);
 assert.throws(()=>C.paycheckEstimate(-5,40,10));
 assert.throws(()=>C.paycheckEstimate(20,40,101));
});

test('income smoothing reserves high months and draws lean months',()=>{
 const s=C.blank();
 C.saveAccount(s,{id:'checking',label:'Checking',type:'checking',balance:5000});
 const add=(id,amount,month)=>C.saveTransaction(s,{id,label:'Gig',type:'income',amount,date:month+'-15',category:'Freelance',accountId:'checking',adjust:false});
 add('a',5000,'2026-04');
 add('b',2000,'2026-05');
 add('c',3000,'2026-06');
 const r=C.incomeSmoothing(s,3000,12);
 assert.equal(r.count,3);
 assert.equal(r.targetMonthly,3000);
 // Apr: +2000 reserve; May: -1000 draw; Jun: even.
 assert.equal(r.totalReserve,2000);
 assert.equal(r.totalDraw,1000);
 assert.equal(r.balance,1000);
 assert.deepEqual(r.months.map(m=>m.month),['2026-04','2026-05','2026-06']);
 assert.throws(()=>C.incomeSmoothing(s,0));
});

test('budget alerts flag 80% and 100% spend',()=>{
 const s=C.blank();
 C.saveAccount(s,{id:'checking',label:'Checking',type:'checking',balance:5000});
 s.budgets.push(C.budget({id:'b1',category:'Groceries',bucket:'flexible',amount:400,start:'2026-01',rollover:false}));
 s.budgets.push(C.budget({id:'b2',category:'Dining',bucket:'flexible',amount:100,start:'2026-01',rollover:false}));
 C.saveTransaction(s,{id:'t1',label:'Store',type:'expense',amount:340,date:'2026-10-01',category:'Groceries',accountId:'checking',adjust:true});
 C.saveTransaction(s,{id:'t2',label:'Cafe',type:'expense',amount:120,date:'2026-10-02',category:'Dining',accountId:'checking',adjust:true});
 const a=C.budgetAlerts(s,'2026-10');
 assert.equal(a.length,2);
 const g=a.find(x=>x.category==='Groceries');
 assert.equal(g.level,'warn');
 assert.equal(Math.round(g.pct*100),85);
 const d=a.find(x=>x.category==='Dining');
 assert.equal(d.level,'over');
 assert.equal(Math.round(d.pct*100),120);
 assert.deepEqual(C.budgetAlerts(s,'2026-09'),[]);
});

test('pay-period budgets slice monthly and roll unspent forward',()=>{
 const s=C.blank();
 C.saveAccount(s,{id:'checking',label:'Checking',type:'checking',balance:5000});
 s.budgets.push(C.budget({id:'b1',category:'Groceries',bucket:'flexible',amount:400,start:'2026-01',rollover:true}));
 s.budgets.push(C.budget({id:'b2',category:'Dining',bucket:'flexible',amount:100,start:'2026-01',rollover:false}));
 // A Monday: 2026-10-05. Spend in the prior week (Sep 28 - Oct 4).
 C.saveTransaction(s,{id:'t1',label:'Store',type:'expense',amount:30,date:'2026-09-30',category:'Groceries',accountId:'checking',adjust:true});
 C.saveTransaction(s,{id:'t2',label:'Store',type:'expense',amount:40,date:'2026-10-06',category:'Groceries',accountId:'checking',adjust:true});
 const p=C.payPeriod('2026-10-07','weekly');
 assert.equal(p.start,'2026-10-05');
 assert.equal(p.end,'2026-10-11');
 const r=C.payPeriodBudget(s,'weekly','2026-10-07');
 assert.equal(r.period.start,'2026-10-05');
 const g=r.rows.find(x=>x.category==='Groceries');
 // 400/mo -> 400*12/52 = 92.31 per week
 assert.equal(g.periodBudget,92.31);
 assert.equal(g.spent,40);
 // rollover allowed: 92.31 - 30 = 62.31 from prior week
 assert.equal(g.rollover,62.31);
 assert.equal(g.remaining,114.62);
 const d=r.rows.find(x=>x.category==='Dining');
 assert.equal(d.rollover,0);
 assert.throws(()=>C.payPeriod('2026-10-07','monthly'));
 assert.throws(()=>C.payPeriod('nope','weekly'));
 // bi-weekly anchors to Mon 2020-01-06
 const bw=C.payPeriod('2026-10-07','biweekly');
 assert.equal(bw.start,'2026-10-05');
 assert.equal(bw.end,'2026-10-18');
});

test('income streams group by source with hours, rate, and monthly equivalents',()=>{
 const s=C.blank();
 const today=C.localDate(), ym=today.slice(0,7);
 const mk=(label,amount,date,hours,hourlyRate)=>({id:'i-'+label,label,amount,date,repeat:'monthly',category:'Income',accountId:'cash',anchorDay:Number(date.slice(8)),hours,hourlyRate});
 s.incomes.push(mk('Day job',3000,ym+'-15',160,25), mk('Gig work',800,ym+'-20',20,40));
 const r=C.incomeStreams(s,12);
 assert.equal(r.rows.length,2);
 const job=r.rows.find(x=>x.label==='Day job');
 assert.equal(job.hours,160);
 assert.equal(job.hourlyRate,25);
 assert.equal(job.paydays,12);
 assert.equal(job.amount,36000);
 assert.equal(job.monthly,3000);
 const gig=r.rows.find(x=>x.label==='Gig work');
 assert.equal(gig.monthly,800);
 assert.equal(r.combined,45600);
 assert.equal(r.monthly,3800);
 assert.equal(C.incomeStreams(C.blank(),12).rows.length,0);
});

test('bill reminder settings normalize with safe defaults',()=>{
 const norm=bills=>{const s=C.blank();s.bills=bills;return C.normalize(s).bills;};
 const withOpts=norm([{label:'Rent',amount:1200,date:'2026-10-01',repeat:'monthly',category:'Housing',reminder:false,reminderDays:7}])[0];
 assert.equal(withOpts.reminder,false);
 assert.equal(withOpts.reminderDays,7);
 const def=norm([{label:'Power',amount:90,date:'2026-10-01',repeat:'monthly',category:'Utilities'}])[0];
 assert.equal(def.reminder,true);
 assert.equal(def.reminderDays,3);
 assert.throws(()=>norm([{label:'X',amount:10,date:'2026-10-01',repeat:'none',category:'Other',reminderDays:999}]));
 assert.throws(()=>norm([{label:'X',amount:10,date:'2026-10-01',repeat:'none',category:'Other',reminderDays:-1}]));
});

test('paycheck estimate includes overtime at 1.5x and holiday at 2x',()=>{
 const est=C.paycheckEstimate(20,40,25,10,8);
 assert.equal(est.regularPay,800);
 assert.equal(est.overtimePay,300);
 assert.equal(est.holidayPay,320);
 assert.equal(est.gross,1420);
 assert.equal(est.tax,355);
 assert.equal(est.takeHome,1065);
 const plain=C.paycheckEstimate(20,40,25);
 assert.equal(plain.overtimePay,0);
 assert.equal(plain.holidayPay,0);
 assert.equal(plain.gross,800);
 assert.throws(()=>C.paycheckEstimate(20,-1,25));
});

test('gig income stats show range and consistency score',()=>{
 const s=C.blank();
 const add=(month,amount)=>{s.transactions.push({id:'g'+month+amount,label:'Gig',amount,date:month+'-15',type:'income',category:'Income',accountId:'cash'});};
 add('2026-08',800);add('2026-09',1400);
 const stats=C.gigIncomeStats(s,12);
 assert.equal(stats.min,800);assert.equal(stats.max,1400);assert.equal(stats.months,2);
 assert.ok(stats.consistency>=0&&stats.consistency<=100);
 assert.equal(C.gigIncomeStats(C.blank(),12),null);
 const steady=C.blank();
 ['2026-01','2026-02'].forEach(m=>steady.transactions.push({id:'s'+m,label:'Job',amount:2000,date:m+'-15',type:'income',category:'Income',accountId:'cash'}));
 assert.equal(C.gigIncomeStats(steady,12).consistency,100);
});

test('top merchants rank by spend with period filter',()=>{
 const s=C.blank();
 const add=(label,amount,month)=>{s.transactions.push({id:'m'+label+month,label,amount,date:month+'-15',type:'expense',category:'Food',accountId:'cash'});};
 add('Chipotle',50,'2026-09');add('CHIPOTLE #123',30,'2026-09');add('Shell',80,'2026-08');add('Old store',200,'2025-01');
 const r=C.topMerchants(s,12,10);
 assert.equal(r.length,2);
 assert.equal(r[0].label,'Chipotle');
 assert.equal(r[0].total,80);
 assert.equal(r[0].count,2);
 assert.equal(r[1].label,'Shell');
 assert.equal(r[1].total,80);
 assert.equal(C.topMerchants(s,2,10).length,1);
 assert.equal(C.topMerchants(C.blank(),12,10).length,0);
});

test('savings rate computes per-month and overall percentages',()=>{
 const s=C.blank();
 const add=(type,amount,month)=>{s.transactions.push({id:'s'+type+month+amount,label:'X',amount,date:month+'-15',type,category:'X',accountId:'cash'});};
 add('income',2000,'2026-08');add('expense',1500,'2026-08');
 add('income',2000,'2026-09');add('expense',2200,'2026-09');
 const r=C.savingsRate(s,12);
 const aug=r.rows.find(x=>x.month==='2026-08'), sep=r.rows.find(x=>x.month==='2026-09');
 assert.equal(aug.rate,25);
 assert.equal(sep.rate,-10);
 assert.equal(aug.saved,500);
 assert.equal(sep.saved,-200);
 assert.equal(r.totalIncome,4000);
 assert.equal(r.totalSaved,300);
 assert.equal(r.overall,7.5);
 assert.equal(C.savingsRate(C.blank(),12).overall,null);
});

test('spending trends track per-category monthly totals',()=>{
 const s=C.blank();
 const add=(cat,amount,month)=>{s.transactions.push({id:'t'+cat+month+amount,label:cat,amount,date:month+'-15',type:'expense',category:cat,accountId:'cash'});};
 add('Food',100,'2026-08');add('Food',150,'2026-09');add('Transport',50,'2026-09');
 const t=C.spendingTrends(s,3);
 assert.equal(t.length,3);
 const aug=t.find(x=>x.month==='2026-08'), sep=t.find(x=>x.month==='2026-09');
 assert.equal(aug.categories.Food,100);
 assert.equal(sep.categories.Food,150);
 assert.equal(sep.categories.Transport,50);
 assert.equal(C.spendingTrends(C.blank(),3).every(x=>Object.keys(x.categories).length===0),true);
});

test('month-over-month ranks category changes',()=>{
 const s=C.blank();
 const add=(cat,amount,month)=>{s.transactions.push({id:'m'+cat+month,label:cat,amount,date:month+'-15',type:'expense',category:cat,accountId:'cash'});};
 add('Food',100,'2026-09');add('Food',200,'2026-10');add('Transport',80,'2026-09');add('Transport',80,'2026-10');
 const m=C.monthOverMonth(s);
 assert.equal(m.cur,'2026-10');
 assert.equal(m.prev,'2026-09');
 const food=m.rows.find(r=>r.category==='Food');
 assert.equal(food.change,100);
 assert.equal(food.pct,100);
 const transport=m.rows.find(r=>r.category==='Transport');
 assert.equal(transport.change,0);
 assert.equal(C.monthOverMonth(C.blank()).rows.length,0);
});

test('insights generate proactive cards from data',()=>{
 const s=C.blank();
 s.transactions.push({id:'t1',label:'Food',amount:100,date:'2026-09-15',type:'expense',category:'Food',accountId:'cash'});
 s.transactions.push({id:'t2',label:'Food',amount:200,date:'2026-10-15',type:'expense',category:'Food',accountId:'cash'});
 s.budgets.push({id:'b1',category:'Food',amount:150,bucket:'spending',start:'2026-01',rollover:false});
 s.bills.push({id:'bill1',label:'Rent',amount:1000,date:'2026-10-05',repeat:'monthly',category:'Housing',accountId:'cash',anchorDay:5});
 const cards=C.insights(s,'2026-10-02');
 const kinds=cards.map(c=>c.kind);
 assert.ok(kinds.includes('spike'));
 assert.ok(kinds.includes('budget'));
 assert.ok(kinds.includes('bills'));
 assert.ok(cards.length<=8);
 assert.equal(C.insights(C.blank()).length,0);
});

test('monthly review summarizes changes structurally',()=>{
 const s=C.blank();
 s.transactions.push({id:'t1',label:'Food',amount:100,date:'2026-09-15',type:'expense',category:'Food',accountId:'cash'});
 s.transactions.push({id:'t2',label:'Food',amount:200,date:'2026-10-15',type:'expense',category:'Food',accountId:'cash'});
 const r=C.monthlyReview(s,'2026-10-02');
 assert.equal(r.month,'2026-10');
 assert.equal(r.rose.count,1);
 assert.equal(r.rose.total,100);
 assert.equal(r.rose.top.category,'Food');
 assert.equal(r.bills.count,0);
});



test('CSV reconcile matches by amount, date window, and fuzzy merchant',()=>{
 const s=C.blank();
 // Notification from 3 days ago
 const threeDaysAgo=new Date(Date.now()-3*86400000).toISOString().slice(0,10);
 const notif=C.walletData({inbox:[{id:'a'.repeat(64),revision:'b'.repeat(64),postedAt:Date.now()-3*86400000,title:'Purchase',text:'You paid $50.00 at Chipotle with your Visa card',reason:''}]}).inbox[0];
 s.wallet.inbox.push(notif);
 const csv=`date,description,amount\n${threeDaysAgo},Chipotle #123,-50.00\n${threeDaysAgo},Shell,-30.00`;
 const preview=C.previewCSV(s,csv,'cash',false);
 const rec=C.reconcileCSV(s,preview);
 assert.equal(rec.filter(x=>x.match).length,1);
 assert.equal(rec.filter(x=>!x.match).length,1);
 assert.equal(rec[0].match.id,notif.id);
 // Wrong amount does not match
 const preview2=C.previewCSV(s,`date,description,amount\n${threeDaysAgo},Chipotle,-99.00`,'cash',false);
 assert.equal(C.reconcileCSV(s,preview2)[0].match,null);
 // Date outside ±3 days does not match (10 days ago)
 const tenDaysAgo=new Date(Date.now()-10*86400000).toISOString().slice(0,10);
 const preview3=C.previewCSV(s,`date,description,amount\n${tenDaysAgo},Chipotle,-50.00`,'cash',false);
 assert.equal(C.reconcileCSV(s,preview3)[0].match,null);
});

test('applyReconciliation merges matches and routes misses to inbox',()=>{
 const s=C.blank();
 const threeDaysAgo=new Date(Date.now()-3*86400000).toISOString().slice(0,10);
 const notif=C.walletData({inbox:[{id:'c'.repeat(64),revision:'d'.repeat(64),postedAt:Date.now()-3*86400000,title:'Purchase',text:'You paid $50.00 at Chipotle',reason:''}]}).inbox[0];
 s.wallet.inbox.push(notif);
 const csv=`date,description,amount,category\n${threeDaysAgo},Chipotle #123,-50.00,Food\n${threeDaysAgo},Shell,-30.00,Transport`;
 const preview=C.previewCSV(s,csv,'cash',false);
 const rec=C.reconcileCSV(s,preview);
 const res=C.applyReconciliation(s,rec);
 assert.equal(res.matched,1);
 assert.equal(res.missed,1);
 assert.equal(s.transactions.length,1);
 assert.equal(s.transactions[0].label,'Chipotle #123');
 assert.equal(s.transactions[0].walletId,notif.id);
 assert.equal(s.wallet.inbox.length,1);
 assert.equal(s.wallet.inbox[0].reason,'Missed by notifications — from CSV import.');
 assert.equal(s.wallet.inbox[0].title,'Shell');
});

test('moveBudget reallocates between categories with history',()=>{
 const s=C.blank();
 s.budgets.push({id:'b1',category:'Food',amount:500,bucket:'spending',start:'2026-01',rollover:false});
 s.budgets.push({id:'b2',category:'Transport',amount:300,bucket:'spending',start:'2026-01',rollover:false});
 C.moveBudget(s,'Food','Transport',100);
 assert.equal(s.budgets.find(b=>b.category==='Food').amount,400);
 assert.equal(s.budgets.find(b=>b.category==='Transport').amount,400);
 assert.equal(s.budgetMoves.length,1);
 assert.equal(s.budgetMoves[0].from,'Food');
 assert.equal(s.budgetMoves[0].to,'Transport');
 assert.equal(s.budgetMoves[0].amount,100);
 assert.throws(()=>C.moveBudget(s,'Food','Transport',1000));
 assert.throws(()=>C.moveBudget(s,'Food','Food',10));
 assert.throws(()=>C.moveBudget(s,'Food','Nonexistent',10));
});

test('budgetMoves normalize with validation',()=>{
 const s=C.blank();
 s.budgetMoves.push({date:'2026-10-01',from:'Food',to:'Transport',amount:50});
 const n=C.normalize(s);
 assert.equal(n.budgetMoves.length,1);
 assert.equal(n.budgetMoves[0].amount,50);
 assert.throws(()=>{const b=C.blank();b.budgetMoves.push({date:'bad',from:'A',to:'B',amount:10});C.normalize(b);});
});

test('debtPayoff compares snowball vs avalanche',()=>{
 const r=C.debtPayoff([
   {name:'Card A',balance:2000,rate:19.99,minPayment:75},
   {name:'Card B',balance:5000,rate:24.99,minPayment:150}
 ],500);
 assert.ok(r.snowball.months>0);
 assert.ok(r.avalanche.months>0);
 assert.ok(r.avalanche.totalInterest<r.snowball.totalInterest);
 assert.equal(r.totalDebt,7000);
 assert.ok(r.snowball.payoffDate>r.avalanche.payoffDate||r.snowball.months>=r.avalanche.months);
 assert.throws(()=>C.debtPayoff([],'500'));
 assert.throws(()=>C.debtPayoff([{name:'A',balance:1000,rate:10,minPayment:200}],100));
});

test('sinkingFunds calculates monthly set-aside',()=>{
 const s=C.blank();
 const future=new Date(Date.now()+180*86400000).toISOString().slice(0,10);
 s.sinkingFunds.push({id:'s1',label:'Insurance',target:1200,saved:200,dueDate:future});
 const funds=C.sinkingFunds(s);
 assert.equal(funds.length,1);
 assert.ok(funds[0].monthlyNeeded>0);
 assert.ok(funds[0].monthsLeft>0);
 assert.equal(funds[0].remaining,1000);
 assert.ok(funds[0].progress>0&&funds[0].progress<100);
 const n=C.normalize(s);
 assert.equal(n.sinkingFunds.length,1);
 assert.equal(n.debts.length,0);
});

test('goalPaycheckAmount calculates per-paycheck needed',()=>{
 const goal={label:'Vacation',target:1200,saved:200,deadline:'2027-10-01',monthly:50};
 const r=C.goalPaycheckAmount(goal,'monthly');
 assert.ok(r.perPaycheck>0);
 assert.ok(r.paychecks>0);
 assert.equal(r.onTrack,false);
 const done={label:'Done',target:1000,saved:1000,deadline:'2027-10-01',monthly:0};
 assert.equal(C.goalPaycheckAmount(done,'monthly').perPaycheck,0);
});

test('milestoneProgress tracks net worth targets',()=>{
 const s=C.blank();
 s.profile.balance=50000;
 s.milestones.push({id:'m1',label:'$100k',target:100000});
 const m=C.milestoneProgress(s,s.milestones[0]);
 assert.equal(m.worth,50000);
 assert.equal(m.progress,50);
 assert.equal(m.reached,false);
 const n=C.normalize(s);
 assert.equal(n.milestones.length,1);
});

test('loanAmortization calculates schedule and extra payment effect',()=>{
 const r=C.loanAmortization(10000,6,200,50);
 assert.ok(r.base.months>0);
 assert.ok(r.base.totalInterest>0);
 assert.ok(r.withExtra.months<r.base.months);
 assert.ok(r.interestSaved>0);
 assert.ok(r.monthsSaved>0);
 assert.ok(r.base.schedule.length>0);
 const noExtra=C.loanAmortization(10000,6,200,0);
 assert.equal(noExtra.withExtra,null);
 assert.equal(noExtra.interestSaved,0);
 assert.throws(()=>C.loanAmortization(10000,6,10,0));
});

test('holdingGains calculates unrealized gain/loss',()=>{
 const h={quantity:10,price:150,cost:100};
 const g=C.holdingGains(h);
 assert.equal(g.basis,1000);
 assert.equal(g.value,1500);
 assert.equal(g.gain,500);
 assert.equal(g.gainPct,50);
 const loss=C.holdingGains({quantity:10,price:80,cost:100});
 assert.equal(loss.gain,-200);
 assert.equal(loss.gainPct,-20);
});

test('holding supports cost basis lots',()=>{
 const h=C.holding({id:'h1',label:'Test',symbol:'TST',assetClass:'stock',quantity:10,price:150,cost:100,lots:[{date:'2026-01-15',quantity:5,cost:90},{date:'2026-06-15',quantity:5,cost:110}]});
 assert.equal(h.lots.length,2);
 assert.equal(h.lots[0].cost,90);
 const s=C.blank();
 s.holdings.push(h);
 const n=C.normalize(s);
 assert.equal(n.holdings[0].lots.length,2);
});

test('dividendStats tracks log and projects monthly',()=>{
 const s=C.blank();
 s.dividends.push({id:'d1',symbol:'VTI',amount:100,date:'2026-09-15'});
 s.dividends.push({id:'d2',symbol:'VTI',amount:100,date:'2026-06-15'});
 const st=C.dividendStats(s);
 assert.equal(st.total,200);
 assert.equal(st.dividends.length,2);
 assert.ok(st.projectedMonthly>0);
 assert.equal(st.calendar.length,2);
 const n=C.normalize(s);
 assert.equal(n.dividends.length,2);
});

test('dripProjection compounds with contributions',()=>{
 const s=C.blank();
 s.holdings.push({id:'h1',label:'Test',symbol:'TST',assetClass:'stock',quantity:10,price:100,cost:90,lots:[],updated:'2026-10-01'});
 const r=C.dripProjection(s,2,7,10,100);
 assert.equal(r.current,1000);
 assert.ok(r.projected>1000);
 assert.equal(r.schedule.length,11);
 assert.equal(r.totalContributions,12000);
 const noContrib=C.dripProjection(s,0,0,5,0);
 assert.equal(noContrib.projected,1000);
});

test('contributionStats totals contributions',()=>{
 const s=C.blank();
 s.contributions.push({id:'c1',label:'401k',amount:500,date:'2026-09-01'});
 s.contributions.push({id:'c2',label:'401k',amount:500,date:'2026-10-01'});
 const st=C.contributionStats(s);
 assert.equal(st.total,1000);
 assert.equal(st.contributions.length,2);
 assert.equal(st.byMonth.length,2);
});

test('manualNetWorth includes assets and liabilities',()=>{
 const s=C.blank();
 s.manualAssets.push({id:'a1',label:'Car',value:15000,kind:'asset'});
 s.manualAssets.push({id:'a2',label:'Mortgage',value:200000,kind:'liability'});
 const m=C.manualNetWorth(s);
 assert.equal(m.assetTotal,15000);
 assert.equal(m.liabilityTotal,200000);
 assert.equal(m.net,-185000);
 // Net worth includes manual
 s.profile.balance=50000;
 assert.equal(C.netWorth(s),-135000);
 const n=C.normalize(s);
 assert.equal(n.manualAssets.length,2);
 assert.equal(n.contributions.length,0);
});

test('yearInReview summarizes annual activity',()=>{
 const s=C.blank();
 s.transactions.push({id:'t1',label:'Job',amount:50000,date:'2026-03-15',type:'income',category:'Income',accountId:'cash'});
 s.transactions.push({id:'t2',label:'Food',amount:12000,date:'2026-05-15',type:'expense',category:'Food',accountId:'cash'});
 s.transactions.push({id:'t3',label:'Rent',amount:18000,date:'2026-07-15',type:'expense',category:'Housing',accountId:'cash'});
 const y=C.yearInReview(s,'2026');
 assert.equal(y.income,50000);
 assert.equal(y.expense,30000);
 assert.equal(y.saved,20000);
 assert.equal(y.savingsRate,40);
 assert.equal(y.topCategories[0].category,'Housing');
 assert.throws(()=>C.yearInReview(s,'bad'));
});

test('seasonalView splits good and lean months',()=>{
 const s=C.blank();
 s.transactions.push({id:'t1',label:'Job',amount:5000,date:'2026-08-15',type:'income',category:'Income',accountId:'cash'});
 s.transactions.push({id:'t2',label:'Food',amount:1000,date:'2026-08-15',type:'expense',category:'Food',accountId:'cash'});
 s.transactions.push({id:'t3',label:'Job',amount:2000,date:'2026-09-15',type:'income',category:'Income',accountId:'cash'});
 s.transactions.push({id:'t4',label:'Food',amount:3000,date:'2026-09-15',type:'expense',category:'Food',accountId:'cash'});
 const v=C.seasonalView(s,12);
 assert.ok(v.good.length>0);
 assert.ok(v.lean.length>0);
 assert.ok(v.good[0].net>=v.lean[0].net);
});

test('spendHeatmap calculates daily intensity',()=>{
 const s=C.blank();
 s.transactions.push({id:'t1',label:'Food',amount:100,date:'2026-09-15',type:'expense',category:'Food',accountId:'cash'});
 s.transactions.push({id:'t2',label:'Food',amount:50,date:'2026-09-15',type:'expense',category:'Food',accountId:'cash'});
 const h=C.spendHeatmap(s,'2026-09');
 assert.equal(h.days['2026-09-15'],150);
 assert.equal(h.intensity['2026-09-15'],100);
 assert.throws(()=>C.spendHeatmap(s,'bad'));
});

test('dailyBalanceForecast projects balances',()=>{
 const s=C.blank();
 s.profile.balance=1000;
 s.transactions.push({id:'t1',label:'Food',amount:100,date:'2026-09-15',type:'expense',category:'Food',accountId:'cash'});
 s.bills.push({id:'b1',label:'Rent',amount:500,date:'2026-09-20',repeat:'none',category:'Housing',accountId:'cash',anchorDay:20});
 const f=C.dailyBalanceForecast(s,'2026-09');
 assert.ok(f.days['2026-09-01']!==undefined);
 assert.ok(f.days['2026-09-15']<f.days['2026-09-14']);
 assert.ok(f.days['2026-09-20']<f.days['2026-09-19']);
});

test('anomalies detect large charges and duplicates',()=>{
 const s=C.blank();
 // Normal food transactions
 for(let i=0;i<5;i++) s.transactions.push({id:'f'+i,label:'Food',amount:50,date:'2026-09-0'+(i+1),type:'expense',category:'Food',accountId:'cash'});
 // Anomalously large
 s.transactions.push({id:'big',label:'Fancy dinner',amount:500,date:'2026-09-15',type:'expense',category:'Food',accountId:'cash'});
 const a=C.anomalies(s);
 assert.equal(a.large.length,1);
 assert.equal(a.large[0].id,'big');
 assert.ok(a.large[0].reason.includes('x category average'));
 // Duplicates
 s.transactions.push({id:'dup1',label:'Coffee',amount:5,date:'2026-09-16',type:'expense',category:'Food',accountId:'cash'});
 s.transactions.push({id:'dup2',label:'Coffee',amount:5,date:'2026-09-16',type:'expense',category:'Food',accountId:'cash'});
 const a2=C.anomalies(s);
 assert.ok(a2.duplicates.length>0);
});

test('parseQuickEntry parses amount and label',()=>{
 const p=C.parseQuickEntry('12.50 chipotle');
 assert.equal(p.amount,12.50);
 assert.equal(p.label,'chipotle');
 assert.equal(p.type,'expense');
 assert.equal(p.category,'Food');
 const p2=C.parseQuickEntry('chipotle 12.50');
 assert.equal(p2.amount,12.50);
 assert.equal(p2.label,'chipotle');
 const p3=C.parseQuickEntry('5000 paycheck');
 assert.equal(p3.type,'income');
 assert.equal(p3.amount,5000);
 assert.throws(()=>C.parseQuickEntry(''));
 assert.throws(()=>C.parseQuickEntry('no amount here'));
});

test('explainNumber provides calculation steps',()=>{
 const s=C.blank();
 s.profile.balance=2000;
 s.incomes.push({id:'i1',label:'Job',amount:3000,date:'2026-10-15',repeat:'monthly',category:'Income',accountId:'cash'});
 s.bills.push({id:'b1',label:'Rent',amount:1000,date:'2026-10-10',repeat:'monthly',category:'Housing',accountId:'cash',anchorDay:10});
 const e=C.explainNumber(s,'safe');
 assert.equal(e.title,'Safe to spend');
 assert.ok(e.steps.length>0);
 assert.ok(e.steps.some(s=>s.includes('Cash')));
 const r=C.explainNumber(s,'runway');
 assert.equal(r.title,'Runway');
 assert.ok(r.steps.length>0);
 assert.equal(C.explainNumber(s,'unknown'),null);
});

test('suggestCategory suggests based on history',()=>{
 const s=C.blank();
 s.transactions.push({id:'t1',label:'Chipotle Mexican Grill',amount:15,date:'2026-09-01',type:'expense',category:'Food',accountId:'cash'});
 s.transactions.push({id:'t2',label:'Chipotle',amount:12,date:'2026-09-15',type:'expense',category:'Food',accountId:'cash'});
 const sug=C.suggestCategory(s,'chipotle burrito');
 assert.ok(sug);
 assert.equal(sug.category,'Food');
 assert.ok(sug.confidence>0);
 assert.equal(C.suggestCategory(s,'xyzunknown'),null);
 assert.equal(C.suggestCategory(s,''),null);
});

test('reportCSV generates valid CSV',()=>{
 const s=C.blank();
 s.transactions.push({id:'t1',label:'Food',amount:100,date:'2026-09-15',type:'expense',category:'Food',accountId:'cash'});
 const csv=C.reportCSV(s,'2026-09');
 assert.ok(csv.includes('Category,Amount'));
 assert.ok(csv.includes('Food'));
 assert.ok(csv.includes('Total expenses'));
});

test('shareSummary generates text summary',()=>{
 const s=C.blank();
 s.profile.balance=1000;
 const text=C.shareSummary(s);
 assert.ok(text.includes('Cash Compass summary'));
 assert.ok(text.includes('Safe to spend'));
 assert.ok(text.includes('Net worth'));
});

test('fullExport includes all data',()=>{
 const s=C.blank();
 s.transactions.push({id:'t1',label:'Test',amount:100,date:'2026-09-15',type:'expense',category:'Food',accountId:'cash'});
 const json=C.fullExport(s);
 const data=JSON.parse(json);
 assert.ok(data.transactions);
 assert.equal(data.transactions.length,1);
 assert.ok(data.profile);
 assert.ok(data.exported);
});

test('addAnnotation validates and sorts',()=>{
 const s=C.blank();
 const anns=C.addAnnotation(s,'Got new job','2026-09-15');
 assert.equal(anns.length,1);
 assert.equal(anns[0].label,'Got new job');
 const anns2=C.addAnnotation({...s,annotations:anns},'Bought house','2026-08-01');
 assert.equal(anns2[0].label,'Bought house'); // sorted by date
 assert.throws(()=>C.addAnnotation(s,'','2026-09-15'));
 assert.throws(()=>C.addAnnotation(s,'Test','bad-date'));
});

test('saveCustomCategory validates and saves',()=>{
 const s=C.blank();
 const cats=C.saveCustomCategory(s,'Pet Care','Pets','#ff0000');
 assert.equal(cats.length,1);
 assert.equal(cats[0].name,'Pet Care');
 assert.equal(cats[0].group,'Pets');
 // Update existing
 const cats2=C.saveCustomCategory({...s,customCategories:cats},'pet care','Animals','#00ff00');
 assert.equal(cats2.length,1);
 assert.equal(cats2[0].group,'Animals');
 assert.throws(()=>C.saveCustomCategory(s,'','Group'));
});

test('detectPaychecks finds recurring deposits',()=>{
 const s=C.blank();
 // 4 monthly deposits
 ['2026-06-15','2026-07-15','2026-08-15','2026-09-15'].forEach((d,i)=>{
   s.transactions.push({id:'p'+i,label:'ACME Corp Payroll',amount:3000,date:d,type:'income',category:'Income',accountId:'cash'});
 });
 const detected=C.detectPaychecks(s);
 assert.equal(detected.length,1);
 assert.equal(detected[0].repeat,'monthly');
 assert.equal(detected[0].amount,3000);
 // Too few deposits
 const s2=C.blank();
 s2.transactions.push({id:'p1',label:'Pay',amount:1000,date:'2026-09-15',type:'income',category:'Income',accountId:'cash'});
 assert.equal(C.detectPaychecks(s2).length,0);
});

test('saveCreditCard validates and saves',()=>{
 const s=C.blank();
 const cards=C.saveCreditCard(s,{label:'Chase Sapphire',last4:'1234',statementDay:5,dueDay:20,balance:1500,minimumDue:50,apr:19.99});
 assert.equal(cards.length,1);
 assert.equal(cards[0].label,'Chase Sapphire');
 assert.equal(cards[0].last4,'1234');
 assert.throws(()=>C.saveCreditCard(s,{label:'',balance:100}));
});

test('creditCardStatus calculates dates',()=>{
 const s=C.blank();
 const cards=C.saveCreditCard(s,{label:'Test',statementDay:1,dueDay:15,balance:1000,minimumDue:25,apr:20});
 const status=C.creditCardStatus(s,cards[0],'2026-09-10');
 assert.ok(status.statementDate);
 assert.ok(status.dueDate);
 assert.ok(status.daysUntilDue!==undefined);
});

test('planCardPayment suggests strategy',()=>{
 const s=C.blank();
 s.profile.balance=5000;
 s.creditCards=C.saveCreditCard(s,{label:'Test',statementDay:1,dueDay:15,balance:1000,minimumDue:25,apr:20});
 const plan=C.planCardPayment(s,s.creditCards[0].id,500);
 assert.equal(plan.amount,1000); // pay in full
 assert.ok(plan.strategy.includes('in full'));
 // Low balance
 s.profile.balance=100;
 const plan2=C.planCardPayment(s,s.creditCards[0].id,0);
 assert.ok(plan2.amount<1000);
});
