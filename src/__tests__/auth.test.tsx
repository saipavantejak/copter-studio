import {describe,it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import type {SupabaseClient} from '@supabase/supabase-js';
import {AuthForm} from '../AuthForm';
import {isAuthReturn,cleanAuthUrl,finishAuthReturn,authErrorMessage} from '../authFlow';

afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function client() {
  const auth = {
    initialize:vi.fn().mockResolvedValue({error:null}),
    getSession:vi.fn().mockResolvedValue({data:{session:{user:{id:'test'}}},error:null}),
    verifyOtp:vi.fn().mockResolvedValue({error:null}),
    setSession:vi.fn().mockResolvedValue({error:null}),
    signInWithPassword:vi.fn().mockResolvedValue({error:null}),
    signUp:vi.fn().mockResolvedValue({data:{session:null},error:null}),
    signInWithOtp:vi.fn().mockResolvedValue({error:null}),
    signInWithOAuth:vi.fn().mockResolvedValue({error:null}),
    resend:vi.fn().mockResolvedValue({error:null}),
  };
  const functions={invoke:vi.fn().mockResolvedValue({data:{access_token:'access',refresh_token:'refresh'},error:null})};
  return {auth,functions,instance:{auth,functions} as unknown as SupabaseClient};
}
describe('authentication callbacks',()=>{
  it('recognizes callbacks without mistaking shared configurations for sign-in',()=>{
    expect(isAuthReturn('https://app.test/#cfg=abc')).toBe(false);
    expect(isAuthReturn('https://app.test/?code=test')).toBe(true);
    expect(isAuthReturn('https://app.test/#error_code=otp_expired')).toBe(true);
    expect(isAuthReturn('https://app.test/?token_hash=test&type=email')).toBe(true);
  });
  it('removes auth secrets while preserving configuration and unrelated query parameters',()=>{
    expect(cleanAuthUrl('https://app.test/?code=test&view=account#access_token=test&refresh_token=test&cfg=abc')).toBe('/?view=account#cfg=abc');
  });
  it('waits for initialization before reading a session',async()=>{
    const c=client();let resolve!: (value:unknown)=>void;
    c.auth.initialize.mockReturnValue(new Promise(r=>{resolve=r;}));
    const result=finishAuthReturn(c.instance,'https://app.test/?code=test');
    expect(c.auth.getSession).not.toHaveBeenCalled();
    resolve({error:null});expect(await result).toBe('Signed in successfully.');
  });
  it('surfaces expired-link errors and refuses a missing verifier/session',async()=>{
    const c=client();c.auth.initialize.mockResolvedValue({error:{code:'otp_expired'}});
    await expect(finishAuthReturn(c.instance,'https://app.test/?code=test')).rejects.toMatchObject({code:'otp_expired'});
    c.auth.initialize.mockResolvedValue({error:null});c.auth.getSession.mockResolvedValue({data:{session:null},error:null});
    await expect(finishAuthReturn(c.instance,'https://app.test/?code=test')).rejects.toThrow('this browser');
  });
  it('verifies supported token-hash callbacks and rejects unsupported types',async()=>{
    const c=client();await finishAuthReturn(c.instance,'https://app.test/?token_hash=test&type=email');
    expect(c.auth.verifyOtp).toHaveBeenCalledWith({token_hash:'test',type:'email'});
    await expect(finishAuthReturn(c.instance,'https://app.test/?token_hash=test&type=unknown')).rejects.toThrow('Unsupported');
  });
});
describe('account interface',()=>{
  function fill() {
    fireEvent.change(screen.getByLabelText(/^Email/),{target:{value:'test@example.com'}});
    fireEvent.change(screen.getByLabelText('Password'),{target:{value:'test-only-password'}});
  }
  it('logs in with a password, never implicitly creates a user, and clears the password',async()=>{
    const c=client();render(<AuthForm client={c.instance} connection={{url:"https://example.supabase.co",key:"test-public"}}/>);fill();
    fireEvent.click(screen.getByRole('button',{name:'Log in to your account'}));
    await screen.findByText('Signed in successfully.');
    expect(c.auth.signInWithPassword).toHaveBeenCalledWith({email:'test@example.com',password:'test-only-password'});
    expect(c.auth.signUp).not.toHaveBeenCalled();expect(screen.getByLabelText('Password')).toHaveValue('');
  });
  it('requires confirmation when signup returns no session',async()=>{
    const c=client();render(<AuthForm client={c.instance} connection={{url:"https://example.supabase.co",key:"test-public"}}/>);
    fireEvent.click(screen.getByRole('button',{name:'Sign up'}));fill();
    fireEvent.click(screen.getByRole('button',{name:'Create account'}));
    await screen.findByText(/Check your email to confirm/);
    expect(c.auth.signUp).toHaveBeenCalled();expect(screen.queryByText('Account created and signed in.')).toBeNull();
  });
  it('displays server errors rather than claiming email was sent',async()=>{
    const c=client();c.auth.signInWithOtp.mockResolvedValue({error:{code:'email_address_not_authorized'}});
    render(<AuthForm client={c.instance} connection={{url:"https://example.supabase.co",key:"test-public"}}/>);
    fireEvent.click(screen.getByRole('button',{name:'Email sign-in link'}));
    fireEvent.change(screen.getByLabelText(/^Email/),{target:{value:'test@example.com'}});
    fireEvent.click(screen.getByRole('button',{name:'Send sign-in link'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('production email provider');
    expect(c.auth.signInWithOtp.mock.calls[0][0].options.shouldCreateUser).toBe(false);
  });
  it('prevents repeated successful email sends inside the cooldown',async()=>{
    const c=client();render(<AuthForm client={c.instance} connection={{url:"https://example.supabase.co",key:"test-public"}}/>);
    fireEvent.click(screen.getByRole('button',{name:'Email sign-in link'}));
    fireEvent.change(screen.getByLabelText(/^Email/),{target:{value:'test@example.com'}});
    fireEvent.click(screen.getByRole('button',{name:'Send sign-in link'}));
    await screen.findByText(/If an account exists/);
    fireEvent.click(screen.getByRole('button',{name:'Send sign-in link'}));
    await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('60 seconds'));
    expect(c.auth.signInWithOtp).toHaveBeenCalledTimes(1);
  });
  it('explains email confirmation and rate limits',()=>{
    expect(authErrorMessage({code:'email_not_confirmed'})).toContain('Confirm your email');
    expect(authErrorMessage({code:'over_email_send_rate_limit'})).toContain('wait');
  });
});

describe('social sign-in',()=>{
  it.each([['Google','google'],['GitHub','github'],['LinkedIn','linkedin_oidc']])('starts %s with the correct provider and same-origin return URL',async(label,provider)=>{
    const c=client();
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({external:{[provider]:true}})}));
    render(<AuthForm client={c.instance} connection={{url:"https://example.supabase.co",key:"test-public"}}/>);
    fireEvent.click(screen.getByRole('button',{name:`Continue with ${label}`}));
    await waitFor(()=>expect(c.auth.signInWithOAuth).toHaveBeenCalledWith({provider,options:{redirectTo:window.location.origin+window.location.pathname}}));
    expect(c.auth.signInWithPassword).not.toHaveBeenCalled();
  });
  it('keeps users on the form when a provider is not configured',async()=>{
    const c=client();
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({external:{google:false}})}));
    render(<AuthForm client={c.instance} connection={{url:"https://example.supabase.co",key:"test-public"}}/>);
    fireEvent.click(screen.getByRole('button',{name:'Continue with Google'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('not configured');
    expect(c.auth.signInWithOAuth).not.toHaveBeenCalled();
  });
  it('handles network failures and enables retry',async()=>{
    const c=client();vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('Network unavailable')));
    render(<AuthForm client={c.instance} connection={{url:"https://example.supabase.co",key:"test-public"}}/>);
    fireEvent.click(screen.getByRole('button',{name:'Continue with GitHub'}));
    expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable');
    expect(screen.getByRole('button',{name:'Continue with GitHub'})).not.toBeDisabled();
  });
});

it('signs in with a normalized username and establishes the returned session',async()=>{
 const c=client();render(<AuthForm client={c.instance}/>);
 fireEvent.change(screen.getByLabelText('Email or username'),{target:{value:'Pilot_1'}});
 fireEvent.change(screen.getByLabelText('Password'),{target:{value:'password'}});
 fireEvent.click(screen.getByRole('button',{name:'Log in to your account'}));
 await screen.findByText('Signed in successfully.');
 expect(c.functions.invoke).toHaveBeenCalledWith('username-login',{body:{username:'pilot_1',password:'password'}});
 expect(c.auth.setSession).toHaveBeenCalledWith({access_token:'access',refresh_token:'refresh'});
 expect(c.auth.signInWithPassword).not.toHaveBeenCalled();
});
it('never establishes a session when username login fails',async()=>{
 const c=client();c.functions.invoke.mockResolvedValue({data:null,error:{message:'denied'}});
 render(<AuthForm client={c.instance}/>);
 fireEvent.change(screen.getByLabelText('Email or username'),{target:{value:'pilot'}});
 fireEvent.change(screen.getByLabelText('Password'),{target:{value:'wrong'}});
 fireEvent.click(screen.getByRole('button',{name:'Log in to your account'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('Username or password');
 expect(c.auth.setSession).not.toHaveBeenCalled();
});
