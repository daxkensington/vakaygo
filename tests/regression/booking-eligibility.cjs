const assert = require('node:assert/strict');

module.exports = async function eligibilityRegressions({load,dbFor,mocksFor,request,check,pending,complete,listing,bookingId,listingId}) {
  const unavailable = reason => ({getListingBookingEligibility:async()=>({eligible:false,reason,operatorId:'operator',stripeAccountId:null})});
  for (const reason of ['launch_disabled','claim_required','onboarding_incomplete','provider_unavailable','suspended']) {
    await check('No new booking or request while '+reason, async()=>{
      const db=dbFor({listings:[listing],bookings:[]});let refreshed=false;
      const h=load('app/api/bookings/route.ts',mocksFor(db,{'@/server/business-onboarding':{
        getListingBookingEligibility:async(id,options)=>{assert.equal(id,listingId);refreshed=options.refreshProvider;return {eligible:false,reason};}
      }}));
      const r=await h.POST(request({listingId,startDate:'2099-12-01',guestCount:1}));
      assert.equal(r.status,409);assert.equal((await r.json()).code,'BOOKING_UNAVAILABLE');assert.equal(refreshed,true);assert.equal(db.writes.length,0);
    });
    await check('No operator acceptance while '+reason, async()=>{
      const db=dbFor({bookings:[{...pending(),status:'requested',checkoutSessionId:null}]});
      const h=load('app/api/bookings/[bookingId]/route.ts',mocksFor(db,{
        '@/server/business-onboarding':unavailable(reason),jose:{jwtVerify:async()=>({payload:{id:'operator',role:'operator'}})}
      }));
      const r=await h.PATCH(request({status:'confirmed'},'PATCH'),{params:Promise.resolve({bookingId})});
      assert.equal(r.status,409);assert.equal(db.writes.length,0);
    });
    await check('No new Checkout while '+reason, async()=>{
      const db=dbFor({bookings:[{...pending(),checkoutSessionId:null}]});let calls=0;
      const h=load('app/api/payments/create-checkout/route.ts',mocksFor(db,{
        '@/server/business-onboarding':unavailable(reason),'@/server/stripe':{createCheckoutSession:async()=>{calls++;}}
      }));
      const r=await h.POST(request({bookingId}));assert.equal(r.status,409);assert.equal(calls,0);assert.equal(db.writes.length,0);
    });
  }
  await check('Revocation expires an existing Checkout instead of returning its URL',async()=>{
    const db=dbFor({bookings:[pending()]});let expired=0;
    const h=load('app/api/payments/create-checkout/route.ts',mocksFor(db,{
      '@/server/business-onboarding':unavailable('revoked'),'@/server/stripe':{
        retrieveCheckoutSession:async()=>({id:'cs_test',livemode:false,status:expired?'expired':'open',metadata:{bookingId}}),
        expireCheckoutSession:async id=>{assert.equal(id,'cs_test');expired++;}
      }
    }));
    const r=await h.POST(request({bookingId}));assert.equal(r.status,409);assert.equal(expired,1);assert.equal((await r.json()).url,undefined);
  });
  for(const mutation of [{paymentMode:'platform'},{checkoutStripeAccountId:'acct_old'}])await check('Legacy or replaced recipient cannot reuse a link: '+JSON.stringify(mutation),async()=>{
    const db=dbFor({bookings:[{...pending(),...mutation}]});let expired=0;
    const h=load('app/api/payments/create-checkout/route.ts',mocksFor(db,{'@/server/stripe':{
      retrieveCheckoutSession:async()=>({id:'cs_test',livemode:false,status:expired?'expired':'open',metadata:{bookingId}}),expireCheckoutSession:async()=>{expired++;}
    }}));
    assert.equal((await h.POST(request({bookingId}))).status,409);assert.equal(expired,1);
  });
  await check('An ownership change prevents creating a booking for the old operator',async()=>{
    const db=dbFor({listings:[listing],bookings:[]});
    const h=load('app/api/bookings/route.ts',mocksFor(db,{'@/server/business-onboarding':{
      getListingBookingEligibility:async()=>({eligible:true,operatorId:'new_operator',stripeAccountId:'acct_eligible'})
    }}));
    assert.equal((await h.POST(request({listingId,startDate:'2099-12-01',guestCount:1}))).status,409);assert.equal(db.writes.length,0);
  });
  await check('A verified onboarded business can receive a price request',async()=>{
    const db=dbFor({listings:[listing],pricingRules:[{id:'rule',listingId,isActive:true}],bookings:[]});
    const h=load('app/api/bookings/route.ts',mocksFor(db));
    const r=await h.POST(request({listingId,startDate:'2099-12-01',guestCount:1}));
    assert.equal(r.status,200);const data=await r.json();assert.equal(data.mode,'request');assert.equal(data.booking.totalAmount,'0.00');
  });
  for(const mutation of [{},{paymentMode:'platform'},{checkoutStripeAccountId:'acct_old'}])await check('An ineligible late payment enters the refund ledger: '+JSON.stringify(mutation),async()=>{
    const db=dbFor({bookings:[{...pending(),...mutation}]});const refunds=[];
    const extra=Object.keys(mutation).length?{}:{'@/server/business-onboarding':unavailable('revoked')};
    const h=load('app/api/payments/webhook/route.ts',mocksFor(db,{
      ...extra,'@/server/stripe':{constructWebhookEvent:()=>complete()},
      '@/server/payment-refunds':{queueRejectedPaymentRefund:async p=>refunds.push(p)}
    }));
    assert.equal((await h.POST(request({},'POST',true))).status,200);assert.equal(db.writes.length,0);assert.equal(refunds.length,1);assert.equal(refunds[0].paymentId,'pi_test');
  });
  await check('Revocation racing payment confirmation is refunded without reopening inventory',async()=>{
    const db=dbFor({bookings:[pending()]},(_table,values)=>{if(values.paidAt)throw Error('VG_BOOKING:Business revoked');});let refunded=0;
    const h=load('app/api/payments/webhook/route.ts',mocksFor(db,{
      '@/server/stripe':{constructWebhookEvent:()=>complete()},'@/server/payment-refunds':{queueRejectedPaymentRefund:async()=>{refunded++;}}
    }));
    assert.equal((await h.POST(request({},'POST',true))).status,200);assert.equal(refunded,1);assert.equal(db.writes.length,0);
  });
  await check('Provider lookup failure cannot confirm a paid booking and requests webhook retry',async()=>{
    const db=dbFor({bookings:[pending()]});
    const h=load('app/api/payments/webhook/route.ts',mocksFor(db,{
      '@/server/stripe':{constructWebhookEvent:()=>complete()},'@/server/business-onboarding':{getListingBookingEligibility:async()=>{throw Error('Provider unavailable');}}
    }));
    assert.equal((await h.POST(request({},'POST',true))).status,500);assert.equal(db.writes.length,0);
  });
  await check('Provider account updates invalidate old evidence before refreshing',async()=>{
    const calls=[];const db=dbFor({});
    const h=load('app/api/payments/webhook/route.ts',mocksFor(db,{
      '@/server/stripe':{constructWebhookEvent:()=>({type:'account.updated',data:{object:{id:'acct_eligible'}}})},
      '@/server/business-onboarding':{
        invalidateStripeAccountReadiness:async id=>calls.push('invalidate:'+id),refreshStripeAccountReadiness:async id=>calls.push('refresh:'+id)
      }
    }));
    assert.equal((await h.POST(request({},'POST',true))).status,200);assert.deepEqual(calls,['invalidate:acct_eligible','refresh:acct_eligible']);
  });
  await check('Deauthorization durably revokes its connected account',async()=>{
    const calls=[];const h=load('app/api/payments/webhook/route.ts',mocksFor(dbFor({}),{
      '@/server/stripe':{constructWebhookEvent:()=>({type:'account.application.deauthorized',account:'acct_eligible',data:{object:{id:'ca_application'}}})},
      '@/server/business-onboarding':{revokeStripeAccountReadiness:async id=>calls.push(id)}
    }));
    assert.equal((await h.POST(request({},'POST',true))).status,200);assert.deepEqual(calls,['acct_eligible']);
  });
  await check('Availability does not advertise dates before onboarding',async()=>{
    const db=dbFor({});const h=load('app/api/availability/route.ts',mocksFor(db,{
      '@/server/business-onboarding':unavailable('onboarding_incomplete'),'@/server/admin-auth':{}
    }));
    const r=await h.GET(new Request('https://audit.invalid/api/availability?listingId='+listingId+'&month=2099-12'));
    assert.equal(r.status,409);assert.equal((await r.json()).bookingEligible,false);assert.equal(db.selects.length,0);
  });
  await check('Abandoned bookings cannot send payment reminders for unavailable businesses',async()=>{
    const db=dbFor({bookings:[{...pending(),paymentMethod:'card',createdAt:new Date(Date.now()-3*3600000)}]});let emails=0;
    const h=load('app/api/cron/abandoned-bookings/route.ts',mocksFor(db,{
      '@/server/business-onboarding':unavailable('revoked'),'@/lib/abandoned-bookings':load('lib/abandoned-bookings.ts'),
      '@/server/email':{sendAbandonedBookingRecovery:async()=>{emails++;}}
    }));
    const r=await h.GET(new Request('https://audit.invalid/api/cron/abandoned-bookings',{headers:{authorization:'Bearer synthetic'}}));
    assert.equal(r.status,200);assert.equal(emails,0);assert.equal(db.writes.length,0);assert.equal((await r.json()).ignored,1);
  });
  await check('Session expiry refuses unrelated provider metadata',async()=>{
    let expired=0;const service=load('server/booking-checkout-safety.ts',mocksFor(dbFor({}),{'@/server/stripe':{
      retrieveCheckoutSession:async()=>({status:'open',metadata:{bookingId:'other'}}),expireCheckoutSession:async()=>{expired++;}
    }}));
    await assert.rejects(service.expireBookingCheckout(bookingId,'cs_unrelated'),/identity mismatch/);assert.equal(expired,0);
  });
  await check('Unpublished booking dates cannot create a payment link',async()=>{
    const db=dbFor({bookings:[{...pending(),checkoutSessionId:null,datesAvailable:false}]});let created=0;
    const h=load('app/api/payments/create-checkout/route.ts',mocksFor(db,{'@/server/stripe':{createCheckoutSession:async()=>{created++;}}}));
    assert.equal((await h.POST(request({bookingId}))).status,409);assert.equal(created,0);assert.equal(db.writes.length,0);
  });
  await check('A payment for newly blocked dates is refunded without confirmation',async()=>{
    const db=dbFor({bookings:[{...pending(),datesAvailable:false}]});let refunded=0;
    const h=load('app/api/payments/webhook/route.ts',mocksFor(db,{
      '@/server/stripe':{constructWebhookEvent:()=>complete()},'@/server/payment-refunds':{queueRejectedPaymentRefund:async()=>{refunded++;}}
    }));
    assert.equal((await h.POST(request({},'POST',true))).status,200);assert.equal(refunded,1);assert.equal(db.writes.length,0);
  });
  for (const spots of [null,0,-1,1.5]) await check('Unspecified or invalid capacity cannot publish a date: '+spots,async()=>{
    const db=dbFor({});const h=load('app/api/availability/route.ts',mocksFor(db,{'@/server/admin-auth':{requireOperator:async()=>({ok:true,userId:'operator',role:'operator'})}}));
    const r=await h.POST(request({listingId,dates:[{date:'2099-12-01',spots,isBlocked:false}]}));
    assert.equal(r.status,400);assert.equal(db.writes.length,0);
  });
  await check('Calendar manage mode still requires operator authentication',async()=>{
    const db=dbFor({});const h=load('app/api/availability/route.ts',mocksFor(db,{'@/server/admin-auth':{requireOperator:async()=>({ok:false,error:new Response(null,{status:401})})}}));
    assert.equal((await h.GET(new Request('https://audit.invalid/api/availability?listingId='+listingId+'&month=2099-12&mode=manage'))).status,401);assert.equal(db.selects.length,0);
  });
  await check('Calendar manage mode rejects a different business owner',async()=>{
    const db=dbFor({});const h=load('app/api/availability/route.ts',mocksFor(db,{'@/server/admin-auth':{
      requireOperator:async()=>({ok:true,userId:'other',role:'operator'}),assertListingOwnership:async()=>({ok:false,error:new Response(null,{status:403})})
    }}));
    assert.equal((await h.GET(new Request('https://audit.invalid/api/availability?listingId='+listingId+'&month=2099-12&mode=manage'))).status,403);assert.equal(db.selects.length,0);
  });
  await check('A closed idempotent provider creation replay cannot return a payable link',async()=>{
    const db=dbFor({bookings:[{...pending(),checkoutSessionId:null,subtotal:'65.00',serviceFee:'6.50'}],listings:[listing],users:[]});
    const h=load('app/api/payments/create-checkout/route.ts',mocksFor(db,{'@/server/stripe':{
      createCheckoutSession:async()=>({id:'cs_previously_expired',status:'expired',url:null,expires_at:Math.floor(Date.now()/1000)+3600})
    }}));
    const response=await h.POST(request({bookingId}));assert.equal(response.status,409);assert.equal((await response.json()).url,undefined);assert.equal(db.writes.length,0);
  });
};
