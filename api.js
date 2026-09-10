window.LSKERP = (() => {
  const token = () => sessionStorage.getItem('lsk_access_token');
  const user = () => { try { return JSON.parse(sessionStorage.getItem('lsk_user') || '{}'); } catch (_) { return {}; } };

  async function setBranch(branchId) {
    const normalized = branchId || null;
    const result = await request('/api/auth/switch-branch', {
      method: 'POST',
      body: JSON.stringify({ branchId: normalized })
    });
    if (!result.accessToken) throw new Error('Branch switch failed');
    sessionStorage.setItem('lsk_access_token', result.accessToken);
    const u=user(); u.branchId=result.branchId ?? normalized; sessionStorage.setItem('lsk_user',JSON.stringify(u));
    window.dispatchEvent(new CustomEvent('lsk:branch-change',{detail:{branchId:u.branchId}}));
    return u;
  }

  async function request(path, options = {}) {
    const headers=new Headers(options.headers || {}); headers.set('Accept','application/json');
    if(options.body && !headers.has('Content-Type')) headers.set('Content-Type','application/json');
    const t=token(); if(t) headers.set('Authorization',`Bearer ${t}`);
    const response=await fetch(path,{...options,headers});
    if(response.status===401){sessionStorage.clear();location.replace('/erp/web/login.html');throw new Error('Session expired');}
    const data=await response.json().catch(()=>({})); if(!response.ok) throw new Error(data.error||`Request failed (${response.status})`); return data;
  }
  return {token,user,setBranch,request};
})();
