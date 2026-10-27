const assert = require('node:assert/strict');

module.exports = async function checkoutSafetyRegressions({load,dbFor,mocksFor,check,pending,bookingId,listingId}) {
  function reuseSetup(options={}) {
    const row={...pending(),checkoutExpiresAt:new Date(Date.now()+3600000)};
    const eligibility={eligible:true,reason:'ready',operatorId:'operator',stripeAccountId:'acct_eligible'};
    const session={id:'cs_test',status:'open',payment_status:'unpaid',livemode:false,url:'https://checkout.stripe.com/synthetic',metadata:{bookingId},...options.session};
    const db=dbFor({bookings:[row]});
    const conditions=[];
    const select=db.select.bind(db);
    db.select=cols=>{
      const query=select(cols),where=query.where.bind(query),limit=query.limit.bind(query);
      query.where=condition=>{conditions.push(condition);return where(condition);};
      query.limit=(...args)=>{
        if(cols&&Object.keys(cols).join(',')==='id') {
          options.beforeFinalRead?.({row,eligibility,session});
          if(options.finalGuardRejects)return Promise.resolve([]);
        }
        return limit(...args);
      };
      return query;
    };
    let reads=0,expired=0,created=0,eligibilityReads=0;
    const mock=mocksFor(db,{
      '@/server/business-onboarding':{getListingBookingEligibility:async(id,opts)=>{
        assert.equal(id,listingId);assert.equal(opts.refreshProvider,true);eligibilityReads++;
        return {...eligibility};
      }},
      '@/server/stripe':{
        retrieveCheckoutSession:async id=>{assert.equal(id,'cs_test');reads++;if(reads===1)options.duringRead?.({row,eligibility,session});return {...session};},
        expireCheckoutSession:async id=>{assert.equal(id,'cs_test');expired++;if(options.failExpiry)throw Error('Synthetic provider expiry failure');session.status='expired';},
        createCheckoutSession:async()=>{created++;throw Error('Reused checkout must not create a provider session');},
      },
    });
    const route=load('app/api/payments/create-checkout/route.ts',mock);
    return {row,session,eligibility,db,conditions,counts:()=>({reads,expired,created,eligibilityReads}),run:()=>route.POST(new Request('https://audit.invalid/api/payments/create-checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({bookingId})}))};
  }
  await check('Healthy Checkout reuse returns the same provider URL without creating or expiring a session',async()=>{
    const t=reuseSetup();const response=await t.run();assert.equal(response.status,200);assert.equal((await response.json()).url,t.session.url);
    assert.deepEqual(t.counts(),{reads:1,expired:0,created:0,eligibilityReads:2});assert.equal(t.db.writes.length,0);
    const sql=[];const visit=condition=>{if(condition?.op==='sql')sql.push(condition.text);for(const child of condition?.args||[])visit(child);};visit(t.conditions.at(-1));
    assert.ok(sql.some(text=>text.includes('vakaygo_listing_bookable')));
    assert.ok(sql.some(text=>text.includes('vakaygo_booking_dates_available')));
    assert.ok(sql.some(text=>text.includes('current_listing.operator_id')&&text.includes('current_onboarding.stripe_account_id')&&text.includes('platform_account_id')));
  });
  for(const [name,mutate] of [
    ['outdated operator terms',({eligibility})=>{eligibility.eligible=false;eligibility.reason='terms_outdated';}],
    ['revoked ownership',({eligibility})=>{eligibility.operatorId='new_operator';}],
    ['a changed payment rail',({eligibility})=>{eligibility.paymentMode='platform';}],
    ['a changed provider account',({eligibility})=>{eligibility.stripeAccountId='acct_replacement';}],
    ['a blocked booking calendar',({row})=>{row.datesAvailable=false;}],
    ['a cancellation request',({row})=>{row.cancellationRequestedAt=new Date();}],
    ['a cancelled status',({row})=>{row.status='cancelled';}],
    ['an already paid booking',({row})=>{row.paidAt=new Date();row.paymentId='pi_preserved';}],
    ['a replaced persisted session',({row})=>{row.checkoutSessionId='cs_replacement';}],
    ['a changed booking owner',({row})=>{row.travelerId='other_traveler';}],
    ['a changed booking operator',({row})=>{row.operatorId='other_operator';}],
    ['a changed booking listing',({row})=>{row.listingId='other_listing';}],
    ['a changed persisted payment rail',({row})=>{row.paymentMode='platform';}],
    ['a changed persisted payment account',({row})=>{row.checkoutStripeAccountId='acct_replacement';}],
  ])await check('Reuse closes the original payment link when provider retrieval races '+name,async()=>{
    const t=reuseSetup({duringRead:mutate});const response=await t.run();assert.equal(response.status,409);assert.equal((await response.json()).url,undefined);
    assert.equal(t.counts().expired,1);assert.equal(t.counts().created,0);
    assert.ok(t.db.writes.every(write=>Object.keys(write.values).join(',')==='checkoutExpiresAt'));
    assert.equal(t.row.totalAmount,'71.50');assert.equal(t.row.currency,'USD');
    if(name==='an already paid booking'){assert.ok(t.row.paidAt);assert.equal(t.row.paymentId,'pi_preserved');assert.equal(t.db.writes[0].count,0);}
    if(name==='a cancellation request')assert.ok(t.row.cancellationRequestedAt);
    if(name==='a replaced persisted session'){assert.equal(t.row.checkoutSessionId,'cs_replacement');assert.ok(t.row.checkoutExpiresAt>Date.now());assert.equal(t.db.writes[0].count,0);}
  });
  await check('The final booking read rejects cancellation occurring after the refreshed eligibility check',async()=>{
    const t=reuseSetup({beforeFinalRead:({row})=>{row.cancellationRequestedAt=new Date();}});
    const response=await t.run();assert.equal(response.status,409);assert.equal((await response.json()).url,undefined);assert.equal(t.counts().expired,1);assert.ok(t.row.cancellationRequestedAt);
  });
  await check('A terms cutover rejected by the final SQL guard cannot release the earlier payment URL',async()=>{
    const t=reuseSetup({finalGuardRejects:true});const response=await t.run();assert.equal(response.status,409);assert.equal((await response.json()).url,undefined);
    assert.equal(t.counts().eligibilityReads,2);assert.equal(t.counts().expired,1);assert.equal(t.row.status,'pending');assert.equal(t.row.paidAt,null);
  });
  await check('Failed provider expiry truthfully reports cleanup as unconfirmed and leaves the retry marker open',async()=>{
    const t=reuseSetup({duringRead:({eligibility})=>{eligibility.eligible=false;},failExpiry:true});const original=t.row.checkoutExpiresAt;
    const response=await t.run(),body=await response.json();assert.equal(response.status,503);assert.equal(body.code,'CHECKOUT_EXPIRY_PENDING');assert.match(body.error,/could not be confirmed/);assert.equal(body.url,undefined);
    assert.equal(t.session.status,'open');assert.equal(t.row.checkoutExpiresAt,original);assert.equal(t.db.writes.length,0);assert.equal(t.counts().created,0);
  });
  for(const session of [{id:'cs_foreign'},{metadata:{bookingId:'other_booking'}}])await check('Reuse refuses a foreign provider identity without expiring another booking session: '+JSON.stringify(session),async()=>{
    const t=reuseSetup({session});const response=await t.run();assert.equal(response.status,503);assert.equal((await response.json()).url,undefined);assert.equal(t.counts().expired,0);assert.equal(t.db.writes.length,0);
  });
  for(const session of [{status:'expired',url:null},{url:null}])await check('A closed or missing provider URL is never returned as a successful reused Checkout: '+JSON.stringify(session),async()=>{
    const t=reuseSetup({session});const response=await t.run();assert.equal(response.status,409);assert.equal((await response.json()).url,undefined);assert.equal(t.counts().expired,0);assert.equal(t.db.writes.length,0);
  });
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
