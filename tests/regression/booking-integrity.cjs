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
  const module={exports:{}};
  const base={
    'next/server':{NextResponse:{json:(body,opts={})=>new Response(JSON.stringify(body),{status:opts.status||200,headers:{'content-type':'application/json'}})}},
    '@/lib/logger':{logger:noops}, '@/drizzle/schema':schema,
    '@/server/stripe':{},
    '@/server/email':noops, '@/server/email-requests':noops,
    '@/server/notifications':{createNotification:async()=>{}},
    '@/server/loyalty':{awardBookingPoints:async()=>{}},
    '@/lib/abandoned-bookings':{EXPIRE_AFTER_HOURS:48},
    '@neondatabase/serverless':{neon:()=>({})},
    'drizzle-orm':{eq:(a,b)=>({op:'eq',a,b}),ne:(a,b)=>({op:'ne',a,b}),isNull:a=>({op:'null',a}),and:(...args)=>({op:'and',args}),sql:()=>({op:'sql'})},
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
    {Request,Response,Headers,URL,URLSearchParams,TextEncoder,Date,console,fetch:mocks.__fetch,process:{env:{GOOGLE_CLIENT_ID:'synthetic',GOOGLE_CLIENT_SECRET:'synthetic',CRON_SECRET:'synthetic',STRIPE_WEBHOOK_SECRET:'synthetic',AUTH_SECRET:'synthetic',DATABASE_URL:'synthetic'}}},
    {filename:rel})(requireMock,module,module.exports);
  return module.exports;
}
function matches(cond,row){
  if(!cond)return true;
  if(cond.op==='and')return cond.args.every(c=>matches(c,row));
  if(cond.op==='eq')return row[cond.a.key]===cond.b;
  if(cond.op==='null')return row[cond.a.key]==null;
  if(cond.op==='ne')return row[cond.a.key]!==cond.b;
  return true;
}
function dbFor(rows){
  const writes=[];
  const selects=[];
  function project(row,cols){if(!cols)return {...row};return Object.fromEntries(Object.entries(cols).map(([key,col])=>[key,row[col.key]??row[key]]));}
  return {writes,selects,
    select(cols){let table,cond;const q={from(t){table=t.__table;selects.push(table);return q;},innerJoin(){return q;},where(c){cond=c;return q;},limit(){return Promise.resolve((rows[table]||[]).filter(r=>matches(cond,r)).map(r=>project(r,cols)));},then(resolve,reject){return q.limit().then(resolve,reject);}};return q;},
    update(t){let values;const q={set(v){values=v;return q;},where(cond){const changed=(rows[t.__table]||[]).filter(r=>matches(cond,r));changed.forEach(r=>Object.assign(r,values));writes.push({table:t.__table,values,cond,count:changed.length});return Object.assign(Promise.resolve(),{returning:async(cols)=>changed.map(r=>project(r,cols))});}};return q;},
    insert(t){return {values(values){const record={id:'booking-new',...values};(rows[t.__table]??=[]).push(record);writes.push({table:t.__table,values});return {returning:async(cols)=>[project(record,cols)]};}}},
  };
}
function mocksFor(db,extra={}){return {'drizzle-orm/neon-http':{drizzle:()=>db},...extra};}
function request(body,method='POST',sig=false){return new Request('https://audit.invalid/endpoint',{method,headers:{'content-type':'application/json',...(sig?{'stripe-signature':'synthetic'}:{})},body:JSON.stringify(body)});}
async function check(name,fn){const details=await fn();results.push({name,passed:true,...details});}

const bookingId="11111111-1111-4111-8111-111111111111",listingId="22222222-2222-4222-8222-222222222222";
const pending=()=>({id:bookingId,status:"pending",bookingNumber:"VG-TEST",travelerId:"traveler",operatorId:"operator",listingId,startDate:new Date("2099-12-01"),guestCount:1,totalAmount:"71.50",currency:"USD",checkoutSessionId:"cs_test",paidAt:null,paymentId:null,cancellationRequestedAt:null,createdAt:new Date()});
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
   const db=dbFor({users:[{id:"u2",email:"totp@example.invalid",role:"traveler",totpEnabled:profile.totpEnabled}],accounts:[]});let sessions=0;
   const h=load("app/api/auth/google/callback/route.ts",mocksFor(db,{
     "@/server/admin-auth":{setSessionCookie:async()=>{sessions++;}},
     "next/server":{NextResponse:{redirect:url=>new Response(null,{status:302,headers:{location:String(url)}})}},
     __fetch:async url=>new Response(JSON.stringify(String(url).includes("/token")?{access_token:"synthetic"}:{email:"totp@example.invalid",id:"g2",verified_email:profile.verified_email})),
   }));
   const r=await h.GET(new Request("https://audit.invalid/api/auth/google/callback?code=synthetic&state=synthetic-session"));assert.equal(r.status,302);assert.equal(sessions,0);assert.equal(db.writes.length,0);
 });

 await check("Request creation records no charge for a priced unclaimed listing",async()=>{
   const rows={listings:[{...listing,typeData:{unclaimed:true}}],bookings:[],users:[]};const db=dbFor(rows);
   const h=load("app/api/bookings/route.ts",mocksFor(db));const r=await h.POST(request({listingId,startDate:"2099-12-01",guestCount:1}));
   assert.equal(r.status,200);const data=await r.json();assert.equal(data.mode,"request");assert.equal(data.booking.totalAmount,"0.00");
 });
 await check("Repeated checkout calls reuse the saved Stripe session",async()=>{
   const db=dbFor({bookings:[pending()]});let created=0;
   const h=load("app/api/payments/create-checkout/route.ts",mocksFor(db,{"@/server/stripe":{retrieveCheckoutSession:async()=>({status:"open",url:"https://checkout.stripe.com/test"}),createCheckoutSession:async()=>{created++;}}}));
   for(let i=0;i<2;i++)assert.equal((await h.POST(request({bookingId}))).status,200);
   assert.equal(created,0);
 });
 console.log(JSON.stringify({checks:results.length,passed:results.length,results},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
