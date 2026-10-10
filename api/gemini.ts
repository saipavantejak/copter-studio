/** Same bounded server-only gateway for Vercel, Vite and the Gym bridge. */
export {sanitizePayload} from '../server/geminiGateway';
export {handleGemini as default} from '../server/geminiGateway';
export const config={maxDuration:40};
