\set ON_ERROR_STOP on
INSERT INTO islands(id,slug,name,country,timezone,is_active) VALUES(900001,'audit-island','Audit island','Grenada','America/Grenada',true);
INSERT INTO users(id,email,role) VALUES('10000000-0000-4000-8000-000000000001','audit-operator@example.invalid','operator');
INSERT INTO listings(id,operator_id,island_id,type,title,slug,status,price_amount,price_currency,price_unit,max_guests,cancellation_policy,type_data)
 VALUES('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',900001,'tour','Audit tour','audit-tour','active',65,'USD','person',2,'moderate','{"unclaimed":true}');
INSERT INTO media(listing_id,url,alt,sort_order,is_primary) VALUES
 ('20000000-0000-4000-8000-000000000001','/images/sections/value-local.jpg','Audit photo one',0,true),
 ('20000000-0000-4000-8000-000000000001','/images/sections/value-travel.jpg','Audit photo two',1,false),
 ('20000000-0000-4000-8000-000000000001','/images/sections/value-explore.jpg','Audit photo three',2,false);
