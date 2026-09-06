const assert = require('node:assert/strict');

module.exports = async function checkoutSafetyRegressions({load,dbFor,mocksFor,check,pending,bookingId,listingId}) {
  function setup(options={}) {
    const row={...pending(),checkoutExpiresAt:new Date(Date.now()+3600000),...options.booking};
    const db=dbFor({bookings:[row]},options.beforeUpdate?(_table,values)=>options.beforeUpdate(row,values):undefined);
    const current={id:'cs_test',status:'open',payment_status:'unpaid',livemode:false,metadata:{bookingId},...options.session};
    let attempts=0,reads=0,identities=0;
    const sql=[];
    const mock=mocksFor(db,{
      __env:{BOOKINGS_ENABLED:options.globalEnabled?'true':'false'},
      '@neondatabase/serverless':{neon:()=>async(parts)=>{
        const text=parts.join('');sql.push(text);
        assert.match(text,/paid_at IS NULL/);assert.match(text,/LIMIT 50/);assert.match(text,/vakaygo_booking_dates_available/);assert.match(text,/checkout_stripe_account_id IS DISTINCT/);assert.doesNotMatch(text,/activated_at|provider_revoked_at/);
        return !row.paidAt&&(!row.checkoutExpiresAt||row.checkoutExpiresAt>Date.now())?[{
          id:row.id,listing_id:listingId,operator_id:row.operatorId,status:row.status,checkout_session_id:row.checkoutSessionId,
          checkout_stripe_account_id:row.checkoutStripeAccountId,payment_mode:row.paymentMode,cancellation_requested_at:row.cancellationRequestedAt,
        }]:[];
      }},
      '@/server/business-onboarding':{getListingBookingEligibility:async()=>({eligible:!!options.eligible,operatorId:'operator',stripeAccountId:'acct_eligible'})},
      '@/server/stripe':{
        verifyStripePlatformIdentity:async()=>{identities++;if(options.identityFails)throw Error('Wrong provider account');return {accountId:'acct_platform',environment:'test'};},
        retrieveCheckoutSession:async()=>{reads++;return {...current};},
        expireCheckoutSession:async()=>{attempts++;if(options.failFirst&&attempts===1)throw Error('Provider transient');if(!options.staysOpen)current.status='expired';},
      },
    });
    const route=load('app/api/cron/checkout-safety/route.ts',mock);
    const run=()=>route.GET(new Request('https://audit.invalid/api/cron/checkout-safety',{headers:{authorization:'Bearer synthetic'}}));
    return {row,db,current,sql,run,route,counts:()=>({attempts,reads,identities}),mock};
  }
  await check('Checkout safety cron requires its secret before provider or database access',async()=>{
    const t=setup();assert.equal((await t.route.GET(new Request('https://audit.invalid/api/cron/checkout-safety'))).status,401);
    assert.deepEqual(t.counts(),{attempts:0,reads:0,identities:0});assert.equal(t.sql.length,0);
  });
  await check('Checkout expiry verifies the actual platform before selecting sessions',async()=>{
    const t=setup({identityFails:true});assert.equal((await t.run()).status,503);assert.equal(t.sql.length,0);assert.equal(t.counts().attempts,0);assert.equal(t.counts().reads,0);
  });
  await check('A globally disabled next cycle retries failed expiry after revocation',async()=>{
    const t=setup({failFirst:true});const original=t.row.checkoutExpiresAt;
    let response=await t.run();assert.equal(response.status,200);assert.equal((await response.json()).failed,1);assert.equal(t.row.checkoutExpiresAt,original);
    response=await t.run();assert.equal((await response.json()).closed,1);assert.equal(t.counts().attempts,2);assert.ok(t.row.checkoutExpiresAt<=Date.now());assert.equal(t.row.status,'pending');
    response=await t.run();assert.equal((await response.json()).checked,0);assert.equal(t.counts().attempts,2);
  });
  await check('Cancelled unpaid links also remain in the independent expiry queue',async()=>{
    const t=setup({booking:{status:'cancelled',cancellationRequestedAt:new Date()},eligible:true});
    assert.equal((await (await t.run()).json()).closed,1);assert.equal(t.row.status,'cancelled');assert.equal(t.row.paidAt,null);
  });
  await check('A replacement session is not overwritten by an old expiry response',async()=>{
    const original=new Date(Date.now()+3600000);const t=setup({booking:{checkoutExpiresAt:original},beforeUpdate:(row,values)=>{if(values.checkoutExpiresAt)row.checkoutSessionId='cs_replacement';}});
    assert.equal((await (await t.run()).json()).closed,1);assert.equal(t.row.checkoutSessionId,'cs_replacement');assert.equal(t.row.checkoutExpiresAt,original);assert.equal(t.db.writes.at(-1).count,0);
  });
  await check('Paid database history is never sent to provider expiry',async()=>{
    const t=setup({booking:{paidAt:new Date(),status:'confirmed'}});assert.equal((await (await t.run()).json()).checked,0);assert.equal(t.counts().reads,0);assert.equal(t.counts().attempts,0);assert.equal(t.db.writes.length,0);
  });
  await check('Provider-paid closed sessions leave the retry queue without rewriting financial history',async()=>{
    const t=setup({session:{status:'complete',payment_status:'paid'}});assert.equal((await (await t.run()).json()).paid,1);assert.equal(t.counts().attempts,0);
    assert.ok(t.row.checkoutExpiresAt<=Date.now());assert.equal(t.row.status,'pending');assert.equal(t.row.paidAt,null);assert.equal(t.row.paymentId,null);
    assert.deepEqual(Object.keys(t.db.writes[0].values),['checkoutExpiresAt']);assert.equal((await (await t.run()).json()).checked,0);
  });
  await check('A healthy current recipient and available dates preserve an open Checkout',async()=>{
    const t=setup({globalEnabled:true,eligible:true});assert.equal((await (await t.run()).json()).eligible,1);assert.equal(t.counts().attempts,0);assert.equal(t.db.writes.length,0);
  });
  await check('Blocked calendar dates close a link even if business onboarding is healthy',async()=>{
    const t=setup({globalEnabled:true,eligible:true,booking:{datesAvailable:false}});assert.equal((await (await t.run()).json()).closed,1);assert.equal(t.counts().attempts,1);
  });
  await check('A changed payment recipient closes an old link',async()=>{
    const t=setup({globalEnabled:true,eligible:true,booking:{checkoutStripeAccountId:'acct_old'}});assert.equal((await (await t.run()).json()).closed,1);assert.equal(t.counts().attempts,1);
  });
  for(const session of [{metadata:{bookingId:'other'}},{livemode:true},{id:'cs_other'}])await check('Expiry rejects mismatched session identity: '+JSON.stringify(session),async()=>{
    const t=setup({session});assert.equal((await (await t.run()).json()).failed,1);assert.equal(t.counts().attempts,0);assert.equal(t.db.writes.length,0);
  });
  await check('A provider session that remains open is not removed from the retry queue',async()=>{
    const t=setup({staysOpen:true});const original=t.row.checkoutExpiresAt;assert.equal((await (await t.run()).json()).failed,1);assert.equal(t.row.checkoutExpiresAt,original);assert.equal(t.db.writes.length,0);
  });
  await check('Already-closed provider sessions are acknowledged without expiring twice',async()=>{
    const t=setup({session:{status:'expired'}});assert.equal((await (await t.run()).json()).closed,1);assert.equal(t.counts().attempts,0);assert.ok(t.row.checkoutExpiresAt<=Date.now());
  });
  await check('Cancellation stays recorded when guarded provider expiry must retry',async()=>{
    const t=setup({identityFails:true});t.row.paymentMethod='card';
    const result=await load('server/cancel-booking.ts',t.mock).cancelBooking(bookingId,{id:'traveler',role:'traveler'});
    assert.equal(result.success,true);assert.equal(t.row.status,'cancelled');assert.equal(t.row.checkoutSessionId,'cs_test');assert.ok(t.row.checkoutExpiresAt>Date.now());assert.equal(t.counts().attempts,0);
  });
};
