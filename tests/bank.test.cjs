/* Bank-app notification capture (roadmap #40): opt-in, allowlisted bank apps, same
   inbox and dedupe as Wallet. Bank alerts always need review and never insert
   automatically. Pure core.js logic — the Java allowlist is covered by CI compile. */
const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../app/src/main/assets/core.js');
const bank=(extra={})=>({id:'a'.repeat(64),revision:'b'.repeat(64),postedAt:Date.now(),kind:'bank',source:'com.chase.sig.android',title:'Chase Alert',text:'A transaction of $12.34 at Corner Market was made on your card ending in 1234.',...extra});
const setup=()=>{const s=C.blank();s.profile.balance=100;C.ensureAccounts(s);s.wallet.accountId='cash';return s;};

test('walletData accepts bank kind/source, defaults to wallet, rejects invalid kind',()=>{
 assert.equal(C.walletData({inbox:[bank()]}).inbox[0].kind,'bank');
 assert.equal(C.walletData({inbox:[bank()]}).inbox[0].source,'com.chase.sig.android');
 assert.equal(C.walletData({inbox:[{...bank(),kind:undefined,source:undefined}]}).inbox[0].kind,'wallet');
 assert.throws(()=>C.walletData({inbox:[bank({kind:'sms'})]}),/Invalid Wallet notification/);
});

test('parses Chase-style transaction alerts without copying card details',()=>{
 const p=C.parseWallet(bank());
 assert.equal(p.amount,12.34);
 assert.equal(p.label,'Corner Market');
 assert.equal(p.safe,false); // "transaction of" phrasing is not explicit purchase language
});
test('parses clear bank purchase formats',()=>{
 const p=C.parseWallet(bank({title:'Bank of America',text:'Purchase of $56.78 at Gas Station'}));
 assert.equal(p.amount,56.78);assert.equal(p.label,'Gas Station');assert.equal(p.safe,true);
});
test('bank balance notices need review and non-purchase notices are ignored',()=>{
 assert.equal(C.parseWallet(bank({title:'Chase',text:'Your account balance is $1,234.56'})).safe,false);
 assert.equal(C.parseWallet(bank({title:'Chase',text:'Fraud alert test mode: no transaction'})).safe,false); // kept for review, not silently ignored
 assert.equal(C.parseWallet(bank({title:'Chase',text:'Your statement is ready'})).ignore,true);
});

test('bank alerts never insert automatically, even in auto mode',()=>{
 const s=setup(),clear=bank({title:'Bank of America',text:'Purchase of $56.78 at Gas Station'});
 const r=C.receiveWallet(s,[clear]); // auto=true, granted=true, clear format
 assert.equal(r.added,0);assert.equal(r.reviewed,1);assert.equal(s.transactions.length,0);
 assert.match(s.wallet.inbox[0].reason,/Bank alert/);
});
test('reviewing a bank alert saves a bank-flagged transaction',()=>{
 const s=setup(),n=bank({title:'Bank of America',text:'Purchase of $56.78 at Gas Station'});
 C.receiveWallet(s,[n]);
 assert.equal(s.wallet.inbox.length,1);
 C.resolveWallet(s,n.id,{label:'Gas Station',amount:56.78,date:C.localDate(),type:'expense',accountId:'cash',category:'Food',adjust:true});
 assert.equal(s.transactions.length,1);assert.equal(s.transactions[0].bank,true);
 assert.equal(s.wallet.inbox.length,0);
});
test('wallet imports stay unflagged',()=>{
 const s=setup(),n={id:'c'.repeat(64),revision:'d'.repeat(64),postedAt:Date.now(),title:'Google Wallet',text:'You paid $12.34 at Corner Market'};
 assert.equal(C.receiveWallet(s,[n]).added,1);assert.equal(s.transactions[0].bank,false);
});
test('bank duplicates are acked, revisions become review',()=>{
 const s=setup(),n=bank();
 assert.equal(C.receiveWallet(s,[n]).reviewed,1);
 assert.equal(C.receiveWallet(s,[n]).reviewed,0); // duplicate revision acked
 const revised=bank({revision:'e'.repeat(64),text:'A transaction of $15.34 at Corner Market was made on your card ending in 1234.'});
 assert.equal(C.receiveWallet(s,[revised]).reviewed,1);assert.equal(s.wallet.inbox.length,1);
});
test('bank alerts participate in CSV reconciliation',()=>{
 const s=setup(),n=bank({title:'Bank of America',text:'Purchase of $56.78 at Gas Station'});
 C.receiveWallet(s,[n]);
 const row={transaction:{label:'Gas Station',amount:56.78,date:C.localDate(),type:'expense',accountId:'cash',category:'Other'}};
 const [match]=C.reconcileCSV(s,[row]);
 assert.equal(match.match.id,n.id);
 assert.equal(C.applyReconciliation(s,[match]).matched,1);
 assert.equal(s.transactions[0].bank,true);
});
test('transaction normalizer defaults bank to false',()=>{
 const t=C.transaction({id:'x',label:'Store',amount:1,date:C.localDate(),type:'expense',accountId:'cash'});
 assert.equal(t.bank,false);
 assert.equal(C.transaction({...t,bank:true}).bank,true);
});
