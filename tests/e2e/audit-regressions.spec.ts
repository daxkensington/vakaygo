import { test, expect } from "@playwright/test";
import { SignJWT } from "jose";
test("sign-in fields have labels and gift cards do not promise uncompleted purchases",async({page})=>{
  await page.goto("/auth/signin");
  await expect(page.getByLabel("Email",{exact:true})).toBeVisible();
  await expect(page.getByLabel("Password",{exact:true})).toBeVisible();
  await page.goto("/gift-cards");
  await expect(page.getByText("New gift card purchases and online redemption are currently unavailable.")).toBeVisible();
});
test("mobile navigation includes the public routes",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto("/");
  await page.getByRole("button",{name:/menu/i}).click();
  for(const name of ["Islands","Map","Services"])await expect(page.getByRole("link",{name,exact:true}).last()).toBeVisible();
});
test("booking API reserves real inventory and routes cancellation through one service",async({request})=>{
  const token=await new SignJWT({id:"10000000-0000-4000-8000-000000000002",role:"traveler"}).setProtectedHeader({alg:"HS256"}).setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  const headers={Cookie:"session="+token};
  const data={listingId:"20000000-0000-4000-8000-000000000001",startDate:"2099-12-05",guestCount:1};
  const invalid=await request.post("/api/bookings",{headers,data:{...data,guestCount:0}});
  expect(invalid.status()).toBe(400);
  const created=await request.post("/api/bookings",{headers,data});
  expect(created.status()).toBe(200);
  const booking=(await created.json()).booking;
  expect(booking.status).toBe("pending");
  const cancelled=await request.patch("/api/bookings/"+booking.id,{headers,data:{status:"cancelled"}});
  expect(cancelled.status()).toBe(200);
  expect((await cancelled.json()).booking.status).toBe("cancelled");
});
