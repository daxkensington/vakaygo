-- Synthetic browser-test accounts/listing only. No provider or email operations.
INSERT INTO users(id,email,role,email_verified)
VALUES('10000000-0000-4000-8000-000000000009','audit-admin@example.invalid','admin',true);
INSERT INTO listings(id,operator_id,island_id,type,title,slug,status,address,type_data)
VALUES('20000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000003',900001,
 'dining','Audit directory cafe','audit-directory-cafe','active','12 Synthetic Street',
 '{"unclaimed":true,"website":"https://business.example.invalid"}');
