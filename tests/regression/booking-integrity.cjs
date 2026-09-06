const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require(process.env.VAKAYGO_TYPESCRIPT_PATH || 'typescript');
const root = path.resolve(__dirname, '../..');
const results = [];
const noops = new Proxy({}, {get:()=>async()=>{}});
const schema = new Proxy({}, {get:(_,table)=>new Proxy({__table:table},{get:(o,key)=>key==='__table'?table:{table,key}})});
function load(rel, mocks={}) {
  const src=fs.readFileSync(path.join(root,rel),'utf8');
  const js=ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const loadedModule={exports:{}};
  const base={
    'next/server':{NextResponse:{json:(body,opts={})=>new Response(JSON.stringify(body),{status:opts.status||200,headers:{'content-type':'application/json'}})}},
    '@/lib/logger':{logger:noops}, '@/drizzle/schema':schema,
    '@/server/stripe':{},
    '@/server/business-onboarding':{getListingBookingEligibility:async()=>({eligible:true,reason:null,operatorId:'operator',stripeAccountId:'acct_eligible'})},
    '@/server/email':noops, '@/server/email-requests':noops,
    '@/server/notifications':{createNotification:async()=>{}},
    '@/server/loyalty':{awardBookingPoints:async()=>{}},
    '@/lib/abandoned-bookings':{EXPIRE_AFTER_HOURS:48},
    '@neondatabase/serverless':{neon:()=>({})},
    'drizzle-orm':{eq:(a,b)=>({op:'eq',a,b}),ne:(a,b)=>({op:'ne',a,b}),isNull:a=>({op:'null',a}),and:(...args)=>({op:'and',args}),or:(...args)=>({op:'or',args}),sql:(parts,...args)=>({op:'sql',text:parts.join('?'),args})},
    'next/headers':{cookies:async()=>({get:()=>({value:'synthetic-session'}),delete:()=>{}})},
    jose:{jwtVerify:async()=>({payload:{id:'traveler',role:'traveler'}})},
  };
  const requireMock=(id)=>{
    if(id in mocks) return mocks[id];
    if(id in base) return base[id];
    if(id.startsWith('@/lib/') || id.startsWith('@/server/')) return load(id.slice(2)+'.ts',mocks);
    if(id.startsWith('./')) return load(path.join(path.dirname(rel),id+'.ts'),mocks);
    throw new Error('Unmocked import: '+id);
  };
  vm.runInNewContext('(function(require,module,exports){'+js+'\n})',
    {Request,Response,Headers,URL,URLSearchParams,TextEncoder,Date,console,fetch:mocks.__fetch,process:{env:{GOOGLE_CLIENT_ID:'synthetic',GOOGLE_CLIENT_SECRET:'synthetic',CRON_SECRET:'synthetic',STRIPE_WEBHOOK_SECRET:'synthetic',AUTH_SECRET:'synthetic',DATABASE_URL:'synthetic',...mocks.__env}}},
    {filename:rel})(requireMock,loadedModule,loadedModule.exports);
  return loadedModule.exports;
}
function matches(cond,row){
  if(!cond)return true;
  if(cond.op==='and')return cond.args.every(c=>matches(c,row));
  if(cond.op==='or')return cond.args.some(c=>matches(c,row));
  if(cond.op==='sql'&&cond.text.includes("not in ('failed', 'canceled')"))return !['failed','canceled'].includes(row[cond.args[0].key]);
  if(cond.op==='sql'&&cond.text.includes("<> 'succeeded'"))return row[cond.args[0].key]!=='succeeded';
  if(cond.op==='eq')return row[cond.a.key]===cond.b;
  if(cond.op==='null')return row[cond.a.key]==null;
  if(cond.op==='ne')return row[cond.a.key]!==cond.b;
  return true;
}
function dbFor(rows,beforeUpdate=()=>{}){
  const writes=[];
  const selects=[];
  function project(row,cols){if(!cols)return {...row};return Object.fromEntries(Object.entries(cols).map(([key,col])=>[key,row[col.key]??row[key]]));}
  return {writes,selects,_rows:rows,
    select(cols){let table,cond;const q={from(t){table=t.__table;selects.push(table);return q;},innerJoin(){return q;},where(c){cond=c;return q;},limit(){return Promise.resolve((rows[table]||[]).filter(r=>matches(cond,r)).map(r=>project(r,cols)));},then(resolve,reject){return q.limit().then(resolve,reject);}};return q;},
    update(t){let values;const q={set(v){values=v;return q;},where(cond){beforeUpdate(t.__table,values,cond);const changed=(rows[t.__table]||[]).filter(r=>matches(cond,r));changed.forEach(r=>{for(const [key,value] of Object.entries(values)){r[key]=value?.op==='sql'&&value.text.includes('+ 1')?(r[key]||0)+1:value;}});writes.push({table:t.__table,values,cond,count:changed.length});return Object.assign(Promise.resolve(),{returning:async(cols)=>changed.map(r=>project(r,cols))});}};return q;},
    insert(t){return {values(values){let conflict,applied=false,result;const apply=()=>{if(applied)return result;applied=true;const existing=conflict&&(rows[t.__table]||[]).find(r=>r[conflict.key]===values[conflict.key]);if(existing)return result=[];const record={id:t.__table==='bookings'?'booking-new':t.__table+'-'+(rows[t.__table]||[]).length,refundStatus:null,refundId:null,attempts:0,...values};(rows[t.__table]??=[]).push(record);writes.push({table:t.__table,values});return result=[record];};const q={onConflictDoNothing({target}){conflict=target;return q;},returning:async(cols)=>apply().map(r=>project(r,cols)),then(resolve,reject){try{return Promise.resolve(apply()).then(resolve,reject);}catch(e){return Promise.reject(e).then(resolve,reject);}}};return q;}}},
  };
}
function mocksFor(db,extra={}){
  const stripe=extra['@/server/stripe'];
  if(stripe?.refundBooking){const refund=stripe.refundBooking;extra={...extra,'@/server/stripe':{...stripe,refundBooking:async p=>({payment_intent:p.paymentIntentId,amount:p.amount||7150,currency:(db._rows.rejectedPaymentRefunds||[]).find(r=>r.paymentId===p.paymentIntentId)?.currency.toLowerCase()||'usd',metadata:{vakaygoRefundKey:p.idempotencyKey},...await refund(p)})}};}
  if(extra['@/server/stripe'])extra={...extra,'@/server/stripe':{verifyStripePlatformIdentity:async()=>({accountId:'acct_platform',environment:'test'}),...extra['@/server/stripe']}};
  return {'drizzle-orm/neon-http':{drizzle:()=>db},...extra};
}
function request(body,method='POST',sig=false){return new Request('https://audit.invalid/endpoint',{method,headers:{'content-type':'application/json',...(sig?{'stripe-signature':'synthetic'}:{})},body:JSON.stringify(body)});}
async function check(name,fn){const details=await fn();results.push({name,passed:true,...details});}

const bookingId="11111111-1111-4111-8111-111111111111",listingId="22222222-2222-4222-8222-222222222222";
const pending=()=>({id:bookingId,status:"pending",bookingNumber:"VG-TEST",travelerId:"traveler",operatorId:"operator",listingId,startDate:new Date("2099-12-01"),guestCount:1,totalAmount:"71.50",currency:"USD",checkoutSessionId:"cs_test",checkoutStripeAccountId:"acct_eligible",paymentMode:"destination",datesAvailable:true,paidAt:null,paymentId:null,cancellationRequestedAt:null,createdAt:new Date()});
const complete=(extra={})=>({id:"evt_same",type:"checkout.session.completed",data:{object:{id:"cs_test",payment_intent:"pi_test",amount_total:7150,currency:"usd",payment_status:"paid",metadata:{bookingId},...extra}}});
(async()=>{
 await check("Duplicate payment changes the booking once",async()=>{
   const rows={bookings:[pending()]}; const db=dbFor(rows);let refunds=0;
   const h=load("app/api/payments/webhook/route.ts",mocksFor(db,{"@/server/stripe":{constructWebhookEvent:()=>complete(),refundBooking:async()=>{refunds++;return {id:"re_1",status:"succeeded"};}}}));
   for(let i=0;i<2;i++)assert.equal((await h.POST(request({},"POST",true))).status,200);
   assert.equal(db.writes.filter(w=>w.count>0).length,1);assert.equal(rows.bookings[0].status,"confirmed");assert.equal(refunds,0);
 });
 for(const state of ["cancelled","refunded","completed"]) await check("Payment cannot reopen "+state,async()=>{
   const rows={bookings:[{...pending(),status:state,paymentId:state==="cancelled"?null:"pi_test",paidAt:state==="cancelled"?null:new Date()}]};const db=dbFor(rows);let refunds=0;
   const h=load("app/api/payments/webhook/route.ts",mocksFor(db,{"@/server/stripe":{constructWebhookEvent:()=>complete(),refundBooking:async()=>{refunds++;return {id:"re_1",status:"succeeded"};}}}));
   assert.equal((await h.POST(request({},"POST",true))).status,200);assert.equal(rows.bookings[0].status,state);assert.equal(refunds,state==="cancelled"?1:0);
 });
 for(const override of [{amount_total:100},{currency:"eur"},{id:"cs_other"}]) await check("Mismatched paid checkout is refunded: "+JSON.stringify(override),async()=>{
   const rows={bookings:[pending()]};const db=dbFor(rows);let refunds=0;
   const h=load("app/api/payments/webhook/route.ts",mocksFor(db,{"@/server/stripe":{constructWebhookEvent:()=>complete(override),refundBooking:async()=>{refunds++;return {id:"re_1",status:"succeeded"};}}}));
   assert.equal((await h.POST(request({},"POST",true))).status,200);assert.equal(rows.bookings[0].status,"pending");assert.equal(refunds,1);
 });
 await check("Late failure leaves a paid booking confirmed",async()=>{
   const rows={bookings:[{...pending(),status:"confirmed",paidAt:new Date(),paymentId:"pi_good"}]};const db=dbFor(rows);
   const h=load("app/api/payments/webhook/route.ts",mocksFor(db,{"@/server/stripe":{constructWebhookEvent:()=>({type:"payment_intent.payment_failed",data:{object:{id:"pi_old",metadata:{bookingId}}}})}}));
   assert.equal((await h.POST(request({},"POST",true))).status,200);assert.equal(rows.bookings[0].status,"confirmed");assert.equal(db.writes.length,0);
 });
 await check("Invalid webhook signatures cannot mutate bookings",async()=>{
   const db=dbFor({bookings:[pending()]});const h=load("app/api/payments/webhook/route.ts",mocksFor(db,{"@/server/stripe":{constructWebhookEvent:()=>{throw Error("signature");}}}));
   assert.equal((await h.POST(request({},"POST",true))).status,400);assert.equal(db.writes.length,0);
 });
 await check("PATCH cancellation refunds instead of bypassing the payment service",async()=>{
   const rows={bookings:[{...pending(),status:"confirmed",paidAt:new Date(),paymentId:"pi_good",cancellationPolicySnapshot:"moderate"}],listings:[{id:listingId,policy:"strict",timezone:"America/Grenada"}]};const db=dbFor(rows);let refunds=0;
   const h=load("app/api/bookings/[bookingId]/route.ts",mocksFor(db,{"@/server/stripe":{refundBooking:async p=>{refunds++;assert.equal(p.amount,7150);return {id:"re_1",status:"succeeded"};}}}));
   const r=await h.PATCH(request({status:"cancelled"},"PATCH"),{params:Promise.resolve({bookingId})});
   assert.equal(r.status,200);assert.equal(rows.bookings[0].status,"refunded");assert.equal(refunds,1);
 });
 await check("Refund retries reuse the persisted amount",async()=>{
   const rows={bookings:[{...pending(),status:"confirmed",paidAt:new Date(),paymentId:"pi_good",cancellationPolicySnapshot:"flexible"}],listings:[{id:listingId,timezone:"America/Grenada"}]};const db=dbFor(rows);const amounts=[];
   const service=load("server/cancel-booking.ts",mocksFor(db,{"@/server/stripe":{refundBooking:async p=>{amounts.push(p.amount);if(amounts.length===1)throw Error("transient");return {id:"re_1",status:"succeeded"};}}}));
   await assert.rejects(service.cancelBooking(bookingId,{id:"traveler",role:"traveler"}));
   rows.bookings[0].startDate=new Date("2000-01-01");
   await service.cancelBooking(bookingId,{id:"traveler",role:"traveler"});
   assert.deepEqual(amounts,[7150,7150]);
 });
 await check("Unrelated travelers cannot cancel another booking",async()=>{
   const db=dbFor({bookings:[pending()]});const service=load("server/cancel-booking.ts",mocksFor(db,{"@/server/stripe":{}}));
   assert.equal((await service.cancelBooking(bookingId,{id:"stranger",role:"traveler"})).httpStatus,403);assert.equal(db.writes.length,0);
 });
 await check("Priced legacy requests can be confirmed without a fabricated payment",async()=>{
   const rows={bookings:[{...pending(),status:"requested",checkoutSessionId:null}]};const db=dbFor(rows);
   const h=load("app/api/bookings/[bookingId]/route.ts",mocksFor(db,{jose:{jwtVerify:async()=>({payload:{id:"operator",role:"operator"}})}}));
   assert.equal((await h.PATCH(request({status:"confirmed"},"PATCH"),{params:Promise.resolve({bookingId})})).status,200);
   assert.equal(rows.bookings[0].totalAmount,"0.00");assert.equal(rows.bookings[0].paymentMethod,"none");
 });
 const listing={id:listingId,operatorId:"operator",status:"active",timezone:"America/Grenada",priceAmount:"65.00",priceCurrency:"USD",priceUnit:"person",type:"tour",title:"Synthetic",typeData:{},advanceNotice:0,maxGuests:12,operatorEmail:"operator@example.invalid"};
 for(const invalid of [{guestCount:0},{guestCount:-1},{guestCount:1.5},{guestCount:"2"},{startDate:"2020-01-01"},{startDate:"2099-02-30"},{paymentType:"deposit"},{giftCardCode:"TEST"},{includeInsurance:true},{endDate:"2099-11-30"}]) await check("Reject invalid or unsupported booking: "+JSON.stringify(invalid),async()=>{
   const rows={listings:[listing],users:[],bookings:[]};const db=dbFor(rows);const h=load("app/api/bookings/route.ts",mocksFor(db));
   const r=await h.POST(request({listingId,startDate:"2099-12-01",guestCount:1,...invalid}));assert.equal(r.status,400);assert.equal(rows.bookings.length,0);
 });
 for(const change of [{status:"paused"},{operatorId:"197d8586-7fd3-4999-91de-a50ad7d70e23"}]) await check("Reject unavailable inventory: "+JSON.stringify(change),async()=>{
   const db=dbFor({listings:[{...listing,...change}],bookings:[]});const h=load("app/api/bookings/route.ts",mocksFor(db));
   assert.equal((await h.POST(request({listingId,startDate:"2099-12-01",guestCount:1}))).status,409);
 });
 await check("Cancellation boundaries and displayed definitions agree",async()=>{
   const m=load("lib/cancellation.ts");for(const [key,rule] of Object.entries(m.CANCELLATION_POLICIES)){
     if(rule.fullHours!==null){assert.equal(m.calculateRefundPercent(key,rule.fullHours+0.01),100);assert.notEqual(m.calculateRefundPercent(key,rule.fullHours),100);}
     if(rule.halfHours!==null){assert.equal(m.calculateRefundPercent(key,rule.halfHours+0.01),50);assert.equal(m.calculateRefundPercent(key,rule.halfHours),0);}
   }assert.equal(m.calculateRefundPercent("moderate",NaN),0);
 });
 await check("Public operators route does not match the operator-only namespace",async()=>{
   const {isRouteWithin}=load("lib/route-access.ts");assert.equal(isRouteWithin("/api/operators/123","/api/operator"),false);assert.equal(isRouteWithin("/api/operator/bookings","/api/operator"),true);
 });
 for(const profile of [{verified_email:true,totpEnabled:true},{verified_email:false,totpEnabled:false}])await check("Google login rejects missing trust step: "+JSON.stringify(profile),async()=>{
   const db=dbFor({users:[{id:"u2",email:"totp@example.invalid",role:"traveler",emailVerified:true,sessionVersion:0,totpEnabled:profile.totpEnabled}],accounts:[]});let sessions=0;
   const h=load("app/api/auth/google/callback/route.ts",mocksFor(db,{
     "@/server/admin-auth":{setSessionCookie:async()=>{sessions++;}},
     "@/server/email-identity":{establishEmailIdentity:async()=>{throw Error("Unexpected bootstrap after trust rejection");}},
     "next/server":{NextResponse:{redirect:url=>new Response(null,{status:302,headers:{location:String(url)}})}},
     __fetch:async url=>new Response(JSON.stringify(String(url).includes("/token")?{access_token:"synthetic"}:{email:"totp@example.invalid",id:"g2",verified_email:profile.verified_email})),
   }));
   const r=await h.GET(new Request("https://audit.invalid/api/auth/google/callback?code=synthetic&state=synthetic-session"));assert.equal(r.status,302);assert.equal(sessions,0);assert.equal(db.writes.length,0);
 });

 await check("Unclaimed listings cannot create even an unpaid request",async()=>{
   const rows={listings:[{...listing,typeData:{unclaimed:true}}],bookings:[],users:[]};const db=dbFor(rows);
   const h=load("app/api/bookings/route.ts",mocksFor(db,{"@/server/business-onboarding":{getListingBookingEligibility:async()=>({eligible:false,reason:"claim_required"})}}));const r=await h.POST(request({listingId,startDate:"2099-12-01",guestCount:1}));
   assert.equal(r.status,409);assert.equal(rows.bookings.length,0);assert.equal(db.writes.length,0);
 });
 await check("Repeated checkout calls reuse the saved Stripe session",async()=>{
   const db=dbFor({bookings:[pending()]});let created=0;
   const h=load("app/api/payments/create-checkout/route.ts",mocksFor(db,{"@/server/stripe":{retrieveCheckoutSession:async()=>({status:"open",url:"https://checkout.stripe.com/test",metadata:{bookingId}}),createCheckoutSession:async()=>{created++;}}}));
   for(let i=0;i<2;i++)assert.equal((await h.POST(request({bookingId}))).status,200);
   assert.equal(created,0);
 });

 for (const [configured,expectedOrigin] of [
   ["https://preview.vakaygo.example/staging?ignored=yes#fragment","https://preview.vakaygo.example"],
   [undefined,"https://vakaygo.com"],
   ["not a URL","https://vakaygo.com"],
   ["http://untrusted.example","https://vakaygo.com"],
   ["https://user:password@untrusted.example","https://vakaygo.com"],
 ]) await check("Checkout returns to trusted deployment origin: "+String(configured),async()=>{
   const rows={bookings:[{...pending(),checkoutSessionId:null,subtotal:"65.00",serviceFee:"6.50"}],listings:[listing],users:[{id:"traveler",email:"traveler@example.invalid"},{id:"operator",email:"operator@example.invalid",digipayMerchantId:null}]};
   const db=dbFor(rows);let checkout;
   const h=load("app/api/payments/create-checkout/route.ts",mocksFor(db,{
     __env:{NEXT_PUBLIC_APP_URL:configured},
     "@/server/stripe":{createCheckoutSession:async params=>{checkout=params;return {id:"cs_created",status:"open",url:"https://checkout.stripe.com/test",expires_at:Math.floor(Date.now()/1000)+86400};}}
   }));
   const r=await h.POST(request({bookingId}));assert.equal(r.status,200);
   assert.equal(checkout.successUrl,expectedOrigin+"/bookings?paid=VG-TEST");
   assert.equal(checkout.cancelUrl,expectedOrigin+"/bookings?cancelled=VG-TEST");
   assert.equal(rows.bookings[0].checkoutSessionId,"cs_created");
 });

 await check("Cancellation racing a successful payment recomputes its refund",async()=>{
   const rows={bookings:[pending()],listings:[{id:listingId,timezone:"America/Grenada",policy:"moderate"}]};let racing=true,refunded=0;
   const db=dbFor(rows,(_table,values)=>{if(racing&&values.cancellationRequestedAt){racing=false;Object.assign(rows.bookings[0],{status:"confirmed",paidAt:new Date(),paymentId:"pi_race"});}});
   const service=load("server/cancel-booking.ts",mocksFor(db,{"@/server/stripe":{refundBooking:async p=>{refunded=p.amount;return {id:"re_race",status:"succeeded"};}}}));
   await service.cancelBooking(bookingId,{id:"traveler",role:"traveler"});
   assert.equal(refunded,7150);assert.equal(rows.bookings[0].status,"refunded");
 });
 for(const status of ["completed","no_show"])await check("Ordinary cancellation cannot reopen ended booking: "+status,async()=>{
   const rows={bookings:[{...pending(),status}],listings:[]};const db=dbFor(rows);
   const service=load("server/cancel-booking.ts",mocksFor(db));
   assert.equal((await service.cancelBooking(bookingId,{id:"traveler",role:"traveler"})).httpStatus,409);
   assert.equal(db.writes.length,0);
 });
 await check("A pending refund is refreshed without creating another refund",async()=>{
   const rows={bookings:[{...pending(),status:"confirmed",paymentId:"pi_paid",paidAt:new Date()}],listings:[{id:listingId,timezone:"America/Grenada",policy:"moderate"}]};
   const db=dbFor(rows);let created=0,retrieved=0;
   const service=load("server/cancel-booking.ts",mocksFor(db,{"@/server/stripe":{
     refundBooking:async()=>{created++;return {id:"re_pending",status:"pending"};},
     retrieveBookingRefund:async()=>{retrieved++;return {id:"re_pending",status:"succeeded"};}
   }}));
   await service.cancelBooking(bookingId,{id:"traveler",role:"traveler"});
   assert.equal(rows.bookings[0].refundStatus,"pending");
   await service.cancelBooking(bookingId,{id:"traveler",role:"traveler"});
   assert.equal(rows.bookings[0].status,"refunded");assert.equal(rows.bookings[0].refundStatus,"succeeded");
   assert.equal(created,1);assert.equal(retrieved,1);
 });
 await check("The refund worker retries persisted intents and reports failures",async()=>{
   let attempts=0;
   const h=load("app/api/cron/booking-refunds/route.ts",{
     "@neondatabase/serverless":{neon:()=>async(parts)=>parts.join("").includes("SELECT id, traveler_id")?[{id:"a",traveler_id:"t"},{id:"b",traveler_id:"t"}]:[]},
     "@/server/payment-refunds":{retryRejectedPaymentRefund:async()=>{throw Error("No rejected payments expected");}},
     "@/server/cancel-booking":{cancelBooking:async()=>{attempts++;if(attempts===1)throw Error("temporary");return {success:true};}}
   });
   const unauthorized=await h.GET(new Request("https://audit.invalid/api/cron/booking-refunds"));assert.equal(unauthorized.status,401);assert.equal(attempts,0);
   const r=await h.GET(new Request("https://audit.invalid/api/cron/booking-refunds",{headers:{authorization:"Bearer synthetic"}}));
   const data=await r.json();assert.equal(data.processed,1);assert.equal(data.failed,1);assert.equal(attempts,2);
 });

 const extraIntent=()=>({id:"extra_1",bookingId,checkoutSessionId:"cs_extra",paymentId:"pi_extra",amountCents:7150,currency:"USD",refundId:"re_extra",refundStatus:"pending",attempts:1});
 const providerRefund=(overrides={})=>({id:"re_extra",payment_intent:"pi_extra",amount:7150,currency:"usd",status:"succeeded",metadata:{vakaygoRefundKey:"rejected_checkout_cs_extra"},...overrides});
 await check("A duplicate paid checkout gets its own durable refund without replacing the canonical charge",async()=>{
   const canonical={...pending(),status:"confirmed",paymentId:"pi_original",paidAt:new Date(),refundId:null,refundStatus:null};
   const rows={bookings:[canonical],rejectedPaymentRefunds:[]};const db=dbFor(rows);let created=0,retrieved=0;
   const h=load("app/api/payments/webhook/route.ts",mocksFor(db,{"@/server/stripe":{
     constructWebhookEvent:()=>complete({id:"cs_extra",payment_intent:"pi_extra"}),
     refundBooking:async()=>{created++;return {id:"re_extra",status:"pending"};},
     retrieveBookingRefund:async()=>{retrieved++;return providerRefund({status:"pending"});}
   }}));
   for(let i=0;i<2;i++)assert.equal((await h.POST(request({},"POST",true))).status,200);
   assert.equal(rows.rejectedPaymentRefunds.length,1);assert.equal(rows.rejectedPaymentRefunds[0].refundStatus,"pending");
   assert.equal(created,1);assert.equal(retrieved,1);assert.equal(canonical.paymentId,"pi_original");assert.equal(canonical.refundId,null);assert.equal(canonical.status,"confirmed");
 });
 await check("An interrupted rejected-payment refund remains durable and retries the same provider key",async()=>{
   const rows={bookings:[{...pending(),status:"cancelled"}],rejectedPaymentRefunds:[]};const db=dbFor(rows);const keys=[];let providerCreated=0;
   const mock=mocksFor(db,{"@/server/stripe":{
     constructWebhookEvent:()=>complete({id:"cs_extra",payment_intent:"pi_extra"}),
     refundBooking:async p=>{keys.push(p.idempotencyKey);if(keys.length===1){providerCreated++;throw Error("Connection lost after Stripe accepted refund");}return {id:"re_recovered",status:"succeeded"};}
   }});
   const h=load("app/api/payments/webhook/route.ts",mock);
   assert.equal((await h.POST(request({},"POST",true))).status,500);
   assert.equal(rows.rejectedPaymentRefunds.length,1);assert.equal(rows.rejectedPaymentRefunds[0].refundId,null);
   assert.match(rows.rejectedPaymentRefunds[0].lastError,/retry scheduled/);
   const service=load("server/payment-refunds.ts",mock);
   await service.retryRejectedPaymentRefund(rows.rejectedPaymentRefunds[0].id);
   assert.deepEqual(keys,["rejected_checkout_cs_extra","rejected_checkout_cs_extra"]);
   assert.equal(providerCreated,1);assert.equal(rows.rejectedPaymentRefunds[0].refundId,"re_recovered");assert.equal(rows.rejectedPaymentRefunds[0].refundStatus,"succeeded");
   assert.equal(rows.bookings[0].paymentId,null);assert.equal(rows.bookings[0].status,"cancelled");
 });
 await check("Refund events finish a pending rejected-payment refund without changing its booking",async()=>{
   const rows={bookings:[{...pending(),status:"confirmed",paymentId:"pi_original",paidAt:new Date()}],rejectedPaymentRefunds:[extraIntent()]};const db=dbFor(rows);
   const h=load("app/api/payments/webhook/route.ts",mocksFor(db,{"@/server/stripe":{
     constructWebhookEvent:()=>({type:"refund.updated",data:{object:{id:"re_extra",status:"pending"}}}),
     retrieveBookingRefund:async()=>providerRefund()
   }}));
   assert.equal((await h.POST(request({},"POST",true))).status,200);
   assert.equal(rows.rejectedPaymentRefunds[0].refundStatus,"succeeded");assert.equal(rows.bookings[0].paymentId,"pi_original");assert.equal(rows.bookings[0].status,"confirmed");
 });
 await check("A rejected refund that later fails is persisted and surfaced even after an older success event",async()=>{
   const rows={bookings:[pending()],rejectedPaymentRefunds:[{...extraIntent(),refundStatus:"succeeded"}]};const db=dbFor(rows);let alerts=0;
   const h=load("app/api/payments/webhook/route.ts",mocksFor(db,{"@/lib/logger":{logger:{warn:()=>{},error:()=>{alerts++;}}},"@/server/stripe":{
     constructWebhookEvent:()=>({type:"refund.updated",data:{object:{id:"re_extra",status:"succeeded"}}}),
     retrieveBookingRefund:async()=>providerRefund({status:"failed",failure_reason:"expired_or_canceled_card"})
   }}));
   assert.equal((await h.POST(request({},"POST",true))).status,200);
   assert.equal(rows.rejectedPaymentRefunds[0].refundStatus,"failed");assert.match(rows.rejectedPaymentRefunds[0].lastError,/expired_or_canceled_card/);assert.equal(alerts,1);
 });
 await check("A full cancellation refund can change from succeeded to failed without leaving a refunded booking",async()=>{
   const rows={bookings:[{...pending(),status:"confirmed",paidAt:new Date(),paymentId:"pi_extra"}],listings:[{id:listingId,timezone:"America/Grenada",policy:"moderate"}],rejectedPaymentRefunds:[]};const db=dbFor(rows);
   const mock=mocksFor(db,{"@/server/stripe":{
     refundBooking:async()=>({id:"re_extra",status:"succeeded"}),
     constructWebhookEvent:()=>({type:"refund.failed",data:{object:{id:"re_extra"}}}),
     retrieveBookingRefund:async()=>providerRefund({status:"failed",metadata:{vakaygoRefundKey:"refund_"+bookingId}})
   }});
   await load("server/cancel-booking.ts",mock).cancelBooking(bookingId,{id:"traveler",role:"traveler"});
   assert.equal(rows.bookings[0].status,"refunded");
   const h=load("app/api/payments/webhook/route.ts",mock);
   assert.equal((await h.POST(request({},"POST",true))).status,200);
   assert.equal(rows.bookings[0].status,"cancelled");assert.equal(rows.bookings[0].refundStatus,"failed");assert.equal(rows.bookings[0].paymentId,"pi_extra");
 });
 await check("An unrelated manual refund cannot overwrite the tracked rejected-payment refund",async()=>{
   const rows={bookings:[],rejectedPaymentRefunds:[extraIntent()]};const db=dbFor(rows);
   await load("server/payment-refunds.ts",mocksFor(db,{"@/server/stripe":{retrieveBookingRefund:async()=>providerRefund({id:"re_manual",metadata:{}})}})).reconcileProviderRefund("re_manual");
   assert.equal(rows.rejectedPaymentRefunds[0].refundId,"re_extra");assert.equal(db.writes.length,0);
 });
 await check("A refund event with a wrong amount cannot rewrite a canonical cancellation",async()=>{
   const rows={bookings:[{...pending(),status:"cancelled",paymentId:"pi_extra",paidAt:new Date(),cancellationRequestedAt:new Date(),cancellationRefundCents:7150,refundId:"re_extra",refundStatus:"pending"}],rejectedPaymentRefunds:[]};const db=dbFor(rows);
   await assert.rejects(load("server/payment-refunds.ts",mocksFor(db,{"@/server/stripe":{retrieveBookingRefund:async()=>providerRefund({amount:100,metadata:{vakaygoRefundKey:"refund_"+bookingId}})}})).reconcileProviderRefund("re_extra"),/identity mismatch/);
   assert.equal(rows.bookings[0].refundStatus,"pending");assert.equal(db.writes.length,0);
 });
 await check("A delayed cancellation response cannot overwrite a concurrent refund failure event",async()=>{
   const rows={bookings:[{...pending(),status:"cancelled",paymentId:"pi_extra",paidAt:new Date(),cancellationRequestedAt:new Date(),cancellationRefundCents:7150,refundId:"re_extra",refundStatus:"pending"}],listings:[{id:listingId,timezone:"America/Grenada",policy:"moderate"}]};let race=true;
   const db=dbFor(rows,(_table,values)=>{if(race&&values.refundStatus==="succeeded"){race=false;rows.bookings[0].refundStatus="failed";}});
   const result=await load("server/cancel-booking.ts",mocksFor(db,{"@/server/stripe":{retrieveBookingRefund:async()=>providerRefund()}})).cancelBooking(bookingId,{id:"traveler",role:"traveler"});
   assert.equal(result.httpStatus,502);assert.equal(rows.bookings[0].refundStatus,"failed");assert.equal(rows.bookings[0].status,"cancelled");
 });
 await check("A delayed provider response cannot downgrade a failed rejected refund back to pending",async()=>{
   const rows={bookings:[],rejectedPaymentRefunds:[{...extraIntent(),refundStatus:"failed"}]};const db=dbFor(rows);
   await load("server/payment-refunds.ts",mocksFor(db,{"@/server/stripe":{retrieveBookingRefund:async()=>providerRefund({status:"pending"})}})).reconcileProviderRefund("re_extra");
   assert.equal(rows.rejectedPaymentRefunds[0].refundStatus,"failed");
 });
 await check("The refund worker retries rejected payments and exposes terminal review counts",async()=>{
   let calls=0;
   const h=load("app/api/cron/booking-refunds/route.ts",{
     "@/server/cancel-booking":{cancelBooking:async()=>{throw Error("No ordinary cancellations expected");}},
     "@/server/payment-refunds":{retryRejectedPaymentRefund:async()=>({status:++calls===1?"pending":"failed"})},
     "@neondatabase/serverless":{neon:()=>async(parts)=>{const q=parts.join("");return q.includes("SELECT id, traveler_id")?[]:q.includes("SELECT id FROM rejected")?[{id:"a"},{id:"b"}]:[{count:2}];}}
   });
   const r=await h.GET(new Request("https://audit.invalid/api/cron/booking-refunds",{headers:{authorization:"Bearer synthetic"}}));
   const data=await r.json();assert.equal(data.processed,0);assert.equal(data.rejectedProcessed,1);assert.equal(data.failed,1);assert.equal(data.needsReview,2);
 });
 await check("Queued refund completion email becomes stale after an asynchronous failure",async()=>{
   let emails=0,acknowledged=0;
   const h=load("app/api/cron/booking-mail/route.ts",{
     __env:{RESEND_API_KEY:"synthetic"},
     resend:{Resend:class{emails={send:async()=>{emails++;return {};}};}},
     "@neondatabase/serverless":{neon:()=>async(parts)=>{const q=parts.join("");if(q.includes("RETURNING *"))return [{id:"job1",booking_id:bookingId,kind:"refunded",recipient:"traveler"}];if(q.includes("SELECT b.*"))return [{status:"cancelled",email:"traveler@example.invalid",operator_email:"operator@example.invalid"}];acknowledged++;return [];}}
   });
   const r=await h.GET(new Request("https://audit.invalid/api/cron/booking-mail",{headers:{authorization:"Bearer synthetic"}}));
   assert.equal(r.status,200);assert.equal(emails,0);assert.equal(acknowledged,1);
 });

 for(const terminal of ["failed","canceled"]) await check("Terminal refund "+terminal+" closes a booking after concurrent success reconciliation",async()=>{
   const rows={bookings:[{...pending(),status:"cancelled",paymentId:"pi_extra",paidAt:new Date(),cancellationRequestedAt:new Date(),cancellationRefundCents:7150,refundId:"re_extra",refundStatus:"pending"}],listings:[{id:listingId,timezone:"America/Grenada",policy:"moderate"}]};let reconciled=false;
   const db=dbFor(rows,(_table,values)=>{if(!reconciled&&values.refundStatus===terminal){reconciled=true;Object.assign(rows.bookings[0],{status:"refunded",refundStatus:"succeeded"});}});
   const result=await load("server/cancel-booking.ts",mocksFor(db,{"@/server/stripe":{retrieveBookingRefund:async()=>providerRefund({status:terminal})}})).cancelBooking(bookingId,{id:"traveler",role:"traveler"});
   assert.equal(reconciled,true);assert.equal(result.httpStatus,502);assert.equal(rows.bookings[0].status,"cancelled");assert.equal(rows.bookings[0].refundStatus,terminal);assert.equal(rows.bookings[0].paymentId,"pi_extra");assert.equal(rows.bookings[0].refundId,"re_extra");
 });
 for(const replacement of [{paymentId:"pi_replacement"},{refundId:"re_replacement"}]) await check("A stale terminal refund cannot replace a changed canonical identity: "+JSON.stringify(replacement),async()=>{
   const rows={bookings:[{...pending(),status:"cancelled",paymentId:"pi_extra",paidAt:new Date(),cancellationRequestedAt:new Date(),cancellationRefundCents:7150,refundId:"re_extra",refundStatus:"pending"}],listings:[{id:listingId,timezone:"America/Grenada",policy:"moderate"}]};let changed=false;
   const db=dbFor(rows,(_table,values)=>{if(!changed&&values.refundStatus==="failed"){changed=true;Object.assign(rows.bookings[0],replacement,{status:"refunded",refundStatus:"succeeded"});}});
   const result=await load("server/cancel-booking.ts",mocksFor(db,{"@/server/stripe":{retrieveBookingRefund:async()=>providerRefund({status:"failed"})}})).cancelBooking(bookingId,{id:"traveler",role:"traveler"});
   assert.equal(changed,true);assert.equal(result.httpStatus,502);assert.equal(rows.bookings[0].status,"refunded");assert.equal(rows.bookings[0].refundStatus,"succeeded");assert.equal(db.writes.at(-1).count,0);
   for(const [field,value] of Object.entries(replacement))assert.equal(rows.bookings[0][field],value);
 });
 async function renderBookingMail(kind,refundStatus,status="cancelled",recipient="traveler",cents=7150) {
   const sent=[];let acknowledged=0;
   const h=load("app/api/cron/booking-mail/route.ts",{
     __env:{RESEND_API_KEY:"synthetic"},
     resend:{Resend:class{emails={send:async(message,options)=>{sent.push({message,options});return {};}};}},
     "@neondatabase/serverless":{neon:()=>async(parts)=>{
       const q=parts.join("");
       if(q.includes("RETURNING *"))return [{id:"mail-state-case",booking_id:bookingId,kind,recipient}];
       if(q.includes("SELECT b.*"))return [{status,refund_status:refundStatus,cancellation_refund_cents:cents,
         email:"traveler@example.invalid",operator_email:"operator@example.invalid",name:"Audit traveler",title:"Audit tour",
         booking_number:"VG-TEST",start_date:"2099-12-05",guest_count:1,total_amount:"71.50",currency:"USD",cancellation_policy_snapshot:"moderate"}];
       acknowledged++;return [];
     }}
   });
   const r=await h.GET(new Request("https://audit.invalid/api/cron/booking-mail",{headers:{authorization:"Bearer synthetic"}}));
   assert.equal(r.status,200);assert.equal(acknowledged,1);return sent;
 }
 for(const status of ["failed","canceled"])await check("Refund status suppresses obsolete success and cancellation mail: "+status,async()=>{
   assert.equal((await renderBookingMail("refunded",status,"refunded")).length,0);
   assert.equal((await renderBookingMail("cancelled",status)).length,0);
 });
 for(const [recipient,address] of [["traveler","traveler@example.invalid"],["operator","operator@example.invalid"],["team","bookings@vakaygo.com"]])await check("Refund failure correction reaches "+recipient+" with support-review copy",async()=>{
   const sent=await renderBookingMail("refund_failed","failed","cancelled",recipient);
   assert.equal(sent.length,1);assert.equal(sent[0].message.to,address);
   assert.match(sent[0].message.subject,/Refund could not be completed/);
   assert.match(sent[0].message.text,/71\.50 USD could not be completed/);
   assert.match(sent[0].message.text,/booking remains cancelled/);
   assert.match(sent[0].message.text,/earlier refund confirmation, this update replaces it/);
   assert.match(sent[0].message.text,/bookings@vakaygo\.com for support review/);
   assert.doesNotMatch(sent[0].message.text,/being processed|Refund submitted|Refund requested/);
   assert.equal(sent[0].options.idempotencyKey,"booking-mail-mail-state-case");
 });
 await check("Partial refund failure mail reports its intended amount without a processing claim",async()=>{
   const [sent]=await renderBookingMail("refund_failed","canceled","cancelled","traveler",3575);
   assert.match(sent.message.text,/refund of 35\.75 USD could not be completed/);
   assert.doesNotMatch(sent.message.text,/being processed|Refund submitted|Refund requested/);
 });
 await check("Superseded refund failure mail is skipped after provider status changes",async()=>{
   assert.equal((await renderBookingMail("refund_failed","succeeded","refunded")).length,0);
 });
 await check("Successful partial refund cancellation mail describes a submitted refund",async()=>{
   const [sent]=await renderBookingMail("cancelled","succeeded","cancelled","traveler",3575);
   assert.match(sent.message.text,/Refund submitted: 35\.75 USD/);
   assert.doesNotMatch(sent.message.text,/being processed|Refund requested/);
 });
 await check("Pending refund cancellation mail does not claim completion",async()=>{
   const [sent]=await renderBookingMail("cancelled","pending");
   assert.match(sent.message.text,/Refund requested: 71\.50 USD/);
   assert.match(sent.message.text,/being processed and has not been confirmed as completed/);
   assert.doesNotMatch(sent.message.text,/Refund submitted/);
 });
 await require('./booking-eligibility.cjs')({load,dbFor,mocksFor,request,check,pending,complete,listing,bookingId,listingId});
 await require('./checkout-safety.cjs')({load,dbFor,mocksFor,check,pending,bookingId,listingId});
 console.log(JSON.stringify({checks:results.length,passed:results.length,results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
