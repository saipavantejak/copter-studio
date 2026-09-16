import {describe,it,expect} from 'vitest';
import {productionDatabase} from '../productionDatabase';

describe('Production database scope',()=>{
  it.each(['copterstudios.com','www.copterstudios.com'])('enables the public client on %s',host=>{
    expect(productionDatabase(host).url).toBe('https://othnlwcfflvtjgttotcf.supabase.co');
    expect(productionDatabase(host).key).toMatch(/^sb_publishable_/);
  });
  it.each(['localhost','preview.vercel.app','copterstudios.com.evil.example',''])('leaves %s unconfigured',host=>{
    expect(productionDatabase(host)).toEqual({});
  });
});
