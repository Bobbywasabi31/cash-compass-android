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
