// Loaded by NODE_OPTIONS only in CI. No production application imports this.
if(process.env.CI==="true" && process.env.VAKAYGO_CI_DATABASE_PROXY==="1"){
  const original=globalThis.fetch;
  globalThis.fetch=(input,init)=>{
    const headers=new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    if(headers.has("Neon-Connection-String")){
      if(headers.get("Neon-Connection-String")!==process.env.DATABASE_URL)throw Error("Unexpected database in CI");
      return original("http://127.0.0.1:4444/sql",init);
    }
    const url=String(input instanceof Request?input.url:input);
    if(/^https:\/\/api\.(stripe|resend)\.com\//.test(url))throw Error("Payments and email are disabled in CI");
    return original(input,init);
  };
}
