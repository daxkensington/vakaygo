const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const source = ts.transpileModule(fs.readFileSync(path.join(__dirname,"../../server/business-onboarding.ts"),"utf8"),{
  compilerOptions:{ module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true },
}).outputText;
const id = "11111111-1111-4111-8111-111111111111";
const operator = "22222222-2222-4222-8222-222222222222";
const baseEnv = { DATABASE_URL:"postgresql://synthetic.invalid/test",BOOKINGS_ENABLED:"true",STRIPE_SECRET_KEY:"sk_test_synthetic",
  STRIPE_PLATFORM_ACCOUNT_ID:"acct_platform",STRIPE_CONNECT_COUNTRIES:"CA",TWILIO_ACCOUNT_SID:"AC"+"0".repeat(32),
  TWILIO_AUTH_TOKEN:"synthetic",TWILIO_VERIFY_SERVICE_SID:"VA"+"1".repeat(32) };
function readyContext() {
  return { listing_id:id,operator_id:operator,title:"Synthetic business",slug:"synthetic",island_slug:"synthetic",
    listing_status:"active",claim_valid:true,listing_valid:true,db_bookable:true,launch_enabled:true,
    config_environment:"test",config_platform:"acct_platform",config_countries:["CA"],
    onboarding:{ listing_id:id,operator_id:operator,verified_claim_id:"verified",business_legal_name:"Synthetic Ltd",
      business_country:"CA",business_address:"123 Synthetic Road",representative_name:"Synthetic Operator",
      authority_accepted_at:new Date().toISOString(),terms_version:"2026-09-06",terms_accepted_at:new Date().toISOString(),
      stripe_account_id:"acct_connected",provider_environment:"test",platform_account_id:"acct_platform",provider_country:"CA",
      charges_enabled:true,payouts_enabled:true,details_submitted:true,card_payments_active:true,transfers_active:true,
      provider_checked_at:new Date().toISOString(),provider_version:1,provider_revoked_at:null,connect_attempt_id:"attempt",
      activated_at:new Date().toISOString(),suspended_at:null } };
}
function load(options={}) {
  const calls=[],expired=[],invalidated=[];
  const query=async(text,params)=>{calls.push({text,params});return options.query?options.query(text,params):[options.context||readyContext()];};
  const stripe={ getAccountStatus:async()=>({
    accountId:"acct_connected",platformAccountId:"acct_platform",operatorId:operator,listingId:id,country:"CA",
    chargesEnabled:true,payoutsEnabled:true,detailsSubmitted:true,cardPaymentsActive:true,transfersActive:true,disabledReason:null,
  }),...options.stripe };
  const imports={
    "@neondatabase/serverless":{neon:()=>({query})},
    "twilio":options.twilio||(()=>{throw Error("Unexpected provider write");}),
    "next/server":{NextResponse:{json:(body,init)=>({body,...init})}},
    "@/server/admin-auth":{requireUser:async()=>({ok:true,userId:operator,role:"operator"})},
    "@/server/stripe":stripe,
    "@/server/booking-checkout-safety":{expireListingPendingCheckouts:async value=>expired.push(value)},
    "@/lib/revalidate-listing":{revalidateListing:async value=>invalidated.push(value)},
  };
  const testModule={exports:{}};
  const context={module:testModule,exports:testModule.exports,require:name=>name==="node:crypto"?require(name):imports[name],
    process:{env:{...baseEnv,...options.env}},console,URL,Date,setTimeout,clearTimeout};
  vm.runInNewContext(source,context,{filename:"business-onboarding.ts"});
  return {api:testModule.exports,calls,expired,invalidated};
}
test("fully verified and activated business is eligible only with both launch gates",async()=>{
  const {api}=load();
  const result=await api.getListingBookingEligibility(id);
  assert.equal(result.eligible,true);assert.equal(result.stripeAccountId,"acct_connected");
  for(const env of [{BOOKINGS_ENABLED:"false"},{BOOKINGS_ENABLED:""},{STRIPE_PLATFORM_ACCOUNT_ID:""},{STRIPE_SECRET_KEY:"sk_live_synthetic"},{STRIPE_CONNECT_COUNTRIES:""}]) {
    assert.equal((await load({env}).api.getListingBookingEligibility(id)).eligible,false);
  }
});
test("legacy ownership and editable JSON cannot establish a verified claim",async()=>{
  const ctx=readyContext();ctx.onboarding=null;ctx.claim_valid=false;ctx.type_data={unclaimed:false,claimedAt:new Date().toISOString(),claimId:"forged"};
  const result=await load({context:ctx}).api.getListingBookingEligibility(id);
  assert.equal(result.eligible,false);assert.equal(result.reason,"unclaimed");
});
for(const [name,change] of [
 ["database launch disabled",ctx=>ctx.launch_enabled=false],
 ["database predicate denies",ctx=>ctx.db_bookable=false],
 ["owner/proof mismatch",ctx=>ctx.claim_valid=false],
 ["unpublished listing",ctx=>ctx.listing_status="paused"],
 ["invalid current availability",ctx=>ctx.listing_valid=false],
 ["different configured platform",ctx=>ctx.config_platform="acct_other"],
 ["unsupported DB country",ctx=>ctx.config_countries=[]],
 ["DB country superset mismatch",ctx=>ctx.config_countries=["CA","US"]],
 ["malformed DB country set",ctx=>ctx.config_countries=["CA","invalid"]],
 ["provider country mismatch",ctx=>ctx.onboarding.provider_country="US"],
 ["stale provider result",ctx=>ctx.onboarding.provider_checked_at=new Date(Date.now()-16*60*1000).toISOString()],
 ["future provider timestamp",ctx=>ctx.onboarding.provider_checked_at=new Date(Date.now()+100000).toISOString()],
 ["charges disabled",ctx=>ctx.onboarding.charges_enabled=false],
 ["payouts disabled",ctx=>ctx.onboarding.payouts_enabled=false],
 ["card capability disabled",ctx=>ctx.onboarding.card_payments_active=false],
 ["transfer capability disabled",ctx=>ctx.onboarding.transfers_active=false],
 ["revoked account",ctx=>ctx.onboarding.provider_revoked_at=new Date().toISOString()],
 ["business suspended",ctx=>ctx.onboarding.suspended_at=new Date().toISOString()],
 ["no explicit activation",ctx=>ctx.onboarding.activated_at=null],
 ["obsolete terms",ctx=>ctx.onboarding.terms_version="old"],
 ["missing authority attestation",ctx=>ctx.onboarding.authority_accepted_at=null],
]) test(name+" fails closed",async()=>{
  const ctx=readyContext();change(ctx);
  assert.equal((await load({context:ctx}).api.getListingBookingEligibility(id)).eligible,false);
});
test("global stop avoids provider access even when booking requests a refresh",async()=>{
  let read=false;
  const {api}=load({env:{BOOKINGS_ENABLED:"false"},stripe:{getAccountStatus:async()=>{read=true;throw Error("Unexpected");}}});
  assert.equal((await api.getListingBookingEligibility(id,{refreshProvider:true})).eligible,false);assert.equal(read,false);
});
test("provider failures clear positive readiness and expire pending payment links",async()=>{
  const ctx=readyContext();
  const h=load({query:async sql=>sql.includes("SELECT l.id")?[ctx]:[{listing_id:id}],stripe:{getAccountStatus:async()=>{throw Error("Unavailable");}}});
  await h.api.refreshListingPaymentReadiness(id);
  const update=h.calls.find(c=>c.text.includes("UPDATE listing_onboarding"));
  assert.equal(update.params[9],false);
  assert.match(update.text,/provider_version=\$3/);
  assert.deepEqual(h.expired,[id]);
});
test("provider identity mismatch cannot enable another operator's listing",async()=>{
  const ctx=readyContext();
  const h=load({query:async sql=>sql.includes("SELECT l.id")?[ctx]:[{listing_id:id}],stripe:{getAccountStatus:async()=>({
    accountId:"acct_connected",platformAccountId:"acct_platform",operatorId:"different",listingId:id,country:"CA",
    chargesEnabled:true,payoutsEnabled:true,detailsSubmitted:true,cardPaymentsActive:true,transfersActive:true,
  })}});
  await h.api.refreshListingPaymentReadiness(id);
  assert.equal(h.calls.find(c=>c.text.includes("UPDATE listing_onboarding")).params[9],false);
});
test("a concurrent invalidation defeats an older successful refresh",async()=>{
  const ctx=readyContext();let version=1,resolveRead,ready=false;
  const wait=new Promise(resolve=>resolveRead=resolve);
  const h=load({query:async(sql,params)=>{
    if(sql.includes("SELECT l.id"))return [ctx];
    if(sql.includes("WHERE stripe_account_id=$1")){version++;ready=false;return [];}
    if(sql.includes("provider_version=$3")){if(params[2]!==version)return [];ready=params[9];version++;return [{listing_id:id}];}
    throw Error("Unexpected query");
  },stripe:{getAccountStatus:async()=>{await wait;return {
    accountId:"acct_connected",platformAccountId:"acct_platform",operatorId:operator,listingId:id,country:"CA",
    chargesEnabled:true,payoutsEnabled:true,detailsSubmitted:true,cardPaymentsActive:true,transfersActive:true,
  };}}});
  const refresh=h.api.refreshListingPaymentReadiness(id);
  await new Promise(resolve=>setImmediate(resolve));
  await h.api.invalidateStripeAccountReadiness("acct_connected");
  resolveRead();await refresh;
  assert.equal(ready,false);assert.equal(version,2);
});
test("durably revoked account never contacts provider or clears revocation",async()=>{
  const ctx=readyContext();ctx.onboarding.provider_revoked_at=new Date().toISOString();let reads=0;
  const h=load({context:ctx,stripe:{getAccountStatus:async()=>{reads++;}}});
  await h.api.refreshListingPaymentReadiness(id);assert.equal(reads,0);assert.equal(h.calls.length,1);
});
test("claim start sends only the trusted stored phone, including voice option",async()=>{
  let sent;
  const v={id,claim_id:"claim",target_phone:"+14735550123"};
  const h=load({query:async(sql)=>sql.includes("vakaygo_begin_claim")?[{id}]:sql.includes("SELECT * FROM listing_claim_verifications")?[v]:[{id}],
    twilio:()=>({verify:{v2:{services:()=>({verifications:{create:async input=>{sent=input;return {
      sid:"VE"+"2".repeat(32),accountSid:baseEnv.TWILIO_ACCOUNT_SID,serviceSid:baseEnv.TWILIO_VERIFY_SERVICE_SID,
      to:v.target_phone,status:"pending",
    };}}})}}})});
  await h.api.startClaimVerification(id,operator,"call");
  assert.equal(sent.to,v.target_phone);assert.equal(sent.channel,"call");
});
test("unconfigured verification fails before any database/provider side effects",async()=>{
  const h=load({env:{TWILIO_VERIFY_SERVICE_SID:""}});
  await assert.rejects(h.api.startClaimVerification(id,operator),/unavailable/);
  assert.equal(h.calls.length,0);
});
test("wrong provider verification binding never transfers ownership",async()=>{
  const v={id,listing_id:id,operator_id:operator,claim_id:"claim",status:"pending",target_phone:"+14735550123",
    service_sid:baseEnv.TWILIO_VERIFY_SERVICE_SID,provider_account_id:baseEnv.TWILIO_ACCOUNT_SID,
    provider_verification_id:"VE"+"2".repeat(32),provider_approved_at:null};
  const h=load({query:async()=>[v],twilio:()=>({verify:{v2:{services:()=>({verificationChecks:{create:async()=>({
    sid:v.provider_verification_id,status:"approved",to:"+14735550999",serviceSid:v.service_sid,accountSid:v.provider_account_id,
  })}})}}})});
  await assert.rejects(h.api.completeClaimVerification(id,operator,"123456"),/incorrect/);
  assert.equal(h.calls.some(c=>c.text.includes("vakaygo_complete_claim")),false);
});
test("onboarding management requires current owner even for an admin-role session",async()=>{
  const h=load();
  await assert.rejects(h.api.getOnboardingStatus(id,"33333333-3333-4333-8333-333333333333"),/do not own/);
});

test("discovery launch gate requires deployment and database provider configuration to agree",async()=>{
  const config={enabled:true,environment:"test",platform_account_id:"acct_platform",allowed_countries:["CA"]};
  const fixture=(row=config,env={})=>load({env,query:async()=>[row]}).api.bookingLaunchEnabled();
  assert.equal(await fixture(),true);
  for(const row of [
    {...config,enabled:false},
    {...config,environment:"live"},
    {...config,platform_account_id:"acct_other"},
    {...config,allowed_countries:[]},
    {...config,allowed_countries:["CA","US"]},
    {...config,allowed_countries:["US"]},
    {...config,allowed_countries:["ca"]},
    {...config,allowed_countries:[123]},
    {...config,allowed_countries:null},
  ]) assert.equal(await fixture(row),false);
  for(const env of [
    {BOOKINGS_ENABLED:"false"},{STRIPE_SECRET_KEY:"sk_live_synthetic"},{STRIPE_SECRET_KEY:""},
    {STRIPE_PLATFORM_ACCOUNT_ID:"acct_other"},{STRIPE_PLATFORM_ACCOUNT_ID:""},
    {STRIPE_CONNECT_COUNTRIES:""},{STRIPE_CONNECT_COUNTRIES:"CA,US"},{STRIPE_CONNECT_COUNTRIES:"CA,invalid"},
  ]) assert.equal(await fixture(config,env),false);
  assert.equal(await fixture({...config,allowed_countries:["US","CA","CA"]},{STRIPE_CONNECT_COUNTRIES:" ca, US,ca "}),true);
});
test("discovery launch gate fails closed on missing or unavailable database configuration",async()=>{
  assert.equal(await load({query:async()=>[]}).api.bookingLaunchEnabled(),false);
  assert.equal(await load({query:async()=>{throw Error("Database unavailable");}}).api.bookingLaunchEnabled(),false);
});
